import { useState, useEffect, useRef } from 'react'
import ConnectionManager from './components/ConnectionManager'
import QueryTab from './components/QueryTab'
import IndexTab from './components/IndexTab'
import { useConnectionStore } from './store/connectionStore'
import { useTabStore } from './store/tabStore'
import { useLogStore } from './store/logStore'
import { useProfilerStore } from './store/profilerStore'
import DatabaseStats from './components/Overlays/DatabaseStats'
import OpsManager from './components/Overlays/OpsManager'
import ServerInfo from './components/Overlays/ServerInfo'
import {
  Server,
  Database,
  FileText,
  Trash2,
  Edit3,
  Copy,
  CopyPlus,
  Play,
  RefreshCw,
  BarChart,
  TerminalSquare,
  Activity,
  X,
  Download,
  Upload,
  Archive
} from 'lucide-react'
import ExportTab from './components/ExportTab'
import ImportTab from './components/ImportTab'
import BsonTab from './components/BsonTab'

function App() {
  const [showManager, setShowManager] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [logTab, setLogTab] = useState('output') // 'output' or 'profiler'
  const [sidebarMenu, setSidebarMenu] = useState(null)
  const sidebarMenuRef = useRef(null)
  const { logs, clearLogs } = useLogStore()
  const profilerLogs = useProfilerStore(state => state.logs)
  const isRecording = useProfilerStore(state => state.isRecording)
  const setRecording = useProfilerStore(state => state.setRecording)
  const clearProfilerLogs = useProfilerStore(state => state.clearLogs)
  
  // Modals / Overlays
  const [showStats, setShowStats] = useState(null) // { type, connId, dbName }
  const [showOps, setShowOps] = useState(null) // { connId }
  const [showServerInfo, setShowServerInfo] = useState(null) // { connId, type: 'status' | 'host' }
  const [inputDialog, setInputDialog] = useState(null) // { title, placeholder, defaultValue, onConfirm }

  const {
    connections,
    activeConnections,
    expandedNodes,
    dbCollections,
    toggleNode,
    disconnectDatabase,
    loadConnections
  } = useConnectionStore()

  useEffect(() => {
    loadConnections()
  }, [])

  const { tabs, activeTabId, openTab, closeTab, setActiveTab } = useTabStore()

  // Setup APM Profiler listener
  useEffect(() => {
    const unsubscribe = window.electron.ipcRenderer.on('db:profiler', (e, log) => {
      useProfilerStore.getState().addLog(log)
    })
    return () => unsubscribe()
  }, [])

  // Close sidebar context menu when clicking outside
  useEffect(() => {
    const handleClick = (e) => {
      if (sidebarMenuRef.current && !sidebarMenuRef.current.contains(e.target)) {
        setSidebarMenu(null)
      }
    }
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  // Context Menu Handlers
  const handleDropDatabase = async (connId, dbName) => {
    if (window.confirm(`Are you sure you want to drop database "${dbName}"?`)) {
      await window.electron.ipcRenderer.invoke('db:dropDatabase', { connId, dbName })
      useConnectionStore.getState().refreshDatabases(connId)
      setSidebarMenu(null)
    }
  }

  const showInputDialog = (opts) => {
    setSidebarMenu(null)
    setInputDialog(opts)
  }

  const handleCreateCollection = (connId, dbName) => {
    showInputDialog({
      title: `Create Collection in "${dbName}"`,
      placeholder: 'Collection name...',
      defaultValue: '',
      onConfirm: async (colName) => {
        if (!colName.trim()) return
        const res = await window.electron.ipcRenderer.invoke('db:createCollection', {
          connId,
          dbName,
          collectionName: colName.trim()
        })
        if (res.ok) useConnectionStore.getState().refreshCollections(connId, dbName)
        else alert('Failed: ' + res.error)
      }
    })
  }

  const handleDropCollection = async (connId, dbName, colName) => {
    if (window.confirm(`Are you sure you want to drop collection "${colName}" in "${dbName}"?`)) {
      await window.electron.ipcRenderer.invoke('db:dropCollection', {
        connId,
        dbName,
        collectionName: colName
      })
      useConnectionStore.getState().refreshCollections(connId, dbName)
      setSidebarMenu(null)
    }
  }

  const handleRenameCollection = (connId, dbName, colName) => {
    showInputDialog({
      title: `Rename "${colName}"`,
      placeholder: 'New collection name...',
      defaultValue: colName,
      onConfirm: async (newName) => {
        if (!newName.trim() || newName.trim() === colName) return
        const res = await window.electron.ipcRenderer.invoke('db:renameCollection', {
          connId, dbName, oldName: colName, newName: newName.trim()
        })
        if (res.ok) useConnectionStore.getState().refreshCollections(connId, dbName)
        else alert('Rename failed: ' + res.error)
      }
    })
  }

  const handleDuplicateCollection = (connId, dbName, colName) => {
    showInputDialog({
      title: `Duplicate "${colName}"`,
      placeholder: 'New collection name...',
      defaultValue: `${colName}_copy`,
      onConfirm: async (targetName) => {
        if (!targetName.trim()) return
        const res = await window.electron.ipcRenderer.invoke('db:duplicateCollection', {
          connId, dbName, sourceName: colName, targetName: targetName.trim()
        })
        if (res.ok) useConnectionStore.getState().refreshCollections(connId, dbName)
        else alert('Duplicate failed: ' + res.error)
      }
    })
  }

  const handleCreateDatabase = (connId) => {
    showInputDialog({
      title: 'Create New Database',
      placeholder: 'Database name...',
      defaultValue: '',
      onConfirm: async (dbName) => {
        if (!dbName.trim()) return
        const res = await window.electron.ipcRenderer.invoke('db:createDatabase', { connId, dbName: dbName.trim() })
        if (res.ok) useConnectionStore.getState().refreshDatabases(connId)
        else alert('Failed: ' + res.error)
      }
    })
  }

  const handleRepairDatabase = async (connId, dbName) => {
    if (window.confirm(`Attempt to repair database "${dbName}"? This may take some time.`)) {
      const res = await window.electron.ipcRenderer.invoke('db:repairDatabase', { connId, dbName })
      if (res.ok) alert('Repair command sent successfully.')
      else alert('Repair failed: ' + res.error)
      setSidebarMenu(null)
    }
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-bg-primary text-text-primary relative">
      {/* 1. Header / Toolbar */}
      <header className="h-12 bg-bg-tertiary border-b border-border flex items-center px-4 shrink-0">
        <h1 className="font-semibold text-sm">LeafBase 2025</h1>
      </header>

      {/* 2. Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar (Left) */}
        <aside className="w-64 bg-bg-secondary border-r border-border flex flex-col resize-x overflow-auto min-w-[200px] max-w-sm">
          <div className="p-3 text-xs font-bold text-text-secondary uppercase tracking-wider flex justify-between items-center select-none">
            <span>Connections</span>
            <button
              onClick={() => setShowManager(true)}
              className="text-text-secondary hover:text-white transition-colors"
              title="Add Connection"
            >
              <CopyPlus size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            {connections.length === 0 ? (
              <div className="p-3 text-sm italic text-text-secondary select-none">
                No connections. Click + to add.
              </div>
            ) : (
              <div className="flex flex-col gap-0.5 pb-4">
                {connections.map((conn) => {
                  const isActive = !!activeConnections[conn.id]
                  const dbList = isActive ? activeConnections[conn.id].databases : []
                  const isConnExpanded = !!expandedNodes[`conn_${conn.id}`]

                  return (
                    <div key={conn.id} className="select-none">
                      {/* Connection Node */}
                      <div
                        onClick={() => toggleNode('conn', conn.id)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setSidebarMenu({
                            type: 'conn',
                            connId: conn.id,
                            x: e.clientX,
                            y: e.clientY
                          })
                        }}
                        className={`text-sm px-2 py-1.5 cursor-pointer flex items-center gap-2 ${isActive ? 'bg-bg-tertiary/30 text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}`}
                      >
                        <span
                          className={`text-[10px] opacity-60 transition-transform duration-200 ${isConnExpanded ? 'rotate-90' : ''}`}
                        >
                          ▶
                        </span>
                        <Server
                          size={14}
                          className={isActive ? 'text-green-500' : 'text-text-secondary opacity-80'}
                        />
                        <span className="font-medium truncate flex-1">{conn.name}</span>
                        {isActive && (
                          <span className="text-[10px] px-1 bg-bg-tertiary rounded text-text-secondary">
                            {dbList.length}
                          </span>
                        )}
                      </div>

                      {/* Database list (only if expanded and active) */}
                      {isConnExpanded && isActive && (
                        <div className="flex flex-col gap-[1px]">
                          {dbList.map((db) => {
                            const isDbExpanded = !!expandedNodes[`db_${conn.id}_${db}`]
                            const cacheKey = `${conn.id}_${db}`
                            const cols = dbCollections[cacheKey]

                            return (
                              <div key={db}>
                                {/* DB Node */}
                                <div
                                  onClick={() => toggleNode('db', conn.id, db)}
                                  onContextMenu={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setSidebarMenu({
                                      type: 'db',
                                      connId: conn.id,
                                      dbName: db,
                                      x: e.clientX,
                                      y: e.clientY
                                    })
                                  }}
                                  className="text-[13px] px-2 py-1 pl-[22px] hover:bg-bg-tertiary cursor-pointer text-text-primary/80 hover:text-text-primary flex items-center gap-2"
                                >
                                  <span
                                    className={`text-[9px] opacity-40 transition-transform duration-200 ${isDbExpanded ? 'rotate-90' : ''}`}
                                  >
                                    ▶
                                  </span>
                                  <Database size={13} className="text-accent opacity-90" />
                                  <span className="truncate flex-1 font-medium">{db}</span>
                                  {cols && (
                                    <span className="text-[10px] text-text-secondary">
                                      ({cols.length})
                                    </span>
                                  )}
                                </div>

                                {/* Collection list */}
                                {isDbExpanded && (
                                  <div className="flex flex-col gap-0.5">
                                    {!cols ? (
                                      <span className="text-[11px] text-text-secondary italic px-2 py-1 pl-[48px]">
                                        Loading...
                                      </span>
                                    ) : cols.length === 0 ? (
                                      <span className="text-[11px] text-text-secondary italic px-2 py-1 pl-[48px]">
                                        Empty database
                                      </span>
                                    ) : (
                                      cols.map((col) => (
                                        <div
                                          key={col}
                                          onClick={() =>
                                            openTab({
                                              title: col,
                                              connId: conn.id,
                                              dbName: db,
                                              collectionName: col
                                            })
                                          }
                                          onContextMenu={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            setSidebarMenu({
                                              type: 'col',
                                              connId: conn.id,
                                              dbName: db,
                                              colName: col,
                                              x: e.clientX,
                                              y: e.clientY
                                            })
                                          }}
                                          className="text-[13px] px-2 py-[3px] pl-[40px] hover:bg-bg-tertiary cursor-pointer text-text-secondary hover:text-white flex items-center gap-1.5"
                                        >
                                          <FileText size={12} className="opacity-70" />{' '}
                                          <span className="truncate w-full">{col}</span>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {/* Loading indicator if expanded but connecting */}
                      {isConnExpanded && !isActive && (
                        <div className="pl-7 py-1.5 text-[11px] italic text-text-secondary flex items-center gap-2">
                          <span className="animate-spin text-accent">⟳</span> Connecting...
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Workspace (Right) */}
        <main className="flex-1 flex flex-col min-w-0 bg-bg-primary relative">
          {!tabs || tabs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-4 opacity-20">🍃</div>
                <p className="text-text-secondary">Double click a collection to open query tab</p>
                <button
                  onClick={() => setShowManager(true)}
                  className="mt-4 px-4 py-2 bg-accent text-white rounded cursor-pointer hover:bg-accent-hover transition-colors text-sm"
                >
                  Manage Connections ({connections.length})
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {!tabs || tabs.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-text-secondary italic">
                  Select a collection from the sidebar on the left to start querying...
                </div>
              ) : (
                <>
                  {/* Tabs Header */}
                  <div className="flex bg-bg-tertiary border-b border-border overflow-x-auto min-h-[36px]">
                    {tabs.map((tab) => (
                      <div
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 min-w-[120px] max-w-[200px] border-r border-border cursor-pointer select-none text-xs font-medium transition-colors ${
                          activeTabId === tab.id
                            ? 'bg-bg-primary text-text-primary border-t border-t-accent'
                            : 'bg-bg-tertiary text-text-secondary hover:bg-bg-secondary'
                        }`}
                      >
                        <span className="truncate flex-1" title={tab.title}>
                          {tab.title}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            closeTab(tab.id)
                          }}
                          className="opacity-50 hover:opacity-100 hover:text-red-400 focus:outline-none px-1"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Tab Content */}
                  {tabs
                    .filter((t) => t.id === activeTabId)
                    .map((tab) => {
                      if (tab.type === 'indexes') return <IndexTab key={tab.id} tab={tab} />
                      if (tab.type === 'export') return <ExportTab key={tab.id} tab={tab} />
                      if (tab.type === 'import') return <ImportTab key={tab.id} tab={tab} />
                      if (tab.type === 'bson') return <BsonTab key={tab.id} tab={tab} />
                      return <QueryTab key={tab.id} tab={tab} />
                    })}
                </>
              )}
            </div>
          )}

          <ConnectionManager isOpen={showManager} onClose={() => setShowManager(false)} />
        </main>
      </div>

      {showStats && (
        <DatabaseStats 
          {...showStats} 
          onClose={() => setShowStats(null)} 
        />
      )}
      {showOps && (
        <OpsManager 
          {...showOps} 
          onClose={() => setShowOps(null)} 
        />
      )}
      {showServerInfo && (
        <ServerInfo 
          {...showServerInfo} 
          onClose={() => setShowServerInfo(null)} 
        />
      )}

      {/* 3. Footer / Status Bar & Logs */}
      {showLogs && (
        <div className="h-48 bg-bg-secondary border-t border-border flex flex-col shrink-0 animate-in slide-in-from-bottom-2">
          <div className="px-3 py-1.5 bg-bg-tertiary border-b border-border text-xs font-semibold flex justify-between items-center">
            <div className="flex gap-4">
              <button 
                onClick={() => setLogTab('output')}
                className={`flex items-center gap-1.5 ${logTab === 'output' ? 'text-accent' : 'text-text-secondary hover:text-white'}`}
              >
                <TerminalSquare size={13} /> Output Logs
              </button>
              <button 
                onClick={() => setLogTab('profiler')}
                className={`flex items-center gap-1.5 ${logTab === 'profiler' ? 'text-accent' : 'text-text-secondary hover:text-white'}`}
              >
                <Activity size={13} /> APM Profiler
              </button>
            </div>
            <div className="flex items-center gap-3">
              {logTab === 'profiler' && (
                <button
                  onClick={() => setRecording(!isRecording)}
                  className={`text-xs px-2 py-0.5 rounded ${isRecording ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}
                >
                  {isRecording ? 'Stop Recording' : 'Start Recording'}
                </button>
              )}
              <button
                onClick={() => logTab === 'output' ? clearLogs() : clearProfilerLogs()}
                className="text-text-secondary hover:text-white transition-colors"
                title="Clear Logs"
              >
                <Trash2 size={13} />
              </button>
              <button
                onClick={() => setShowLogs(false)}
                className="text-text-secondary hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto font-mono text-[11px] leading-relaxed flex flex-col">
            {logTab === 'output' ? (
              <div className="p-2 flex flex-col gap-1">
                {logs.length === 0 ? (
                  <div className="text-text-secondary italic px-2">No output logs available.</div>
                ) : (
                  logs.map((l) => (
                    <div key={l.id} className="flex gap-2 hover:bg-bg-tertiary px-2 py-0.5 rounded">
                      <span className="text-text-secondary w-28 shrink-0">[{l.time}]</span>
                      <span className={l.type === 'error' ? 'text-red-400' : 'text-text-primary'}>
                        {l.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="w-full">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-bg-tertiary sticky top-0 border-b border-border">
                    <tr>
                      <th className="font-normal text-text-secondary px-3 py-1.5 w-24">Time</th>
                      <th className="font-normal text-text-secondary px-3 py-1.5 w-32">Status</th>
                      <th className="font-normal text-text-secondary px-3 py-1.5 w-32">Operation</th>
                      <th className="font-normal text-text-secondary px-3 py-1.5 w-24">Duration</th>
                      <th className="font-normal text-text-secondary px-3 py-1.5">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profilerLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-text-secondary italic px-3 py-4 text-center">
                          {isRecording ? 'Listening for queries...' : 'Recording is paused.'}
                        </td>
                      </tr>
                    ) : (
                      profilerLogs.map((l, idx) => (
                        <tr key={`${l.requestId}-${idx}`} className="border-b border-border/50 hover:bg-bg-tertiary/50">
                          <td className="px-3 py-1.5 border-r border-border/30 text-text-secondary whitespace-nowrap">
                            {l.time?.includes('T') ? l.time.split('T')[1].split('.')[0] : l.time}
                          </td>
                          <td className="px-3 py-1.5 border-r border-border/30">
                            {l.type === 'success' && <span className="text-green-400">Success</span>}
                            {l.type === 'error' && <span className="text-red-400">Error</span>}
                            {l.type === 'start' && <span className="text-accent">Started</span>}
                          </td>
                          <td className="px-3 py-1.5 border-r border-border/30 text-accent font-medium">
                            {l.commandName}
                          </td>
                          <td className="px-3 py-1.5 border-r border-border/30">
                            {l.duration !== undefined ? <span className={l.duration > 100 ? 'text-yellow-400 font-bold' : ''}>{l.duration}ms</span> : '-'}
                          </td>
                          <td className="px-3 py-1.5 truncate max-w-md opacity-80" title={l.failure || l.command}>
                            {l.failure || l.command || '...'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      <footer
        onClick={() => {
          if (!showLogs) setShowLogs(true)
        }}
        className="h-6 bg-accent border-t border-border flex items-center px-4 shrink-0 text-xs text-white cursor-pointer hover:bg-accent-hover transition-colors"
      >
        <div className="flex items-center gap-2">
          <TerminalSquare size={13} />
          <span className="truncate max-w-2xl">
            {logs.length > 0 ? logs[logs.length - 1].message : 'Ready'}
          </span>
        </div>
      </footer>

      {/* Sidebar Context Menu */}
      {sidebarMenu && (
        <div
          ref={sidebarMenuRef}
          className="fixed bg-bg-secondary border border-border rounded shadow-2xl py-1 z-50 text-xs text-text-primary min-w-[200px]"
          style={{ top: sidebarMenu.y, left: sidebarMenu.x }}
        >
          {sidebarMenu.type === 'conn' && (
            <>
              <button
                onClick={() => {
                  setSidebarMenu(null)
                  openTab({ title: 'Shell', connId: sidebarMenu.connId, type: 'shell' })
                }}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <Play size={13} className="text-green-500" /> Open Shell
              </button>
              <button
                onClick={() => {
                  setSidebarMenu(null)
                  useConnectionStore.getState().refreshDatabases(sidebarMenu.connId)
                }}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <RefreshCw size={13} /> Refresh
              </button>
              <div className="h-px bg-border my-1" />
              <button 
                onClick={() => {
                  setSidebarMenu(null)
                  handleCreateDatabase(sidebarMenu.connId)
                }}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <Database size={13} className="text-accent" /> Create Database
              </button>
              <button 
                onClick={() => {
                  setSidebarMenu(null)
                  setShowServerInfo({ connId: sidebarMenu.connId, type: 'status' })
                }}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <Activity size={13} className="text-orange-400" /> Server Status
              </button>
              <button 
                onClick={() => {
                  setSidebarMenu(null)
                  setShowServerInfo({ connId: sidebarMenu.connId, type: 'host' })
                }}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <Server size={13} /> Host Info
              </button>
              <div className="h-px bg-border my-1" />
              <button
                onClick={() => {
                  setSidebarMenu(null)
                  setShowLogs(true)
                }}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <TerminalSquare size={13} /> Show Log
              </button>
              {activeConnections[sidebarMenu.connId] && (
                <button
                  onClick={() => {
                    setSidebarMenu(null)
                    disconnectDatabase(sidebarMenu.connId)
                  }}
                  className="w-full text-left px-4 py-1.5 hover:bg-red-500 hover:text-white flex items-center gap-2 text-red-400"
                >
                  <Server size={13} /> Disconnect
                </button>
              )}
            </>
          )}

          {sidebarMenu.type === 'db' && (
            <>
              <button
                onClick={() => {
                  setSidebarMenu(null)
                  openTab({
                    title: `${sidebarMenu.dbName} Shell`,
                    connId: sidebarMenu.connId,
                    dbName: sidebarMenu.dbName,
                    type: 'shell'
                  })
                }}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <Play size={13} className="text-green-500" /> Open Shell
              </button>
              <button
                onClick={() => {
                  setSidebarMenu(null)
                  useConnectionStore
                    .getState()
                    .refreshCollections(sidebarMenu.connId, sidebarMenu.dbName)
                }}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <RefreshCw size={13} /> Refresh
              </button>
              <div className="h-px bg-border my-1" />
              <button
                onClick={() => handleCreateCollection(sidebarMenu.connId, sidebarMenu.dbName)}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <CopyPlus size={13} /> Create Collection...
              </button>
              <button 
                onClick={() => {
                  setSidebarMenu(null)
                  setShowStats({ type: 'db', connId: sidebarMenu.connId, dbName: sidebarMenu.dbName })
                }}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <BarChart size={13} className="text-blue-400" /> Database Statistics
              </button>
              <div className="h-px bg-border my-1" />
              <button 
                onClick={() => {
                  setSidebarMenu(null)
                  setShowOps({ connId: sidebarMenu.connId })
                }}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <Activity size={13} className="text-green-500" /> Current Operations
              </button>
              <div className="h-px bg-border my-1" />
              <button 
                onClick={() => handleRepairDatabase(sidebarMenu.connId, sidebarMenu.dbName)}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <RefreshCw size={13} className="text-yellow-400" /> Repair Database...
              </button>
              <button
                onClick={() => handleDropDatabase(sidebarMenu.connId, sidebarMenu.dbName)}
                className="w-full text-left px-4 py-1.5 hover:bg-red-500 hover:text-white flex items-center gap-2 text-red-400"
              >
                <Trash2 size={13} /> Drop Database...
              </button>
              <div className="h-px bg-border my-1" />
              <button 
                onClick={() => {
                  setSidebarMenu(null)
                  handleCreateDatabase(sidebarMenu.connId)
                }}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <Database size={13} className="text-accent" /> Create Database...
              </button>
            </>
          )}

          {sidebarMenu.type === 'col' && (
            <>
              <button
                onClick={() => {
                  openTab({
                    title: sidebarMenu.colName,
                    connId: sidebarMenu.connId,
                    dbName: sidebarMenu.dbName,
                    collectionName: sidebarMenu.colName
                  })
                  setSidebarMenu(null)
                }}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2 font-medium"
              >
                <FileText size={13} /> View Documents
              </button>
              <button
                onClick={() => {
                  openTab({
                    title: `Export: ${sidebarMenu.colName}`,
                    type: 'export',
                    connId: sidebarMenu.connId,
                    dbName: sidebarMenu.dbName,
                    collectionName: sidebarMenu.colName
                  })
                  setSidebarMenu(null)
                }}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <Download size={13} className="text-accent" /> Export Documents...
              </button>
              <button
                onClick={() => {
                  openTab({
                    title: `Import: ${sidebarMenu.colName}`,
                    type: 'import',
                    connId: sidebarMenu.connId,
                    dbName: sidebarMenu.dbName,
                    collectionName: sidebarMenu.colName
                  })
                  setSidebarMenu(null)
                }}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <Upload size={13} className="text-green-500" /> Import Documents...
              </button>
              <button
                onClick={() => {
                  openTab({
                    title: `BSON: ${sidebarMenu.colName}`,
                    type: 'bson',
                    connId: sidebarMenu.connId,
                    dbName: sidebarMenu.dbName,
                    collectionName: sidebarMenu.colName
                  })
                  setSidebarMenu(null)
                }}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <Archive size={13} className="text-orange-400" /> BSON Backup / Restore...
              </button>
              <div className="h-px bg-border my-1" />
              <button
                onClick={() =>
                  handleRenameCollection(
                    sidebarMenu.connId,
                    sidebarMenu.dbName,
                    sidebarMenu.colName
                  )
                }
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <Edit3 size={13} /> Rename Collection...
              </button>
              <button
                onClick={() =>
                  handleDuplicateCollection(
                    sidebarMenu.connId,
                    sidebarMenu.dbName,
                    sidebarMenu.colName
                  )
                }
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <Copy size={13} /> Duplicate Collection...
              </button>
              <button
                onClick={() => {
                  openTab({
                    title: `Indexes: ${sidebarMenu.colName}`,
                    type: 'indexes',
                    connId: sidebarMenu.connId,
                    dbName: sidebarMenu.dbName,
                    collectionName: sidebarMenu.colName
                  })
                  setSidebarMenu(null)
                }}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <Activity size={13} /> Manage Indexes...
              </button>
              <div className="h-px bg-border my-1" />
              <button
                onClick={() =>
                  handleDropCollection(sidebarMenu.connId, sidebarMenu.dbName, sidebarMenu.colName)
                }
                className="w-full text-left px-4 py-1.5 hover:bg-red-500 hover:text-white flex items-center gap-2 text-red-400"
              >
                <Trash2 size={13} /> Drop Collection...
              </button>
            </>
          )}
        </div>
      )}

      {/* Input Dialog (replaces window.prompt) */}
      {inputDialog && (
        <InputDialog
          title={inputDialog.title}
          placeholder={inputDialog.placeholder}
          defaultValue={inputDialog.defaultValue}
          onConfirm={async (val) => {
            setInputDialog(null)
            await inputDialog.onConfirm(val)
          }}
          onCancel={() => setInputDialog(null)}
        />
      )}
    </div>
  )
}

function InputDialog({ title, placeholder, defaultValue, onConfirm, onCancel }) {
  const [value, setValue] = useState(defaultValue || '')
  const inputRef = useRef(null)

  useEffect(() => {
    // Focus the input as soon as the dialog appears
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') onConfirm(value)
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-secondary border border-border rounded-xl shadow-2xl p-5 w-[360px] flex flex-col gap-4">
        <h3 className="text-sm font-bold text-text-primary">{title}</h3>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-xs rounded-lg bg-bg-tertiary hover:bg-border text-text-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(value)}
            className="px-4 py-1.5 text-xs rounded-lg bg-accent hover:bg-accent-hover text-white font-bold transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
