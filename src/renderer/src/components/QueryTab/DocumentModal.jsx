/* eslint-disable react/prop-types */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/rules-of-hooks */
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { Server, Database, FileText } from 'lucide-react'
import { useConnectionStore } from '../../store/connectionStore'

export default function DocumentModal({
  connId,
  isOpen,
  onClose,
  mode, // 'view', 'edit', 'insert'
  initialDocument,
  dbName,
  collectionName,
  onSave
}) {
  const [content, setContent] = useState('')
  const [error, setError] = useState(null)
  const { connections } = useConnectionStore()

  const activeConnection = connections.find((c) => c.id === connId)
  const connectionName = activeConnection?.name || 'localhost:27017'

  useEffect(() => {
    if (isOpen) {
      if (mode === 'insert' && !initialDocument) {
        setContent('{\n  \n}')
      } else {
        setContent(JSON.stringify(initialDocument, null, 2))
      }
      setError(null)
    }
  }, [isOpen, initialDocument, mode])

  if (!isOpen) return null

  const handleValidate = () => {
    try {
      JSON.parse(content)
      setError(null)
      alert('Valid JSON')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleSave = () => {
    try {
      const parsed = JSON.parse(content)
      setError(null)
      onSave && onSave(parsed)
    } catch (err) {
      setError(err.message)
    }
  }

  const title =
    mode === 'view' ? 'View Document' : mode === 'edit' ? 'Edit Document' : 'Insert Document'

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="bg-bg-primary w-full max-w-4xl h-[85vh] flex flex-col rounded-lg shadow-2xl border border-border overflow-hidden">
        {/* Header */}
        <div className="h-10 bg-bg-tertiary border-b border-border flex items-center justify-center relative font-medium text-sm select-none">
          {title}
        </div>

        {/* Breadcrumb Path */}
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 text-xs bg-bg-secondary select-none text-text-secondary">
          <Server size={14} className="opacity-70" /> {connectionName}
          <span className="opacity-30">❯</span>
          <Database size={14} className="opacity-70" /> {dbName || 'unknown_db'}
          <span className="opacity-30">❯</span>
          <FileText size={14} className="opacity-70" /> {collectionName || 'unknown_collection'}
        </div>

        {/* Editor */}
        <div className="flex-1 relative bg-[#1e1e1e]">
          <Editor
            height="100%"
            language="json"
            theme="vs-dark"
            value={content}
            onChange={(val) => {
              setContent(val)
              setError(null)
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              readOnly: mode === 'view',
              lineNumbers: 'on',
              wordWrap: 'on',
              padding: { top: 12 },
              formatOnPaste: true,
              scrollBeyondLastLine: false
            }}
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="px-4 py-2 bg-red-400/10 text-red-400 text-xs border-t border-red-400/20 font-mono">
            Error: {error}
          </div>
        )}

        {/* Footer */}
        <div className="p-3 bg-bg-secondary border-t border-border flex items-center justify-between">
          <div>
            {mode !== 'view' && (
              <button
                onClick={handleValidate}
                className="px-4 py-1.5 flex items-center gap-2 rounded border border-border bg-bg-tertiary hover:bg-bg-primary text-xs transition-colors"
              >
                <span className="text-accent opacity-80">!</span> Validate
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-5 py-1.5 rounded border border-border bg-bg-tertiary hover:bg-bg-primary text-xs font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            {mode !== 'view' && (
              <button
                onClick={handleSave}
                className="px-5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-sm transition-colors cursor-pointer"
              >
                Save
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
