/* eslint-disable react/prop-types */
import { useTabStore } from '../../store/tabStore'
import { useConnectionStore } from '../../store/connectionStore'
import { useRef, useState, useCallback, useEffect } from 'react'
import {
  Table2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Table as TableIcon,
  ListTree,
  FileJson,
  Database,
  GripHorizontal,
  Download
} from 'lucide-react'
import JsonTableView from './JsonTableView'
import JsonTreeView from './JsonTreeView'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}

loader.config({ monaco })

// Default editor height ~ 2 lines of query text + padding
const DEFAULT_EDITOR_HEIGHT = 72
const MIN_EDITOR_HEIGHT = 48
const MAX_EDITOR_HEIGHT = 600

export default function QueryTab({ tab }) {
  const { updateTabContent, executeTabQuery, setTabPagination, setTabViewMode } = useTabStore()
  const { connections } = useConnectionStore()
  const activeConn = connections.find((c) => c.id === tab.connId)
  const dbVersionRef = useRef(activeConn?.version || 'unknown')

  // Sync dbVersionRef when activeConn changes
  if (activeConn?.version && activeConn.version !== dbVersionRef.current) {
    dbVersionRef.current = activeConn.version
  }

  const [editorHeight, setEditorHeight] = useState(DEFAULT_EDITOR_HEIGHT)
  const containerRef = useRef(null)
  const editorRef = useRef(null)

  const onDragStart = useCallback(
    (e) => {
      const startY = e.clientY
      const startHeight = editorHeight

      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'

      const onMouseMove = (e) => {
        const delta = e.clientY - startY
        const newH = Math.min(MAX_EDITOR_HEIGHT, Math.max(MIN_EDITOR_HEIGHT, startHeight + delta))
        setEditorHeight(newH)
      }

      const onMouseUp = () => {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [editorHeight]
  )


  useEffect(() => {
    // Register Detailed Autocomplete for MongoDB queries based on version
    const provider = monaco.languages.registerCompletionItemProvider('javascript', {
      triggerCharacters: ['.'],
      provideCompletionItems: (model, position) => {
        // ONLY provide suggestions if this model belongs to THIS editor instance
        // This prevents duplicated suggestions across multiple tabs
        if (!editorRef.current || model !== editorRef.current.getModel()) {
          return { suggestions: [] }
        }

        const textUntilPosition = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        })
        const suggestions = []
        const dbVersion = dbVersionRef.current

        // Helper to check if a feature is supported by the current DB version
        const isSupported = (minVer, currentVer) => {
          if (!currentVer || currentVer === 'unknown' || !minVer) return true
          const vMin = minVer.split('.').map(Number)
          const vCur = currentVer.split('.').map(Number)
          for (let i = 0; i < Math.max(vMin.length, vCur.length); i++) {
            const a = vMin[i] || 0;
            const b = vCur[i] || 0;
            if (b > a) return true;
            if (b < a) return false;
          }
          return true;
        }

        // Detailed collection method suggestions
        if (textUntilPosition.match(/db\.(getCollection\(['"][^'"]+['"]\)|[a-zA-Z0-9_]+)\.$/)) {
          // Core Methods with MongoDB version requirements
          const coreMethods = [
            { name: 'find', minVer: '2.2.0', label: 'find(query, options)', snippet: 'find({ $1 }, { $2 })', desc: 'Find multiple documents.' },
            { name: 'findOne', minVer: '2.2.0', label: 'findOne(query, options)', snippet: 'findOne({ $1 }, { $2 })', desc: 'Find a single document.' },
            { name: 'aggregate', minVer: '2.2.0', label: 'aggregate(pipeline, options)', snippet: 'aggregate([\n  { $1 }\n], { $2 })', desc: 'Execute an aggregation framework pipeline.' },
            { name: 'distinct', minVer: '2.2.0', label: 'distinct(key, query, options)', snippet: 'distinct(\'$1\', { $2 }, { $3 })', desc: 'Find the distinct values for a specified field.' },
            { name: 'countDocuments', minVer: '4.0.0', label: 'countDocuments(query, options)', snippet: 'countDocuments({ $1 }, { $2 })', desc: 'Count number of documents matching query.' },
            { name: 'estimatedDocumentCount', minVer: '4.0.0', label: 'estimatedDocumentCount(options)', snippet: 'estimatedDocumentCount({ $1 })', desc: 'Estimate the number of documents using metadata.' },
            { name: 'insertOne', minVer: '3.2.0', label: 'insertOne(doc, options)', snippet: 'insertOne({ $1 }, { $2 })', desc: 'Insert a single document.' },
            { name: 'insertMany', minVer: '3.2.0', label: 'insertMany(docs, options)', snippet: 'insertMany([\n  { $1 }\n], { $2 })', desc: 'Insert multiple documents.' },
            { name: 'bulkWrite', minVer: '3.2.0', label: 'bulkWrite(operations, options)', snippet: 'bulkWrite([\n  { insertOne: { document: { $1 } } }\n], { $2 })', desc: 'Perform multiple write operations.' },
            { name: 'updateOne', minVer: '3.2.0', label: 'updateOne(filter, update, options)', snippet: 'updateOne({ $1 }, { $set: { $2 } }, { $3 })', desc: 'Update a single document.' },
            { name: 'updateMany', minVer: '3.2.0', label: 'updateMany(filter, update, options)', snippet: 'updateMany({ $1 }, { $set: { $2 } }, { $3 })', desc: 'Update multiple documents.' },
            { name: 'replaceOne', minVer: '3.2.0', label: 'replaceOne(filter, replacement, options)', snippet: 'replaceOne({ $1 }, { $2 }, { $3 })', desc: 'Replace a single document.' },
            { name: 'deleteOne', minVer: '3.2.0', label: 'deleteOne(filter, options)', snippet: 'deleteOne({ $1 }, { $2 })', desc: 'Delete a single document.' },
            { name: 'deleteMany', minVer: '3.2.0', label: 'deleteMany(filter, options)', snippet: 'deleteMany({ $1 }, { $2 })', desc: 'Delete multiple documents.' },
            { name: 'stats', minVer: '2.2.0', label: 'stats()', snippet: 'stats()', desc: 'Get collection statistics.' },
            { name: 'rename', minVer: '2.2.0', label: 'rename(newName)', snippet: 'rename(\'$1\')', desc: 'Rename the collection.' },
            { name: 'drop', minVer: '2.2.0', label: 'drop()', snippet: 'drop()', desc: 'Drop the collection.' },
            // Indexing
            { name: 'createIndex', minVer: '2.2.0', label: 'createIndex(keys, options)', snippet: 'createIndex({ $1: 1 }, { $2 })', desc: 'Create an index.' },
            { name: 'createIndexes', minVer: '2.6.0', label: 'createIndexes(specs)', snippet: 'createIndexes([{ key: { $1: 1 } }])', desc: 'Create multiple indexes.' },
            { name: 'listIndexes', minVer: '3.0.0', label: 'listIndexes()', snippet: 'listIndexes()', desc: 'List all indexes.' },
            { name: 'dropIndex', minVer: '2.2.0', label: 'dropIndex(name)', snippet: 'dropIndex(\'$1\')', desc: 'Drop a specific index.' },
            { name: 'dropIndexes', minVer: '2.2.0', label: 'dropIndexes()', snippet: 'dropIndexes()', desc: 'Drop all indexes.' },
            // Atlas Search (v7.0+)
            { name: 'listSearchIndexes', minVer: '7.0.0', label: 'listSearchIndexes()', snippet: 'listSearchIndexes()', desc: 'List Atlas search indexes.' },
            { name: 'createSearchIndex', minVer: '7.0.0', label: 'createSearchIndex(desc)', snippet: 'createSearchIndex({ name: \'$1\', definition: { $2 } })', desc: 'Create an Atlas search index.' }
          ]

          coreMethods.filter(m => isSupported(m.minVer, dbVersion)).forEach(method => {
            suggestions.push({
              label: method.label,
              kind: monaco.languages.CompletionItemKind.Method,
              insertText: method.snippet,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: `Collection Method (Requires >= v${method.minVer})`,
              documentation: method.desc
            })
          })
        }

        // Chaining Cursor Methods (sort, limit, toArray, etc.)
        if (textUntilPosition.match(/\.(find|sort|limit|skip|project|hint|batchSize|toArray|map|filter|reduce|slice)\(.*\)\.$/)) {
          const cursorMethods = [
            { name: 'sort', minVer: '2.2.0', label: 'sort(spec)', snippet: 'sort({ $1: 1 })', desc: 'Sort results.' },
            { name: 'limit', minVer: '2.2.0', label: 'limit(n)', snippet: 'limit(${1:50})', desc: 'Limit result set size.' },
            { name: 'skip', minVer: '2.2.0', label: 'skip(n)', snippet: 'skip(${1:0})', desc: 'Skip documents.' },
            { name: 'project', minVer: '2.2.0', label: 'project(spec)', snippet: 'project({ $1: 1 })', desc: 'Project specific fields.' },
            { name: 'hint', minVer: '2.2.0', label: 'hint(index)', snippet: 'hint(\'$1\')', desc: 'Force use of specific index.' },
            { name: 'batchSize', minVer: '2.2.0', label: 'batchSize(n)', snippet: 'batchSize(${1:1000})', desc: 'Set result batch size.' },
            { name: 'count', minVer: '2.2.0', label: 'count()', snippet: 'count()', desc: 'Get count of results.' },
            { name: 'toArray', minVer: '2.2.0', label: 'toArray()', snippet: 'toArray()', desc: 'Convert cursor to array.' },
            // JS Array Methods (Supported by our FindCursorBuilder)
            { name: 'map', minVer: '1.0.0', label: 'map(fn)', snippet: 'map(item => ${1:item})', desc: 'Translate array elements.' },
            { name: 'filter', minVer: '1.0.0', label: 'filter(fn)', snippet: 'filter(item => ${1:true})', desc: 'Filter array elements.' },
            { name: 'reduce', minVer: '1.0.0', label: 'reduce(fn, acc)', snippet: 'reduce((acc, curr) => ${1:acc}, ${2:{}})', desc: 'Reduce array to single value.' },
            { name: 'find', minVer: '1.0.0', label: 'find(fn)', snippet: 'find(item => ${1:true})', desc: 'Find first matching element.' },
            { name: 'forEach', minVer: '1.0.0', label: 'forEach(fn)', snippet: 'forEach(item => { $1 })', desc: 'Iterate over elements.' },
            { name: 'some', minVer: '1.0.0', label: 'some(fn)', snippet: 'some(item => ${1:true})', desc: 'Check if some elements match.' },
            { name: 'every', minVer: '1.0.0', label: 'every(fn)', snippet: 'every(item => ${1:true})', desc: 'Check if all elements match.' },
            { name: 'slice', minVer: '1.0.0', label: 'slice(start, end)', snippet: 'slice(${1:0}, ${2:10})', desc: 'Extract part of array.' },
            { name: 'reverse', minVer: '1.0.0', label: 'reverse()', snippet: 'reverse()', desc: 'Reverse array order.' }
          ]

          cursorMethods.filter(m => isSupported(m.minVer, dbVersion)).forEach(method => {
            suggestions.push({
              label: method.label,
              kind: monaco.languages.CompletionItemKind.Method,
              insertText: method.snippet,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: method.minVer === '1.0.0' ? 'JS Array Method' : 'Cursor Method',
              documentation: method.desc
            })
          })
        }

        if (textUntilPosition.endsWith('db.')) {
          suggestions.push({
            label: 'getCollection(name)',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'getCollection(\'$1\')',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: 'Get a collection by name'
          })
        }

        return { suggestions }
      }
    })

    return () => provider.dispose()
  }, [])

  return (
    <div ref={containerRef} className="flex-1 flex flex-col min-h-0">
      {/* Breadcrumb row */}
      <div className="flex justify-between items-center px-3 py-1 bg-bg-secondary border-b border-border text-xs select-none">
        <div className="flex items-center gap-2 text-text-secondary">
          <Database size={12} />
          <span className="font-semibold text-text-primary">{activeConn?.name || 'Localhost'}</span>
          <span className="opacity-50">/</span>
          <span className="font-medium text-text-primary">{tab.dbName || 'unknown'}</span>
          {tab.collectionName && (
            <>
              <span className="opacity-50">/</span>
              <span className="font-medium text-text-primary">{tab.collectionName}</span>
            </>
          )}
        </div>
        <div className="text-text-secondary italic">Mongosh Editor</div>
      </div>

      {/* Editor Area - resizable height */}
      <div className="border-b border-border flex flex-col relative shrink-0" style={{ height: editorHeight }}>
        <div className="absolute top-2 right-4 z-10 flex gap-2">
          <button
            onClick={() => {
              useTabStore.getState().openTab({
                type: 'export',
                connId: tab.connId,
                dbName: tab.dbName,
                collectionName: tab.collectionName,
                initialQuery: tab.query // Pass the current query
              })
            }}
            title="Export this query result"
            className="bg-bg-tertiary border border-border hover:bg-bg-hover text-text-primary text-[11px] px-2.5 py-1.5 rounded flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Download size={12} className="text-accent" /> Export Query
          </button>

          <button
            onClick={() => executeTabQuery(tab.id)}
            disabled={tab.loading}
            className="bg-accent hover:bg-accent-hover text-white text-xs px-3 py-1.5 rounded flex items-center gap-1 shadow disabled:opacity-50 transition-colors"
          >
            <span>▶</span> {tab.loading ? 'Running...' : 'Run'}
          </button>
        </div>
        <Editor
          height="100%"
          language="javascript"
          theme="vs-dark"
          value={tab.query}
          onChange={(val) => updateTabContent(tab.id, val)}
          onMount={(editor, monaco) => {
            editorRef.current = editor
            // Add Cmd+Enter (Mac) or Ctrl+Enter (Win/Linux) shortcut
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
              executeTabQuery(tab.id)
            })
          }}

          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 8 }
          }}
          loading={
            <div className="flex items-center justify-center h-full text-text-secondary text-sm">
              Loading Monaco Editor...
            </div>
          }
        />
      </div>

      {/* Resize Handle */}
      <div
        onMouseDown={onDragStart}
        className="h-[6px] bg-bg-tertiary hover:bg-accent/40 flex items-center justify-center cursor-row-resize shrink-0 transition-colors group"
        title="Drag to resize editor"
      >
        <GripHorizontal
          size={12}
          className="text-text-secondary opacity-40 group-hover:opacity-80 transition-opacity"
        />
      </div>

      {/* Results Area */}
      <div className="flex flex-col flex-1 bg-bg-primary overflow-hidden min-h-0">
        {/* Results Toolbar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-bg-secondary border-b border-border text-xs select-none">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 font-medium text-text-primary">
              <Table2 size={13} className="text-secondary" /> {tab.collectionName || 'Query Result'}
            </div>
            <div className="flex items-center gap-3 text-text-secondary text-[11px]">
              {tab.execTime !== undefined && (
                <div className="flex items-center gap-1 opacity-80" title="Execution Time">
                  <Clock size={12} /> {(tab.execTime / 1000).toFixed(3)}s
                </div>
              )}
              {tab.totalCount !== undefined && (
                <div className="flex items-center gap-1 opacity-80" title="Total Records in DB">
                  <Database size={11} />
                  <span>{tab.totalCount.toLocaleString()} <span className="opacity-50">Docs</span></span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Pagination */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() =>
                  executeTabQuery(
                    tab.id,
                    Math.max(0, Number(tab.skip) - Number(tab.limit)),
                    Number(tab.limit)
                  )
                }
                disabled={Number(tab.skip) <= 0 || tab.loading}
                className="p-1 text-text-secondary hover:text-white disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <input
                type="number"
                value={tab.skip}
                onChange={(e) => setTabPagination(tab.id, Number(e.target.value), tab.limit)}
                onKeyDown={(e) => e.key === 'Enter' && executeTabQuery(tab.id)}
                disabled={tab.loading}
                className="w-14 bg-bg-tertiary border border-border rounded px-1 py-0.5 text-center text-text-primary outline-none focus:border-accent disabled:opacity-50"
              />
              <input
                type="number"
                value={tab.limit}
                onChange={(e) => setTabPagination(tab.id, tab.skip, Number(e.target.value))}
                onKeyDown={(e) => e.key === 'Enter' && executeTabQuery(tab.id)}
                disabled={tab.loading}
                className="w-14 bg-bg-tertiary border border-border rounded px-1 py-0.5 text-center text-text-primary outline-none focus:border-accent disabled:opacity-50"
              />
              <button
                onClick={() =>
                  executeTabQuery(tab.id, Number(tab.skip) + Number(tab.limit), Number(tab.limit))
                }
                disabled={tab.loading}
                className="p-1 text-text-secondary hover:text-white disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* View Modes */}
            <div className="flex items-center gap-1 border-l border-border pl-3">
              <button
                onClick={() => setTabViewMode(tab.id, 'table')}
                className={`p-1 rounded transition-colors ${tab.viewMode === 'table' ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary hover:text-white'}`}
                title="Table View"
              >
                <TableIcon size={14} />
              </button>
              <button
                onClick={() => setTabViewMode(tab.id, 'tree')}
                className={`p-1 rounded transition-colors ${tab.viewMode === 'tree' ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary hover:text-white'}`}
                title="Tree View"
              >
                <ListTree size={14} />
              </button>
              <button
                onClick={() => setTabViewMode(tab.id, 'json')}
                className={`p-1 rounded transition-colors ${tab.viewMode === 'json' ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary hover:text-white'}`}
                title="Text View"
              >
                <FileJson size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Results Content */}
        <div className="flex-1 text-sm overflow-hidden h-full flex flex-col relative w-full">
          {tab.loading ? (
            <div className="italic text-text-secondary p-2">Executing query...</div>
          ) : tab.error ? (
            <div className="text-red-400 font-mono text-xs whitespace-pre-wrap p-2">
              {tab.error}
            </div>
          ) : tab.results ? (
            tab.viewMode === 'table' ? (
              <JsonTableView
                connId={tab.connId}
                data={tab.results}
                dbName={tab.dbName}
                collectionName={tab.collectionName}
                onRefresh={() => executeTabQuery(tab.id)}
              />
            ) : tab.viewMode === 'tree' ? (
              <JsonTreeView
                connId={tab.connId}
                data={tab.results}
                dbName={tab.dbName}
                collectionName={tab.collectionName}
                onRefresh={() => executeTabQuery(tab.id)}
              />
            ) : (
              <div className="h-full w-full relative bg-[#1e1e1e]">
                <Editor
                  height="100%"
                  language="json"
                  theme="vs-dark"
                  value={JSON.stringify(tab.results, null, 2)}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    readOnly: true,
                    lineNumbers: 'on',
                    wordWrap: 'off',
                    scrollBeyondLastLine: false,
                    contextmenu: true
                  }}
                />
              </div>
            )
          ) : (
            <div className="italic text-text-secondary p-2">
              Results will appear here when you run a query...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
