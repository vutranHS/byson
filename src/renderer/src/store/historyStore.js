import { create } from 'zustand'

export const useHistoryStore = create((set, get) => ({
  records: [], // Array of { id, timestamp, connName, dbName, collectionName, query, isStarred }
  isInitialized: false,

  initStore: async () => {
    if (get().isInitialized) return
    
    try {
      // 1. Try to load from IPC (Encrypted storage)
      const records = await window.electron.ipcRenderer.invoke('storage:getHistory')
      
      if (records && records.length > 0) {
        set({ records, isInitialized: true })
      } else {
        // 2. Migration: Check legacy localStorage
        const legacy = localStorage.getItem('leafbase-history')
        if (legacy) {
          try {
            const parsed = JSON.parse(legacy)
            if (parsed.state && parsed.state.records) {
              set({ records: parsed.state.records, isInitialized: true })
              // Sync to IPC immediately to migrate and encrypt it
              await get().saveToStorage(parsed.state.records)
            }
            // Clear legacy from insecure storage
            localStorage.removeItem('leafbase-history')
          } catch (e) {
            console.error('[History] Migration from localStorage failed:', e)
          }
        }
        set({ isInitialized: true })
      }
    } catch (err) {
      console.error('[History] Initialization Error:', err)
      set({ isInitialized: true })
    }
  },

  addRecord: async (record) => {
    const { records } = get()
    
    // Prevent duplicate consecutive entries
    if (records.length > 0 && records[0].query.trim() === record.query.trim() && records[0].dbName === record.dbName) {
       return // skip duplicate
    }

    const newRecord = {
      id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: Date.now(),
      isStarred: false,
      ...record,
    }

    // Insert at beginning
    let nextRecords = [newRecord, ...records]
    
    // Enforce 500 hard cap
    if (nextRecords.length > 500) {
      const starred = nextRecords.filter(r => r.isStarred)
      const unstarred = nextRecords.filter(r => !r.isStarred).slice(0, 500 - starred.length)
      nextRecords = [...starred, ...unstarred].sort((a, b) => b.timestamp - a.timestamp)
    }

    set({ records: nextRecords })
    await get().saveToStorage(nextRecords)
  },

  toggleStar: async (id) => {
    const nextRecords = get().records.map(r => r.id === id ? { ...r, isStarred: !r.isStarred } : r)
    set({ records: nextRecords })
    await get().saveToStorage(nextRecords)
  },

  removeRecord: async (id) => {
    const nextRecords = get().records.filter(r => r.id !== id)
    set({ records: nextRecords })
    await get().saveToStorage(nextRecords)
  },

  clearHistory: async () => {
    // Keep starred items when clearing!
    const nextRecords = get().records.filter(r => r.isStarred)
    set({ records: nextRecords })
    await get().saveToStorage(nextRecords)
  },

  saveToStorage: async (records) => {
    await window.electron.ipcRenderer.invoke('storage:saveHistory', records)
  }
}))
