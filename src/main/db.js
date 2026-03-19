import { ipcMain } from 'electron'
import vm from 'vm'
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb'
import { executeMongoshQuery } from './queryRunner'
import { EJSON } from 'bson'
import { initStorageHandlers, getConnectionById } from './storage'
import { createSSHTunnel } from './ssh'
import fs from 'fs'
import readline from 'readline'
import csvParser from 'csv-parser'
import streamJson from 'stream-json'
import StreamArray from 'stream-json/streamers/StreamArray.js'
import path from 'path'
import { Transform, Readable } from 'stream'
import { checkBsonTools, downloadBsonTools } from './bsonTools'
import { spawn } from 'child_process'

// Store active connection instances (Mapping ConnectionId -> { client, tunnel })
const activeClients = {}

async function buildMongoUri(connConfig) {
  let uri = connConfig.connectionString || ''
  let host = 'localhost'
  let port = 27017

  if (uri) {
    // 1. Connection string provided
    try {
      const match = uri.match(/\/\/([^/?]+)/)
      if (match) {
        let hostsPart = match[1]
        if (hostsPart.includes('@')) hostsPart = hostsPart.split('@')[1]
        const firstPair = hostsPart.split(',')[0]
        const hParts = firstPair.split(':')
        host = hParts[0]
        port = parseInt(hParts[1]) || 27017
      }
    } catch (e) {
      console.warn('[MongoClient] URI parsing warning:', e.message)
    }
  } else {
    // 2. Building from discrete fields
    let rawHost = connConfig.host || 'localhost'
    const isSrv = !!connConfig.useSrv

    // SELF-HEALING: Fixed double-port corruption if present in config
    if (rawHost.includes(':')) {
       rawHost = rawHost.split(',').map(h => {
          const parts = h.split(':')
          if (isSrv) return parts[0] // SRV MUST NOT have ports
          return parts.length > 2 ? `${parts[0]}:${parts[1]}` : h
       }).join(',')
    }
    
    const isMultiHost = rawHost.includes(',') || rawHost.includes(':')
    
    // Auth part
    let auth = ''
    if (connConfig.hasAuth && connConfig.authUser) {
      auth = `${encodeURIComponent(connConfig.authUser)}:${encodeURIComponent(connConfig.authPass)}@`
    }

    uri = `${isSrv ? 'mongodb+srv' : 'mongodb'}://${auth}${rawHost}`
    
    // Add default port ONLY for simple single host WITHOUT any port and NOT SRV
    if (!isSrv && !isMultiHost) {
      uri += `:${connConfig.port || 27017}`
    }
    
    uri += '/'
    if (connConfig.authDb) uri += connConfig.authDb
    else if (connConfig.defaultDb) uri += connConfig.defaultDb

    const params = []
    if (connConfig.hasAuth && connConfig.authDb) params.push(`authSource=${connConfig.authDb}`)
    if (connConfig.replicaSet) params.push(`replicaSet=${connConfig.replicaSet}`)
    if (connConfig.hasTls || rawHost.includes('.mongodb.net')) params.push('ssl=true')
    if (connConfig.appName) params.push(`appName=${connConfig.appName}`)
    
    if (params.length > 0) uri += '?' + params.join('&')

    // Detect first host for SSH
    const firstPair = rawHost.split(',')[0]
    const hp = firstPair.split(':')
    host = hp[0]
    port = parseInt(hp[1]) || (connConfig.port || 27017)
  }

  let tunnel = null
  if (connConfig.hasSsh) {
    console.log(`[SSH] Starting tunnel to ${host}:${port}`)
    tunnel = await createSSHTunnel(connConfig, host, port)
    const localHost = '127.0.0.1'
    const localPort = tunnel.localPort
    
    // REPLACE HOST IN URI WITH TUNNEL LOCAL
    // Be careful with mongodb+srv which doesn't support direct IP
    if (uri.startsWith('mongodb+srv')) {
       uri = uri.replace('mongodb+srv', 'mongodb')
    }
    
    // Surgical replacement of host and port
    uri = uri.replace(host, localHost)
    if (uri.includes(`:${port}`)) {
       uri = uri.replace(`:${port}`, `:${localPort}`)
    } else if (!uri.includes(`:${localPort}`)) {
       // If port wasn't in URI, find the end of host and insert it
       uri = uri.replace(`${localHost}/`, `${localHost}:${localPort}/`)
    }
  }

  return { uri, tunnel, host, port }
}

async function buildMongoClient(connConfig) {
  const { uri, tunnel, host, port } = await buildMongoUri(connConfig)
  
  const mongoOptions = { serverSelectionTimeoutMS: 5000 }
  const isAtlas = uri.includes('mongodb.net') || uri.includes('mongodb+srv')

  if (connConfig.hasTls || uri.includes('ssl=true') || uri.includes('tls=true') || isAtlas) {
    mongoOptions.tls = true
    if (connConfig.tlsAuthMethod === 'CA Certificate' && connConfig.tlsCaPath) {
      mongoOptions.tlsCAFile = connConfig.tlsCaPath
    } else if (connConfig.tlsAuthMethod === 'Self-signed Certificate') {
      if (!isAtlas) mongoOptions.tlsAllowInvalidCertificates = true
    }

    if (connConfig.tlsClientCertPath) {
      mongoOptions.tlsCertificateKeyFile = connConfig.tlsClientCertPath
      if (connConfig.tlsClientKeyPassphrase) {
        mongoOptions.tlsCertificateKeyFilePassword = connConfig.tlsClientKeyPassphrase
      }
    }
  }

  if (connConfig.hasAuth && connConfig.authMech && connConfig.authMech !== 'DEFAULT') {
    const validMechs = ['SCRAM-SHA-1', 'SCRAM-SHA-256', 'MONGODB-X509', 'MONGODB-AWS', 'GSSAPI', 'PLAIN']
    if (validMechs.includes(connConfig.authMech)) {
       mongoOptions.authMechanism = connConfig.authMech
    }
  }

  const isReplicaSet = connConfig.type === 'Replica Set' || (connConfig.replicaSet && connConfig.replicaSet.length > 0) || uri.includes('replicaSet=')

  if (isReplicaSet || isAtlas) {
    if (connConfig.replicaSet) mongoOptions.replicaSet = connConfig.replicaSet
    mongoOptions.directConnection = false
  } else {
    mongoOptions.directConnection = true
  }

  mongoOptions.monitorCommands = true

  if (connConfig.useStableApi || isAtlas) {
    mongoOptions.serverApi = {
      version: ServerApiVersion.v1,
      strict: false,
      deprecationErrors: true
    }
  }

  console.log(`[MongoClient] Connecting to: ${uri.replace(/:([^:@]+)@/, ':****@')}`)
  console.log(`[MongoClient] Options:`, JSON.stringify(mongoOptions))

  const client = new MongoClient(uri, mongoOptions)
  await client.connect()
  return { client, tunnel }
}

