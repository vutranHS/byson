import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initStorageHandlers } from './storage'
import { initDbHandlers } from './db'
import { autoUpdater } from 'electron-updater'

// Global Exception Handler to swallow benign network errors that might crash the app
process.on('uncaughtException', (err) => {
  const isNetworkOrSshError = (
    err.code === 'ECONNRESET' || 
    err.message.includes('Not connected') ||
    err.message.includes('socket hang up') ||
    err.message.includes('broken pipe')
  )
  
  if (isNetworkOrSshError) {
    console.warn('[Global Uncaught Muted]', err.code || 'NetworkError', err.message)
    // Don't throw, let the reconnect logic handle it in the background
    return
  }
  
  // If it's a critical logic error, log it heavily
  console.error('[Global Uncaught Exception]', err)
})

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    mainWindow.maximize()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.handle('shell:saveFile', async (_, options) => {
    const result = await dialog.showSaveDialog(options)
    if (!result.canceled && result.filePath) {
      return result.filePath
    }
    return null
  })

  ipcMain.handle('shell:openFile', async (_, options) => {
    const result = await dialog.showOpenDialog({
      ...options,
      properties: ['openFile']
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  })

  // Initialize IPC listeners for connection settings storage (read/write)
  initStorageHandlers()

  // Initialize IPC listeners for MongoDB driver operations
  initDbHandlers()

  // Setup Auto Updater
  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available. Downloading now...`
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Mandatory Update Ready',
      message: `Version ${info.version} has been downloaded. The application will now restart to apply this mandatory update.`,
      buttons: ['Restart Now'],
      defaultId: 0,
      cancelId: 0
    }).then(() => {
      autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (err) => {
    console.error('Auto Updater Error:', err)
  })

  autoUpdater.checkForUpdatesAndNotify()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
