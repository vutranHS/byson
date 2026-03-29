import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useSettingsStore = create(
  persist(
    (set) => ({
      defaultPageSize: 50,
      autoSaveHistory: true,
      setDefaultPageSize: (size) => set({ defaultPageSize: size }),
      setAutoSaveHistory: (val) => set({ autoSaveHistory: val }),
    }),
    {
      name: 'leafbase-settings',
    }
  )
)
