'use client'

import { useEffect, useState } from 'react'
import { loadGlbAthleteAsset } from '@/components/courtiq/world/renderer/labAthlete'
import { GLB_ATHLETE_ASSET_URL } from '@/components/courtiq/world/renderer/glbAthlete'

const ASSETS = [
  '/athlete/lab-athlete.glb', GLB_ATHLETE_ASSET_URL,
  '/environment/courtiq-hoop.glb', '/environment/courtiq-bench.glb', '/environment/courtiq-wall-pad.glb',
]
interface Probe { url: string; status: string; bytes?: number }

export function GlbDebugClient({ commit }: { commit: string }) {
  const [probes, setProbes] = useState<Probe[]>(ASSETS.map(url => ({ url, status: 'Checking…' })))
  const [loader, setLoader] = useState('Loading…')

  useEffect(() => {
    let cancelled = false
    void Promise.all(ASSETS.map(async (url): Promise<Probe> => {
      try {
        const response = await fetch(url, { method: 'HEAD', cache: 'no-store' })
        const length = response.headers.get('content-length')
        return { url, status: response.ok ? 'Available' : `HTTP ${response.status}`, bytes: length ? Number(length) : undefined }
      } catch {
        return { url, status: 'Unavailable' }
      }
    })).then(results => { if (!cancelled) setProbes(results) })
    void loadGlbAthleteAsset().then(ready => {
      if (!cancelled) setLoader(ready ? 'Authored athlete or GLB fallback ready' : 'Procedural skinned fallback')
    }).catch(() => { if (!cancelled) setLoader('Procedural skinned fallback') })
    return () => { cancelled = true }
  }, [])

  return <main style={{ padding: 24, color: '#f4f1ea', background: '#07080a', minHeight: '100vh' }}>
    <h1>CourtIQ asset diagnostics</h1>
    <p>Current world assets and loader availability. Animation and simulation are reviewed in the Lab and athlete studio.</p>
    <p>Build: <code>{commit}</code></p>
    <p>Athlete loader: {loader}</p>
    <table style={{ textAlign: 'left', borderSpacing: '16px 10px' }}>
      <thead><tr><th>Local asset</th><th>Status</th><th>Bytes</th></tr></thead>
      <tbody>{probes.map(probe => <tr key={probe.url}><td>{probe.url}</td><td>{probe.status}</td><td>{probe.bytes ?? '—'}</td></tr>)}</tbody>
    </table>
  </main>
}
