/* eslint-disable react/prop-types */
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { useTabStore } from '../../store/tabStore'
import { useConnectionStore } from '../../store/connectionStore'
import { useLogStore } from '../../store/logStore'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import JsonTreeView from '../QueryTab/JsonTreeView'
import JsonTableView from '../QueryTab/JsonTableView'
import ErrorBoundary from '../ErrorBoundary'
import {
  Plus,
  Play,
  Trash2,
  GripVertical,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Code2,
  ListTree,
  Table as TableIcon,
  FileJson,
  Copy,
  ExternalLink,
  Layers,
  Loader2,
  AlertTriangle,
  Check,
  Search,
  Zap
} from 'lucide-react'

// --- Monaco worker bootstrap (mirrors QueryTab so this tab is self-contained) ---
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}
loader.config({ monaco })
// Stage bodies are loose JS (ObjectId(), ISODate(), unquoted keys), so silence
// the TS/JS validator to avoid noisy red squiggles inside object literals.
try {
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true
  })
} catch (e) {
  /* monaco may not be ready in some envs; safe to ignore */
}

// ----------------------------------------------------------------------------
// Stage catalogue — grouped, each with a sensible starter snippet + one-liner.
// ----------------------------------------------------------------------------
const STAGE_CATALOG = [
  {
    group: 'Filter',
    stages: [
      { op: '$match', desc: 'Filter documents by condition', body: '{\n  \n}' },
      { op: '$limit', desc: 'Keep only the first N docs', body: '10', numeric: true },
      { op: '$skip', desc: 'Skip the first N docs', body: '0', numeric: true },
      { op: '$sample', desc: 'Randomly select N docs', body: '{ size: 100 }' }
    ]
  },
  {
    group: 'Reshape',
    stages: [
      { op: '$project', desc: 'Include / exclude / compute fields', body: '{\n  \n}' },
      { op: '$addFields', desc: 'Add or overwrite fields', body: '{\n  newField: "$expr"\n}' },
      { op: '$set', desc: 'Alias of $addFields', body: '{\n  newField: "$expr"\n}' },
      { op: '$unset', desc: 'Remove fields', body: '"fieldToRemove"' },
      { op: '$replaceRoot', desc: 'Promote a sub-document to root', body: '{ newRoot: "$subdoc" }' },
      { op: '$replaceWith', desc: 'Replace root with an expression', body: '"$subdoc"' }
    ]
  },
  {
    group: 'Group',
    stages: [
      {
        op: '$group',
        desc: 'Aggregate by a key',
        body: '{\n  _id: "$field",\n  count: { $sum: 1 }\n}'
      },
      { op: '$count', desc: 'Count documents into a field', body: '"total"' },
      { op: '$sortByCount', desc: 'Group + count + sort desc', body: '"$field"' },
      {
        op: '$bucket',
        desc: 'Group into explicit ranges',
        body: '{\n  groupBy: "$field",\n  boundaries: [0, 100, 200],\n  default: "other"\n}'
      },
      { op: '$bucketAuto', desc: 'Auto-distribute into N buckets', body: '{ groupBy: "$field", buckets: 5 }' },
      { op: '$facet', desc: 'Run multiple sub-pipelines', body: '{\n  branchA: [ { $match: {} } ]\n}' }
    ]
  },
  {
    group: 'Join',
    stages: [
      {
        op: '$lookup',
        desc: 'Left-join another collection',
        body: '{\n  from: "otherCollection",\n  localField: "field",\n  foreignField: "_id",\n  as: "joined"\n}'
      },
      {
        op: '$graphLookup',
        desc: 'Recursive graph join',
        body: '{\n  from: "coll",\n  startWith: "$field",\n  connectFromField: "field",\n  connectToField: "_id",\n  as: "tree"\n}'
      },
      { op: '$unionWith', desc: 'Concatenate another collection', body: '{ coll: "otherCollection" }' },
      { op: '$unwind', desc: 'Flatten an array field', body: '"$arrayField"' }
    ]
  },
  {
    group: 'Order',
    stages: [{ op: '$sort', desc: 'Sort by one or more fields', body: '{ createdAt: -1 }' }]
  },
  {
    group: 'Output',
    stages: [
      { op: '$out', desc: 'Write results to a collection', body: '"resultCollection"', write: true },
      { op: '$merge', desc: 'Upsert results into a collection', body: '{ into: "targetCollection" }', write: true }
    ]
  },
  {
    group: 'Geo / Advanced',
    stages: [
      {
        op: '$geoNear',
        desc: 'Order by distance from a point',
        body: '{\n  near: { type: "Point", coordinates: [0, 0] },\n  distanceField: "dist",\n  spherical: true\n}'
      },
      { op: '$redact', desc: 'Field-level access control', body: '"$$DESCEND"' }
    ]
  }
]

