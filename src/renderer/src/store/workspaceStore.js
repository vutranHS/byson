import { create } from 'zustand'

export const useWorkspaceStore = create((set, get) => ({
  lastSession: [], // Array of tabs without results
  lastSavedAt: null,
  isInitialized: false,

  initStore: async () => {
    if (get().isInitialized) return
    
    try {
      // 1. Try to load from IPC (Encrypted storage)
      const session = await window.electron.ipcRenderer.invoke('storage:getWorkspace')
      
      if (session) {
        set({
          lastSession: session.lastSession || [],
          lastSavedAt: session.lastSavedAt,
          isInitialized: true
        })
      } else {
        set({ isInitialized: true })
      }
    } catch (err) {
      console.error('[Workspace] Initialization Error:', err)
      set({ isInitialized: true })
    }
  },

  saveLastSession: async (tabs) => {
    if (!tabs) return

    // Strip heavy payloads (results, error, execTime, loading metadata)
    const scrubbedTabs = tabs.map((t) => {
      // eslint-disable-next-line no-unused-vars
      const { results, error, execTime, warning, loading, ...safeMeta } = t
      return safeMeta
    })
    
    const session = { 
      lastSession: scrubbedTabs,
      lastSavedAt: Date.now()
    }
    
    set(session)
    
    // Save to encrypted storage via IPC
    await window.electron.ipcRenderer.invoke('storage:saveWorkspace', session)
  },
  
  clearSession: async () => {
    const empty = { lastSession: [], lastSavedAt: null }
    set(empty)
    await window.electron.ipcRenderer.invoke('storage:saveWorkspace', empty)
  }
}))
