import { create } from 'zustand'

export const useLogStore = create((set) => ({
  logs: [],
  addLog: (message, type = 'info') =>
    set((state) => {
      const newLog = {
        id: Date.now() + Math.random().toString(36).substring(7),
        time: new Date().toLocaleTimeString(),
        message,
        type
      }
      return { logs: [...state.logs, newLog].slice(-100) } // Keep last 100 logs
    }),
  clearLogs: () => set({ logs: [] })
}))
