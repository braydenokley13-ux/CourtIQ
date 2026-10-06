'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { answerById, formatSeconds, term, type AnswerPreset, type Voice } from '@/lib/defense-lab/corpus'
import { divergence } from '@/lib/defense-lab/explore'
import { getTagGuide } from '@/lib/defense-lab/tagGuide'
import { HIGH_PNR_PROBLEM, createDefaultConfig } from '@/lib/defense-lab/scenario'
import { frameAt } from '@/lib/defense-lab/simulation'
import { simulateCached } from '@/lib/defense-lab/replayCache'
import { loadSystem, persistSystem, programVoice, saveToSystem, type ProgramSystem, type SystemEntry } from '@/lib/defense-lab/system'
import type { LabConfig, PlayerId, SimulationResult, ThreatId } from '@/lib/defense-lab/types'
import CourtWorld from './world/CourtWorld'
import type { CameraMode, Lens, Mark, WorldScene, WorldStats } from './world/types'
import PerfHud from './PerfHud'
import { BenchOverlay, useBench } from './bench'
import type { WorldRuntime } from './world/WorldRuntime'
import { LENSES, divergenceLabels, divergenceMarks, lensMarks, momentMarks, whyMarks } from './lenses'
import { UI_CLOCK_MS, useLab } from './useLab'
import Entry, { type EntryChoice } from './Entry'
import { BreakBar, BreakHeldPanel, BreakMomentPanel, ComparePanel, FixPanel, HoldsPanel, MomentPanel } from './Panels'
import CoachCard from './CoachCard'
import SaveSheet, { type SaveInput } from './SaveSheet'
import OurSystem from './OurSystem'
import Library from './Library'
import { DEFENDER_ORDER, checkpointsFor, coverageName, jobSentence, primaryJob, threatShort, who } from './basketball'
import s from './courtiq.module.css'

type Tab = 'lab' | 'system' | 'teach' | 'library'
const SITUATION_ID = 'high-pnr-middle'
type TeachState = { entry: SystemEntry | null; config: LabConfig; player: PlayerId | null; view: 'team' | 'player' | 'overhead'; step: number }

