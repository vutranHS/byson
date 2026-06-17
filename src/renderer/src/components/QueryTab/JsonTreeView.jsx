/* eslint-disable no-unused-vars */
/* eslint-disable react/prop-types */

/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/rules-of-hooks */
import {
  useState,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo
} from 'react'
import {
  ChevronRight,
  ChevronDown,
  Copy,
  Maximize2,
  Minimize2,
  Trash,
  Edit,
  Plus,
  FileText,
  CheckSquare
} from 'lucide-react'
import DocumentModal from './DocumentModal'
import { useConnectionStore } from '../../store/connectionStore'
import { useSmartMenu } from '../../hooks/useSmartMenu'
import { formatBsonDate } from '../../utils/bsonFormat'

const TreeContext = createContext({})

// Helper to determine Mongo type from EJSON
const getMongoType = (val) => {
  if (val === null) return 'Null'
  if (typeof val === 'boolean') return 'Boolean'
  if (typeof val === 'number') return Number.isInteger(val) ? 'Int32' : 'Double'
  if (typeof val === 'string') return 'String'
  if (Array.isArray(val)) return 'Array'
  if (typeof val === 'object') {
    if (val.$oid) return 'ObjectId'
    if (val.$date) return 'Date'
    return 'Object'
  }
  return 'Unknown'
}

const formatValue = (val, type) => {
  if (type === 'ObjectId') return `ObjectId("${val.$oid}")`
  if (type === 'Date') return formatBsonDate(val.$date)
  if (type === 'String') return `"${val}"`
  if (type === 'Object') return `{ ${Object.keys(val).length} fields }`
  if (type === 'Array') return `[ ${val.length} elements ]`
  return String(val)
}

