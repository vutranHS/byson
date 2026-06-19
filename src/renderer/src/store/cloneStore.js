import { create } from 'zustand'

// Clone (sync) jobs are long-running and the user often switches to another tab
// while one is in flight. Tab content is unmounted when inactive (see App.jsx),
// so clone state cannot live in CloneTab's local React state — it would reset to
// idle on every tab switch and the running job would appear blank ("trắng trơn").
//
// This store persists one job per tab id, and a single global db:syncProgress
// listener (registered once below) routes incoming progress to the right job by
// operationId, so jobs keep updating even while their tab is not mounted.

const makeJob = (defaults = {}) => ({
  operationId: null,
  status: 'idle', // idle | running | paused | completed | error
  progress: null, // { processed, total }
  logs: [],
  targetConnId: defaults.targetConnId ?? '',
  targetDb: defaults.targetDb ?? '',
  targetCol: defaults.targetCol ?? '',
  options: defaults.options ?? {
    createIfNotExists: true,
    dropTarget: false,
    batchSize: 5000,
    parallelThreads: 5
  }
})

export const useCloneStore = create((set, get) => ({
  jobs: {}, // tabId -> job

  // Create the persistent job for a tab if it doesn't exist yet.
  ensureJob: (tabId, defaults) => {
    if (get().jobs[tabId]) return
    set((s) => ({ jobs: { ...s.jobs, [tabId]: makeJob(defaults) } }))
  },

  patchJob: (tabId, patch) =>
    set((s) => {
      const prev = s.jobs[tabId] || makeJob()
      const next = typeof patch === 'function' ? patch(prev) : patch
      return { jobs: { ...s.jobs, [tabId]: { ...prev, ...next } } }
    }),

  addLog: (tabId, msg, type = 'info') =>
    set((s) => {
      const prev = s.jobs[tabId] || makeJob()
      const logs = [...prev.logs, { time: new Date().toLocaleTimeString(), msg, type }].slice(-500)
      return { jobs: { ...s.jobs, [tabId]: { ...prev, logs } } }
    }),

  // Arm a fresh run: assign the operationId and reset progress/logs.
  startJob: (tabId, operationId) =>
    set((s) => {
      const prev = s.jobs[tabId] || makeJob()
      return {
        jobs: {
          ...s.jobs,
          [tabId]: {
            ...prev,
            operationId,
            status: 'running',
            progress: null,
            logs: [{ time: new Date().toLocaleTimeString(), msg: `Starting clone job: ${operationId}`, type: 'info' }]
          }
        }
      }
    }),

  removeJob: (tabId) =>
    set((s) => {
      if (!s.jobs[tabId]) return s
      const next = { ...s.jobs }
      delete next[tabId]
      return { jobs: next }
    })
}))

// Apply a db:syncProgress payload to whichever job owns its operationId.
const applyProgress = (data) => {
  const store = useCloneStore.getState()
  const entry = Object.entries(store.jobs).find(
    ([, j]) => j.operationId && j.operationId === data.operationId
  )
  if (!entry) return
  const tabId = entry[0]

  if (data.phase === 'error') {
    store.patchJob(tabId, { status: 'error' })
    store.addLog(tabId, `Error: ${data.error}`, 'error')
  } else if (data.phase === 'abort' || data.stopped) {
    store.patchJob(tabId, { status: 'idle' })
    store.addLog(tabId, 'Clone aborted manually.', 'warning')
  } else if (data.phase === 'pause' || data.paused) {
    store.patchJob(tabId, { status: 'paused' })
    store.addLog(tabId, 'Clone paused.', 'warning')
  } else if (data.completed) {
    store.patchJob(tabId, { status: 'completed' })
    store.addLog(tabId, 'Clone completed successfully!', 'success')
  } else {
    if (data.status) store.addLog(tabId, data.status, 'info')
    if (data.processed !== undefined && data.total !== undefined) {
      store.patchJob(tabId, { progress: { processed: data.processed, total: data.total } })
    }
  }
}

// Register the single global progress listener once (renderer only).
if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
  window.electron.ipcRenderer.on('db:syncProgress', (_event, data) => applyProgress(data))
}
