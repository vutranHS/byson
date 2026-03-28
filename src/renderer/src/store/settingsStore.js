import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useSettingsStore = create(
  persist(
    (set) => ({
      defaultPageSize: 50,
      setDefaultPageSize: (size) => set({ defaultPageSize: size }),
    }),
    {
      name: 'leafbase-settings',
    }
  )
)