const formatValueForClipboard = (value) => {
  if (value === null) return 'null'
  if (typeof value === 'undefined') return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const isCopyShortcut = (event) =>
  (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c'

const shouldIgnoreCopyShortcut = (event) => {
  const target = event.target
  if (!target) return false

  const tagName = target.tagName?.toLowerCase()
  if (tagName === 'input' || tagName === 'textarea' || target.isContentEditable) return true
  if (target.closest?.('.monaco-editor')) return true

  const selectedText = window.getSelection?.().toString()
  return Boolean(selectedText)
}

const TreeNode = ({
  name,
  value,
  depth = 0,
  indexLabel,
  forcedExpansionSignal,
  rootIndex,
  path
}) => {
  const [expanded, setExpanded] = useState(false)
  const {
    onContextMenu,
    selectedIndices,
    onMouseDown,
    onMouseEnter,
    selectedField,
    onSelectField
  } = useContext(TreeContext)

  // Listen for recursive signals from parent (Expand/Collapse All)
  useEffect(() => {
    if (forcedExpansionSignal) {
      setExpanded(forcedExpansionSignal.expand)
    }
  }, [forcedExpansionSignal])

  const type = getMongoType(value)
  const isExpandable = type === 'Object' || type === 'Array'
  const displayValue = formatValue(value, type)

  const handleToggle = (e) => {
    // Only toggle if not starting a drag on root or if it's nested
    if (isExpandable) setExpanded(!expanded)
  }

  const handleRightClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    onContextMenu(e, {
      name,
      value,
      isExpandable,
      type,
      toggleExpand: () => setExpanded(!expanded),
      triggerRecursive: (expand) => setLocalForceSignal({ expand, time: Date.now() }),
      rootIndex // Pass root index for bulk actions
    })
  }

  const [localForceSignal, setLocalForceSignal] = useState(null)

  // Propagate signal to children: use local signal if present, otherwise pass down parent signal
  const activeSignal = localForceSignal || forcedExpansionSignal

  const typeColors = {
    String: 'text-green-500 bg-green-500/10 border-green-500/20',
    Int32: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    Double: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    Boolean: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
    ObjectId: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    Date: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
    Array: 'text-pink-500 bg-pink-500/10 border-pink-500/20',
    Object: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
    Null: 'text-red-500 bg-red-500/10 border-red-500/20'
  }

  const isSelected = rootIndex !== undefined && selectedIndices?.has(rootIndex)
  const isSelectedField = selectedField?.path === path

  const handleSelectField = (e) => {
    e.stopPropagation()
    onSelectField?.({ path, name, value })
  }

  return (
    <>
      <tr
        onContextMenu={handleRightClick}
        onMouseDown={(e) => rootIndex !== undefined && onMouseDown?.(e, rootIndex)}
        onMouseEnter={() => rootIndex !== undefined && onMouseEnter?.(rootIndex)}
        className={`border-b border-bg-tertiary cursor-pointer text-xs group transition-colors ${
          isSelected ? 'row-selected' : 'hover:bg-bg-tertiary/50'
        }`}
        onClick={handleToggle}
      >
        <td
          className="px-2 py-1 flex items-center select-none"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {isExpandable ? (
            <span className="text-text-secondary mr-1">
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          ) : (
            <span className="w-[18px] inline-block"></span>
          )}

          {rootIndex !== undefined && isSelected ? (
            <CheckSquare size={12} className="text-accent mr-1.5" />
          ) : (
            indexLabel &&
            typeof indexLabel === 'number' && (
              <span className="text-accent opacity-80 mr-1">({indexLabel})</span>
            )
          )}

          <span
            className={`${isExpandable ? 'font-medium text-text-primary' : 'text-text-primary opacity-90'}`}
          >
            {name}
          </span>
        </td>
        <td
          onMouseDown={handleSelectField}
          className={`px-3 py-1 text-text-secondary truncate max-w-[400px] cursor-cell transition-colors ${isSelectedField ? 'bg-accent/10 ring-1 ring-inset ring-accent/70 text-text-primary' : 'hover:bg-white/5'}`}
          title="Click to select value, Cmd/Ctrl+C to copy"
        >
          {displayValue}
        </td>
        <td className="px-3 py-1">
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded font-mono border ${typeColors[type] || 'text-text-secondary bg-bg-tertiary border-border/30'}`}
          >
            {type}
          </span>
        </td>
      </tr>

      {expanded &&
        isExpandable &&
        type === 'Object' &&
        Object.keys(value).map((k) => (
          <TreeNode
            key={k}
            name={k}
            value={value[k]}
            depth={depth + 1}
            forcedExpansionSignal={activeSignal}
            path={`${path}.${k}`}
          />
        ))}

      {expanded &&
        isExpandable &&
        type === 'Array' &&
        value.map((v, i) => (
          <TreeNode
            key={i}
            name={`[${i}]`}
            value={v}
            depth={depth + 1}
            forcedExpansionSignal={activeSignal}
            path={`${path}[${i}]`}
          />
        ))}
    </>
  )
}

export default function JsonTreeView({ connId, data, dbName, collectionName, onRefresh }) {
  const { connections } = useConnectionStore()
  const activeConnection = connections.find((c) => c.id === connId)
  const {
    menu: menuConfig,
    menuRef,
    openMenu: setMenuConfig,
    closeMenu,
    style: menuStyle
  } = useSmartMenu()

  // Selection state
  const [selectedIndices, setSelectedIndices] = useState(new Set())
  const [selectedField, setSelectedField] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState(null)

  // Modal state for View/Edit/Insert Document
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    mode: 'view', // 'view'|'edit'|'insert'
    document: null
  })

  useEffect(() => {
    setSelectedField(null)
  }, [data])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        closeMenu()
      }
    }
    const handleGlobalMouseUp = () => {
      setIsDragging(false)
      setDragStart(null)
      document.body.classList.remove('selecting-active')
    }
    window.addEventListener('click', handleClickOutside)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => {
      window.removeEventListener('click', handleClickOutside)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [])

  if (!Array.isArray(data) || data.length === 0) {
    return <div className="p-4 text-text-secondary italic text-sm">No records found.</div>
  }

  const handleContextMenu = (e, ctx) => {
    // If the right-clicked row is a document root and not in current selection, select ONLY this one
    if (ctx.rootIndex !== undefined && !selectedIndices.has(ctx.rootIndex)) {
      setSelectedIndices(new Set([ctx.rootIndex]))
    }

    setMenuConfig({
      x: e.clientX,
      y: e.clientY,
      selectedCount:
        ctx.rootIndex !== undefined && selectedIndices.has(ctx.rootIndex)
          ? selectedIndices.size
          : 1,
      ...ctx
    })
  }

  const handleMouseDown = (e, index) => {
    if (e.button !== 0) return // Only primary click

    setIsDragging(true)
    setDragStart(index)
    document.body.classList.add('selecting-active')

    if (e.shiftKey && dragStart !== null) {
      updateSelectionRange(dragStart, index)
    } else if (e.metaKey || e.ctrlKey) {
      const next = new Set(selectedIndices)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      setSelectedIndices(next)
    } else {
      setSelectedIndices(new Set([index]))
    }
  }

  const handleMouseEnter = (index) => {
    if (isDragging && dragStart !== null) {
      updateSelectionRange(dragStart, index)
    }
  }

  const updateSelectionRange = (start, end) => {
    const range = new Set()
    const low = Math.min(start, end)
    const high = Math.max(start, end)
    for (let i = low; i <= high; i++) {
      range.add(i)
    }
    setSelectedIndices(range)
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    setMenuConfig(null)
  }

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!selectedField || !isCopyShortcut(event) || shouldIgnoreCopyShortcut(event)) return

      event.preventDefault()
      copyToClipboard(formatValueForClipboard(selectedField.value))
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedField])

  const openDocumentModal = (mode, doc) => {
    setModalConfig({ isOpen: true, mode, document: doc })
    setMenuConfig(null)
  }

  const handleSaveDocument = async (parsedDoc) => {
    try {
      let res
      if (!window.electron) return

      if (modalConfig.mode === 'insert') {
        res = await window.electron.ipcRenderer.invoke('db:insertDocument', {
          connId,
          dbName,
          collectionName,
          document: parsedDoc
        })
      } else if (modalConfig.mode === 'edit') {
        res = await window.electron.ipcRenderer.invoke('db:updateDocument', {
          connId,
          dbName,
          collectionName,
          document: parsedDoc
        })
      }

      if (res && res.ok) {
        setModalConfig({ ...modalConfig, isOpen: false })
        if (onRefresh) onRefresh()
      } else {
        alert('Error saving document: ' + (res?.error || 'Unknown error'))
      }
    } catch (e) {
      alert('Error saving: ' + e.message)
    }
  }

  const handleDeleteDocument = async (doc) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return

    try {
      if (!window.electron) return

      const res = await window.electron.ipcRenderer.invoke('db:deleteDocument', {
        connId,
        dbName,
        collectionName,
        documentId: doc._id
      })

      if (res && res.ok) {
        if (onRefresh) onRefresh()
      } else {
        alert('Error deleting document: ' + (res?.error || 'Unknown error'))
      }
    } catch (e) {
      alert('Error deleting: ' + e.message)
    }
  }

  const handleDeleteMultiple = async () => {
    const count = selectedIndices.size
    if (!window.confirm(`Are you sure you want to delete ${count} selected documents?`)) return

    try {
      if (!window.electron) return

      const docsToDelete = Array.from(selectedIndices).map((idx) => data[idx])
      const documentIds = docsToDelete.map((d) => d._id)

      const res = await window.electron.ipcRenderer.invoke('db:deleteDocuments', {
        connId,
        dbName,
        collectionName,
        documentIds
      })

      if (res && res.ok) {
        setSelectedIndices(new Set())
        if (onRefresh) onRefresh()
      } else {
        alert('Error deleting documents: ' + (res?.error || 'Unknown error'))
      }
    } catch (e) {
      alert('Error deleting: ' + e.message)
    }
    setMenuConfig(null)
  }

  return (
    <TreeContext.Provider
      value={{
        onContextMenu: handleContextMenu,
        selectedIndices,
        onMouseDown: handleMouseDown,
        onMouseEnter: handleMouseEnter,
        selectedField,
        onSelectField: setSelectedField
      }}
    >
      <div
        className="overflow-auto h-full w-full bg-bg-primary relative"
        onContextMenu={(e) => e.preventDefault()}
      >
        <table className="w-full text-left border-collapse whitespace-nowrap text-sm">
          <thead className="sticky top-0 bg-bg-tertiary shadow-sm z-10 text-xs">
            <tr>
              <th className="px-3 py-1.5 border border-border font-medium text-text-secondary w-1/3">
                Key
              </th>
              <th className="px-3 py-1.5 border border-border font-medium text-text-secondary w-1/2">
                Value
              </th>
              <th className="px-3 py-1.5 border border-border font-medium text-text-secondary">
                Type
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((doc, idx) => {
              const label = doc._id && doc._id.$oid ? `ObjectId("${doc._id.$oid}")` : `Document`
              return (
                <TreeNode
                  key={idx}
                  name={label}
                  value={doc}
                  depth={0}
                  indexLabel={idx + 1}
                  rootIndex={idx}
                  path={`root:${idx}`}
                />
              )
            })}
          </tbody>
        </table>

        {/* Context Menu Window */}
        {menuConfig && (
          <div
            ref={menuRef}
            className="fixed bg-bg-secondary border border-border rounded shadow-2xl py-1 z-50 text-xs text-text-primary min-w-[200px]"
            style={menuStyle}
          >
            {menuConfig.selectedCount > 1 ? (
              <>
                <div className="px-4 py-2 text-[10px] uppercase font-bold text-text-secondary border-b border-border mb-1">
                  Bulk Action ({menuConfig.selectedCount} objects)
                </div>
                <button
                  onClick={handleDeleteMultiple}
                  className="w-full text-left px-4 py-1.5 hover:bg-red-500 hover:text-white flex items-center gap-2 text-red-400"
                >
                  <Trash size={13} /> Delete Documents...
                </button>
              </>
            ) : (
              <>
                {menuConfig.isExpandable && (
                  <>
                    <button
                      onClick={() => {
                        menuConfig.triggerRecursive(true)
                        setMenuConfig(null)
                      }}
                      className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
                    >
                      <Maximize2 size={13} /> Expand Recursively
                    </button>
                    <button
                      onClick={() => {
                        menuConfig.triggerRecursive(false)
                        setMenuConfig(null)
                      }}
                      className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
                    >
                      <Minimize2 size={13} /> Collapse Recursively
                    </button>
                    <div className="h-px bg-border my-1" />
                  </>
                )}

                <button
                  onClick={() => openDocumentModal('edit', menuConfig.value)}
                  className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
                >
                  <Edit size={13} /> Edit Document...
                </button>
                <button
                  onClick={() => openDocumentModal('view', menuConfig.value)}
                  className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
                >
                  <FileText size={13} /> View Document...
                </button>
                <button
                  onClick={() => openDocumentModal('insert', null)}
                  className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
                >
                  <Plus size={13} /> Insert Document...
                </button>

                <div className="h-px bg-border my-1" />

                <button
                  onClick={() => copyToClipboard(JSON.stringify(menuConfig.value, null, 2))}
                  className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
                >
                  <Copy size={13} /> Copy JSON
                </button>
                <button
                  onClick={() => copyToClipboard(formatValueForClipboard(menuConfig.value))}
                  className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
                >
                  <Copy size={13} /> Copy Value
                </button>

                <div className="h-px bg-border my-1" />

                <button
                  onClick={() => {
                    setMenuConfig(null)
                    handleDeleteDocument(menuConfig.value)
                  }}
                  className="w-full text-left px-4 py-1.5 hover:bg-red-500 hover:text-white flex items-center gap-2 text-red-400"
                >
                  <Trash size={13} /> Delete Document...
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Document Modal (View/Edit/Insert) */}
      <DocumentModal
        connId={connId}
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
        mode={modalConfig.mode}
        initialDocument={modalConfig.document}
        dbName={dbName}
        collectionName={collectionName}
        onSave={handleSaveDocument}
      />
    </TreeContext.Provider>
  )
}
