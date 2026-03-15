import { create } from 'zustand'

export const useProfilerStore = create((set, get) => ({
  logs: [], // Array of log objects: { id, connectionId, type: 'start'|'success'|'error', commandName, duration, time, details }
  isRecording: false,

  setRecording: (status) => set({ isRecording: status }),

  addLog: (log) => {
    if (!get().isRecording) return

    set((state) => {
      // Keep only the latest 1000 logs to prevent memory issues
      const newLogs = [log, ...state.logs].slice(0, 1000)
      return { logs: newLogs }
    })
  },

  clearLogs: () => set({ logs: [] })
}))
