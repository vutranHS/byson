import { useState, useEffect } from 'react'
import { X, RefreshCw, Trash2, ShieldAlert } from 'lucide-react'

export default function OpsManager({ connId, onClose }) {
  const [ops, setOps] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchOps = async () => {
    setLoading(true)
    const res = await window.electron.ipcRenderer.invoke('db:currentOp', { connId })
    if (res.ok) setOps(res.ops)
    setLoading(false)
  }

  const killOp = async (opId) => {
    if (window.confirm(`Are you sure you want to kill operation ${opId}?`)) {
      const res = await window.electron.ipcRenderer.invoke('db:killOp', { connId, opId })
      if (res.ok) fetchOps()
      else alert(`Failed to kill: ${res.error}`)
    }
  }

  useEffect(() => {
    fetchOps()
  }, [connId])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-bg-secondary border border-border rounded-lg shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-4 py-3 bg-bg-tertiary border-b border-border flex justify-between items-center">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-red-400" />
            <h3 className="font-semibold text-sm text-red-100">Current Operations (Process Manager)</h3>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchOps} className="text-text-secondary hover:text-white" title="Refresh">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="text-text-secondary hover:text-white">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto min-h-0">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-bg-tertiary sticky top-0 border-b border-border">
              <tr>
                <th className="p-3 font-semibold text-text-secondary border-r border-border/30">OpId</th>
                <th className="p-3 font-semibold text-text-secondary border-r border-border/30">Sec</th>
                <th className="p-3 font-semibold text-text-secondary border-r border-border/30">NS</th>
                <th className="p-3 font-semibold text-text-secondary border-r border-border/30">Op</th>
                <th className="p-3 font-semibold text-text-secondary border-r border-border/30">Query</th>
                <th className="p-3 font-semibold text-text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ops.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-text-secondary italic">No operations currently running.</td>
                </tr>
              ) : (
                ops.map((op, i) => (
                  <tr key={op.opid || i} className="border-b border-border/50 hover:bg-bg-tertiary/30">
                    <td className="p-3 border-r border-border/30 font-mono text-accent">{op.opid}</td>
                    <td className="p-3 border-r border-border/30">{op.secs_running || 0}s</td>
                    <td className="p-3 border-r border-border/30 opacity-70 truncate max-w-[120px]" title={op.ns}>{op.ns}</td>
                    <td className="p-3 border-r border-border/30 font-medium">{op.op}</td>
                    <td className="p-3 border-r border-border/30 font-mono opacity-60 truncate max-w-sm" title={JSON.stringify(op.query || op.command)}>
                      {JSON.stringify(op.query || op.command)}
                    </td>
                    <td className="p-3">
                      <button 
                        onClick={() => killOp(op.opid)}
                        className="p-1.5 text-red-500 hover:bg-red-500/10 rounded" 
                        title="Kill Operation"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
