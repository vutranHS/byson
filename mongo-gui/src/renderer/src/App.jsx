import { useState, useEffect, useRef } from 'react'
import ConnectionManager from './components/ConnectionManager'
import QueryTab from './components/QueryTab'
import { useConnectionStore } from './store/connectionStore'
import { useTabStore } from './store/tabStore'
import { useLogStore } from './store/logStore'
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
  X
} from 'lucide-react'

function App() {
  const [showManager, setShowManager] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [sidebarMenu, setSidebarMenu] = useState(null)
  const sidebarMenuRef = useRef(null)
  const { logs, clearLogs } = useLogStore()

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

  // Đóng sidebar context menu khi bấm ra ngoài
  useEffect(() => {
    const handleClick = (e) => {
      if (sidebarMenuRef.current && !sidebarMenuRef.current.contains(e.target)) {
        setSidebarMenu(null)
      }
    }
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  // Các hàm Handler Context Menu
  const handleDropDatabase = async (connId, dbName) => {
    if (window.confirm(`Are you sure you want to drop database "${dbName}"?`)) {
      await window.electron.ipcRenderer.invoke('db:dropDatabase', { connId, dbName })
      useConnectionStore.getState().refreshDatabases(connId)
      setSidebarMenu(null)
    }
  }

  const handleCreateCollection = async (connId, dbName) => {
    const colName = window.prompt('Enter new collection name:')
    if (colName) {
      await window.electron.ipcRenderer.invoke('db:createCollection', {
        connId,
        dbName,
        collectionName: colName
      })
      useConnectionStore.getState().refreshCollections(connId, dbName)
      setSidebarMenu(null)
    }
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

  const handleRenameCollection = async (connId, dbName, colName) => {
    const newName = window.prompt(`Rename collection "${colName}" to:`, colName)
    if (newName && newName !== colName) {
      await window.electron.ipcRenderer.invoke('db:renameCollection', {
        connId,
        dbName,
        oldName: colName,
        newName
      })
      useConnectionStore.getState().refreshCollections(connId, dbName)
      setSidebarMenu(null)
    }
  }

  const handleDuplicateCollection = async (connId, dbName, colName) => {
    const targetName = window.prompt(
      `Duplicate "${colName}" to new collection name:`,
      `${colName}_copy`
    )
    if (targetName) {
      // Show loading roughly
      await window.electron.ipcRenderer.invoke('db:duplicateCollection', {
        connId,
        dbName,
        sourceName: colName,
        targetName
      })
      useConnectionStore.getState().refreshCollections(connId, dbName)
      setSidebarMenu(null)
    }
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-bg-primary text-text-primary relative">
      {/* 1. Header / Toolbar */}
      <header className="h-12 bg-bg-tertiary border-b border-border flex items-center px-4 shrink-0">
        <h1 className="font-semibold text-sm">MongoGUI 2025</h1>
      </header>

      {/* 2. Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar (Trái) */}
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

        {/* Workspace (Phải) */}
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
                  Chọn một collection ở Sidebar bên trái để truy vấn...
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
                    .map((tab) => (
                      <QueryTab key={tab.id} tab={tab} />
                    ))}
                </>
              )}
            </div>
          )}

          <ConnectionManager isOpen={showManager} onClose={() => setShowManager(false)} />
        </main>
      </div>

      {/* 3. Footer / Status Bar & Logs */}
      {showLogs && (
        <div className="h-48 bg-bg-secondary border-t border-border flex flex-col shrink-0 animate-in slide-in-from-bottom-2">
          <div className="px-3 py-1.5 bg-bg-tertiary border-b border-border text-xs font-semibold flex justify-between items-center">
            <span className="flex items-center gap-1.5">
              <TerminalSquare size={13} /> Output Logs
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={clearLogs}
                className="text-text-secondary hover:text-white transition-colors"
              >
                Clear
              </button>
              <button
                onClick={() => setShowLogs(false)}
                className="text-text-secondary hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="flex-1 p-2 overflow-auto font-mono text-[11px] leading-relaxed flex flex-col gap-1">
            {logs.length === 0 ? (
              <div className="text-text-secondary italic">No logs available.</div>
            ) : (
              logs.map((l) => (
                <div key={l.id} className="flex gap-2">
                  <span className="text-text-secondary shrink-0">[{l.time}]</span>
                  <span className={l.type === 'error' ? 'text-red-400' : 'text-text-primary'}>
                    {l.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      <footer
        onClick={() => setShowLogs(!showLogs)}
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
              <button className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2 opacity-50 cursor-not-allowed">
                Create Database
              </button>
              <button className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2 opacity-50 cursor-not-allowed">
                Server Status
              </button>
              <button className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2 opacity-50 cursor-not-allowed">
                Host Info
              </button>
              <button className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2 opacity-50 cursor-not-allowed">
                MongoDB Version
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
              <button className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2 opacity-50 cursor-not-allowed">
                <BarChart size={13} /> Database Statistics
              </button>
              <div className="h-px bg-border my-1" />
              <button className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2 opacity-50 cursor-not-allowed">
                Current Operations
              </button>
              <button className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2 opacity-50 cursor-not-allowed">
                Kill Operation...
              </button>
              <div className="h-px bg-border my-1" />
              <button className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2 opacity-50 cursor-not-allowed">
                Repair Database...
              </button>
              <button
                onClick={() => handleDropDatabase(sidebarMenu.connId, sidebarMenu.dbName)}
                className="w-full text-left px-4 py-1.5 hover:bg-red-500 hover:text-white flex items-center gap-2 text-red-400"
              >
                <Trash2 size={13} /> Drop Database...
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
    </div>
  )
}

export default App
