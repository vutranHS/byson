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
        // 2. Migration: Check legacy localStorage
        const legacy = localStorage.getItem('leafbase-workspace')
        if (legacy) {
          try {
            const parsed = JSON.parse(legacy)
            if (parsed.state) {
               const legacySession = { 
                 lastSession: parsed.state.lastSession || [],
                 lastSavedAt: parsed.state.lastSavedAt
               }
               set({ ...legacySession, isInitialized: true })
               // Sync to IPC immediately to migrate and encrypt it
               await get().saveLastSession(legacySession.lastSession)
            }
            // Clear legacy from insecure storage
            localStorage.removeItem('leafbase-workspace')
          } catch (e) {
            console.error('[Workspace] Migration from localStorage failed:', e)
          }
        }
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
