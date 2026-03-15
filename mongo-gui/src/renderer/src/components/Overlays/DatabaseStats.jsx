import { useState, useEffect } from 'react'
import { X, RefreshCw } from 'lucide-react'

export default function DatabaseStats({ connId, dbName, onClose }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = async () => {
    setLoading(true)
    const res = await window.electron.ipcRenderer.invoke('db:dbStats', { connId, dbName })
    if (res.ok) setStats(res.stats)
    setLoading(false)
  }

  useEffect(() => {
    fetchStats()
  }, [connId, dbName])

  const formatSize = (bytes) => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-bg-secondary border border-border rounded-lg shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
        <div className="px-4 py-3 bg-bg-tertiary border-b border-border flex justify-between items-center">
          <h3 className="font-semibold text-sm">Database Statistics: {dbName}</h3>
          <div className="flex items-center gap-2">
            <button onClick={fetchStats} className="text-text-secondary hover:text-white" title="Refresh">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="text-text-secondary hover:text-white">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-auto flex-1">
          {loading && !stats ? (
            <div className="flex justify-center p-8 text-accent animate-pulse font-medium">Fetching stats...</div>
          ) : !stats ? (
            <div className="text-red-400 p-4 text-center">Failed to load statistics.</div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {Object.entries(stats)
                .filter(([key]) => !['ok', '$clusterTime', 'operationTime', '$gleStats'].includes(key))
                .map(([key, value]) => {
                  let display
                  if (typeof value === 'number' && key.toLowerCase().includes('size')) {
                    display = formatSize(value)
                  } else if (typeof value === 'object' && value !== null) {
                    display = JSON.stringify(value)
                  } else {
                    display = String(value)
                  }
                  return (
                    <div key={key} className="flex justify-between py-2 border-b border-border/50 text-xs">
                      <span className="text-text-secondary font-medium">{key}</span>
                      <span className="text-text-primary font-mono bg-bg-tertiary px-1.5 py-0.5 rounded max-w-[60%] text-right break-all">
                        {display}
                      </span>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
