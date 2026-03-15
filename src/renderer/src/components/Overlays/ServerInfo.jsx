import { useState, useEffect } from 'react'
import { X, RefreshCw, Cpu, Activity } from 'lucide-react'

export default function ServerInfo({ connId, type, onClose }) {
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    setLoading(true)
    const channel = type === 'status' ? 'db:serverStatus' : 'db:hostInfo'
    const res = await window.electron.ipcRenderer.invoke(channel, { connId })
    if (res.ok) setInfo(type === 'status' ? res.status : res.info)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [connId, type])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-xs">
      <div className="bg-bg-secondary border border-border rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-4 py-3 bg-bg-tertiary border-b border-border flex justify-between items-center">
          <div className="flex items-center gap-2">
            {type === 'status' ? <Activity size={16} className="text-orange-400" /> : <Cpu size={16} className="text-blue-400" />}
            <h3 className="font-semibold text-sm">{type === 'status' ? 'Server Status' : 'Host Information'}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchData} className="text-text-secondary hover:text-white" title="Refresh">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="text-text-secondary hover:text-white">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 bg-bg-primary/50 font-mono">
          {loading && !info ? (
            <div className="flex justify-center p-8 text-accent animate-pulse font-medium">Fetching details...</div>
          ) : !info ? (
            <div className="text-red-400 p-4 text-center">Failed to load information.</div>
          ) : (
            <pre className="text-[11px] leading-relaxed opacity-90 whitespace-pre-wrap">
              {JSON.stringify(info, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
