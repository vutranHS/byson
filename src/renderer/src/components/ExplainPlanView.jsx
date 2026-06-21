/* eslint-disable react/prop-types */
import { useMemo } from 'react'
import { AlertTriangle, Database, Zap } from 'lucide-react'

// Locate the queryPlanner block across the common explain shapes (top-level,
// aggregation $cursor stage, or first shard).
const findQueryPlanner = (ex) => {
  if (!ex || typeof ex !== 'object') return null
  if (ex.queryPlanner) return ex.queryPlanner
  if (Array.isArray(ex.stages)) {
    const cur = ex.stages.find((s) => s && s.$cursor)
    if (cur?.$cursor?.queryPlanner) return cur.$cursor.queryPlanner
  }
  if (ex.shards) {
    const first = Object.values(ex.shards)[0]
    if (first?.queryPlanner) return first.queryPlanner
    if (first?.stages) {
      const cur = first.stages.find((s) => s && s.$cursor)
      if (cur?.$cursor?.queryPlanner) return cur.$cursor.queryPlanner
    }
  }
  return null
}

const findExecStats = (ex) => {
  if (!ex || typeof ex !== 'object') return null
  if (ex.executionStats) return ex.executionStats
  if (Array.isArray(ex.stages)) {
    const cur = ex.stages.find((s) => s && s.$cursor)
    if (cur?.$cursor?.executionStats) return cur.$cursor.executionStats
  }
  if (ex.shards) {
    const first = Object.values(ex.shards)[0]
    if (first?.executionStats) return first.executionStats
  }
  return null
}

// Flatten a winning-plan tree (classic or SBE) into a depth-tagged list.
const flattenPlan = (node, depth = 0, out = []) => {
  if (!node || typeof node !== 'object') return out
  const stage = node.stage || node.nodeType
  if (stage) {
    out.push({
      stage,
      indexName: node.indexName,
      keyPattern: node.keyPattern,
      direction: node.direction,
      filter: node.filter,
      depth
    })
  }
  const children = []
  if (node.inputStage) children.push(node.inputStage)
  if (Array.isArray(node.inputStages)) children.push(...node.inputStages)
  if (node.innerStage) children.push(node.innerStage)
  if (node.outerStage) children.push(node.outerStage)
  if (node.thenStage) children.push(node.thenStage)
  if (node.elseStage) children.push(node.elseStage)
  children.forEach((c) => flattenPlan(c, depth + 1, out))
  return out
}

// Coerce a value that may be an EJSON-wrapped number ({$numberInt: "5"} etc.).
const toNum = (v) => {
  if (v == null || typeof v === 'number') return v
  if (typeof v === 'object') {
    const w = v.$numberInt ?? v.$numberLong ?? v.$numberDouble ?? v.$numberDecimal
    if (w != null) return Number(w)
    return null
  }
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

// Aggregation execution stages (everything after the $cursor entry).
const aggStageNames = (ex) => {
  if (!Array.isArray(ex?.stages)) return []
  return ex.stages.map((s) => Object.keys(s || {})[0]).filter((k) => k && k !== '$cursor')
}

export default function ExplainPlanView({ explain, isLight }) {
  const parsed = useMemo(() => {
    const qp = findQueryPlanner(explain)
    const es = findExecStats(explain)
    const winning = qp?.winningPlan?.queryPlan || qp?.winningPlan || null
    const planList = winning ? flattenPlan(winning) : []
    return { qp, es, planList, aggStages: aggStageNames(explain) }
  }, [explain])

  const { qp, es, planList, aggStages } = parsed
  const hasCollScan = planList.some((p) => p.stage === 'COLLSCAN')

  // Could not recognise the shape, so show raw JSON and hide nothing.
  if (!qp && !es) {
    return (
      <pre className="p-3 text-xs font-mono whitespace-pre-wrap overflow-auto h-full">
        {JSON.stringify(explain, null, 2)}
      </pre>
    )
  }

  const stat = (label, value) => (
    <div className="flex flex-col px-2.5 py-1 rounded bg-bg-tertiary">
      <span className="text-[9px] uppercase tracking-wide text-text-secondary">{label}</span>
      <span className="text-xs font-mono text-text-primary">{value}</span>
    </div>
  )

  const examined = toNum(es?.totalDocsExamined)
  const returned = toNum(es?.nReturned)
  const keys = toNum(es?.totalKeysExamined)
  const timeMs = toNum(es?.executionTimeMillis)
  const ratio = examined != null && returned != null && returned > 0 ? examined / returned : null

  return (
    <div className="h-full overflow-auto p-3 flex flex-col gap-3 text-text-primary">
      {hasCollScan && (
        <div className="flex items-start gap-2 px-3 py-2 rounded bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            This pipeline runs a <span className="font-mono">COLLSCAN</span> (full collection scan).
            Consider adding an index on the fields used by early{' '}
            <span className="font-mono">$match</span> / <span className="font-mono">$sort</span>{' '}
            stages.
          </span>
        </div>
      )}

      {es && (
        <div className="flex flex-wrap gap-1.5">
          {returned != null && stat('Returned', returned)}
          {examined != null && stat('Docs examined', examined)}
          {keys != null && stat('Keys examined', keys)}
          {timeMs != null && stat('Time', `${timeMs}ms`)}
          {ratio != null && stat('Examined / returned', `${ratio.toFixed(1)}x`)}
        </div>
      )}

      {ratio != null && ratio > 100 && returned > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 text-xs">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            Scanned {examined} documents to return {returned}. A supporting index would cut the work
            dramatically.
          </span>
        </div>
      )}

      {planList.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-text-secondary mb-1">
            Winning plan
          </div>
          <div className="rounded border border-border bg-bg-primary overflow-hidden">
            {planList.map((p, i) => {
              const isScan = p.stage === 'COLLSCAN'
              const isIx = p.stage === 'IXSCAN' || p.stage === 'DISTINCT_SCAN'
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2 py-1 text-xs border-b border-border last:border-b-0"
                  style={{ paddingLeft: `${8 + p.depth * 14}px` }}
                >
                  {isScan ? (
                    <AlertTriangle size={12} className="text-orange-400 shrink-0" />
                  ) : isIx ? (
                    <Zap size={12} className="text-green-500 shrink-0" />
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  <span
                    className={`font-mono ${
                      isScan ? 'text-orange-400' : isIx ? 'text-green-500' : 'text-text-primary'
                    }`}
                  >
                    {p.stage}
                  </span>
                  {p.indexName && (
                    <span className="text-text-secondary font-mono truncate">
                      <Database size={10} className="inline mb-0.5 mr-1" />
                      {p.indexName}
                    </span>
                  )}
                  {p.direction && p.direction !== 'forward' && (
                    <span className="text-text-secondary">({p.direction})</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {aggStages.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-text-secondary mb-1">
            Aggregation stages
          </div>
          <div className="flex flex-wrap gap-1">
            {aggStages.map((name, i) => (
              <span
                key={i}
                className={`font-mono text-[11px] px-1.5 py-0.5 rounded ${
                  isLight ? 'bg-black/5' : 'bg-white/5'
                } text-text-secondary`}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      <details className="mt-1">
        <summary className="text-[11px] text-text-secondary cursor-pointer hover:text-text-primary">
          Raw explain output
        </summary>
        <pre className="mt-1 p-2 text-[11px] font-mono whitespace-pre-wrap overflow-auto rounded bg-bg-primary border border-border max-h-72">
          {JSON.stringify(explain, null, 2)}
        </pre>
      </details>
    </div>
  )
}
