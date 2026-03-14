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
      // Mở 1 local TCP server ẩn danh trên port ngẫu nhiên
      const server = net.createServer((socket) => {
        console.log(`[SSH] Local connection received, forwarding to ${targetHost}:${targetPort}`)
        sshClient.forwardOut(
          '127.0.0.1',
          socket.remotePort,
          normalizedTargetHost,
          targetPort,
          (err, stream) => {
            if (err) {
              console.error('SSH Forward Error', err)
              socket.end()
              return
            }
            socket.pipe(stream).pipe(socket)
          }
        )
      })

      server.listen(0, '127.0.0.1', () => {
        const localPort = server.address().port
        resolve({
          localPort,
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
      readyTimeout: 10000
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
