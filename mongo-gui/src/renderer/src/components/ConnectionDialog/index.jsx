import { useState, useRef, useEffect } from 'react'
import { useConnectionStore } from '../../store/connectionStore'

export default function ConnectionDialog({ isOpen, onClose, connection }) {
  const [activeTab, setActiveTab] = useState('connection')
  const { addConnection, updateConnection } = useConnectionStore()

  // Refs for tracking simple form inputs
  const nameRef = useRef(null)
  const hostRef = useRef(null)
  const portRef = useRef(null)
  
  // Reset fields when connection opens/changes
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (nameRef.current) nameRef.current.value = connection?.name || 'New Connection'
        if (hostRef.current) hostRef.current.value = connection?.host?.split(':')[0] || 'localhost'
        if (portRef.current) portRef.current.value = connection?.host?.split(':')[1] || '27017'
      }, 0)
    }
  }, [isOpen, connection])

  const handleSave = () => {
    const name = nameRef.current?.value || 'New Connection'
    const host = `${hostRef.current?.value || 'localhost'}:${portRef.current?.value || '27017'}`
    
    // Auth & SSH sẽ được handle sau -> hiện map tạm mock
    const newConnData = { name, host, hasSsh: false }

    if (connection?.id) {
       updateConnection(connection.id, newConnData)
    } else {
       addConnection(newConnData)
    }
    onClose()
  }

  if (!isOpen) return null

  const tabs = [
    { id: 'connection', label: 'Connection' },
    { id: 'auth', label: 'Authentication' },
    { id: 'ssh', label: 'SSH' },
    { id: 'tls', label: 'TLS' },
    { id: 'advanced', label: 'Advanced' }
  ]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-bg-secondary border border-border rounded-lg shadow-2xl w-[650px] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary flex justify-between items-center">
          <h2 className="text-sm font-semibold text-text-primary">
            {connection ? `Edit: ${connection.name}` : 'New Connection'}
          </h2>
          <button onClick={onClose} className="text-text-secondary hover:text-white">✕</button>
        </div>

        {/* Custom Tab Bar */}
        <div className="flex bg-bg-tertiary border-b border-border px-4 pt-2 gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 text-xs font-medium rounded-t-md border-t border-l border-r border-transparent ${
                activeTab === tab.id 
                  ? 'bg-bg-secondary text-text-primary border-t-border border-l-border border-r-border relative top-[1px]' 
                  : 'text-text-secondary hover:text-white hover:bg-bg-secondary/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 bg-bg-secondary p-4 min-h-[350px]">
          {activeTab === 'connection' && (
            <div className="flex flex-col gap-4 text-sm text-text-secondary">
              <div className="flex gap-4 items-center">
                <label className="w-24 text-right">Type:</label>
                <select className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary">
                  <option>Direct Connection</option>
                  <option>Replica Set</option>
                </select>
              </div>
              <div className="flex gap-4 items-center">
                <label className="w-24 text-right">Name:</label>
                <input ref={nameRef} type="text" className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent" />
              </div>
              <div className="flex gap-4 items-center">
                <label className="w-24 text-right">Host:</label>
                <div className="flex-1 flex gap-2">
                  <input ref={hostRef} type="text" className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent" />
                  <input ref={portRef} type="number" className="w-24 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent" />
                </div>
              </div>
            </div>
          )}
          
          {activeTab !== 'connection' && (
             <div className="h-full flex items-center justify-center text-text-secondary italic">
               Tab "{activeTab}" under construction...
             </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-bg-tertiary flex justify-between items-center">
          <button className="text-sm px-4 py-1.5 hover:bg-bg-secondary border border-border rounded text-text-primary transition-colors">
            Test
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="text-sm px-4 py-1.5 hover:bg-bg-secondary border border-border rounded text-text-primary transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} className="text-sm px-4 py-1.5 bg-accent text-white rounded hover:bg-accent-hover transition-colors font-medium">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
