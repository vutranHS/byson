import { create } from 'zustand'
import { useConnectionStore } from './connectionStore'
import { useLogStore } from './logStore'

import { useSettingsStore } from './settingsStore'
import { useWorkspaceStore } from './workspaceStore'

export const useTabStore = create((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (tabInfo) => {
    // tabInfo = { title, dbName, collectionName, type: 'query'|'shell' }
    const { tabs } = get()

    // TODO: Consider checking if this collection tab is already open and focusing on it instead
    const newId = `tab-${Date.now()}`

    // Auto-generate query based on title/collection
    const defaultQuery = tabInfo.type === 'indexes'
      ? ''
      : tabInfo.collectionName
        ? `db.getCollection('${tabInfo.collectionName}').find({})`
        : `// New Shell`

    const defaultPageSize = useSettingsStore.getState().defaultPageSize || 50

    const newTab = {
      id: newId,
      title: tabInfo.title || 'New Tab',
      type: tabInfo.type || 'query',
      connId: tabInfo.connId,
      dbName: tabInfo.dbName,
      collectionName: tabInfo.collectionName,
      query: defaultQuery,
      results: null,
      viewMode: 'tree',
      skip: 0,
      limit: defaultPageSize,
      ...tabInfo
    }

    set({
      tabs: [...tabs, newTab],
      activeTabId: newId
    })

    // Auto-run query for collections or refresh indexes
    if (tabInfo.collectionName) {
      if (tabInfo.type === 'indexes') {
        useConnectionStore.getState().refreshIndexes(tabInfo.connId, tabInfo.dbName, tabInfo.collectionName)
      } else if (tabInfo.type !== 'export' && tabInfo.type !== 'import') {
        // Don't auto-run for export/import tabs as they have their own UI
        setTimeout(() => get().executeTabQuery(newId), 50)
      }
    }
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get()
    const newTabs = tabs.filter((t) => t.id !== id)
    set({
      tabs: newTabs,
      activeTabId:
        activeTabId === id
          ? newTabs.length > 0
            ? newTabs[newTabs.length - 1].id
            : null
          : activeTabId
    })
  },

  closeAllTabs: () => {
    set({ tabs: [], activeTabId: null })
  },

  closeOtherTabs: (id) => {
    const { tabs } = get()
    const targetTab = tabs.find((t) => t.id === id)
    if (!targetTab) return
    set({ tabs: [targetTab], activeTabId: id })
  },

  closeTabsToTheRight: (id) => {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx === -1) return
    const newTabs = tabs.slice(0, idx + 1)
    const isTargetStillActive = newTabs.some((t) => t.id === activeTabId)
    set({ 
      tabs: newTabs, 
      activeTabId: isTargetStillActive ? activeTabId : id 
    })
  },

  duplicateTab: (id) => {
    const { tabs } = get()
    const tabToClone = tabs.find((t) => t.id === id)
    if (!tabToClone) return
    
    const newId = `tab-${Date.now()}`
    const newTab = { ...tabToClone, id: newId }
    // Strip results and errors from clone
    delete newTab.results
    delete newTab.error
    delete newTab.execTime
    
    set({
      tabs: [...tabs, newTab],
      activeTabId: newId
    })
  },

  restoreWorkspace: (workspaceTabs) => {
    if (!workspaceTabs || !workspaceTabs.length) return
    
    // Add new unique IDs to avoid any React key collisions on restore
    const restoredTabs = workspaceTabs.map(t => ({
      ...t,
      id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      loading: false,
      results: null,
      error: null
    }))
    
    set({
      tabs: restoredTabs,
      activeTabId: restoredTabs[0].id // Focus first tab
    })
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTabContent: (id, newQuery) => {
    const { tabs } = get()
    set({
      tabs: tabs.map((t) => (t.id === id ? { ...t, query: newQuery } : t))
    })
  },

  setTabPagination: (id, skip, limit) => {
    const { tabs } = get()
    set({
      tabs: tabs.map((t) => (t.id === id ? { ...t, skip, limit } : t))
    })
  },

  setTabViewMode: (id, mode) => {
    const { tabs } = get()
    set({
      tabs: tabs.map((t) => (t.id === id ? { ...t, viewMode: mode } : t))
    })
  },

  executeTabQuery: async (id, overrideSkip, overrideLimit) => {
    const { tabs } = get()
    const tab = tabs.find((t) => t.id === id)
    if (!tab) return

    const skip = overrideSkip !== undefined ? overrideSkip : tab.skip
    const limit = overrideLimit !== undefined ? overrideLimit : tab.limit

    // Set loading state and new pagination
    set({
      tabs: get().tabs.map((t) =>
        t.id === id ? { ...t, loading: true, error: null, skip, limit } : t
      )
    })

    try {
      // Each tab tracks its own connection ID
      const connId = tab.connId
      const connName =
        useConnectionStore.getState().connections.find((c) => c.id === connId)?.name || 'Unknown'

      useLogStore.getState().addLog(`Executing query in ${connName}/${tab.dbName}...`)

      const result = await window.electron.ipcRenderer.invoke('db:runQuery', {
        connId,
        dbName: tab.dbName,
        query: tab.query,
        options: { skip, limit }
      })

      if (result.ok) {
        useLogStore.getState().addLog(`Query completed in ${result.execTime}ms`, 'success')
        
        // Ensure sidebar mirrors the active query
        useConnectionStore.getState().expandToCollection(connId, tab.dbName)
        
        set({
          tabs: get().tabs.map((t) =>
            t.id === id
              ? {
                  ...t,
                  loading: false,
                  results: result.data,
                  totalCount: result.totalCount !== undefined ? result.totalCount : t.totalCount,
                  execTime: result.execTime,
                  warning: result.warning
                }
              : t
          )
        })
      } else {
        useLogStore.getState().addLog(`Query error: ${result.error}`, 'error')
        set({
          tabs: get().tabs.map((t) =>
            t.id === id ? { ...t, loading: false, error: result.error, warning: null } : t
          )
        })
      }
    } catch (err) {
      useLogStore.getState().addLog(`System error: ${err.message}`, 'error')
      set({
        tabs: get().tabs.map((t) =>
          t.id === id ? { ...t, loading: false, error: err.message } : t
        )
      })
    }
  }
}))

// Auto-save the workspace on any tab change
useTabStore.subscribe((state, prevState) => {
  if (state.tabs !== prevState.tabs) {
    useWorkspaceStore.getState().saveLastSession(state.tabs)
  }
})
