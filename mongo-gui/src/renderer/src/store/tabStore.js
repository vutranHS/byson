import { create } from 'zustand'
import { useConnectionStore } from './connectionStore'
import { useLogStore } from './logStore'

export const useTabStore = create((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (tabInfo) => {
    // tabInfo = { title, dbName, collectionName, type: 'query'|'shell' }
    const { tabs } = get()

    // TODO: Có thể check nếu tab collection này đã mở thì focus vào nó
    const newId = `tab-${Date.now()}`

    // Auto-generate query based on title/collection
    const defaultQuery = tabInfo.collectionName
      ? `db.getCollection('${tabInfo.collectionName}').find({})`
      : `// New Shell`

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
      limit: 50,
      ...tabInfo
    }

    set({
      tabs: [...tabs, newTab],
      activeTabId: newId
    })

    // Auto-run query for collections
    if (tabInfo.collectionName) {
      setTimeout(() => get().executeTabQuery(newId), 50)
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
      // Mỗi Tab tự nhớ connId của mình
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
        set({
          tabs: get().tabs.map((t) =>
            t.id === id
              ? {
                  ...t,
                  loading: false,
                  results: result.data,
                  execTime: result.execTime
                }
              : t
          )
        })
      } else {
        useLogStore.getState().addLog(`Query error: ${result.error}`, 'error')
        set({
          tabs: get().tabs.map((t) =>
            t.id === id ? { ...t, loading: false, error: result.error } : t
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
