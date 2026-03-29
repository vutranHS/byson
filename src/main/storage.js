import { app, ipcMain } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const STORAGE_FILE = 'connections.json'

function getStoragePath() {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, STORAGE_FILE)
}

function initStorageHandlers() {
  ipcMain.handle('storage:getConnections', () => {
    try {
      const filePath = getStoragePath()
      if (!existsSync(filePath)) {
        return []
      }
      const data = readFileSync(filePath, 'utf-8')
      return JSON.parse(data)
    } catch (err) {
      console.error('Error reading connections.json', err)
      return []
    }
  })

  ipcMain.handle('storage:saveConnections', (_, connections) => {
    try {
      const filePath = getStoragePath()
      writeFileSync(filePath, JSON.stringify(connections, null, 2), 'utf-8')
      return true
    } catch (err) {
      console.error('Error writing connections.json', err)
      throw err
    }
  })

  ipcMain.handle('fs:writeFile', async (_, { filePath, content }) => {
    try {
      writeFileSync(filePath, content, 'utf-8')
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('fs:readFile', async (_, filePath) => {
    try {
      const data = readFileSync(filePath, 'utf-8')
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })
}

function getConnectionById(id) {
  try {
    const filePath = getStoragePath()
    if (!existsSync(filePath)) return null
    const data = readFileSync(filePath, 'utf-8')
    const connections = JSON.parse(data)
    return connections.find(c => c.id === id) || null
  } catch (err) {
    console.error('Error reading connection by ID', err)
    return null
  }
}

export { initStorageHandlers, getConnectionById }
