'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Box3 as THREE_Box3 } from 'three'
import CourtWorld from '@/components/courtiq/world/CourtWorld'
import type { CameraMode, Lens, Mark, WorldScene } from '@/components/courtiq/world/types'
import { LENSES, lensLabels, divergenceLabels, divergenceMarks, lensMarks, momentMarks } from '@/components/courtiq/lenses'
import { createDefaultConfig } from '@/lib/defense-lab/scenario'
import { frameAt, simulate } from '@/lib/defense-lab/simulation'
import { analyze } from '@/lib/defense-lab/analytics'
import { findTeachingMoment } from '@/lib/defense-lab/explore'
import { attack, type AttackPreview, type AttackReport } from '@/lib/defense-lab/attack'

type State = { t: number; lens: Lens; camera: CameraMode; ghost: boolean; phase: 'normal' | 'moment' | 'break-search' | 'break-moment'; inset: 'panel' | 'none'; pov: string | null; shown: number; marks: boolean }
const INSETS = { panel: { right: 430, left: 0, top: 150, bottom: 80 }, none: {} }

export default function XrayClient() {
  const config = useMemo(() => createDefaultConfig(), [])
  const result = useMemo(() => simulate(config), [config])
  const alt = useMemo(() => simulate({ ...config, answer: { ...config.answer, tagDepth: 0.15 } }), [config])
  const moment = useMemo(() => findTeachingMoment(result, analyze(result)), [result])
  const [state, setState] = useState<State>(() => {
    const q = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
    return { t: Number(q.get('t') ?? 0) || (moment?.t ?? 1.6), lens: (q.get('lens') as Lens) ?? 'normal', camera: (q.get('camera') as CameraMode) ?? 'director', ghost: q.get('ghost') === '1', phase: (q.get('phase') as State['phase']) ?? 'normal', inset: q.get('inset') === 'none' ? 'none' : 'panel', pov: q.get('pov') ?? null, shown: 0, marks: q.get('marks') !== '0' }
  })
  const report = useRef<AttackReport | null>(null)
  const previews = useRef<AttackPreview[]>([])
  const [attempts, setAttempts] = useState<AttackPreview[]>([])
  const [flash, setFlash] = useState<string>('')
  const rt = useRef<unknown>(null)

  useEffect(() => {
    const api = {
      set: (patch: Partial<State>) => setState(s => ({ ...s, ...patch })),
      breakStart: (everyMs = 1800) => {
        setAttempts([]); setState(s => ({ ...s, phase: 'break-search' }))
        if (!report.current) report.current = attack(config, { onCandidate: p => { previews.current = [...previews.current.filter(x => x.id !== p.id), p] } })
        const list = previews.current.length ? previews.current : []
        list.forEach((p, i) => setTimeout(() => setAttempts(a => [...a.filter(x => x.id !== p.id), p]), 600 + i * everyMs))
        setTimeout(() => setState(s => ({ ...s, phase: 'break-moment', t: report.current?.selected.witness?.at ?? s.t })), 1200 + list.length * everyMs)
        return { previews: list.length, witness: report.current?.selected.witness?.at ?? null }
      },
      /** Software GL runs ~1 fps, so damped cameras never settle in a still: jump to the goal pose. */
      snap: () => {
        const r = rt.current as unknown as { director: { rig: unknown; step(...a: unknown[]): void }; state: WorldScene; dirty: boolean } | null
        if (!r) return false
        r.director.rig = r.state.rig ?? null
        r.director.step(r.state.camera, r.state.frame, r.state.focus, r.state.pov, 1, true); r.dirty = true
        return true
      },
      dump: () => {
        const scene = (rt.current as { scene?: import('three').Scene } | null)?.scene
        const out: string[] = []
        scene?.traverse(o => {
          const m = o as import('three').Mesh
          if (!m.isMesh) return
          let p: import('three').Object3D | null = o, chain = ''
          while (p) { chain = (p.name || p.type) + '/' + chain; p = p.parent }
          m.geometry.computeBoundingSphere()
          const wp = m.getWorldPosition(new (m.position.constructor as new () => import('three').Vector3)())
          const mat = m.material as import('three').Material
          const bb = new (THREE_Box3 as new () => import('three').Box3)().setFromObject(o)
          const sz = bb.getSize(new (m.position.constructor as new () => import('three').Vector3)())
          if (/analytical-marks|alternate/.test(chain) && (sz.x > 3 || sz.y > 2 || sz.z > 3)) out.push(`size=${sz.x.toFixed(1)},${sz.y.toFixed(1)},${sz.z.toFixed(1)} ${chain} ${m.geometry.type} r=${m.geometry.boundingSphere?.radius.toFixed(2)} ro=${m.renderOrder} pos=${wp.x.toFixed(1)},${wp.y.toFixed(1)},${wp.z.toFixed(1)} scale=${m.scale.x.toFixed(1)},${m.scale.y.toFixed(1)} mat=${mat.type} vis=${(function v(o: import('three').Object3D | null): boolean { return !o || (o.visible && v(o.parent)) })(o)} count=${(m as unknown as { count?: number }).count}`)
        })
        return out
      },
      info: () => ({ moment: moment?.t, involved: moment?.involved, lenses: LENSES.map(l => l.id) }),
    }
    ;(window as unknown as { __xray: typeof api }).__xray = api
  }, [config, moment])

  const frame = useMemo(() => frameAt(result, state.t), [result, state.t])
  const ghost = state.ghost ? frameAt(alt, state.t) : null
  const w = report.current?.selected.witness ?? null
  const marks: Mark[] = useMemo(() => {
    const out: Mark[] = []
    if (!state.marks) return out
    if (state.lens !== 'normal') out.push(...lensMarks(state.lens, frame, config.assumptions, null, frameAt(result, Math.max(0, state.t - 0.5))))
    else if (state.phase === 'moment' && moment) out.push(...momentMarks(moment, frame))
    if (state.ghost) out.push(...divergenceMarks(result, alt, state.t))
    if (state.phase.startsWith('break')) {
      for (const a of attempts) if (a.points.length > 1) out.push({ kind: 'comet', id: `atk-${a.id}`, points: a.points, outcome: a.verdict !== 'held' ? 'exposed' : 'held', selected: a.selected, run: a.selected ? 820 : 620 })
      if (w && state.phase === 'break-moment') {
        out.push({ kind: 'flare', id: 'atk-flare', at: w.playerId, tone: 'attack', radius: 1.5, duration: 1100 })
        out.push({ kind: 'ring', id: 'atk-open', at: w.playerId, tone: 'attack', radius: 0.7, pulse: true })
        out.push({ kind: 'tether', id: 'atk-snap', from: w.limitingDefenderId, to: w.playerId, tone: 'threat', y: 1.15, sag: 0.25, width: 0.06, fray: true, opacity: 0.9 })
      }
    }
    return out
  }, [state, frame, config, result, alt, moment, attempts, w])
  const focus = useMemo(() => {
    if (state.phase === 'moment' && moment) return moment.involved
    if (state.phase === 'break-moment' && w) {
      const at = frame.players.find(p => p.id === w.playerId)
      const near = at ? frame.players.filter(p => p.team === 'defense' && p.id !== w.limitingDefenderId).sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z)).slice(0, 2).map(p => p.id) : []
      return [...new Set([w.playerId, w.limitingDefenderId, frame.ball.owner ?? 'O1', ...near])] as never[]
    }
    if (state.phase === 'break-search') { const b = frame.ball; return [...frame.players].sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z)).slice(0, 7).map(p => p.id) as never[] }
    return state.lens !== 'normal' && moment ? moment.involved : []
  }, [state.phase, state.lens, moment, w, frame])
  const scene: WorldScene = useMemo(() => ({
    frame, ghost, marks, lens: state.lens, focus, camera: state.camera, pov: (state.pov as never) ?? 'D3', selectedId: null, playing: false, editable: false,
    rig: state.phase === 'break-search' ? { azimuth: Math.PI + 0.28, elevation: 0.3, fov: 38, minDistance: 7 } : null,
    impact: state.phase === 'break-moment' ? 1 : undefined,
    inset: INSETS[state.inset],
  }), [frame, ghost, marks, state, focus])
  const labels = useMemo(() => [...(state.ghost ? divergenceLabels(result, alt, state.t) : []), ...(state.lens !== 'normal' ? lensLabels(state.lens, frame, config.assumptions) : [])], [state.ghost, state.lens, result, alt, state.t, frame, config])
  void setFlash; void flash
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <CourtWorld scene={scene} callbacks={{}} onRuntime={r => { rt.current = r }}>
        {labels.map((l, i) => <div key={i} data-anchor={l.anchor} data-lift="1.4" style={{ position: 'absolute', left: 0, top: 0, font: '600 12px system-ui', color: '#fff', background: 'rgba(10,14,22,.8)', padding: '3px 8px', borderRadius: 99, whiteSpace: 'nowrap', marginLeft: -30 }}>{l.text}</div>)}
      </CourtWorld>
      {state.inset === 'panel' && <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 430, border: '2px dashed rgba(255,255,255,.18)', pointerEvents: 'none' }} />}
    </div>
  )
}
