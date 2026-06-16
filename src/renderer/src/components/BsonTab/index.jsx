import React, { useState, useEffect } from 'react'
import { 
  Download, 
  Database, 
  Archive, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Terminal,
  RefreshCw
} from 'lucide-react'

const BsonTab = ({ tab }) => {
  const { connId, dbName, collectionName } = tab
  const [toolsStatus, setToolsStatus] = useState({ loading: true, exists: false })
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState({ phase: '', percent: 0 })
  const [error, setError] = useState(null)

  // Operation State
  const [opMode, setOpMode] = useState(null) // 'backup' | 'restore'
  const [targetPath, setTargetPath] = useState('')
  const [options, setOptions] = useState({ gzip: true, drop: false })
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState([])

  useEffect(() => {
    checkTools()

    const unlistenProgress = window.electron.ipcRenderer.on('db:downloadProgress', (e, status) => {
      setProgress({ phase: status.phase, percent: status.progress })
      if (status.phase === 'done') {
        setDownloading(false)
        checkTools()
      }
    })

    const unlistenLogs = window.electron.ipcRenderer.on('db:bsonLog', (e, log) => {
      setLogs(prev => [...prev.slice(-100), {
        time: new Date().toLocaleTimeString(),
        type: log.type,
        message: log.message
      }])
    })

    return () => {
      if (unlistenProgress) unlistenProgress()
      if (unlistenLogs) unlistenLogs()
    }
  }, [])

  const checkTools = async () => {
    setToolsStatus({ loading: true, exists: false })
    const res = await window.electron.ipcRenderer.invoke('db:checkBsonTools')
    setToolsStatus({ loading: false, exists: res.exists, path: res.path })
  }

  const handleDownload = async () => {
    setDownloading(true)
    setError(null)
    const res = await window.electron.ipcRenderer.invoke('db:downloadBsonTools')
    if (!res.ok) {
      setError(res.error)
      setDownloading(false)
    }
  }

  const handleBrowse = async () => {
    if (opMode === 'backup') {
      const path = await window.electron.ipcRenderer.invoke('shell:saveFile', {
        title: 'Save BSON Archive',
        defaultPath: `${collectionName}_${new Date().toISOString().slice(0,10)}.bson${options.gzip ? '.gz' : ''}`,
        filters: [{ name: 'BSON Archive', extensions: ['bson', 'gz', 'archive'] }]
      })
      if (path) setTargetPath(path)
    } else {
      const path = await window.electron.ipcRenderer.invoke('shell:openFile', {
        title: 'Select BSON Archive to Restore',
        filters: [{ name: 'BSON Archive', extensions: ['bson', 'gz', 'archive'] }]
      })
      if (path) setTargetPath(path)
    }
  }

  const handleRun = async () => {
    if (!targetPath) return alert('Please select a file path first')
    
    setRunning(true)
    setLogs([{ time: new Date().toLocaleTimeString(), type: 'info', message: `Starting ${opMode} operation...` }])
    
    const res = await window.electron.ipcRenderer.invoke('db:runBsonCommand', {
      type: opMode,
      connId,
      dbName,
      collectionName,
      targetPath,
      options
    })

    setRunning(false)
    if (res.ok) {
      setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), type: 'success', message: 'Operation completed successfully!' }])
    } else {
      setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), type: 'error', message: `Operation failed: ${res.error}` }])
    }
  }

  if (toolsStatus.loading && !downloading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-primary text-text-secondary">
        <Loader2 className="animate-spin mr-2" size={20} />
        <span className="text-sm">Checking environment...</span>
      </div>
    )
  }

  if (!toolsStatus.exists || downloading) {
    // ... (Keep the download UI as before)
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg-primary p-8 text-center">
        <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mb-6">
          <Archive size={32} className="text-accent" />
        </div>
        
        <h2 className="text-xl font-bold text-text-primary mb-2">
          MongoDB Database Tools Needed
        </h2>
        <p className="text-sm text-text-secondary max-w-md mb-8">
          To perform BSON backup and restore operations, BysonDB needs the official MongoDB Database Tools (mongodump & mongorestore).
        </p>

        {downloading ? (
          <div className="w-full max-w-sm bg-bg-secondary border border-border rounded-xl p-6 shadow-xl">
            <div className="flex justify-between text-xs font-mono text-text-secondary mb-3 uppercase tracking-wider">
              <span>{progress.phase || 'Initializing...'}</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="w-full bg-bg-tertiary h-2 rounded-full overflow-hidden border border-border/50">
              <div 
                className="bg-accent h-full transition-all duration-300 ease-out"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="text-[10px] text-text-secondary mt-4 italic">
              Downloading ~60MB from fastdl.mongodb.org...
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 items-center">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-lg mb-4 flex items-start gap-2 max-w-sm text-left">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <button
              onClick={handleDownload}
              className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-bold flex items-center gap-2 transition-all shadow-lg shadow-accent/20 active:scale-95"
            >
              <Download size={18} /> Download Tools
            </button>
            <p className="text-[10px] text-text-secondary opacity-60">
              Cross-platform binaries will be stored in your local app data folder.
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-bg-primary overflow-hidden p-6 gap-6 scrollbar-premium overflow-y-auto">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent/10 rounded-lg text-accent">
            {opMode === 'restore' ? <RefreshCw size={20} /> : <Archive size={20} />}
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary leading-tight">
              {opMode ? (opMode === 'backup' ? 'BSON Backup' : 'BSON Restore') : 'BSON Backup & Restore'}
            </h2>
            <p className="text-xs text-text-secondary">
              Collection: <span className="text-accent font-medium">{collectionName}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {opMode && (
             <button 
              onClick={() => { setOpMode(null); setTargetPath(''); setLogs([]); }}
              className="text-xs text-text-secondary hover:text-white px-3 py-1.5 hover:bg-bg-tertiary rounded transition-colors"
            >
              Back to selection
            </button>
          )}
          <button 
            onClick={checkTools}
            className="p-2 text-text-secondary hover:bg-bg-tertiary rounded-lg transition-colors"
            title="Refresh Status"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {!opMode ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
          {/* Backup Card */}
          <div 
            onClick={() => setOpMode('backup')}
            className="bg-bg-secondary/40 border border-border rounded-2xl p-6 hover:border-accent/40 cursor-pointer transition-colors group flex flex-col h-full"
          >
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Archive size={20} className="text-blue-400" />
            </div>
            <h3 className="text-sm font-bold text-text-primary mb-2 flex items-center gap-2">
              Backup Collection (mongodump)
            </h3>
            <p className="text-xs text-text-secondary mb-6 flex-1">
              Export the entire collection or specific documents into a high-fidelity BSON archive file.
            </p>
            <div className="w-full py-2 bg-bg-tertiary border border-border rounded-lg text-center text-xs font-semibold text-text-primary">
              Configure Backup
            </div>
          </div>

          {/* Restore Card */}
          <div 
            onClick={() => setOpMode('restore')}
            className="bg-bg-secondary/40 border border-border rounded-2xl p-6 hover:border-green-500/40 cursor-pointer transition-colors group flex flex-col h-full"
          >
            <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <RefreshCw size={20} className="text-green-400" />
            </div>
            <h3 className="text-sm font-bold text-text-primary mb-2 flex items-center gap-2">
              Restore Collection (mongorestore)
            </h3>
            <p className="text-xs text-text-secondary mb-6 flex-1">
              Import data from a BSON backup archive back into this collection.
            </p>
            <div className="w-full py-2 bg-bg-tertiary border border-border rounded-lg text-center text-xs font-semibold text-text-primary">
              Configure Restore
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6 max-w-4xl">
           <div className="bg-bg-secondary/40 border border-border rounded-2xl p-6 flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  {opMode === 'backup' ? 'Destination Archive (.bson)' : 'Source Archive'}
                </label>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={targetPath}
                    readOnly
                    placeholder={opMode === 'backup' ? 'Select where to save...' : 'Select file to restore...'}
                    className="flex-1 bg-bg-primary border border-border rounded-lg px-3 py-2 text-xs text-text-primary outline-none"
                  />
                  <button 
                    onClick={handleBrowse}
                    disabled={running}
                    className="px-4 py-2 bg-bg-tertiary border border-border rounded-lg text-xs font-semibold hover:bg-bg-hover transition-colors disabled:opacity-50"
                  >
                    Browse
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox"
                    checked={options.gzip}
                    onChange={e => setOptions({...options, gzip: e.target.checked})}
                    disabled={running}
                    className="w-4 h-4 accent-accent"
                  />
                  <span className="text-xs text-text-primary group-hover:text-white transition-colors">Use Gzip Compression</span>
                </label>

                {opMode === 'restore' && (
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="checkbox"
                      checked={options.drop}
                      onChange={e => setOptions({...options, drop: e.target.checked})}
                      disabled={running}
                      className="w-4 h-4 accent-red-500"
                    />
                    <span className="text-xs text-text-primary group-hover:text-white transition-colors font-medium">Drop collection before restore</span>
                  </label>
                )}
              </div>

              <button 
                onClick={handleRun}
                disabled={running || !targetPath}
                className={`py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 ${
                  opMode === 'backup' ? 'bg-accent hover:bg-accent-hover text-white' : 'bg-green-600 hover:bg-green-500 text-white'
                }`}
              >
                {running ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Running {opMode === 'backup' ? 'Backup' : 'Restore'}...
                  </>
                ) : (
                  <>
                    {opMode === 'backup' ? <Download size={18} /> : <RefreshCw size={18} />}
                    Start {opMode === 'backup' ? 'Backup' : 'Restore'}
                  </>
                )}
              </button>
           </div>
        </div>
      )}

      {/* Terminal Logs */}
      <div className="flex-1 flex flex-col min-h-[300px] border border-border rounded-xl bg-bg-tertiary/30 overflow-hidden">
        <div className="h-8 bg-bg-tertiary border-b border-border flex items-center px-3 justify-between">
          <div className="flex items-center gap-2">
            <Terminal size={12} className="text-text-secondary" />
            <span className="text-[10px] font-mono text-text-secondary uppercase tracking-widest text-text-primary">Operation Log</span>
          </div>
          <button 
            onClick={() => setLogs([])}
            className="text-[10px] text-text-secondary hover:text-white"
          >
            Clear
          </button>
        </div>
        <div className="flex-1 p-3 font-mono text-[11px] overflow-y-auto scrollbar-premium flex flex-col gap-1">
          {logs.length === 0 ? (
            <div className="text-text-secondary italic">No operations started yet.</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-text-secondary opacity-50 shrink-0">[{log.time}]</span>
                <span className={
                  log.type === 'error' ? 'text-red-400' : 
                  log.type === 'success' ? 'text-green-400' :
                  log.type === 'stderr' ? 'text-yellow-400/80' : 'text-text-primary'
                }>
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default BsonTab
