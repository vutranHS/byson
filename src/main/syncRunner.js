import { EJSON } from 'bson'
import { spawn } from 'child_process'
import { checkBsonTools, downloadBsonTools } from './bsonTools'
import { URL } from 'url'

// Track active sync operations
// { [operationId]: { state: 'running'|'paused'|'stopped', resumeId: null, ... } }
export const activeSyncOperations = new Map()

/**
 * Core function to run Engine 2: Mules & Drivers Sync (Supports both Collection and Database level)
 */
export async function runDriverSync({ operationId, sourceClient, targetClient, sourceDbName, sourceColName, targetDbName, targetColName, options, win }) {
  const sourceDb = sourceClient.db(sourceDbName)
  const targetDb = targetClient.db(targetDbName)

  const sendProgress = (payload) => {
    if (win) {
      win.webContents.send('db:syncProgress', { operationId, ...payload })
    }
  }

  const checkState = () => {
    const op = activeSyncOperations.get(operationId)
    if (!op) throw new Error('Sync operation missing state')
    if (op.state === 'stopped') throw new Error('SYNC_STOPPED')
    if (op.state === 'paused') throw new Error('SYNC_PAUSED')
  }

  const syncSingleCollection = async (sColName, tColName, progressOffset = 0, globalTotal = null) => {
    const sourceCol = sourceDb.collection(sColName)
    let targetCol = targetDb.collection(tColName)

    // Phase 1: Metadata & Index Sync
    if (!options.isResume) {
      if (options.dropTarget) {
        try {
          await targetCol.drop()
          sendProgress({ phase: 'metadata', status: `[${sColName}] Dropped target collection.` })
        } catch (e) {
          if (e.code !== 26) throw e // Ignore NamespaceNotFound
        }
      }

      if (options.createIfNotExists) {
        sendProgress({ phase: 'metadata', status: `[${sColName}] Syncing metadata and indexes...` })
        const collections = await sourceDb.listCollections({ name: sColName }).toArray()
        if (collections.length > 0) {
          const colInfo = collections[0]
          await targetDb.createCollection(tColName, colInfo.options || {})
          
          const indexes = await sourceCol.listIndexes().toArray()
          const filteredIndexes = indexes.filter(idx => idx.name !== '_id_')
          
          if (filteredIndexes.length > 0) {
            await targetCol.createIndexes(filteredIndexes)
          }
        }
      }
    }

    sendProgress({ phase: 'data', status: `[${sColName}] Starting data transfer...` })

    // Phase 2: Parallel Data Sync
    let query = {}
    if (options.resumeId) {
      query = { _id: { $gt: EJSON.deserialize({ _id: options.resumeId })._id } }
    }

    const cursor = sourceCol.find(query).sort({ _id: 1 })
    const BATCH_SIZE = options.batchSize || 5000
    const MAX_CONCURRENT_WRITES = options.parallelThreads || 5

    let batch = []
    let uploadPromises = []
    let totalProcessed = options.processedSoFar || 0
    let lastProcessedId = null

    // For DB level, we only count the current collection for logging, but we aggregate globally
    let colTotalCount = await sourceCol.countDocuments(query)
    const expectedTotal = globalTotal ? globalTotal : (totalProcessed + colTotalCount)

    while (await cursor.hasNext()) {
      checkState()

      const doc = await cursor.next()
      batch.push(doc)
      lastProcessedId = doc._id

      if (batch.length >= BATCH_SIZE) {
        const batchToInsert = [...batch]
        const batchLastId = lastProcessedId
        batch = []

        const writeTask = targetCol.insertMany(batchToInsert, { ordered: false })
          .catch(err => {
            if (err.code === 11000) return true
            throw err
          })

        const trackTask = writeTask.then(() => {
           totalProcessed += batchToInsert.length
           const op = activeSyncOperations.get(operationId)
           if (op) op.resumeId = EJSON.serialize({ _id: batchLastId })._id
           
           sendProgress({ 
             phase: 'data', 
             processed: progressOffset + totalProcessed, 
             total: expectedTotal, 
             resumeId: op ? op.resumeId : null 
           })
        })

        uploadPromises.push(trackTask)

        if (uploadPromises.length >= MAX_CONCURRENT_WRITES) {
          await Promise.race(uploadPromises)
          await Promise.all(uploadPromises) // Simplify memory flush
          uploadPromises = []
        }
      }
    }

    if (batch.length > 0) {
      checkState()
      await targetCol.insertMany(batch, { ordered: false }).catch(e => {
         if (e.code !== 11000) throw e
      })
      totalProcessed += batch.length
      const op = activeSyncOperations.get(operationId)
      if (op) op.resumeId = EJSON.serialize({ _id: lastProcessedId })._id
      
      sendProgress({ 
        phase: 'data', 
        processed: progressOffset + totalProcessed, 
        total: expectedTotal, 
        resumeId: op ? op.resumeId : null
      })
    }
    
    // Clear the resumeId for the NEXT collection in the DB clone loop
    const op = activeSyncOperations.get(operationId)
    if (op) {
      op.resumeId = null 
      op.processedSoFar = progressOffset + totalProcessed
    }
    return totalProcessed
  }

  try {
    sendProgress({ phase: 'init', status: 'Verifying environments...' })

    // Redirect to Engine 1 if selected
    if (options.useNativeTools) {
       return await runNativeClone({ operationId, sourceDbName, sourceColName, targetDbName, targetColName, options, win })
    }

    // Case 1: Single Collection Clone
    if (sourceColName) {
       await syncSingleCollection(sourceColName, targetColName || sourceColName)
       
       const op = activeSyncOperations.get(operationId)
       if (op) op.state = 'completed'
       sendProgress({ completed: true })
       return { ok: true }
    }

    // Case 2: Full Database Clone
    sendProgress({ phase: 'init', status: 'Mapping Database Collections...' })
    const collections = await sourceDb.listCollections().toArray()
    const validCols = collections.filter(c => !c.name.startsWith('system.'))
    
    // Pre-calculate total documents for a global progress bar
    let globalTotal = 0
    for (const c of validCols) {
      globalTotal += await sourceDb.collection(c.name).estimatedDocumentCount()
    }

    let globalProcessed = options.processedSoFar || 0

    // Loop through collections sequentially
    for (let i = 0; i < validCols.length; i++) {
      const colName = validCols[i].name
      sendProgress({ phase: 'metadata', status: `Cloning [${i+1}/${validCols.length}]: ${colName}...` })
      
      const processedInCol = await syncSingleCollection(colName, colName, globalProcessed, globalTotal)
      globalProcessed += processedInCol
    }

    const op = activeSyncOperations.get(operationId)
    if (op) op.state = 'completed'
    sendProgress({ completed: true, status: 'Database Clone Completed Successfully!' })
    return { ok: true }

  } catch (err) {
    if (err.message === 'SYNC_STOPPED') {
       sendProgress({ phase: 'abort', stopped: true })
       return { ok: true, stopped: true }
    }
    if (err.message === 'SYNC_PAUSED') {
       sendProgress({ phase: 'pause', paused: true })
       return { ok: true, paused: true }
    }
    sendProgress({ phase: 'error', error: err.message })
    return { ok: false, error: err.message }
  }
}

