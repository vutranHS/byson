/* eslint-disable react/prop-types */
import { useTabStore } from '../../store/tabStore'
import { useConnectionStore } from '../../store/connectionStore'
import {
  Table2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Table as TableIcon,
  ListTree,
  FileJson,
  Database
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

export default function QueryTab({ tab }) {
  const { updateTabContent, executeTabQuery, setTabPagination, setTabViewMode } = useTabStore()
  const { connections } = useConnectionStore()
  const activeConn = connections.find((c) => c.id === tab.connId)

  return (
    <div className="flex-1 flex flex-col min-h-0">
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

      {/* Editor Area */}
      <div className="h-1/2 min-h-[100px] border-b border-border flex flex-col relative">
        <div className="absolute top-2 right-4 z-10 flex gap-2">
          <button
            onClick={() => executeTabQuery(tab.id)}
            disabled={tab.loading}
            className="bg-accent hover:bg-accent-hover text-white text-xs px-3 py-1.5 rounded flex items-center gap-1 shadow disabled:opacity-50"
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
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 12 }
          }}
          loading={
            <div className="flex items-center justify-center h-full text-text-secondary text-sm">
              Loading Monaco Editor...
            </div>
          }
        />
      </div>

      {/* Results Area */}
      <div className="flex flex-col flex-1 bg-bg-primary overflow-hidden border-t-4 border-bg-tertiary">
        {/* Results Toolbar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-bg-secondary border-b border-border text-xs select-none">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 font-medium text-text-primary">
              <Table2 size={13} className="text-secondary" /> {tab.collectionName || 'Query Result'}
            </div>
            {tab.execTime !== undefined && (
              <div className="flex items-center gap-1 opacity-70 text-text-secondary">
                <Clock size={12} /> {(tab.execTime / 1000).toFixed(3)} sec.
              </div>
            )}
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
            <div className="italic text-text-secondary">
              Results will appear here when you run a query...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
