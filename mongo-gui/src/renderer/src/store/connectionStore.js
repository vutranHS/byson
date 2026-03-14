import { create } from 'zustand'

export const useConnectionStore = create((set, get) => ({
  connections: [],
  selectedId: null,

  // Load danh sách từ file JSON thông qua IPC
  loadConnections: async () => {
    try {
      const data = await window.electron.ipcRenderer.invoke('storage:getConnections')
      set({ connections: data || [] })
      if (data && data.length > 0) {
        set({ selectedId: data[0].id })
      }
    } catch (error) {
      console.error('Failed to load connections:', error)
    }
  },

  // Set danh sách và lưu xuống đĩa
  saveConnections: async (newConns) => {
    try {
      set({ connections: newConns })
      await window.electron.ipcRenderer.invoke('storage:saveConnections', newConns)
    } catch (error) {
      console.error('Failed to save connections:', error)
    }
  },

  // Chọn connection
  selectConnection: (id) => set({ selectedId: id }),

  // Thêm mới
  addConnection: (conn) => {
    const { connections, saveConnections } = get()
    const newId = connections.length > 0 ? Math.max(...connections.map(c => c.id)) + 1 : 1
    const newConn = { ...conn, id: newId }
    saveConnections([...connections, newConn])
    set({ selectedId: newId })
  },

  // Cập nhật
  updateConnection: (id, updatedData) => {
    const { connections, saveConnections } = get()
    const newConns = connections.map(c => c.id === id ? { ...c, ...updatedData } : c)
    saveConnections(newConns)
  },

  // Xóa
  removeConnection: (id) => {
    const { connections, saveConnections, selectedId } = get()
    const newConns = connections.filter(c => c.id !== id)
    saveConnections(newConns)
    if (selectedId === id) {
      set({ selectedId: newConns.length > 0 ? newConns[0].id : null })
    }
  },
  
  // Clone
  cloneConnection: (id) => {
    const { connections, addConnection } = get()
    const connToClone = connections.find(c => c.id === id)
    if (connToClone) {
        const cloned = { ...connToClone, name: `${connToClone.name} (Copy)` }
        delete cloned.id
        addConnection(cloned)
    }
  }
}))
