/* eslint-disable react/prop-types */
import { useState, useEffect } from 'react'
import {
  RefreshCw,
  Play,
  Pause,
  Square,
  AlertTriangle,
  CheckCircle2,
  Database,
  ArrowRight
} from 'lucide-react'
import { useConnectionStore } from '../../store/connectionStore'
import { useSettingsStore } from '../../store/settingsStore'

export default function CloneTab({ tab }) {
  const { connections } = useConnectionStore()
  const isLight = useSettingsStore((state) => state.theme) === 'light'

  // Target Configuration
  const [targetConnId, setTargetConnId] = useState(tab.connId)
  const [targetDb, setTargetDb] = useState(tab.dbName)
  const [targetCol, setTargetCol] = useState(tab.collectionName + '_sync')

  // Options
  const [options, setOptions] = useState({
    createIfNotExists: true,
    dropTarget: false,
    batchSize: 5000,
    parallelThreads: 5
  })

  // Sync State
  const [status, setStatus] = useState('idle') // idle, running, paused, completed, error
  const [progress, setProgress] = useState(null)
  const [logs, setLogs] = useState([])
  const [operationId, setOperationId] = useState(null)

  const addLog = (msg, type = 'info') => {
    setLogs((prev) => [...prev, { time: new Date().toLocaleTimeString(), msg, type }])
  }

  useEffect(() => {
    if (!window.electron) return

    const handleProgress = (event, data) => {
      if (data.operationId !== operationId) return

      if (data.phase === 'error') {
        setStatus('error')
        addLog(`Error: ${data.error}`, 'error')
      } else if (data.phase === 'abort' || data.stopped) {
        setStatus('idle')
        addLog('Clone aborted manually.', 'warning')
      } else if (data.phase === 'pause' || data.paused) {
        setStatus('paused')
        addLog('Clone paused.', 'warning')
      } else if (data.completed) {
        setStatus('completed')
        addLog('Clone completed successfully!', 'success')
      } else {
        if (data.status) {
          addLog(data.status, 'info')
        }
        if (data.processed !== undefined && data.total !== undefined) {
          setProgress({ processed: data.processed, total: data.total })
        }
      }
    }

    const unsubscribe = window.electron.ipcRenderer.on('db:syncProgress', handleProgress)
    return () => {
      unsubscribe()
    }
  }, [operationId])

  const handleStart = async () => {
    if (!targetConnId || !targetDb || (tab.collectionName && !targetCol)) {
      alert('Please fill in all target details.')
      return
    }

    if (
      options.dropTarget &&
      !window.confirm(
        `WARNING: This will drop the target ${tab.collectionName ? 'collection' : 'database'} before cloning! Are you sure?`
      )
    ) {
      return
    }

    const newOpId = crypto.randomUUID()
    setOperationId(newOpId)
    setStatus('running')
    setProgress(null)
    setLogs([])
    addLog(`Starting clone job: ${newOpId}`, 'info')

    try {
      const res = await window.electron.ipcRenderer.invoke('db:startSync', {
        operationId: newOpId,
        sourceConnId: tab.connId,
        targetConnId: targetConnId,
        sourceDb: tab.dbName,
        sourceCollection: tab.collectionName,
        targetDb,
        targetCollection: targetCol,
        options
      })

      if (!res.ok) {
        setStatus('error')
        addLog(`Failed to start clone: ${res.error}`, 'error')
      }
    } catch (err) {
      setStatus('error')
      addLog(err.message, 'error')
    }
  }

  const handlePause = async () => {
    if (!operationId) return
    await window.electron.ipcRenderer.invoke('db:pauseSync', operationId)
  }

  const handleResume = async () => {
    if (!operationId) return
    setStatus('running')
    addLog('Resuming clone...', 'info')
    await window.electron.ipcRenderer.invoke('db:resumeSync', {
      operationId,
      sourceConnId: tab.connId,
      targetConnId: targetConnId,
      sourceDb: tab.dbName,
      sourceCollection: tab.collectionName,
      targetDb,
      targetCollection: targetCol
    })
  }

  const handleStop = async () => {
    if (!operationId) return
    if (!window.confirm('Are you sure you want to stop the clone operation?')) return
    await window.electron.ipcRenderer.invoke('db:stopSync', operationId)
  }

  const sourceConn = connections.find((c) => c.id === tab.connId)

  return (
    <div className="flex flex-col h-full bg-bg-secondary w-full text-sm">
      {/* Header */}
      <div className="h-12 shrink-0 border-b border-border px-4 py-2 flex items-center bg-bg-primary">
        <RefreshCw size={18} className="text-blue-500 mr-2" />
        <h2 className="font-semibold text-text-primary text-base">
          {tab.collectionName ? 'Collection Clone' : 'Database Clone'}
        </h2>
      </div>

      <div className="flex-1 overflow-auto p-6 text-text-primary">
        <div className="grid grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Source Section */}
          <div className="bg-bg-primary rounded border border-border p-4 shadow-sm flex flex-col gap-3">
            <h3 className="font-semibold text-text-secondary uppercase tracking-widest text-[11px] mb-1">
              Source
            </h3>
            <div>
              <label className="text-xs text-text-secondary block mb-1">Connection</label>
              <div className="bg-bg-tertiary px-3 py-1.5 rounded opacity-70 border border-transparent font-medium flex items-center gap-2">
                <Database size={14} className="text-accent" />
                {sourceConn ? sourceConn.name : 'Unknown'}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1">Database</label>
              <div className="bg-bg-tertiary px-3 py-1.5 rounded opacity-70 border border-transparent font-medium">
                {tab.dbName}
              </div>
            </div>
            {tab.collectionName && (
              <div>
                <label className="text-xs text-text-secondary block mb-1">Collection</label>
                <div className="bg-bg-tertiary px-3 py-1.5 rounded opacity-70 border border-transparent font-medium text-green-400">
                  {tab.collectionName}
                </div>
              </div>
            )}
          </div>

          {/* Target Section */}
          <div className="bg-bg-primary rounded border border-border p-4 shadow-sm flex flex-col gap-3 relative">
            <div className="absolute left-[-24px] top-1/2 transform -translate-y-1/2 -translate-x-1/2 z-10 bg-bg-secondary p-1 rounded-full border border-border">
              <ArrowRight size={20} className="text-text-secondary" />
            </div>

            <h3 className="font-semibold text-text-secondary uppercase tracking-widest text-[11px] mb-1">
              Target
            </h3>
            <div>
              <label className="text-xs text-text-secondary block mb-1">Connection</label>
              <select
                className="w-full bg-bg-tertiary border border-border px-3 py-1.5 rounded focus:outline-none focus:border-accent"
                value={targetConnId}
                onChange={(e) => setTargetConnId(e.target.value)}
                disabled={status === 'running' || status === 'paused'}
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1">Database</label>
              <input
                type="text"
                className="w-full bg-bg-tertiary border border-border px-3 py-1.5 rounded focus:outline-none focus:border-accent"
                value={targetDb}
                onChange={(e) => setTargetDb(e.target.value)}
                disabled={status === 'running' || status === 'paused'}
              />
            </div>
            {tab.collectionName && (
              <div>
                <label className="text-xs text-text-secondary block mb-1">Collection</label>
                <input
                  type="text"
                  className="w-full bg-bg-tertiary border border-border px-3 py-1.5 rounded focus:outline-none focus:border-accent"
                  value={targetCol}
                  onChange={(e) => setTargetCol(e.target.value)}
                  disabled={status === 'running' || status === 'paused'}
                />
              </div>
            )}
          </div>
        </div>

        {/* Sync Options */}
        <div className="mt-8 max-w-5xl mx-auto bg-bg-primary rounded border border-border p-4 shadow-sm flex flex-col gap-3">
          <h3 className="font-semibold text-text-secondary uppercase tracking-widest text-[11px]">
            Clone Options
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2 text-text-primary text-sm cursor-pointer hover:bg-bg-tertiary p-2 rounded w-fit">
              <input
                type="checkbox"
                checked={options.createIfNotExists}
                onChange={(e) => setOptions({ ...options, createIfNotExists: e.target.checked })}
                disabled={status === 'running' || status === 'paused'}
                className="accent-accent"
              />
              Create Collection / Copy Indexes if not exists
            </label>
            <label className="flex items-center gap-2 text-red-400 text-sm cursor-pointer hover:bg-red-500/10 p-2 rounded w-fit transition-colors">
              <input
                type="checkbox"
                checked={options.dropTarget}
                onChange={(e) => setOptions({ ...options, dropTarget: e.target.checked })}
                disabled={status === 'running' || status === 'paused'}
                className="accent-red-500"
              />
              Drop target collection before clone
            </label>
            <label className="flex items-center gap-2 text-green-400 text-sm cursor-pointer hover:bg-green-500/10 p-2 rounded w-fit transition-colors col-span-2">
              <input
                type="checkbox"
                checked={options.useNativeTools}
                onChange={(e) => setOptions({ ...options, useNativeTools: e.target.checked })}
                disabled={status === 'running' || status === 'paused'}
                className="accent-green-500"
              />
              Use Native BSON Pipes (mongodump/mongorestore - Fastest, no firewall restrictions)
            </label>
          </div>
        </div>

        {/* Progress & Logs Section */}
        <div className="mt-8 max-w-5xl mx-auto bg-bg-primary rounded border border-border shadow-sm flex flex-col overflow-hidden h-[240px]">
          {/* Header Controls */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-tertiary">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-text-secondary uppercase tracking-widest text-[11px]">
                Execution Status
              </h3>
              {status === 'running' && (
                <span className="flex items-center gap-1.5 text-xs text-blue-400 font-medium px-2 py-0.5 bg-blue-500/10 rounded-full animate-pulse">
                  <RefreshCw size={11} className="animate-spin" /> In Progress
                </span>
              )}
              {status === 'paused' && (
                <span className="flex items-center gap-1.5 text-xs text-yellow-500 font-medium px-2 py-0.5 bg-yellow-500/10 rounded-full">
                  <Pause size={11} /> Paused
                </span>
              )}
              {status === 'completed' && (
                <span className="flex items-center gap-1.5 text-xs text-green-500 font-medium px-2 py-0.5 bg-green-500/10 rounded-full">
                  <CheckCircle2 size={11} /> Completed
                </span>
              )}
              {status === 'error' && (
                <span className="flex items-center gap-1.5 text-xs text-red-500 font-medium px-2 py-0.5 bg-red-500/10 rounded-full">
                  <AlertTriangle size={11} /> Failed
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {status === 'idle' || status === 'completed' || status === 'error' ? (
                <button
                  onClick={handleStart}
                  className="flex items-center gap-2 bg-accent hover:bg-accent/80 text-white px-4 py-1.5 rounded transition-colors font-medium text-xs shadow-sm"
                >
                  <Play size={13} /> {status === 'completed' ? 'Run Again' : 'Start Clone'}
                </button>
              ) : null}

              {status === 'running' && (
                <button
                  onClick={handlePause}
                  className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-1.5 rounded transition-colors font-medium text-xs shadow-sm"
                >
                  <Pause size={13} /> Pause
                </button>
              )}

              {status === 'paused' && (
                <button
                  onClick={handleResume}
                  className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-1.5 rounded transition-colors font-medium text-xs shadow-sm"
                >
                  <Play size={13} /> Resume
                </button>
              )}

              {(status === 'running' || status === 'paused') && (
                <button
                  onClick={handleStop}
                  className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded transition-colors font-medium text-xs shadow-sm"
                >
                  <Square size={13} fill="currentColor" /> Stop
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          {progress && (
            <div className="px-4 py-3 border-b border-border bg-bg-secondary">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-text-primary font-medium">Syncing Documents</span>
                <span className="text-text-secondary font-mono">
                  {progress.processed.toLocaleString()} / {progress.total.toLocaleString()}
                </span>
              </div>
              <div className="w-full bg-bg-tertiary rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-accent h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.max(0, (progress.processed / progress.total) * 100))}%`
                  }}
                ></div>
              </div>
            </div>
          )}

          {/* Logs */}
          <div
            className={`flex-1 overflow-auto p-2 font-mono text-[11px] leading-relaxed ${isLight ? 'bg-bg-tertiary' : 'bg-[#1e1e1e]'}`}
          >
            {logs.length === 0 ? (
              <span className="text-text-secondary px-2 italic">Awaiting operation...</span>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  className={`flex gap-2 px-2 py-0.5 rounded ${isLight ? 'hover:bg-black/5' : 'hover:bg-white/5'}`}
                >
                  <span className="text-text-secondary shrink-0">[{log.time}]</span>
                  <span
                    className={`${
                      log.type === 'error'
                        ? isLight
                          ? 'text-red-600'
                          : 'text-red-400'
                        : log.type === 'success'
                          ? isLight
                            ? 'text-green-600'
                            : 'text-green-400'
                          : log.type === 'warning'
                            ? isLight
                              ? 'text-yellow-600'
                              : 'text-yellow-400'
                            : isLight
                              ? 'text-text-primary'
                              : 'text-gray-300'
                    }`}
                  >
                    {log.msg}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
