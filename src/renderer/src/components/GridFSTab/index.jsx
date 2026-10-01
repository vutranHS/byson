/* eslint-disable react/prop-types */
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  HardDrive,
  Upload,
  Download,
  Trash2,
  Edit3,
  RefreshCw,
  Search,
  Eye,
  X,
  Loader2,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  File as FileIcon
} from 'lucide-react'

const PAGE_SIZE = 50

const invoke = (channel, payload) => window.electron.ipcRenderer.invoke(channel, payload)

const formatSize = (bytes) => {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const fileIcon = (f) => {
  const ct = f.contentType || ''
  if (ct.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(f.filename || ''))
    return <ImageIcon size={13} className="text-purple-400" />
  if (ct.startsWith('text/') || /\.(txt|md|json|csv|log|xml)$/i.test(f.filename || ''))
    return <FileText size={13} className="text-blue-400" />
  return <FileIcon size={13} className="text-text-secondary" />
}

export default function GridFSTab({ tab }) {
  const { connId, dbName } = tab
  const [buckets, setBuckets] = useState(null)
  const [bucket, setBucket] = useState(tab.bucketName || null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [skip, setSkip] = useState(0)
  const [preview, setPreview] = useState(null)
  const [nameDialog, setNameDialog] = useState(null) // { title, defaultValue, onConfirm }
  const [transfer, setTransfer] = useState(null) // { operationId, label, transferred, total }
  const transferRef = useRef(null)

  const loadBuckets = useCallback(async () => {
    const res = await invoke('db:gridfsListBuckets', { connId, dbName })
    if (!res.ok) return setError(res.error)
    setBuckets(res.buckets)
    setBucket((cur) => cur || res.buckets[0] || 'fs')
  }, [connId, dbName])

  const loadFiles = useCallback(async () => {
    if (!bucket) return
    setLoading(true)
    setError(null)
    const res = await invoke('db:gridfsListFiles', {
      connId,
      dbName,
      bucketName: bucket,
      search: appliedSearch,
      skip,
      limit: PAGE_SIZE
    })
    setLoading(false)
    if (res.ok) setData(res)
    else setError(res.error)
  }, [connId, dbName, bucket, appliedSearch, skip])

  // Fetching from the main process on mount / when the bucket or page changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBuckets()
  }, [loadBuckets])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFiles()
  }, [loadFiles])

  useEffect(() => {
    const unsubscribe = window.electron.ipcRenderer.on('db:gridfsProgress', (_, p) => {
      if (transferRef.current?.operationId !== p.operationId) return
      setTransfer((t) => (t ? { ...t, transferred: p.transferred, total: p.total } : t))
    })
    return () => unsubscribe && unsubscribe()
  }, [])

  const runTransfer = async (channel, label, params) => {
    const operationId = `gridfs-${Date.now()}`
    const t = { operationId, label, transferred: 0, total: 0 }
    transferRef.current = t
    setTransfer(t)
    const res = await invoke(channel, {
      operationId,
      connId,
      dbName,
      bucketName: bucket,
      ...params
    })
    transferRef.current = null
    setTransfer(null)
    if (!res.ok) setError(res.error)
    return res
  }

  const handleUpload = async () => {
    const filePath = await invoke('shell:openFile', { title: 'Upload file to GridFS' })
    if (!filePath) return
    setNameDialog({
      title: 'Store file in GridFS as',
      defaultValue: filePath.split(/[\\/]/).pop(),
      onConfirm: async (filename) => {
        const res = await runTransfer('db:gridfsUpload', `Uploading ${filename}`, {
          filePath,
          filename
        })
        if (res.ok) {
          if (!buckets?.includes(bucket)) loadBuckets()
          loadFiles()
        }
      }
    })
  }

  const handleDownload = async (f) => {
    const targetPath = await invoke('shell:saveFile', {
      title: 'Save GridFS file',
      defaultPath: f.filename
    })
    if (!targetPath) return
    await runTransfer('db:gridfsDownload', `Downloading ${f.filename}`, {
      fileId: f.id,
      targetPath
    })
  }

  const handleCancel = () => {
    if (transfer) invoke('db:abortOperation', { operationId: transfer.operationId })
  }

  const handleDelete = async (f) => {
    if (!window.confirm(`Delete "${f.filename}" from bucket "${bucket}"? This cannot be undone.`))
      return
    const res = await invoke('db:gridfsDelete', {
      connId,
      dbName,
      bucketName: bucket,
      fileId: f.id
    })
    if (res.ok) loadFiles()
    else setError(res.error)
  }

  const handleRename = async (f) => {
    setNameDialog({
      title: `Rename "${f.filename}"`,
      defaultValue: f.filename,
      onConfirm: async (newName) => {
        if (newName === f.filename) return
        const res = await invoke('db:gridfsRename', {
          connId,
          dbName,
          bucketName: bucket,
          fileId: f.id,
          newName
        })
        if (res.ok) loadFiles()
        else setError(res.error)
      }
    })
  }

  const handleDropBucket = async () => {
    if (!window.confirm(`Drop the entire GridFS bucket "${bucket}" and all of its files?`)) return
    const res = await invoke('db:gridfsDropBucket', { connId, dbName, bucketName: bucket })
    if (!res.ok) return setError(res.error)
    setBucket(null)
    setData(null)
    loadBuckets()
  }

  const handlePreview = async (f) => {
    setPreview({ file: f, loading: true })
    const res = await invoke('db:gridfsPreview', {
      connId,
      dbName,
      bucketName: bucket,
      fileId: f.id
    })
    setPreview({ file: f, loading: false, ...res })
  }

  const applySearch = () => {
    setSkip(0)
    setAppliedSearch(search.trim())
  }

  const total = data?.totalCount || 0
  const percent = transfer?.total ? Math.round((transfer.transferred / transfer.total) * 100) : 0

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg-primary text-text-primary">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-secondary text-xs">
        <HardDrive size={14} className="text-accent" />
        <span className="font-medium">GridFS</span>
        <span className="text-text-secondary">{dbName}</span>
        <select
          value={bucket || ''}
          onChange={(e) => {
            setSkip(0)
            setBucket(e.target.value)
          }}
          className="ml-2 bg-bg-tertiary border border-border rounded px-2 py-1 text-xs"
        >
          {(buckets && buckets.length ? buckets : [bucket || 'fs']).map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 ml-2 bg-bg-tertiary border border-border rounded px-2">
          <Search size={12} className="text-text-secondary" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            placeholder="Filter by filename…"
            className="bg-transparent py-1 outline-none text-xs w-48"
          />
        </div>
        <div className="flex-1" />
        <button
          onClick={handleUpload}
          disabled={!!transfer}
          className="flex items-center gap-1 px-2 py-1 rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
        >
          <Upload size={12} /> Upload
        </button>
        <button onClick={loadFiles} className="p-1.5 rounded hover:bg-bg-tertiary" title="Refresh">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        {buckets?.includes(bucket) && (
          <button
            onClick={handleDropBucket}
            className="p-1.5 rounded hover:bg-red-500 hover:text-white text-red-400"
            title="Drop bucket"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {transfer && (
        <div className="flex items-center gap-3 px-3 py-2 border-b border-border text-xs bg-bg-secondary">
          <Loader2 size={13} className="animate-spin text-accent" />
          <span className="truncate">{transfer.label}</span>
          <div className="flex-1 h-1.5 bg-bg-tertiary rounded overflow-hidden">
            <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-text-secondary w-40 text-right">
            {formatSize(transfer.transferred)} / {formatSize(transfer.total)} ({percent}%)
          </span>
          <button onClick={handleCancel} className="text-red-400 hover:underline">
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-400 border-b border-border">
          <AlertCircle size={13} /> {error}
          <button onClick={() => setError(null)} className="ml-auto opacity-60 hover:opacity-100">
            <X size={12} />
          </button>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {data && data.files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-secondary text-sm gap-2">
            <HardDrive size={28} className="opacity-40" />
            {appliedSearch ? 'No files match this filter.' : `Bucket "${bucket}" has no files.`}
            {!appliedSearch && (
              <button onClick={handleUpload} className="text-accent hover:underline text-xs">
                Upload a file
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-bg-secondary text-text-secondary">
              <tr className="text-left">
                <th className="px-3 py-1.5 font-medium">Filename</th>
                <th className="px-3 py-1.5 font-medium">Size</th>
                <th className="px-3 py-1.5 font-medium">Content type</th>
                <th className="px-3 py-1.5 font-medium">Uploaded</th>
                <th className="px-3 py-1.5 font-medium">_id</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {data?.files.map((f) => (
                <tr
                  key={f.id}
                  onDoubleClick={() => handlePreview(f)}
                  className="border-b border-border/50 hover:bg-bg-tertiary group"
                >
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      {fileIcon(f)}
                      <span className="truncate max-w-[320px]" title={f.filename}>
                        {f.filename}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{formatSize(f.length)}</td>
                  <td className="px-3 py-1.5 text-text-secondary">{f.contentType || '—'}</td>
                  <td className="px-3 py-1.5 text-text-secondary whitespace-nowrap">
                    {f.uploadDate ? new Date(f.uploadDate).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-text-secondary">
                    {f.displayId}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1 justify-end opacity-60 group-hover:opacity-100">
                      <IconBtn title="Preview" onClick={() => handlePreview(f)} icon={Eye} />
                      <IconBtn
                        title="Download"
                        onClick={() => handleDownload(f)}
                        icon={Download}
                        disabled={!!transfer}
                      />
                      <IconBtn title="Rename" onClick={() => handleRename(f)} icon={Edit3} />
                      <IconBtn
                        title="Delete"
                        onClick={() => handleDelete(f)}
                        icon={Trash2}
                        danger
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border bg-bg-secondary text-[11px] text-text-secondary">
        {data && (
          <span>
            {data.bucketCount} files · {formatSize(data.bucketSize)} total
          </span>
        )}
        <div className="flex-1" />
        {total > 0 && (
          <>
            <span>
              {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} of {total}
            </span>
            <button
              disabled={skip === 0}
              onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
              className="px-2 py-0.5 rounded hover:bg-bg-tertiary disabled:opacity-40"
            >
              ‹ Prev
            </button>
            <button
              disabled={skip + PAGE_SIZE >= total}
              onClick={() => setSkip(skip + PAGE_SIZE)}
              className="px-2 py-0.5 rounded hover:bg-bg-tertiary disabled:opacity-40"
            >
              Next ›
            </button>
          </>
        )}
      </div>

      {nameDialog && (
        <NameDialog
          {...nameDialog}
          onClose={() => setNameDialog(null)}
          onConfirm={(name) => {
            setNameDialog(null)
            nameDialog.onConfirm(name)
          }}
        />
      )}

      {preview && (
        <PreviewModal
          preview={preview}
          onClose={() => setPreview(null)}
          onDownload={handleDownload}
        />
      )}
    </div>
  )
}

function NameDialog({ title, defaultValue, onConfirm, onClose }) {
  const [value, setValue] = useState(defaultValue || '')
  const submit = () => value.trim() && onConfirm(value.trim())
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary border border-border rounded-lg shadow-xl w-[420px] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-medium mb-3">{title}</div>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onClose()
          }}
          className="w-full bg-bg-tertiary border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
        <div className="flex justify-end gap-2 mt-4 text-xs">
          <button onClick={onClose} className="px-3 py-1.5 rounded hover:bg-bg-tertiary">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!value.trim()}
            className="px-3 py-1.5 rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

function IconBtn({ icon: Icon, title, onClick, danger, disabled }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`p-1 rounded disabled:opacity-40 ${danger ? 'hover:bg-red-500 hover:text-white text-red-400' : 'hover:bg-bg-hover'}`}
    >
      <Icon size={13} />
    </button>
  )
}

function PreviewModal({ preview, onClose, onDownload }) {
  const { file } = preview
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-8"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary border border-border rounded-lg shadow-xl w-full max-w-4xl max-h-full flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border text-sm">
          {fileIcon(file)}
          <span className="font-medium truncate">{file.filename}</span>
          <span className="text-xs text-text-secondary">{formatSize(file.length)}</span>
          <div className="flex-1" />
          <button
            onClick={() => onDownload(file)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-bg-tertiary"
          >
            <Download size={12} /> Download
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-tertiary">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 min-h-[200px]">
          {preview.loading ? (
            <div className="flex items-center justify-center h-40 text-text-secondary text-sm">
              <Loader2 size={16} className="animate-spin mr-2" /> Loading preview…
            </div>
          ) : preview.ok === false ? (
            <div className="text-red-400 text-sm">{preview.error}</div>
          ) : preview.kind === 'image' ? (
            <img src={preview.dataUrl} alt={file.filename} className="max-w-full mx-auto" />
          ) : preview.kind === 'text' ? (
            <>
              <pre className="text-xs font-mono whitespace-pre-wrap break-all">{preview.text}</pre>
              {preview.truncated && (
                <div className="mt-2 text-xs text-text-secondary italic">
                  Preview truncated — download the file to see all of it.
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-text-secondary text-center py-10">
              {preview.reason || 'No preview available for this file type.'}
              <div className="text-xs mt-1">{preview.mime}</div>
            </div>
          )}
          {file.metadata && !preview.loading && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="text-xs font-medium mb-1 text-text-secondary">metadata</div>
              <pre className="text-xs font-mono bg-bg-tertiary rounded p-2 overflow-auto">
                {file.metadata}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
