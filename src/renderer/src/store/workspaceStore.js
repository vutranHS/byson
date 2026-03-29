import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useWorkspaceStore = create(
  persist(
    (set) => ({
      lastSession: [], // Array of tabs without results
      lastSavedAt: null,

      saveLastSession: (tabs) => {
        // Strip heavy payloads (results, error, execTime, loading metadata)
        const scrubbedTabs = tabs.map((t) => {
          const { results, error, execTime, warning, ...safeMeta } = t
          return safeMeta
        })
        
        set({ 
          lastSession: scrubbedTabs,
          lastSavedAt: Date.now()
        })
      },
      
      clearSession: () => set({ lastSession: [], lastSavedAt: null })
    }),
    {
      name: 'leafbase-workspace'
    }
  )
)
