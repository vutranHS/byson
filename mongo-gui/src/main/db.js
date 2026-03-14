import { ipcMain } from 'electron'
import { MongoClient } from 'mongodb'
import { executeMongoshQuery } from './queryRunner'
import { EJSON } from 'bson'
import { createSSHTunnel } from './ssh'

// Lưu các connection instance đang active (Mapping ConnectionId -> { client, tunnel })
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
    } else {
      mongoOptions.tlsAllowInvalidCertificates = true
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

  console.log(`[MongoClient] Connecting to: ${uri.replace(/:([^:@]+)@/, ':****@')}`)
  console.log(`[MongoClient] Options:`, JSON.stringify(mongoOptions))

  const client = new MongoClient(uri, mongoOptions)
  return { client, tunnel }
}

/**
 * Hàm khởi tạo các sự kiện giao tiếp (IPC) liên quan đến DB
 */
export function initDbHandlers() {
  // 1. Phục vụ nút "Test Connection" trên Form Setup
  ipcMain.handle('db:testConnection', async (_, connConfig) => {
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

  // 2. Kết nối thật khi người dùng bấm Double Click / Connect bên ngoài
  ipcMain.handle('db:connect', async (_, connConfig) => {
    try {
      const built = await buildMongoClient(connConfig)
      const { client, tunnel } = built
      await client.connect()
      activeClients[connConfig.id] = { client, tunnel }

      // Lấy danh sách db mặc định trả về ngay
      const adminDb = client.db('admin')
      const result = await adminDb.admin().listDatabases()
      const dbs = result.databases.map((d) => d.name)

      return { ok: true, databases: dbs }
    } catch (err) {
      console.error('Connect Error:', err)
      return { ok: false, error: err.message }
    }
  })

  const getClient = (connId) => {
    const session = activeClients[connId]
    if (!session || !session.client) throw new Error('Not connected')
    return session.client
  }

  // 3. Lấy danh sách collections trong db
  ipcMain.handle('db:listCollections', async (_, { connId, dbName }) => {
    try {
      const client = getClient(connId)
      const db = client.db(dbName)
      const collections = await db.listCollections().toArray()
      return { ok: true, collections: collections.map((c) => c.name).sort() }
    } catch (err) {
      console.error('List Collections Error:', err)
      return { ok: false, error: err.message }
    }
  })

  // 4. Ngắt kết nối
  ipcMain.handle('db:disconnect', async (_, connId) => {
    const session = activeClients[connId]
    if (session) {
      if (session.client) await session.client.close()
      if (session.tunnel) session.tunnel.close()
      delete activeClients[connId]
    }
    return { ok: true }
  })

  // 5. Thực thi Query từ Monaco Editor
  ipcMain.handle('db:runQuery', async (_, { connId, dbName, query, options }) => {
    try {
      const client = getClient(connId)
      return await executeMongoshQuery(client, dbName, query, options)
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  // ==========================================
  // Context Menu Actions (DB & Collection)
  // ==========================================

  ipcMain.handle('db:dropDatabase', async (_, { connId, dbName }) => {
    try {
      const client = getClient(connId)
      await client.db(dbName).dropDatabase()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('db:createCollection', async (_, { connId, dbName, collectionName }) => {
    try {
      const client = getClient(connId)
      await client.db(dbName).createCollection(collectionName)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('db:dropCollection', async (_, { connId, dbName, collectionName }) => {
    try {
      const client = getClient(connId)
      await client.db(dbName).collection(collectionName).drop()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('db:renameCollection', async (_, { connId, dbName, oldName, newName }) => {
    try {
      const client = getClient(connId)
      await client.db(dbName).collection(oldName).rename(newName)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle(
    'db:duplicateCollection',
    async (_, { connId, dbName, sourceName, targetName }) => {
      try {
        const client = getClient(connId)
        await client
          .db(dbName)
          .collection(sourceName)
          .aggregate([{ $match: {} }, { $out: targetName }])
          .toArray()
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err.message }
      }
    }
  )

  ipcMain.handle('db:dbStats', async (_, { connId, dbName }) => {
    try {
      const client = getClient(connId)
      const stats = await client.db(dbName).command({ dbStats: 1 })
      return { ok: true, stats }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('db:collStats', async (_, { connId, dbName, collectionName }) => {
    try {
      const client = getClient(connId)
      const stats = await client.db(dbName).command({ collStats: collectionName })
      return { ok: true, stats }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  // ==========================================
  // Document Operations (Insert / Update / Delete)
  // ==========================================

  ipcMain.handle('db:insertDocument', async (_, { connId, dbName, collectionName, document }) => {
    try {
      const client = getClient(connId)
      const doc = EJSON.deserialize(document)
      await client.db(dbName).collection(collectionName).insertOne(doc)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('db:updateDocument', async (_, { connId, dbName, collectionName, document }) => {
    try {
      const client = getClient(connId)
      const doc = EJSON.deserialize(document)
      const id = doc._id
      if (!id) throw new Error('Document must have an _id to be updated')

      const updateDoc = { ...doc }
      delete updateDoc._id // Remove _id from replacement payload so MongoDB doesn't complain

      await client.db(dbName).collection(collectionName).replaceOne({ _id: id }, updateDoc)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('db:deleteDocument', async (_, { connId, dbName, collectionName, documentId }) => {
    try {
      const client = getClient(connId)
      const idObj = EJSON.deserialize({ _id: documentId })._id
      await client.db(dbName).collection(collectionName).deleteOne({ _id: idObj })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })
}
