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
  const [useExactPng, setUseExactPng] = useState(false)
  const [showCalibration, setShowCalibration] = useState(false)
  const [regionLevel, setRegionLevel] = useState<'adm0'|'adm1'>('adm0')
  const [showChoropleth, setShowChoropleth] = useState(false)
  const [choroplethRestrictHPD, setChoroplethRestrictHPD] = useState(false)
  const [showIsobands, setShowIsobands] = useState(false)
  const [crop, setCrop] = useState<string>('COTT')
  const [showPrior, setShowPrior] = useState(false)
  const [priorOpacity, setPriorOpacity] = useState<number>(40)
  const [priorMode, setPriorMode] = useState<'quantile'|'absolute'>('quantile')
  const [priorLoading, setPriorLoading] = useState<boolean>(false)
  const [priorLegend, setPriorLegend] = useState<{labels: string[], colors: string[]} | null>(null)
  // Only show supported crops in the UI. Backend will fall back to data_proc/<crop>_production.tif.
  const supportedCrops = useMemo(() => ['COTT','CHIL','GARL','ONIO','COFF'], [])
  const cropLabels: Record<string, string> = useMemo(() => ({
    COTT: 'COTT (cotton)',
    CHIL: 'CHIL (chillies/peppers)',
    GARL: 'GARL (garlic)',
    ONIO: 'ONIO (onion)',
    COFF: 'COFF (coffee)'
  }), [])
  const [availableCrops, setAvailableCrops] = useState<string[]>(supportedCrops)
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapboxRef = useRef<mapboxgl.Map | null>(null)
  const isoHandlersRef = useRef<{ click?: any; enter?: any; leave?: any } | null>(null)
  const isoHandlersAttachedRef = useRef<boolean>(false)
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  const priorHandlersRef = useRef<{ enter?: any; leave?: any; move?: any } | null>(null)
  const priorHandlersAttachedRef = useRef<boolean>(false)
  const priorPopupRef = useRef<mapboxgl.Popup | null>(null)
  const [isoCountryLoading, setIsoCountryLoading] = useState<boolean>(false)
  const [isoCountries, setIsoCountries] = useState<string[]>([])
  const [selectedValues, setSelectedValues] = useState<number[]>([])
  const [showInfo, setShowInfo] = useState<string | null>(null)

  const infoContent: Record<string, string> = {
    'prior': 'Weighted: Uses crop production (SPAM) as spatial prior. Regions with higher cotton production get proportionally higher prior probability before considering isotope data. Formula: prior(pixel) ∝ production(pixel).\n\nUnweighted: Uniform prior across all cotton-growing regions (mask > 0). Every valid pixel has equal prior probability regardless of production intensity.',
    'probability': 'HPD (Highest Posterior Density) Region:\n\n10%: Shows only pixels with the TOP 10% highest posterior densities. These are the geographic "hotspots" - the most concentrated likelihood regions. Excludes areas with diffuse probability.\n\n95%: Shows pixels containing 95% of cumulative probability mass. Much broader region, includes both high-density hotspots and lower-density areas.\n\nKey difference:\n• HPD region (map polygons): Geographic areas ranked by pixel-level posterior density\n• Country % (table): Total probability mass per country, summed across ALL pixels\n\nExample: USA may have 24% total probability (spread across many pixels) but 0% in 10% HPD (no high-density hotspots). Switch to 95% to see USA on map.',
    'choropleth': 'Aggregates posterior probability by country/region using Bayesian assignment. For each pixel in the posterior surface, sums probability mass within administrative boundaries. Formula: P(country) = Σ(posterior_pixel × prior_pixel) over all pixels in country, normalized. Darker green = higher probability that sample originated from that region.',
    'restrict_hpd': 'When enabled, choropleth only shows probabilities within the HPD (high posterior density) region. Outside HPD shows gray. Helps focus on most likely areas.',
    'spam': 'SPAM 2020: Spatial allocation of crop production. Shows where crops are grown globally. Used as geographic prior for weighted assignments. Provides production values in tons/hectare per ~10km pixel.',
    'mode': 'Quantile: Highlights top production areas (top 1%, 5%, 10%, 25%, 50%). Best for finding production hotspots.\n\nAbsolute: Shows production intensity in tons/hectare with crop-specific breaks (0-10, 10-50, 50-100, etc.). Best for understanding production scale.',
    'isobands': 'Contour bands showing cellulose δ18O values (‰). Each band represents 1‰ increment (14-15, 15-16, ..., 38-39). Click map or check values to highlight regions and see which countries fall in that isotopic range. Multi-select supported - check multiple values to see union of countries.'
  }

  function InfoIcon({ infoKey, position = 'right' }: { infoKey: string; position?: 'right' | 'top' }) {
    const positionStyles = position === 'top' 
      ? { left: '50%', transform: 'translateX(-50%)', bottom: 28 }
      : { left: 22, top: -10 }
    
    return (
      <span
        onMouseEnter={() => setShowInfo(infoKey)}
        onMouseLeave={() => setShowInfo(null)}
        style={{ position: 'relative', display: 'inline-block', marginLeft: 4, cursor: 'help' }}
      >
        <span style={{ fontSize: 12, color: '#6c9', border: '1.5px solid #6c9', borderRadius: '50%', width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, lineHeight: 1 }}>?</span>
        {showInfo === infoKey && (
          <div style={{ position: 'absolute', ...positionStyles, background: '#1a1a1a', border: '2px solid #6c9', borderRadius: 8, padding: 14, width: 380, maxWidth: '90vw', zIndex: 1000, fontSize: 14, lineHeight: 1.5, color: '#ddd', boxShadow: '0 6px 20px rgba(0,0,0,0.7)', whiteSpace: 'pre-line' }}>
            {infoContent[infoKey]}
          </div>
        )}
      </span>
    )
  }

  // Helper: HSL → HEX (for long discrete ramps)
  function hslToHex(h: number, s: number, l: number): string {
    s /= 100; l /= 100
    const k = (n: number) => (n + h / 30) % 12
    const a = s * Math.min(l, 1 - l)
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
    const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, '0')
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
  }

  // Fixed isovalues from 14..39 (1‰ bins). Colors span blue→cyan→green→yellow→orange→red.
  const bandInfo = useMemo(() => {
    const values: number[] = []
    for (let v = 14; v <= 39; v++) values.push(v)
    const breaks: number[] = [...values, 40]
    const labels: string[] = values.map(v => `${v}`)
    const colors: string[] = values.map((_, i) => {
      const t = values.length <= 1 ? 0 : i / (values.length - 1)
      // Widen hue range: 240° (blue) → 0° (red) for better color separation
      const hue = 240 + (0 - 240) * t
      const sat = 75
      const lig = 50
      return hslToHex(hue, sat, lig)
    })
    return { breaks, labels, colors, values }
  }, [])

  // Apply checkbox selection to map layers (single source of truth)
  useEffect(() => {
    const map = mapboxRef.current
    if (!map || !showIsobands) return
    const ids = selectedValues.map(v => bandInfo.values.indexOf(v) + 1).filter(n => n > 0)
    if (ids.length > 0) {
      const filter: any = ['in', ['get', 'band_id'], ['literal', ids]]
      try { if (map.getLayer('isoband-hlt-fill')) map.setFilter('isoband-hlt-fill', filter as any) } catch {}
      try { if (map.getLayer('isoband-hlt-line')) map.setFilter('isoband-hlt-line', filter as any) } catch {}
      try { if (map.getLayer('isoband-fill')) map.setPaintProperty('isoband-fill', 'fill-opacity', 0.08) } catch {}
    } else {
      try { if (map.getLayer('isoband-fill')) map.setPaintProperty('isoband-fill', 'fill-opacity', 0.65) } catch {}
      const filterNone: any = ['==', ['get', 'band_id'], -99999]
      try { if (map.getLayer('isoband-hlt-fill')) map.setFilter('isoband-hlt-fill', filterNone as any) } catch {}
      try { if (map.getLayer('isoband-hlt-line')) map.setFilter('isoband-hlt-line', filterNone as any) } catch {}
    }
  }, [selectedValues, bandInfo.values, showIsobands])

  useEffect(() => {
    // Fetch crop-specific calibration points
    fetch('/api/calibration?crop=' + encodeURIComponent(crop)).then(r => r.json()).then(d => {
      if (d?.points) setPoints(d.points)
    }).catch(() => setPoints([]))
  }, [crop])

  useEffect(() => {
    // Optional: fetch backend-reported crops, but constrain to supported list for UI
    fetch('/api/worldmapping?path=' + encodeURIComponent('/worldmapping/spam_crops'))
      .then(r => r.json())
      .then(d => {
        // Intersect backend list with supported; ensure all supported remain visible
        const fromApi: string[] = Array.isArray(d?.crops) ? d.crops : []
        const merged = Array.from(new Set([...supportedCrops, ...fromApi.filter((c: string) => supportedCrops.includes(c))]))
        setAvailableCrops(merged)
      })
      .catch(() => setAvailableCrops(supportedCrops))
  }, [])

  // Ensure selected crop is valid after available list changes
  useEffect(() => {
    if (!availableCrops.includes(crop)) setCrop(availableCrops[0] || 'COTT')
  }, [availableCrops])

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
  type CountryRow = { country: string; probability: number; prior_weight?: number }
  const [rows, setRows] = useState<CountryRow[]>([])
  const [tableErr, setTableErr] = useState<string | null>(null)
  const [hpdMap, setHpdMap] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!sample) { setHpdOverlay(null); return }
    // Mapbox plan: fetch GeoJSON from R and add as Mapbox source in a separate component
    setHpdOverlay({ type: 'mapbox', sample, prior, mass })
  }, [sample, prior, mass])

  const muUrl = useMemo(() => (
    `/api/isoscape/colorized?min=15&max=39`
  ), [])

  // PNG (static) URL for current selection
  const pngUrl = useMemo(() => {
    if (!sample) return ''
    const priorDir = prior === 'unweighted' ? 'Unweighted' : 'Weighted'
    const suffix = mass >= 0.5 ? 'world95' : 'world10'
    const relPath = `${sample}/${sample}, ${priorDir}/${sample} ${suffix}.png`
    return `/api/file?path=${encodeURIComponent(relPath)}`
  }, [sample, prior, mass])

  // Fetch probability table for the chosen sample/prior
  useEffect(() => {
    if (!sample) { setRows([]); setTableErr(null); return }
    const file = prior === 'unweighted' ? `${sample}Unweighted.csv` : `${sample}Weighted.csv`
    const relPath = `${sample}/${sample}, Tables/${file}`
    const url = `/api/file?path=${encodeURIComponent(relPath)}`
    fetch(url, { cache: 'no-store' })
      .then(r => r.ok ? r.text() : Promise.reject(`${r.status} ${r.statusText}`))
      .then(text => {
        const lines = text.split(/\r?\n/).filter(Boolean)
        if (lines.length === 0) { setRows([]); return }
        const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase())
        const iCountry = headers.indexOf('country')
        const iProb = headers.indexOf('probability')
        const iPrior = headers.indexOf('prior_weight')
        const out: CountryRow[] = []
        for (let i = 1; i < lines.length; i++) {
          const vals = lines[i].split(',').map(v => v.replace(/^"|"$/g, '').trim())
          const country = iCountry >= 0 ? vals[iCountry] : ''
          const probability = iProb >= 0 ? parseFloat(vals[iProb]) : NaN
          const prior_weight = iPrior >= 0 ? parseFloat(vals[iPrior]) : undefined
          if (country && Number.isFinite(probability)) out.push({ country, probability, prior_weight })
        }
        out.sort((a, b) => b.probability - a.probability)
        setRows(out)
        setTableErr(null)
      })
      .catch(err => { setRows([]); setTableErr(String(err)) })
  }, [sample, prior])

  // Fetch countries for selected isoband(s) based on checkbox selection
  useEffect(() => {
    if (!showIsobands || selectedValues.length === 0) { setIsoCountries([]); setIsoCountryLoading(false); return }
    const bandIds = selectedValues.map(v => bandInfo.values.indexOf(v) + 1).filter(n => n > 0)
    if (bandIds.length === 0) { setIsoCountries([]); setIsoCountryLoading(false); return }
    const breaks = bandInfo.breaks.join(',')
    setIsoCountryLoading(true)
    Promise.all(bandIds.map(bid => {
      const url = `/api/worldmapping?path=${encodeURIComponent(`/isoscape/isoband_countries?breaks=${breaks}&band_id=${bid}&crop=${encodeURIComponent(crop)}`)}`
      return fetch(url, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ countries: [] }))
    }))
      .then(results => {
        const allCountries: string[] = []
        for (const d of results) {
          const list: string[] = Array.isArray(d?.countries) ? d.countries.map((c: any) => Array.isArray(c) ? c[0] : (typeof c === 'string' ? c : String(c))).filter(Boolean) : []
          allCountries.push(...list)
        }
        setIsoCountries(Array.from(new Set(allCountries)).sort())
      })
      .catch(() => setIsoCountries([]))
      .finally(() => setIsoCountryLoading(false))
  }, [showIsobands, selectedValues, bandInfo.breaks, bandInfo.values])

  // Fetch HPD-restricted country shares ONCE per selection
  useEffect(() => {
    if (!sample) { setHpdMap({}); return }
    const url = `/api/worldmapping?path=${encodeURIComponent(`/worldmapping/country_hpd?sample=${encodeURIComponent(sample)}&prior=${encodeURIComponent(prior)}&mass=${encodeURIComponent(String(mass))}`)}`
    fetch(url, { cache: 'no-store' }).then(r => r.json()).then(d => {
      const map: Record<string, number> = {}
      if (Array.isArray(d?.rows)) {
        for (const it of d.rows) {
          const name = Array.isArray(it.country) ? it.country[0] : (typeof it.country === 'string' ? it.country : String(it.country))
          const val = Array.isArray(it.hpd_pct) ? it.hpd_pct[0] : it.hpd_pct
          const key = normalizeCountry(name)
          map[key] = Number(val)
        }
      }
      setHpdMap(map)
    }).catch(() => setHpdMap({}))
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
            if (map.getLayer('region-fill')) map.removeLayer('region-fill')
            if (map.getLayer('region-line')) map.removeLayer('region-line')
            if (map.getSource('region-src')) map.removeSource('region-src')
            if (map.getLayer('isoband-fill')) map.removeLayer('isoband-fill')
            if (map.getLayer('isoband-line')) map.removeLayer('isoband-line')
            if (map.getSource('isoband-src')) map.removeSource('isoband-src')
            const ids = map.getStyle()?.layers?.map(l => l.id) || []
            for (const id of ids) if (id.startsWith('exact-raster-')) try { map.removeLayer(id) } catch {}
            const srcs = Object.keys((map as any).style.sourceCaches || {})
            for (const id of srcs) if (id.startsWith('exact-image-')) try { map.removeSource(id) } catch {}
            if (map.getLayer('cal-circle')) map.removeLayer('cal-circle')
            if (map.getSource('cal-src')) map.removeSource('cal-src')
            if (map.getLayer('prior-fill')) map.removeLayer('prior-fill')
            if (map.getLayer('prior-line')) map.removeLayer('prior-line')
            if (map.getSource('prior-src')) map.removeSource('prior-src')
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
            if (map.getLayer('region-fill')) map.removeLayer('region-fill')
            if (map.getLayer('region-line')) map.removeLayer('region-line')
            if (map.getSource('region-src')) map.removeSource('region-src')
            if (map.getLayer('isoband-fill')) map.removeLayer('isoband-fill')
            if (map.getLayer('isoband-line')) map.removeLayer('isoband-line')
            if (map.getSource('isoband-src')) map.removeSource('isoband-src')
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
                // Always ensure HPD fill exists; choropleth will be layered underneath
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

            // Choropleth regions (ADM0/ADM1)
            if (showChoropleth) {
              const mode = choroplethRestrictHPD ? 'hpd' : 'global'
              const regUrl = `/api/worldmapping?path=${encodeURIComponent(`/worldmapping/regions_geojson?sample=${encodeURIComponent(sample)}&prior=${encodeURIComponent(prior)}&mass=${encodeURIComponent(String(mass))}&level=${encodeURIComponent(regionLevel)}&mode=${encodeURIComponent(mode)}`)}`
              const regRes = await fetch(regUrl, { cache: 'no-store' })
              if (regRes.ok) {
                const rj = await regRes.json()
                const gj2: FeatureCollection<Geometry, GeoJsonProperties> = Array.isArray(rj?.type) && rj?.type[0] === 'FeatureCollection' ? { ...rj, type: 'FeatureCollection' } : rj
                if (gj2 && gj2.type === 'FeatureCollection') {
                  const existingReg = map.getSource('region-src') as any
                  if (existingReg && typeof existingReg.setData === 'function') existingReg.setData(gj2 as any)
                  else map.addSource('region-src', { type: 'geojson', data: gj2 })
                  // Color ramp for property 'p' (percent)
                  const colorExpr: any = ['interpolate', ['linear'], ['get', 'p'],
                    0, '#f7fcf5',
                    1, '#e5f5e0',
                    5, '#c7e9c0',
                    10, '#a1d99b',
                    20, '#74c476',
                    40, '#31a354',
                    60, '#006d2c']
                  if (!map.getLayer('region-fill')) {
                    // Insert below HPD fill so green HPD remains visible
                    const beforeId = map.getLayer('hpd-fill') ? 'hpd-fill' : undefined
                    map.addLayer({ id: 'region-fill', type: 'fill', source: 'region-src', paint: { 'fill-color': colorExpr, 'fill-opacity': 0.35 } }, beforeId as any)
                  }
                  if (!map.getLayer('region-line')) {
                    const beforeId = map.getLayer('hpd-fill') ? 'hpd-fill' : undefined
                    map.addLayer({ id: 'region-line', type: 'line', source: 'region-src', paint: { 'line-color': '#555', 'line-width': 0.6 } }, beforeId as any)
                  }
                }
              } else {
                console.error('Regions fetch failed:', regRes.status, await regRes.text())
              }
            }

            // (moved isobands outside so it does not require a sample)
        }

        // Prior overlay (SPAM) — independent of sample
        if (showPrior) {
          setPriorLoading(true)
          const url = `/api/worldmapping?path=${encodeURIComponent(`/worldmapping/prior_bands?crop=${encodeURIComponent(crop)}&mode=${encodeURIComponent(priorMode)}`)}`
          const res = await fetch(url, { cache: 'no-store' })
          if (res.ok) {
            const gj = await res.json()
            if (gj?.error || !gj?.features || gj.features.length === 0) {
              // No data available for this crop - show fetch button instead
              setPriorLoading(false)
              setPriorLegend(null)
              // Remove any existing layers
              try {
                if (map.getLayer('prior-line')) map.removeLayer('prior-line')
                if (map.getLayer('prior-fill')) map.removeLayer('prior-fill')
                if (map.getSource('prior-src')) map.removeSource('prior-src')
              } catch {}
              return
            }
            const ex = map.getSource('prior-src') as any
            if (ex && typeof ex.setData === 'function') ex.setData(gj as any)
            else map.addSource('prior-src', { type: 'geojson', data: gj })
            
            // Extract labels from features to build legend
            const labels: string[] = []
            if (gj?.features?.length > 0) {
              const seen = new Set<string>()
              for (const f of gj.features) {
                const lab = f?.properties?.label
                const bid = f?.properties?.band_id
                if (lab && !seen.has(lab)) { seen.add(lab); labels[Number(bid)-1] = lab }
              }
            }
            
            // Stronger color palette for production (green→yellow→red for intensity)
            const colors = ['#f7fcf5','#d4efc8','#a5d99c','#74c476','#41ab5d','#238b45','#005a32','#004d29']
            setPriorLegend({ labels: labels.filter(Boolean), colors: colors.slice(0, labels.filter(Boolean).length) })
            
            const expr: any[] = ['match', ['get', 'band_id']]
            // Map band_ids to colors - terra classify produces 1-indexed band_ids
            const uniqueBids = Array.from(new Set((gj?.features || []).map((f: any) => Number(f?.properties?.band_id)))).filter((n): n is number => Number.isFinite(n)).sort((a, b) => a - b)
            for (const bid of uniqueBids) {
              const colorIdx = Math.max(0, Math.min(bid - 1, colors.length - 1))
              expr.push(bid)
              expr.push(colors[colorIdx])
            }
            expr.push('#f0f0f0')  // Light gray fallback
            if (!map.getLayer('prior-fill')) {
              map.addLayer({ id: 'prior-fill', type: 'fill', source: 'prior-src', paint: { 'fill-color': expr as any, 'fill-opacity': priorOpacity/100 } })
            } else {
              map.setPaintProperty('prior-fill', 'fill-color', expr as any)
              map.setPaintProperty('prior-fill', 'fill-opacity', priorOpacity/100)
            }
            if (!map.getLayer('prior-line')) {
              map.addLayer({ id: 'prior-line', type: 'line', source: 'prior-src', paint: { 'line-color': '#333', 'line-width': 0.4 } })
            }
            
            // Add hover tooltip for SPAM production
            if (!priorHandlersAttachedRef.current) {
              const move = (e: any) => {
                try {
                  const feats = map.queryRenderedFeatures(e.point, { layers: ['prior-fill'] }) as any[]
                  if (feats && feats.length > 0) {
                    const f = feats[0]
                    const lab = f?.properties?.label || 'Unknown'
                    if (priorPopupRef.current) priorPopupRef.current.remove()
                    priorPopupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false })
                      .setLngLat(e.lngLat)
                      .setHTML(`<div style="font-size:11px"><strong>SPAM ${crop}</strong><br/>${lab}</div>`)
                      .addTo(map)
                  }
                } catch {}
              }
              const leave = () => { if (priorPopupRef.current) { try { priorPopupRef.current.remove() } catch {}; priorPopupRef.current = null } }
              map.on('mousemove', 'prior-fill', move)
              map.on('mouseleave', 'prior-fill', leave)
              priorHandlersRef.current = { move, leave }
              priorHandlersAttachedRef.current = true
            }
            
            setPriorLoading(false)
          } else {
            // Fetch failed (400 = file not found, etc.)
            setPriorLoading(false)
            setPriorLegend(null)
            // Remove any existing layers
            try {
              if (map.getLayer('prior-line')) map.removeLayer('prior-line')
              if (map.getLayer('prior-fill')) map.removeLayer('prior-fill')
              if (map.getSource('prior-src')) map.removeSource('prior-src')
            } catch {}
          }
        } else {
          try {
            if (map.getLayer('prior-line')) map.removeLayer('prior-line')
            if (map.getLayer('prior-fill')) map.removeLayer('prior-fill')
            if (map.getSource('prior-src')) map.removeSource('prior-src')
          } catch {}
          // Detach SPAM hover handlers
          if (priorHandlersAttachedRef.current && priorHandlersRef.current) {
            try {
              const h = priorHandlersRef.current
              if (h.move) map.off('mousemove', 'prior-fill', h.move)
              if (h.leave) map.off('mouseleave', 'prior-fill', h.leave)
            } catch {}
            priorHandlersRef.current = null
            priorHandlersAttachedRef.current = false
          }
          if (priorPopupRef.current) { try { priorPopupRef.current.remove() } catch {}; priorPopupRef.current = null }
          setPriorLegend(null)
        }

        // Isobands overlay (independent of sample selection, but depends on crop)
        // Always remove old layers first to force refresh when crop changes
        try {
          if (map.getLayer('isoband-line')) map.removeLayer('isoband-line')
          if (map.getLayer('isoband-fill')) map.removeLayer('isoband-fill')
          if (map.getLayer('isoband-hlt-line')) map.removeLayer('isoband-hlt-line')
          if (map.getLayer('isoband-hlt-fill')) map.removeLayer('isoband-hlt-fill')
          if (map.getSource('isoband-src')) map.removeSource('isoband-src')
        } catch {}
        
        if (showIsobands) {
          const breaks = bandInfo.breaks.join(',')
          const isoUrl = `/api/worldmapping?path=${encodeURIComponent(`/isoscape/isobands?breaks=${breaks}&crop=${encodeURIComponent(crop)}`)}`
          const isoRes = await fetch(isoUrl, { cache: 'no-store' })
          if (isoRes.ok) {
            const rj = await isoRes.json()
            const gj3: FeatureCollection<Geometry, GeoJsonProperties> = Array.isArray(rj?.type) && rj?.type[0] === 'FeatureCollection' ? { ...rj, type: 'FeatureCollection' } : rj
            if (gj3 && gj3.type === 'FeatureCollection') {
              // Always create fresh source when crop changes
              map.addSource('isoband-src', { type: 'geojson', data: gj3 })
              // categorical colors by band id
              const expr: any[] = ['match', ['get', 'band_id']]
              for (let i = 0; i < bandInfo.colors.length; i++) {
                expr.push(i + 1)
                expr.push(bandInfo.colors[i])
              }
              expr.push('#252525')
              const beforeId = map.getLayer('hpd-fill') ? 'hpd-fill' : undefined
              map.addLayer({ id: 'isoband-fill', type: 'fill', source: 'isoband-src', paint: { 'fill-color': expr as any, 'fill-opacity': 0.65 } }, beforeId as any)
              // Draw band boundaries above HPD fill so they are clearly visible
              map.addLayer({ id: 'isoband-line', type: 'line', source: 'isoband-src', paint: { 'line-color': '#666', 'line-width': 0.6 } })
              // Highlight layers for selected bands (filter by band_id)
              map.addLayer({ id: 'isoband-hlt-fill', type: 'fill', source: 'isoband-src', paint: { 'fill-color': expr as any, 'fill-opacity': 0.85 } })
              map.addLayer({ id: 'isoband-hlt-line', type: 'line', source: 'isoband-src', paint: { 'line-color': expr as any, 'line-width': 1.2 } })

              // Interaction handlers (attach once): map click toggles checkbox
              if (!isoHandlersAttachedRef.current) {
                const click = (e: any) => {
                  try {
                    const feats = map.queryRenderedFeatures(e.point, { layers: ['isoband-fill'] }) as any[]
                    if (feats && feats.length > 0) {
                      const f = feats[0]
                      const bid = Number(f?.properties?.band_id)
                      const lab = typeof f?.properties?.label === 'string' ? f.properties.label : null
                      if (Number.isFinite(bid) && bid > 0 && bid <= bandInfo.values.length) {
                        const value = bandInfo.values[bid - 1]
                        setSelectedValues(prev => {
                          const exists = prev.includes(value)
                          return exists ? prev.filter(v => v !== value) : [...prev, value].sort((a,b) => a-b)
                        })
                        if (popupRef.current) { try { popupRef.current.remove() } catch {} }
                        popupRef.current = new mapboxgl.Popup({ closeOnClick: true })
                          .setLngLat(e.lngLat)
                          .setHTML(`<div style="background:#1a1a1a;padding:12px;border-radius:6px;border:2px solid #6c9;min-width:120px"><div style="font-weight:600;font-size:14px;color:#6c9;margin-bottom:4px">Isoband (${crop})</div><div style="font-size:16px;color:#fff;font-weight:600">${lab || value} ‰</div></div>`)
                          .addTo(map)
                      }
                    }
                  } catch {}
                }
                const enter = () => { try { map.getCanvas().style.cursor = 'pointer' } catch {} }
                const leave = () => { try { map.getCanvas().style.cursor = '' } catch {} }
                map.on('click', 'isoband-fill', click)
                map.on('mouseenter', 'isoband-fill', enter)
                map.on('mouseleave', 'isoband-fill', leave)
                isoHandlersRef.current = { click, enter, leave }
                isoHandlersAttachedRef.current = true
              }
            }
          }
        } else {
          // Detach handlers and clear popup when toggled off
          if (isoHandlersAttachedRef.current && isoHandlersRef.current) {
            try {
              const h = isoHandlersRef.current
              if (h.click) map.off('click', 'isoband-fill', h.click)
              if (h.enter) map.off('mouseenter', 'isoband-fill', h.enter)
              if (h.leave) map.off('mouseleave', 'isoband-fill', h.leave)
            } catch {}
            isoHandlersRef.current = null
            isoHandlersAttachedRef.current = false
          }
          if (popupRef.current) { try { popupRef.current.remove() } catch {}; popupRef.current = null }
        }

        // Calibration points toggle
        if (showCalibration && points.length > 0) {
          const gj: FeatureCollection = {
            type: 'FeatureCollection',
            features: points.map((p: any) => ({
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
              'circle-radius': 7,
              'circle-color': '#ff0',
              'circle-stroke-color': '#000',
              'circle-stroke-width': 2
            }
          })
        } else {
          if (map.getLayer('cal-circle')) map.removeLayer('cal-circle')
          if (map.getSource('cal-src')) map.removeSource('cal-src')
        }
      } catch (e) {
        console.error('Error updating map layers:', e)
      }
    }

    updateLayers()
  }, [sample, prior, mass, useExactPng, showCalibration, points, showChoropleth, regionLevel, choroplethRestrictHPD, showIsobands, showPrior, priorOpacity, crop, priorMode, bandInfo.breaks, bandInfo.colors, bandInfo.values, selectedValues])

  return (
    <div style={{ border: '1px solid #333', padding: 8 }}>
      {/* Sample-dependent controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 4, paddingBottom: 4, borderBottom: '1px solid #444' }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Sample-dependent:</span>
        <label>Sample&nbsp;
          <select value={sample} onChange={e => setSample(e.target.value)}>
            <option value="">(select)</option>
            {samples.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label style={{ opacity: sample ? 1 : 0.4 }}>Prior<InfoIcon infoKey="prior" />&nbsp;
          <select value={prior} onChange={e => setPrior(e.target.value as any)} disabled={!sample}>
            <option value="weighted">weighted</option>
            <option value="unweighted">unweighted</option>
          </select>
        </label>
        <label style={{ opacity: sample ? 1 : 0.4 }}>Probability<InfoIcon infoKey="probability" />&nbsp;
          <select value={String(Math.round(mass*100))} onChange={e => {
            const pct = parseInt(e.target.value, 10)
            const m = Math.max(1, Math.min(99, pct)) / 100
            setMass(m)
          }} disabled={!sample}>
            <option value="10">10%</option>
            <option value="95">95%</option>
          </select>
        </label>
        <label style={{ opacity: sample ? 1 : 0.4 }}>Region level&nbsp;
          <select value={regionLevel} onChange={e => setRegionLevel(e.target.value as any)} disabled={!sample}>
            <option value="adm0">Countries</option>
            <option value="adm1">ADM1</option>
          </select>
        </label>
        <label style={{ opacity: sample ? 1 : 0.4 }}><input type="checkbox" checked={showChoropleth} onChange={e => setShowChoropleth(e.target.checked)} disabled={!sample} /> Choropleth<InfoIcon infoKey="choropleth" /></label>
        <label style={{ opacity: (sample && showChoropleth) ? 1 : 0.4 }}><input type="checkbox" disabled={!sample || !showChoropleth} checked={choroplethRestrictHPD} onChange={e => setChoroplethRestrictHPD(e.target.checked)} /> Restrict to HPD<InfoIcon infoKey="restrict_hpd" position="top" /></label>
        <label style={{ opacity: sample ? 1 : 0.4 }}><input type="checkbox" checked={useExactPng} onChange={e => setUseExactPng(e.target.checked)} disabled={!sample} /> PNG view</label>
      </div>
      {/* Sample-independent controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Sample-independent:</span>
        <label>Crop&nbsp;
          <select value={crop} onChange={e => setCrop(e.target.value)}>
            {availableCrops.map(c => (
              <option key={c} value={c}>{cropLabels[c] || c}</option>
            ))}
          </select>
        </label>
        <label><input type="checkbox" checked={showPrior} onChange={e => setShowPrior(e.target.checked)} /> Prior (SPAM)<InfoIcon infoKey="spam" />{priorLoading ? ' …' : ''}</label>
        <label style={{ opacity: showPrior ? 1 : 0.5 }}>Mode<InfoIcon infoKey="mode" />&nbsp;
          <select value={priorMode} onChange={e => setPriorMode(e.target.value as any)} disabled={!showPrior}>
            <option value="quantile">Quantile</option>
            <option value="absolute">Absolute</option>
          </select>
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: showPrior ? 1 : 0.5 }}>Opacity {priorOpacity}%
          <input type="range" min={0} max={100} value={priorOpacity} onChange={e => setPriorOpacity(parseInt(e.target.value, 10))} disabled={!showPrior} />
        </label>
        <label><input type="checkbox" checked={showIsobands} onChange={e => setShowIsobands(e.target.checked)} /> Isobands<InfoIcon infoKey="isobands" /></label>
        <label><input type="checkbox" checked={showCalibration} onChange={e => setShowCalibration(e.target.checked)} /> Calibration points {showCalibration && points.length > 0 && `(${crop}: ${points.length})`}</label>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        {/* Left: map or PNG */}
        <div style={{ flex: '1 1 70%', minWidth: 0 }}>
          {/* Map view (hidden when PNG view is on) */}
          <div ref={mapRef} style={{ height: 900, width: '100%', border: '1px solid #222', display: useExactPng ? 'none' : 'block' }} />
          {/* PNG view: render static image with native aspect ratio */}
          {useExactPng && pngUrl && (
            <div style={{ width: '100%', border: '1px solid #222' }}>
              <img src={pngUrl} alt={`${sample} ${Math.round(mass*100)}%`} style={{ display: 'block', width: '100%', height: 'auto' }} />
            </div>
          )}
        </div>
        {/* Right: country table and legends */}
        <div style={{ flex: '0 0 480px', maxWidth: 560, border: '1px solid #222', height: 900, overflow: 'auto', padding: 8, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Country probabilities ({prior})</div>
          {tableErr && <div style={{ color: '#b00', marginBottom: 8, fontSize: 11 }}>Failed to load table: {tableErr}</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '3px 4px', fontSize: 11 }}>#</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '3px 4px', fontSize: 11 }}>Country</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '3px 4px', fontSize: 11 }}>Probability (%)</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '3px 4px', fontSize: 11 }}>HPD {Math.round(mass*100)}% (%)</th>
                {prior === 'weighted' && <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '3px 4px', fontSize: 11 }}>Prior weight (%)</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <Row key={i} idx={i} r={r} prior={prior} hpdMap={hpdMap} mass={mass} />
              ))}
            </tbody>
          </table>
          {showPrior && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, margin: '8px 0' }}>SPAM Production ({crop}, {priorMode})</div>
              {priorLegend && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {priorLegend.labels.map((lab, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 20, height: 14, background: priorLegend.colors[i], border: '1px solid #ccc' }} />
                      <span style={{ fontSize: 12 }}>{lab}</span>
                    </div>
                  ))}
                </div>
              )}
              {!priorLegend && !priorLoading && (
                <div style={{ fontSize: 12, color: '#999', marginTop: 4, fontStyle: 'italic' }}>
                  No SPAM data for {crop}. Use the <strong>IsoscapeBuild</strong> tab → select {crop} → click <strong>Fetch inputs</strong> to download.
                </div>
              )}
            </div>
          )}
          {showChoropleth && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, margin: '8px 0' }}>Choropleth legend (% of mass{choroplethRestrictHPD ? ` in HPD ${Math.round(mass*100)}%` : ''})</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {['#f7fcf5','#e5f5e0','#c7e9c0','#a1d99b','#74c476','#31a354','#006d2c'].map((c, i) => (
                  <div key={i} style={{ width: 26, height: 12, background: c, border: '1px solid #ccc' }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#555', marginTop: 4 }}>
                <span>0</span><span>1</span><span>5</span><span>10</span><span>20</span><span>40</span><span>60+</span>
              </div>
            </div>
          )}
          {showIsobands && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, margin: '8px 0' }}>Isobands (μ, ‰)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto', gap: 6 }}>
                {bandInfo.labels.map((lab, i) => {
                  const value = bandInfo.values[i]
                  const checked = selectedValues.includes(value)
                  return (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={checked} onChange={e => {
                        setSelectedValues(prev => {
                          const exists = prev.includes(value)
                          return exists ? prev.filter(v => v !== value) : [...prev, value].sort((a,b) => a-b)
                        })
                      }} />
                      <div style={{ width: 18, height: 12, background: bandInfo.colors[i], border: '1px solid #ccc' }} />
                      <span style={{ fontSize: 12 }}>{lab}</span>
                    </label>
                  )
                })}
              </div>
              <div style={{ marginTop: 8 }}>
                <button onClick={() => { setIsoCountries([]); setSelectedValues([]); if (popupRef.current) { try { popupRef.current.remove() } catch {}; popupRef.current = null } }} style={{ fontSize: 12, padding: '4px 8px' }}>Clear highlight</button>
              </div>
              {selectedValues.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Countries in {selectedValues.length === 1 ? selectedValues[0] : selectedValues.join(', ')}{isoCountryLoading ? ' …' : ''}</div>
                  {!isoCountryLoading && isoCountries.length === 0 && (
                    <div style={{ fontSize: 12, color: '#666' }}>No countries in this range.</div>
                  )}
                  {isoCountries.length > 0 && (
                    <ul style={{ margin: '4px 0 0 16px', padding: 0, columns: 2, columnGap: 16, fontSize: 12 }}>
                      {isoCountries.map((c, i) => (
                        <li key={i} style={{ breakInside: 'avoid' }}>{c}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ idx, r, prior, hpdMap, mass }: { idx: number; r: { country: string; probability: number; prior_weight?: number }; prior: 'weighted'|'unweighted'; hpdMap: Record<string, number>; mass: number }) {
  const key = normalizeCountry(r.country)
  // find direct match or fuzzy contains
  let hpdPct: number | null = null
  if (key && hpdMap) {
    if (key in hpdMap) hpdPct = hpdMap[key]
    else {
      const found = Object.entries(hpdMap).find(([k]) => k.includes(key) || key.includes(k))
      hpdPct = found ? found[1] : 0
    }
  }
  return (
    <tr>
      <td style={{ padding: '3px 4px', fontSize: 11 }}>{idx + 1}</td>
      <td style={{ padding: '3px 4px', fontSize: 11 }}>{r.country}</td>
      <td style={{ padding: '3px 4px', textAlign: 'right', fontSize: 11 }}>{r.probability.toFixed(1)}</td>
      <td style={{ padding: '3px 4px', textAlign: 'right', fontSize: 11 }}>{hpdPct == null ? '—' : Number(hpdPct).toFixed(1)}</td>
      {prior === 'weighted' && <td style={{ padding: '3px 4px', textAlign: 'right', fontSize: 11 }}>{(r.prior_weight ?? 0).toFixed(2)}</td>}
    </tr>
  )
}

function normalizeCountry(s: string): string {
  const t = (s || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
  // common synonyms
  if (t === 'unitedstatesofamerica') return 'unitedstates'
  if (t === 'russianfederation') return 'russia'
  return t
}
