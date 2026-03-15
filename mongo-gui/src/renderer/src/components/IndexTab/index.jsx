import { useEffect, useState, useMemo } from 'react'
import { useConnectionStore } from '../../store/connectionStore'
import { 
  Plus, 
  Trash2, 
  RefreshCw, 
  Settings2, 
  Fingerprint, 
  Database,
  Search,
  AlertCircle,
  FileJson,
  ChevronDown,
  Globe,
  MapPin,
  Type,
  X,
  Code,
  Activity
} from 'lucide-react'
import Editor from '@monaco-editor/react'

const INDEX_TYPES = ['1 (asc)', '-1 (desc)', 'hashed', 'text', '2dsphere', '2d']

const LANGUAGES = [
  '(default)', 'danish', 'dutch', 'english', 'finnish', 'french', 'german',
  'hungarian', 'italian', 'norwegian', 'portuguese', 'romanian', 'russian',
  'spanish', 'swedish', 'turkish'
]

export default function IndexTab({ tab }) {
  const { collectionIndexes, refreshIndexes } = useConnectionStore()
  const [loading, setLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [activeFormTab, setActiveFormTab] = useState('fields')
  const [showJsonPreview, setShowJsonPreview] = useState(false)

  // Form State
  const [form, setForm] = useState({
    name: '',
    fields: [{ name: '', type: '1 (asc)' }],
    unique: false,
    sparse: false,
    background: true,
    hidden: false,
    partial: false,
    partialFilter: '{\n  \n}',
    ttl: '',
    text: { version: '(default)', language: '(default)', override: '', weights: [] },
    geo: { min: '', max: '', precision: '', sphereVersion: '(default)' },
    collation: { enabled: false, locale: 'en', strength: '', caseLevel: '', caseFirst: '', numericOrdering: '', alternate: '', maxVariable: '', backwards: '' }
  })

  const idxKey = `${tab.connId}_${tab.dbName}_${tab.collectionName}`
  const indexes = collectionIndexes[idxKey] || []

  const handleRefresh = async () => {
    setLoading(true)
    await refreshIndexes(tab.connId, tab.dbName, tab.collectionName)
    setLoading(false)
  }

  useEffect(() => {
    if (indexes.length === 0) handleRefresh()
  }, [tab.id])

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getIndexType = (idx) => {
    const keys = Object.values(idx.key)
    if (keys.includes('hashed')) return 'Hashed'
    if (keys.includes('text')) return 'Text'
    if (keys.includes('2dsphere') || keys.includes('2d')) return 'Geospatial'
    return 'Regular'
  }

  const getProperties = (idx) => {
    const props = []
    if (idx.unique) props.push('Unique')
    if (idx.sparse) props.push('Sparse')
    if (idx.hidden) props.push('Hidden')
    if (idx.partialFilterExpression) props.push('Partial')
    if (idx.expireAfterSeconds !== undefined) props.push(`TTL (${idx.expireAfterSeconds}s)`)
    if (idx.collation) props.push('Collation')
    return props.join(', ') || 'None'
  }

  const addField = () => setForm({ ...form, fields: [...form.fields, { name: '', type: '1 (asc)' }] })
  const removeField = (i) => {
    const newFields = [...form.fields]
    newFields.splice(i, 1)
    setForm({ ...form, fields: newFields })
  }

  const generatePayload = () => {
    const keys = {}
    form.fields.forEach(f => {
      if (!f.name) return
      let val = f.type
      if (val === '1 (asc)') val = 1
      if (val === '-1 (desc)') val = -1
      keys[f.name] = val
    })

    const options = {}
    if (form.name) options.name = form.name
    if (form.unique) options.unique = true
    if (form.sparse) options.sparse = true
    if (form.hidden) options.hidden = true
    if (form.background) options.background = true
    
    const ttlVal = parseInt(form.ttl)
    if (!isNaN(ttlVal)) options.expireAfterSeconds = ttlVal

    if (form.partial) {
      try {
        options.partialFilterExpression = JSON.parse(form.partialFilter)
      } catch (err) {
        console.error('Invalid partial filter JSON')
      }
    }

    if (form.collation.enabled) {
      const collation = { locale: form.collation.locale }
      const strength = parseInt(form.collation.strength)
      if (!isNaN(strength)) collation.strength = strength
      
      if (form.collation.caseLevel !== '') collation.caseLevel = form.collation.caseLevel === 'true'
      if (form.collation.caseFirst) collation.caseFirst = form.collation.caseFirst
      if (form.collation.numericOrdering !== '') collation.numericOrdering = form.collation.numericOrdering === 'true'
      if (form.collation.alternate) collation.alternate = form.collation.alternate
      if (form.collation.maxVariable) collation.maxVariable = form.collation.maxVariable
      if (form.collation.backwards !== '') collation.backwards = form.collation.backwards === 'true'
      if (form.collation.normalization !== '') collation.normalization = form.collation.normalization === 'true'
      
      options.collation = collation
    }

    if (form.fields.some(f => f.type === 'text')) {
      if (form.text.version !== '(default)') options.textIndexVersion = parseInt(form.text.version)
      if (form.text.language !== '(default)') options.default_language = form.text.language
      if (form.text.override) options.language_override = form.text.override
      // Weights implementation (optional but good)
    }

    if (form.fields.some(f => f.type === '2dsphere')) {
      if (form.geo.sphereVersion !== '(default)') options['2dsphereIndexVersion'] = parseInt(form.geo.sphereVersion)
    }

    if (form.fields.some(f => f.type === '2d')) {
      const min = parseFloat(form.geo.min)
      const max = parseFloat(form.geo.max)
      const prec = parseInt(form.geo.precision)
      if (!isNaN(min)) options.min = min
      if (!isNaN(max)) options.max = max
      if (!isNaN(prec)) options.bits = prec
    }

    return { keys, options }
  }

  const handleCreate = async () => {
    const payload = generatePayload()
    if (Object.keys(payload.keys).length === 0) return alert('Please add at least one field')

    setLoading(true)
    const res = await window.electron.ipcRenderer.invoke('db:createIndex', {
      connId: tab.connId,
      dbName: tab.dbName,
      collectionName: tab.collectionName,
      ...payload
    })
    setLoading(false)

    if (res.ok) {
      setIsAdding(false)
      handleRefresh()
    } else {
      alert(res.error)
    }
  }

  const handleDrop = async (indexName) => {
    if (!confirm(`Are you sure you want to drop index "${indexName}"?`)) return
    const res = await window.electron.ipcRenderer.invoke('db:dropIndex', {
      connId: tab.connId,
      dbName: tab.dbName,
      collectionName: tab.collectionName,
      indexName
    })
    if (res.ok) handleRefresh()
    else alert(res.error)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg-primary overflow-hidden font-sans">
      {/* Header Bar */}
      <div className="flex justify-between items-center px-4 py-2 border-b border-border bg-bg-secondary/80 backdrop-blur select-none shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-accent/10 rounded-lg">
            <Settings2 size={16} className="text-accent" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest leading-none mb-1">Index Management</span>
            <span className="text-sm font-bold text-text-primary leading-none">{tab.collectionName}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={loading} className="p-2 rounded-lg hover:bg-bg-tertiary text-text-secondary transition-all">
            <RefreshCw size={16} className={loading ? 'animate-spin text-accent' : ''} />
          </button>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-lg active:scale-95"
          >
            <Plus size={16} /> Add Index
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar p-6">
        {/* ADD INDEX OVERLAY / FORM */}
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-bg-secondary w-full max-w-2xl rounded-2xl border border-border/50 shadow-2xl flex flex-col max-h-full overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="px-6 py-4 border-b border-border/40 flex justify-between items-center bg-bg-tertiary/30">
                <h3 className="text-sm font-bold flex items-center gap-2 text-text-primary">
                  <Plus size={16} className="text-accent" /> New Index for {tab.collectionName}
                </h3>
                <button onClick={() => setIsAdding(false)} className="text-text-tertiary hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>

              {/* Form Tabs */}
              <div className="flex px-2 pt-2 gap-1 border-b border-border/20 bg-bg-tertiary/10">
                {['fields', 'options', 
                  form.fields.some(f => f.type === 'text') ? 'text' : null,
                  form.fields.some(f => f.type.startsWith('2d')) ? 'geo' : null,
                  'collation'
                ].filter(Boolean).map(t => (
                  <button
                    key={t}
                    onClick={() => setActiveFormTab(t)}
                    className={`px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-t-lg transition-all ${activeFormTab === t ? 'bg-bg-secondary text-accent border-t border-x border-border/50' : 'text-text-tertiary hover:text-text-primary'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-auto p-6 custom-scrollbar min-h-[300px]">
                {activeFormTab === 'fields' && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-text-tertiary uppercase tracking-widest">Index Name</label>
                      <input 
                        type="text" 
                        placeholder="Leave empty for auto-generated name"
                        value={form.name}
                        onChange={e => setForm({...form, name: e.target.value})}
                        className="w-full bg-bg-primary/50 border border-border/60 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all text-text-primary"
                      />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-text-tertiary uppercase tracking-widest">Indexed Fields</label>
                       {form.fields.map((f, i) => (
                         <div key={i} className="flex gap-2 animate-in slide-in-from-left-2 duration-200">
                            <input 
                              type="text" 
                              placeholder="Field name"
                              value={f.name}
                              onChange={e => {
                                const nf = [...form.fields]; nf[i].name = e.target.value; setForm({...form, fields: nf})
                              }}
                              className="flex-1 bg-bg-primary/50 border border-border/60 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-accent transition-all text-text-primary"
                            />
                            <select 
                              value={f.type}
                              onChange={e => {
                                const nf = [...form.fields]; nf[i].type = e.target.value; setForm({...form, fields: nf})
                              }}
                              className="w-32 bg-bg-primary/50 border border-border/60 rounded-xl px-2 py-2 text-xs outline-none focus:border-accent transition-all text-text-primary appearance-none cursor-pointer"
                            >
                              {INDEX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <button 
                              onClick={() => removeField(i)}
                              disabled={form.fields.length === 1}
                              className="p-2.5 rounded-xl hover:bg-red-500/10 text-text-tertiary hover:text-red-400 disabled:opacity-0 transition-all"
                            >
                              <X size={16} />
                            </button>
                         </div>
                       ))}
                       <button onClick={addField} className="flex items-center gap-2 text-[11px] text-accent hover:text-accent-hover font-bold px-1 transition-colors">
                          <Plus size={14} /> Add indexed field
                       </button>
                    </div>
                  </div>
                )}

                {activeFormTab === 'options' && (
                  <>
                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-text-tertiary uppercase tracking-widest border-b border-border/10 pb-1">General Options</h4>
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <input type="checkbox" checked={form.unique} onChange={e => setForm({...form, unique: e.target.checked})} className="w-4 h-4 rounded border-border bg-bg-primary text-accent focus:ring-accent cursor-pointer" />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">Unique</span>
                            <span className="text-[10px] text-text-tertiary">Reject duplicate key entries</span>
                          </div>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <input type="checkbox" checked={form.sparse} onChange={e => setForm({...form, sparse: e.target.checked})} className="w-4 h-4 rounded border-border bg-bg-primary text-accent focus:ring-accent cursor-pointer" />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">Sparse</span>
                            <span className="text-[10px] text-text-tertiary">Only reference docs with the indexed field</span>
                          </div>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <input type="checkbox" checked={form.background} onChange={e => setForm({...form, background: e.target.checked})} className="w-4 h-4 rounded border-border bg-bg-primary text-accent focus:ring-accent cursor-pointer" />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">Create in Background</span>
                            <span className="text-[10px] text-text-tertiary">Don't block DB operations during build</span>
                          </div>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <input type="checkbox" checked={form.hidden} onChange={e => setForm({...form, hidden: e.target.checked})} className="w-4 h-4 rounded border-border bg-bg-primary text-accent focus:ring-accent cursor-pointer" />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">Hidden</span>
                            <span className="text-[10px] text-text-tertiary">Invisibile to query planner (MongoDB 4.4+)</span>
                          </div>
                        </label>
                      </div>
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-text-tertiary uppercase tracking-widest border-b border-border/10 pb-1">TTL Settings</h4>
                        <div className="space-y-1">
                          <label className="text-[10px] text-text-tertiary font-bold">Expire after seconds</label>
                          <input 
                            type="number" 
                            placeholder="e.g. 3600"
                            value={form.ttl}
                            onChange={e => setForm({...form, ttl: e.target.value})}
                            className="w-full bg-bg-primary/50 border border-border/60 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-accent transition-all text-text-primary"
                          />
                          <p className="text-[9px] text-text-tertiary italic">Only for Date fields. Docs will be auto-deleted.</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 space-y-4">
                      <h4 className="text-[10px] font-black text-text-tertiary uppercase tracking-widest border-b border-border/10 pb-1">Partial Filter Expression</h4>
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <input type="checkbox" checked={form.partial} onChange={e => setForm({...form, partial: e.target.checked})} className="w-4 h-4 rounded border-border bg-bg-primary text-accent focus:ring-accent cursor-pointer" />
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">Enable Partial Filter</span>
                          <span className="text-[10px] text-text-tertiary">Only index documents that meet the expression</span>
                        </div>
                      </label>

                      {form.partial && (
                        <div className="h-40 border border-border/60 rounded-xl overflow-hidden animate-in slide-in-from-top-2">
                          <Editor
                            height="100%"
                            language="json"
                            theme="vs-dark"
                            value={form.partialFilter}
                            onChange={val => setForm({...form, partialFilter: val})}
                            options={{ 
                              minimap: { enabled: false }, 
                              fontSize: 11,
                              lineNumbers: 'on',
                              folding: true,
                              bracketPairColorization: { enabled: true },
                              padding: { top: 10 }
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}

                {activeFormTab === 'text' && (
                  <div className="space-y-6 animate-in slide-in-from-top-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] text-text-tertiary font-bold uppercase">Default Language</label>
                        <select 
                          value={form.text.language} 
                          onChange={e => setForm({...form, text: {...form.text, language: e.target.value}})}
                          className="w-full bg-bg-primary/50 border border-border/60 rounded-lg px-2 py-2 text-xs text-text-primary appearance-none"
                        >
                          {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-text-tertiary font-bold uppercase">Language Override Field</label>
                        <input 
                          type="text" 
                          placeholder="e.g. language"
                          value={form.text.override} 
                          onChange={e => setForm({...form, text: {...form.text, override: e.target.value}})}
                          className="w-full bg-bg-primary/50 border border-border/60 rounded-lg px-3 py-2 text-xs text-text-primary" 
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeFormTab === 'geo' && (
                  <div className="space-y-6 animate-in slide-in-from-top-2">
                    {form.fields.some(f => f.type === '2dsphere') && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-text-tertiary font-bold uppercase">2dsphere Index Version</label>
                        <select 
                          value={form.geo.sphereVersion} 
                          onChange={e => setForm({...form, geo: {...form.geo, sphereVersion: e.target.value}})}
                          className="w-full bg-bg-primary/50 border border-border/60 rounded-lg px-2 py-2 text-xs text-text-primary appearance-none"
                        >
                          <option value="(default)">(default)</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                        </select>
                      </div>
                    )}
                    {form.fields.some(f => f.type === '2d') && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] text-text-tertiary font-bold uppercase">Min Bound</label>
                          <input type="number" value={form.geo.min} onChange={e => setForm({...form, geo: {...form.geo, min: e.target.value}})} className="w-full bg-bg-primary/50 border border-border/60 rounded-lg px-3 py-2 text-xs text-text-primary" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-text-tertiary font-bold uppercase">Max Bound</label>
                          <input type="number" value={form.geo.max} onChange={e => setForm({...form, geo: {...form.geo, max: e.target.value}})} className="w-full bg-bg-primary/50 border border-border/60 rounded-lg px-3 py-2 text-xs text-text-primary" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-text-tertiary font-bold uppercase">Bits (Precision)</label>
                          <input type="number" value={form.geo.precision} onChange={e => setForm({...form, geo: {...form.geo, precision: e.target.value}})} className="w-full bg-bg-primary/50 border border-border/60 rounded-lg px-3 py-2 text-xs text-text-primary" />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeFormTab === 'collation' && (
                  <div className="space-y-6">
                    <label className="flex items-center gap-3 cursor-pointer group p-3 bg-bg-primary/30 rounded-xl border border-border/20">
                      <input type="checkbox" checked={form.collation.enabled} onChange={e => setForm({...form, collation: {...form.collation, enabled: e.target.checked}})} className="w-4 h-4 rounded border-border bg-bg-primary text-accent focus:ring-accent cursor-pointer" />
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">Use Custom Collation</span>
                        <span className="text-[10px] text-text-tertiary">Control string comparison and sorting rules</span>
                      </div>
                    </label>

                    {form.collation.enabled && (
                      <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 max-h-[250px] overflow-auto pr-2 custom-scrollbar">
                        <div className="space-y-1">
                          <label className="text-[10px] text-text-tertiary font-bold uppercase">Locale</label>
                          <input type="text" value={form.collation.locale} onChange={e => setForm({...form, collation: {...form.collation, locale: e.target.value}})} className="w-full bg-bg-primary/50 border border-border/60 rounded-lg px-3 py-2 text-xs text-text-primary focus:border-accent transition-all outline-none" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-text-tertiary font-bold uppercase">Strength (1-5)</label>
                          <select value={form.collation.strength} onChange={e => setForm({...form, collation: {...form.collation, strength: e.target.value}})} className="w-full bg-bg-primary/50 border border-border/60 rounded-lg px-2 py-2 text-xs text-text-primary appearance-none cursor-pointer focus:border-accent outline-none">
                            <option value="">(default)</option>
                            <option value="1">1 (Primary)</option>
                            <option value="2">2 (Secondary)</option>
                            <option value="3">3 (Tertiary)</option>
                            <option value="4">4 (Quaternary)</option>
                            <option value="5">5 (Identical)</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-text-tertiary font-bold uppercase">Case Level</label>
                          <select value={form.collation.caseLevel} onChange={e => setForm({...form, collation: {...form.collation, caseLevel: e.target.value}})} className="w-full bg-bg-primary/50 border border-border/60 rounded-lg px-2 py-2 text-xs text-text-primary appearance-none cursor-pointer focus:border-accent outline-none">
                            <option value="">(default)</option>
                            <option value="true">On</option>
                            <option value="false">Off</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-text-tertiary font-bold uppercase">Case First</label>
                          <select value={form.collation.caseFirst} onChange={e => setForm({...form, collation: {...form.collation, caseFirst: e.target.value}})} className="w-full bg-bg-primary/50 border border-border/60 rounded-lg px-2 py-2 text-xs text-text-primary appearance-none cursor-pointer focus:border-accent outline-none">
                            <option value="">(default)</option>
                            <option value="upper">Upper First</option>
                            <option value="lower">Lower First</option>
                            <option value="off">Off</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-text-tertiary font-bold uppercase">Numeric Ordering</label>
                          <select value={form.collation.numericOrdering} onChange={e => setForm({...form, collation: {...form.collation, numericOrdering: e.target.value}})} className="w-full bg-bg-primary/50 border border-border/60 rounded-lg px-2 py-2 text-xs text-text-primary appearance-none cursor-pointer focus:border-accent outline-none">
                            <option value="">(default)</option>
                            <option value="true">On</option>
                            <option value="false">Off</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-text-tertiary font-bold uppercase">Alternate</label>
                          <select value={form.collation.alternate} onChange={e => setForm({...form, collation: {...form.collation, alternate: e.target.value}})} className="w-full bg-bg-primary/50 border border-border/60 rounded-lg px-2 py-2 text-xs text-text-primary appearance-none cursor-pointer focus:border-accent outline-none">
                            <option value="">(default)</option>
                            <option value="non-ignorable">Non-ignorable</option>
                            <option value="shifted">Shifted</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-text-tertiary font-bold uppercase">Backwards</label>
                          <select value={form.collation.backwards} onChange={e => setForm({...form, collation: {...form.collation, backwards: e.target.value}})} className="w-full bg-bg-primary/50 border border-border/60 rounded-lg px-2 py-2 text-xs text-text-primary appearance-none cursor-pointer focus:border-accent outline-none">
                            <option value="">(default)</option>
                            <option value="true">On</option>
                            <option value="false">Off</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-text-tertiary font-bold uppercase">Normalization</label>
                          <select value={form.collation.normalization} onChange={e => setForm({...form, collation: {...form.collation, normalization: e.target.value}})} className="w-full bg-bg-primary/50 border border-border/60 rounded-lg px-2 py-2 text-xs text-text-primary appearance-none cursor-pointer focus:border-accent outline-none">
                            <option value="">(default)</option>
                            <option value="true">On</option>
                            <option value="false">Off</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer / Actions */}
              <div className="px-6 py-4 border-t border-border/40 bg-bg-tertiary/30 flex justify-between items-center shrink-0">
                <button 
                  onClick={() => setShowJsonPreview(!showJsonPreview)}
                  className="flex items-center gap-2 text-xs text-text-tertiary hover:text-text-primary font-bold transition-colors"
                >
                  <Code size={16} /> {showJsonPreview ? 'Hide JSON' : 'Show JSON'}
                </button>
                <div className="flex gap-3">
                  <button onClick={() => setIsAdding(false)} className="px-5 py-2 text-xs font-bold text-text-tertiary hover:text-text-primary transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleCreate} disabled={loading} className="px-6 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95">
                    {loading ? 'Creating...' : 'Create Index'}
                  </button>
                </div>
              </div>

              {showJsonPreview && (
                <div className="h-48 border-t border-border/20 bg-[#1e1e1e]">
                  <Editor
                    height="100%"
                    language="json"
                    theme="vs-dark"
                    value={JSON.stringify(generatePayload(), null, 2)}
                    options={{ minimap: { enabled: false }, fontSize: 11, readOnly: true, lineNumbers: 'off', padding: { top: 10 } }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* MAIN INDEX LIST TABLE */}
        <div className="rounded-2xl border border-border bg-bg-secondary/40 overflow-hidden shadow-2xl backdrop-blur-md">
          <table className="w-full text-left border-collapse select-none">
            <thead>
              <tr className="bg-bg-tertiary/60 text-[10px] font-black text-text-tertiary uppercase tracking-[0.2em] border-b border-border">
                <th className="px-6 py-4 w-64">Name</th>
                <th className="px-6 py-4 w-32 text-center">Type</th>
                <th className="px-6 py-4">Indexed Fields</th>
                <th className="px-6 py-4 w-48">Properties</th>
                <th className="px-6 py-4 w-32 text-right">Size</th>
                <th className="px-6 py-4 w-48 text-right">Usage</th>
                <th className="px-6 py-4 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {indexes.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-32 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-30 grayscale saturate-0">
                      <Search size={64} strokeWidth={1} />
                      <div className="flex flex-col gap-1">
                        <span className="text-lg font-bold">No Indexes Found</span>
                        <span className="text-xs">Create an index to optimize your queries</span>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                indexes.map((idx, i) => {
                  const type = getIndexType(idx)
                  return (
                    <tr key={i} className="group border-b border-border/30 hover:bg-bg-tertiary/40 transition-all">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl border ${idx.name === '_id_' ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-secondary/10 border-secondary/20 text-secondary'}`}>
                            <Fingerprint size={16} />
                          </div>
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-xs font-black text-text-primary truncate" title={idx.name}>{idx.name}</span>
                            <span className="text-[9px] text-text-tertiary uppercase font-bold">v{idx.v} index</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${
                          type === 'Regular' ? 'bg-blue-500/10 text-blue-400' : 
                          type === 'Hashed' ? 'bg-orange-500/10 text-orange-400' : 
                          'bg-purple-500/10 text-purple-400'
                        }`}>
                          {type}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(idx.key).map(([k, v], ki) => (
                            <div key={ki} className="flex items-center gap-2 bg-bg-tertiary/60 px-2.5 py-1.5 rounded-lg border border-border/50 group-hover:border-accent/30 transition-colors shadow-sm">
                              <span className="text-[10px] text-text-secondary font-mono font-bold">{k}</span>
                              <div className={`px-1 rounded text-[9px] font-black ${v === 1 ? 'text-green-400 bg-green-400/10' : v === -1 ? 'text-orange-400 bg-orange-400/10' : 'text-accent bg-accent/10'}`}>
                                {v === 1 ? 'ASC' : v === -1 ? 'DESC' : v.toString().toUpperCase()}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-wrap gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                          {getProperties(idx).split(', ').map((p, pi) => (
                            p !== 'None' ? (
                              <span key={pi} className="px-1.5 py-0.5 rounded-[4px] bg-bg-tertiary text-[9px] font-bold text-text-secondary border border-border/40">
                                {p}
                              </span>
                            ) : <span key={pi} className="text-[10px] text-text-tertiary italic">None</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <span className="text-xs font-mono font-bold text-text-primary">{formatSize(idx.size)}</span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-2 text-xs font-bold text-text-primary">
                             <Activity size={12} className="text-accent" />
                             {idx.usageCount.toLocaleString()} <span className="text-[10px] text-text-tertiary font-medium">Ops</span>
                          </div>
                          {idx.since && (
                            <span className="text-[9px] text-text-tertiary font-medium">
                              Since {new Date(idx.since).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center">
                        {idx.name !== '_id_' ? (
                          <button 
                            onClick={() => handleDrop(idx.name)}
                            className="p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-text-tertiary hover:text-red-400 transition-all active:scale-95"
                            title="Drop Index"
                          >
                            <Trash2 size={16} />
                          </button>
                        ) : (
                          <div className="p-2 opacity-20" title="Primary Index cannot be dropped">
                            <Trash2 size={16} />
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
          <div className="px-6 py-4 bg-bg-tertiary/30 border-t border-border flex justify-between items-center select-none shrink-0">
             <div className="flex items-center gap-6 text-[10px] font-bold text-text-tertiary uppercase tracking-widest">
                <div className="flex items-center gap-2">
                  <Fingerprint size={12} /> {indexes.length} Total Indexes
                </div>
                <div className="flex items-center gap-2">
                  <Database size={12} /> {formatSize(indexes.reduce((acc, i) => acc + i.size, 0))} Total Size
                </div>
             </div>
             <p className="text-[9px] text-text-tertiary italic">Stats are cumulative since server startup.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