export default function CourtIQApp() {
  const lab = useLab()
  const [tab, setTab] = useState<Tab>('lab')
  const [entered, setEntered] = useState(false)
  const [preview, setPreview] = useState<SimulationResult | null>(null)
  const [system, setSystemState] = useState<ProgramSystem>(() => ({ schema: 1, program: 'Our program', register: 'plain', terms: {}, entries: [] }))
  const [lens, setLens] = useState<Lens>('normal')
  const [why, setWhy] = useState(false)
  const [camera, setCamera] = useState<CameraMode>('director')
  const [selected, setSelected] = useState<PlayerId | null>(null)
  const [hover, setHover] = useState<PlayerId | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [presetIds, setPresetIds] = useState<string[]>(['drop', 'deep-tag'])
  const [stats, setStats] = useState<WorldStats | null>(null)
  const [teach, setTeach] = useState<TeachState | null>(null)
  const runtime = useRef<WorldRuntime | null>(null)
  const [debug, setDebug] = useState(false)
  const debugRef = useRef(false); debugRef.current = debug
  const [benchOn, setBenchOn] = useState(false)
  useEffect(() => { const q = new URLSearchParams(window.location.search); setDebug(q.has('debug')); setBenchOn(q.has('bench')); const sel = q.get('select'); if (sel && /^[OD][1-5]$/.test(sel)) setSelected(sel as PlayerId) }, [])

  useEffect(() => { setSystemState(loadSystem()) }, [])
  const setSystem = useCallback((next: ProgramSystem) => { setSystemState(next); persistSystem(next) }, [])
  const voice: Voice = useMemo(() => programVoice(system), [system])
  const notify = useCallback((text: string) => { setToast(text); setTimeout(() => setToast(t => t === text ? null : t), 3800) }, [])

  // ------------------------------------------------ ambient world behind entry
  const ambient = !entered && tab === 'lab'
  const ambientResult = preview ?? lab.result
  // The ambient clock is a ref read by the world every frame (WorldScene.live): no React render per frame.
  const ambientT = useRef(0)
  useEffect(() => {
    if (!ambient) return
    let raf = 0, last = 0
    const loop = (now: number) => { const dt = last ? (now - last) / 1000 : 0; last = now; ambientT.current = (ambientT.current + dt * 0.8) % (lab.duration + 0.6); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [ambient, lab.duration])
  useEffect(() => { ambientT.current = 0 }, [preview])

  const enterLab = useCallback((choice: EntryChoice | null) => {
    setEntered(true); setPreview(null)
    if (choice) {
      lab.replaceConfig(choice.config)
      setPresetIds(choice.presetIds)
      const preset = answerById(choice.presetIds[0])
      if (choice.term && preset?.patch.coverage) setSystem({ ...system, terms: { ...system.terms, [preset.patch.coverage]: choice.term } })
    }
    lab.setPhase('ready')
    setTimeout(() => lab.runRef.current(), 450)
  }, [lab, setSystem, system])

  // ------------------------------------------------ teach
  const teachResult = useMemo(() => teach ? simulateCached(teach.config) : null, [teach])
  const teachCheckpoints = useMemo(() => teach && teachResult && teach.player ? checkpointsFor(teachResult.frames, teach.player) : [], [teach, teachResult])
  // Teach clock: ref for the world (every frame), React state at UI_CLOCK_MS cadence + exact at stops.
  const teachTRef = useRef(0)
  const [teachT, setTeachTState] = useState(0)
  const setTeachT = useCallback((t: number) => { teachTRef.current = t; setTeachTState(t) }, [])
  const [teachPlaying, setTeachPlaying] = useState(false)
  useEffect(() => {
    if (!teachPlaying || !teach || !teachResult) return
    let raf = 0, last = 0, uiAt = 0
    const stopAt = teachCheckpoints[teach.step]?.t ?? lab.duration
    const loop = (now: number) => {
      const dt = last ? (now - last) / 1000 : 0; last = now
      const next = teachTRef.current + dt * 0.6
      if (next >= stopAt) { setTeachPlaying(false); setTeachT(stopAt); return }
      teachTRef.current = next
      if (now - uiAt >= UI_CLOCK_MS) { uiAt = now; setTeachTState(next) }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); setTeachTState(teachTRef.current) }
  }, [teachPlaying, teach, teachResult, teachCheckpoints, lab.duration, setTeachT])
  const startTeach = useCallback((entry: SystemEntry | null) => {
    const config = entry ? entry.versions.at(-1)!.config : lab.config
    setTeach({ entry, config, player: null, view: 'team', step: 0 }); setTeachT(0); setTeachPlaying(false); setTab('teach'); setLens('normal'); setSelected(null)
  }, [lab.config, setTeachT])

  // ------------------------------------------------ world scene
  const [viewport, setViewport] = useState({ w: 1440, h: 900 })
  useEffect(() => { const on = () => setViewport({ w: window.innerWidth, h: window.innerHeight }); on(); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on) }, [])
  const panelOpen = ['moment', 'holds', 'fix', 'compare', 'break-moment', 'break-held'].includes(lab.phase) && !lab.playing
  const inBreak = lab.phase.startsWith('break')
  const whyOn = why && lab.phase === 'moment' && !!lab.moment
  const whyView = useMemo(() => whyOn && lab.moment ? whyMarks(lab.moment, lab.result, lab.time, lab.config.assumptions) : null, [whyOn, lab.moment, lab.result, lab.time, lab.config.assumptions])
  const frame = tab === 'teach' && teachResult ? frameAt(teachResult, teachT) : ambient ? frameAt(ambientResult, Math.min(ambientT.current, lab.duration)) : lab.frame
  const tagGuide = useMemo(() => tab === 'lab' && entered && !lab.playing && selected === HIGH_PNR_PROBLEM.roles.lowMan ? getTagGuide(lab.frame, lab.config.answer, HIGH_PNR_PROBLEM, lab.config) : null, [tab, entered, lab.playing, selected, lab.frame, lab.config])

  const hoverFix = lab.phase === 'fix' ? lab.hoverFix : null
  const compareDivergence = useMemo(() => lab.previous ? divergence(lab.previous.result, lab.result) : null, [lab.previous, lab.result])
  const ghostResult = hoverFix ? hoverFix.result : (lab.phase === 'compare' || (lab.previous && lab.phase === 'playing')) ? lab.previous?.result ?? null : null
  const ghost = ghostResult && tab === 'lab' ? frameAt(ghostResult, lab.time) : null

  // Per-frame world clock (see WorldScene.live): the runtime samples this each animation frame while playing.
  const liveSrc = useRef<{ result: SimulationResult; t: () => number; ghost: SimulationResult | null }>({ result: lab.display, t: () => 0, ghost: null })
  liveSrc.current = tab === 'teach' && teachResult ? { result: teachResult, t: () => teachTRef.current, ghost: null }
    : ambient ? { result: ambientResult, t: () => Math.min(ambientT.current, lab.duration), ghost: null }
    : { result: lab.display, t: () => lab.timeRef.current, ghost: tab === 'lab' ? ghostResult : null }
  const live = useMemo(() => ({
    frame: () => frameAt(liveSrc.current.result, liveSrc.current.t()),
    ghost: () => liveSrc.current.ghost ? frameAt(liveSrc.current.ghost, liveSrc.current.t()) : null,
  }), [])

  const marks: Mark[] = useMemo(() => {
    if (tab === 'teach') {
      if (!teach?.player) return []
      const job = primaryJob(frame, teach.player)
      const out: Mark[] = [{ kind: 'ring', id: 't-me', at: teach.player, tone: 'defense', radius: 0.6, pulse: !teachPlaying }]
      if (job) out.push({ kind: 'tether', id: 't-job', from: teach.player, to: job.target, tone: job.kind === 'tag' ? 'warn' : 'good', width: 0.1 }, { kind: 'ring', id: 't-target', at: job.target, tone: job.kind === 'tag' ? 'warn' : 'good', radius: 0.35 })
      return out
    }
    if (ambient) return []
    const out: Mark[] = []
    if (lens !== 'normal') out.push(...lensMarks(lens, frame, lab.config.assumptions, selected, lens === 'ownership' ? frameAt(lab.result, Math.max(0, frame.t - 0.5)) : null))
    if (whyView) out.push(...whyView.marks)
    else if (lab.phase === 'moment' && lab.moment && lens === 'normal') out.push(...momentMarks(lab.moment, frame))
    if (hoverFix) out.push(...divergenceMarks(lab.result, hoverFix.result, lab.time))
    if (lab.phase === 'compare' && lab.previous) {
      out.push(...divergenceMarks(lab.previous.result, lab.result, lab.time))
      for (const w of compareDivergence?.windows ?? []) {
        const before = w.before ? w.before.end - w.before.start : 0, after = w.after ? w.after.end - w.after.start : 0
        if (Math.abs(after - before) < 0.1) continue
        out.push({ kind: 'disc', id: `win-${w.threatId}-${w.playerId}`, center: w.location, radius: 0.9, tone: after > before ? 'threat' : 'good', opacity: 0.4, edge: true })
      }
    }
    if (inBreak) {
      // The defense is attacked: each counter runs as a comet; contained ones grey out,
      // dangerous ones persist, and the winner lands with a flare at the vulnerability.
      for (const a of lab.attempts) {
        if (a.points.length < 2) continue
        const broke = a.verdict !== 'held'
        out.push({ kind: 'comet', id: `atk-${a.id}`, points: a.points, outcome: broke ? 'exposed' : 'held', selected: a.selected, run: a.selected ? 820 : 620 })
      }
      const w = lab.attack?.selected.witness
      if (w && (lab.phase === 'break-moment')) {
        out.push({ kind: 'flare', id: 'atk-flare', at: w.playerId, tone: 'attack', radius: 1.5, duration: 1100 })
        out.push({ kind: 'ring', id: 'atk-open', at: w.playerId, tone: 'attack', radius: 0.7, pulse: true })
        out.push({ kind: 'tether', id: 'atk-snap', from: w.limitingDefenderId, to: w.playerId, tone: 'threat', y: 1.15, sag: 0.25, width: 0.06, fray: true, opacity: 0.9 })
        out.push({ kind: 'path', id: 'atk-late', points: [w.defenderPosition, w.target], tone: 'warn', width: 0.09, arrow: true, dashed: true })
      }
    }
    return out
  }, [tab, teach, frame, teachPlaying, ambient, lens, lab.phase, lab.moment, lab.config.assumptions, selected, hoverFix, lab.result, lab.time, lab.previous, inBreak, lab.attempts, lab.attack, compareDivergence, whyView])

  const focus: PlayerId[] = useMemo(() => {
    if (tab === 'teach' && teach?.player) { const j = primaryJob(frame, teach.player); return [teach.player, ...(j ? [j.offensivePlayerId] : []), 'O1', 'O5'] }
    if (lab.phase === 'moment' && lab.moment) return lab.moment.involved
    if (lab.phase === 'break-moment' && lab.attack?.selected.witness) { const w = lab.attack.selected.witness; return [...new Set([w.playerId, w.limitingDefenderId, lab.frame.ball.owner ?? 'O1'])] }
    if (lab.phase === 'break-search') return lab.frame.players.map(p => p.id)
    return []
  }, [tab, teach, frame, lab.phase, lab.moment, lab.attack])

  const scene: WorldScene = useMemo(() => ({
    frame, ghost, marks, lens: tab === 'teach' ? 'normal' : whyOn ? 'space' : lens, focus,
    camera: tab === 'teach' ? (teach?.view === 'player' && teach.player ? 'player' : teach?.view === 'overhead' ? 'overhead' : 'director') : camera,
    pov: tab === 'teach' ? teach?.player : selected, selectedId: selected, hoverId: hover,
    highlight: tab === 'teach' && teach?.player ? [teach.player, ...(primaryJob(frame, teach.player) ? [primaryJob(frame, teach.player)!.offensivePlayerId] : []), frame.ball.owner ?? 'O1'] : null,
    playing: tab === 'teach' ? teachPlaying : ambient || lab.playing, live, editable: tab === 'lab' && entered && !inBreak, tagGuide,
    rig: lab.phase === 'break-search' ? { azimuth: Math.PI + 0.28, elevation: 0.3, fov: 34, minDistance: 8 } : null,
    impact: lab.phase === 'break-moment' ? lab.attack?.selected.witness?.at ?? 1 : undefined,
    inset: ambient ? { left: Math.min(640, viewport.w * 0.45), top: 60 } : tab === 'lab' && entered && viewport.w > 820 ? { right: panelOpen ? 430 : 0, left: selected && !lab.playing && !inBreak ? 350 : 0, top: 150, bottom: 80 } : { top: 120, bottom: 150 },
  }), [viewport, panelOpen, frame, ghost, marks, lens, focus, tab, teach, camera, selected, hover, teachPlaying, ambient, lab.playing, entered, inBreak, tagGuide, lab.phase, lab.attack, live])

  // ------------------------------------------------ actions
  const ruleFired = useMemo(() => {
    const out: Partial<Record<'roller-depth' | 'lift-rise', number | null>> = {}
    for (const rule of lab.config.answer.coachRules ?? []) {
      const id = `coach-${rule.kind}`
      out[rule.kind] = lab.result.frames.find(f => f.responsibilities.some(r => r.sourceRuleId === id))?.t ?? null
    }
    return out
  }, [lab.config.answer.coachRules, lab.result])
  const [editFrom, setEditFrom] = useState<'start' | 'now'>('start')
  const change = useCallback((patch: Parameters<typeof lab.change>[0], label: string) => {
    lab.change(patch, label, { autoRun: false, from: editFrom === 'now' ? lab.time : 0 })
    if (lab.phase === 'moment' || lab.phase === 'holds' || lab.phase === 'fix') lab.setPhase('compare')
  }, [lab, editFrom])
  const accepts = useMemo(() => lab.analysis.windows.filter(w => w.duration >= 0.1).slice(0, 4).map(w => ({ threatId: w.id as ThreatId, seconds: Math.round(w.duration * 100) / 100 })), [lab.analysis])
  const knownBreaks = useMemo(() => {
    const w = lab.attack?.selected.witness
    return w ? [{ label: lab.attack!.selected.changes.map(c => c.label).join(', ') || 'Their base offense', threatId: w.threatId, seconds: Math.round((w.interval.end - w.interval.start) * 100) / 100 }] : []
  }, [lab.attack])
  const defaultName = system.terms[lab.config.answer.coverage] ?? `${coverageName(lab.config.answer, { register: 'coach' })} vs high P&R`
  const save = useCallback((input: SaveInput, thenTeach: boolean) => {
    const { system: next, entry, version } = saveToSystem(system, { name: input.name, situationId: SITUATION_ID, scope: input.scope, when: input.when, presetIds, config: lab.config, note: input.note, accepts, knownBreaks, teachAt: lab.moment?.t })
    setSystem(next); setSaving(false)
    notify(`“${entry.name}” saved to Our System — v${version.v}`)
    if (thenTeach) startTeach(entry)
  }, [system, presetIds, lab.config, lab.moment, accepts, knownBreaks, setSystem, notify, startTeach])

  const openEntry = useCallback((entry: SystemEntry, v?: number) => {
    const version = entry.versions.find(x => x.v === v) ?? entry.versions.at(-1)!
    lab.replaceConfig(version.config); setEntered(true); setTab('lab'); lab.setPhase('ready'); setTimeout(() => lab.runRef.current(), 300)
  }, [lab])
  const tryPreset = useCallback((preset: AnswerPreset) => {
    const base = createDefaultConfig()
    lab.replaceConfig({ ...base, answer: { ...base.answer, ...preset.patch } }); setPresetIds([preset.id]); setEntered(true); setTab('lab'); lab.setPhase('ready'); setTimeout(() => lab.runRef.current(), 300)
  }, [lab])

  // Keyboard: space plays/pauses, arrows scrub.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(t.tagName) || tab !== 'lab' || !entered) return
      if (e.code === 'Space') { e.preventDefault(); if (lab.playing) lab.pause(); else lab.play(lab.time >= lab.duration - 0.02 ? 0 : null, null) }
      if (e.key === 'ArrowRight') lab.seek(lab.time + 0.1)
      if (e.key === 'ArrowLeft') lab.seek(lab.time - 0.1)
      if (e.key === 'Escape') { setSelected(null); setLens('normal') }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [lab, tab, entered])

  // ------------------------------------------------ labels pinned to the court
  const labels = useMemo(() => {
    const out: { anchor: string; text: string; tone: string; lift?: number }[] = []
    if (tab === 'teach') {
      if (teach?.player) out.push({ anchor: teach.player, text: teach.entry ? `You · ${who(teach.player, voice)}` : who(teach.player, voice), tone: s.tagDef })
      return out
    }
    if (ambient) return out
    if (whyView) for (const l of whyView.labels) out.push({ anchor: l.anchor, text: l.text, tone: l.kind === 'reach' ? s.tagDef : l.kind === 'help' ? s.tagWarn : '', lift: l.kind === 'pass' ? 0.4 : 0.1 })
    if (lab.phase === 'moment' && lab.moment && lens === 'normal') {
      const m = lab.moment
      out.push({ anchor: m.receiverId, text: `Open ${formatSeconds(m.openFor)}`, tone: s.tagThreat })
      if (m.bestDefenderId) out.push({ anchor: m.bestDefenderId, text: m.defenderNeeds != null ? `Needs ${formatSeconds(m.defenderNeeds)}` : 'Late', tone: s.tagWarn })
      if (m.pulledDefenderId && m.pulledDefenderId !== m.bestDefenderId) out.push({ anchor: m.pulledDefenderId, text: voice.register === 'plain' ? 'Helping here' : 'Tagging', tone: s.tagDef })
    }
    if (lab.phase === 'break-moment' && lab.attack?.selected.witness) {
      const w = lab.attack.selected.witness
      out.push({ anchor: w.playerId, text: `Open ${formatSeconds(w.interval.end - w.interval.start)}`, tone: s.tagThreat })
      out.push({ anchor: w.limitingDefenderId, text: `Needs ${formatSeconds(w.arrivalSeconds)}`, tone: s.tagWarn })
    }
    if (lab.phase === 'compare' && compareDivergence) {
      for (const w of compareDivergence.windows) {
        const before = w.before ? w.before.end - w.before.start : 0, after = w.after ? w.after.end - w.after.start : 0
        if (Math.abs(after - before) < 0.1) continue
        out.push({ anchor: `pt:${w.location.x},${w.location.z}`, text: `${threatShort(w.threatId, voice)} ${after > before ? 'opened' : 'closed'} ${before.toFixed(1)}→${after.toFixed(1)} s`, tone: after > before ? s.tagThreat : s.tagGood, lift: 1.9 })
      }
    }
    if (hoverFix) for (const l of divergenceLabels(lab.result, hoverFix.result, lab.time)) out.push({ ...l, tone: s.tagDef })
    else if (lab.phase === 'compare' && lab.previous) for (const l of divergenceLabels(lab.previous.result, lab.result, lab.time)) out.push({ ...l, tone: s.tagDef })
    if (selected && !out.some(l => l.anchor === selected)) out.push({ anchor: selected, text: who(selected, voice), tone: s.tagDef })
    if (hover && hover !== selected && !out.some(l => l.anchor === hover)) out.push({ anchor: hover, text: who(hover, voice), tone: '' })
    return out
  }, [tab, teach, voice, ambient, lab.phase, lab.moment, lens, lab.attack, compareDivergence, selected, hover, whyView, hoverFix, lab.previous, lab.result, lab.time])

  // ------------------------------------------------ ?bench (scripts/perf/bench.mjs and on-device checks)
  const bench = useBench(benchOn, { lab, runtime, enter: () => enterLab(null), setLens })

  // ------------------------------------------------ render
  const vignette = ambient ? s.vignetteEntry : inBreak ? s.vignetteAttack : tab === 'teach' ? s.vignetteTeach : ''
  const moment = lab.moment
  const checkpoints = [
    ...(lab.result.events.filter(e => e.type === 'screen').slice(0, 1).map(e => ({ t: e.t, label: 'Screen' }))),
    ...(lab.result.events.filter(e => e.type === 'pass').slice(0, 2).map((e, i) => ({ t: e.t, label: i ? 'Pass 2' : 'Pass' }))),
  ].filter((c, i, all) => (!moment || Math.abs(c.t - moment.t) > 0.45) && all.slice(0, i).every(o => Math.abs(o.t - c.t) > 0.45))
  const answerSummary = coverageName(lab.config.answer, voice)

  return (
    <div className={s.app}>
      <div className={s.world}>
        <CourtWorld scene={scene} onRuntime={r => { runtime.current = r }} callbacks={{
          onSelect: id => { if (tab !== 'lab' || !entered) return; setSelected(id); if (id && lab.playing) lab.pause() },
          onHover: id => setHover(id),
          onMove: (id, target) => { lab.moveDefender(id, target); notify(`${who(id, voice)} moves there from ${lab.time.toFixed(1)} s — watch what changes.`) },
          onTagDepth: (depth, final) => { if (final) change({ tagDepth: Math.round(depth * 100) / 100 }, 'Help depth') },
          onCameraMode: m => setCamera(m),
          onStats: st => { if (debugRef.current) setStats(st) },
        }}>
          {labels.map((l, i) => (
            <div key={`${i}-${l.anchor}-${l.text}`} className={s.tag} data-anchor={l.anchor} data-lift={l.lift ?? 0}>
              <div className={`${s.tagInner} ${l.tone}`}>{l.text}</div>
            </div>
          ))}
        </CourtWorld>
      </div>
      <div className={`${s.vignette} ${vignette}`} />

      <header className={s.top}>
        <div className={s.logo}><span className={s.logoMark} />Court<b>IQ</b></div>
        <nav className={s.tabs}>
          {(['lab', 'system', 'teach', 'library'] as Tab[]).map(t => (
            <button key={t} className={`${s.tab} ${tab === t ? s.tabOn : ''}`} onClick={() => { if (t === 'teach') startTeach(teach?.entry ?? system.entries.at(-1) ?? null); else setTab(t) }}>
              {t === 'lab' ? 'Lab' : t === 'system' ? 'Our System' : t === 'teach' ? 'Teach' : 'Library'}
            </button>
          ))}
        </nav>
        <div className={s.topRight}>
          <span className={s.chip} title="Program">{system.program} · {system.entries.length} answers</span>
          <div className={s.voice} role="group" aria-label="Language">
            <button className={system.register === 'plain' ? s.voiceOn : ''} onClick={() => setSystem({ ...system, register: 'plain' })}>Plain</button>
            <button className={system.register === 'coach' ? s.voiceOn : ''} onClick={() => setSystem({ ...system, register: 'coach' })}>Coach</button>
            <button className={system.register === 'program' ? s.voiceOn : ''} title={Object.keys(system.terms).length ? 'Our own words' : 'Name things in Our System → Our words'} onClick={() => setSystem({ ...system, register: 'program' })}>Ours</button>
          </div>
        </div>
      </header>

      {tab === 'lab' && ambient && <Entry voice={voice} onPreview={setPreview} onDone={enterLab} onExplore={() => enterLab(null)} />}

      {tab === 'lab' && entered && <>
        <div className={s.situation}>
          <div className={s.kicker} style={{ marginBottom: 0 }}><i />{voice.register === 'plain' ? 'Ball screen · top of the key' : 'High P&R · middle'}</div>
          <div className={s.sitTitle}>{voice.terms?.[lab.config.answer.coverage] ? `${voice.terms[lab.config.answer.coverage]} ` : ''}{voice.register === 'plain' ? 'vs. a ball screen with a shooter lifting' : 'vs. high P&R → weakside lift'}</div>
          <div className={s.sitMeta}>
            <button className={s.pill} onClick={() => setSelected('D5')}><span className={s.pillDot} />{answerSummary}</button>
            <button className={s.pill} onClick={() => setSelected('D3')}>{voice.register === 'plain' ? 'Helper' : term('low-man', voice)}: {lab.config.answer.tag ? `${Math.round(lab.config.answer.tagDepth * 100)}%` : 'home'}</button>
            <button className={s.pill} onClick={() => setSelected('D4')}>{lab.config.answer.backside === 'x-out' ? (voice.register === 'plain' ? 'Far side swaps' : term('x-out', voice)) : 'Far side stays'}</button>
            <button className={s.pill} onClick={() => { setEntered(false); lab.setPhase('ambient'); lab.pause() }}>Change problem</button>
          </div>
        </div>

        <div className={s.toolbar} role="toolbar" aria-label="How to look at the play">
          <div className={s.toolGroup}>
            <span className={s.toolLabel}>X-Ray</span>
            {LENSES.map(l => <button key={l.id} className={`${s.toolBtn} ${lens === l.id ? s.toolOn : ''}`} aria-pressed={lens === l.id} title={l.idea} onClick={() => { setWhy(false); setLens(l.id) }}>{voice.register === 'plain' ? l.plain : l.coach}</button>)}
          </div>
          <div className={s.toolGroup}>
            <span className={s.toolLabel}>View</span>
            {([['director', 'Follow'], ['overhead', 'Overhead'], ['baseline', 'Baseline'], ['player', 'His eyes'], ['free', 'Free']] as [CameraMode, string][]).map(([id, label]) => (
              <button key={id} className={`${s.toolBtn} ${camera === id ? s.toolOn : ''}`} aria-pressed={camera === id} onClick={() => { if (id === 'player' && !selected) setSelected('D3'); setCamera(id) }}>{label}</button>
            ))}
          </div>
        </div>
        {lens !== 'normal' && <div className={s.lensIdea}>{LENSES.find(l => l.id === lens)!.idea}</div>}

        {selected && !lab.playing && !inBreak && (
          <CoachCard id={selected} frame={lab.frame} config={lab.config} voice={voice} onClose={() => setSelected(null)} editFrom={editFrom} onEditFrom={setEditFrom} time={lab.time} ruleFired={ruleFired}
            onChange={change}
            onOpponent={patch => { lab.setPrevious({ config: lab.config, result: lab.result, moment: lab.moment, label: 'Their change' }); lab.setConfig(c => ({ ...c, opponent: { ...(c.opponent ?? createDefaultConfig().opponent!), ...patch } })) }}
            onAssumption={patch => lab.setConfig(c => ({ ...c, assumptions: { ...c.assumptions, ...patch } }))}
            onCounter={counter => lab.setConfig(c => ({ ...c, counter }))} onConfig={f => lab.setConfig(f)} />
        )}

        {lab.phase === 'moment' && moment && <MomentPanel moment={moment} voice={voice} robust={lab.robust} whyOn={whyOn} fixesReady={!!lab.explore?.fixes.length}
          onWhy={() => { setLens('normal'); setWhy(w => !w) }}
          onFix={() => { setWhy(false); setLens('normal'); lab.setPhase('fix') }} onBreak={lab.breakDefense} onSave={() => setSaving(true)} />}
        {lab.phase === 'holds' && <HoldsPanel voice={voice} onBreak={lab.breakDefense} onSave={() => setSaving(true)} onAgain={() => lab.run()} />}
        {lab.phase === 'fix' && <FixPanel fixes={lab.explore?.fixes ?? []} busy={lab.exploreBusy} voice={voice} onHover={lab.setHoverFix} onPick={lab.applyFix} onClose={() => lab.setPhase(moment ? 'moment' : 'ready')} onKeep={() => setSaving(true)} />}
        {lab.phase === 'compare' && lab.comparison && !lab.playing && <ComparePanel comparison={lab.comparison} voice={voice} label={lab.previous?.label ? `After: ${lab.previous.label}` : 'What changed'}
          onAgain={() => lab.run({ compareTo: lab.previous })} onBreak={lab.breakDefense} onSave={() => setSaving(true)} onMore={() => lab.setPhase('fix')} onClose={() => lab.setPhase(moment ? 'moment' : 'holds')} />}
        {lab.phase === 'break-search' && <BreakBar progress={lab.attackProgress} attempts={lab.attempts} onCancel={lab.cancelBreak} />}
        {lab.phase === 'break-moment' && lab.attack && <BreakMomentPanel report={lab.attack} voice={voice} onFix={lab.fixBreak} onAccept={() => setSaving(true)}
          onReplay={() => { lab.setPhase('break-play'); lab.play(0, lab.attack!.selected.witness!.at, () => lab.setPhase('break-moment')) }} onExit={lab.cancelBreak} />}
        {lab.phase === 'break-held' && lab.attack && <BreakHeldPanel report={lab.attack} onExit={lab.cancelBreak} onSave={() => setSaving(true)} />}

        <div className={s.dock}>
          <button className={s.play} onClick={() => lab.playing ? lab.pause() : lab.play(lab.time >= lab.duration - 0.02 ? 0 : null, null)} aria-label={lab.playing ? 'Pause' : 'Play'}>
            {lab.playing ? <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" /></svg> : <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor" /></svg>}
          </button>
          <div className={s.scrub} onPointerDown={e => {
            const el = e.currentTarget, rect = el.getBoundingClientRect()
            const set = (x: number) => lab.seek((x - rect.left) / rect.width * lab.duration)
            set(e.clientX); el.setPointerCapture(e.pointerId)
            el.onpointermove = ev => set(ev.clientX); el.onpointerup = () => { el.onpointermove = null }
          }} role="slider" aria-label="Possession time" aria-valuemin={0} aria-valuemax={lab.duration} aria-valuenow={lab.time}>
            <div className={s.scrubTrack} />
            <div className={s.scrubFill} style={{ width: `${lab.time / lab.duration * 100}%` }} />
            {checkpoints.map(c => <span key={c.label} className={s.tick} style={{ left: `${c.t / lab.duration * 100}%` }}>{c.label}</span>)}
            {moment && <span className={`${s.tick} ${s.tickMoment}`} style={{ left: `${moment.t / lab.duration * 100}%` }}>Problem</span>}
            <div className={s.scrubHead} style={{ left: `${lab.time / lab.duration * 100}%` }} />
          </div>
          <span className={s.clock}>{lab.time.toFixed(1)} s</span>
          <button className={s.speed} onClick={() => lab.setSpeed(lab.speed === 1 ? 0.5 : lab.speed === 0.5 ? 0.25 : 1)}>{lab.speed}×</button>
          <button className={`${s.dockBtn} ${s.dockPrimary}`} onClick={() => lab.run(lab.previous ? { compareTo: lab.previous } : undefined)}>↻ <span className={s.dockLabel}>Run it</span></button>
          <button className={`${s.dockBtn} ${s.dockAttack}`} onClick={lab.breakDefense} disabled={lab.phase === 'break-search'}>⚡ <span className={s.dockLabel}>Break my defense</span></button>
          <button className={s.dockBtn} onClick={() => setSaving(true)}>＋ <span className={s.dockLabel}>Save</span></button>
        </div>
      </>}

      {tab === 'teach' && teach && <TeachHud teach={teach} setTeach={setTeach} voice={voice} frame={frame} checkpoints={teachCheckpoints} playing={teachPlaying} setPlaying={setTeachPlaying} t={teachT} setT={setTeachT} system={system} onPickEntry={e => startTeach(e)} />}

      {tab === 'system' && <OurSystem system={system} voice={voice} onOpen={openEntry} onTeach={e => startTeach(e)} onSolve={() => { setTab('lab'); setEntered(false); lab.setPhase('ambient') }}
        onTerms={terms => setSystem({ ...system, terms })} onProgram={program => setSystem({ ...system, program })} />}
      {tab === 'library' && <Library voice={voice} onTry={tryPreset} />}

      {saving && <SaveSheet config={lab.config} voice={voice} defaultName={defaultName} accepts={accepts} knownBreaks={knownBreaks}
        existingVersions={(name, scope) => system.entries.find(e => e.scope === scope && e.name.toLowerCase() === name.trim().toLowerCase())?.versions.at(-1)?.v ?? 0}
        onSave={save} onClose={() => setSaving(false)} />}
      {toast && <div className={s.toast} role="status">{toast}</div>}
      {debug && <PerfHud stats={stats} runtime={runtime.current} />}
      {benchOn && <BenchOverlay status={bench.status} result={bench.result} />}
    </div>
  )
}

