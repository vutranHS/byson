import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useHistoryStore = create(
  persist(
    (set, get) => ({
      records: [], // Array of { id, timestamp, connName, dbName, collectionName, query, isStarred }

      addRecord: (record) => {
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
        
        // Enforce 500 hard cap (ignore starred items from being counting against the cap or just keep it simple)
        // Simple approach: prune non-starred items from the tail if length > 500
        if (nextRecords.length > 500) {
          const starred = nextRecords.filter(r => r.isStarred)
          const unstarred = nextRecords.filter(r => !r.isStarred).slice(0, 500 - starred.length)
          nextRecords = [...starred, ...unstarred].sort((a, b) => b.timestamp - a.timestamp)
        }

        set({ records: nextRecords })
      },

      toggleStar: (id) => {
        set({
          records: get().records.map(r => r.id === id ? { ...r, isStarred: !r.isStarred } : r)
        })
      },

      removeRecord: (id) => {
        set({
          records: get().records.filter(r => r.id !== id)
        })
      },

      clearHistory: () => {
        // Keep starred items when clearing!
        set({ records: get().records.filter(r => r.isStarred) })
      }
    }),
    {
      name: 'leafbase-history'
    }
  )
)
