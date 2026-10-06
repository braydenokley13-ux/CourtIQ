'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import CourtWorld from '@/components/courtiq/world/CourtWorld'
import type { CameraMode, Lens, Mark, WorldScene } from '@/components/courtiq/world/types'
import { LENSES, divergenceLabels, divergenceMarks, lensMarks, momentMarks } from '@/components/courtiq/lenses'
import { createDefaultConfig } from '@/lib/defense-lab/scenario'
import { frameAt, simulate } from '@/lib/defense-lab/simulation'
import { analyze } from '@/lib/defense-lab/analytics'
import { findTeachingMoment } from '@/lib/defense-lab/explore'
import { attack, type AttackPreview, type AttackReport } from '@/lib/defense-lab/attack'

type State = { t: number; lens: Lens; camera: CameraMode; ghost: boolean; phase: 'normal' | 'moment' | 'break-search' | 'break-moment'; inset: 'panel' | 'none'; pov: string | null; shown: number }
const INSETS = { panel: { right: 430, left: 0, top: 150, bottom: 80 }, none: {} }

export default function XrayClient() {
  const config = useMemo(() => createDefaultConfig(), [])
  const result = useMemo(() => simulate(config), [config])
  const alt = useMemo(() => simulate({ ...config, answer: { ...config.answer, tagDepth: Math.min(1, config.answer.tagDepth + 0.7) } }), [config])
  const moment = useMemo(() => findTeachingMoment(result, analyze(result)), [result])
  const [state, setState] = useState<State>(() => {
    const q = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
    return { t: Number(q.get('t') ?? 0) || (moment?.t ?? 1.6), lens: (q.get('lens') as Lens) ?? 'normal', camera: (q.get('camera') as CameraMode) ?? 'director', ghost: q.get('ghost') === '1', phase: (q.get('phase') as State['phase']) ?? 'normal', inset: q.get('inset') === 'none' ? 'none' : 'panel', pov: q.get('pov') ?? null, shown: 0 }
  })
  const report = useRef<AttackReport | null>(null)
  const previews = useRef<AttackPreview[]>([])
  const [attempts, setAttempts] = useState<AttackPreview[]>([])
  const [flash, setFlash] = useState<string>('')

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
      info: () => ({ moment: moment?.t, involved: moment?.involved, lenses: LENSES.map(l => l.id) }),
    }
    ;(window as unknown as { __xray: typeof api }).__xray = api
  }, [config, moment])

  const frame = useMemo(() => frameAt(result, state.t), [result, state.t])
  const ghost = state.ghost ? frameAt(alt, state.t) : null
  const w = report.current?.selected.witness ?? null
  const marks: Mark[] = useMemo(() => {
    const out: Mark[] = []
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
    if (state.phase === 'break-moment' && w) return [...new Set([w.playerId, w.limitingDefenderId, frame.ball.owner ?? 'O1'])] as never[]
    if (state.phase === 'break-search') return frame.players.map(p => p.id)
    return state.lens !== 'normal' && moment ? moment.involved : []
  }, [state.phase, state.lens, moment, w, frame])
  const scene: WorldScene = useMemo(() => ({
    frame, ghost, marks, lens: state.lens, focus, camera: state.camera, pov: (state.pov as never) ?? 'D3', selectedId: null, playing: false, editable: false,
    rig: state.phase === 'break-search' ? { azimuth: Math.PI + 0.28, elevation: 0.3, fov: 34, minDistance: 8 } : null,
    impact: state.phase === 'break-moment' ? 1 : undefined,
    inset: INSETS[state.inset],
  }), [frame, ghost, marks, state, focus])
  const labels = useMemo(() => state.ghost ? divergenceLabels(result, alt, state.t) : [], [state.ghost, result, alt, state.t])
  void setFlash; void flash
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <CourtWorld scene={scene} callbacks={{}}>
        {labels.map((l, i) => <div key={i} data-anchor={l.anchor} data-lift="1.4" style={{ position: 'absolute', left: 0, top: 0, font: '600 12px system-ui', color: '#fff', background: 'rgba(10,14,22,.8)', padding: '3px 8px', borderRadius: 99, whiteSpace: 'nowrap', marginLeft: -30 }}>{l.text}</div>)}
      </CourtWorld>
      {state.inset === 'panel' && <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 430, border: '2px dashed rgba(255,255,255,.18)', pointerEvents: 'none' }} />}
    </div>
  )
}
