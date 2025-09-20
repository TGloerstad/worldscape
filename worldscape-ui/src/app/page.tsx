"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from 'next/dynamic'
import 'leaflet/dist/leaflet.css'

type OutputFile = { path: string; isdir: boolean; size: number | null; mtime: string }

enum Tab { Run = 'Run', Outputs = 'Outputs', WorldMapping = 'WorldMapping', Interactive = 'Interactive' }

function first<T>(v: any, fallback: T): T {
  if (Array.isArray(v)) return (v[0] ?? fallback) as T
  return (v ?? fallback) as T
}

function groupByTop(files: any[]): Record<string, OutputFile[]> {
  const groups: Record<string, OutputFile[]> = {}
  if (!Array.isArray(files)) return groups
  for (const f of files) {
    const pathStr = typeof f === 'string'
      ? f
      : (typeof f?.path === 'string' ? f.path : first<string>(f?.path, ''))
    if (!pathStr) continue
    const top = (pathStr.split('/')[0] as string) || ''
    if (!groups[top]) groups[top] = []
    groups[top].push({
      path: pathStr,
      isdir: Boolean(first<boolean>(f?.isdir, false)),
      size: typeof first<number | null>(f?.size, null) === 'number' ? first<number>(f?.size, 0) : null,
      mtime: String(first<string>(f?.mtime, ''))
    })
  }
  return groups
}

function isTiff(path: string) {
  return path.toLowerCase().endsWith('.tif') || path.toLowerCase().endsWith('.tiff')
}

function isPng(path: string) {
  return path.toLowerCase().endsWith('.png')
}

