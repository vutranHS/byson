import { Client } from 'ssh2'
import net from 'net'
import fs from 'fs'

/**
 * Creates an SSH tunnel for port forwarding.
 *
 * @param {Object} sshConfig - SSH settings (host, user, etc.)
 * @param {String} targetHost - The ultimate destination host (e.g., MongoDB server IP)
 * @param {Number} targetPort - The ultimate destination port (e.g., 27017)
 * @returns {Promise<{ localPort: Number, close: Function }>}
 */
export async function createSSHTunnel(sshConfig, targetHost, targetPort) {
  return new Promise((resolve, reject) => {
    const normalizedTargetHost = targetHost === 'localhost' ? '127.0.0.1' : targetHost
    const sshClient = new Client()

    sshClient.on('ready', () => {
      console.log(`[SSH] Tunnel ready to local port forwarding...`)
      // Open an anonymous local TCP server on a random port
      const server = net.createServer((socket) => {
        console.log(`[SSH] Local connection received, forwarding to ${targetHost}:${targetPort}`)
        sshClient.forwardOut(
          '127.0.0.1',
          socket.remotePort,
          normalizedTargetHost,
          targetPort,
          (err, stream) => {
            if (err) {
              console.error('[SSH] Forward Error:', err.message)
              socket.end()
              return
            }

            // [FIX] Handle errors on both sides of the pipe to prevent unhandled ECONNRESET popups on Windows
            socket.on('error', (err) => {
              console.warn(`[SSH] Local socket error (${err.code}): ${err.message}`)
              stream.end()
            })

            stream.on('error', (err) => {
              console.warn(`[SSH] SSH stream error (${err.code}): ${err.message}`)
              socket.end()
            })

            socket.pipe(stream).pipe(socket)
          }
        )
      })

      server.listen(0, '127.0.0.1', () => {
        const localPort = server.address().port
        resolve({
          localPort,
          sshClient,
          close: () => {
            server.close()
            sshClient.end()
          }
        })
      })

      server.on('error', (err) => {
        reject(err)
        sshClient.end()
      })
    })

    sshClient.on('error', (err) => {
      reject(new Error(`SSH Connection Error: ${err.message}`))
    })

    const connectConfig = {
      host: sshConfig.sshHost,
      port: parseInt(sshConfig.sshPort) || 22,
      username: sshConfig.sshUser || 'root',
      readyTimeout: 15000,
      // [FIX] Add keep-alive to prevent SSH connection drops during idle periods
      keepaliveInterval: 10000,
      keepaliveCountMax: 3
    }

    if (sshConfig.sshAuthMethod === 'Password') {
      connectConfig.password = sshConfig.sshPass
    } else {
      if (sshConfig.sshKeyPath) {
        try {
          connectConfig.privateKey = fs.readFileSync(sshConfig.sshKeyPath)
        } catch (err) {
          return reject(new Error('Failed to read private key: ' + err.message))
        }
      }
      if (sshConfig.sshPassphrase) {
        connectConfig.passphrase = sshConfig.sshPassphrase
      }
    }

    try {
      sshClient.connect(connectConfig)
    } catch (e) {
      reject(e)
    }
  })
}
