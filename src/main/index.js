import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { mkdirSync, appendFileSync } from 'fs'
import { spawn } from 'child_process'
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

  // SECURITY: Only forward http(s)/mailto links to the OS shell. Without this
  // allowlist, a window.open('file:///...') or custom-scheme URL from the renderer
  // (or a compromised dependency) could trigger arbitrary file/handler execution
  // via shell.openExternal.
  const ALLOWED_OPEN_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])
  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const { protocol } = new URL(details.url)
      if (ALLOWED_OPEN_PROTOCOLS.has(protocol)) {
        shell.openExternal(details.url)
      } else {
        console.warn('[WindowOpen] Blocked disallowed protocol:', protocol, details.url)
      }
    } catch (err) {
      console.warn('[WindowOpen] Blocked invalid URL:', details.url, err.message)
    }
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

const logAutoUpdater = (message, details) => {
  const line = details
    ? `[AutoUpdater] ${message} ${JSON.stringify(details)}`
    : `[AutoUpdater] ${message}`

  console.log(line)

  try {
    const logDir = join(app.getPath('logs'), 'BysonDB')
    mkdirSync(logDir, { recursive: true })
    appendFileSync(join(logDir, 'updater.log'), `${new Date().toISOString()} ${line}\n`)
  } catch (err) {
    console.warn('[AutoUpdater] Failed to write updater log:', err.message)
  }
}

// macOS 26 (Tahoe / Darwin 25) and newer regressed Electron/Squirrel.Mac
// auto-update: after the app calls quitAndInstall(), Squirrel registers the
// ShipIt updater via SMJobSubmit, but launchd no longer performs the initial
// run (the job stays pended on an unsatisfiable SuccessfulExit semaphore). The
// update is downloaded and staged but never installed, and the app relaunches
// on the old version. Ref: electron/electron#50866, Squirrel/Squirrel.Mac#196.
const isAffectedMacOS = () => {
  if (process.platform !== 'darwin') return false
  // getSystemVersion() returns the macOS product version, e.g. "26.5.1".
  const major = parseInt(process.getSystemVersion?.().split('.')[0] || '0', 10)
  return major >= 26
}

const startShipItKickstartHelper = () => {
  if (!isAffectedMacOS()) return

  const appId = 'app.byson.desktop'
  const parentPid = process.pid
  // Wait for our own process to exit (ShipIt refuses to replace a running
  // bundle), then enable + kickstart the ShipIt launchd job ourselves, retrying
  // until the job actually runs.
  const script = `
label="${appId}.ShipIt"
domain="gui/$(id -u)/$label"
parent_pid="${parentPid}"
log_dir="$HOME/Library/Logs/byson/BysonDB"
mkdir -p "$log_dir"
log_file="$log_dir/shipit-kickstart.log"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) helper start, waiting for parent $parent_pid to exit" >> "$log_file"
# Wait for the main app process to fully exit (max ~15s).
for i in $(seq 1 60); do
  kill -0 "$parent_pid" 2>/dev/null || break
  sleep 0.25
done
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) parent exited, kickstarting $domain" >> "$log_file"
# Kickstart the ShipIt job, retrying until it has actually run (max ~20s).
for i in $(seq 1 40); do
  if launchctl print "$domain" >/dev/null 2>&1; then
    launchctl enable "$domain" >> "$log_file" 2>&1 || true
    launchctl kickstart -p "$domain" >> "$log_file" 2>&1 || true
    runs=$(launchctl print "$domain" 2>/dev/null | awk '/runs =/{print $3; exit}')
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) kickstart attempt $i, runs=$runs" >> "$log_file"
    [ -n "$runs" ] && [ "$runs" != "0" ] && exit 0
  fi
  sleep 0.5
done
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) gave up kickstarting $domain" >> "$log_file"
`

  const helper = spawn('/bin/sh', ['-c', script], {
    detached: true,
    stdio: 'ignore'
  })
  helper.unref()
  logAutoUpdater('Started ShipIt kickstart helper', { appId })
}

const installDownloadedUpdate = () => {
  logAutoUpdater('Preparing to quit and install update', {
    version: app.getVersion(),
    path: app.getPath('exe')
  })

  // macOS/Squirrel.Mac has a two-stage update flow. Keep autoInstallOnAppQuit
  // disabled and only arm the native Squirrel download/install after the user
  // confirms Restart Now. Do not close windows before calling quitAndInstall —
  // that can let the app quit before Squirrel/ShipIt has been armed.
  setImmediate(() => {
    app.removeAllListeners('window-all-closed')
    BrowserWindow.getAllWindows().forEach((window) => {
      window.removeAllListeners('close')
    })

    startShipItKickstartHelper()
    logAutoUpdater('Calling quitAndInstall() with autoInstallOnAppQuit=false')
    autoUpdater.quitAndInstall()
  })
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
  // SECURITY: Only enable auto-update on macOS where builds are signed/notarized.
  // Windows/Linux builds are currently unsigned (see RELEASE_GUIDE.md), so accepting
  // an auto-downloaded binary would be a supply-chain RCE vector. Users on those
  // platforms must update manually from the releases page until code-signing is set up.
  if (process.platform === 'darwin') {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.autoRunAppAfterInstall = true

    logAutoUpdater('Enabled', {
      version: app.getVersion(),
      path: app.getPath('exe'),
      platform: process.platform,
      arch: process.arch
    })

    autoUpdater.on('checking-for-update', () => {
      logAutoUpdater('Checking for update')
    })

    autoUpdater.on('update-not-available', (info) => {
      logAutoUpdater('No update available', info)
    })

    autoUpdater.on('update-available', (info) => {
      logAutoUpdater('Update available; downloading', info)
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `A new version (${info.version}) is available. Downloading now...`,
        detail: `Current version: ${app.getVersion()}`
      })
    })

    autoUpdater.on('download-progress', (progress) => {
      logAutoUpdater('Download progress', {
        percent: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      logAutoUpdater('Update downloaded', info)
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded. Restart BysonDB now to apply the update.`,
        detail: `Current version: ${app.getVersion()}\nInstall path: ${app.getPath('exe')}`,
        buttons: ['Restart Now'],
        defaultId: 0,
        cancelId: 0
      }).then(() => {
        installDownloadedUpdate()
      })
    })

    autoUpdater.on('before-quit-for-update', () => {
      logAutoUpdater('before-quit-for-update')
    })

    autoUpdater.on('error', (err) => {
      logAutoUpdater('Error', {
        message: err?.message,
        stack: err?.stack
      })
      console.error('[AutoUpdater] Error:', err)
    })

    autoUpdater.checkForUpdates()
  } else {
    logAutoUpdater(`Disabled on ${process.platform} - builds are unsigned. Update manually from the releases page.`)
  }

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
