import { useState, useEffect } from 'react'
import ConnectionDialog from '../ConnectionDialog'
import { useConnectionStore } from '../../store/connectionStore'

export default function ConnectionManager({ isOpen, onClose }) {
  if (!isOpen) return null

  const { 
    connections, 
    selectedId, 
    selectConnection, 
    loadConnections,
    removeConnection,
    cloneConnection 
  } = useConnectionStore()

  useEffect(() => {
    if (isOpen) loadConnections()
  }, [isOpen])

  const [showDialog, setShowDialog] = useState(false)
  const [editConn, setEditConn] = useState(null)

  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bg-secondary border border-border rounded-lg shadow-2xl w-[600px] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary flex justify-between items-center">
          <h2 className="text-sm font-semibold text-text-primary">MongoDB Connections</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-white">✕</button>
        </div>

        <div className="px-4 py-2 flex gap-2 border-b border-border bg-bg-secondary">
          <button 
            onClick={() => { setEditConn(null); setShowDialog(true) }}
            className="text-xs px-2 py-1 hover:bg-bg-tertiary border border-border rounded"
          >
            Create
          </button>
          <button 
            onClick={() => {
              const conn = connections.find(c => c.id === selectedId)
              setEditConn(conn)
              setShowDialog(true)
            }}
            disabled={!selectedId}
            className="text-xs px-2 py-1 hover:bg-bg-tertiary border border-border rounded disabled:opacity-50"
          >
            Edit
          </button>
          <button 
            onClick={() => {
              if(confirm('Are you sure you want to remove this connection?')) removeConnection(selectedId)
            }}
            disabled={!selectedId}
            className="text-xs px-2 py-1 hover:bg-bg-tertiary border border-border rounded disabled:opacity-50"
          >
            Remove
          </button>
          <button 
            onClick={() => cloneConnection(selectedId)}
            disabled={!selectedId}
            className="text-xs px-2 py-1 hover:bg-bg-tertiary border border-border rounded disabled:opacity-50"
          >
            Clone
          </button>
        </div>

        {/* List Connections */}
        <div className="flex-1 min-h-[300px] max-h-[500px] overflow-auto bg-bg-primary p-2">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="text-xs text-text-secondary border-b border-border">
              <tr>
                <th className="pb-2 font-medium w-1/3">Name</th>
                <th className="pb-2 font-medium w-1/3">Address</th>
                <th className="pb-2 font-medium">Attributes</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((conn) => (
                <tr 
                  key={conn.id}
                  onClick={() => selectConnection(conn.id)}
                  onDoubleClick={() => {
                    setEditConn(conn)
                    setShowDialog(true)
                  }}
                  className={`cursor-pointer cursor-default ${
                    selectedId === conn.id ? 'bg-accent/20 text-white' : 'hover:bg-bg-tertiary text-text-primary'
                  }`}
                >
                  <td className="py-2 flex items-center gap-2">
                    {selectedId === conn.id && <span className="w-2 h-2 rounded-full bg-accent inline-block"></span>}
                    {conn.name}
                  </td>
                  <td className="py-2 text-text-secondary">{conn.host}</td>
                  <td className="py-2">
                    {conn.hasSsh && (
                      <span className="text-[10px] bg-bg-tertiary border border-border px-1.5 py-0.5 rounded text-text-secondary">
                        SSH
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {connections.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-8 text-text-secondary italic">
                    No connections found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer (Connect) */}
        <div className="px-4 py-3 border-t border-border bg-bg-secondary flex justify-end gap-3">
          <button onClick={onClose} className="text-sm px-4 py-1.5 hover:bg-bg-tertiary border border-border rounded text-text-primary transition-colors">
            Cancel
          </button>
          <button className="text-sm px-4 py-1.5 bg-accent text-white rounded hover:bg-accent-hover transition-colors font-medium">
            Connect
          </button>
        </div>
        
        {/* Child Modals */}
        <ConnectionDialog 
          isOpen={showDialog}
          connection={editConn}
          onClose={() => { setShowDialog(false); setEditConn(null); }}
        />
      </div>
    </div>
  )
}