const STAGE_META = {}
STAGE_CATALOG.forEach((g) => g.stages.forEach((s) => (STAGE_META[s.op] = s)))
const WRITE_STAGES = new Set(['$out', '$merge'])

let stageSeq = 0
const newStage = (op) => ({
  id: `stg-${Date.now()}-${stageSeq++}`,
  op,
  body: STAGE_META[op]?.body ?? '{\n  \n}',
  enabled: true
})

// Tolerant object parser for Form mode (handles unquoted keys + single quotes).
const looseParse = (str) => {
  if (str == null || !String(str).trim()) return {}
  try {
    return JSON.parse(str)
  } catch (e) { /* fallthrough */ }
  try {
    const fixed = String(str)
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
      .replace(/'/g, '"')
    return JSON.parse(fixed)
  } catch (e) {
    return null
  }
}

// Build the `db.coll.aggregate([...])` string for a list of stages.
const buildCode = (collectionName, stages) => {
  if (!stages.length) return `db.getCollection('${collectionName}').aggregate([])`
  const inner = stages
    .map((s) => {
      const body = s.body && s.body.trim() ? s.body : '{}'
      const indented = body
        .split('\n')
        .map((line, i) => (i === 0 ? line : '  ' + line))
        .join('\n')
      return `  { ${s.op}: ${indented} }`
    })
    .join(',\n')
  return `db.getCollection('${collectionName}').aggregate([\n${inner}\n])`
}

export default function AggregationTab({ tab }) {
  const theme = useSettingsStore((s) => s.theme)
  const defaultPageSize = useSettingsStore((s) => s.defaultPageSize)
  const openTab = useTabStore((s) => s.openTab)
  const setTabPipeline = useTabStore((s) => s.setTabPipeline)
  const connections = useConnectionStore((s) => s.connections)
  const addLog = useLogStore((s) => s.addLog)

  const monacoTheme = theme === 'light' ? 'vs' : 'vs-dark'

  // Restore the structured pipeline persisted on the tab so the built pipeline
  // survives tab switches (inactive tabs are unmounted), workspace reloads, and
  // tab duplication. Persisted stages carry no runtime id, so re-issue one.
  const [stages, setStages] = useState(() =>
    Array.isArray(tab.pipeline) && tab.pipeline.length
      ? tab.pipeline.map((p) => ({
          id: `stg-${Date.now()}-${stageSeq++}`,
          op: p.op,
          body: p.body ?? '',
          enabled: p.enabled !== false
        }))
      : [newStage('$match')]
  )
  const [expandedId, setExpandedId] = useState(() => null)
  const [activeView, setActiveView] = useState('preview') // 'preview' | 'code'
  const [viewMode, setViewMode] = useState('tree') // 'tree' | 'table' | 'json'
  const [previewLimit, setPreviewLimit] = useState(20)
  const [autoPreview, setAutoPreview] = useState(true)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [copied, setCopied] = useState(false)

  const [preview, setPreview] = useState({
    loading: false,
    data: null,
    totalCount: undefined,
    execTime: null,
    error: null,
    warning: null,
    upToOp: null
  })

  // Drag state: { type: 'palette'|'card', op?, index? }
  const dragRef = useRef(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  // expand first stage on mount
  useEffect(() => {
    if (expandedId === null && stages.length) setExpandedId(stages[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const enabledStages = useMemo(() => stages.filter((s) => s.enabled), [stages])

  const fullCode = useMemo(
    () => buildCode(tab.collectionName, enabledStages),
    [tab.collectionName, enabledStages]
  )

  // Mirror generated code + structured pipeline into the tab so the pipeline
  // survives tab switches and workspace save/restore (and history captures the
  // query). Only the persistable shape ({ op, body, enabled }) is stored.
  useEffect(() => {
    setTabPipeline(
      tab.id,
      fullCode,
      stages.map((s) => ({ op: s.op, body: s.body, enabled: s.enabled }))
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullCode, stages])

  // ---- Stage mutations -----------------------------------------------------
  const addStage = useCallback((op, atIndex) => {
    setStages((prev) => {
      const s = newStage(op)
      if (atIndex == null || atIndex >= prev.length) {
        setExpandedId(s.id)
        return [...prev, s]
      }
      const next = [...prev]
      next.splice(atIndex, 0, s)
      setExpandedId(s.id)
      return next
    })
  }, [])

  const removeStage = useCallback(
    (id) => setStages((prev) => prev.filter((s) => s.id !== id)),
    []
  )

  const updateBody = useCallback(
    (id, body) => setStages((prev) => prev.map((s) => (s.id === id ? { ...s, body } : s))),
    []
  )

  const toggleEnabled = useCallback(
    (id) => setStages((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))),
    []
  )

  const moveStage = useCallback((from, to) => {
    setStages((prev) => {
      if (from === to || from < 0 || from >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      const insertAt = from < to ? to - 1 : to
      next.splice(insertAt, 0, moved)
      return next
    })
  }, [])

  // ---- Preview execution ---------------------------------------------------
  const runPreviewUpTo = useCallback(
    async (stageId) => {
      const ordered = stages.filter((s) => s.enabled)
      let sliced = ordered
      let upToOp = null
      if (stageId) {
        // Find target among the enabled list, include up to & including it.
        const idxInAll = stages.findIndex((s) => s.id === stageId)
        const target = stages[idxInAll]
        if (target && target.enabled) {
          const cutAt = ordered.findIndex((s) => s.id === stageId)
          sliced = ordered.slice(0, cutAt + 1)
          upToOp = target.op
        }
      }

      // Never let live preview run write stages ($out / $merge).
      let strippedWrite = false
      while (sliced.length && WRITE_STAGES.has(sliced[sliced.length - 1].op)) {
        sliced = sliced.slice(0, -1)
        strippedWrite = true
      }

      if (!sliced.length) {
        setPreview({
          loading: false,
          data: [],
          totalCount: 0,
          execTime: 0,
          error: null,
          warning: strippedWrite ? 'Write stages are skipped in preview.' : 'No enabled stages to preview.',
          upToOp
        })
        return
      }

      const code = buildCode(tab.collectionName, sliced)
      setPreview((p) => ({ ...p, loading: true, error: null, upToOp }))

      try {
        const res = await window.electron.ipcRenderer.invoke('db:runQuery', {
          connId: tab.connId,
          dbName: tab.dbName,
          query: code,
          options: { skip: 0, limit: previewLimit }
        })
        if (res.ok) {
          setPreview({
            loading: false,
            data: res.data,
            totalCount: res.totalCount,
            execTime: res.execTime,
            error: null,
            warning: strippedWrite ? 'Write stages ($out/$merge) skipped in preview.' : res.warning || null,
            upToOp
          })
        } else {
          setPreview({
            loading: false,
            data: null,
            totalCount: undefined,
            execTime: null,
            error: res.error,
            warning: null,
            upToOp
          })
          addLog(`Aggregation preview error: ${res.error}`, 'error')
        }
      } catch (err) {
        setPreview({
          loading: false,
          data: null,
          totalCount: undefined,
          execTime: null,
          error: err.message,
          warning: null,
          upToOp
        })
      }
    },
    [stages, tab.collectionName, tab.connId, tab.dbName, previewLimit, addLog]
  )

  // Auto-preview the full pipeline when stages/bodies settle (debounced).
  const previewTimer = useRef(null)
  useEffect(() => {
    if (!autoPreview) return
    if (previewTimer.current) clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(() => runPreviewUpTo(null), 600)
    return () => previewTimer.current && clearTimeout(previewTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, autoPreview, previewLimit])

  const copyCode = useCallback(() => {
    navigator.clipboard?.writeText(fullCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [fullCode])

  const openInQueryTab = useCallback(() => {
    openTab({
      title: tab.collectionName,
      connId: tab.connId,
      dbName: tab.dbName,
      collectionName: tab.collectionName,
      query: fullCode,
      skipAutoRun: false
    })
  }, [openTab, fullCode, tab])

  // ---- Palette (with search) ----------------------------------------------
  const filteredCatalog = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase()
    if (!q) return STAGE_CATALOG
    return STAGE_CATALOG.map((g) => ({
      ...g,
      stages: g.stages.filter(
        (s) => s.op.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q)
      )
    })).filter((g) => g.stages.length)
  }, [paletteQuery])

  const hasWriteStage = enabledStages.some((s) => WRITE_STAGES.has(s.op))

  return (
    <div className="h-full w-full flex flex-col bg-bg-primary text-text-primary overflow-hidden">
      {/* Top toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-secondary shrink-0">
        <Layers size={15} className="text-accent" />
        <span className="text-sm font-semibold">Aggregation</span>
        <span className="text-xs text-text-secondary truncate">
          {tab.dbName}.{tab.collectionName}
        </span>
        <span className="text-[11px] text-text-secondary ml-1">
          {enabledStages.length} stage{enabledStages.length === 1 ? '' : 's'}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => runPreviewUpTo(null)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-accent hover:bg-accent-hover text-white text-xs font-medium"
            title="Run full pipeline"
          >
            <Play size={12} /> Run
          </button>
          <label className="flex items-center gap-1 text-[11px] text-text-secondary cursor-pointer select-none px-1">
            <input
              type="checkbox"
              checked={autoPreview}
              onChange={(e) => setAutoPreview(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Auto
          </label>
          <button
            onClick={copyCode}
            className="flex items-center gap-1 px-2 py-1 rounded bg-bg-tertiary hover:bg-bg-hover text-xs"
            title="Copy generated code"
          >
            {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />} Code
          </button>
          <button
            onClick={openInQueryTab}
            className="flex items-center gap-1 px-2 py-1 rounded bg-bg-tertiary hover:bg-bg-hover text-xs"
            title="Open this pipeline in a Query tab"
          >
            <ExternalLink size={12} /> Query Tab
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Stage palette */}
        <div className="w-52 shrink-0 border-r border-border bg-bg-secondary flex flex-col">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                placeholder="Search stages…"
                className="w-full pl-7 pr-2 py-1.5 text-xs rounded bg-bg-tertiary border border-border outline-none focus:border-accent"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            {filteredCatalog.map((group) => (
              <div key={group.group}>
                <div className="text-[10px] uppercase tracking-wider text-text-secondary mb-1 px-1">
                  {group.group}
                </div>
                <div className="space-y-0.5">
                  {group.stages.map((s) => (
                    <button
                      key={s.op}
                      draggable
                      onDragStart={() => (dragRef.current = { type: 'palette', op: s.op })}
                      onDragEnd={() => {
                        dragRef.current = null
                        setDragOverIndex(null)
                      }}
                      onClick={() => addStage(s.op)}
                      title={s.desc}
                      className="group w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-left hover:bg-bg-hover cursor-grab active:cursor-grabbing"
                    >
                      <GripVertical
                        size={12}
                        className="text-text-secondary opacity-0 group-hover:opacity-100 shrink-0"
                      />
                      <span className="font-mono text-xs text-accent truncate">{s.op}</span>
                      {s.write && (
                        <span className="ml-auto text-[9px] text-orange-400 font-medium">write</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline builder */}
        <div
          className="flex-1 min-w-0 overflow-y-auto p-3 bg-bg-primary"
          onDragOver={(e) => {
            if (dragRef.current?.type === 'palette') {
              e.preventDefault()
              setDragOverIndex(stages.length)
            }
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (dragRef.current?.type === 'palette') addStage(dragRef.current.op)
            dragRef.current = null
            setDragOverIndex(null)
          }}
        >
          {hasWriteStage && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs">
              <AlertTriangle size={13} />
              This pipeline writes to a collection ($out / $merge). Write stages are skipped during
              live preview; use Run to execute them.
            </div>
          )}

          {stages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-text-secondary text-sm gap-2">
              <Zap size={28} className="opacity-40" />
              <div>Drag a stage from the left, or click one to add.</div>
            </div>
          )}

          {stages.map((stage, index) => (
            <div key={stage.id}>
              {/* drop indicator before this card */}
              {dragOverIndex === index && (
                <div className="h-0.5 bg-accent rounded my-1 mx-1" />
              )}
              <StageCard
                stage={stage}
                index={index}
                expanded={expandedId === stage.id}
                isPreviewTarget={preview.upToOp === stage.op}
                monacoTheme={monacoTheme}
                onToggleExpand={() =>
                  setExpandedId((id) => (id === stage.id ? null : stage.id))
                }
                onToggleEnabled={() => toggleEnabled(stage.id)}
                onRemove={() => removeStage(stage.id)}
                onBodyChange={(v) => updateBody(stage.id, v)}
                onPreviewHere={() => {
                  setActiveView('preview')
                  runPreviewUpTo(stage.id)
                }}
                onDragStartCard={() => (dragRef.current = { type: 'card', index })}
                onDragEndCard={() => {
                  dragRef.current = null
                  setDragOverIndex(null)
                }}
                onDragOverCard={(e) => {
                  e.preventDefault()
                  setDragOverIndex(index)
                }}
                onDropCard={(e) => {
                  e.preventDefault()
                  const d = dragRef.current
                  if (d?.type === 'card') moveStage(d.index, index)
                  else if (d?.type === 'palette') addStage(d.op, index)
                  dragRef.current = null
                  setDragOverIndex(null)
                }}
              />
            </div>
          ))}
          {dragOverIndex === stages.length && stages.length > 0 && (
            <div className="h-0.5 bg-accent rounded my-1 mx-1" />
          )}

          {stages.length > 0 && (
            <button
              onClick={() => addStage('$match')}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded border border-dashed border-border text-text-secondary hover:text-accent hover:border-accent text-xs"
            >
              <Plus size={13} /> Add stage
            </button>
          )}
        </div>

        {/* Results / code panel */}
        <div className="w-[42%] shrink-0 border-l border-border flex flex-col bg-bg-secondary min-w-0">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border shrink-0">
            <button
              onClick={() => setActiveView('preview')}
              className={`px-2 py-1 rounded text-xs ${activeView === 'preview' ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
            >
              Preview
            </button>
            <button
              onClick={() => setActiveView('code')}
              className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${activeView === 'code' ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <Code2 size={12} /> Code
            </button>

            {activeView === 'preview' && (
              <div className="ml-auto flex items-center gap-1">
                {preview.upToOp && (
                  <span className="text-[10px] text-text-secondary mr-1">
                    up to <span className="font-mono text-accent">{preview.upToOp}</span>
                  </span>
                )}
                <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
              </div>
            )}
          </div>

          {/* status bar */}
          {activeView === 'preview' && (
            <div className="flex items-center gap-3 px-3 py-1 border-b border-border text-[11px] text-text-secondary shrink-0">
              {preview.loading ? (
                <span className="flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" /> running…
                </span>
              ) : (
                <>
                  {preview.totalCount !== undefined && (
                    <span>{preview.totalCount} docs</span>
                  )}
                  {preview.execTime != null && <span>{preview.execTime}ms</span>}
                </>
              )}
              <label className="ml-auto flex items-center gap-1">
                limit
                <input
                  type="number"
                  min={1}
                  value={previewLimit}
                  onChange={(e) => setPreviewLimit(Math.max(1, Number(e.target.value) || 1))}
                  className="w-14 px-1 py-0.5 rounded bg-bg-tertiary border border-border outline-none focus:border-accent text-text-primary"
                />
              </label>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-hidden">
            {activeView === 'code' ? (
              <Editor
                height="100%"
                language="javascript"
                theme={monacoTheme}
                value={fullCode}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 12,
                  lineNumbers: 'off',
                  scrollBeyondLastLine: false,
                  wordWrap: 'on'
                }}
              />
            ) : preview.warning && !preview.data?.length ? (
              <div className="p-3 text-xs text-orange-400">{preview.warning}</div>
            ) : preview.error ? (
              <div className="p-3 text-xs text-red-400 font-mono whitespace-pre-wrap">
                {preview.error}
              </div>
            ) : preview.data ? (
              <ErrorBoundary key={viewMode} onReset={() => runPreviewUpTo(null)}>
                {preview.warning && (
                  <div className="px-3 py-1 text-[11px] text-orange-400 border-b border-border">
                    {preview.warning}
                  </div>
                )}
                {viewMode === 'table' ? (
                  <JsonTableView
                    connId={tab.connId}
                    data={preview.data}
                    dbName={tab.dbName}
                    collectionName={tab.collectionName}
                    onRefresh={() => runPreviewUpTo(null)}
                    readOnly
                  />
                ) : viewMode === 'tree' ? (
                  <JsonTreeView
                    connId={tab.connId}
                    data={preview.data}
                    dbName={tab.dbName}
                    collectionName={tab.collectionName}
                    onRefresh={() => runPreviewUpTo(null)}
                    readOnly
                  />
                ) : (
                  <pre className="p-3 text-xs font-mono whitespace-pre-wrap overflow-auto h-full">
                    {JSON.stringify(preview.data, null, 2)}
                  </pre>
                )}
              </ErrorBoundary>
            ) : (
              <div className="h-full flex items-center justify-center text-text-secondary text-xs">
                Run the pipeline to see results.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Stage card
// ----------------------------------------------------------------------------
function StageCard({
  stage,
  index,
  expanded,
  isPreviewTarget,
  monacoTheme,
  onToggleExpand,
  onToggleEnabled,
  onRemove,
  onBodyChange,
  onPreviewHere,
  onDragStartCard,
  onDragEndCard,
  onDragOverCard,
  onDropCard
}) {
  const meta = STAGE_META[stage.op]
  const summary = (stage.body || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)

  return (
    <div
      onDragOver={onDragOverCard}
      onDrop={onDropCard}
      className={`mb-2 rounded border ${
        stage.enabled ? 'border-border' : 'border-border/50'
      } ${isPreviewTarget ? 'ring-1 ring-accent' : ''} bg-bg-secondary overflow-hidden ${
        stage.enabled ? '' : 'opacity-60'
      }`}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <span
          draggable
          onDragStart={onDragStartCard}
          onDragEnd={onDragEndCard}
          className="cursor-grab active:cursor-grabbing text-text-secondary hover:text-text-primary"
          title="Drag to reorder"
        >
          <GripVertical size={14} />
        </span>
        <span className="text-[10px] text-text-secondary w-4 text-center">{index + 1}</span>
        <button
          onClick={onToggleExpand}
          className="flex items-center gap-1 min-w-0 flex-1 text-left"
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span className="font-mono text-xs text-accent">{stage.op}</span>
          {!expanded && (
            <span className="text-[11px] text-text-secondary truncate ml-1">{summary}</span>
          )}
        </button>

        {meta?.write && (
          <span className="text-[9px] text-orange-400 font-medium px-1">write</span>
        )}
        <button
          onClick={onPreviewHere}
          title="Preview up to this stage"
          className="p-1 rounded hover:bg-bg-hover text-text-secondary hover:text-accent"
        >
          <Play size={12} />
        </button>
        <button
          onClick={onToggleEnabled}
          title={stage.enabled ? 'Disable stage' : 'Enable stage'}
          className="p-1 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary"
        >
          {stage.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
        <button
          onClick={onRemove}
          title="Remove stage"
          className="p-1 rounded hover:bg-bg-hover text-text-secondary hover:text-red-400"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border">
          {meta?.desc && (
            <div className="px-3 py-1 text-[11px] text-text-secondary bg-bg-primary/40">
              {meta.desc}
            </div>
          )}
          <div className="h-40">
            <Editor
              height="100%"
              language="javascript"
              theme={monacoTheme}
              value={stage.body}
              onChange={(v) => onBodyChange(v ?? '')}
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                lineNumbers: 'off',
                scrollBeyondLastLine: false,
                folding: false,
                wordWrap: 'on',
                automaticLayout: true,
                padding: { top: 8, bottom: 8 }
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function ViewToggle({ viewMode, setViewMode }) {
  const btn = (mode, Icon, label) => (
    <button
      onClick={() => setViewMode(mode)}
      title={label}
      className={`p-1 rounded ${viewMode === mode ? 'bg-bg-hover text-accent' : 'text-text-secondary hover:text-text-primary'}`}
    >
      <Icon size={13} />
    </button>
  )
  return (
    <div className="flex items-center gap-0.5">
      {btn('tree', ListTree, 'Tree')}
      {btn('table', TableIcon, 'Table')}
      {btn('json', FileJson, 'JSON')}
    </div>
  )
}
