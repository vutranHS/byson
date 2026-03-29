import { useState, useEffect } from 'react'
import { X, Settings as SettingsIcon, Save } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'

export default function SettingsModal({ onClose }) {
  const { defaultPageSize, setDefaultPageSize, autoSaveHistory, setAutoSaveHistory } = useSettingsStore()
  
  const [pageSize, setPageSize] = useState(defaultPageSize || 50)
  const [saveHistory, setSaveHistory] = useState(autoSaveHistory !== false)

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSave = () => {
    const parsed = Math.max(1, Math.min(1000, parseInt(pageSize, 10) || 50))
    setDefaultPageSize(parsed)
    setAutoSaveHistory(saveHistory)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div 
        className="bg-bg-primary rounded-lg shadow-2xl border border-border flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        style={{ width: '400px', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-bg-secondary border-b border-border flex justify-between items-center select-none">
          <div className="flex items-center gap-2 text-text-primary font-medium">
            <SettingsIcon size={16} className="text-accent" />
            Global Settings
          </div>
          <button 
            onClick={onClose}
            className="text-text-secondary hover:text-white p-1 hover:bg-bg-tertiary rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Default Page Size
              </label>
              <div className="text-xs text-text-secondary mb-2">
                Number of documents to fetch initially when querying a collection. (Max 1000)
              </div>
              <input 
                type="number" 
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value)}
                min="1"
                max="1000"
                className="w-full bg-bg-tertiary border border-border rounded px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent transition-colors"
                autoFocus
              />
            </div>

            {/* Auto-Save Query History */}
            <div className="pt-3 border-t border-border">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="text-sm font-medium text-text-primary">Auto-Save Query History</div>
                  <div className="text-xs text-text-secondary mt-0.5">Silently record executed queries to the History Store (stores up to 500 recent queries natively).</div>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={saveHistory}
                    onChange={() => setSaveHistory(!saveHistory)}
                  />
                  <div className={`w-10 h-6 bg-bg-tertiary rounded-full shadow-inner border border-border transition-colors ${saveHistory ? 'bg-accent/20 border-accent/50' : ''}`}></div>
                  <div className={`absolute top-1 left-1 bg-text-secondary w-4 h-4 rounded-full transition-transform ${saveHistory ? 'transform translate-x-4 bg-accent' : ''}`}></div>
                </div>
              </label>
            </div>
            
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs text-yellow-500 mt-2">
               Note: Setting a very high page size may cause lag when rendering large collections. The system enforces a strict maximum of 1,000 documents per query batch over IPC.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-bg-secondary border-t border-border flex justify-end gap-2 select-none">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm font-medium text-text-primary bg-bg-tertiary hover:bg-border rounded border border-border transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <Save size={14} />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