/**
 * Attaches APM listeners to a MongoClient to broadcast slow queries to the frontend.
 */
function attachAPMListeners(client, connId) {
  const isInternalCommand = (cmd) => ['hello', 'isMaster', 'buildInfo', 'ping', 'saslStart', 'saslContinue', 'getLog'].includes(cmd)
  
  // Store recent commands to match success/fail back to the original request payload
  const commandCache = new Map()

  client.on('commandStarted', (event) => {
    if (isInternalCommand(event.commandName)) return
    
    commandCache.set(event.requestId, JSON.stringify(event.command))
    
    // You could optionally send start events if you want a real-time "executing..." view,
    setTimeout(() => {
      const { BrowserWindow } = require('electron')
      const w = BrowserWindow.getAllWindows()[0]
      if (w) {
        w.webContents.send('db:profiler', {
          type: 'start',
          connectionId: connId,
          requestId: event.requestId,
          commandName: event.commandName,
          command: commandCache.get(event.requestId),
          time: new Date().toISOString()
        })
      }
    }, 0)
  })

  client.on('commandSucceeded', (event) => {
    if (isInternalCommand(event.commandName)) return
    
    const cmdPayload = commandCache.get(event.requestId)
    commandCache.delete(event.requestId)
    
    setTimeout(() => {
      const { BrowserWindow } = require('electron')
      const w = BrowserWindow.getAllWindows()[0]
      if (w) {
        w.webContents.send('db:profiler', {
          type: 'success',
          connectionId: connId,
          requestId: event.requestId,
          commandName: event.commandName,
          command: cmdPayload,
          duration: event.duration, // in ms
          time: new Date().toISOString()
        })
      }
    }, 0)
  })

  client.on('commandFailed', (event) => {
    if (isInternalCommand(event.commandName)) return
    
    const cmdPayload = commandCache.get(event.requestId)
    commandCache.delete(event.requestId)
    
    setTimeout(() => {
      const { BrowserWindow } = require('electron')
      const w = BrowserWindow.getAllWindows()[0]
      if (w) {
        w.webContents.send('db:profiler', {
          type: 'error',
          connectionId: connId,
          requestId: event.requestId,
          commandName: event.commandName,
          command: cmdPayload,
          duration: event.duration, // in ms
          failure: event.failure?.message || 'Unknown Error',
          time: new Date().toISOString()
        })
      }
    }, 0)
  })
}

/**
 * Initializes Inter-Process Communication (IPC) events related to the database
 */