// Minimal IsoscapeBuild UI pieces
type IsoFile = { path: string; isdir: boolean; size: number | null; mtime: string }

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>(Tab.Run)
  const [lightboxPath, setLightboxPath] = useState<string | null>(null)
  const [zoom, setZoom] = useState<number>(1)
  const [loaded, setLoaded] = useState<boolean>(false)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [isoCrop, setIsoCrop] = useState<string>('COTT')
  const [isoFiles, setIsoFiles] = useState<IsoFile[]>([])
  const [isoParams, setIsoParams] = useState<any>(null)
  const [isoBusy, setIsoBusy] = useState<boolean>(false)
  const [isoMeta, setIsoMeta] = useState<any | null>(null)
  const [isoSelected, setIsoSelected] = useState<Record<string, boolean>>({})
  const [isoTimeout, setIsoTimeout] = useState<number>(1800)
  const [isoStatus, setIsoStatus] = useState<any | null>(null)
  const [isoLog, setIsoLog] = useState<string[]>([])
  const [showCompare, setShowCompare] = useState<boolean>(false)
  const [stretchMin, setStretchMin] = useState<number>(-20)
  const [stretchMax, setStretchMax] = useState<number>(-10)
  const [tintHex, setTintHex] = useState<string>("ffff00")
  const [outlineHex, setOutlineHex] = useState<string>("888888")
  const tintParam = useMemo(() => tintHex ? `&tint=${encodeURIComponent(tintHex)}` : '', [tintHex])
  const overlayParams = useMemo(() => `&overlay=countries&overlayOpacity=0.4&outlineColor=${encodeURIComponent(outlineHex)}&cb=${Date.now()}`, [outlineHex])

  const groups = useMemo(() => groupByTop(files), [files])

  useEffect(() => {
    refreshOutputs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!lightboxPath) return
      if (e.key === 'Escape') setLightboxPath(null)
      if (e.key === '+' || e.key === '=') setZoom(z => Math.min(4, +(z + 0.2).toFixed(2)))
      if (e.key === '-' || e.key === '_') setZoom(z => Math.max(0.5, +(z - 0.2).toFixed(2)))
      if (e.key === '0') setZoom(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxPath])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setTab(Tab.Run)
    setRunning(true);
    try {
      if (file) {
        // Upload file first
        console.log('Uploading file:', file.name, file.size);
        const fd = new FormData();
        fd.append("file", file);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
        const uploadData = await uploadRes.json();
        console.log('Upload response:', uploadData);
        if (!uploadRes.ok) throw new Error(uploadData?.error || "Upload failed");
      }
      
      // Then run mapping (send empty formdata to satisfy multipart check)
      console.log('Starting mapping run...');
      const emptyForm = new FormData();
      const res = await fetch("/api/run", { method: "POST", body: emptyForm });
      const data = await res.json();
      console.log('Run response:', data);
      if (!res.ok) throw new Error(data?.error || "R API error");
      setResult(data);
    } catch (err: any) {
      console.error('Error:', err);
      setError(err?.message || "Unknown error");
    } finally {
      setRunning(false);
    }
  };

  async function refreshOutputs() {
    try {
      setError(null)
      setTab(Tab.Outputs)
      const res = await fetch("/api/outputs", { cache: 'no-store' });
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        throw new Error(msg || `Failed to fetch outputs (HTTP ${res.status})`)
      }
      const data = await res.json()
      setFiles(Array.isArray(data?.files) ? data.files : [])
    } catch (e: any) {
      setFiles([])
      setError(e?.message || 'Failed to fetch outputs')
    } finally {
      setLoaded(true)
    }
  }

  const clearOutputs = async () => {
    try {
      setError(null)
      const res = await fetch("/api/outputs", { method: "DELETE" });
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        throw new Error(msg || `Failed to clear outputs (HTTP ${res.status})`)
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to clear outputs')
    } finally {
      await refreshOutputs();
      setSelectedFolder(null)
    }
  }

  const openLightbox = (p: string) => { setLightboxPath(p); setZoom(1) }

  // helper to group second-level within selected folder
  const secondLevel = useMemo(() => {
    if (!selectedFolder) return {}
    const items = groups[selectedFolder] || []
    const by: Record<string, OutputFile[]> = {}
    for (const f of items) {
      const parts = f.path.split('/')
      const sec = parts[1] || '(root)'
      if (!by[sec]) by[sec] = []
      by[sec].push(f)
    }
    return by
  }, [groups, selectedFolder])

  async function isoRefresh() {
    const res = await fetch('/api/isoscape/files', { cache: 'no-store' })
    const data = await res.json()
    if (res.ok) {
      setIsoFiles(Array.isArray(data.files) ? data.files : [])
      setIsoParams(data.model_params || null)
    }
  }

  async function isoLoadMeta() {
    const res = await fetch('/api/isoscape', { cache: 'no-store' })
    const data = await res.json()
    if (res.ok) {
      setIsoMeta(data)
      const sel: Record<string, boolean> = {}
      for (const s of (data.sources || [])) sel[s.id] = false
      setIsoSelected(sel)
    }
  }

  async function isoFetch() {
    setIsoBusy(true)
    try {
      const selected = Object.entries(isoSelected).filter(([,v]) => v).map(([k]) => k)
      const res = await fetch('/api/isoscape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fetch', crop: isoCrop, sources: selected, timeout: isoTimeout }) })
      await res.json()
      await pollStatus(30)
      await isoRefresh()
    } finally { setIsoBusy(false) }
  }

  async function isoModel() {
    setIsoBusy(true)
    try {
      const res = await fetch('/api/isoscape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'model', crop: isoCrop }) })
      const data = await res.json()
      if (res.ok) setIsoParams(data.model_params || null)
      await isoRefresh()
    } finally { setIsoBusy(false) }
  }

  useEffect(() => { isoRefresh() }, [])
  useEffect(() => { isoLoadMeta() }, [])

  async function pollStatus(seconds: number) {
    const end = Date.now() + seconds * 1000
    while (Date.now() < end) {
      const res = await fetch('/api/isoscape/status', { cache: 'no-store' }).catch(() => null as any)
      if (res && res.ok) {
        const data = await res.json()
        setIsoStatus(data?.status || null)
        setIsoLog(Array.isArray(data?.log_tail) ? data.log_tail : [])
      }
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 1920 }}>
      <h1>WorldScape Mapper (Local)</h1>

      <div style={{ display: "flex", gap: 12, margin: "12px 0" }}>
        <button onClick={() => setTab(Tab.Run)}>Run</button>
        <button onClick={refreshOutputs}>Outputs</button>
        <button onClick={() => setTab(Tab.WorldMapping)}>WorldMapping</button>
        <button onClick={() => setTab(Tab.Interactive)}>Interactive</button>
        <button onClick={clearOutputs} style={{ marginLeft: 'auto' }}>Clear outputs</button>
      </div>

      {tab===Tab.Run && (
        <>
          <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
            <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button type="submit" disabled={running}>{running ? "Running..." : "Run mapping"}</button>
          </form>
          <InlineTableRunner />
          {error && <p style={{ color: "crimson" }}>{error}</p>}
          {result && (
            <div style={{ marginTop: 16 }}>
              <h3>Run result</h3>
              <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
        </>
      )}

      {tab===Tab.Outputs && (
        <div style={{ marginTop: 16 }}>
          <h3>Output files</h3>
          {error && <p style={{ color: "crimson" }}>{error}</p>}
          {loaded && Object.keys(groups).length === 0 && !error && <p>No outputs yet.</p>}

          {!selectedFolder && (
            <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
              {Object.entries(groups).map(([folder, items]) => (
                <li key={folder} style={{ marginBottom: 10 }}>
                  <button onClick={() => setSelectedFolder(folder)}>
                    {folder} ({items.filter(i => !i.isdir).length})
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selectedFolder && (
            <div>
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => setSelectedFolder(null)}>Back</button>
                <h4 style={{ margin: 0 }}>{selectedFolder}</h4>
              </div>
              {Object.entries(secondLevel).map(([sec, items]) => (
                <details key={sec} style={{ marginBottom: 10 }}>
                  <summary style={{ fontWeight: 600 }}>{sec}</summary>
                  <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
                    {items.filter(f => !f.isdir).map(f => (
                      <li key={f.path} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isPng(f.path) ? (
                          <img
                            onClick={() => openLightbox(f.path)}
                            src={`/api/file?path=${encodeURIComponent(f.path)}`}
                            alt={f.path}
                            width={220}
                            height={118}
                            style={{ objectFit: 'contain', background: '#111', border: '1px solid #222', cursor: 'zoom-in', imageRendering: 'auto' as any }}
                          />
                        ) : isTiff(f.path) ? (
                          <img
                            onClick={() => openLightbox(f.path)}
                            src={`/api/preview?path=${encodeURIComponent(f.path)}&w=220&format=webp`}
                            alt={f.path}
                            width={220}
                            height={118}
                            style={{ objectFit: 'contain', background: '#111', border: '1px solid #222', cursor: 'zoom-in' }}
                          />
                        ) : null}
                        <a href={`/api/file?path=${encodeURIComponent(f.path)}`} target="_blank" rel="noreferrer">
                          {f.path.split('/').slice(2).join('/')}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      {tab===Tab.WorldMapping && (
        <WorldMappingRunner />
      )}

      {tab===Tab.Interactive && (
        <InteractiveMap files={files} />
      )}

      {tab!==Tab.Interactive && (
        <>
          <hr style={{ margin: '24px 0' }} />
          <h2>IsoscapeBuild</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <label>Crop:&nbsp;</label>
            <select value={isoCrop} onChange={e => setIsoCrop(e.target.value)}>
              <option value="COTT">COTT (cotton)</option>
              <option value="MAIZ">MAIZ (maize)</option>
              <option value="RICE">RICE</option>
              <option value="WHEA">WHEA (wheat)</option>
              <option value="SOYB">SOYB (soybean)</option>
            </select>
            <button onClick={isoFetch} disabled={isoBusy}>{isoBusy ? 'Running…' : 'Fetch inputs'}</button>
            <button onClick={isoModel} disabled={isoBusy}>{isoBusy ? 'Running…' : 'Build model'}</button>
            <button onClick={() => { isoRefresh(); isoLoadMeta(); }}>Refresh</button>
            <button onClick={() => setShowCompare(v => !v)} style={{ marginLeft: 'auto' }}>{showCompare ? 'Hide compare' : 'Compare legacy vs new'}</button>
          </div>
          <SourceSelector meta={isoMeta} selected={isoSelected} setSelected={setIsoSelected} timeout={isoTimeout} setTimeout={setIsoTimeout} status={isoStatus} log={isoLog} />
          {isoParams && (
            <pre style={{ background: '#111', color: '#ddd', padding: 8, whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto', border: '1px solid #333' }}>{JSON.stringify(isoParams, null, 2)}</pre>
          )}
          {showCompare && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div>
                <h4 style={{ margin: '4px 0' }}>Legacy: Model1.tif</h4>
                <img
                  src={`/api/legacy?path=${encodeURIComponent('Model1.tif')}&w=700&format=webp${tintParam}`}
                  alt="Legacy Model1.tif"
                  style={{ width: '100%', height: 'auto', background: '#111', border: '1px solid #222', cursor: 'zoom-in' }}
                  onClick={() => setLightboxPath('LEGACY::Model1.tif')}
                />
              </div>
              <div>
                <h4 style={{ margin: '4px 0' }}>New: cellulose_mu.tif</h4>
                <img
                  src={`/api/isopreview?scope=data_proc&path=${encodeURIComponent('cellulose_mu.tif')}&w=700&format=webp&min=${stretchMin}&max=${stretchMax}${tintParam}${overlayParams}`}
                  alt="New cellulose_mu.tif"
                  style={{ width: '100%', height: 'auto', background: '#111', border: '1px solid #222', cursor: 'zoom-in' }}
                  onClick={() => setLightboxPath('NEW::cellulose_mu.tif')}
                />
              </div>
              <div style={{ gridColumn: '1 / span 2', display: 'flex', gap: 12, alignItems: 'center' }}>
                <label>Min&nbsp;<input type="number" step="0.5" value={stretchMin} onChange={e => setStretchMin(parseFloat(e.target.value))} style={{ width: 80 }} /></label>
                <label>Max&nbsp;<input type="number" step="0.5" value={stretchMax} onChange={e => setStretchMax(parseFloat(e.target.value))} style={{ width: 80 }} /></label>
                <label>Tint&nbsp;<input type="color" value={`#${tintHex}`} onChange={e => setTintHex(e.target.value.replace('#',''))} /></label>
                <label>Outline&nbsp;<input type="color" value={`#${outlineHex}`} onChange={e => setOutlineHex(e.target.value.replace('#',''))} /></label>
              </div>
            </div>
          )}
          <div>
            <h4>Processed files</h4>
            <ul>
              {isoFiles.filter(f => !f.isdir).map(f => (
                <li key={f.path}>{f.path}</li>
              ))}
            </ul>
          </div>
        </>
      )}

      {lightboxPath && (
        <div
          onClick={() => setLightboxPath(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', maxWidth: '95vw', maxHeight: '95vh' }}>
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 8 }}>
              <button onClick={() => setLightboxPath(null)}>Close (Esc)</button>
              <button onClick={() => setZoom(z => Math.max(0.5, +(z - 0.2).toFixed(2)))}>-</button>
              <button onClick={() => setZoom(1)}>100%</button>
              <button onClick={() => setZoom(z => Math.min(4, +(z + 0.2).toFixed(2)))}>+</button>
            </div>
            {lightboxPath.startsWith('LEGACY::') ? (
              <img
                src={`/api/legacy?path=${encodeURIComponent(lightboxPath.replace('LEGACY::',''))}&w=${Math.round(1200*zoom)}&format=webp`}
                alt={lightboxPath}
                style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', border: '1px solid #333', background: '#111', display: 'block' }}
              />
            ) : lightboxPath.startsWith('NEW::') ? (
              <img
                src={`/api/isopreview?scope=data_proc&path=${encodeURIComponent(lightboxPath.replace('NEW::',''))}&w=${Math.round(1200*zoom)}&format=webp&min=${stretchMin}&max=${stretchMax}${tintParam}${overlayParams}`}
                alt={lightboxPath}
                style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', border: '1px solid #333', background: '#111', display: 'block' }}
              />
            ) : (
              <img
                src={`/api/preview?path=${encodeURIComponent(lightboxPath)}&w=${Math.round(1200*zoom)}&format=webp`}
                alt={lightboxPath}
                style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', border: '1px solid #333', background: '#111', display: 'block' }}
              />
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function InlineTableRunner() {
  const [rows, setRows] = useState<Array<{ samples: string; d18O: string }>>(
    Array.from({ length: 5 }, () => ({ samples: '', d18O: '' }))
  )
  const [busy, setBusy] = useState(false)
  const canRun = rows.some(r => r.samples.trim() && r.d18O.trim())

  const update = (i: number, key: 'samples'|'d18O', value: string) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: value } : r))
  }

  const run = async () => {
    setBusy(true)
    try {
      const table = rows.filter(r => r.samples.trim() && r.d18O.trim()).map(r => ({ samples: r.samples.trim(), d18O: parseFloat(r.d18O) }))
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table })
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data?.error || 'Run failed')
        return
      }
      alert('Run started using inline table. Switch to Outputs to view results.')
    } finally { setBusy(false) }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h3>Inline samples (max 5)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '200px 120px', gap: 8, alignItems: 'center' }}>
        <div style={{ fontWeight: 600 }}>Sample name</div>
        <div style={{ fontWeight: 600 }}>d18O</div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'contents' }}>
            <input value={r.samples} onChange={e => update(i, 'samples', e.target.value)} placeholder={`FT25${i+151}X`} />
            <input value={r.d18O} onChange={e => update(i, 'd18O', e.target.value)} placeholder="35.0" />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <button onClick={run} disabled={!canRun || busy}>{busy ? 'Running…' : 'Run with table'}</button>
      </div>
    </div>
  )
}

function WorldMappingRunner() {
  const [rows, setRows] = useState<Array<{ samples: string; d18O: string }>>(
    Array.from({ length: 5 }, () => ({ samples: '', d18O: '' }))
  )
  const [busy, setBusy] = useState(false)
  const [sigma, setSigma] = useState<number>(0.3)
  const [prior, setPrior] = useState<'both'|'weighted'|'unweighted'>('both')

  const canRun = rows.some(r => r.samples.trim() && r.d18O.trim())
  const update = (i: number, key: 'samples'|'d18O', value: string) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: value } : r))
  }
  const run = async () => {
    setBusy(true)
    try {
      const table = rows
        .filter(r => r.samples.trim() && r.d18O.trim())
        .map(r => ({ samples: r.samples.trim(), d18O: parseFloat(r.d18O) }))
      const res = await fetch('/api/worldmapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, sigma_meas: sigma, prior })
      })
      const data = await res.json()
      if (!res.ok) { alert(data?.error || 'Run failed'); return }
      alert('WorldMapping run completed. Check Outputs to view results.')
    } finally { setBusy(false) }
  }

  return (
    <div style={{ marginTop: 8, border: '1px solid #333', padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>WorldMapping assignment</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '200px 120px', gap: 8, alignItems: 'center' }}>
        <div style={{ fontWeight: 600 }}>Sample name</div>
        <div style={{ fontWeight: 600 }}>d18O</div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'contents' }}>
            <input value={r.samples} onChange={e => update(i, 'samples', e.target.value)} placeholder={`FT25${i+151}X`} />
            <input value={r.d18O} onChange={e => update(i, 'd18O', e.target.value)} placeholder="35.0" />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
        <label>σ_meas&nbsp;<input type="number" step="0.05" value={sigma} onChange={e => setSigma(parseFloat(e.target.value))} style={{ width: 90 }} /></label>
        <label>Prior&nbsp;
          <select value={prior} onChange={e => setPrior(e.target.value as any)}>
            <option value="both">both (write weighted + unweighted)</option>
            <option value="weighted">weighted</option>
            <option value="unweighted">unweighted</option>
          </select>
        </label>
        <button onClick={run} disabled={!canRun || busy}>{busy ? 'Running…' : 'Run WorldMapping'}</button>
      </div>
      <div style={{ marginTop: 6, opacity: 0.85 }}>
        Replicates are combined when the samples name matches (case-insensitive); σ_meas added in quadrature.
      </div>
    </div>
  )
}

const InteractiveMap = dynamic(() => import('./widgets/InteractiveMap').then(m => m.InteractiveMap), { ssr: false })

function SourceSelector({ meta, selected, setSelected, timeout, setTimeout, status, log }: { meta: any | null, selected: Record<string, boolean>, setSelected: (s: Record<string, boolean>) => void, timeout: number, setTimeout: (n: number) => void, status: any | null, log: string[] }) {
  if (!meta) return null
  const toggle = (id: string) => setSelected({ ...selected, [id]: !selected[id] })
  const lastFetchedById: Record<string, any> = (meta.summary?.sources || {}) as any
  return (
    <div style={{ marginTop: 8, marginBottom: 12, border: '1px solid #333', padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>Sources</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {(meta.sources || []).map((s: any) => (
          <div key={s.id} style={{ border: '1px solid #444', padding: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={!!selected[s.id]} onChange={() => toggle(s.id)} />
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              <div style={{ opacity: 0.8 }}>({s.id})</div>
            </div>
            {lastFetchedById[s.id] && (
              <div style={{ marginTop: 2, fontSize: 12, opacity: 0.85 }}>
                Version: {lastFetchedById[s.id].version || 'n/a'} | Last fetched: {lastFetchedById[s.id].last_fetched || 'n/a'}
              </div>
            )}
            <div style={{ marginTop: 4, opacity: 0.9 }}>{s.description}</div>
            {Array.isArray(s.parts) && s.parts.length > 0 && (
              <ul style={{ margin: '6px 0 0 16px' }}>
                {s.parts.map((p: any) => (
                  <li key={p.id}>
                    <span style={{ fontWeight: 600 }}>{p.name}</span> — {p.purpose}
                    {p.meta && (
                      <span style={{ marginLeft: 8, opacity: 0.85 }}>
                        [{p.meta.present ? 'present' : 'missing'}, files: {p.meta.file_count ?? 0}, size: {formatBytes(p.meta.size_bytes ?? 0)}, updated: {p.meta.last_updated || 'n/a'}]
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {s.meta && (
              <div style={{ marginTop: 4, opacity: 0.85 }}>
                [{s.meta.present ? 'present' : 'missing'}, size: {formatBytes(s.meta.size_bytes ?? 0)}, updated: {s.meta.last_updated || 'n/a'}]
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <label>Timeout (s): <input type="number" value={timeout} onChange={e => setTimeout(parseInt(e.target.value || '0') || 0)} style={{ width: 100 }} /></label>
        {status && (
          <div style={{ marginLeft: 'auto', opacity: 0.9 }}>
            Running: {String(status?.running)} | Step: {status?.current?.source || '-'}:{status?.current?.step || '-'}
          </div>
        )}
      </div>
      {Array.isArray(log) && log.length > 0 && (
        <pre style={{ marginTop: 8, background: '#111', color: '#ddd', maxHeight: 160, overflow: 'auto', padding: 8, border: '1px solid #333' }}>
          {log.join('\n')}
        </pre>
      )}
    </div>
  )
}

function formatBytes(n: number) {
  if (!n || n <= 0) return '0 B'
  const units = ['B','KB','MB','GB','TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}
