import { create } from 'zustand'

// Saved aggregation pipelines, persisted via the main process (pipelines.json).
// Each record: { id, name, collectionName, pipeline: [{ op, body, enabled }], createdAt }
export const usePipelineStore = create((set, get) => ({
  records: [],
  isInitialized: false,

  initStore: async () => {
    if (get().isInitialized) return
    try {
      const records = await window.electron.ipcRenderer.invoke('storage:getPipelines')
      set({ records: Array.isArray(records) ? records : [], isInitialized: true })
    } catch (err) {
      console.error('[Pipelines] Initialization Error:', err)
      set({ isInitialized: true })
    }
  },

  savePipeline: async ({ name, collectionName, pipeline }) => {
    const record = {
      id: `pipe-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name,
      collectionName,
      pipeline,
      createdAt: Date.now()
    }
    const next = [record, ...get().records]
    set({ records: next })
    await get().saveToStorage(next)
    return record
  },

  removePipeline: async (id) => {
    const next = get().records.filter((r) => r.id !== id)
    set({ records: next })
    await get().saveToStorage(next)
  },

  saveToStorage: async (records) => {
    await window.electron.ipcRenderer.invoke('storage:savePipelines', records)
  }
}))
