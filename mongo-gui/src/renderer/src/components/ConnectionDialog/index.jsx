/* eslint-disable react/prop-types */
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react'
import { useConnectionStore } from '../../store/connectionStore'

export default function ConnectionDialog({ isOpen, onClose, connection }) {
  const [activeTab, setActiveTab] = useState('connection')
  const [testStatus, setTestStatus] = useState(null)
  const { addConnection, updateConnection } = useConnectionStore()

  const defaultForm = {
    name: 'New Connection',
    type: 'Direct Connection',
    host: 'localhost',
    port: '27017',

    // Auth
    hasAuth: false,
    authDb: 'admin',
    authUser: '',
    authPass: '',
    authMech: 'SCRAM-SHA-1',

    // SSH
    hasSsh: false,
    sshHost: '',
    sshPort: '22',
    sshUser: 'root',
    sshAuthMethod: 'Password',
    sshPass: '',
    sshKeyPath: '',
    sshPassphrase: '',

    // TLS
    hasTls: false,
    tlsAuthMethod: 'Self-signed Certificate',
    tlsCaPath: '',

    // Advanced
    defaultDb: '',
    replicaSet: '',
    readPreference: 'Primary (Default)'
  }

  const [formData, setFormData] = useState(defaultForm)

  // Reset fields when connection opens/changes
  useEffect(() => {
    if (isOpen) {
      setTestStatus(null)
      setActiveTab('connection')

      if (connection) {
        let hostPart = 'localhost'
        let portPart = '27017'
        if (connection.host) {
          const parts = connection.host.split(':')
          hostPart = parts[0]
          if (parts.length > 1) portPart = parts[1]
        }

        setFormData({
          ...defaultForm,
          ...connection,
          host: hostPart,
          port: portPart
        })
      } else {
        setFormData({ ...defaultForm })
      }
    }
  }, [isOpen, connection])

  const handleSave = () => {
    const finalData = {
      ...formData,
      host: `${formData.host || 'localhost'}:${formData.port || '27017'}`
    }

    // Xoá 2 trường tạm để dữ liệu build JSON đúng cấu trúc mock cũ
    delete finalData.port

    if (connection?.id) {
      updateConnection(connection.id, finalData)
    } else {
      addConnection(finalData)
    }
    onClose()
  }

  const handleTest = async () => {
    setTestStatus({ loading: true })
    const hostToTest = `${formData.host || 'localhost'}:${formData.port || '27017'}`
    const connConfig = { ...formData, host: hostToTest }

    try {
      const result = await window.electron.ipcRenderer.invoke('db:testConnection', connConfig)
      if (result.ok) {
        setTestStatus({ success: `Connected successfully! (Server v${result.version})` })
      } else {
        setTestStatus({ error: result.error })
      }
    } catch (err) {
      setTestStatus({ error: err.message || 'Unknown IPC error' })
    }
  }

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  if (!isOpen) return null

  const tabs = [
    { id: 'connection', label: 'Connection' },
    { id: 'auth', label: 'Authentication' },
    { id: 'ssh', label: 'SSH' },
    { id: 'tls', label: 'TLS' },
    { id: 'advanced', label: 'Advanced' }
  ]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-bg-secondary border border-border rounded-lg shadow-2xl w-[650px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary flex justify-between items-center">
          <h2 className="text-sm font-semibold text-text-primary">
            {connection ? `Edit: ${formData.name}` : 'New Connection'}
          </h2>
          <button onClick={onClose} className="text-text-secondary hover:text-white">
            ✕
          </button>
        </div>

        {/* Custom Tab Bar */}
        <div className="flex bg-bg-tertiary border-b border-border px-4 pt-2 gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 text-xs font-medium rounded-t-md border-t border-l border-r border-transparent transition-colors ${
                activeTab === tab.id
                  ? 'bg-bg-secondary text-text-primary border-t-border border-l-border border-r-border relative top-[1px]'
                  : 'text-text-secondary hover:text-white hover:bg-bg-secondary/50'
              }`}
            >
              {tab.label}
              {tab.id === 'auth' && formData.hasAuth && (
                <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-accent inline-block"></span>
              )}
              {tab.id === 'ssh' && formData.hasSsh && (
                <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-accent inline-block"></span>
              )}
              {tab.id === 'tls' && formData.hasTls && (
                <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-accent inline-block"></span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 bg-bg-secondary p-4 min-h-[350px]">
          {activeTab === 'connection' && (
            <div className="flex flex-col gap-4 text-sm text-text-secondary animate-in fade-in duration-200">
              <div className="flex gap-4 items-center">
                <label className="w-24 text-right">Type:</label>
                <select
                  value={formData.type}
                  onChange={(e) => updateField('type', e.target.value)}
                  className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary outline-none focus:border-accent"
                >
                  <option>Direct Connection</option>
                  <option>Replica Set</option>
                </select>
              </div>
              <div className="flex gap-4 items-center">
                <label className="w-24 text-right">Name:</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex gap-4 items-center">
                <label className="w-24 text-right">Host:</label>
                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={formData.host}
                    onChange={(e) => updateField('host', e.target.value)}
                    className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
                  />
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => updateField('port', e.target.value)}
                    className="w-24 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'auth' && (
            <div className="flex flex-col gap-4 text-sm text-text-secondary animate-in fade-in duration-200">
              <div className="flex gap-4 items-start">
                <input
                  type="checkbox"
                  id="useAuth"
                  className="mt-1"
                  checked={formData.hasAuth}
                  onChange={(e) => updateField('hasAuth', e.target.checked)}
                />
                <div className="flex flex-col gap-3 flex-1">
                  <label htmlFor="useAuth" className="text-text-primary font-medium cursor-pointer">
                    Perform authentication
                  </label>

                  <div
                    className={`flex flex-col gap-3 transition-opacity ${!formData.hasAuth ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <div className="flex gap-4 items-center">
                      <label className="w-24 text-right">Database:</label>
                      <input
                        type="text"
                        value={formData.authDb}
                        onChange={(e) => updateField('authDb', e.target.value)}
                        className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="flex gap-4 items-center">
                      <label className="w-24 text-right">User Name:</label>
                      <input
                        type="text"
                        value={formData.authUser}
                        onChange={(e) => updateField('authUser', e.target.value)}
                        className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="flex gap-4 items-center">
                      <label className="w-24 text-right">Password:</label>
                      <input
                        type="password"
                        value={formData.authPass}
                        onChange={(e) => updateField('authPass', e.target.value)}
                        className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="flex gap-4 items-center">
                      <label className="w-24 text-right">Auth Mech:</label>
                      <select
                        value={formData.authMech}
                        onChange={(e) => updateField('authMech', e.target.value)}
                        className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary outline-none focus:border-accent"
                      >
                        <option>SCRAM-SHA-1</option>
                        <option>SCRAM-SHA-256</option>
                        <option>MONGODB-CR</option>
                        <option>X.509</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ssh' && (
            <div className="flex flex-col gap-4 text-sm text-text-secondary animate-in fade-in duration-200">
              <div className="flex gap-4 items-start">
                <input
                  type="checkbox"
                  id="useSsh"
                  className="mt-1"
                  checked={formData.hasSsh}
                  onChange={(e) => updateField('hasSsh', e.target.checked)}
                />
                <div className="flex flex-col gap-3 flex-1">
                  <label htmlFor="useSsh" className="text-text-primary font-medium cursor-pointer">
                    Use SSH tunnel
                  </label>

                  <div
                    className={`flex flex-col gap-3 transition-opacity ${!formData.hasSsh ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <div className="flex gap-4 items-center">
                      <label className="w-24 text-right">SSH Address:</label>
                      <div className="flex-1 flex gap-2">
                        <input
                          type="text"
                          placeholder="Server IP or Hostname"
                          value={formData.sshHost}
                          onChange={(e) => updateField('sshHost', e.target.value)}
                          className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
                        />
                        <input
                          type="number"
                          value={formData.sshPort}
                          onChange={(e) => updateField('sshPort', e.target.value)}
                          className="w-20 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
                        />
                      </div>
                    </div>
                    <div className="flex gap-4 items-center">
                      <label className="w-24 text-right">User Name:</label>
                      <input
                        type="text"
                        placeholder="root"
                        value={formData.sshUser}
                        onChange={(e) => updateField('sshUser', e.target.value)}
                        className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="flex gap-4 items-center">
                      <label className="w-24 text-right">Auth Method:</label>
                      <select
                        value={formData.sshAuthMethod}
                        onChange={(e) => updateField('sshAuthMethod', e.target.value)}
                        className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary outline-none focus:border-accent"
                      >
                        <option>Password</option>
                        <option>Private Key</option>
                      </select>
                    </div>

                    {formData.sshAuthMethod === 'Password' && (
                      <div className="flex gap-4 items-center animate-in fade-in slide-in-from-top-2">
                        <label className="w-24 text-right">Password:</label>
                        <input
                          type="password"
                          placeholder="SSH Password"
                          value={formData.sshPass}
                          onChange={(e) => updateField('sshPass', e.target.value)}
                          className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
                        />
                      </div>
                    )}

                    {formData.sshAuthMethod === 'Private Key' && (
                      <>
                        <div className="flex gap-4 items-center animate-in fade-in slide-in-from-top-2">
                          <label className="w-24 text-right">Private Key:</label>
                          <div className="flex-1 flex gap-2">
                            <input
                              type="text"
                              placeholder="Select .pem file..."
                              value={formData.sshKeyPath}
                              onChange={(e) => updateField('sshKeyPath', e.target.value)}
                              className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
                            />
                            <button
                              onClick={async () => {
                                const path = await window.electron.ipcRenderer.invoke(
                                  'dialog:openFile',
                                  {
                                    properties: ['openFile'],
                                    filters: [
                                      { name: 'PEM Keys', extensions: ['pem', 'key'] },
                                      { name: 'All Files', extensions: ['*'] }
                                    ]
                                  }
                                )
                                if (path) updateField('sshKeyPath', path)
                              }}
                              className="px-2 py-1 bg-bg-secondary border border-border rounded text-text-secondary hover:text-white transition-colors"
                            >
                              ...
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-4 items-center">
                          <label className="w-24 text-right">Passphrase:</label>
                          <input
                            type="password"
                            placeholder="Optional passphrase for key"
                            value={formData.sshPassphrase}
                            onChange={(e) => updateField('sshPassphrase', e.target.value)}
                            className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tls' && (
            <div className="flex flex-col gap-4 text-sm text-text-secondary animate-in fade-in duration-200">
              <div className="flex gap-4 items-start">
                <input
                  type="checkbox"
                  id="useTls"
                  className="mt-1"
                  checked={formData.hasTls}
                  onChange={(e) => updateField('hasTls', e.target.checked)}
                />
                <div className="flex flex-col gap-3 flex-1">
                  <label htmlFor="useTls" className="text-text-primary font-medium cursor-pointer">
                    Use TLS / SSL protocol
                  </label>

                  <div
                    className={`flex flex-col gap-3 transition-opacity ${!formData.hasTls ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <div className="flex gap-4 items-center">
                      <label className="w-24 text-right">Auth Method:</label>
                      <select
                        value={formData.tlsAuthMethod}
                        onChange={(e) => updateField('tlsAuthMethod', e.target.value)}
                        className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary outline-none focus:border-accent"
                      >
                        <option>Self-signed Certificate</option>
                        <option>CA Certificate</option>
                      </select>
                    </div>

                    {formData.tlsAuthMethod === 'CA Certificate' && (
                      <div className="flex gap-4 items-center animate-in fade-in slide-in-from-top-2">
                        <label className="w-24 text-right">CA Cert:</label>
                        <div className="flex-1 flex gap-2">
                          <input
                            type="text"
                            placeholder="Select .crt/.pem file..."
                            value={formData.tlsCaPath}
                            onChange={(e) => updateField('tlsCaPath', e.target.value)}
                            className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
                          />
                          <button
                            onClick={async () => {
                              const path = await window.electron.ipcRenderer.invoke(
                                'dialog:openFile',
                                {
                                  properties: ['openFile'],
                                  filters: [
                                    { name: 'Certificates', extensions: ['pem', 'crt', 'cer'] },
                                    { name: 'All Files', extensions: ['*'] }
                                  ]
                                }
                              )
                              if (path) updateField('tlsCaPath', path)
                            }}
                            className="px-2 py-1 bg-bg-secondary border border-border rounded text-text-secondary hover:text-white transition-colors"
                          >
                            ...
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="flex flex-col gap-4 text-sm text-text-secondary animate-in fade-in duration-200">
              <div className="flex gap-4 items-center">
                <label className="w-32 text-right">Default Database:</label>
                <input
                  type="text"
                  placeholder="test"
                  value={formData.defaultDb}
                  onChange={(e) => updateField('defaultDb', e.target.value)}
                  className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex gap-4 items-center">
                <label className="w-32 text-right">Replica Set Name:</label>
                <input
                  type="text"
                  value={formData.replicaSet}
                  onChange={(e) => updateField('replicaSet', e.target.value)}
                  className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex gap-4 items-center">
                <label className="w-32 text-right">Read Preference:</label>
                <select
                  value={formData.readPreference}
                  onChange={(e) => updateField('readPreference', e.target.value)}
                  className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary outline-none focus:border-accent"
                >
                  <option>Primary (Default)</option>
                  <option>Primary Preferred</option>
                  <option>Secondary</option>
                  <option>Secondary Preferred</option>
                  <option>Nearest</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-bg-tertiary flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button
              onClick={handleTest}
              disabled={testStatus?.loading}
              className="text-sm px-4 py-1.5 hover:bg-bg-secondary border border-border rounded text-text-primary transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {testStatus?.loading ? <span className="animate-spin text-accent">⟳</span> : null}
              {testStatus?.loading ? 'Testing...' : 'Test'}
            </button>
            {testStatus?.success && (
              <span className="text-sm text-green-500">{testStatus.success}</span>
            )}
            {testStatus?.error && (
              <span
                className="text-sm text-red-500 max-w-[200px] truncate"
                title={testStatus.error}
              >
                {testStatus.error}
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="text-sm px-4 py-1.5 hover:bg-bg-secondary border border-border rounded text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="text-sm px-4 py-1.5 bg-accent text-white rounded hover:bg-accent-hover transition-colors font-medium"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
