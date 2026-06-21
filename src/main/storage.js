import { app, ipcMain, safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

function getStoragePath(filename) {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, filename)
}

/**
 * Encrypt a string using Electron safeStorage (Keychain/DPAPI)
 * Returns a hex-encoded string of the encrypted buffer.
 */
function encryptSecret(plainText) {
  if (!plainText || !safeStorage.isEncryptionAvailable()) return plainText
  try {
    return safeStorage.encryptString(plainText).toString('hex')
  } catch (e) {
    console.error('[Storage] Encryption failed:', e)
    return plainText
  }
}

/**
 * Decrypt a hex-encoded string using Electron safeStorage
 */
function decryptSecret(encryptedHex) {
  if (!encryptedHex || !safeStorage.isEncryptionAvailable()) return encryptedHex
  try {
    const buffer = Buffer.from(encryptedHex, 'hex')
    return safeStorage.decryptString(buffer)
  } catch (e) {
    // If decryption fails, it might be legacy plain text
    return encryptedHex
  }
}

function initStorageHandlers() {
  // --- Connections ---
  ipcMain.handle('storage:getConnections', () => {
    try {
      const filePath = getStoragePath('connections.json')
      if (!existsSync(filePath)) return []
      const data = readFileSync(filePath, 'utf-8')
      const connections = JSON.parse(data)

      // Decrypt sensitive fields on load
      return connections.map((conn) => ({
        ...conn,
        authPass: decryptSecret(conn.authPass),
        sshPass: decryptSecret(conn.sshPass),
        sshPassphrase: decryptSecret(conn.sshPassphrase),
        tlsClientKeyPassphrase: decryptSecret(conn.tlsClientKeyPassphrase)
      }))
    } catch (err) {
      console.error('Error reading connections.json', err)
      return []
    }
  })

  ipcMain.handle('storage:saveConnections', (_, connections) => {
    try {
      const filePath = getStoragePath('connections.json')

      // Encrypt sensitive fields before saving
      const encryptedConnections = connections.map((conn) => ({
        ...conn,
        authPass: encryptSecret(conn.authPass),
        sshPass: encryptSecret(conn.sshPass),
        sshPassphrase: encryptSecret(conn.sshPassphrase),
        tlsClientKeyPassphrase: encryptSecret(conn.tlsClientKeyPassphrase)
      }))

      writeFileSync(filePath, JSON.stringify(encryptedConnections, null, 2), 'utf-8')
      return true
    } catch (err) {
      console.error('Error writing connections.json', err)
      throw err
    }
  })

  // --- Workspace (Encrypted Tabs/Queries) ---
  ipcMain.handle('storage:getWorkspace', () => {
    try {
      const filePath = getStoragePath('workspace.json')
      if (!existsSync(filePath)) return null
      const data = readFileSync(filePath, 'utf-8')
      const session = JSON.parse(data)

      if (session && Array.isArray(session.lastSession)) {
        session.lastSession = session.lastSession.map((tab) => ({
          ...tab,
          query: decryptSecret(tab.query)
        }))
      }
      return session
    } catch (err) {
      console.error('Error reading workspace.json', err)
      return null
    }
  })

  ipcMain.handle('storage:saveWorkspace', (_, session) => {
    try {
      const filePath = getStoragePath('workspace.json')
      const encryptedSession = {
        ...session,
        lastSession: session.lastSession.map((tab) => ({
          ...tab,
          query: encryptSecret(tab.query)
        }))
      }
      writeFileSync(filePath, JSON.stringify(encryptedSession, null, 2), 'utf-8')
      return true
    } catch (err) {
      console.error('Error writing workspace.json', err)
      return false
    }
  })

  // --- History (Encrypted Queries) ---
  ipcMain.handle('storage:getHistory', () => {
    try {
      const filePath = getStoragePath('history.json')
      if (!existsSync(filePath)) return []
      const data = readFileSync(filePath, 'utf-8')
      const records = JSON.parse(data)

      return records.map((record) => ({
        ...record,
        query: decryptSecret(record.query)
      }))
    } catch (err) {
      console.error('Error reading history.json', err)
      return []
    }
  })

  ipcMain.handle('storage:saveHistory', (_, records) => {
    try {
      const filePath = getStoragePath('history.json')
      const encryptedRecords = records.map((record) => ({
        ...record,
        query: encryptSecret(record.query)
      }))
      writeFileSync(filePath, JSON.stringify(encryptedRecords, null, 2), 'utf-8')
      return true
    } catch (err) {
      console.error('Error writing history.json', err)
      return false
    }
  })

  // --- Saved aggregation pipelines (not sensitive, stored as plain JSON) ---
  ipcMain.handle('storage:getPipelines', () => {
    try {
      const filePath = getStoragePath('pipelines.json')
      if (!existsSync(filePath)) return []
      return JSON.parse(readFileSync(filePath, 'utf-8'))
    } catch (err) {
      console.error('Error reading pipelines.json', err)
      return []
    }
  })

  ipcMain.handle('storage:savePipelines', (_, pipelines) => {
    try {
      const filePath = getStoragePath('pipelines.json')
      writeFileSync(filePath, JSON.stringify(pipelines, null, 2), 'utf-8')
      return true
    } catch (err) {
      console.error('Error writing pipelines.json', err)
      return false
    }
  })

  // --- Generic Generic FS (Unencrypted) ---
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
    const filePath = getStoragePath('connections.json')
    if (!existsSync(filePath)) return null
    const data = readFileSync(filePath, 'utf-8')
    const connections = JSON.parse(data)
    const conn = connections.find((c) => String(c.id) === String(id))
    if (conn) {
      return {
        ...conn,
        authPass: decryptSecret(conn.authPass),
        sshPass: decryptSecret(conn.sshPass),
        sshPassphrase: decryptSecret(conn.sshPassphrase),
        tlsClientKeyPassphrase: decryptSecret(conn.tlsClientKeyPassphrase)
      }
    }
    return null
  } catch (err) {
    console.error('Error reading connection by ID', err)
    return null
  }
}

export { initStorageHandlers, getConnectionById }
