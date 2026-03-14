import vm from 'vm'
import { ObjectId } from 'mongodb'
import { EJSON } from 'bson'

export async function executeMongoshQuery(client, dbName, queryString, options = {}) {
  const db = client.db(dbName)
  let operation = null

  // Chứa danh sách các method cho db.getCollection(...).find().sort()
  class FindCursorBuilder {
    constructor(collection, query) {
      this.collection = collection
      this.query = query
      this._sort = null

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

    async execute() {
      let cursor = this.collection.find(this.query || {})
      if (this._sort) cursor = cursor.sort(this._sort)
      if (this._skip) cursor = cursor.skip(this._skip)
      if (this._limit) cursor = cursor.limit(this._limit)
      return await cursor.toArray()
    }
  }

  // Đối tượng mock giả lập API của mongosh
  const mockDb = {
    getCollection: (colName) => {
      const collection = db.collection(colName)
      return {
        // Find
        find: (query = {}) => {
          const builder = new FindCursorBuilder(collection, query)
          operation = () => builder.execute()
          return builder // Trả về builder để user có thể chain thêm .sort().limit()
        },
        // Aggregate
        aggregate: (pipeline = []) => {
          operation = () => collection.aggregate(pipeline).toArray()
          return {
            toArray: () => {} // Mock to prevent error if user types .toArray()
          }
        },
        // Count
        countDocuments: (query = {}) => {
          operation = () => collection.countDocuments(query)
          return {}
        },
        count: (query = {}) => {
          operation = () => collection.countDocuments(query)
          return {}
        },
        // Insert
        insertOne: (doc) => {
          operation = () => collection.insertOne(doc)
          return {}
        },
        insertMany: (docs) => {
          operation = () => collection.insertMany(docs)
          return {}
        },
        // Update
        updateOne: (filter, update, options) => {
          operation = () => collection.updateOne(filter, update, options)
          return {}
        },
        updateMany: (filter, update, options) => {
          operation = () => collection.updateMany(filter, update, options)
          return {}
        },
        // Delete
        deleteOne: (filter) => {
          operation = () => collection.deleteOne(filter)
          return {}
        },
        deleteMany: (filter) => {
          operation = () => collection.deleteMany(filter)
          return {}
        }
      }
    }
  }

  // Sandbox môi trường an toàn (bao gồm hỗ trợ các Data Types thông dụng)
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
    // Parser ném SyntaxError ngay khi compile Script nếu sai cú pháp
    const script = new vm.Script(queryString, { filename: 'mongosh' })
    // Thực thi chuỗi js user gõ vào
    script.runInContext(sandbox)

    if (operation) {
      const start = Date.now()
      const data = await operation()
      const time = Date.now() - start

      // Serialize BSON types (ObjectId, Date, etc.) to valid JSON structures like { $oid: "..." }
      // This prevents IPC from mangling object prototypes into Buffers
      const serializedData = EJSON.serialize(data)

      return { ok: true, data: serializedData, execTime: time }
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
      // Trích xuất stack error để hiển thị dòng lỗi rõ hơn
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