export function initDbHandlers() {
  const handle = (channel, listener) => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, listener)
  }

  // 1. Handles the "Test Connection" button on the Setup Form
  handle('db:testConnection', async (_, connConfig) => {
    let client = null
    let tunnel = null
    try {
      const built = await buildMongoClient(connConfig)
      client = built.client
      tunnel = built.tunnel

      await client.connect()

      const adminDb = client.db('admin')
      const buildInfo = await adminDb.command({ buildinfo: 1 })

      return { ok: true, version: buildInfo.version }
    } catch (err) {
      console.error('Test Connection Error:', err)
      return { ok: false, error: err.message }
    } finally {
      if (client) await client.close()
      if (tunnel) tunnel.close()
    }
  })

  // 2. Performs the actual connection when the user double-clicks or clicks Connect from the list
  handle('db:connect', async (_, connConfig) => {
    try {
      const built = await buildMongoClient(connConfig)
      const { client, tunnel } = built
      await client.connect()
      
      // Attach performance monitor
      attachAPMListeners(client, connConfig.id)
      // Store the connection config alongside the client instances for Auto-Reconnect
      activeClients[connConfig.id] = { client, tunnel, config: connConfig }

      // Retrieve the default list of databases immediately after connection
      let dbs = []
      const adminDb = client.db('admin')
      try {
        const result = await adminDb.admin().listDatabases()
        dbs = result.databases.map((d) => d.name)
      } catch (err) {
        console.warn('Could not list databases (likely permission error):', err.message)
        // Fallback: If global list is denied, show the databases specified in the config
        const fallbackDbs = new Set()
        if (connConfig.authDb) fallbackDbs.add(connConfig.authDb)
        if (connConfig.defaultDb) fallbackDbs.add(connConfig.defaultDb)
        dbs = Array.from(fallbackDbs)
      }

      // Get the database version to support version-aware queries
      let version = 'unknown'
      try {
        const buildInfo = await adminDb.command({ buildinfo: 1 })
        version = buildInfo.version
      } catch (err) {
        console.warn('Could not fetch MongoDB version:', err.message)
      }

      return { ok: true, databases: dbs, version }
    } catch (err) {
      console.error('Connect Error:', err)
      return { ok: false, error: err.message }
    }
  })

  const getSession = (connId) => {
    const session = activeClients[connId]
    if (!session || !session.client) throw new Error('Not connected')
    return session
  }

  /**
   * Helper to wrap DB operations with automatic retry/reconnect logic.
   * If an operation fails due to network/tunnel issues, it attempts to
   * rebuild the whole stack (SSH + Mongo) and retry once.
   */
  const withRetry = async (connId, action) => {
    const session = getSession(connId)
    try {
      return await action(session.client)
    } catch (err) {
      const isConnectionError =
        err.name === 'MongoNetworkError' ||
        err.name === 'MongoServerSelectionError' ||
        err.message.includes('not connected') ||
        err.message.includes('Topology is closed') ||
        err.message.includes('broken pipe') ||
        err.message.includes('connection closed')

      if (isConnectionError) {
        // IMPORTANT: If the user manually disconnected, the connId will be missing from activeClients.
        // In that case, we MUST NOT attempt to reconnect.
        if (!activeClients[connId]) {
          throw err
        }

        console.warn(`[Auto-Reconnect] Connection lost for ${connId}. Attempting to restore...`)
        try {
          // 1. Tear down dead instances
          if (session.client) await session.client.close(true).catch(() => {})
          if (session.tunnel) session.tunnel.close()

          // 2. Re-build connection using the cached config
          const rebuilt = await buildMongoClient(session.config)
          await rebuilt.client.connect()
          attachAPMListeners(rebuilt.client, connId)

          // 3. Update the global cache
          activeClients[connId] = {
            ...session,
            client: rebuilt.client,
            tunnel: rebuilt.tunnel
          }

          console.log(`[Auto-Reconnect] Successfully restored connection for ${connId}. Retrying...`)

          // 4. Retry the original action with the NEW client
          return await action(rebuilt.client)
        } catch (reconnectErr) {
          console.error('[Auto-Reconnect] Failed to restore connection:', reconnectErr)
          throw new Error(`Connection lost and auto-reconnect failed: ${reconnectErr.message}`)
        }
      }
      throw err
    }
  }

  // 3. Retrieves the list of collections in a database
  handle('db:listCollections', async (_, { connId, dbName }) => {
    try {
      return await withRetry(connId, async (client) => {
        const db = client.db(dbName)
        const collections = await db.listCollections().toArray()
        return { ok: true, collections: collections.map((c) => c.name).sort() }
      })
    } catch (err) {
      console.error('List Collections Error:', err)
      return { ok: false, error: err.message }
    }
  })

  // 4. Disconnects from the server
  handle('db:disconnect', async (_, connId) => {
    const session = activeClients[connId]
    if (session) {
      if (session.client) await session.client.close()
      if (session.tunnel) session.tunnel.close()
      delete activeClients[connId]
    }
    return { ok: true }
  })

  // 5. Executes a query from the Monaco Editor, with Auto-Reconnect support
  handle('db:runQuery', async (_, { connId, dbName, query, options }) => {
    try {
      return await withRetry(connId, (client) => {
        return executeMongoshQuery(client, dbName, query, options)
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  // ==========================================
  // Context Menu Actions (DB & Collection)
  // ==========================================

  handle('db:dropDatabase', async (_, { connId, dbName }) => {
    try {
      return await withRetry(connId, async (client) => {
        await client.db(dbName).dropDatabase()
        return { ok: true }
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  handle('db:createCollection', async (_, { connId, dbName, collectionName }) => {
    try {
      return await withRetry(connId, async (client) => {
        await client.db(dbName).createCollection(collectionName)
        return { ok: true }
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  handle('db:dropCollection', async (_, { connId, dbName, collectionName }) => {
    try {
      return await withRetry(connId, async (client) => {
        await client.db(dbName).collection(collectionName).drop()
        return { ok: true }
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  handle('db:renameCollection', async (_, { connId, dbName, oldName, newName }) => {
    try {
      return await withRetry(connId, async (client) => {
        await client.db(dbName).collection(oldName).rename(newName)
        return { ok: true }
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  handle(
    'db:duplicateCollection',
    async (_, { connId, dbName, sourceName, targetName }) => {
      try {
        return await withRetry(connId, async (client) => {
          await client.db(dbName).command({
            aggregate: sourceName,
            pipeline: [{ $out: targetName }],
            cursor: {}
          })
          return { ok: true }
        })
      } catch (err) {
        return { ok: false, error: err.message }
      }
    }
  )

  handle('db:dbStats', async (_, { connId, dbName }) => {
    try {
      return await withRetry(connId, async (client) => {
        const stats = await client.db(dbName).command({ dbStats: 1 })
        return { ok: true, stats }
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  handle('db:createDatabase', async (_, { connId, dbName, collectionName }) => {
    try {
      return await withRetry(connId, async (client) => {
        // MongoDB doesn't "create" a DB until a collection exists
        await client.db(dbName).createCollection(collectionName || 'temp')
        return { ok: true }
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  handle('db:repairDatabase', async (_, { connId, dbName }) => {
    try {
      return await withRetry(connId, async (client) => {
        const result = await client.db(dbName).command({ repairDatabase: 1 })
        return { ok: true, result }
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  handle('db:serverStatus', async (_, { connId }) => {
    try {
      return await withRetry(connId, async (client) => {
        const status = await client.db('admin').command({ serverStatus: 1 })
        return { ok: true, status }
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  handle('db:hostInfo', async (_, { connId }) => {
    try {
      return await withRetry(connId, async (client) => {
        const info = await client.db('admin').command({ hostInfo: 1 })
        return { ok: true, info }
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  handle('db:currentOp', async (_, { connId }) => {
    try {
      return await withRetry(connId, async (client) => {
        const ops = await client.db('admin').command({ currentOp: 1 })
        return { ok: true, ops: ops.inprog || [] }
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  handle('db:killOp', async (_, { connId, opId }) => {
    try {
      return await withRetry(connId, async (client) => {
        const result = await client.db('admin').command({ killOp: 1, op: opId })
        return { ok: true, result }
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  // ==========================================
  // Document Operations (Insert / Update / Delete)
  // ==========================================

  handle('db:insertDocument', async (_, { connId, dbName, collectionName, document }) => {
    try {
      return await withRetry(connId, async (client) => {
        const doc = EJSON.deserialize(document)
        await client.db(dbName).collection(collectionName).insertOne(doc)
        return { ok: true }
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  handle('db:updateDocument', async (_, { connId, dbName, collectionName, document }) => {
    try {
      return await withRetry(connId, async (client) => {
        const doc = EJSON.deserialize(document)
        const id = doc._id
        if (!id) throw new Error('Document must have an _id to be updated')

        const updateDoc = { ...doc }
        delete updateDoc._id // Remove _id from replacement payload so MongoDB doesn't complain

        await client.db(dbName).collection(collectionName).replaceOne({ _id: id }, updateDoc)
        return { ok: true }
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  handle('db:deleteDocument', async (_, { connId, dbName, collectionName, documentId }) => {
    try {
      return await withRetry(connId, async (client) => {
        const idObj = EJSON.deserialize({ _id: documentId })._id
        await client.db(dbName).collection(collectionName).deleteOne({ _id: idObj })
        return { ok: true }
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  // ==========================================
  // Index Operations
  // ==========================================

  handle('db:listIndexes', async (_, { connId, dbName, collectionName }) => {
    try {
      return await withRetry(connId, async (client) => {
        const indexes = await client.db(dbName).collection(collectionName).listIndexes().toArray()
        return { ok: true, indexes }
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  handle('db:createIndex', async (_, { connId, dbName, collectionName, keys, options }) => {
    try {
      return await withRetry(connId, async (client) => {
        // keys look like { email: 1 }
        await client.db(dbName).collection(collectionName).createIndex(keys, options)
        return { ok: true }
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  handle('db:dropIndex', async (_, { connId, dbName, collectionName, indexName }) => {
    try {
      return await withRetry(connId, async (client) => {
        await client.db(dbName).collection(collectionName).dropIndex(indexName)
        return { ok: true }
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  handle('db:indexStats', async (_, { connId, dbName, collectionName }) => {
    try {
      return await withRetry(connId, async (client) => {
        const stats = await client
          .db(dbName)
          .collection(collectionName)
          .aggregate([{ $indexStats: {} }])
          .toArray()
        return { ok: true, stats }
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  handle('db:collStats', async (_, { connId, dbName, collectionName }) => {
    try {
      return await withRetry(connId, async (client) => {
        const stats = await client.db(dbName).command({ collStats: collectionName })
        return { ok: true, stats }
      })
    } catch (err) {
      // collStats may fail on empty collections, return empty gracefully
      return { ok: false, error: err.message, stats: { indexSizes: {} } }
    }
  })

  // ==========================================
  // Export / Import (Stream Engine)
  // ==========================================

  handle('db:exportCollection', async (event, { connId, dbName, collectionName, filePath, format, csvOptions = null, transformCode = null, query = {}, queryString = null, projection = {}, options = {} }) => {
    const { BrowserWindow } = require('electron')
    const win = BrowserWindow.fromWebContents(event.sender)
    
    const getDelimiter = (del) => {
      if (del === 'semicolon') return ';'
      if (del === 'tab') return '\t'
      if (del === 'pipe') return '|'
      return ','
    }
    const delimiter = getDelimiter(csvOptions?.delimiter)
    
    let transformScript = null
    try {
      if (transformCode) {
        transformScript = new vm.Script(`(${transformCode})(doc)`)
      }
    } catch (e) {
      console.error('[Export] ETL Compilation Error:', e)
      return { ok: false, error: `ETL Syntax Error: ${e.message}` }
    }

    let exportClient = null
    let exportTunnel = null
    
    try {
      const session = activeClients[connId]
      if (!session) throw new Error('Not connected')

      console.log(`[Export] Starting export for ${dbName}.${collectionName} to ${filePath} (${format})`)

      // 1. Setup a separate client for the export
      const exportConfig = { 
        ...session.config,
        socketTimeoutMS: 0,
        connectTimeoutMS: 30000
      }
      
      const built = await buildMongoClient(exportConfig)
      exportClient = built.client
      exportTunnel = built.tunnel
      
      await exportClient.connect()
      const db = exportClient.db(dbName)
      
      let cursor
      if (queryString) {
        console.log(`[Export] Executing raw query string for export...`)
        // Simple sandbox for extracting cursor
        const sandbox = {
          db: {
            getCollection: (name) => db.collection(name),
            collection: (name) => db.collection(name)
          }
        }
        vm.createContext(sandbox)
        const script = new vm.Script(queryString)
        const result = script.runInContext(sandbox)
        
        // result should be what .find() or .aggregate() returns? 
        // In our queryRunner, .find() returns a FindCursorBuilder. 
        // But here we are using the raw mongodb driver objects in the sandbox.
        // So .find() returns a real Cursor.
        cursor = result
      } else {
        cursor = db.collection(collectionName).find(query, { projection })
      }

      if (!cursor || typeof cursor.toArray !== 'function') {
        throw new Error('Query did not return a valid cursor. Make sure to use .find() or .aggregate()')
      }

      // 2. Prepare the stream
      // countDocuments might not work on all results (like aggregation), 
      // but for simple finds it's fine. 
      let totalDocs = 0
      try {
        if (queryString) {
            // Hard to get total for arbitrary string without executing, 
            // but we can try a simple count if it's a cursor
            totalDocs = await cursor.clone().count()
        } else {
            totalDocs = await db.collection(collectionName).countDocuments(query)
        }
      } catch (e) {
        console.warn('[Export] Could not get total count accurately:', e.message)
      }

      console.log(`[Export] Total documents to export (estimed): ${totalDocs}`)

      if (options.sort) cursor.sort(options.sort)
      if (options.skip) cursor.skip(options.skip)
      if (options.limit) cursor.limit(options.limit)

      const writeStream = fs.createWriteStream(filePath)
      let processedCount = 0
      let lastReportedTime = Date.now()

      const transformStream = new Transform({
        writableObjectMode: true,
        transform(doc, encoding, callback) {
          // Apply ETL if present
          let currentDoc = doc
          if (transformScript) {
            try {
              const sandbox = { doc }
              vm.createContext(sandbox)
              const result = transformScript.runInContext(sandbox)
              if (result === null || result === undefined) {
                return callback() // Skip this document
              }
              currentDoc = result
            } catch (e) {
              console.error('[Export] ETL Execution Error:', e)
              return callback(e)
            }
          }

          processedCount++
          
          let chunk = ''
          try {
            const serialized = EJSON.serialize(currentDoc)
            if (format === 'json') {
              chunk = (processedCount === 1 ? '[\n  ' : ',\n  ') + JSON.stringify(serialized)
            } else if (format === 'csv') {
              const keys = Object.keys(doc)
              const values = keys.map(k => {
                const v = doc[k]
                if (v === null || v === undefined) return '""'
                const str = typeof v === 'object' ? JSON.stringify(v) : String(v)
                return `"${str.replace(/"/g, '""')}"`
              })
              const row = values.join(delimiter) + '\n'
              
              if (processedCount === 1) {
                const headers = keys.map(k => `"${String(k).replace(/"/g, '""')}"`)
                chunk = headers.join(delimiter) + '\n' + row
              } else {
                chunk = row
              }
            } else {
              // jsonl
              chunk = JSON.stringify(serialized) + '\n'
            }
          } catch (e) {
            console.error('[Export] Transform error for document:', e)
            return callback(e)
          }

          if (Date.now() - lastReportedTime > 200) {
            win.webContents.send('db:exportProgress', {
              processed: processedCount,
              total: totalDocs,
              percentage: totalDocs > 0 ? Math.round((processedCount / totalDocs) * 100) : 0
            })
            lastReportedTime = Date.now()
          }

          callback(null, chunk)
        },
        flush(callback) {
          if (format === 'json') {
            if (processedCount === 0) {
              this.push('[]')
            } else {
              this.push('\n]')
            }
          }
          callback()
        }
      })

      // Handle stream events by awaiting the promise
      return await new Promise((resolve, reject) => {
        writeStream.on('finish', () => {
          console.log(`[Export] Successfully exported ${processedCount} documents.`)
          win.webContents.send('db:exportProgress', { processed: processedCount, total: totalDocs, percentage: 100 })
          resolve({ ok: true, count: processedCount })
        })
        
        writeStream.on('error', (err) => {
          console.error('[Export] Write Stream Error:', err)
          reject(err)
        })

        transformStream.on('error', (err) => {
          console.error('[Export] Transform Stream Error:', err)
          reject(err)
        })

        // In mongodb 7.x, the cursor is an AsyncIterable.
        // We use Readable.from() to convert it into a standard Node.js Readable stream.
        const mongoStream = Readable.from(cursor)
        
        mongoStream.on('error', (err) => {
          console.error('[Export] MongoDB Cursor Error (Readable.from):', err)
          reject(err)
        })

        mongoStream.on('data', (doc) => {
          if (processedCount < 5) {
            console.log(`[Export] Sample doc received: ${JSON.stringify(doc).substring(0, 100)}...`)
          }
        })

        // Pipe: MongoDB -> Transform -> File
        // Make sure we catch errors at EVERY stage
        mongoStream
          .pipe(transformStream)
          .on('error', (e) => {
            console.error('[Export] Pipe Error at Transform:', e)
            reject(e)
          })
          .pipe(writeStream)
          .on('error', (e) => {
            console.error('[Export] Pipe Error at WriteStream:', e)
            reject(e)
          })
        
      })

    } catch (err) {

      console.error('Export Error:', err)
      return { ok: false, error: err.message }
    } finally {
      if (exportClient) exportClient.close()
      if (exportTunnel) exportTunnel.close()
    }
  })

  // Import Collection Logic
  ipcMain.handle('db:importCollection', async (event, { connId, dbName, collectionName, sourceType, filePath, clipboardData, format, options = {} }) => {
    let importClient = null
    let importTunnel = null

    try {
      const configRes = await Promise.resolve(ipcMain.handlers ? ipcMain.handlers['storage:getConnection'](null, connId) : { ok: false, error: 'Cannot find storage handler' })
      // Since handlers mapping might not exist or be accessible directly across electron versions, let's use the local store.
      // Actually we have a get connection store logic in index.js, but since db.js is cleanly separated, we need to get the config differently.
      // Wait, in db:exportCollection we did:
      // const configRes = await ipcMain.handlers['storage:getConnection']... wait no, we didn't!
      // In exportCollection we accept `connId` but wait, `exportCollection` doesn't fetch connConfig! It expects `connId` but wait...
      // Let's look at exportCollection again!
      // Ah. In db.js `handle('db:exportCollection', async (...) => { ... const client = activeClients[connId].client; ... })`
      // Wait! I can just use the ALREADY EXISTING activeClients[connId] to get the connection details, but we wanted a separate client for resilience.
      // To get `uri`, I can use `activeClients[connId].client.s.url` etc. But how did I do it in exportCollection?
      // I just used `activeClients[connId].client` and created a query directly! 
      
      // Wait, let's look at how export was implemented:
      /*
      const state = activeClients[connId]
      if (!state) throw new Error('Not connected')
      const client = state.client
      const db = client.db(dbName)
      const collection = db.collection(collectionName)
      */
      // For Import we can ALSO use the main client if we insertMany with await, it blocks only that cursor but connection multiplexes multiplexes async requests natively. So it's fine! 
      
      const state = activeClients[connId]
      if (!state) throw new Error('Not connected to database')
      
      const db = state.client.db(dbName)
      const collection = db.collection(collectionName)

      // Drop collection if requested before starting import
      if (options.dropCollection) {
        try {
          await collection.drop()
          console.log(`[Import] Dropped collection ${dbName}.${collectionName} before import.`)
        } catch (e) {
          // Ignore error if collection doesn't exist
          if (e.codeName !== 'NamespaceNotFound') {
            throw e
          }
        }
      }

      const win = require('electron').BrowserWindow.fromWebContents(event.sender)

      let processedCount = 0
      let successCount = 0
      let failedCount = 0
      let lastReportedTime = 0
      const batchSize = options.batchSize || 1000
      let batch = []

      let totalBytes = 0
      let inputStream
      if (sourceType === 'file') {
        const stats = fs.statSync(filePath)
        totalBytes = stats.size || 1
        inputStream = fs.createReadStream(filePath)
      } else {
        const buf = Buffer.from(clipboardData || '', 'utf8')
        totalBytes = buf.length || 1
        inputStream = Readable.from(buf)
      }

      const flushBatch = async () => {
        if (batch.length === 0) return
        try {
          if (options.importMode === 'upsert') {
            const operations = batch.map(doc => ({
              replaceOne: {
                filter: { _id: (doc._id !== undefined && doc._id !== null) ? doc._id : new ObjectId() },
                replacement: doc,
                upsert: true
              }
            }))
            const res = await collection.bulkWrite(operations, { ordered: false })
            successCount += (res.upsertedCount + res.modifiedCount + res.matchedCount)
          } else {
            // ordered: true (stop) or false (skip)
            const isOrdered = options.importMode === 'stop'
            const res = await collection.insertMany(batch, { ordered: isOrdered })
            successCount += res.insertedCount
          }
        } catch (err) {
          if (options.importMode === 'stop') throw err
          
          if (err.writeErrors) {
            // For 'skip' mode or partial 'upsert' errors
            successCount += err.insertedDocs ? err.insertedDocs.length : (batch.length - err.writeErrors.length)
            failedCount += err.writeErrors.length
          } else if (err.result && err.result.result) {
            // Handle bulkWrite result errors
            successCount += err.result.result.nInserted || 0
            failedCount += (err.result.result.writeErrors ? err.result.result.writeErrors.length : 0)
          } else {
            failedCount += batch.length
          }
        }
        batch = []
      }

      const reportProgress = (force = false) => {
        if (force || Date.now() - lastReportedTime > 200) {
          let perc = 0
          if (force) {
            perc = 100
          } else if (sourceType === 'file' && inputStream && inputStream.bytesRead) {
            perc = Math.round((inputStream.bytesRead / totalBytes) * 100)
          }

          win.webContents.send('db:importProgress', {
            processed: processedCount,
            success: successCount,
            failed: failedCount,
            percentage: Math.min(perc, 100)
          })
          lastReportedTime = Date.now()
        }
      }

      const runImport = async () => {
        let iterator
        const delimiter = options.csvOptions?.delimiter === 'semicolon' ? ';' : 
                         options.csvOptions?.delimiter === 'tab' ? '\t' : 
                         options.csvOptions?.delimiter === 'pipe' ? '|' : ','

        const transformCode = options.transformCode
        let transformScript = null
        if (transformCode) {
          try {
            transformScript = new vm.Script(`(${transformCode})(doc)`)
          } catch (e) {
            console.error('[Import] ETL Compilation Error:', e)
            throw new Error(`ETL Syntax Error: ${e.message}`)
          }
        }

        try {
          if (format === 'csv') {
            iterator = inputStream.pipe(csvParser({ separator: delimiter }))
          } else if (format === 'jsonl') {
            const rl = readline.createInterface({ input: inputStream, crlfDelay: Infinity })
            iterator = rl
          } else if (format === 'json') {
            const parser = streamJson.parser()
            iterator = inputStream.pipe(parser).pipe(StreamArray.streamArray())
            
            parser.on('error', (err) => {
              console.error('[Import] JSON Parser Error:', err.message)
            })
          }

          inputStream.on('error', (err) => {
            console.error('[Import] Input Stream Error:', err.message)
          })

          if (iterator && typeof iterator.on === 'function') {
            iterator.on('error', (err) => {
              console.error('[Import] Iterator Error:', err.message)
            })
          }

          for await (const chunk of iterator) {
            let doc
            try {
              if (format === 'json') {
                doc = EJSON.deserialize(chunk.value)
              } else if (format === 'jsonl') {
                let line = chunk.trim()
                if (!line) continue
                if (line.endsWith(',')) line = line.slice(0, -1)
                doc = EJSON.parse(line)
              } else {
                // csv
                doc = EJSON.deserialize(chunk)
              }

              if (!doc || Object.keys(doc).length === 0) continue

              // Apply ETL if present
              if (transformScript) {
                try {
                  const sandbox = { doc }
                  vm.createContext(sandbox)
                  const result = transformScript.runInContext(sandbox)
                  if (result === null || result === undefined) {
                    continue // Skip this document
                  }
                  doc = result
                } catch (e) {
                  console.error('[Import] ETL Execution Error:', e)
                  failedCount++
                  if (options.importMode === 'stop') throw e
                  continue
                }
              }

              if (!doc || Object.keys(doc).length === 0) continue

              // Filter out fields if user made a specific selection
              if (options.selectedFields) {
                const filteredDoc = {}
                const selectedSet = new Set(options.selectedFields)
                for (const k of Object.keys(doc)) {
                  if (selectedSet.has(k)) {
                    filteredDoc[k] = doc[k]
                  }
                }
                doc = filteredDoc
              }

            if (Object.keys(doc).length === 0) continue

            batch.push(doc)
            processedCount++
            reportProgress()

            if (batch.length >= batchSize) {
              await flushBatch()
            }
          } catch (e) {
            failedCount++
            if (options.stopOnError) throw e
          }
        }

          if (batch.length > 0) {
            await flushBatch()
          }
        } catch (e) {
          console.error('[Import] Pipeline/Iteration error:', e)
          throw e
        }

        reportProgress(true)
      }

      await runImport()
      return { ok: true }

    } catch (err) {
      console.error('[Import Error]', err)
      return { ok: false, error: err.message }
    } finally {
      // Don't close the active connection instance here because it's shared
    }
  })

  // BSON Tools Management
  ipcMain.handle('db:checkBsonTools', async () => {
    return checkBsonTools()
  })

  ipcMain.handle('db:downloadBsonTools', async (event) => {
    try {
      const { BrowserWindow } = require('electron')
      const win = BrowserWindow.fromWebContents(event.sender)
      return await downloadBsonTools(win)
    } catch (err) {
      console.error('[BSON Download Error]', err)
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('db:runBsonCommand', async (event, { type, connId, dbName, collectionName, targetPath, options = {} }) => {
    try {
      const { exists, dumpPath, restorePath } = checkBsonTools()
      if (!exists) throw new Error('BSON tools not found. Please download them first.')

      const binPath = type === 'backup' ? dumpPath : restorePath
      const { BrowserWindow } = require('electron')
      const win = BrowserWindow.fromWebContents(event.sender)

      // 1. Get connection config
      const connConfig = getConnectionById(connId)
      if (!connConfig) throw new Error('Connection configuration not found')

      // 2. Build connection URI (handle SSH tunnel if active)
      let { uri } = await buildMongoUri(connConfig)
      const activeConn = activeClients[connId]
      if (activeConn && activeConn.tunnel) {
        // If tunnel is active, use localhost and the local port
        const localPort = activeConn.tunnel.localPort
        const urlObj = new URL(uri.startsWith('mongodb+srv') ? uri.replace('mongodb+srv', 'mongodb') : uri)
        urlObj.host = 'localhost'
        urlObj.port = localPort
        uri = urlObj.toString()
      }

      // Strip Database from URI to avoid conflict with --db flag in BSON tools
      if (uri.includes('://')) {
        const uriParts = uri.split('?')
        let base = uriParts[0]
        const query = uriParts[1] ? `?${uriParts[1]}` : ''
        const protocolEnd = base.indexOf('://') + 3
        const firstSlash = base.indexOf('/', protocolEnd)
        if (firstSlash !== -1) {
          base = base.substring(0, firstSlash + 1)
        } else if (!base.endsWith('/')) {
          base += '/'
        }
        uri = base + query
      }

      // 3. Prepare arguments
      const isAtlas = uri.toLowerCase().includes('mongodb.net') || uri.toLowerCase().includes('mongodb+srv')
      const args = [`--uri=${uri}`]
      
      if (type === 'backup') {
        // Backup: Use traditional flags for stability as requested
        args.push(`--db=${dbName}`, `--collection=${collectionName}`)
        args.push(`--archive=${targetPath}`)
        if (options.gzip) args.push('--gzip')
      } else {
        // Restore: Use nsInclude for Atlas, db/collection for others
        if (isAtlas) {
          args.push(`--nsInclude=${dbName}.${collectionName}`)
          args.push('--numInsertionWorkersPerCollection=1') // Shared tier stability
        } else {
          args.push(`--db=${dbName}`, `--collection=${collectionName}`)
        }
        args.push(`--archive=${targetPath}`)
        if (options.gzip) args.push('--gzip')
        if (options.drop) args.push('--drop')
      }

      console.log(`[BSON] Running command: ${binPath} ${args.join(' ')}`)

      return new Promise((resolve) => {
        const proc = spawn(binPath, args)
        let output = ''

        proc.stdout.on('data', (data) => {
          const str = data.toString()
          output += str
          if (win) win.webContents.send('db:bsonLog', { type: 'stdout', message: str })
        })

        proc.stderr.on('data', (data) => {
          const str = data.toString()
          output += str
          if (win) win.webContents.send('db:bsonLog', { type: 'stderr', message: str })
        })

        proc.on('close', (code) => {
          if (code === 0) {
            resolve({ ok: true })
          } else {
            resolve({ ok: false, error: `Command failed with code ${code}`, output })
          }
        })

        proc.on('error', (err) => {
          resolve({ ok: false, error: err.message })
        })
      })

    } catch (err) {
      console.error('[BSON Command Error]', err)
      return { ok: false, error: err.message }
    }
  })

  // Preview Import Logic
  ipcMain.handle('db:previewImport', async (event, { sourceType, filePath, clipboardData, format, csvOptions = null }) => {
    try {
      const getDelimiter = (del) => {
        if (del === 'semicolon') return ';'
        if (del === 'tab') return '\t'
        if (del === 'pipe') return '|'
        return ','
      }
      const delimiter = getDelimiter(csvOptions?.delimiter)

      let transformScript = null
      if (transformCode) {
        try {
          transformScript = new vm.Script(`(${transformCode})(doc)`)
        } catch (e) {
          console.error('[Preview] ETL Compilation Error:', e)
          return { ok: false, error: `ETL Syntax Error: ${e.message}` }
        }
      }

      if (sourceType === 'file' && !filePath) {
        return { ok: true, data: EJSON.serialize([]) }
      }
      if (sourceType === 'clipboard' && !clipboardData) {
        return { ok: true, data: EJSON.serialize([]) }
      }

      let inputStream
      if (sourceType === 'file') {
        if (!fs.existsSync(filePath)) throw new Error('File not found')
        inputStream = fs.createReadStream(filePath)
      } else {
        const buf = Buffer.from(clipboardData || '', 'utf8')
        inputStream = Readable.from(buf)
      }

      let iterator
      try {
        if (format === 'csv') {
          iterator = inputStream.pipe(csvParser({ separator: delimiter }))
        } else if (format === 'jsonl') {
          const rl = readline.createInterface({ input: inputStream, crlfDelay: Infinity })
          iterator = rl
        } else if (format === 'json') {
          const parser = streamJson.parser()
          iterator = inputStream.pipe(parser).pipe(StreamArray.streamArray())
          
          parser.on('error', (err) => {
            console.error('[Preview] JSON Parser Error:', err.message)
          })
        }

        inputStream.on('error', (err) => {
          console.error('[Preview] Input Stream Error:', err.message)
        })

        if (iterator && typeof iterator.on === 'function') {
          iterator.on('error', (err) => {
            console.error('[Preview] Iterator Error:', err.message)
          })
        }
      } catch (e) {
        console.error('[Preview] Pipeline creation error:', e)
        return { ok: false, error: e.message }
      }

      const previewDocs = []
      
      try {
        for await (const chunk of iterator) {
          let doc
          try {
            if (format === 'json') {
              doc = EJSON.deserialize(chunk.value)
            } else if (format === 'jsonl') {
              let line = chunk.trim()
              if (!line) continue
              if (line.endsWith(',')) line = line.slice(0, -1)
              doc = EJSON.parse(line)
            } else {
              doc = EJSON.deserialize(chunk)
            }

            if (!doc || Object.keys(doc).length === 0) continue

            // Apply ETL if present
            if (transformScript) {
              try {
                const sandbox = { doc }
                vm.createContext(sandbox)
                const result = transformScript.runInContext(sandbox)
                if (result === null || result === undefined) {
                  continue // Skip this document
                }
                doc = result
              } catch (e) {
                console.warn('[Preview] ETL Execution Error:', e.message)
                // In preview, we can ignore execution errors and show original doc or error
                // but for now let's just skip the transformation if it fails
              }
            }

            if (!doc || Object.keys(doc).length === 0) continue

            previewDocs.push(doc)
            if (previewDocs.length >= 5) {
              break // We only need 5 docs for preview
            }
          } catch (e) {
            // Ignore parsing errors for preview chunks
            console.error('[Preview] Chunk error:', e.message)
          }
        }
      } catch (e) {
        console.error('[Preview] Main iteration error:', e.message)
      }

      // Clean up stream to avoid locking files since we break early
      if (inputStream && typeof inputStream.destroy === 'function') {
        inputStream.destroy()
      }

      // Return a stringified payload so the frontend can safely JSON.parse it.
      return { ok: true, data: JSON.stringify(EJSON.serialize(previewDocs)) }
    } catch (err) {
      console.error('[Preview Error]', err)
      return { ok: false, error: err.message }
    }
  })

  // Export Preview Logic
  ipcMain.handle('db:previewExport', async (event, { connId, dbName, collectionName, query, queryString, transformCode = null }) => {
    let previewClient = null
    try {
      const session = activeClients[connId]
      if (!session) throw new Error('Not connected')

      const built = await buildMongoClient(session.config)
      previewClient = built.client
      await previewClient.connect()
      const db = previewClient.db(dbName)

      let cursor
      if (queryString) {
        const vm = require('vm')
        const sandbox = {
          db: {
            getCollection: (name) => db.collection(name),
            collection: (name) => db.collection(name)
          }
        }
        vm.createContext(sandbox)
        const script = new vm.Script(queryString)
        cursor = script.runInContext(sandbox)
      } else {
        cursor = db.collection(collectionName).find(query || {})
      }

      if (!cursor || typeof cursor.toArray !== 'function') {
        throw new Error('Invalid cursor returned from query')
      }

      const docs = await cursor.limit(10).toArray()
      
      let transformScript = null
      if (transformCode) {
        try {
          const vm = require('vm')
          transformScript = new vm.Script(`(${transformCode})(doc)`)
        } catch (e) {
          return { ok: false, error: `ETL Syntax Error: ${e.message}` }
        }
      }

      const transformed = []
      const vm = require('vm')
      const { EJSON } = require('bson')
      for (let doc of docs) {
        if (transformScript) {
          try {
            const sandbox = { doc }
            vm.createContext(sandbox)
            const result = transformScript.runInContext(sandbox)
            if (result === null || result === undefined) continue
            transformed.push(result)
          } catch (e) {
            console.warn('[Export Preview] ETL Error:', e.message)
            transformed.push(doc)
          }
        } else {
          transformed.push(doc)
        }
        if (transformed.length >= 5) break
      }

      return { ok: true, data: EJSON.serialize(transformed) }
    } catch (err) {
      console.error('[Export Preview Error]', err)
      return { ok: false, error: err.message }
    } finally {
      if (previewClient) previewClient.close()
    }
  })
}
