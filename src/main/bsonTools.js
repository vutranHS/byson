import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import https from 'https'
import { execFile } from 'child_process'
import AdmZip from 'adm-zip'

const TOOLS_VERSION = '100.15.0'

export function getToolsDir() {
  const userData = app.getPath('userData')
  return path.join(userData, 'tools')
}

export function getBinDir() {
  return path.join(getToolsDir(), 'bin')
}

export function checkBsonTools() {
  const binDir = getBinDir()
  const dumpName = process.platform === 'win32' ? 'mongodump.exe' : 'mongodump'
  const restoreName = process.platform === 'win32' ? 'mongorestore.exe' : 'mongorestore'

  const dumpPath = path.join(binDir, dumpName)
  const restorePath = path.join(binDir, restoreName)

  const exists = fs.existsSync(dumpPath) && fs.existsSync(restorePath)
  return { 
    exists, 
    path: binDir,
    dumpPath: exists ? dumpPath : null,
    restorePath: exists ? restorePath : null
  }
}

export async function downloadBsonTools(win) {
  const toolsDir = getToolsDir()
  const binDir = getBinDir()

  if (!fs.existsSync(toolsDir)) fs.mkdirSync(toolsDir, { recursive: true })
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true })

  const url = getDownloadUrl()
  const extension = url.endsWith('.zip') ? '.zip' : '.tgz'
  const zipPath = path.join(toolsDir, `tools${extension}`)

  console.log(`[BSON] Downloading tools from: ${url}`)
  
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(zipPath)
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`))
        return
      }

      const totalSize = parseInt(response.headers['content-length'], 10)
      let downloadedSize = 0

      response.on('data', (chunk) => {
        downloadedSize += chunk.length
        if (win) {
          win.webContents.send('db:downloadProgress', {
            phase: 'downloading',
            progress: Math.round((downloadedSize / totalSize) * 100)
          })
        }
      })

      response.pipe(file)

      file.on('finish', () => {
        file.close(async () => {
          try {
            if (win) win.webContents.send('db:downloadProgress', { phase: 'extracting', progress: 0 })
            
            console.log(`[BSON] Extracting tools...`)
            
            if (url.endsWith('.zip')) {
              const zip = new AdmZip(zipPath)
              zip.extractAllTo(toolsDir, true)
            } else {
              // Assume .tgz and use system tar
              await new Promise((res, rej) => {
                // SECURITY: execFile passes args directly (no shell), so paths
                // containing spaces or shell metacharacters (e.g. when userData
                // sits under "C:\Users\Foo & Bar\AppData\...") can't be interpreted
                // as a command. The previous exec() with template strings would
                // have evaluated those characters in cmd/bash.
                execFile('tar', ['-xzf', zipPath, '-C', toolsDir], (err) => {
                  if (err) rej(err)
                  else res()
                })
              })
            }

            // Move binaries to bin/
            // MongoDB zip usually contains a folder like mongodb-database-tools-<os>-<arch>-<version>/bin/
            const extractedFolders = fs.readdirSync(toolsDir).filter(f => f.startsWith('mongodb-database-tools-'))
            if (extractedFolders.length > 0) {
              const innerBinDir = path.join(toolsDir, extractedFolders[0], 'bin')
              const files = fs.readdirSync(innerBinDir)
              files.forEach(f => {
                const src = path.join(innerBinDir, f)
                const dest = path.join(binDir, f)
                fs.copyFileSync(src, dest)
                if (process.platform !== 'win32') {
                  fs.chmodSync(dest, 0o755)
                }
              })
              
              // Cleanup
              fs.rmSync(path.join(toolsDir, extractedFolders[0]), { recursive: true, force: true })
            }

            fs.unlinkSync(zipPath)
            
            if (win) win.webContents.send('db:downloadProgress', { phase: 'done', progress: 100 })
            resolve({ ok: true })
          } catch (err) {
            reject(err)
          }
        })
      })
    }).on('error', (err) => {
      fs.unlink(zipPath, () => reject(err))
    })
  })
}

function getDownloadUrl() {
  const platform = process.platform
  const arch = process.arch

  if (platform === 'win32') {
    return `https://fastdl.mongodb.org/tools/db/mongodb-database-tools-windows-x86_64-${TOOLS_VERSION}.zip`
  } else if (platform === 'darwin') {
    const archTag = arch === 'arm64' ? 'arm64' : 'x86_64'
    return `https://fastdl.mongodb.org/tools/db/mongodb-database-tools-macos-${archTag}-${TOOLS_VERSION}.zip`
  } else {
    // Generic Linux (Ubuntu 22.04) support
    return `https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2204-x86_64-${TOOLS_VERSION}.tgz`
  }
}
