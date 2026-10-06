'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { analyze, compare, type ComparisonResult } from '@/lib/defense-lab/analytics'
import { attackAsync, type AttackPreview, type AttackReport } from '@/lib/defense-lab/attack'
import { exploreAsync, robustnessAsync, type ExploreReport, type FixOption, type TeachingMoment } from '@/lib/defense-lab/exploreClient'
import type { Robustness } from '@/lib/defense-lab/explore'
import { findTeachingMoment } from '@/lib/defense-lab/explore'
import { simulateCached } from '@/lib/defense-lab/replayCache'
import { createDefaultConfig } from '@/lib/defense-lab/scenario'
import { frameAt } from '@/lib/defense-lab/simulation'
import type { LabConfig, PlayerId, Point2, SimulationResult, TeamAnswer } from '@/lib/defense-lab/types'

export type Phase =
  | 'ambient' // behind the entry flow
  | 'ready' // in the lab, nothing run yet
  | 'playing'
  | 'moment' // frozen at a teaching moment
  | 'holds' // ran, nothing opened
  | 'fix'
  | 'compare'
  | 'break-search'
  | 'break-play'
  | 'break-moment'
  | 'break-held'

export interface Snapshot { config: LabConfig; result: SimulationResult; moment: TeachingMoment | null; label: string }

/** React-visible playback clock cadence (ms). The world itself reads the clock every frame. */
export const UI_CLOCK_MS = (() => {
  // ?uiclock=0 restores a React update on every animation frame (A/B knob for scripts/perf/bench.mjs).
  if (typeof window === 'undefined') return 80
  const v = Number(new URLSearchParams(window.location.search).get('uiclock'))
  return Number.isFinite(v) && new URLSearchParams(window.location.search).has('uiclock') ? Math.max(0, v) : 80
})()

const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T

/** The Lab's executable state: config → deterministic replay → moment → fixes.
 * Every number shown to the coach comes from these replays. */
