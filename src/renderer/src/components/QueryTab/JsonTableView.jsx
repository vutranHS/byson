/* eslint-disable react/prop-types */
/* eslint-disable no-unused-vars */

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { Copy, Trash, Edit, Plus, FileText, CheckSquare, Square } from 'lucide-react'
import DocumentModal from './DocumentModal'
import { useConnectionStore } from '../../store/connectionStore'

export default function JsonTableView({ connId, data, dbName, collectionName, onRefresh }) {
  const [menuConfig, setMenuConfig] = useState(null)
  const menuRef = useRef(null)

  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    mode: 'view',
    document: null
  })

  // Selection state
  const [selectedIndices, setSelectedIndices] = useState(new Set())
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState(null)

  // Set the specific cell to be expanded. `{ rowIndex, colName }`
  const [expandedCell, setExpandedCell] = useState(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuConfig(null)
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

  const columns = useMemo(() => {
    if (!data || !Array.isArray(data) || data.length === 0) return []
    const keys = new Set()
    data.forEach((item) => {
      if (item && typeof item === 'object') {
        Object.keys(item).forEach((k) => keys.add(k))
      }
    })
    return Array.from(keys)
  }, [data])

  if (!Array.isArray(data) || data.length === 0) {
    return <div className="p-4 text-text-secondary italic">No records found.</div>
  }

  const renderCell = (val, isExpanded) => {
    let typeBadge = ''
    let display = ''

    if (val === null) {
      typeBadge = 'Null'
      display = <span className="italic opacity-60">null</span>
    } else if (typeof val === 'undefined') {
      display = ''
    } else if (typeof val === 'boolean') {
      typeBadge = 'Bool'
      display = String(val)
    } else if (typeof val === 'number') {
      typeBadge = Number.isInteger(val) ? 'Int32' : 'Double'
      display = String(val)
    } else if (typeof val === 'string') {
      typeBadge = 'Str'
      display = `"${val}"`
    } else if (typeof val === 'object') {
      if (val.$oid) {
        typeBadge = 'OId'
        display = (
          <span className="text-accent">
            {isExpanded ? `ObjectId("${val.$oid}")` : `ObjectId("${val.$oid.substring(0, 8)}...")`}
          </span>
        )
      } else if (val.$date) {
        typeBadge = 'Date'
        display = <span className="text-green-500">{new Date(val.$date).toISOString()}</span>
      } else if (Array.isArray(val)) {
        typeBadge = 'Arr'
        display = <span className="italic opacity-70">Array[{val.length}]</span>
      } else {
        typeBadge = 'Obj'
        display = (
          <span className="italic opacity-70">{isExpanded ? JSON.stringify(val) : 'Object'}</span>
        )
      }
    } else {
      display = String(val)
    }

    return (
      <div className="flex justify-between items-start gap-2 h-full">
        <span className={isExpanded ? 'whitespace-pre-wrap' : 'truncate flex-1'}>{display}</span>
        {typeBadge && (
          <span className="text-[9px] px-1 rounded font-mono bg-bg-primary text-text-secondary border border-border/50 shrink-0 select-none mt-0.5">
            {typeBadge}
          </span>
        )}
      </div>
    )
  }

  const handleContextMenu = (e, index) => {
    e.preventDefault()
    
    // If the clicked row is not in current selection, select ONLY this row
    if (!selectedIndices.has(index)) {
      setSelectedIndices(new Set([index]))
    }

    const doc = data[index]
    setMenuConfig({
      x: e.clientX,
      y: e.clientY,
      index,
      document: doc,
      selectedCount: selectedIndices.has(index) ? selectedIndices.size : 1
    })
  }

  const handleMouseDown = (e, index) => {
    if (e.button !== 0) return // Only primary click
    
    setIsDragging(true)
    setDragStart(index)
    document.body.classList.add('selecting-active')

    if (e.shiftKey && dragStart !== null) {
      // Range selection
      updateSelectionRange(dragStart, index)
    } else if (e.metaKey || e.ctrlKey) {
      // Toggle selection
      const next = new Set(selectedIndices)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      setSelectedIndices(next)
    } else {
      // Single selection
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

  const openDocumentModal = (mode, doc) => {
    setModalConfig({ isOpen: true, mode, document: doc })
    setMenuConfig(null)
  }

  const handleSaveDocument = async (parsedDoc) => {
    try {
      if (!window.electron) return

      let res
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
    } catch (err) {
      console.error('refreshDatabases err', err)
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

      const docsToDelete = Array.from(selectedIndices).map(idx => data[idx])
      const documentIds = docsToDelete.map(d => d._id)

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

  const toggleExpandCell = (rowIndex, colName) => {
    if (expandedCell && expandedCell.rowIndex === rowIndex && expandedCell.colName === colName) {
      setExpandedCell(null)
    } else {
      setExpandedCell({ rowIndex, colName })
    }
  }

  return (
    <div
      className="overflow-auto h-full w-full bg-bg-primary relative"
      onContextMenu={(e) => e.preventDefault()}
    >
      <table className="text-left border-collapse whitespace-nowrap text-xs min-w-full">
        <thead className="sticky top-0 bg-bg-tertiary shadow-sm z-10">
          <tr>
            <th className="px-2 py-1.5 border border-border font-medium text-text-secondary w-10 text-center">
              #
            </th>
            {columns.map((col) => (
              <th
                key={col}
                className="px-3 py-1.5 border border-border font-medium text-text-primary bg-bg-tertiary shadow-sm resize-x overflow-auto min-w-[100px]"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={idx}
              onMouseDown={(e) => handleMouseDown(e, idx)}
              onMouseEnter={() => handleMouseEnter(idx)}
              onContextMenu={(e) => handleContextMenu(e, idx)}
              className={`border-b border-border/50 transition-colors ${selectedIndices.has(idx) ? 'row-selected' : 'hover:bg-bg-tertiary'}`}
            >
              <td className="px-2 py-1.5 border-r border-border/50 text-text-secondary text-center bg-bg-tertiary/20 select-none flex items-center justify-center gap-1">
                {selectedIndices.has(idx) ? (
                  <CheckSquare size={10} className="text-accent" />
                ) : (
                  <span className="w-[10px]">{idx + 1}</span>
                )}
              </td>
              {columns.map((col) => {
                const isExpanded = expandedCell?.rowIndex === idx && expandedCell?.colName === col
                return (
                  <td
                    key={col}
                    onDoubleClick={() => toggleExpandCell(idx, col)}
                    className={`px-3 py-1.5 border-r border-border/50 text-text-primary cursor-cell hover:bg-white/5 transition-colors align-top ${isExpanded ? 'whitespace-normal break-words min-w-[200px]' : 'max-w-[300px] select-none'}`}
                    title={
                      !isExpanded ? 'Double click to expand value, Right click for more options' : ''
                    }
                  >
                    {renderCell(row[col], isExpanded)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Context Menu Window */}
      {menuConfig && (
        <div
          ref={menuRef}
          className="fixed bg-bg-secondary border border-border rounded shadow-2xl py-1 z-50 text-xs text-text-primary min-w-[200px]"
          style={{ top: menuConfig.y, left: menuConfig.x }}
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
              <button
                onClick={() => openDocumentModal('edit', menuConfig.document)}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <Edit size={13} /> Edit Document...
              </button>
              <button
                onClick={() => openDocumentModal('view', menuConfig.document)}
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
                onClick={() => copyToClipboard(JSON.stringify(menuConfig.document, null, 2))}
                className="w-full text-left px-4 py-1.5 hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
              >
                <Copy size={13} /> Copy JSON
              </button>

              <div className="h-px bg-border my-1" />

              <button
                onClick={() => {
                  setMenuConfig(null)
                  handleDeleteDocument(menuConfig.document)
                }}
                className="w-full text-left px-4 py-1.5 hover:bg-red-500 hover:text-white flex items-center gap-2 text-red-400"
              >
                <Trash size={13} /> Delete Document...
              </button>
            </>
          )}
        </div>
      )}

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
    </div>
  )
}
