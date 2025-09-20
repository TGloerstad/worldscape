"use client";
import { useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson'
import 'mapbox-gl/dist/mapbox-gl.css'

type OutputFile = { path: string; isdir: boolean; size: number | null; mtime: string }

export function InteractiveMap({ files }: { files: OutputFile[] }) {
  const [points, setPoints] = useState<Array<{ id?: string; lat: number; lon: number; d18O?: number }>>([])
  const [mass, setMass] = useState(0.95)
  const [prior, setPrior] = useState<'weighted'|'unweighted'>('weighted')
  const [sample, setSample] = useState<string>('')
  const [muMin, setMuMin] = useState(20)
  const [muMax, setMuMax] = useState(38)
  const [useExactPng, setUseExactPng] = useState(false)
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapboxRef = useRef<mapboxgl.Map | null>(null)

  useEffect(() => {
    fetch('/api/calibration').then(r => r.json()).then(d => {
      if (d?.points) setPoints(d.points)
    }).catch(() => {})
  }, [])

  const samples = useMemo(() => {
    const set = new Set<string>()
    for (const f of files) {
      // Handle path as string or array (API returns arrays)
      const pathStr = Array.isArray(f.path) ? f.path[0] : f.path
      if (typeof pathStr === 'string' && pathStr.includes('posterior.tiff')) {
        const m = /^([^/]+)\//.exec(pathStr)
        if (m && m[1]) set.add(m[1])
      }
    }
    return Array.from(set).sort()
  }, [files])

  const [hpdOverlay, setHpdOverlay] = useState<{ type: 'mapbox'; sample: string; prior: 'weighted'|'unweighted'; mass: number } | null>(null)

  useEffect(() => {
    if (!sample) { setHpdOverlay(null); return }
    // Mapbox plan: fetch GeoJSON from R and add as Mapbox source in a separate component
    setHpdOverlay({ type: 'mapbox', sample, prior, mass })
  }, [sample, prior, mass])

  const muUrl = useMemo(() => (
    `/api/isoscape/colorized?min=${muMin}&max=${muMax}`
  ), [muMin, muMax])

  // PNG (static) URL for current selection
  const pngUrl = useMemo(() => {
    if (!sample) return ''
    const priorDir = prior === 'unweighted' ? 'Unweighted' : 'Weighted'
    const suffix = mass >= 0.5 ? 'world95' : 'world10'
    const relPath = `${sample}/${sample}, ${priorDir}/${sample} ${suffix}.png`
    return `/api/file?path=${encodeURIComponent(relPath)}`
  }, [sample, prior, mass])

  // init mapbox
  useEffect(() => {
    if (mapboxRef.current || !mapRef.current) return
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: 'mapbox://styles/mapbox/light-v10',  // v10 is 2D, v11 has 3D terrain
      center: [10, 20],
      zoom: 1.7,
      pitch: 0,        // Disable 3D tilt
      bearing: 0,      // No rotation
      renderWorldCopies: false,  // Single world view
      interactive: true,
      pitchWithRotate: false,  // Prevent pitch changes
      dragRotate: false        // Prevent rotation
    })
    map.addControl(new mapboxgl.NavigationControl())
    mapboxRef.current = map
    return () => { map.remove(); mapboxRef.current = null }
  }, [])

  // update layers based on current view (Vector or PNG) - wait for map to be ready
  useEffect(() => {
    const map = mapboxRef.current
    if (!map) return
    
    const updateLayers = async () => {
      // Wait for map to be loaded
      if (!map.loaded()) {
        map.once('load', updateLayers)
        return
      }

      try {
        // In PNG view we do not render anything on Mapbox; hide layers and exit
        if (useExactPng) {
          try {
            if (map.getLayer('hpd-fill')) map.removeLayer('hpd-fill')
            if (map.getLayer('hpd-line')) map.removeLayer('hpd-line')
            if (map.getSource('hpd-src')) map.removeSource('hpd-src')
            const ids = map.getStyle()?.layers?.map(l => l.id) || []
            for (const id of ids) if (id.startsWith('exact-raster-')) try { map.removeLayer(id) } catch {}
            const srcs = Object.keys((map as any).style.sourceCaches || {})
            for (const id of srcs) if (id.startsWith('exact-image-')) try { map.removeSource(id) } catch {}
          } catch {}
          return
        }

        // Vector (HPD GeoJSON) view
        if (sample) {
          // Always clean up both modes first
          try {
            if (map.getLayer('hpd-fill')) map.removeLayer('hpd-fill')
            if (map.getLayer('hpd-line')) map.removeLayer('hpd-line')
            if (map.getSource('hpd-src')) map.removeSource('hpd-src')
          } catch {}
          // Vector HPD with performance-friendly defaults (fact, buffer)
            const fact = 2
            const bufferDeg = 0
            const hpdUrl = `/api/worldmapping?path=${encodeURIComponent(`/worldmapping/hpd_geojson?sample=${encodeURIComponent(sample)}&prior=${encodeURIComponent(prior)}&mass=${encodeURIComponent(String(mass))}&fact=${fact}&buffer_deg=${bufferDeg}`)}`
            const hpdRes = await fetch(hpdUrl, { cache: 'no-store' })
            if (hpdRes.ok) {
              const raw = await hpdRes.json()
              const gj: FeatureCollection<Geometry, GeoJsonProperties> = Array.isArray(raw?.type) && raw?.type[0] === 'FeatureCollection' ? { ...raw, type: 'FeatureCollection' } : raw
              if (gj && gj.type === 'FeatureCollection') {
                const existing = map.getSource('hpd-src') as any
                if (existing && typeof existing.setData === 'function') {
                  existing.setData(gj as any)
                } else if (!existing) {
                  map.addSource('hpd-src', { type: 'geojson', data: gj })
                }
                if (!map.getLayer('hpd-fill')) {
                  map.addLayer({ id: 'hpd-fill', type: 'fill', source: 'hpd-src', paint: { 'fill-color': '#50b691', 'fill-opacity': 0.5 } })
                }
                if (!map.getLayer('hpd-line')) {
                  map.addLayer({ id: 'hpd-line', type: 'line', source: 'hpd-src', paint: { 'line-color': '#666', 'line-width': 1 } })
                }
                try {
                  const bounds = new mapboxgl.LngLatBounds()
                  for (const feature of gj.features) {
                    if (feature.geometry.type === 'Polygon') {
                      const coords = feature.geometry.coordinates as unknown as [number, number][][]
                      for (const ring of coords) for (const coord of ring) bounds.extend(coord as mapboxgl.LngLatLike)
                    } else if (feature.geometry.type === 'MultiPolygon') {
                      const coords = feature.geometry.coordinates as unknown as [number, number][][][]
                      for (const poly of coords) for (const ring of poly) for (const coord of ring) bounds.extend(coord as mapboxgl.LngLatLike)
                    }
                  }
                  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 50, maxZoom: 6 })
                } catch {}
              }
            } else {
              console.error('HPD fetch failed:', hpdRes.status, await hpdRes.text())
            }
        }

        // Calibration points
        const calRes = await fetch('/api/calibration', { cache: 'no-store' })
        if (calRes.ok) {
              const cal = await calRes.json()
          if (cal?.points?.length) {
            const gj: FeatureCollection = { 
              type: 'FeatureCollection', 
              features: cal.points.map((p: any) => ({ 
                type: 'Feature', 
                geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, 
                properties: { id: p.id, d18O: p.d18O } 
              })) as any
            }
            
            if (map.getLayer('cal-circle')) map.removeLayer('cal-circle')
            if (map.getSource('cal-src')) map.removeSource('cal-src')
            
            map.addSource('cal-src', { type: 'geojson', data: gj as any })
            map.addLayer({ 
              id: 'cal-circle', 
              type: 'circle', 
              source: 'cal-src', 
              paint: { 
                'circle-radius': 6, 
                'circle-color': '#333', 
                'circle-stroke-color': '#fff', 
                'circle-stroke-width': 2 
              } 
            })
          }
        }
      } catch (e) {
        console.error('Error updating map layers:', e)
      }
    }

    updateLayers()
  }, [sample, prior, mass, useExactPng])

  return (
    <div style={{ border: '1px solid #333', padding: 8 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        <label>Sample&nbsp;
          <select value={sample} onChange={e => setSample(e.target.value)}>
            <option value="">(select)</option>
            {samples.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Prior&nbsp;
          <select value={prior} onChange={e => setPrior(e.target.value as any)}>
            <option value="weighted">weighted</option>
            <option value="unweighted">unweighted</option>
          </select>
        </label>
        <label>Probability&nbsp;
          <select value={String(Math.round(mass*100))} onChange={e => {
            const pct = parseInt(e.target.value, 10)
            const m = Math.max(1, Math.min(99, pct)) / 100
            setMass(m)
          }}>
            <option value="10">10%</option>
            <option value="95">95%</option>
          </select>
        </label>
        <label>μ min&nbsp;<input type="number" step={0.5} value={muMin} onChange={e => setMuMin(parseFloat(e.target.value))} style={{ width: 80 }} /></label>
        <label>μ max&nbsp;<input type="number" step={0.5} value={muMax} onChange={e => setMuMax(parseFloat(e.target.value))} style={{ width: 80 }} /></label>
        <label><input type="checkbox" checked={useExactPng} onChange={e => setUseExactPng(e.target.checked)} /> PNG view</label>
      </div>
      {/* Map view (hidden when PNG view is on) */}
      <div ref={mapRef} style={{ height: 900, width: '100%', border: '1px solid #222', display: useExactPng ? 'none' : 'block' }} />
      {/* PNG view: render static image with native aspect ratio */}
      {useExactPng && pngUrl && (
        <div style={{ width: '100%', border: '1px solid #222' }}>
          <img src={pngUrl} alt={`${sample} ${Math.round(mass*100)}%`} style={{ display: 'block', width: '100%', height: 'auto' }} />
        </div>
      )}
    </div>
  )
}