export function useLab() {
  const [config, setConfigRaw] = useState<LabConfig>(createDefaultConfig)
  const [phase, setPhase] = useState<Phase>('ambient')
  const [time, setTimeState] = useState(0)
  const timeRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(false)
  const stopAt = useRef<number | null>(null)
  const onStop = useRef<(() => void) | null>(null)
  const [previous, setPrevious] = useState<Snapshot | null>(null)
  const [explore, setExplore] = useState<ExploreReport | null>(null)
  const [exploreBusy, setExploreBusy] = useState(false)
  const [hoverFix, setHoverFix] = useState<FixOption | null>(null)
  const [lastFix, setLastFix] = useState<FixOption | null>(null)
  // Break Mode
  const [attack, setAttack] = useState<AttackReport | null>(null)
  const [attackPrevious, setAttackPrevious] = useState<AttackReport | null>(null)
  const [attempts, setAttempts] = useState<AttackPreview[]>([])
  const [attackProgress, setAttackProgress] = useState(0)
  const attackAbort = useRef<AbortController | null>(null)
  const [override, setOverride] = useState<SimulationResult | null>(null)

  const setTime = useCallback((t: number) => { timeRef.current = t; setTimeState(t) }, [])
  const result = useMemo(() => simulateCached(config), [config])
  const display = override ?? result
  const analysis = useMemo(() => analyze(result), [result])
  const moment = useMemo(() => findTeachingMoment(result, analysis), [result, analysis])
  const frame = useMemo(() => frameAt(display, time), [display, time])
  const comparison: ComparisonResult | null = useMemo(() => previous ? compare(previous.result, result) : null, [previous, result])
  const duration = config.assumptions.duration

  // Fixes are explored off the main thread whenever the answer changes.
  const active = phase !== 'ambient'
  useEffect(() => {
    if (!active) return
    const ctrl = new AbortController()
    setExploreBusy(true)
    const id = setTimeout(() => {
      exploreAsync(config, { signal: ctrl.signal, max: 5 }).then(r => { setExplore(r); setExploreBusy(false) }).catch(() => { if (!ctrl.signal.aborted) setExploreBusy(false) })
    }, 120)
    return () => { clearTimeout(id); ctrl.abort() }
  }, [config, active])

  // How much to trust the moment: rerun with small, deterministic variations.
  const [robust, setRobust] = useState<Robustness | null>(null)
  useEffect(() => {
    if (!active) return
    setRobust(null)
    const ctrl = new AbortController()
    const id = setTimeout(() => { robustnessAsync(config, { signal: ctrl.signal, samples: 8, moment }).then(r => { if (!ctrl.signal.aborted) setRobust(r) }).catch(() => {}) }, 400)
    return () => { clearTimeout(id); ctrl.abort() }
  }, [config, moment, active])

  // Playback clock. The world reads `timeRef` directly every animation frame (see WorldScene.live);
  // React state is only refreshed ~12 Hz for the dock/scrubber/marks, so a 60 fps clock no longer
  // re-renders the whole shell 60 times a second. Stops and seeks still set the exact time at once.
  useEffect(() => {
    if (!playing) return
    let raf = 0, last = 0, uiAt = 0
    const tick = (now: number) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
      last = now
      let next = timeRef.current + dt * speed
      const stop = stopAt.current
      if (stop !== null && timeRef.current < stop && next >= stop) {
        setTime(stop); stopAt.current = null; setPlaying(false)
        const cb = onStop.current; onStop.current = null; cb?.(); return
      }
      if (next >= duration) {
        if (loop) next = 0
        else { setTime(duration); setPlaying(false); const cb = onStop.current; onStop.current = null; cb?.(); return }
      }
      timeRef.current = next
      if (now - uiAt >= UI_CLOCK_MS) { uiAt = now; setTimeState(next) }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, duration, loop, setTime])

  const play = useCallback((from: number | null, until: number | null, then?: () => void) => {
    if (from !== null) setTime(from)
    stopAt.current = until; onStop.current = then ?? null
    setPlaying(true)
  }, [setTime])
  const pause = useCallback(() => { setPlaying(false); stopAt.current = null; onStop.current = null; setTimeState(timeRef.current) }, [])
  const seek = useCallback((t: number) => { pause(); setTime(Math.max(0, Math.min(duration, t))) }, [pause, setTime, duration])

  /** Run the possession; freeze where the basketball is worth talking about. */
  const runRef = useRef<() => void>(() => {})
  const run = useCallback((opts?: { compareTo?: Snapshot | null }) => {
    setOverride(null); setLoop(false)
    if (opts && 'compareTo' in opts) setPrevious(opts.compareTo ?? null)
    setPhase('playing')
    const m = moment
    const freeze = m ? m.t : null
    play(0, freeze, () => setPhase(prevPhase => prevPhase === 'playing' ? (opts?.compareTo ? 'compare' : m ? 'moment' : 'holds') : prevPhase))
  }, [moment, play])
  runRef.current = run

  /** Change the basketball. The previous world is kept for comparison. */
  const change = useCallback((patch: Partial<TeamAnswer>, label: string, opts: { autoRun?: boolean; from?: number } = {}) => {
    attackAbort.current?.abort()
    const snap: Snapshot = { config: copy(config), result, moment, label }
    const at = opts.from && opts.from > 0.02 ? Math.round(opts.from / config.assumptions.dt) * config.assumptions.dt : 0
    if (at > 0 && config.interventions.length < 60) {
      // From this moment forward: earlier frames are preserved exactly.
      setConfigRaw(c => ({ ...c, interventions: [...c.interventions.filter(i => !(i.kind === 'answer' && Math.abs(i.at - at) < 1e-6 && Object.keys(i.patch).join() === Object.keys(patch).join())), { id: `ans-${Date.now()}`, at, kind: 'answer', patch }] }))
    } else setConfigRaw(c => ({ ...c, answer: { ...c.answer, ...patch }, interventions: c.interventions.filter(i => i.kind !== 'answer') }))
    setPrevious(prev => prev && opts.autoRun === false ? prev : snap)
    if (opts.autoRun) setPendingRun(true)
  }, [config, result, moment])
  const [pendingRun, setPendingRun] = useState(false)
  useEffect(() => {
    if (!pendingRun) return
    setPendingRun(false)
    setOverride(null); setLoop(false); setPhase('playing')
    const freeze = moment?.t ?? previous?.moment?.t ?? null
    play(0, freeze, () => setPhase(p => p === 'playing' ? 'compare' : p))
  }, [pendingRun, moment, previous, play])

  const applyFix = useCallback((fix: FixOption, label?: string) => {
    setHoverFix(null); setLastFix(fix)
    change(fix.patch, label ?? fix.plain, { autoRun: true })
  }, [change])

  const moveDefender = useCallback((id: PlayerId, target: Point2) => {
    const at = Math.max(0, Math.round(timeRef.current / config.assumptions.dt) * config.assumptions.dt)
    if (at >= duration - 0.1 || config.interventions.length > 60) return
    const snap: Snapshot = { config: copy(config), result, moment, label: 'Before the move' }
    setPrevious(snap)
    setConfigRaw(c => ({ ...c, interventions: [...c.interventions, { id: `mv-${Date.now()}`, at, kind: 'move', playerId: id, target, untilTrigger: 'ball-leaves' }] }))
    setPendingRun(true)
  }, [config, result, moment, duration])

  const replaceConfig = useCallback((next: LabConfig, opts: { keepPrevious?: boolean } = {}) => {
    attackAbort.current?.abort()
    if (!opts.keepPrevious) setPrevious(null)
    setOverride(null); setAttack(null); setAttempts([])
    setConfigRaw(copy(next))
  }, [])

  // -------------------------------------------------- Break Mode
  const breakDefense = useCallback(() => {
    attackAbort.current?.abort()
    const ctrl = new AbortController(); attackAbort.current = ctrl
    pause(); setAttempts([]); setAttackProgress(0); setOverride(null)
    setPhase('break-search')
    const prev = attack
    attackAsync(config, {
      signal: ctrl.signal, budget: 26, previousReport: prev ?? undefined,
      onProgress: p => setAttackProgress(p),
      onCandidate: c => setAttempts(list => [...list.filter(x => x.id !== c.id), c]),
    }).then(report => {
      setAttackPrevious(prev); setAttack(report)
      const w = report.selected.witness
      if (!w) { setPhase('break-held'); return }
      setOverride(report.selected.result as SimulationResult)
      setPhase('break-play'); setLoop(false)
      play(0, w.at, () => setPhase(p => p === 'break-play' ? 'break-moment' : p))
    }).catch(() => { if (!ctrl.signal.aborted) setPhase('moment') })
  }, [attack, config, pause, play])

  /** Adopt the attacking offense so fixes are tested against it. */
  const fixBreak = useCallback(() => {
    if (!attack) return
    const opponent = attack.selected.opponent
    setOverride(null)
    setConfigRaw(c => ({ ...c, opponent: { ...opponent } }))
    setPhase('fix')
  }, [attack])

  const cancelBreak = useCallback(() => { attackAbort.current?.abort(); setOverride(null); setAttempts([]); setPhase(moment ? 'moment' : 'ready'); }, [moment])

  return {
    config, setConfig: setConfigRaw, replaceConfig, phase, setPhase, time, setTime, playing, speed, setSpeed, setLoop, loop,
    timeRef, result, display, analysis, moment, frame, comparison, previous, setPrevious, duration,
    explore, exploreBusy, robust, hoverFix, setHoverFix, lastFix, applyFix, change, moveDefender,
    play, pause, seek, run, runRef,
    attack, attackPrevious, attempts, attackProgress, breakDefense, fixBreak, cancelBreak, override,
  }
}
export type Lab = ReturnType<typeof useLab>
