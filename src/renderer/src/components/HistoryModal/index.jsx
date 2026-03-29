import { useState, useMemo, useEffect } from 'react'
import { X, Search, Clock, Database, ChevronRight, Star, ExternalLink, Trash2, ShieldAlert } from 'lucide-react'
import { useHistoryStore } from '../../store/historyStore'
import { useTabStore } from '../../store/tabStore'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

export default function HistoryModal({ onClose, activeDbName, activeConnId }) {
  const { records, toggleStar, removeRecord, clearHistory } = useHistoryStore()
  const { activeTabId, updateTabContent, openTab } = useTabStore()

  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState('all') // 'all', 'current-db', 'starred'
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Filter and sort records
  const filteredRecords = useMemo(() => {
    let result = [...records]

    // Apply Filter Mode
    if (filterMode === 'starred') {
      result = result.filter(r => r.isStarred)
    } else if (filterMode === 'current-db' && activeDbName) {
      result = result.filter(r => r.dbName === activeDbName && r.connId === activeConnId)
    }

    // Apply Search String
    if (search.trim()) {
      const lower = search.toLowerCase()
      result = result.filter(r =>
        r.query.toLowerCase().includes(lower) ||
        r.dbName.toLowerCase().includes(lower) ||
        r.connName.toLowerCase().includes(lower)
      )
    }

    // Default sort is already by timestamp descending in store, but let's ensure it:
    return result.sort((a, b) => b.timestamp - a.timestamp)
  }, [records, search, filterMode, activeDbName, activeConnId])

  const formatTime = (ts) => {
    const date = new Date(ts)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    
    return date.toLocaleDateString()
  }

  const handleRestore = (record) => {
    const isSameContext = String(record.connId) === String(activeConnId) && record.dbName === activeDbName
    if (isSameContext) {
      if (!activeTabId) return
      updateTabContent(activeTabId, record.query)
    } else {
      openTab({
        title: `History: ${record.dbName}`,
        connId: record.connId,
        dbName: record.dbName,
        collectionName: record.collectionName !== 'Unknown' ? record.collectionName : '',
        query: record.query,
        skipAutoRun: true
      })
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div 
        className="bg-bg-primary rounded-lg shadow-2xl border border-border flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 w-full max-w-4xl"
        style={{ height: '80vh' }}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-bg-secondary border-b border-border flex justify-between items-center select-none shrink-0">
          <div className="flex items-center gap-3 text-text-primary font-medium">
            <div className="p-1.5 bg-accent/10 text-accent rounded-md">
              <Clock size={18} />
            </div>
            Global Query History
          </div>
          <div className="flex items-center gap-3">
             <button
               onClick={() => setShowClearConfirm(true)}
               className="text-xs flex items-center gap-1.5 text-text-secondary hover:text-red-400 px-2 py-1 rounded hover:bg-red-400/10 transition-colors"
             >
               <Trash2 size={14} /> Clear History
             </button>
            <button 
              onClick={onClose}
              className="text-text-secondary hover:text-white p-1 hover:bg-bg-tertiary rounded transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Clear Confirm Banner */}
        {showClearConfirm && (
          <div className="bg-red-500/10 border-b border-red-500/20 px-5 py-3 flex items-center justify-between shrink-0">
             <div className="flex items-center gap-2 text-sm text-red-400">
                <ShieldAlert size={16} />
                <span>Are you sure you want to wipe all unstarred history?</span>
             </div>
             <div className="flex items-center gap-2">
                <button onClick={() => setShowClearConfirm(false)} className="text-xs text-text-secondary hover:text-white px-3 py-1 bg-bg-tertiary rounded">Cancel</button>
                <button onClick={() => { clearHistory(); setShowClearConfirm(false); }} className="text-xs text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded">Yes, Wipe it</button>
             </div>
          </div>
        )}

        {/* Toolbar & Search */}
        <div className="p-5 border-b border-border bg-bg-primary shrink-0 space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input 
              type="text" 
              placeholder="Search past queries by snippet, collection, or server name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-bg-secondary border border-border rounded-md pl-9 pr-4 py-2 text-sm text-text-primary outline-none focus:border-accent transition-colors"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${filterMode === 'all' ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-bg-secondary border-border text-text-secondary hover:text-white hover:border-gray-600'}`}
            >
              All History
            </button>
            {activeDbName && (
              <button
                onClick={() => setFilterMode('current-db')}
                className={`px-3 py-1 text-xs rounded-full border flex items-center gap-1.5 transition-colors ${filterMode === 'current-db' ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-bg-secondary border-border text-text-secondary hover:text-white hover:border-gray-600'}`}
              >
                <Database size={12} />
                Current DB ({activeDbName})
              </button>
            )}
            <button
              onClick={() => setFilterMode('starred')}
              className={`px-3 py-1 text-xs rounded-full border flex items-center gap-1.5 transition-colors ${filterMode === 'starred' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500' : 'bg-bg-secondary border-border text-text-secondary hover:text-white hover:border-gray-600'}`}
            >
              <Star size={12} className={filterMode === 'starred' ? 'fill-yellow-500' : ''} />
              Starred
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto bg-bg-secondary p-5">
          {filteredRecords.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-text-secondary">
              <Clock size={48} className="text-border mb-4" />
              <div className="text-lg font-medium text-text-primary mb-1">No history found</div>
              <div className="text-sm">Try adjusting your filters or search terms.</div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRecords.map((r) => (
                <div key={r.id} className="group bg-bg-primary rounded-lg border border-border overflow-hidden hover:border-border-hover transition-colors">
                  
                  {/* Context Bar */}
                  <div className="flex items-center justify-between px-4 py-2 bg-bg-secondary border-b border-border text-xs">
                    <div className="flex items-center gap-2 text-text-secondary">
                      <span className="font-mono text-[10px] bg-bg-tertiary px-1.5 py-0.5 rounded text-accent flex items-center gap-1">
                        <Database size={10} />
                        {r.connName} <ChevronRight size={10} className="opacity-50" /> {r.dbName}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {formatTime(r.timestamp)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => removeRecord(r.id)}
                        className="p-1.5 text-text-secondary hover:text-red-400 hover:bg-bg-tertiary rounded"
                        title="Delete record"
                      >
                        <Trash2 size={14} />
                      </button>
                      <button 
                        onClick={() => toggleStar(r.id)}
                        className={`p-1.5 rounded hover:bg-bg-tertiary ${r.isStarred ? 'text-yellow-500' : 'text-text-secondary hover:text-yellow-500'}`}
                        title={r.isStarred ? 'Unstar' : 'Star this query'}
                      >
                         <Star size={14} className={r.isStarred ? 'fill-yellow-500' : ''} />
                      </button>
                      <button
                         onClick={() => handleRestore(r)}
                         className="ml-2 flex items-center gap-1.5 bg-accent/10 hover:bg-accent/20 text-accent px-2 py-1 rounded font-medium"
                       >
                         <ExternalLink size={12} />
                         Restore
                       </button>
                    </div>
                  </div>

                  {/* Query Snippet */}
                  <div className="p-3 bg-[#1e1e1e] text-sm overflow-x-auto max-h-[150px] custom-scrollbar">
                    <SyntaxHighlighter
                      language="javascript"
                      style={vscDarkPlus}
                      customStyle={{ margin: 0, padding: 0, background: 'transparent' }}
                      codeTagProps={{ style: { fontSize: '12px', fontFamily: '"JetBrains Mono", Consolas, monospace' } }}
                    >
                      {r.query}
                    </SyntaxHighlighter>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
