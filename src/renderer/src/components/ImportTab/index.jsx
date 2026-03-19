import React, { useState, useEffect, useRef } from 'react'
import { 
  Upload, 
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
  Clipboard,
  FileText,
  Code,
  FileSpreadsheet
} from 'lucide-react'

const ImportTab = ({ tab }) => {
  const [sourceType, setSourceType] = useState('file') // file, clipboard
  const [format, setFormat] = useState('json') // jsonl, json, csv, xlsx
  const [filePath, setFilePath] = useState('')
  const [clipboardData, setClipboardData] = useState('')
  const [options, setOptions] = useState({
    importMode: 'stop', // stop, skip, upsert
    dropCollection: false,
    batchSize: 1000,
    csvOptions: {
      delimiter: 'comma'
    },
    useTransform: false,
    transformCode: `(doc) => {\n  // doc.newField = "hello";\n  return doc;\n}`
  })
  const [etlError, setEtlError] = useState(null)
  
  const [isImporting, setIsImporting] = useState(false)
  const [progress, setProgress] = useState(null) // { processed, success, failed, percentage }
  const [status, setStatus] = useState('idle') // idle, importing, done, error, aborted
  const [operationId, setOperationId] = useState(null)
  const opIdRef = useRef(null)

  useEffect(() => {
    opIdRef.current = operationId
  }, [operationId])
  const [error, setError] = useState(null)
  
  const [previewData, setPreviewData] = useState([])
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  
  const [allFields, setAllFields] = useState([])
  const [selectedFields, setSelectedFields] = useState([])

  const { connId, dbName, collectionName } = tab

  const handleBrowse = async () => {
    // We need to implement an IPC handler for 'shell:openFile' in main/index.js later
    try {
      const path = await window.electron.ipcRenderer.invoke('shell:openFile', {
        title: 'Select Import File',
        filters: [
          { name: 'Supported Files', extensions: ['json', 'jsonl', 'jsonlines', 'csv', 'tsv', 'xlsx', 'gz'] },
          { name: 'Excel Spreadsheet', extensions: ['xlsx'] },
          { name: 'JSON Array', extensions: ['json', 'json.gz'] },
          { name: 'JSON Lines', extensions: ['jsonl', 'jsonlines', 'jsonl.gz', 'jsonlines.gz'] },
          { name: 'CSV Files', extensions: ['csv', 'tsv', 'csv.gz', 'tsv.gz'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      if (path) {
        setFilePath(path)
        // Auto-detect format based on extension (ignoring .gz)
        const lowerPath = path.toLowerCase()
        const isGzip = lowerPath.endsWith('.gz')
        const baseName = isGzip ? lowerPath.slice(0, -3) : lowerPath
        
        if (baseName.endsWith('.csv') || baseName.endsWith('.tsv')) setFormat('csv')
        else if (baseName.endsWith('.xlsx')) setFormat('xlsx')
        else if (baseName.endsWith('.jsonl') || baseName.endsWith('.jsonlines')) setFormat('jsonl')
        else setFormat('json')
      }
    } catch (err) {
      console.error('Failed to open file dialog', err)
    }
  }

  const startImport = async () => {
    if (sourceType === 'file' && !filePath) {
      alert('Please select a source file first.')
      return
    }
    if (sourceType === 'clipboard' && !clipboardData.trim()) {
      alert('Please paste some data first.')
      return
    }
    
    setIsImporting(true)
    const opId = crypto.randomUUID()
    setOperationId(opId)
    opIdRef.current = opId
    setStatus('importing')
    setError(null)
    setProgress({ processed: 0, success: 0, failed: 0, percentage: 0 })

    try {
      const result = await window.electron.ipcRenderer.invoke('db:importCollection', {
        operationId: opId,
        connId,
        dbName,
        collectionName,
        sourceType,
        filePath: sourceType === 'file' ? filePath : null,
        clipboardData: sourceType === 'clipboard' ? clipboardData : null,
        format,
        options: {
          ...options,
          selectedFields: selectedFields.length === allFields.length ? null : selectedFields
        }
      })

      if (result.ok) {
        setStatus(prev => prev === 'aborted' ? 'aborted' : 'done')
      } else {
        setStatus(prev => prev === 'aborted' ? 'aborted' : 'error')
        if (status !== 'aborted') setError(result.error)
      }
    } catch (err) {
      if (status !== 'aborted') {
        setStatus('error')
        setError(err.message)
      }
    } finally {
      setIsImporting(false)
    }
  }

  const handleAbort = async () => {
    if (!operationId) return
    try {
      await window.electron.ipcRenderer.invoke('db:abortOperation', { operationId })
      setStatus('aborted')
      setIsImporting(false)
    } catch (e) {
      console.error('Failed to abort import', e)
    }
  }

  // Listen for progress updates
  useEffect(() => {
    const unsubscribe = window.electron.ipcRenderer.on('db:importProgress', (e, data) => {
      // Strict Isolation: Ignore any progress from old operations OR if no operation is active
      if (!opIdRef.current || data.operationId !== opIdRef.current) return
      setProgress(data)
    })
    return () => unsubscribe()
  }, [])

  const fetchPreview = async () => {
    if ((sourceType === 'file' && !filePath) || (sourceType === 'clipboard' && !clipboardData.trim())) {
      setPreviewData([])
      return
    }
    
    setIsPreviewLoading(true)
    try {
      const res = await window.electron.ipcRenderer.invoke('db:previewImport', {
        sourceType,
        filePath: sourceType === 'file' ? filePath : null,
        clipboardData: sourceType === 'clipboard' ? clipboardData : null,
        format,
        csvOptions: format === 'csv' ? options.csvOptions : null,
        transformCode: options.useTransform ? options.transformCode : null
      })
      if (res.ok) {
        setEtlError(null)
        const parsed = JSON.parse(res.data)
        setPreviewData(parsed)
        
        // Extract all unique fields
        const fields = new Set()
        parsed.forEach(doc => {
          Object.keys(doc).forEach(k => fields.add(k))
        })
        const uniqueFields = Array.from(fields)
        
        setAllFields(prevAll => {
          setSelectedFields(prevSelected => {
            if (prevAll.length === 0) return uniqueFields
            const stillSelected = prevSelected.filter(f => uniqueFields.includes(f))
            const brandNew = uniqueFields.filter(f => !prevAll.includes(f))
            return [...new Set([...stillSelected, ...brandNew])]
          })
          return uniqueFields
        })
      } else {
        if (res.error?.includes('ETL')) {
          setEtlError(res.error)
        } else {
          console.error('Preview error:', res.error)
        }
        setPreviewData([])
        setAllFields([])
        setSelectedFields([])
      }
    } catch (e) {
      console.error(e)
      setPreviewData([])
      setAllFields([])
      setSelectedFields([])
    } finally {
      setIsPreviewLoading(false)
    }
  }

  // Auto fetch preview whenever source changes
  useEffect(() => {
    fetchPreview()
  }, [sourceType, filePath, clipboardData, format, options.csvOptions, options.useTransform, options.transformCode])

  return (
    <div className="flex-1 flex flex-col bg-bg-primary overflow-auto p-6 scrollbar-premium">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center text-green-500">
            <Upload size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-primary capitalize">Import Documents</h2>
            <p className="text-xs text-text-secondary">
              Import documents into <code className="bg-bg-tertiary px-1 rounded text-green-400">{dbName}.{collectionName}</code>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Left Column: Configuration */}
        <div className="xl:col-span-5 space-y-6">
          
          {/* 1. Source */}
          <section className="bg-bg-secondary/50 border border-border rounded-xl p-5">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-4 flex items-center gap-2">
              <Monitor size={14} /> 1. Data Source
            </h3>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setSourceType('file')}
                className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 transition-colors ${sourceType === 'file' ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary/50'}`}
              >
                <FileText size={14} /> File
              </button>
              <button
                onClick={() => setSourceType('clipboard')}
                className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 transition-colors ${sourceType === 'clipboard' ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary/50'}`}
              >
                <Clipboard size={14} /> Clipboard
              </button>
            </div>

            {sourceType === 'file' ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  placeholder="Select source file (.json, .csv, .jsonl, .xlsx)"
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
            ) : (
              <textarea
                value={clipboardData}
                onChange={(e) => setClipboardData(e.target.value)}
                placeholder="Paste your JSON or CSV text here..."
                className="w-full h-32 bg-bg-tertiary border border-border rounded p-3 text-xs text-text-primary focus:outline-none focus:border-green-500/50 resize-none font-mono scrollbar-premium"
              />
            )}
          </section>

          {/* 2. Format */}
          <section className="bg-bg-secondary/50 border border-border rounded-xl p-5">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-4 flex items-center gap-2">
              <Settings size={14} /> 2. Data Format
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'json', label: 'JSON Array', icon: <FileJson size={16} /> },
                { id: 'jsonl', label: 'JSON Lines', icon: <FileJson size={16} /> },
                { id: 'csv', label: 'CSV', icon: <FileType size={16} /> },
                { id: 'xlsx', label: 'XLSX', icon: <FileSpreadsheet size={16} /> }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${format === f.id ? 'bg-green-500/10 border-green-500/50 text-green-400' : 'bg-bg-tertiary/30 border-transparent text-text-secondary hover:border-border'}`}
                >
                  {f.icon}
                  <span className="text-xs font-medium">{f.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 2.5 CSV Options (Only shown if format is csv) */}
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
                      onClick={() => setOptions({ ...options, csvOptions: { ...options.csvOptions, delimiter: d.id } })}
                      className={`px-3 py-2 text-[11px] rounded border transition-all ${options.csvOptions?.delimiter === d.id ? 'bg-green-500/10 border-green-500/50 text-green-400' : 'bg-bg-tertiary/30 border-transparent text-text-secondary hover:border-border'}`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* 2.6 Transformation (ETL) */}
          <section className="bg-bg-secondary/50 border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest flex items-center gap-2">
                <Code size={14} /> Transformation (ETL)
              </h3>
              <div 
                onClick={() => setOptions({ ...options, useTransform: !options.useTransform })}
                className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors ${options.useTransform ? 'bg-accent' : 'bg-bg-tertiary'}`}
              >
                <div className={`w-3 h-3 bg-white rounded-full transition-transform ${options.useTransform ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            </div>
            {options.useTransform && (
              <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
                <p className="text-[10px] text-text-secondary leading-relaxed">
                  Write JavaScript to transform each document. Returning <code>null</code> will skip the document.
                </p>
                <div className="relative group">
                  <textarea
                    value={options.transformCode}
                    onChange={(e) => setOptions({ ...options, transformCode: e.target.value })}
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

          {/* 3. Field Mapping */}
          <section className="bg-bg-secondary/50 border border-border rounded-xl p-5 h-64 flex flex-col">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2"><TableIcon size={14} /> 3. Field Mapping</span>
              <button 
                onClick={() => setSelectedFields(selectedFields.length === allFields.length ? [] : allFields)}
                className="text-[10px] text-green-500 hover:underline"
              >
                {selectedFields.length === allFields.length ? 'Clear All' : 'Select All'}
              </button>
            </h3>
            {allFields.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs text-text-secondary italic">
                No fields available yet
              </div>
            ) : (
              <div className="flex-1 overflow-auto space-y-1 pr-2 scrollbar-premium">
                {allFields.map(field => (
                  <div 
                    key={field}
                    onClick={() => {
                      if (selectedFields.includes(field)) setSelectedFields(selectedFields.filter(f => f !== field))
                      else setSelectedFields([...selectedFields, field])
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg-tertiary cursor-pointer group transition-colors"
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedFields.includes(field) ? 'bg-green-500 border-green-500 text-white' : 'border-border group-hover:border-text-secondary'}`}>
                      {selectedFields.includes(field) && <Check size={10} />}
                    </div>
                    <span className={`text-xs ${selectedFields.includes(field) ? 'text-text-primary' : 'text-text-secondary'}`}>{field}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 4. Options */}
          <section className="bg-bg-secondary/50 border border-border rounded-xl p-5">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2"><Settings size={14} /> 4. Options</span>
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="text-[10px] text-text-secondary uppercase tracking-wider font-bold">Import Mode</span>
                <div className="space-y-1.5">
                  {[
                    { id: 'stop', label: 'Stop on Duplicate (Default)', desc: 'Stops import at first error' },
                    { id: 'skip', label: 'Skip Duplicates', desc: 'Ignore errors and continue' },
                    { id: 'upsert', label: 'Upsert Mode', desc: 'Update if _id exists' }
                  ].map(m => (
                    <label key={m.id} className="flex items-start gap-2 p-2 rounded border border-border/50 hover:bg-bg-tertiary/50 cursor-pointer transition-colors group">
                      <input 
                        type="radio" 
                        name="importMode"
                        checked={options.importMode === m.id}
                        onChange={() => setOptions({...options, importMode: m.id})}
                        className="mt-0.5 accent-green-500"
                      />
                      <div className="flex flex-col">
                        <span className={`text-[11px] font-bold ${options.importMode === m.id ? 'text-green-400' : 'text-text-primary'}`}>{m.label}</span>
                        <span className="text-[9px] text-text-secondary">{m.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-border/30">
                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex flex-col">
                    <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">Drop collection before import</span>
                    <span className="text-[9px] text-red-400 opacity-70 italic">Warning: This wipes existing data</span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={options.dropCollection}
                    onChange={(e) => setOptions({...options, dropCollection: e.target.checked})}
                    className="accent-red-500"
                  />
                </label>
              </div>
              
              <div className="flex items-center justify-between pt-2 border-t border-border/30">
                <span className="text-xs text-text-secondary">Batch Size (documents)</span>
                <input 
                  type="number"
                  value={options.batchSize}
                  onChange={(e) => setOptions({...options, batchSize: parseInt(e.target.value) || 1000})}
                  className="bg-bg-tertiary border border-border rounded px-2 py-1 text-xs w-20 text-right focus:outline-none focus:border-green-500/50"
                  min="1"
                  max="10000"
                />
              </div>
            </div>
          </section>

          {/* Action Button */}
          <button
            onClick={isImporting ? handleAbort : startImport}
            className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${isImporting ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-green-600 text-white hover:bg-green-500 hover:scale-[1.02] active:scale-[0.98]'}`}
          >
            {isImporting ? (
              <><X size={18} /> Stop Import</>
            ) : (
              <><Upload size={18} /> Start Import</>
            )}
          </button>
        </div>

        {/* Right Column: Status */}
        <div className="xl:col-span-7 flex flex-col gap-6">
          {/* Progress Overlay (when importing) */}
          {status === 'importing' && (
            <div className="flex-1 bg-green-500/5 border border-green-500/20 rounded-xl p-8 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300 min-h-[400px]">
              <div className="relative w-24 h-24 mb-6">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <circle className="text-bg-tertiary stroke-current" strokeWidth="8" fill="transparent" r="40" cx="50" cy="50" />
                  <circle 
                    className="text-green-500 stroke-current transition-all duration-300 ease-out" 
                    strokeWidth="8" 
                    strokeDasharray={`${(progress?.percentage || 0) * 2.512}, 251.2`} 
                    strokeLinecap="round" 
                    fill="transparent" 
                    r="40" 
                    cx="50" 
                    cy="50" 
                    transform="rotate(-90 50 50)" 
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-bold text-xl text-green-400">
                  {progress?.percentage || 0}%
                </div>
              </div>
              <h4 className="text-lg font-bold mb-4 text-green-400">Importing Data...</h4>
              <div className="grid grid-cols-2 gap-4 w-full max-w-sm text-center">
                <div className="bg-bg-tertiary rounded p-2 border border-border">
                  <div className="text-[10px] text-text-secondary uppercase mb-1">Processed</div>
                  <div className="text-sm font-bold">{progress?.processed?.toLocaleString() || 0}</div>
                </div>
                <div className="bg-bg-tertiary rounded p-2 border border-border">
                  <div className="text-[10px] text-text-secondary uppercase mb-1">Success</div>
                  <div className="text-sm font-bold text-green-400">{progress?.success?.toLocaleString() || 0}</div>
                </div>
              </div>
              {progress?.failed > 0 && (
                <div className="mt-4 text-xs text-red-400 flex items-center gap-1">
                  <X size={14} /> {progress.failed.toLocaleString()} documents failed
                </div>
              )}
            </div>
          )}

          {/* Done Status */}
          {status === 'done' && (
            <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-xl p-8 flex flex-col items-center justify-center text-center min-h-[400px]">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 mb-4">
                <Check size={32} strokeWidth={3} />
              </div>
              <h4 className="text-lg font-bold text-green-400 mb-1">Import Completed!</h4>
              <p className="text-sm text-text-secondary mb-6">
                Successfully inserted <span className="text-text-primary font-bold">{progress?.success?.toLocaleString()}</span> documents.
              </p>
              
              {progress?.failed > 0 && (
                <div className="bg-red-500/10 border border-red-500/20 rounded p-4 mb-6 w-full max-w-md text-left">
                  <p className="text-xs font-bold text-red-400 mb-1 flex items-center gap-1">
                    <X size={14} /> Partially Succeeded
                  </p>
                  <p className="text-xs text-red-300 font-mono">
                    {progress.failed.toLocaleString()} documents failed to import (e.g., duplicate _id).
                  </p>
                </div>
              )}

              <button
                onClick={() => setStatus('idle')}
                className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-500 transition-colors"
              >
                Close / Import Another
              </button>
            </div>
          )}

          {/* Error Status */}
          {status === 'error' && (
            <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-xl p-8 flex flex-col items-center justify-center text-center min-h-[400px]">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 mb-4">
                <X size={32} strokeWidth={3} />
              </div>
              <h4 className="text-lg font-bold text-red-400 mb-2">Import Failed</h4>
              <p className="bg-bg-tertiary p-3 rounded border border-red-500/20 text-xs text-red-300 w-full max-w-md font-mono mb-6 max-h-32 overflow-auto text-left">
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

          {/* Idle / Preview Status */}
          {status === 'idle' && (
            <div className="flex-1 flex flex-col bg-bg-secondary/50 border border-border rounded-xl p-6 min-h-[400px]">
              <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-6 flex items-center justify-between">
                <span className="flex items-center gap-2"><ChevronRight size={14} className="text-green-500" /> Sample Preview (Top 5 docs)</span>
                {isPreviewLoading && <RefreshCw size={14} className="animate-spin text-text-secondary" />}
              </h3>
              
              <div className="flex-1 overflow-auto border border-border rounded-lg scrollbar-premium">
                {previewData.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-text-secondary opacity-40 italic py-12">
                    <TableIcon size={48} className="mb-2" />
                    No data to preview
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead className="bg-bg-tertiary sticky top-0 z-10">
                      <tr>
                        {selectedFields.length > 0 ? selectedFields.map(f => (
                          <th key={f} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary border-b border-border">
                            {f}
                          </th>
                        )) : (
                          <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary border-b border-border italic text-center">
                            No fields selected
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((doc, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-bg-tertiary/30 transition-colors">
                          {selectedFields.length > 0 ? selectedFields.map(f => {
                            const val = doc[f]
                            let displayVal = ''
                            if (val === undefined) displayVal = <span className="italic opacity-30">undefined</span>
                            else if (val === null) displayVal = <span className="text-yellow-500/70 italic">null</span>
                            else if (typeof val === 'object') displayVal = <span className="text-blue-400 font-mono text-[10px]">{JSON.stringify(val).substring(0, 50)}...</span>
                            else displayVal = String(val)

                            return (
                              <td key={f} className="px-4 py-3 text-xs text-text-primary/90 font-mono max-w-[200px] truncate" title={String(val)}>
                                {displayVal}
                              </td>
                            )
                          }) : (
                            <td className="px-4 py-3 text-xs text-text-secondary italic text-center">...</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              
              <div className="mt-4 flex items-center justify-between text-[11px] text-text-secondary">
                <p>Previewing parsed format to ensure correctness.</p>
                <button onClick={fetchPreview} className="hover:text-green-500 flex items-center gap-1 transition-colors">
                  <RefreshCw size={11} /> Validate Data
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ImportTab
