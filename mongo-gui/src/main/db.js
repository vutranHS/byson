import { ipcMain } from 'electron'
import { MongoClient } from 'mongodb'
import { executeMongoshQuery } from './queryRunner'
import { EJSON } from 'bson'
import { createSSHTunnel } from './ssh'

// Store active connection instances (Mapping ConnectionId -> { client, tunnel })
const activeClients = {}

async function buildMongoClient(connConfig) {
  let host = 'localhost'
  let port = 27017

  if (connConfig.host) {
    const parts = connConfig.host.split(':')
    host = parts[0]
    port = parseInt(parts[1]) || port
  }

  let tunnel = null
  if (connConfig.hasSsh) {
    tunnel = await createSSHTunnel(connConfig, host, port)
    host = '127.0.0.1'
    port = tunnel.localPort
  }

  let uri = 'mongodb://'
  if (connConfig.hasAuth && connConfig.authUser) {
    const user = encodeURIComponent(connConfig.authUser)
    const pass = encodeURIComponent(connConfig.authPass)
    uri += `${user}:${pass}@`
  }

  uri += `${host}:${port}/`

  if (connConfig.hasAuth && connConfig.authDb) {
    uri += `${connConfig.authDb}`
  } else if (connConfig.defaultDb) {
    uri += `${connConfig.defaultDb}`
  }

  const mongoOptions = { serverSelectionTimeoutMS: 5000 }

  if (connConfig.hasTls) {
    mongoOptions.tls = true
    if (connConfig.tlsAuthMethod === 'CA Certificate' && connConfig.tlsCaPath) {
      mongoOptions.tlsCAFile = connConfig.tlsCaPath
    } else if (connConfig.tlsAuthMethod === 'Self-signed Certificate') {
      mongoOptions.tlsAllowInvalidCertificates = true
    }

    if (connConfig.tlsClientCertPath) {
      mongoOptions.tlsCertificateKeyFile = connConfig.tlsClientCertPath
      if (connConfig.tlsClientKeyPassphrase) {
        mongoOptions.tlsCertificateKeyFilePassword = connConfig.tlsClientKeyPassphrase
      }
    }
  }

  if (connConfig.hasAuth && connConfig.authMech) {
    if (connConfig.authMech === 'SCRAM-SHA-256') mongoOptions.authMechanism = 'SCRAM-SHA-256'
    else if (connConfig.authMech === 'MONGODB-CR') mongoOptions.authMechanism = 'MONGODB-CR'
  }

  if (connConfig.type === 'Replica Set' && connConfig.replicaSet) {
    mongoOptions.replicaSet = connConfig.replicaSet
  } else {
    // Force direct connection to avoid roaming to discovered RS nodes (which might point to localhost)
    mongoOptions.directConnection = true
  }

  // Enable Application Performance Monitoring (APM) to track commands
  mongoOptions.monitorCommands = true

  console.log(`[MongoClient] Connecting to: ${uri.replace(/:([^:@]+)@/, ':****@')}`)
  console.log(`[MongoClient] Options:`, JSON.stringify(mongoOptions))

  const client = new MongoClient(uri, mongoOptions)
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
      const adminDb = client.db('admin')
      const result = await adminDb.admin().listDatabases()
      const dbs = result.databases.map((d) => d.name)

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
}
