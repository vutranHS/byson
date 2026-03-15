import { create } from 'zustand'

export const useConnectionStore = create((set, get) => ({
  connections: [],
  selectedId: null, // used for Dialog Manager focus

  // connectionId -> { databases: ['sys', 'local'] }
  activeConnections: {},

  // nodeId -> bool
  // nodeIds can be: `conn_${id}` or `db_${id}_${dbName}`
  expandedNodes: {},

  // `${connId}_${dbName}` -> ['col1', 'col2']
  dbCollections: {},

  connecting: false,
  error: null,

  // Load connections from JSON file via IPC
  loadConnections: async () => {
    try {
      const data = await window.electron.ipcRenderer.invoke('storage:getConnections')
      set({ connections: data || [] })
      if (data && data.length > 0) {
        set({ selectedId: data[0].id })
      }
    } catch (error) {
      console.error('Failed to load connections:', error)
    }
  },

  // Update the connection list and save to disk
  saveConnections: async (newConns) => {
    try {
      set({ connections: newConns })
      await window.electron.ipcRenderer.invoke('storage:saveConnections', newConns)
    } catch (error) {
      console.error('Failed to save connections:', error)
    }
  },

  // Select a connection profile
  selectConnection: (id) => set({ selectedId: id }),

  // Establish connection (IPC call)
  connectToDatabase: async (id) => {
    set({ connecting: true, error: null })
    const { connections } = get()
    const conn = connections.find((c) => c.id === id)
    if (!conn) {
      set({ connecting: false, error: 'Connection not found' })
      return false
    }

    try {
      const result = await window.electron.ipcRenderer.invoke('db:connect', conn)
      if (result.ok) {
        set({
          activeConnections: {
            ...get().activeConnections,
            [id]: { databases: result.databases || [], version: result.version || 'unknown' }
          },
          connecting: false
        })
        return true
      } else {
        set({ error: result.error, connecting: false })
        return false
      }
    } catch (err) {
      set({ error: err.message, connecting: false })
      return false
    }
  },

  // Disconnect from a specific server
  disconnectDatabase: async (connId) => {
    const { activeConnections } = get()
    if (!activeConnections[connId]) return
    try {
      await window.electron.ipcRenderer.invoke('db:disconnect', connId)
      const newActive = { ...activeConnections }
      delete newActive[connId]
      
      const newExpanded = { ...get().expandedNodes }
      delete newExpanded[`conn_${connId}`]
      
      set({ 
        activeConnections: newActive,
        expandedNodes: newExpanded
      })
    } catch (err) {
      console.error(err)
    }
  },

  // Toggle expansion of any node on the tree. param `nodeType` = 'conn' | 'db', `id` = connId, `name` = dbName (optional)
  toggleNode: async (nodeType, id, name) => {
    const { expandedNodes, activeConnections, dbCollections } = get()
    const nodeId = nodeType === 'conn' ? `conn_${id}` : `db_${id}_${name}`
    const isExpanded = !!expandedNodes[nodeId]

    // Toggle UI immediately
    set({ expandedNodes: { ...expandedNodes, [nodeId]: !isExpanded } })

    // If expanding a connection that isn't connected, initiate connection
    if (!isExpanded && nodeType === 'conn' && !activeConnections[id]) {
      get().connectToDatabase(id)
    }

    // If expanding a database that hasn't loaded collections yet
    if (!isExpanded && nodeType === 'db') {
      const cacheKey = `${id}_${name}`
      if (!dbCollections[cacheKey]) {
        get().refreshCollections(id, name)
      }
    }
  },

  refreshCollections: async (connId, dbName) => {
    try {
      const result = await window.electron.ipcRenderer.invoke('db:listCollections', {
        connId,
        dbName
      })
      if (result.ok) {
        set({
          dbCollections: { ...get().dbCollections, [`${connId}_${dbName}`]: result.collections }
        })
      }
    } catch (err) {
      console.error('Failed to load collections', err)
    }
  },

  refreshDatabases: async (connId) => {
    const { connections } = get()
    if (!connId) return
    const conn = connections.find((c) => c.id === connId)
    if (!conn) return

    try {
      const result = await window.electron.ipcRenderer.invoke('db:connect', conn)
      if (result.ok) {
        set({
          activeConnections: {
            ...get().activeConnections,
            [connId]: { databases: result.databases || [] }
          }
        })
      }
    } catch (err) {
      console.error('refreshDatabases err', err)
    }
  },

  // ${connId}_${dbName}_${colName} -> [{ name, key, size, usage }]
  collectionIndexes: {},

  refreshIndexes: async (connId, dbName, colName) => {
    try {
      const [idxRes, statsRes, collStatsRes] = await Promise.all([
        window.electron.ipcRenderer.invoke('db:listIndexes', { connId, dbName, collectionName: colName }),
        window.electron.ipcRenderer.invoke('db:indexStats', { connId, dbName, collectionName: colName }),
        window.electron.ipcRenderer.invoke('db:collStats', { connId, dbName, collectionName: colName })
      ])

      if (idxRes.ok) {
        // Index sizes are in collStatsRes.stats.indexSizes (object: name -> size)
        const indexSizes = (collStatsRes.ok && collStatsRes.stats.indexSizes) || {}

        // Merge basic index info with stats and sizes
        const indexes = idxRes.indexes.map(idx => {
          const stat = statsRes.ok ? statsRes.stats.find(s => s.name === idx.name) : null
          return {
            ...idx,
            size: indexSizes[idx.name] || 0,
            usageCount: stat ? stat.accesses?.ops || 0 : 0,
            since: stat ? stat.accesses?.since : null
          }
        })

        set({
          collectionIndexes: {
            ...get().collectionIndexes,
            [`${connId}_${dbName}_${colName}`]: indexes
          }
        })
        return { ok: true, indexes }
      }
      return { ok: false, error: idxRes.error }
    } catch (err) {
      console.error('Failed to fetch indexes', err)
      return { ok: false, error: err.message }
    }
  },

  // Add a new connection profile
  addConnection: (conn) => {
    const { connections, saveConnections } = get()
    const newId = connections.length > 0 ? Math.max(...connections.map((c) => c.id)) + 1 : 1
    const newConn = { ...conn, id: newId }
    saveConnections([...connections, newConn])
    set({ selectedId: newId })
  },

  // Update an existing connection profile
  updateConnection: (id, updatedData) => {
    const { connections, saveConnections } = get()
    const newConns = connections.map((c) => (c.id === id ? { ...c, ...updatedData } : c))
    saveConnections(newConns)
  },

  // Remove a connection profile
  removeConnection: (id) => {
    const { connections, saveConnections, selectedId } = get()
    const newConns = connections.filter((c) => c.id !== id)
    saveConnections(newConns)
    if (selectedId === id) {
      set({ selectedId: newConns.length > 0 ? newConns[0].id : null })
    }
  },

  // Clone
  cloneConnection: (id) => {
    const { connections, addConnection } = get()
    const connToClone = connections.find((c) => c.id === id)
    if (connToClone) {
      const cloned = { ...connToClone, name: `${connToClone.name} (Copy)` }
      delete cloned.id
      addConnection(cloned)
    }
  }
}))
