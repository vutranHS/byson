import { useEffect } from 'react'
import { X, ExternalLink, Download, Upload, CopyPlus, ArchiveRestore } from 'lucide-react'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { useTabStore } from '../../store/tabStore'

export default function WorkspacesModal({ onClose }) {
  const { lastSession, lastSavedAt } = useWorkspaceStore()
  const { restoreWorkspace } = useTabStore()

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleResumeLastSession = () => {
    if (lastSession && lastSession.length > 0) {
       restoreWorkspace(lastSession)
    }
    onClose()
  }

  const handleExportWorkspace = async () => {
    if (!lastSession || lastSession.length === 0) {
      alert('No workspace data to export.')
      return
    }

    const jsonStr = JSON.stringify(lastSession, null, 2)
    const filePath = await window.electron.ipcRenderer.invoke('shell:saveFile', {
      title: 'Export Workspace Session',
      defaultPath: `byson_workspace_${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    })

    if (!filePath) return // User cancelled

    const res = await window.electron.ipcRenderer.invoke('fs:writeFile', {
      filePath, content: jsonStr
    })

    if (res.ok) alert('Workspace exported successfully!')
    else alert('Failed to export workspace: ' + res.error)
    
    onClose()
  }

  const handleImportWorkspace = async () => {
    const filePath = await window.electron.ipcRenderer.invoke('shell:openFile', {
      title: 'Import Workspace Session',
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    })

    if (!filePath) return

    const res = await window.electron.ipcRenderer.invoke('fs:readFile', filePath)
    if (!res.ok) {
      alert('Failed to read file: ' + res.error)
      return
    }

    try {
      const parsedTabs = JSON.parse(res.data)
      if (!Array.isArray(parsedTabs)) throw new Error('Invalid workspace format')
      
      restoreWorkspace(parsedTabs)
      onClose()
    } catch (err) {
      alert('Failed to parse workspace JSON: ' + err.message)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div 
        className="bg-bg-primary rounded-lg shadow-2xl border border-border flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        style={{ width: '480px', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-bg-secondary border-b border-border flex justify-between items-center select-none">
          <div className="flex items-center gap-2 text-text-primary font-medium">
            <ArchiveRestore size={16} className="text-accent" />
            Workspace Sessions
          </div>
          <button 
            onClick={onClose}
            className="text-text-secondary hover:text-white p-1 hover:bg-bg-tertiary rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-6">
          <div className="text-sm text-text-secondary">
            Workspaces save your active tabs, active database endpoints, and executing queries so you can pick up precisely where you left off.
          </div>

          <div className="space-y-3">
            <button 
              onClick={handleResumeLastSession}
              disabled={!lastSession || lastSession.length === 0}
              className={`w-full flex items-center gap-3 p-3 rounded border text-left transition-colors ${
                 lastSession && lastSession.length > 0 
                 ? 'bg-bg-tertiary hover:bg-bg-secondary border-accent/30 hover:border-accent text-text-primary' 
                 : 'bg-bg-tertiary/50 border-border text-text-secondary opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="p-2 bg-accent/20 rounded shadow-sm text-accent">
                <ExternalLink size={18} />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm">Resume Last Session</div>
                <div className="text-xs text-text-secondary mt-0.5">
                   {lastSession && lastSession.length > 0 
                     ? `Restore ${lastSession.length} active tab(s) from your previous session.` 
                     : 'No previous session memory found.'}
                </div>
              </div>
            </button>

            <button 
              onClick={handleExportWorkspace}
              className="w-full flex items-center gap-3 p-3 rounded border border-border bg-bg-tertiary hover:bg-bg-secondary text-left transition-colors text-text-primary"
            >
              <div className="p-2 bg-blue-500/20 rounded shadow-sm text-blue-400">
                <Download size={18} />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm">Export Workspace</div>
                <div className="text-xs text-text-secondary mt-0.5">
                   Download your currently active tabs to a JSON file to share with teammates.
                </div>
              </div>
            </button>

            <button 
              onClick={handleImportWorkspace}
              className="w-full flex items-center gap-3 p-3 rounded border border-border bg-bg-tertiary hover:bg-bg-secondary text-left transition-colors text-text-primary"
            >
              <div className="p-2 bg-green-500/20 rounded shadow-sm text-green-400">
                <Upload size={18} />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm">Import Workspace</div>
                <div className="text-xs text-text-secondary mt-0.5">
                   Load a previously exported Workspace JSON. (Notice: This will wipe clear your currently open tabs).
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-bg-secondary border-t border-border flex justify-end select-none">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm font-medium text-text-primary bg-bg-tertiary hover:bg-border rounded border border-border transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
