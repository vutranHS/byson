import React, { useState, useEffect, useRef } from 'react'
import { 
  Download, 
  Settings, 
  FileJson, 
  FileType, 
  Check, 
  X, 
  Play, 
  RefreshCw,
  Table as TableIcon,
  ChevronRight,
  Monitor,
  Code,
  FileSpreadsheet
} from 'lucide-react'
import { EJSON } from 'bson'

const ExportTab = ({ tab }) => {
  const [format, setFormat] = useState('jsonl') // jsonl, json, csv
  const [filePath, setFilePath] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState(null) // { processed, total, percentage }
  const [previewData, setPreviewData] = useState([])
  const [allFields, setAllFields] = useState([])
  const [selectedFields, setSelectedFields] = useState([])
  const [limit, setLimit] = useState(100)
  const [csvDelimiter, setCsvDelimiter] = useState('comma') // comma, semicolon, tab, pipe
  const [useTransform, setUseTransform] = useState(false)
  const [transformCode, setTransformCode] = useState(`(doc) => {\n  // doc.newField = "hello";\n  return doc;\n}`)
  const [etlError, setEtlError] = useState(null)
  const [useCompression, setUseCompression] = useState(false)
  const [status, setStatus] = useState('idle') // idle, exporting, done, error, aborted
  const [operationId, setOperationId] = useState(null)
  const opIdRef = useRef(null)

  useEffect(() => {
    opIdRef.current = operationId
  }, [operationId])

  const [error, setError] = useState(null)
  
  // Initialize query filter with stringified tab.initialQuery if provided
  const [queryFilter, setQueryFilter] = useState(() => {
    if (tab.initialQuery) return typeof tab.initialQuery === 'string' ? tab.initialQuery : JSON.stringify(tab.initialQuery, null, 2)
    return '{}'
  })

  const { connId, dbName, collectionName } = tab

  // Load preview and available fields
  useEffect(() => {
    fetchPreview()
  }, [connId, dbName, collectionName, queryFilter, useTransform, transformCode])

  const fetchPreview = async () => {
    try {
      const trimmedQuery = queryFilter.trim()
      let isRawQueryString = trimmedQuery.toLowerCase().startsWith('db.')
      
      let queryObj = {}
      if (!isRawQueryString) {
        try {
          queryObj = trimmedQuery ? (trimmedQuery.startsWith('{') ? JSON.parse(trimmedQuery) : eval(`(${trimmedQuery})`)) : {}
        } catch (e) {
          // If query is invalid, we might still want to fetch preview with empty query
          // or just return and wait for user to fix it.
        }
      }

      const res = await window.electron.ipcRenderer.invoke('db:previewExport', {
        connId,
        dbName,
        collectionName,
        query: isRawQueryString ? null : queryObj,
        queryString: isRawQueryString ? trimmedQuery : null,
        transformCode: useTransform ? transformCode : null
      })
      
      if (res.ok) {
        setEtlError(null)
        const data = EJSON.deserialize(res.data)
        setPreviewData(data)
        
        // Extract all possible fields from the sample
        const fields = new Set()
        data.forEach(doc => {
          Object.keys(doc).forEach(f => fields.add(f))
        })
        const fieldList = Array.from(fields)
        
        setAllFields(prevAll => {
          setSelectedFields(prevSelected => {
            // If it's the first load (prevAll is empty), select all
            if (prevAll.length === 0) return fieldList
            
            // Keep fields that were already selected and still exist
            const stillSelected = prevSelected.filter(f => fieldList.includes(f))
            // Find fields that are brand new (not in prevAll) and select them by default
            const brandNew = fieldList.filter(f => !prevAll.includes(f))
            
            return [...new Set([...stillSelected, ...brandNew])]
          })
          return fieldList
        })
      } else {
        if (res.error?.includes('ETL')) {
          setEtlError(res.error)
        } else {
          console.error('Failed to fetch preview:', res.error)
        }
      }
    } catch (err) {
      console.error('Failed to fetch preview:', err)
    }
  }

  const handleAbort = async () => {
    if (!operationId) return
    try {
      await window.electron.ipcRenderer.invoke('db:abortOperation', { operationId })
      setStatus('aborted')
      setIsExporting(false)
    } catch (e) {
      console.error('Failed to abort export', e)
    }
  }

  const handleBrowse = async () => {
    let ext = format === 'xlsx' ? 'xlsx' : (format === 'csv' ? 'csv' : 'jsonl')
    if (useCompression && format !== 'xlsx') ext += '.gz'
    
    const defaultName = `${collectionName}_export.${ext}`
    const path = await window.electron.ipcRenderer.invoke('shell:saveFile', {
      title: 'Save Export File',
      defaultPath: defaultName,
      filters: [
        { 
          name: format === 'xlsx' ? 'Excel Spreadsheet' : (format === 'csv' ? 'CSV Files' : (format === 'jsonl' ? 'JSON Lines' : 'JSON Files')), 
          extensions: [ext] 
        }
      ]
    })
    if (path) setFilePath(path)
  }

  const startExport = async () => {
    if (!filePath) {
      alert('Please select a destination file first.')
      return
    }
    
    setIsExporting(true)
    const opId = crypto.randomUUID()
    setOperationId(opId)
    opIdRef.current = opId
    setStatus('exporting')
    setError(null)
    setProgress({ processed: 0, total: 0, percentage: 0 })

    // Setup projection based on selected fields
    const projection = {}
    if (selectedFields.length < allFields.length) {
      selectedFields.forEach(f => projection[f] = 1)
      if (!selectedFields.includes('_id')) projection['_id'] = 0
    }

    try {
      let parsedQuery = {}
      let isRawQueryString = false
      const trimmedQuery = queryFilter.trim()

      if (trimmedQuery.toLowerCase().startsWith('db.')) {
        isRawQueryString = true
      } else {
        try {
          parsedQuery = JSON.parse(trimmedQuery)
        } catch (e) {
          try {
            // Fallback to eval to support relaxed JSON/JS objects
            parsedQuery = eval(`(${trimmedQuery})`)
          } catch(e2) {
             setError('Invalid Query format. Must be valid JSON or JS Object.')
             setStatus('error')
             setIsExporting(false)
             return
          }
        }
      }

      const result = await window.electron.ipcRenderer.invoke('db:exportCollection', {
        operationId: opId,
        connId,
        dbName,
        collectionName,
        filePath,
        format,
        csvOptions: format === 'csv' ? { delimiter: csvDelimiter } : null,
        transformCode: useTransform ? transformCode : null,
        useCompression,
        query: isRawQueryString ? null : parsedQuery,
        queryString: isRawQueryString ? trimmedQuery : null,
        projection
      })

      if (result.ok) {
        setStatus(prev => prev === 'aborted' ? 'aborted' : 'done')
      } else {
        setStatus(prev => {
          if (prev === 'aborted') return 'aborted'
          setError(result.error)
          return 'error'
        })
      }
    } catch (err) {
      setStatus(prev => {
        if (prev === 'aborted') return 'aborted'
        setError(err.message)
        return 'error'
      })
    } finally {
      setIsExporting(false)
      setOperationId(null)
    }
  }

  // Listen for progress
  useEffect(() => {
    const unsubscribe = window.electron.ipcRenderer.on('db:exportProgress', (e, data) => {
      // Strict Isolation: Ignore any progress from old operations OR if no operation is active
      if (!opIdRef.current || data.operationId !== opIdRef.current) return
      setProgress(data)
    })
    return () => unsubscribe()
  }, [])

  return (
    <div className="flex-1 flex flex-col bg-bg-primary overflow-auto p-6 scrollbar-premium">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center text-accent">
            <Download size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-primary capitalize">Export Documents</h2>
            <p className="text-xs text-text-secondary">
              Export documents from <code className="bg-bg-tertiary px-1 rounded text-accent">{dbName}.{collectionName}</code>
            </p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={fetchPreview}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            <RefreshCw size={14} className={isExporting ? 'animate-spin' : ''} />
            Refresh Preview
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Left Column: Configuration */}
        <div className="xl:col-span-4 space-y-6">
          {/* 1. Format Selection */}
          <section className="bg-bg-secondary/50 border border-border rounded-xl p-5">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-4 flex items-center gap-2">
              <Settings size={14} /> 1. Select Format
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'jsonl', label: 'JSONL', icon: <FileJson size={16} />, desc: 'One doc/line' },
                { id: 'json', label: 'JSON', icon: <FileJson size={16} />, desc: 'Standard array' },
                { id: 'csv', label: 'CSV', icon: <FileType size={16} />, desc: 'Spreadsheet' },
                { id: 'xlsx', label: 'XLSX', icon: <FileSpreadsheet size={16} />, desc: 'Excel' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${format === f.id ? 'bg-accent/10 border-accent text-accent' : 'bg-bg-tertiary/30 border-transparent text-text-secondary hover:border-border'}`}
                >
                  {f.icon}
                  <span className="text-xs font-medium">{f.label}</span>
                </button>
              ))}
            </div>
          </section>
          
          {/* 1.5 CSV Options (Only shown if format is csv) */}
          {format === 'csv' && (
            <section className="bg-bg-secondary/50 border border-border rounded-xl p-5 animate-in slide-in-from-top-2 duration-200">
              <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-4 flex items-center gap-2">
                <Settings size={14} /> CSV Options
              </h3>
              <div className="space-y-3">
                <label className="text-[10px] text-text-secondary uppercase font-bold px-1">Delimiter</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'comma', label: 'Comma (,)' },
                    { id: 'semicolon', label: 'Semicolon (;)' },
                    { id: 'tab', label: 'Tab (\\t)' },
                    { id: 'pipe', label: 'Pipe (|)' }
                  ].map(d => (
                    <button
                      key={d.id}
                      onClick={() => setCsvDelimiter(d.id)}
                      className={`px-3 py-2 text-[11px] rounded border transition-all ${csvDelimiter === d.id ? 'bg-accent/10 border-accent text-accent' : 'bg-bg-tertiary/30 border-transparent text-text-secondary hover:border-border'}`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* 1.5 Compression */}
          <section className="bg-bg-secondary/50 border border-border rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                  <Download size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Compression</h3>
                  <p className="text-[10px] text-text-secondary mt-0.5">Save space with on-the-fly Gzip</p>
                </div>
              </div>
              <div 
                onClick={() => setUseCompression(!useCompression)}
                className={`w-10 h-5 rounded-full p-1 cursor-pointer transition-colors ${useCompression ? 'bg-accent' : 'bg-bg-tertiary'}`}
              >
                <div className={`w-3 h-3 bg-white rounded-full transition-transform ${useCompression ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
            </div>
          </section>

          {/* 1.6 Transformation (ETL) */}
          <section className="bg-bg-secondary/50 border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest flex items-center gap-2">
                <Code size={14} /> Transformation (ETL)
              </h3>
              <div 
                onClick={() => setUseTransform(!useTransform)}
                className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors ${useTransform ? 'bg-accent' : 'bg-bg-tertiary'}`}
              >
                <div className={`w-3 h-3 bg-white rounded-full transition-transform ${useTransform ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            </div>
            {useTransform && (
              <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
                <p className="text-[10px] text-text-secondary leading-relaxed">
                  Write JavaScript to transform each document. Returning <code>null</code> will skip the document.
                </p>
                <div className="relative group">
                  <textarea
                    value={transformCode}
                    onChange={(e) => setTransformCode(e.target.value)}
                    spellCheck={false}
                    className={`w-full h-32 bg-bg-tertiary/50 border rounded-lg p-3 text-[11px] font-mono text-text-primary focus:outline-none transition-colors scrollbar-premium ${etlError ? 'border-red-500/50 focus:border-red-500' : 'border-border focus:border-accent/50'}`}
                  />
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[9px] bg-bg-primary/80 px-2 py-1 rounded text-text-secondary border border-border">JS</span>
                  </div>
                </div>
                {etlError && (
                  <p className="text-[10px] text-red-400 font-mono mt-2 bg-red-500/5 p-2 rounded border border-red-500/10">
                    {etlError}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* 2. Filter Query */}
          <section className="bg-bg-secondary/50 border border-border rounded-xl p-5">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-4 flex items-center gap-2">
              <Settings size={14} /> 2. Filter Query
            </h3>
            <div className="space-y-3">
              <textarea
                value={queryFilter}
                onChange={(e) => setQueryFilter(e.target.value)}
                placeholder={'{\n  "status": "active"\n}'}
                className="w-full h-32 bg-bg-tertiary border border-border rounded p-3 text-xs text-text-primary focus:outline-none focus:border-accent resize-none font-mono scrollbar-premium"
              />
              <p className="text-[10px] text-text-secondary">
                Provide a valid JSON or Javascript query object. Leave as {'{}'} to export all documents.
              </p>
            </div>
          </section>

          {/* 3. Destination */}
          <section className="bg-bg-secondary/50 border border-border rounded-xl p-5">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-4 flex items-center gap-2">
              <Monitor size={14} /> 3. Destination
            </h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  placeholder="Select destination file..."
                  value={filePath}
                  className="flex-1 bg-bg-tertiary border border-border rounded px-3 py-1.5 text-xs text-text-primary focus:outline-none"
                />
                <button
                  onClick={handleBrowse}
                  className="px-3 py-1.5 bg-bg-tertiary border border-border rounded text-xs font-medium hover:bg-bg-hover transition-colors"
                >
                  Browse
                </button>
              </div>
            </div>
          </section>

          {/* 4. Field Mapping */}
          <section className="bg-bg-secondary/50 border border-border rounded-xl p-5 h-64 flex flex-col">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2"><TableIcon size={14} /> 4. Field Mapping</span>
              <button 
                onClick={() => setSelectedFields(selectedFields.length === allFields.length ? [] : allFields)}
                className="text-[10px] text-accent hover:underline"
              >
                {selectedFields.length === allFields.length ? 'Clear All' : 'Select All'}
              </button>
            </h3>
            <div className="flex-1 overflow-auto space-y-1 pr-2 scrollbar-premium">
              {allFields.map(field => (
                <div 
                  key={field}
                  onClick={() => {
                    if (selectedFields.includes(field)) setSelectedFields(selectedFields.filter(f => f !== field))
                    else setSelectedFields([...selectedFields, field])
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg-tertiary cursor-pointer group"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedFields.includes(field) ? 'bg-accent border-accent text-white' : 'border-border group-hover:border-text-secondary'}`}>
                    {selectedFields.includes(field) && <Check size={10} />}
                  </div>
                  <span className={`text-xs ${selectedFields.includes(field) ? 'text-text-primary' : 'text-text-secondary'}`}>{field}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Action Button */}
          <button
            onClick={isExporting ? handleAbort : startExport}
            className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${isExporting ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-accent text-white hover:bg-accent-hover hover:scale-[1.02] active:scale-[0.98]'}`}
          >
            {isExporting ? (
              <><X size={18} /> Stop Export</>
            ) : (
              <><Play size={18} fill="currentColor" /> Start Export</>
            )}
          </button>
        </div>

        {/* Right Column: Preview & Status */}
        <div className="xl:col-span-8 flex flex-col gap-6">
          {/* Progress Overlay (when exporting) */}
          {status === 'exporting' && (
            <div className="bg-accent/5 border border-accent/20 rounded-xl p-8 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300">
              <div className="relative w-24 h-24 mb-6">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <circle className="text-bg-tertiary stroke-current" strokeWidth="8" fill="transparent" r="40" cx="50" cy="50" />
                  <circle 
                    className="text-accent stroke-current transition-all duration-300 ease-out" 
                    strokeWidth="8" 
                    strokeDasharray={`${(progress?.percentage || 0) * 2.512}, 251.2`} /* 2.512 = 251.2 / 100 */
                    strokeLinecap="round" 
                    fill="transparent" 
                    r="40" 
                    cx="50" 
                    cy="50" 
                    transform="rotate(-90 50 50)" 
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-bold text-xl">
                  {progress?.percentage}%
                </div>
              </div>
              <h4 className="text-lg font-bold mb-2">Exporting Data...</h4>
              <p className="text-sm text-text-secondary">
                Processed <span className="text-text-primary font-mono">{progress?.processed.toLocaleString()}</span> / {progress?.total.toLocaleString()} documents
              </p>
            </div>
          )}

          {/* Done Status */}
          {status === 'done' && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-8 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 mb-4">
                <Check size={32} strokeWidth={3} />
              </div>
              <h4 className="text-lg font-bold text-green-400 mb-1">Export Completed!</h4>
              <p className="text-sm text-text-secondary mb-4">
                Successfully exported <span className="text-text-primary font-bold">{progress?.processed.toLocaleString()}</span> documents to:
              </p>
              <code className="bg-bg-tertiary px-3 py-2 rounded border border-border text-xs mb-6 w-full max-w-md truncate">
                {filePath}
              </code>
              <button
                onClick={() => setStatus('idle')}
                className="px-6 py-2 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 transition-colors"
              >
                Close / Export Another
              </button>
            </div>
          )}

          {/* Error Status */}
          {status === 'error' && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-8 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 mb-4">
                <X size={32} strokeWidth={3} />
              </div>
              <h4 className="text-lg font-bold text-red-400 mb-2">Export Failed</h4>
              <p className="bg-bg-tertiary p-3 rounded border border-red-500/20 text-xs text-red-300 w-full max-w-md font-mono mb-6">
                {error}
              </p>
              <button
                onClick={() => setStatus('idle')}
                className="px-6 py-2 bg-red-500 text-white rounded-lg font-bold hover:bg-red-600 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Sample Preview */}
          <div className="flex-1 flex flex-col bg-bg-secondary/50 border border-border rounded-xl p-6 min-h-[400px]">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-6 flex items-center gap-2">
              <ChevronRight size={14} className="text-accent" /> Sample Preview (Top 5 docs)
            </h3>
            
            <div className="flex-1 overflow-auto border border-border rounded-lg scrollbar-premium">
              {previewData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-text-secondary opacity-40 italic">
                  <TableIcon size={48} className="mb-2" />
                  No data to preview
                </div>
              ) : (
                <table className="w-full text-left border-collapse min-w-max">
                  <thead className="bg-bg-tertiary sticky top-0 z-10">
                    <tr>
                      {selectedFields.map(f => (
                        <th key={f} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary border-b border-border">
                          {f}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((doc, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-bg-tertiary/30 transition-colors">
                        {selectedFields.map(f => {
                          const val = doc[f]
                          let displayVal = ''
                          if (val === undefined) displayVal = <span className="italic opacity-30">undefined</span>
                          else if (val === null) displayVal = <span className="text-yellow-500/70 italic">null</span>
                          else if (typeof val === 'object') displayVal = <span className="text-blue-400 font-mono text-[10px]">{JSON.stringify(val).substring(0, 50)}...</span>
                          else displayVal = String(val)

                          return (
                            <td key={f} className="px-4 py-3 text-xs text-text-primary/90 font-mono">
                              {displayVal}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            
            <div className="mt-4 flex items-center justify-between text-[11px] text-text-secondary">
              <p>Previewing current field selection and data types.</p>
              <button onClick={fetchPreview} className="hover:text-accent flex items-center gap-1">
                <RefreshCw size={11} /> Reload Sample
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ExportTab