function TeachHud({ teach, setTeach, voice, frame, checkpoints, playing, setPlaying, t, setT, system, onPickEntry }: {
  teach: TeachState
  setTeach(fn: (t: TeachState | null) => TeachState | null): void; voice: Voice; frame: ReturnType<typeof frameAt>
  checkpoints: { t: number; job: NonNullable<ReturnType<typeof primaryJob>> }[]; playing: boolean; setPlaying(p: boolean): void; t: number; setT(t: number): void
  system: ProgramSystem; onPickEntry(e: SystemEntry | null): void
}) {
  const step = checkpoints[teach.step]
  const atCheckpoint = !!step && Math.abs(t - step.t) < 0.03 && !playing
  const done = !playing && teach.step >= checkpoints.length && t > 0
  return <>
    <div className={s.situation}>
      <div className={s.kicker} style={{ marginBottom: 0 }}><i />Teach</div>
      <div className={s.sitTitle}>{teach.entry ? `${teach.entry.name} — v${teach.entry.versions.at(-1)!.v}` : 'Current Lab answer (not saved)'}</div>
      <div className={s.sitMeta}>
        {system.entries.map(e => <button key={e.id} className={s.pill} onClick={() => onPickEntry(e)}>{e.name}</button>)}
      </div>
    </div>
    <div className={s.teachBar}>
      <span className={s.railLabel} style={{ alignSelf: 'center' }}>I’m teaching</span>
      {DEFENDER_ORDER.map(id => <button key={id} className={`${s.segBtn} ${teach.player === id ? s.segOn : ''}`} onClick={() => { setTeach(x => x && { ...x, player: id, step: 0 }); setT(0); setPlaying(false) }}>{who(id, voice)}</button>)}
      <span style={{ width: 10 }} />
      {(['team', 'player', 'overhead'] as const).map(v => <button key={v} className={`${s.segBtn} ${teach.view === v ? s.segOn : ''}`} onClick={() => setTeach(x => x && { ...x, view: v })}>{v === 'team' ? 'Team view' : v === 'player' ? 'His eyes' : 'Overhead'}</button>)}
    </div>
    {!teach.player ? (
      <div className={s.coachLine}><small>Pick a player</small><div>Who are you teaching? CourtIQ shows only his job, from his point of view.</div></div>
    ) : done ? (
      <div className={s.coachLine}><small>That’s the possession</small><div>{checkpoints.length} reads for {who(teach.player, voice).toLowerCase()}.</div>
        <div className={s.row} style={{ justifyContent: 'center', marginTop: 12 }}><button className={`${s.btn} ${s.btnPrimary}`} onClick={() => { setTeach(x => x && { ...x, step: 0 }); setT(0); setPlaying(true) }}>Watch again</button></div></div>
    ) : (
      <div className={s.coachLine}>
        <small>{atCheckpoint ? `Read ${teach.step + 1} of ${checkpoints.length} · ${step.t.toFixed(1)} s` : playing ? 'Watching…' : 'Ready'}</small>
        <div>{atCheckpoint ? jobSentence(step.job, voice) : jobSentence(primaryJob(frame, teach.player), voice)}</div>
        <div className={s.row} style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => { if (atCheckpoint) setTeach(x => x && { ...x, step: x.step + 1 }); setPlaying(true) }}>{t === 0 ? 'Start' : 'Next read →'}</button>
          <button className={s.btn} onClick={() => { setT(0); setTeach(x => x && { ...x, step: 0 }); setPlaying(false) }}>Restart</button>
        </div>
      </div>
    )}
  </>
}
