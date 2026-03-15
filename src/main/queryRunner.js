import vm from 'vm'
import { ObjectId } from 'mongodb'
import { EJSON } from 'bson'

export async function executeMongoshQuery(client, dbName, queryString, options = {}) {
  const db = client.db(dbName)
  let operation = null

  // Stores a list of methods for chaining, such as db.getCollection(...).find().sort()
  class FindCursorBuilder {
    constructor(collection, query, projection) {
      this.collection = collection
      this.query = query
      this.projection = projection
      this._sort = null
      this._postProcess = []

      const parsedLimit = parseInt(options.limit, 10)
      this._limit = isNaN(parsedLimit) || parsedLimit <= 0 ? 50 : parsedLimit

      const parsedSkip = parseInt(options.skip, 10)
      this._skip = isNaN(parsedSkip) || parsedSkip < 0 ? 0 : parsedSkip
    }

    sort(s) {
      this._sort = s
      return this
    }
    limit(l) {
      this._limit = l
      return this
    }
    skip(s) {
      this._skip = s
      return this
    }
    project(p) {
      this.projection = p
      return this
    }
    hint(h) {
      this._hint = h
      return this
    }
    batchSize(b) {
      // Mock support
      return this
    }
    toArray() {
      return this
    }
    
    // Dynamically support all standard JS Array methods for post-processing
    // This allows .map, .filter, .reduce, .find, .forEach, .some, .every, etc.
    _addPostProcess(methodName, ...args) {
      this._postProcess.push((data) => data[methodName](...args))
      return this
    }
    count() {
      const col = this.collection
      const q = this.query
      operation = async () => {
        const c = await col.countDocuments(q || {})
        return { _isFindResult: true, data: [{ count: c }], totalCount: 1 }
      }
      return this
    }
    explain(verbosity) {
      const col = this.collection
      const q = this.query
      const proj = this.projection
      const s = this._sort
      const sk = this._skip
      const h = this._hint
      operation = () => {
        let cursor = col.find(q || {}, { projection: proj })
        if (s) cursor = cursor.sort(s)
        if (sk) cursor = cursor.skip(sk)
        if (h) cursor = cursor.hint(h)
        return cursor.explain(verbosity)
      }
      return this
    }

    async execute() {
      // Retrieve the total count without skip/limit overhead
      const totalCount = await this.collection.countDocuments(this.query || {})
      
      let cursor = this.collection.find(this.query || {}, { projection: this.projection })
      if (this._sort) cursor = cursor.sort(this._sort)
      if (this._skip) cursor = cursor.skip(this._skip)
      if (this._hint) cursor = cursor.hint(this._hint)
      
      // Enforce absolute max limit of 1000 to prevent V8 OOM
      let finalLimit = this._limit
      if (finalLimit === undefined || finalLimit === null || finalLimit <= 0 || finalLimit > 1000) {
        finalLimit = 1000
      }
      
      cursor = cursor.limit(finalLimit)
      let data = await cursor.toArray()

      // Apply post-processing (map, filter, etc.)
      if (this._postProcess.length > 0) {
        for (const process of this._postProcess) {
          try {
            data = process(data)
          } catch (err) {
            console.error('Post-processing error:', err)
            // Continue with previous data or partial data
          }
        }
      }

      return { _isFindResult: true, data, totalCount }
    }
  }

  // Attach standard Array methods to the FindCursorBuilder prototype for full JS utility support
  ;['map', 'filter', 'reduce', 'find', 'forEach', 'some', 'every', 'slice', 'flat', 'flatMap', 'includes', 'indexOf', 'join', 'keys', 'reverse'].forEach(methodName => {
    FindCursorBuilder.prototype[methodName] = function(...args) {
      return this._addPostProcess(methodName, ...args)
    }
  })

  // Mock object to simulate the mongosh API
  const mockDb = {
    getCollection: (colName) => {
      const collection = db.collection(colName)
      return {
        // Find
        find: (query = {}, projection) => {
          const builder = new FindCursorBuilder(collection, query, projection)
          operation = () => builder.execute()
          return builder // Returns the builder to allow users to chain methods like .sort().limit()
        },
        findOne: (query = {}, options = {}) => {
          operation = () => collection.findOne(query, options)
          return {}
        },
        // Aggregate
        aggregate: (pipeline = [], queryOptions = {}) => {
          operation = async () => {
            // Check if pipeline has $out or $merge (must be last stage, outputs to another collection)
            const hasOutOrMerge = pipeline.some(
              (stage) => Object.keys(stage)[0] === '$out' || Object.keys(stage)[0] === '$merge'
            )

            if (hasOutOrMerge) {
              await collection.aggregate(pipeline, queryOptions).toArray()
              return {
                _isFindResult: true,
                data: [{ acknowledged: true, message: 'Aggregation pipeline output executed successfully.' }],
                totalCount: 0
              }
            }

            const parsedLimit = parseInt(options.limit, 10)
            const finalLimit = isNaN(parsedLimit) || parsedLimit <= 0 ? 50 : Math.min(parsedLimit, 1000)

            const parsedSkip = parseInt(options.skip, 10)
            const finalSkip = isNaN(parsedSkip) || parsedSkip < 0 ? 0 : parsedSkip

            const countPipeline = [...pipeline, { $count: 'total' }]
            const dataPipeline = [...pipeline, { $skip: finalSkip }, { $limit: finalLimit }]

            // Fire both queries (count and paginated data) in parallel to save time
            const [countResult, dataResult] = await Promise.all([
              collection
                .aggregate(countPipeline, queryOptions)
                .toArray()
                .catch(() => []), // empty array if pipeline fails
              collection.aggregate(dataPipeline, queryOptions).toArray()
            ])

            const totalCount = countResult[0]?.total || 0

            return { _isFindResult: true, data: dataResult, totalCount }
          }

          return {
            toArray: () => {}, // Mock to prevent error if user types .toArray()
            explain: () => {
              operation = () => collection.aggregate(pipeline, queryOptions).explain()
              return {}
            }
          }
        },
        // Distinct
        distinct: (key, query = {}, options = {}) => {
          operation = () => collection.distinct(key, query, options)
          return {}
        },
        // Count
        countDocuments: (query = {}, options = {}) => {
          operation = async () => {
            const count = await collection.countDocuments(query, options)
            return { _isFindResult: true, data: [{ count }], totalCount: 1 }
          }
          return {}
        },
        count: (query = {}, options = {}) => {
          operation = async () => {
            const count = await collection.countDocuments(query, options)
            return { _isFindResult: true, data: [{ count }], totalCount: 1 }
          }
          return {}
        },
        // Insert
        insertOne: (doc, options = {}) => {
          operation = () => collection.insertOne(doc, options)
          return {}
        },
        insertMany: (docs = [], options = {}) => {
          operation = async () => {
            if (!Array.isArray(docs) || docs.length === 0) return { acknowledged: true, insertedCount: 0 }
            
            // Chunked insertion based on Payload Size to prevent SSH Tunnel drops (Max ~5MB per chunk)
            const MAX_CHUNK_SIZE_BYTES = 5 * 1024 * 1024 
            
            let totalInserted = 0
            const allInsertedIds = {}
            
            let currentChunk = []
            let currentChunkSize = 0
            let batchCount = 0
            
            // Helper function to insert the accumulated chunk
            const flushChunk = async (chunk, startIndex) => {
              if (chunk.length === 0) return
              const res = await collection.insertMany(chunk, options)
              totalInserted += res.insertedCount
              Object.keys(res.insertedIds).forEach(localIndex => {
                allInsertedIds[Number(localIndex) + startIndex] = res.insertedIds[localIndex]
              })
            }

            let currentIndex = 0
            let chunkStartIndex = 0

            for (const doc of docs) {
              // Estimate BSON size using JSON stringify (rough approximation for safety)
              const docSize = Buffer.byteLength(JSON.stringify(doc), 'utf8')
              
              if (currentChunkSize + docSize > MAX_CHUNK_SIZE_BYTES && currentChunk.length > 0) {
                // Flush current chunk if adding this document exceeds max size
                await flushChunk(currentChunk, chunkStartIndex)
                batchCount++
                currentChunk = []
                currentChunkSize = 0
                chunkStartIndex = currentIndex
              }
              
              currentChunk.push(doc)
              currentChunkSize += docSize
              currentIndex++
            }
            
            // Flush remaining docs
            if (currentChunk.length > 0) {
              await flushChunk(currentChunk, chunkStartIndex)
              batchCount++
            }
            
            return { 
              acknowledged: true, 
              insertedCount: totalInserted, 
              insertedIds: allInsertedIds,
              _note: batchCount > 1 ? `Payload size exceeded limits. Automatically chunked successfully into ${batchCount} batches to prevent SSH disconnects.` : undefined
            }
          }
          return {}
        },
        // Update & Replace
        updateOne: (filter, update, options = {}) => {
          operation = () => collection.updateOne(filter, update, options)
          return {}
        },
        updateMany: (filter, update, options = {}) => {
          operation = () => collection.updateMany(filter, update, options)
          return {}
        },
        replaceOne: (filter, replacement, options = {}) => {
          operation = () => collection.replaceOne(filter, replacement, options)
          return {}
        },
        findOneAndUpdate: (filter, update, options = {}) => {
          operation = () => collection.findOneAndUpdate(filter, update, options)
          return {}
        },
        findOneAndReplace: (filter, replacement, options = {}) => {
          operation = () => collection.findOneAndReplace(filter, replacement, options)
          return {}
        },
        // Delete
        deleteOne: (filter, options = {}) => {
          operation = () => collection.deleteOne(filter, options)
          return {}
        },
        deleteMany: (filter, options = {}) => {
          operation = () => collection.deleteMany(filter, options)
          return {}
        },
        findOneAndDelete: (filter, options = {}) => {
          operation = () => collection.findOneAndDelete(filter, options)
          return {}
        },
        // Bulk
        bulkWrite: (operations = [], options = {}) => {
          operation = () => collection.bulkWrite(operations, options)
          return {}
        },
        // Administrative & Stats
        stats: (options = {}) => {
          operation = () => db.command({ collStats: colName, ...options })
          return {}
        },
        estimatedDocumentCount: (options = {}) => {
          operation = () => collection.estimatedDocumentCount(options)
          return {}
        },
        rename: (newName, options = {}) => {
          operation = () => collection.rename(newName, options)
          return {}
        },
        options: (options = {}) => {
          operation = async () => {
            const collections = await db.listCollections({ name: colName }, options).toArray()
            return collections[0]?.options || {}
          }
          return {}
        },
        isCapped: (options = {}) => {
          operation = async () => {
            const collections = await db.listCollections({ name: colName }, options).toArray()
            return !!collections[0]?.options?.capped
          }
          return {}
        },
        // Indexes
        createIndex: (indexSpec, options = {}) => {
          operation = () => collection.createIndex(indexSpec, options)
          return {}
        },
        createIndexes: (indexSpecs, options = {}) => {
          operation = () => collection.createIndexes(indexSpecs, options)
          return {}
        },
        dropIndex: (indexName, options = {}) => {
          operation = () => collection.dropIndex(indexName, options)
          return {}
        },
        dropIndexes: (options = {}) => {
          operation = () => collection.dropIndexes(options)
          return {}
        },
        listIndexes: (options = {}) => {
          operation = () => collection.listIndexes(options).toArray()
          return {
            toArray: () => {}
          }
        },
        indexInformation: (options = {}) => {
          operation = () => collection.indexInformation(options)
          return {}
        }
      }
    }
  }

  // Secure sandbox environment (includes support for common MongoDB Data Types)
  const sandbox = {
    db: mockDb,
    ObjectId: (id) => new ObjectId(id),
    ISODate: (d) => new Date(d),
    Date: Date,
    NumberInt: (n) => parseInt(n, 10),
    NumberLong: (n) => parseInt(n, 10)
  }

  vm.createContext(sandbox)

  try {
    // The parser throws a SyntaxError during script compilation if the syntax is incorrect
    const script = new vm.Script(queryString, { filename: 'mongosh' })
    // Executes the JavaScript string entered by the user
    script.runInContext(sandbox)

    if (operation) {
      const start = Date.now()
      const rawData = await operation()
      const time = Date.now() - start

      let dataToSerialize = rawData
      let totalCount = undefined

      if (rawData && rawData._isFindResult) {
        dataToSerialize = rawData.data
        totalCount = rawData.totalCount
      }

      // Serialize BSON types (ObjectId, Date, etc.) to valid JSON structures like { $oid: "..." }
      // This prevents IPC from mangling object prototypes into Buffers
      const serializedData = EJSON.serialize(dataToSerialize)

      return { ok: true, data: serializedData, totalCount, execTime: time }
    } else {
      return {
        ok: false,
        error:
          "Query syntax executed but no command attached. Try e.g: db.getCollection('name').find({})"
      }
    }
  } catch (err) {
    let errorMsg = err.message
    if (err.name === 'SyntaxError') {
      errorMsg = `SyntaxError: ${err.message}`
      // Extract the error stack to pinpoint the faulty line more clearly
      if (err.stack) {
        const lines = err.stack.split('\n')
        // Format line contains 'mongosh:lineNum'
        const relevant = lines.find((l) => l.includes('mongosh:'))
        if (relevant) errorMsg += `\n    at ${relevant.trim()}`
      }
    }
    return { ok: false, error: errorMsg }
  }
}
