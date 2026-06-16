import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useSettingsStore = create(
  persist(
    (set) => ({
      defaultPageSize: 50,
      autoSaveHistory: true,
      theme: 'dark', // 'dark' | 'light'
      
      setDefaultPageSize: (size) => set({ defaultPageSize: size }),
      setAutoSaveHistory: (val) => set({ autoSaveHistory: val }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
    }),
    {
      name: 'byson-settings',
    }
  )
)
