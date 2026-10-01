import { GridFSBucket } from 'mongodb'
import { EJSON } from 'bson'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { Transform } from 'stream'

const PREVIEW_IMAGE_LIMIT = 5 * 1024 * 1024
const PREVIEW_TEXT_LIMIT = 256 * 1024

const IMAGE_EXTS = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon'
}
const TEXT_EXTS = new Set([
  'txt',
  'md',
  'json',
  'csv',
  'log',
  'xml',
  'html',
  'htm',
  'css',
  'js',
  'mjs',
  'ts',
  'yml',
  'yaml',
  'ini',
  'conf',
  'sql',
  'sh',
  'py'
])

const TEXT_MIMES = {
  json: 'application/json',
  xml: 'application/xml',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  csv: 'text/csv',
  md: 'text/markdown',
  yml: 'application/yaml',
  yaml: 'application/yaml'
}

// File ids travel between processes as EJSON strings so ObjectId / non-ObjectId ids
// (GridFS allows any _id type) survive the round trip.
const parseId = (idEjson) => EJSON.parse(idEjson, { relaxed: false })

const getBucket = (client, dbName, bucketName) =>
  new GridFSBucket(client.db(dbName), { bucketName: bucketName || 'fs' })

const detectKind = (file) => {
  const ext = path
    .extname(file.filename || '')
    .slice(1)
    .toLowerCase()
  const ct = (file.contentType || file.metadata?.contentType || '').toLowerCase()
  if (ct.startsWith('image/')) return { kind: 'image', mime: ct }
  if (IMAGE_EXTS[ext]) return { kind: 'image', mime: IMAGE_EXTS[ext] }
  if (ct.startsWith('text/') || ct.includes('json') || ct.includes('xml') || TEXT_EXTS.has(ext)) {
    return { kind: 'text', mime: ct || TEXT_MIMES[ext] || 'text/plain' }
  }
  return { kind: 'binary', mime: ct || 'application/octet-stream' }
}

// A bucket exists when both <name>.files and <name>.chunks collections exist.
export async function listBuckets(client, dbName) {
  const cols = await client.db(dbName).listCollections({}, { nameOnly: true }).toArray()
  const names = new Set(cols.map((c) => c.name))
  return [...names]
    .filter((n) => n.endsWith('.files') && names.has(n.slice(0, -'.files'.length) + '.chunks'))
    .map((n) => n.slice(0, -'.files'.length))
    .sort()
}

export async function listFiles(client, { dbName, bucketName, search = '', skip = 0, limit = 50 }) {
  const filesCol = client.db(dbName).collection(`${bucketName}.files`)
  const filter = search
    ? { filename: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
    : {}
  const [files, totalCount, stats] = await Promise.all([
    filesCol.find(filter).sort({ uploadDate: -1 }).skip(skip).limit(limit).toArray(),
    filesCol.countDocuments(filter),
    filesCol
      .aggregate([{ $group: { _id: null, totalSize: { $sum: '$length' }, count: { $sum: 1 } } }])
      .toArray()
  ])
  return {
    files: files.map((f) => ({
      id: EJSON.stringify(f._id, { relaxed: false }),
      displayId: f._id?.toHexString ? f._id.toHexString() : String(f._id),
      filename: f.filename,
      length: f.length,
      chunkSize: f.chunkSize,
      uploadDate: f.uploadDate ? f.uploadDate.toISOString() : null,
      contentType: f.contentType || f.metadata?.contentType || null,
      metadata: f.metadata ? EJSON.stringify(f.metadata, null, 2) : null
    })),
    totalCount,
    bucketSize: stats[0]?.totalSize || 0,
    bucketCount: stats[0]?.count || 0
  }
}

// Emits throttled progress events while bytes flow through.
const progressTap = (total, onProgress) => {
  let done = 0
  let last = 0
  return new Transform({
    transform(chunk, _, cb) {
      done += chunk.length
      const now = Date.now()
      if (now - last > 150 || done === total) {
        last = now
        onProgress?.(done, total)
      }
      cb(null, chunk)
    }
  })
}

export async function uploadFile(
  client,
  { dbName, bucketName, filePath, filename, onProgress, registerStream }
) {
  const bucket = getBucket(client, dbName, bucketName)
  const total = fs.statSync(filePath).size
  const name = filename || path.basename(filePath)
  // The GridFS spec deprecates top-level contentType; store it in metadata instead.
  const { mime } = detectKind({ filename: name })
  const options = mime !== 'application/octet-stream' ? { metadata: { contentType: mime } } : {}
  const readStream = fs.createReadStream(filePath)
  const uploadStream = bucket.openUploadStream(name, options)
  registerStream?.({ stream: readStream, writeStream: uploadStream })
  try {
    await pipeline(readStream, progressTap(total, onProgress), uploadStream)
  } catch (err) {
    // Remove chunks already written so a cancelled/failed upload leaves no orphan.
    await uploadStream.abort().catch(() => {})
    throw err
  }
  return { id: EJSON.stringify(uploadStream.id, { relaxed: false }) }
}

export async function downloadFile(
  client,
  { dbName, bucketName, fileId, targetPath, onProgress, registerStream }
) {
  const bucket = getBucket(client, dbName, bucketName)
  const id = parseId(fileId)
  const [file] = await bucket.find({ _id: id }).limit(1).toArray()
  if (!file) throw new Error('File not found')
  const downloadStream = bucket.openDownloadStream(id)
  const writeStream = fs.createWriteStream(targetPath)
  registerStream?.({ stream: downloadStream, writeStream })
  try {
    await pipeline(downloadStream, progressTap(file.length, onProgress), writeStream)
  } catch (err) {
    fs.promises.unlink(targetPath).catch(() => {})
    throw err
  }
  return { length: file.length }
}

export async function previewFile(client, { dbName, bucketName, fileId }) {
  const bucket = getBucket(client, dbName, bucketName)
  const id = parseId(fileId)
  const [file] = await bucket.find({ _id: id }).limit(1).toArray()
  if (!file) throw new Error('File not found')
  const { kind, mime } = detectKind(file)
  if (kind === 'binary') return { kind, mime }
  if (kind === 'image' && file.length > PREVIEW_IMAGE_LIMIT) {
    return { kind: 'binary', mime, reason: 'Image is too large to preview' }
  }
  const limit = kind === 'image' ? PREVIEW_IMAGE_LIMIT : PREVIEW_TEXT_LIMIT
  const buffers = []
  let size = 0
  const stream = bucket.openDownloadStream(id, file.length > limit ? { end: limit } : {})
  for await (const chunk of stream) {
    buffers.push(chunk)
    size += chunk.length
  }
  const buf = Buffer.concat(buffers, size)
  if (kind === 'image')
    return { kind, mime, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
  return { kind, mime, text: buf.toString('utf-8'), truncated: file.length > limit }
}

export async function deleteFile(client, { dbName, bucketName, fileId }) {
  await getBucket(client, dbName, bucketName).delete(parseId(fileId))
}

export async function renameFile(client, { dbName, bucketName, fileId, newName }) {
  await getBucket(client, dbName, bucketName).rename(parseId(fileId), newName)
}

export async function dropBucket(client, { dbName, bucketName }) {
  await getBucket(client, dbName, bucketName).drop()
}