/**
 * Engine 1: Native mongodump to mongorestore pipe
 */
async function runNativeClone({ operationId, sourceDbName, sourceColName, targetDbName, targetColName, options, win }) {
  const sendProgress = (payload) => {
    if (win) {
      win.webContents.send('db:syncProgress', { operationId, ...payload })
    }
  }

  sendProgress({ phase: 'init', status: 'Verifying internal BSON tools...' })
  
  let tools = await checkBsonTools()
  if (!tools.exists) {
    sendProgress({ phase: 'init', status: 'Downloading MongoDB Native Tools...' })
    try {
      await downloadBsonTools(win)
      tools = await checkBsonTools()
      if (!tools.exists) throw new Error('Could not locate tools after download.')
    } catch (err) {
      throw new Error(`Failed to initialize BSON tools: ${err.message}`)
    }
  }

  const dumpPath = tools.dumpPath
  const restorePath = tools.restorePath

  sendProgress({ phase: 'init', status: 'Building secure native pipes...' })

  const cleanUri = (uriStr) => {
    try {
      const u = new URL(uriStr)
      if (u.pathname && u.pathname !== '/') {
        u.pathname = '/'
      }
      return u.toString()
    } catch (e) {
      return uriStr
    }
  }

  let dumpArgs = ['--uri', cleanUri(options.sourceUri), '--db', sourceDbName, '--archive']
  if (sourceColName) {
    dumpArgs.push('--collection', sourceColName)
  }

  let restoreArgs = ['--uri', cleanUri(options.targetUri), '--archive']
  if (options.dropTarget) {
    restoreArgs.push('--drop')
  }

  // Namespace Renaming
  if (targetDbName !== sourceDbName) {
    restoreArgs.push('--nsFrom', `${sourceDbName}.*`)
    restoreArgs.push('--nsTo', `${targetDbName}.*`)
  }

  if (sourceColName && targetColName && sourceColName !== targetColName) {
    restoreArgs.push('--nsFrom', `${sourceDbName}.${sourceColName}`)
    restoreArgs.push('--nsTo', `${targetDbName}.${targetColName}`)
  }

  sendProgress({ phase: 'data', status: 'Streaming raw BSON via Engine 1... (This might take a while)' })

  return new Promise((resolve, reject) => {
    const dump = spawn(dumpPath, dumpArgs)
    const restore = spawn(restorePath, restoreArgs)

    dump.stdout.pipe(restore.stdin)

    let dumpErr = ''
    let restoreErr = ''

    dump.stderr.on('data', data => {
       const str = data.toString()
       dumpErr += str
       if (str.trim()) sendProgress({ status: `[Dump] ${str.trim()}` })
    })
    
    restore.stderr.on('data', data => {
       const str = data.toString()
       restoreErr += str
       if (str.trim()) sendProgress({ status: `[Restore] ${str.trim()}` })
    })

    let completed = false

    const handleExit = () => {
      if (completed) return
      completed = true
      
      const op = activeSyncOperations.get(operationId)
      if (op) op.state = 'completed'

      if (restoreErr && restoreErr.toLowerCase().includes('error')) {
        sendProgress({ phase: 'error', error: `Restore Error: ${restoreErr.trim()}` })
        reject(new Error(`Restore Error: ${restoreErr.trim()}`))
      } else {
        sendProgress({ phase: 'data', completed: true, status: 'Native BSON copy completed successfully!' })
        resolve({ ok: true })
      }
    }

    restore.on('close', handleExit)
    dump.on('error', err => { completed = true; reject(err) })
    restore.on('error', err => { completed = true; reject(err) })
    
    // Stop sync hook
    const checkInterval = setInterval(() => {
       const op = activeSyncOperations.get(operationId)
       if (!op || op.state === 'stopped') {
          clearInterval(checkInterval)
          dump.kill()
          restore.kill()
          sendProgress({ phase: 'abort', stopped: true })
       }
    }, 1000)
    
    restore.on('close', () => clearInterval(checkInterval))
  })
}
