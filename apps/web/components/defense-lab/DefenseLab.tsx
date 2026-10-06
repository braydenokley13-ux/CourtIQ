'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { analyze, compare, isThreatOpen } from '@/lib/defense-lab/analytics'
import { attackAsync, type AttackPreview, type AttackReport } from '@/lib/defense-lab/attack'
import { COACHING_TEMPLATES, interpretCoaching } from '@/lib/defense-lab/coaching'
import { coachRuleSentence } from '@/lib/defense-lab/coachRules'
import { getTagGuide } from '@/lib/defense-lab/tagGuide'
import { DEFAULT_OPPONENT } from '@/lib/defense-lab/offensivePolicy'
import type { LabCandidatePath, LabProjectedAnchors } from './LabWorld'
import BreakMode, { type BreakPhase } from './BreakMode'
import { stressAsync } from '@/lib/defense-lab/stress'
import type { StressReport } from '@/lib/defense-lab/stress'
import { MAX_ANSWER_FILE_BYTES, createAnswer, deleteAnswer, exportAnswers, importAnswers, loadAnswers, saveAnswer } from '@/lib/defense-lab/answers'
import type { SavedTeamAnswer } from '@/lib/defense-lab/answers'
import { COUNTERS, COVERAGES, DEFAULT_PROBLEM, ROLE_LABELS, createDefaultConfig } from '@/lib/defense-lab/scenario'
import { answerAt, frameAt } from '@/lib/defense-lab/simulation'
import { simulateCached as simulate } from '@/lib/defense-lab/replayCache'
import type { CameraId, CoachRule, CounterId, CoverageId, Intervention, LabConfig, PlayerId, Point2, RoleId, SimulationResult, TeamAnswer, XRayLayer } from '@/lib/defense-lab/types'
import s from './DefenseLab.module.css'

const LabWorld = dynamic(() => import('./LabWorld'), { ssr: false, loading: () => <div className={s.loading}>Preparing the court…</div> })
type Drawer = 'rules' | 'offense' | 'player' | null
type Modal = 'save' | 'answers' | 'why' | 'stress' | 'compare' | null
const DEFENDERS: PlayerId[] = ['D1', 'D5', 'D3', 'D4', 'D2']
const STAGE_LABELS: Record<string,string> = {screen:'Two defenders meet the screen', 'tag-and-read':'The low man meets the roller', 'catch-and-read':'The next receiver reads the closeout', release:'A modeled release', finished:'Possession complete'}
const THREAT_LABELS: Record<string, string> = { drive: 'Contain the ball', roll: 'Protect the roller', pop: 'Close the pop', corner: 'Take the weak corner', lift: 'Take the lift', strong: 'Stay with the strong corner' }
const copyConfig = (config: LabConfig): LabConfig => JSON.parse(JSON.stringify(config)) as LabConfig
const cls = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ')
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
function placeCourtCard(anchors: LabProjectedAnchors | null, anchor: LabProjectedAnchors['selected'], width: number, height: number) {
  if (!anchors || !anchor) return {x:24,y:130}
  const bottom = Math.max(120,anchors.height-165-height)
  const positions = [
    {x:anchor.x+70,y:anchor.y-90},{x:anchor.x-width-70,y:anchor.y-90},
    {x:24,y:125},{x:anchors.width-width-24,y:125},
    {x:24,y:bottom},{x:anchors.width-width-24,y:bottom},{x:(anchors.width-width)/2,y:bottom},
  ].map(p => ({x:clamp(p.x,16,anchors.width-width-16),y:clamp(p.y,120,bottom)}))
  const score = (p:{x:number;y:number}) => {
    let covered = 0
    for (const body of Object.values(anchors.players)) {
      if (!body?.visible) continue
      // Include the visible arm span, rather than treating athletes as narrow pins.
      const halfWidth = Math.max(28,(body.footY-body.y)*.58)
      const overlapX = Math.max(0,Math.min(p.x+width,body.x+halfWidth)-Math.max(p.x,body.x-halfWidth))
      const overlapY = Math.max(0,Math.min(p.y+height,body.footY+12)-Math.max(p.y,body.y-20))
      covered += overlapX*overlapY
    }
    const tag = anchors.tagTarget
    if (tag?.visible) {
      covered += Math.max(0,Math.min(p.x+width,tag.x+170)-Math.max(p.x,tag.x-12))*Math.max(0,Math.min(p.y+height,tag.y+62)-Math.max(p.y,tag.y-12))*2
    }
    return covered+Math.hypot(p.x+width/2-anchor.x,p.y+height/2-anchor.y)*3
  }
  return positions.sort((a,b) => score(a)-score(b))[0]
}
const appendCue = (config: LabConfig, cue: Intervention): LabConfig => {
  const existing = config.interventions.find(i => i.at === cue.at && i.kind === cue.kind && (i.kind !== 'move' || cue.kind !== 'move' || i.playerId === cue.playerId))
  if (existing) return { ...config, interventions: config.interventions.map(i => i.id !== existing.id ? i : i.kind === 'answer' && cue.kind === 'answer' ? { ...i, patch: { ...i.patch, ...cue.patch } } : { ...cue, id: i.id }) }
  return { ...config, interventions: [...config.interventions, cue].sort((a, b) => a.at - b.at) }
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    play: <path d="m8 5 11 7-11 7V5Z" />,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    arrow: <><path d="M5 12h14m-5-5 5 5-5 5" /></>,
    reset: <><path d="M4 10a8 8 0 1 1 2 8M4 4v6h6" /></>,
    step: <><path d="m7 6 8 6-8 6V6Zm11 0v12" /></>,
    back: <><path d="m17 6-8 6 8 6V6ZM6 6v12" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    xray: <><path d="M4 7V4h3m10 0h3v3M4 17v3h3m10 0h3v-3" /><circle cx="12" cy="12" r="4" /><path d="M12 6v12M6 12h12" /></>,
    compare: <><path d="M12 3v18M3 8h6v10H3V8Zm12-2h6v10h-6V6Z" /></>,
    save: <><path d="M5 4h12l3 3v13H4V4h1Zm3 0v6h8V4M8 20v-6h8v6" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" /><circle cx="15" cy="17" r="2" /></>,
    teach: <><path d="m3 8 9-4 9 4-9 4-9-4Zm3 2v7c4 3 8 3 12 0v-7m3-2v8" /></>,
    stress: <><path d="m13 3-8 11h6l-1 7 9-12h-6l1-6Z" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    folder: <path d="M3 7V5h7l2 3h9v12H3V7Z" />,
    download: <><path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4" /></>,
    orbit: <><ellipse cx="12" cy="12" rx="9" ry="5" transform="rotate(-25 12 12)" /><circle cx="12" cy="12" r="2" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.arrow}</svg>
}

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null
    const el = ref.current
    el?.querySelector<HTMLElement>('button,input,select')?.focus()
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      if (e.key !== 'Tab' || !el) return
      const elements = Array.from(el.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,[tabindex="0"]')).filter(node => node.getClientRects().length)
      const first = elements[0], last = elements[elements.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', handle)
    return () => { window.removeEventListener('keydown', handle); prior?.focus() }
  }, [onClose])
  return <div className={s.modalBackdrop} onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}><div ref={ref} className={s.modal} role="dialog" aria-modal="true" aria-labelledby="lab-dialog-title"><div className={s.modalHeader}><div><p className={s.deckKicker}>COURTIQ / DEFENSE LAB</p><h2 id="lab-dialog-title">{title}</h2></div><button className={s.closeButton} onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button></div><div className={s.modalBody}>{children}</div></div></div>
}

export default function DefenseLab() {
  const [config, setConfig] = useState<LabConfig>(createDefaultConfig)
  const [time, updateTime] = useState(0)
  const timeRef = useRef(0)
  const setTime = useCallback((next: number) => { timeRef.current = next; updateTime(next) }, [])
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [hasRun, setHasRun] = useState(false)
  const [baseline, setBaseline] = useState<SimulationResult | null>(null)
  const [ghost, setGhost] = useState(false)
  const [selectedId, setSelectedId] = useState<PlayerId | null>(null)
  const [camera, setCamera] = useState<CameraId>('broadcast')
  const [xray, setXray] = useState<XRayLayer>('off')
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [modal, setModal] = useState<Modal>(null)
  const [answers, setAnswers] = useState<SavedTeamAnswer[]>([])
  const [savedRevision, setSavedRevision] = useState<SavedTeamAnswer | null>(null)
  const [teach, setTeach] = useState(false)
  const [saveName, setSaveName] = useState('Our drop vs weakside lift')
  const [teamTerm, setTeamTerm] = useState('Low man')
  const [message, setMessage] = useState('')
  const [stressReport, setStressReport] = useState<StressReport | null>(null)
  const [stressBusy, setStressBusy] = useState(false)
  const [quizAnswer, setQuizAnswer] = useState<string | null>(null)
  const [anchors, setAnchors] = useState<LabProjectedAnchors | null>(null)
  const [attackReport, setAttackReport] = useState<AttackReport | null>(null)
  const [attackStale, setAttackStale] = useState(false)
  const [attackBusy, setAttackBusy] = useState(false)
  const [attackProgress, setAttackProgress] = useState(0)
  const [showAttack, setShowAttack] = useState(false)
  const [breakPhase, setBreakPhase] = useState<BreakPhase | null>(null)
  const [attackCandidates, setAttackCandidates] = useState<AttackPreview[]>([])
  const breakStop = useRef<number | null>(null)
  const breakAutoFreeze = useRef(false)
  const [coachingText, setCoachingText] = useState('Tag until the big recovers, then get back to the corner.')
  const [cueRelease, setCueRelease] = useState<'timed' | 'ball-leaves' | 'big-secured'>('timed')
  const coachCardRef = useRef<HTMLElement>(null)
  const insightCardRef = useRef<HTMLDivElement>(null)
  const [coachCardHeight, setCoachCardHeight] = useState(400)
  const [insightCardSize, setInsightCardSize] = useState({width:290,height:225})
  const [breakCaptionHeight, setBreakCaptionHeight] = useState(280)
  const measureBreakCaption = useCallback((height:number) => setBreakCaptionHeight(height),[])
  const [showQuiz, setShowQuiz] = useState(false)
  const attackAbort = useRef<AbortController | null>(null)
  const [editFrom, setEditFrom] = useState<'moment' | 'start'>('moment')
  const labDraft = useRef<LabConfig | null>(null)
  const teachAfterSave = useRef(false)
  const pauseAt = useRef<number | null>(null)
  const stressAbort = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRun = useMemo(() => simulate(config), [config])
  const runRef = useRef(activeRun)
  runRef.current = activeRun
  const frame = useMemo(() => frameAt(activeRun, time), [activeRun, time])
  const answer = useMemo(() => answerAt(config, time), [config, time])
  const coachingPreview = useMemo(() => interpretCoaching(coachingText, answer), [coachingText, answer])
  const analysis = useMemo(() => analyze(activeRun), [activeRun])
  const comparison = useMemo(() => baseline ? compare(baseline, activeRun) : null, [baseline, activeRun])
  const selected = frame.players.find(p => p.id === selectedId)
  const responsibilities = frame.responsibilities.filter(r => r.defenderId === selectedId)
  const selectedRole = selected?.role ?? 'low-man'
  const primaryJob = [...responsibilities].sort((a, b) => b.priority - a.priority)[0]
  const currentJob = primaryJob?.kind === 'split' ? 'Split the lift and corner' : primaryJob ? THREAT_LABELS[primaryJob.threatId] ?? primaryJob.kind : 'Stay connected to your assignment'
  const nextJob = selectedRole === 'low-man' && primaryJob?.kind === 'tag'
    ? primaryJob.sourceRuleId === 'coach-roller-depth' ? 'When the handler releases, resume our base answer.' : answer.backside === 'stay' ? (answer.recovery === 'roller-secured' ? 'When the big secures the roller' : 'When the ball leaves') + ', recover to your corner.'
      : answer.rotationTiming === 'early' && answer.tagDepth > .45 ? 'Early X-out takes the corner during your tag. On release, read the pass: corner → lift; other pass → corner.'
      : 'After release: corner pass → take the lift; other pass → recover to your corner.'
    : null
  const projectAnchors = useCallback((next: LabProjectedAnchors) => setAnchors(next), [])
  const checkpoints = useMemo(() => {
    const screen = activeRun.events.find(e => e.type === 'screen')
    const tag = activeRun.events.find(e => e.type === 'tag')
    const pass = activeRun.events.find(e => e.type === 'pass')
    return [
      { label: 'Screen', t: Math.min(config.assumptions.duration, screen?.t ?? 0.5) },
      { label: 'Tag & read', t: Math.min(config.assumptions.duration, tag?.t ?? DEFAULT_PROBLEM.stressAt) },
      { label: 'Skip & recover', t: Math.min(config.assumptions.duration, pass ? pass.t + 0.5 : 2.8) },
    ]
  }, [activeRun, config.assumptions.duration])
  const counter = COUNTERS.find(c => c.id === config.counter)!
  useEffect(() => {
    const card = coachCardRef.current
    if (!card) return
    const observer = new ResizeObserver(entries => setCoachCardHeight(entries[0]?.contentRect.height ? entries[0].contentRect.height + 32 : 400))
    observer.observe(card)
    return () => observer.disconnect()
  }, [drawer, selectedId, teach])
  useEffect(() => {
    const card = insightCardRef.current
    if (!card) return
    const observer = new ResizeObserver(() => {
      const {width,height} = card.getBoundingClientRect()
      setInsightCardSize(prior => prior.width === width && prior.height === height ? prior : {width,height})
    })
    observer.observe(card)
    return () => observer.disconnect()
  }, [hasRun,teach,showAttack,drawer,ghost])
  const closeModal = useCallback(() => { teachAfterSave.current = false; setModal(null) }, [])
  const notify = useCallback((text: string) => {
    setMessage(text)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setMessage(''), 5500)
  }, [])

  useEffect(() => {
    const loaded = loadAnswers()
    setAnswers(loaded.answers)
    if (loaded.error) notify(loaded.error)
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); stressAbort.current?.abort(); attackAbort.current?.abort() }
  }, [notify])
  useEffect(() => {
    if (!playing) return
    let raf = 0, last = 0
    const tick = (now: number) => {
      if (!last) last = now
      const dt = Math.max(0, (now - last) / 1000)
      last = now
      const current = timeRef.current
      const next = current + dt * speed
      const checkpoint = pauseAt.current
      const stopping = checkpoint !== null && current < checkpoint && next >= checkpoint
      if (stopping || next >= config.assumptions.duration) {
        setTime(stopping ? checkpoint! : config.assumptions.duration)
        pauseAt.current = null
        setPlaying(false)
        return
      }
      setTime(next)
      raf = requestAnimationFrame(tick)
    }
    const pauseHidden = () => { if (document.hidden) setPlaying(false) }
    document.addEventListener('visibilitychange', pauseHidden)
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', pauseHidden) }
  }, [playing, speed, config.assumptions.duration, setTime])

  const seek = useCallback((t: number) => { setTime(clamp(t, 0, config.assumptions.duration)); setPlaying(false); pauseAt.current = null; breakAutoFreeze.current = false; setQuizAnswer(null); if (breakPhase === 'frozen' || breakPhase === 'playing') setBreakPhase('playing') }, [config.assumptions.duration, setTime, breakPhase])
  const togglePlay = useCallback(() => {
    const inBreakReplay = breakPhase === 'playing' || breakPhase === 'frozen'
    if (inBreakReplay) setBreakPhase('playing')
    breakAutoFreeze.current = inBreakReplay && breakStop.current !== null && time < breakStop.current
    pauseAt.current = breakAutoFreeze.current ? breakStop.current : null
    setHasRun(true)
    if (time >= config.assumptions.duration - 0.02) setTime(0)
    setPlaying(p => !p)
  }, [time, config.assumptions.duration, setTime, breakPhase])
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.key === 'Escape' && !modal) { setDrawer(null); return }
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName) || modal) return
      if (event.code === 'Space') { event.preventDefault(); togglePlay() }
      if (event.key === 'ArrowRight') { event.preventDefault(); seek(time + config.assumptions.dt) }
      if (event.key === 'ArrowLeft') { event.preventDefault(); seek(time - config.assumptions.dt) }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [togglePlay, seek, time, config.assumptions.dt, modal])

  function rememberBefore() {
    if (hasRun && !baseline) { setBaseline(runRef.current); setGhost(true) }
    stressAbort.current?.abort(); setStressBusy(false); setStressReport(null)
    attackAbort.current?.abort(); setAttackBusy(false); setAttackStale(true)
    if (showAttack && (breakPhase === 'frozen' || breakPhase === 'fixing')) setBreakPhase('fixing')
    else { setShowAttack(false); setBreakPhase(null) }
  }
  function changeAnswer(patch: Partial<TeamAnswer>) {
    if (config.interventions.length >= 63) { notify('This replay has reached its change limit. Start a new setup to keep experimenting.'); return }
    rememberBefore(); setPlaying(false)
    const at = hasRun && editFrom === 'moment' && time > 0.025 ? Math.min(config.assumptions.duration, Math.round(time / config.assumptions.dt) * config.assumptions.dt) : 0
    setConfig(c => at > 0 ? appendCue(c, { id: crypto.randomUUID(), at, kind: 'answer', patch }) : { ...c, answer: { ...answerAt(c, time), ...patch }, interventions: c.interventions.filter(i => i.kind === 'opponent') })
    if (at === 0 && hasRun) setTime(0)
    if (at > 0) notify(`Rule changed from ${at.toFixed(2)} s. Earlier movement is preserved.`)
  }
  function changeCoachRule(kind: CoachRule['kind'], rule: CoachRule | null) {
    const retained = (answer.coachRules ?? []).filter(r => r.kind !== kind)
    changeAnswer({coachRules:rule ? [...retained,rule] : retained})
  }
  function chooseCoverage(id: CoverageId) {
    const presets: Partial<Record<CoverageId, Partial<TeamAnswer>>> = {
      drop: { poa: 'over', bigDepth: 3.2, tag: true, backside: 'x-out' },
      switch: { poa: 'over', tag: false, backside: 'stay' },
      blitz: { poa: 'over', tag: true, tagDepth: 0.85, backside: 'x-out' },
      hedge: { poa: 'over', tag: true, backside: 'x-out' },
      ice: { poa: 'over', tag: true, backside: 'x-out' },
    }
    changeAnswer({ ...presets[id], coverage: id })
    if (id === 'custom') setDrawer('rules')
  }
  function changeCounter(id: CounterId) {
    attackAbort.current?.abort(); setAttackBusy(false); setAttackReport(null); setShowAttack(false); setAttackStale(false); setBreakPhase(null); setAttackCandidates([])
    stressAbort.current?.abort(); setStressReport(null); setStressBusy(false)
    setBaseline(null); setGhost(false); setPlaying(false); setTime(0)
    setConfig(c => ({ ...c, counter: id }))
    setDrawer(null)
    notify('A new offensive test starts from the beginning, against the same answer and assumptions.')
  }
  function movePlayer(id: PlayerId, target: Point2, at: number) {
    if (teach || playing || !id.startsWith('D')) return
    if (config.interventions.length >= 63) { notify('This replay has reached its change limit. Start a new setup to keep experimenting.'); return }
    const snapped = Math.min(config.assumptions.duration, Math.round(at / config.assumptions.dt) * config.assumptions.dt)
    if (snapped >= config.assumptions.duration) { notify('Rewind to issue a movement cue before the replay ends.'); return }
    rememberBefore()
    setConfig(c => appendCue(c, { id: crypto.randomUUID(), at: snapped, kind: 'move', playerId: id, target: { x: clamp(target.x, -7.25, 7.25), z: clamp(target.z, 0.4, 14) }, ...(cueRelease === 'timed' ? { until: Math.min(c.assumptions.duration, snapped + 1.8) } : { untilTrigger: cueRelease }) }))
    setSelectedId(id); setDrawer('player')
    notify(`${id} has a new movement cue from ${snapped.toFixed(2)} s. Run again to reach the target.`)
  }
  function runAnswer() {
    if (showAttack) { attackAbort.current?.abort(); setAttackBusy(false); setShowAttack(false); setBreakPhase(null) }
    setHasRun(true); setTime(0); setPlaying(true)
    const lastCue = config.interventions.reduce((v, i) => Math.max(v, i.at), 0)
    pauseAt.current = Math.min(config.assumptions.duration - 0.1, Math.max(DEFAULT_PROBLEM.stressAt, lastCue + 0.65))
    setDrawer(null)
  }
  function resetExperiment() {
    labDraft.current = null
    attackAbort.current?.abort(); setAttackBusy(false); setAttackReport(null); setShowAttack(false); setAttackStale(false); setBreakPhase(null); setAttackCandidates([])
    setConfig(createDefaultConfig()); setTime(0); setPlaying(false); setHasRun(false); setBaseline(null); setGhost(false); setSelectedId(null); setXray('off'); setDrawer(null); setTeach(false); setSavedRevision(null); setStressReport(null); stressAbort.current?.abort(); setStressBusy(false)
  }
  function beginTeach(record: SavedTeamAnswer) {
    if (!teach) labDraft.current = copyConfig(config)
    stressAbort.current?.abort(); setStressReport(null); setStressBusy(false)
    attackAbort.current?.abort(); setAttackBusy(false); setShowAttack(false); setBreakPhase(null); setAttackCandidates([])
    setSaveName(record.name); setTeamTerm(record.terminology['low-man'] ?? 'Low man')
    const rolePlayer = DEFAULT_PROBLEM.players.find(p => p.role === record.teaching.role)
    setConfig(copyConfig(record.config)); setSavedRevision(record); setTeach(true); setSelectedId(rolePlayer?.id ?? 'D3'); setXray('responsibilities'); setCamera('broadcast'); setTime(record.teaching.checkpointTimes[0] ?? 0.5); setPlaying(false); setDrawer(null); setModal(null); setHasRun(true); setGhost(false); setQuizAnswer(null)
  }
  function leaveTeach() {
    if (!teach) return
    if (labDraft.current) setConfig(labDraft.current)
    labDraft.current = null
    setTeach(false); setTime(0); setPlaying(false); setXray('off'); setQuizAnswer(null)
  }
  function teachLatest() {
    if (savedRevision) { beginTeach(savedRevision); return }
    if (answers[0]) { beginTeach(answers[0]); return }
    teachAfterSave.current = true; setModal('save')
  }
  function saveCurrent() {
    if (!saveName.trim()) return
    try {
    const record = createAnswer({ name: saveName.trim(), config: copyConfig(config), terminology: { 'low-man': teamTerm.trim() || 'Low man' }, teaching: { role: selected?.team === 'defense' ? selectedRole : 'low-man', checkpointTimes: checkpoints.map(p => p.t).sort((a, b) => a - b), cue: selectedRole === 'low-man' ? 'Tag. See the roller and the weakside. Release on your saved team rule.' : 'Read your assigned threat. Move when your responsibility changes.' } })
    const result = saveAnswer(record)
    if (result.error && !result.answers.some(a => a.id === record.id)) { notify(result.error); return }
    setAnswers(result.answers); setSavedRevision(record)
    notify(result.persisted ? 'Answer saved on this device. Export a copy to share or back it up.' : 'Kept in memory. Device storage is unavailable; export your answer before closing.')
    setModal(null)
    if (teachAfterSave.current) { teachAfterSave.current = false; beginTeach(record) }
    } catch (error) { notify(`Answer could not be saved: ${error instanceof Error ? error.message : 'Check its inputs.'}`) }
  }
  function loadRecord(record: SavedTeamAnswer) {
    labDraft.current = null
    attackAbort.current?.abort(); setAttackBusy(false); setAttackReport(null); setAttackStale(false); setShowAttack(false); setBreakPhase(null); setAttackCandidates([])
    stressAbort.current?.abort(); setStressReport(null); setStressBusy(false)
    setConfig(copyConfig(record.config)); setSavedRevision(record); setSaveName(record.name); setTeamTerm(record.terminology['low-man'] ?? 'Low man'); setTime(0); setPlaying(false); setTeach(false); setHasRun(true); setBaseline(null); setGhost(false); setModal(null); notify(`Loaded “${record.name}”.`)
  }
  function downloadAnswers(records = answers) {
    try {
    const blob = new Blob([exportAnswers(records)], { type: 'application/json' })
    const url = URL.createObjectURL(blob), a = document.createElement('a')
    a.href = url; a.download = 'courtiq-team-answers.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { notify(`Export could not finish: ${error instanceof Error ? error.message : 'Try fewer answers.'}`) }
  }
  async function importFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_ANSWER_FILE_BYTES) { notify('This answer file is too large. Import a CourtIQ export under 2 MB.'); return }
    try {
      const result = importAnswers(await file.text())
      setAnswers(result.answers)
      notify(result.error ?? (result.persisted ? 'Answers imported and saved on this device.' : 'Imported in memory. Export before closing to keep them.'))
    } catch { notify('This file could not be imported. Use a CourtIQ answer export.') }
    if (fileRef.current) fileRef.current.value = ''
  }
  async function testCounters() {
    setModal('stress'); setStressBusy(true); setStressReport(null)
    stressAbort.current?.abort()
    const controller = new AbortController(); stressAbort.current = controller
    try {
      const report = await stressAsync(copyConfig(config), { signal: controller.signal, beforeConfig: baseline?.config })
      if (!controller.signal.aborted) setStressReport(report)
    } catch (error) { if (!controller.signal.aborted) notify(`Stress test could not finish: ${error instanceof Error ? error.message : 'Try again.'}`) }
    finally { if (!controller.signal.aborted) setStressBusy(false) }
  }
  function enableAdaptiveOpponent() {
    rememberBefore(); setBaseline(null); setGhost(false); setAttackReport(null); setAttackStale(false); setShowAttack(false); setBreakPhase(null); setAttackCandidates([]); setPlaying(false); setTime(0)
    setConfig(c => ({...c, opponent:{...DEFAULT_OPPONENT}}))
    notify('Adaptive opponent enabled as a new test. Your defensive answer and timed coaching are preserved.')
  }
  function exitBreakMode() {
    attackAbort.current?.abort(); setAttackBusy(false); setShowAttack(false); setBreakPhase(null); setPlaying(false); pauseAt.current = null
  }
  function playAttack(report: AttackReport) {
    const candidate = report.selected
    const executionStop = candidate.result.diagnostics.flightStops?.[0]?.at ?? candidate.result.events.find(e => e.type === 'missed-catch')?.t
    const stop = candidate.witness?.at ?? executionStop ?? candidate.config.assumptions.duration
    breakStop.current = stop; breakAutoFreeze.current = true
    setConfig(copyConfig(candidate.config)); setTime(0); setPlaying(true); pauseAt.current = stop
    setHasRun(true); setSelectedId(null); setDrawer(null); setCamera('broadcast'); setXray('off'); setBreakPhase('playing')
  }
  function fixAttack() {
    setPlaying(false); setEditFrom('start'); setBreakPhase('fixing'); setDrawer('player')
    setSelectedId(attackReport?.selected.witness?.limitingDefenderId ?? 'D3'); setXray('responsibilities')
  }
  useEffect(() => {
    if (breakPhase !== 'playing' || playing || !breakAutoFreeze.current || breakStop.current === null || time + 1e-8 < breakStop.current) return
    breakAutoFreeze.current = false
    setBreakPhase('frozen'); setSelectedId(attackReport?.selected.witness?.limitingDefenderId ?? 'D3'); setXray('windows')
  }, [breakPhase, playing, time, attackReport])
  async function breakDefense() {
    if (!config.opponent) {
      setPlaying(false); setDrawer('offense')
      notify('This saved answer uses the earlier authored opponent. Enable the adaptive opponent to search connected counters.')
      return
    }
    setPlaying(false); setDrawer(null); setShowAttack(true); setBreakPhase('searching'); setAttackCandidates([]); setAttackBusy(true); setAttackProgress(0); setGhost(false); setSelectedId(null); setXray('off')
    attackAbort.current?.abort()
    const controller = new AbortController(); attackAbort.current = controller
    const previous = attackReport ?? undefined
    try {
      const report = await attackAsync(copyConfig(config), {
        signal: controller.signal, previousReport: previous, onProgress: setAttackProgress,
        onCandidate: preview => { if (!controller.signal.aborted) setAttackCandidates(c => [...c.filter(p => p.id !== preview.id), preview].slice(-8)) },
      })
      if (controller.signal.aborted) return
      const candidate = report.selected
      setAttackReport(report); setAttackStale(false); setBreakPhase('selecting')
      setBaseline(report.pairedRetest ? simulate({ ...candidate.config, answer: previous!.selected.config.answer, interventions: [...candidate.config.interventions.filter(i => i.kind !== 'answer' && !(i.kind === 'move' && i.playerId.startsWith('D'))), ...previous!.selected.config.interventions.filter(i => i.kind === 'answer' || i.kind === 'move' && i.playerId.startsWith('D'))].sort((a,b) => a.at-b.at) }) : report.baseline.result)
      // Let the strongest completed branch remain visible before executing it.
      await new Promise<void>(resolve => { const timer = setTimeout(resolve, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : 900); controller.signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once:true }) })
      if (!controller.signal.aborted) playAttack(report)
    } catch (error) { if (!controller.signal.aborted) { setShowAttack(false); setBreakPhase(null); notify('Attack search could not finish: ' + (error instanceof Error ? error.message : 'Try again.')) } }
    finally { if (!controller.signal.aborted) setAttackBusy(false) }
  }
  function applyCoaching() {
    if (!coachingPreview.supported || !coachingPreview.patch) return
    changeAnswer(coachingPreview.patch)
    notify('Coaching cue applied. ' + coachingPreview.explanation)
  }
  const tagGuide = useMemo(() => getTagGuide(frame, answer, DEFAULT_PROBLEM, config), [frame,answer,config])
  const rollerRule = answer.coachRules?.find((rule): rule is Extract<CoachRule,{kind:'roller-depth'}> => rule.kind === 'roller-depth')
  const liftRule = answer.coachRules?.find((rule): rule is Extract<CoachRule,{kind:'lift-rise'}> => rule.kind === 'lift-rise')
  const selectedAnchor = anchors?.selected
  const coachWidth = anchors && anchors.width <= 600 ? 250 : 282
  const coachPlacement = useMemo(() => placeCourtCard(anchors,selectedAnchor ?? null,coachWidth,coachCardHeight),[anchors,selectedAnchor,coachWidth,coachCardHeight])
  const breakPlacement = useMemo(() => placeCourtCard(anchors,selectedAnchor ?? null,coachWidth,breakCaptionHeight),[anchors,selectedAnchor,coachWidth,breakCaptionHeight])
  const insightPlacement = useMemo(() => anchors && anchors.width > 600 ? placeCourtCard(anchors,anchors.players.D3 ?? null,insightCardSize.width,insightCardSize.height) : null,[anchors,insightCardSize])
  const coachLeft = coachPlacement.x, coachTop = coachPlacement.y
  const coachLeaderX = selectedAnchor ? clamp(selectedAnchor.x,coachLeft,coachLeft+coachWidth) : coachLeft
  const coachLeaderY = selectedAnchor ? (selectedAnchor.y > coachTop+coachCardHeight ? coachTop+coachCardHeight : selectedAnchor.y < coachTop ? coachTop : coachTop+54) : coachTop
  const selectedCue = [...config.interventions].reverse().find((cue): cue is Extract<Intervention, {kind:'move'}> => cue.kind === 'move' && cue.playerId === selectedId && cue.at <= time && (cue.until === undefined || cue.until > time))
  const cueIsReleased = selectedCue && selectedCue.untilTrigger && activeRun.events.some(e => e.type === 'intervention' && e.t >= selectedCue.at && e.t <= time && e.interventionId === selectedCue.id && e.label.toLowerCase().includes('release'))
  const cueTarget = !playing && !cueIsReleased ? selectedCue?.target : null
  const opponent = { ...DEFAULT_OPPONENT, ...config.opponent }
  const attackWitness = !attackStale ? attackReport?.selected.witness : null
  const highlightWitness = showAttack && breakPhase === 'frozen' ? attackWitness : null
  const visibleWindows = frame.options.filter(option => (['roll', 'lift', 'corner'].includes(option.id) || (highlightWitness && option.id === highlightWitness.threatId)) && option.available)
  const latestDecision = [...activeRun.decisions].reverse().find(decision => decision.t <= time)
  const comparisonIsPaired = baseline && config.counter === baseline.config.counter && JSON.stringify(config.opponent) === JSON.stringify(baseline.config.opponent) && JSON.stringify(config.assumptions) === JSON.stringify(baseline.config.assumptions) && config.seed === baseline.config.seed
  const term = (role: RoleId) => teach && savedRevision?.terminology[role] ? savedRevision.terminology[role] : ROLE_LABELS[role]
  const candidatePaths = useMemo<LabCandidatePath[]>(() => {
    if (!showAttack || (breakPhase !== 'searching' && breakPhase !== 'selecting')) return []
    const visible = breakPhase === 'selecting' ? attackCandidates.filter(candidate => candidate.selected) : [...attackCandidates.filter(candidate => candidate.verdict !== 'held').slice(-2), ...attackCandidates.slice(-2)]
    return [...new Map(visible.map(candidate => [candidate.id,candidate])).values()].map(candidate => ({id:candidate.id,points:candidate.points,status:candidate.selected ? 'chosen' : candidate.verdict === 'held' ? 'contained' : candidate.verdict === 'conditional' ? 'conditional' : 'dangerous',verdict:candidate.verdict,threatId:candidate.threatId}))
  }, [showAttack,breakPhase,attackCandidates])
  const paths = useMemo(() => DEFENDERS.map(id => ({ id, points: activeRun.frames.filter((_, i) => i % 8 === 0).filter(f => f.t >= time).map(f => { const p = f.players.find(p => p.id === id)!; return { x: p.x, z: p.z } }) })), [activeRun, time])

  return <main className={s.lab} data-lab-ready="true" data-mode={teach ? 'teach' : 'lab'} data-counter={config.counter} data-interventions={config.interventions.length} data-break-phase={showAttack ? breakPhase ?? undefined : undefined} data-attack-state={attackBusy ? 'searching' : attackStale ? 'stale' : attackReport ? 'complete' : 'idle'}>
    <header className={s.header}>
      <div className={s.brand}><span className={s.wordmark}>Court<span>IQ</span></span><span className={s.brandSub}>SEE THE GAME DEEPER</span></div>
      <nav className={s.nav} aria-label="Lab mode"><button className={cls(s.navButton, !teach && s.navActive)} aria-pressed={!teach} onClick={leaveTeach}>Lab</button><button className={cls(s.navButton, teach && s.navActive)} aria-pressed={teach} onClick={teachLatest}>Teach</button></nav>
      <button className={s.savedButton} onClick={() => { setPlaying(false); setModal('answers') }}><Icon name="folder" size={16} />Our system <span>{answers.length}</span></button>
    </header>
    <section className={s.stage} aria-label="Interactive basketball world">
      <div className={s.world}><LabWorld frame={frame} assumptions={config.assumptions} baselineFrame={ghost && baseline ? frameAt(baseline, time) : null} baselineEvidenceFrames={ghost && baseline ? baseline.frames : undefined} evidenceFrames={activeRun.frames} candidatePaths={candidatePaths} conflicts={analysis.conflicts} tagGuide={!teach && !playing && selectedId === 'D3' ? tagGuide : undefined} onTagDepthChange={depth => changeAnswer({tagDepth:depth})} selectedId={selectedId} playing={playing} focusThreatId={highlightWitness?.threatId} cueTarget={cueTarget} arrivalTarget={highlightWitness?.target} xray={xray} camera={camera} onProjectAnchors={projectAnchors} onSelect={id => { setSelectedId(id); setDrawer('player'); setPlaying(false); setShowQuiz(false); if (showAttack && breakPhase === 'frozen') { setBreakPhase('fixing'); setEditFrom('start') } }} onMove={movePlayer} paths={paths} /></div>
      <div className={s.problem}><p className={s.deckKicker}>{teach ? 'YOUR SAVED ANSWER' : '01 / DEFENSE FIRST'}</p><h1>{teach ? savedRevision?.name : 'High P&R. Tag. Lift. Skip.'}</h1><button className={s.problemAnswer} onClick={() => !teach && setDrawer(drawer === 'rules' ? null : 'rules')} disabled={teach}>{COVERAGES.find(c => c.id === answer.coverage)?.label} · {answer.coverage === 'switch' ? 'Screen exchange' : answer.tag ? (answer.tagDepth < 0.4 ? 'Shallow' : answer.tagDepth > 0.65 ? 'Deep' : 'Touch') + ' tag' : 'Stay home'} · {answer.backside === 'x-out' ? 'X-out' : 'Stay'} <Icon name="chevron" size={13} /></button></div>
      <div className={s.viewTools}>
        <button className={cls(s.toolButton, xray !== 'off' && s.toolActive)} aria-pressed={xray !== 'off'} onClick={() => setXray(x => x === 'off' ? 'responsibilities' : 'off')}><Icon name="xray" />X-ray</button>
        {xray !== 'off' && <select className={s.layerSelect} aria-label="X-ray layer" value={xray} onChange={e => setXray(e.target.value as XRayLayer)}><option value="responsibilities">Responsibilities</option><option value="windows">Passing windows</option><option value="recovery">Recovery paths</option><option value="bodies">Defensive reach</option></select>}
        <select className={s.layerSelect} aria-label="Camera view" value={camera} onChange={e => setCamera(e.target.value as CameraId)}><option value="broadcast">Broadcast</option><option value="sideline">Sideline</option><option value="baseline">Baseline</option><option value="overhead">Overhead</option><option value="coach">Courtside</option><option value="player" disabled={!selectedId}>Player view</option></select>
        {!teach && <button className={cls(s.toolButton, ghost && s.toolActive)} aria-pressed={ghost} disabled={!baseline} onClick={() => { if (showAttack) exitBreakMode(); setGhost(g => !g); setXray('windows') }}><Icon name="compare" />Compare</button>}
      </div>
      {!teach && !showAttack && <button className={s.opponentBadge} onClick={() => { setDrawer(drawer === 'offense' ? null : 'offense'); setPlaying(false) }}><span className={s.liveDot} />{config.opponent ? 'Live opponent' : 'Authored opponent'} · {counter.label} <Icon name="chevron" size={13} /></button>}
      {xray === 'windows' && anchors && visibleWindows.map(option => {
        const anchor = anchors.threats.find(a => a.id === option.id)
        if (!anchor?.visible) return null
        const open = isThreatOpen(option, frame, config.assumptions)
        const interval = analysis.windows.find(w => w.id === option.id)?.intervals.find(i => time >= i.start && time < i.end)
        return <button className={cls(s.windowLabel, open && s.windowOpen, highlightWitness && option.id !== highlightWitness.threatId && s.windowQuiet)} style={{ left: clamp(anchor.x, 75, anchors.width - 100), top: clamp(anchor.y - 18, 118, anchors.height - 195) }} key={option.id} onClick={() => setModal('why')}><b>{option.id === 'roll' ? 'Roller' : option.id === 'lift' ? 'Lift' : option.id === 'drive' ? 'Drive' : option.id === 'corner' ? 'Corner' : option.id}</b><span>{open ? (interval ? (interval.end - interval.start).toFixed(2) + 's window' : 'Open now') : 'Covered now'}</span>{ghost && comparison && <small>{comparison.tradeoffs.find(w => w.id === option.id)?.before.toFixed(2)} → {comparison.tradeoffs.find(w => w.id === option.id)?.after.toFixed(2)}s</small>}</button>
      })}
      {showAttack && breakPhase === 'frozen' && attackWitness && anchors?.selected?.visible && <div className={s.arrivalLabel} style={{left:clamp(anchors.selected.x,90,anchors.width-90),top:clamp(anchors.selected.y-35,130,anchors.height-195)}}><b>{attackWitness.limitingDefenderId} · {attackWitness.arrivalSeconds.toFixed(2)}s</b><span>Arrival estimate</span></div>}
      {ghost && comparison && <div className={s.compareRibbon} data-testid="lab-comparison"><Icon name="compare" /><div><b>Before → Our revised answer</b><small>{THREAT_LABELS[baseline?.decisions[0]?.selected ?? 'hold'] ?? 'Keep'} → {THREAT_LABELS[activeRun.decisions[0]?.selected ?? 'hold'] ?? 'Keep'}</small><span>{comparisonIsPaired ? 'Same opponent, seed and movement assumptions' : 'Opponent or inputs changed; inspect both experiments'}</span></div>{comparison.tradeoffs.filter(w => w.before > .01 || w.after > .01).sort((a,b) => Math.abs(b.delta)-Math.abs(a.delta)).slice(0,3).map(w => <span key={w.id}>{w.label}<strong>{w.before.toFixed(2)} → {w.after.toFixed(2)}s</strong></span>)}<button className={s.closeButton} onClick={() => setGhost(false)} aria-label="Close comparison"><Icon name="close" size={14} /></button></div>}
      {!hasRun && !teach && !drawer && !showAttack && <p className={s.startHint}>Select a defender to coach. Run it to see the tradeoff.</p>}
      {hasRun && !teach && !showAttack && !drawer && !ghost && <div ref={insightCardRef} className={s.insight} style={insightPlacement ? {left:insightPlacement.x,top:insightPlacement.y,right:'auto',bottom:'auto'} : undefined} data-testid="lab-insight"><p className={s.deckKicker}>{playing ? 'THE OFFENSE IS READING' : 'FROZEN / ' + time.toFixed(2) + ' S'}</p><h2>{latestDecision ? (THREAT_LABELS[latestDecision.selected] ?? 'Keep the ball') : STAGE_LABELS[frame.stage] ?? 'Read the defense'}</h2><p>{comparison?.explanation ?? analysis.explanation}</p>{!playing && !latestDecision && <button className={s.secondaryButton} onClick={() => { pauseAt.current = Math.min(config.assumptions.duration, (activeRun.decisions[0]?.t ?? 2.1) + .025); setPlaying(true) }}>See the opponent’s read <Icon name="play" size={13} /></button>}<button className={s.insightLink} onClick={() => setModal('why')}>Follow the evidence <Icon name="arrow" size={14} /></button></div>}
      {showAttack && breakPhase && <BreakMode phase={breakPhase} report={attackReport} candidates={attackCandidates} progress={attackProgress} time={time} replayPlaying={playing} editingDefenderId={selectedId} anchor={{...breakPlacement,width:coachWidth}} onCaptionHeightChange={measureBreakCaption} onCancel={exitBreakMode} onReplay={() => attackReport && playAttack(attackReport)} onFix={fixAttack} onAttackAgain={breakDefense} onInspect={() => setModal('why')} />}

      {!teach && !playing && selectedId === 'D3' && tagGuide.editable && anchors?.tagTarget?.visible && <div className={s.tagFloorControl} style={{left:anchors.tagTarget.x,top:anchors.tagTarget.y}}><span className={s.tagFloorHandle} data-testid="tag-floor-handle" aria-hidden="true" /><button aria-label="Adjust D3 tag depth" title="Drag the floor handle, or use left and right arrow keys here" onClick={() => setDrawer('player')} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); changeAnswer({tagDepth:clamp(answer.tagDepth+(event.key === 'ArrowRight' ? .05 : -.05),0,1)}) } }}><b>Tag depth</b><span>{Math.round(answer.tagDepth*100)}% · drag the target</span></button></div>}
      {drawer === 'player' && selected && selected.team === 'defense' && <>
        {anchors && selectedAnchor?.visible && <svg className={s.anchorLeader} width={anchors.width} height={anchors.height} aria-hidden="true"><path d={'M' + selectedAnchor.footX + ' ' + selectedAnchor.footY + ' L' + selectedAnchor.x + ' ' + (selectedAnchor.y - 8) + ' L' + coachLeaderX + ' ' + coachLeaderY} fill="none" stroke="#2e67fa" strokeWidth="1.5" strokeDasharray="4 4" /><circle cx={selectedAnchor.footX} cy={selectedAnchor.footY} r="5" fill="#2e67fa" /></svg>}
        <aside ref={coachCardRef} className={s.coachCard} style={{ left: coachLeft, top: coachTop }} aria-label="Selected player"><div className={s.evidenceHeader}><p className={s.deckKicker}>{selected.id} / {term(selected.role)}</p><button className={s.closeButton} onClick={() => setDrawer(null)} aria-label="Close inspector"><Icon name="close" size={14} /></button></div><h2>{currentJob}</h2><p className={s.coachTrigger} title={primaryJob?.trigger}>{primaryJob?.trigger ?? 'Read the ball and your matchup.'}</p>{nextJob && <p className={s.nextJob}><b>Then</b> {nextJob}</p>}
        {teach ? <><p className={s.savedCue}>{savedRevision?.teaching.cue}</p><button className={s.secondaryButton} onClick={() => { setShowQuiz(v => !v); setQuizAnswer(null) }}>Read checkpoint</button>{showQuiz && <div className={s.quiz}><p>What is your first job?</p>{[currentJob, 'Chase the ball wherever it goes', 'Leave both weakside receivers'].map(choice => <button className={cls(s.actionButton, quizAnswer === choice && s.actionActive)} key={choice} onClick={() => setQuizAnswer(choice)}>{choice}</button>)}{quizAnswer && <p role="status">{quizAnswer === currentJob ? 'Yes. ' + (primaryJob?.trigger ?? 'Follow your rule.') : 'Follow the responsibility line: ' + currentJob.toLowerCase() + '.'}</p>}</div>}</> : <>
          <div className={s.scope}><label htmlFor="coach-scope">Apply rule</label><select id="coach-scope" value={editFrom} onChange={e => setEditFrom(e.target.value as 'moment' | 'start')}><option value="moment">From {time.toFixed(2)}s</option><option value="start">From the start</option></select></div>
          {selectedRole === 'low-man' && answer.coverage === 'switch' && <p className={s.nextJob}>Switch exchanges the screen defenders. Choose another coverage to add a low-man tag.</p>}{selectedRole === 'low-man' && answer.coverage !== 'switch' && <><p className={s.sectionLabel}>{answer.coachRules?.length ? 'Base tag' : 'Tag'}</p><div className={s.choiceRow}><button className={cls(s.choice, answer.tag && answer.tagDepth < .4 && s.choiceActive)} onClick={() => changeAnswer({ tag: true, tagDepth: .25 })}>Shallower tag</button><button className={cls(s.choice, answer.tag && answer.tagDepth >= .4 && s.choiceActive)} onClick={() => changeAnswer({ tag: true, tagDepth: .95 })}>Deep</button><button className={cls(s.choice, !answer.tag && s.choiceActive)} onClick={() => changeAnswer({ tag: false })}>Stay</button></div><p className={s.sectionLabel}>Release</p><div className={s.choiceRow}><button className={cls(s.choice, answer.recovery === 'roller-secured' && s.choiceActive)} onClick={() => changeAnswer({ recovery: 'roller-secured' })}>Big recovers</button><button className={cls(s.choice, answer.recovery === 'on-pass' && s.choiceActive)} onClick={() => changeAnswer({ recovery: 'on-pass' })}>Ball leaves</button></div></>}
          {selectedRole === 'poa' && <div className={s.choiceRow}>{(['over','under'] as const).map(v => <button className={cls(s.choice, answer.poa === v && s.choiceActive)} key={v} onClick={() => changeAnswer({ poa:v })}>{v === 'over' ? 'Chase over' : 'Go under'}</button>)}</div>}
          {selectedRole === 'big' && <><p className={s.sectionLabel}>At the screen</p><div className={s.choiceRow}>{(['drop','hedge','switch','blitz'] as const).map(id => <button key={id} className={cls(s.choice,answer.coverage === id && s.choiceActive)} aria-pressed={answer.coverage === id} onClick={() => chooseCoverage(id)}>{id === 'hedge' ? 'Show' : id[0].toUpperCase()+id.slice(1)}</button>)}</div>{answer.coverage === 'drop' && <label className={s.field}>Contain depth<input type="range" min="1.7" max="5.5" step=".1" value={answer.bigDepth} onChange={e => changeAnswer({ bigDepth:Number(e.target.value) })} /></label>}</>}
          {selectedRole === 'backside' && <><p className={s.sectionLabel}>{liftRule ? 'Base rotation' : 'Rotation'}</p><div className={s.choiceRow}>{(['x-out','stay'] as const).map(v => <button className={cls(s.choice, answer.backside === v && s.choiceActive)} key={v} onClick={() => changeAnswer({ backside:v })}>{v === 'x-out' ? 'X-out' : 'Stay with lift'}</button>)}</div></>}
          {selectedRole === 'low-man' && answer.coverage !== 'switch' && <details className={s.demonstrate}><summary>Coach the roller read{rollerRule ? ' · Added' : ''}</summary><p>After the screen, while the handler has the ball. Your base answer resumes on release.</p><label className={s.checkField}><input type="checkbox" checked={!!rollerRule} onChange={e => changeCoachRule('roller-depth',e.target.checked ? {kind:'roller-depth',depth:5.5,response:'low-man-tags'} : null)} />Add our roller rule</label>{rollerRule && <><p>{coachRuleSentence(rollerRule)}</p><label className={s.field}>Roller depth from baseline · {rollerRule.depth.toFixed(1)}m<input type="range" aria-label="Roller rule depth" min="2.5" max="7" step=".1" value={rollerRule.depth} onChange={e => changeCoachRule('roller-depth',{...rollerRule,depth:Number(e.target.value)})} /></label><label className={s.field}>Our response<select className={s.textInput} aria-label="Roller rule response" value={rollerRule.response} onChange={e => changeCoachRule('roller-depth',{...rollerRule,response:e.target.value as typeof rollerRule.response})}><option value="low-man-tags">Low man tags · big contains</option><option value="big-recovers">Big takes roller · low man returns</option></select></label></>}</details>}
          {selectedRole === 'backside' && answer.coverage !== 'switch' && <details className={s.demonstrate}><summary>Coach the lift read{liftRule ? ' · Added' : ''}</summary><p>After the screen, while the handler has the ball. Your base answer resumes on release.</p><label className={s.checkField}><input type="checkbox" checked={!!liftRule} onChange={e => changeCoachRule('lift-rise',e.target.checked ? {kind:'lift-rise',rise:1,response:'x-out'} : null)} />Add our lift rule</label>{liftRule && <><p>{coachRuleSentence(liftRule)}</p><label className={s.field}>Lift above starting spot · {liftRule.rise.toFixed(1)}m<input type="range" aria-label="Lift rule rise" min=".5" max="3" step=".1" value={liftRule.rise} onChange={e => changeCoachRule('lift-rise',{...liftRule,rise:Number(e.target.value)})} /></label><label className={s.field}>Our response<select className={s.textInput} aria-label="Lift rule response" value={liftRule.response} onChange={e => changeCoachRule('lift-rise',{...liftRule,response:e.target.value as typeof liftRule.response})}><option value="x-out">X-out behind the lift</option><option value="stay-with-lift">Backside stays with lift</option></select></label></>}</details>}
          <details className={s.demonstrate}><summary>Show him where to go</summary><p>Freeze and drag this defender to a floor target. Movement begins at the frozen clock, {time.toFixed(2)}s.</p><label className={s.field}>Hold the cue until<select className={s.textInput} aria-label="Movement release" value={cueRelease} onChange={e => setCueRelease(e.target.value as typeof cueRelease)}><option value="timed">1.8 seconds</option><option value="big-secured">The big secures the roller</option><option value="ball-leaves">The ball leaves</option></select></label><div className={s.choiceRow}><button className={s.choice} disabled={playing} onClick={() => movePlayer(selected.id,{x:selected.x-.5,z:selected.z},time)}>← Left</button><button className={s.choice} disabled={playing} onClick={() => movePlayer(selected.id,{x:selected.x+.5,z:selected.z},time)}>Right →</button></div><div className={s.choiceRow}><button className={s.choice} disabled={playing} onClick={() => movePlayer(selected.id,{x:selected.x,z:selected.z-.5},time)}>Toward rim</button><button className={s.choice} disabled={playing} onClick={() => movePlayer(selected.id,{x:selected.x,z:selected.z+.5},time)}>Up the floor</button></div></details>
          <button className={s.primaryButton} onClick={runAnswer}>Run this change <Icon name="play" size={15} /></button>
        </>}</aside>
      </>}
      {(drawer === 'rules' || drawer === 'offense') && <aside className={s.inspector} aria-label={drawer === 'rules' ? 'Edit defensive rules' : 'Offensive counter'}><div className={s.evidenceHeader}><p className={s.deckKicker}>{drawer === 'rules' ? 'BUILD OUR ANSWER' : 'OPPOSING SYSTEM'}</p><button className={s.closeButton} onClick={() => setDrawer(null)} aria-label="Close inspector"><Icon name="close" size={15} /></button></div>{drawer === 'rules' ? <>
        <h2>How do we guard it?</h2><div className={s.coverageOptions} aria-label="Ball-screen coverage">{COVERAGES.map(c => <button className={cls(s.choice, answer.coverage === c.id && s.choiceActive)} title={c.description} aria-pressed={answer.coverage === c.id} key={c.id} onClick={() => chooseCoverage(c.id)}>{c.id === 'hedge' ? 'Show' : c.id === 'ice' ? 'Force side' : c.label}</button>)}</div>
        <label className={s.field}>Coach a defender<select className={s.textInput} aria-label="Coach a defender" value={selectedId ?? ''} onChange={e => { if (e.target.value) { setSelectedId(e.target.value as PlayerId); setDrawer('player'); setPlaying(false) } }}><option value="">Choose a role…</option>{DEFENDERS.map(id => <option key={id} value={id}>{id} · {ROLE_LABELS[DEFAULT_PROBLEM.players.find(p => p.id === id)!.role]}</option>)}</select></label>
        <label className={s.field}>Apply this rule<select className={s.textInput} aria-label="Rule start" value={editFrom} onChange={e => setEditFrom(e.target.value as 'moment' | 'start')}><option value="moment">From this moment · {time.toFixed(2)}s</option><option value="start">From the start · new setup</option></select></label>
        <div className={s.ruleSummary}><button onClick={() => { setSelectedId('D1'); setDrawer('player') }}>On ball<b>{answer.poa === 'over' ? 'Chase over' : 'Go under'}</b></button><button onClick={() => { setSelectedId('D5'); setDrawer('player') }}>Big<b>{answer.bigDepth.toFixed(1)}m depth</b></button><button onClick={() => { setSelectedId('D3'); setDrawer('player') }}>Low man<b>{answer.tag ? (answer.tagDepth < .4 ? 'Shallow' : 'Deep') + ' tag' : 'Stay home'}</b></button><button onClick={() => { setSelectedId('D4'); setDrawer('player') }}>Backside<b>{answer.backside === 'x-out' ? 'X-out' : 'Stay'}</b></button></div>
        <details className={s.demonstrate}><summary>Coach it in your words</summary><p>Choose a supported coaching cue. Review the basketball it changes.</p><select className={s.textInput} aria-label="Coaching template" value={COACHING_TEMPLATES.some(c => c.text === coachingText) ? coachingText : ''} onChange={e => setCoachingText(e.target.value)}><option value="" disabled>Supported templates</option>{COACHING_TEMPLATES.map(c => <option key={c.id} value={c.text}>{c.text}</option>)}</select><textarea className={s.textInput} aria-label="Coaching cue" rows={3} value={coachingText} onChange={e => setCoachingText(e.target.value)} /><p className={s.coachingPreview}>{coachingPreview.explanation}</p><button className={s.secondaryButton} disabled={!coachingPreview.supported} onClick={applyCoaching}>Apply coaching cue</button></details>
        <div className={s.choiceRow}><button className={s.primaryButton} onClick={runAnswer}>Run our answer <Icon name="play" size={14} /></button><button className={s.insightLink} onClick={resetExperiment}>Reset</button></div>
      </> : <><h2>{config.opponent ? 'A system that reads us.' : 'Your earlier authored opponent.'}</h2>{!config.opponent && <div className={s.nextJob}><p>This saved answer retains its original route model. Enabling adaptive counters starts a new offensive test.</p><button className={s.secondaryButton} onClick={enableAdaptiveOpponent}>Enable adaptive opponent</button></div>}<p>Intent biases the first look. Counter permissions react to observed coverage; they do not force a pass.</p><label className={s.field}>Opening intent<select className={s.textInput} aria-label="Opponent intent" value={config.counter} onChange={e => changeCounter(e.target.value as CounterId)}>{COUNTERS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>{config.opponent && <p className={s.sectionLabel}>Allowed counters</p>}{config.opponent && (['reject','rescreen','shortRoll'] as const).map(key => <label className={s.checkField} key={key}><input type="checkbox" checked={opponent[key]} onChange={e => { rememberBefore(); setBaseline(null); setGhost(false); setTime(0); setConfig(c => ({...c,opponent:{...DEFAULT_OPPONENT,...c.opponent,[key]:e.target.checked}})) }} />{key === 'rescreen' ? 'Turn / re-screen' : key === 'shortRoll' ? 'Short-roll release' : 'Reject an overplay'}</label>)}<p>Break My Defense searches screen angle, lift timing and spacing, and these permissions.</p><button className={s.primaryButton} onClick={breakDefense}>Break my defense <Icon name="stress" size={15} /></button></>}</aside>}
      <div className={s.transport}><button className={s.playButton} onClick={togglePlay} aria-label={playing ? 'Pause replay' : 'Play replay'}><Icon name={playing ? 'pause' : 'play'} size={17} /></button><button className={s.stepButton} onClick={() => seek(time - config.assumptions.dt)} aria-label="Previous frame"><Icon name="back" size={13} /></button><span className={s.timeLabel} data-testid="lab-clock">{time.toFixed(2)}<small>s</small></span><div className={s.timeline}><input className={s.timelineRange} aria-label="Replay time" aria-valuetext={time.toFixed(2) + ' seconds, ' + frame.stage} type="range" min="0" max={config.assumptions.duration} step={config.assumptions.dt} value={time} onChange={e => seek(Number(e.target.value))} /><div className={s.eventTrack}>{checkpoints.map(point => <button className={s.eventMarker} title={point.label} data-label={point.label} data-active={checkpoints.reduce((closest,p) => Math.abs(p.t-time) < Math.abs(closest.t-time) ? p : closest, checkpoints[0]).label === point.label} key={point.label} style={{left:point.t/config.assumptions.duration*100+'%'}} onClick={() => seek(point.t)} aria-label={'Go to ' + point.label}>{point.label}</button>)}</div></div><span className={s.timeEnd}>{config.assumptions.duration.toFixed(1)}s</span><button className={s.stepButton} onClick={() => seek(time + config.assumptions.dt)} aria-label="Next frame"><Icon name="step" size={13} /></button><button className={s.speedButton} onClick={() => setSpeed(v => v === 1 ? .5 : v === .5 ? .25 : 1)} aria-label={'Playback speed ' + speed + ' times'}>{speed}×</button></div>
      {!teach ? <div className={s.experimentDock} aria-label="Experiment loop"><button className={cls(s.dockButton, drawer === 'rules' && s.dockActive)} onClick={() => { setDrawer(drawer === 'rules' ? null : 'rules'); setPlaying(false) }}><Icon name="settings" size={16} /><span>Build our answer</span></button><button className={s.dockRun} onClick={runAnswer}><Icon name="play" size={16} /><span>{hasRun ? 'Run again' : 'Run it'}</span></button><button className={s.dockButton} disabled={attackBusy} onClick={breakDefense}><Icon name="stress" size={17} /><span>{showAttack && breakPhase === 'fixing' ? 'Break it again' : attackReport ? 'Stress it again' : 'Break my defense'}</span></button><button className={s.dockButton} onClick={() => { setPlaying(false); setModal('save') }}><Icon name="save" size={16} /><span>Save / teach</span></button></div> : <div className={s.teachingDock} aria-label="Role teaching">{DEFENDERS.map(id => <button className={cls(s.teachRole, selectedId === id && s.teachRoleActive)} aria-pressed={selectedId === id} key={id} onClick={() => { setSelectedId(id); setDrawer('player'); setQuizAnswer(null); setShowQuiz(false) }}>{id}<span>{term(frame.players.find(p => p.id === id)!.role)}</span></button>)}<button className={s.insightLink} onClick={leaveTeach}>Return to Lab</button></div>}
      <div className={s.worldFooter}><span>{teach ? 'Teaching the exact saved answer' : config.interventions.length ? config.interventions.length + ' timed changes · drag a defender to coach' : 'Orbit · Zoom · Select a defender'}</span><button onClick={() => setModal('why')}>Model & assumptions</button></div>
    </section>
    {modal && <Dialog title={{ save: teachAfterSave.current ? 'Save an answer to teach' : 'Save our answer', answers: 'Our answers', why: 'Why does this happen?', stress: 'Put your answer under stress', compare: 'What changed?' }[modal]} onClose={closeModal}>
      {modal === 'save' && <form onSubmit={e => { e.preventDefault(); saveCurrent() }}><p className={s.insightBody}>Keep your coverage, rules, assumptions and timed changes together. Teaching replays this exact saved answer.</p><label className={s.field}>Answer name<input autoFocus className={s.textInput} value={saveName} onChange={e => setSaveName(e.target.value)} maxLength={80} required /></label><label className={s.field}>What does your team call the low man?<input className={s.textInput} value={teamTerm} onChange={e => setTeamTerm(e.target.value)} maxLength={40} /></label><p className={s.insightBody}>Saved on this device. Use Export to share or keep a backup.</p><button className={s.primaryButton} type="submit"><Icon name="save" />Save answer</button></form>}
      {modal === 'answers' && <><p className={s.insightBody}>Your program’s answers, saved on this device.</p><div className={s.answerList}>{answers.length ? answers.map(record => <div className={s.answerItem} key={record.id} data-testid="saved-answer"><div><h3>{record.name}</h3><p>{COVERAGES.find(c => c.id === record.config.answer.coverage)?.label} · {record.config.answer.backside === 'x-out' ? 'X-out' : 'Stay'} · {record.config.interventions.length} timed changes</p></div><div className={s.choiceRow}><button className={s.secondaryButton} onClick={() => loadRecord(record)}>Open</button><button className={s.secondaryButton} onClick={() => beginTeach(record)}>Teach</button><button className={s.closeButton} aria-label={`Delete ${record.name}`} onClick={() => { const result = deleteAnswer(record.id); setAnswers(result.answers); if (savedRevision?.id === record.id) { if (teach) leaveTeach(); setSavedRevision(null) } notify(result.persisted ? 'Answer removed from this device.' : 'Removed in memory; device storage could not be updated.') }}><Icon name="close" size={15} /></button></div></div>) : <div className={s.empty}>Run a defensive answer, then save it. Your team’s system starts with one basketball problem.</div>}</div><div className={s.choiceRow}><button className={s.secondaryButton} disabled={!answers.length} onClick={() => downloadAnswers()}><Icon name="download" />Export answers</button><button className={s.secondaryButton} onClick={() => fileRef.current?.click()}>Import answers</button><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => void importFile(e.target.files?.[0])} /></div></>}
      {modal === 'why' && <><p className={s.insightBody}>{analysis.explanation}</p>{analysis.warnings.map((warning, i) => <p className={s.evidenceWarning} key={i}>{warning}</p>)}{attackReport && !attackStale && !teach && <div className={s.drawerSection}><h3>Attack search evidence</h3><p className={s.insightBody}>{attackReport.scope}</p>{attackReport.sensitivity.map(probe => <p className={s.insightBody} key={probe.label}>{probe.label}: {probe.witness ? (probe.witness.conditional ? 'conditional opening' : 'opening') + ' at ' + probe.witness.at.toFixed(2) + 's' : 'no supported opening'}.</p>)}</div>}<div className={s.compareGrid}>{analysis.windows.map(window => <div className={s.compareItem} key={window.id}><span>{window.label}</span><strong className={s.compareValue}>{window.duration.toFixed(2)}<small>s</small></strong><p>Longest modeled opening</p></div>)}</div><div className={s.drawerSection}><h3>The offense made these reads</h3>{activeRun.decisions.slice(0, 5).map((decision, i) => <p className={s.insightBody} key={`${decision.t}-${i}`}><b>{decision.t.toFixed(2)} s · {THREAT_LABELS[decision.selected] ?? 'Hold the ball'}</b><br />{decision.reason}</p>)}</div><div className={s.drawerSection}><h3>What the numbers mean</h3><button className={s.secondaryButton} onClick={testCounters}>Run the counter sweep</button><p className={s.insightBody}>Windows are intervals in this modeled possession when an enabled option clears the passing and defensive influence tests. Arrival is a movement estimate. A replay exposure does not alone prove a structural conflict.</p><p className={s.insightBody}>No shot percentages or possession predictions. Movement, reactions and contest range are authored assumptions; this model has not been calibrated to your athletes.</p><dl className={s.assumptionList}><div><dt>Defender speed</dt><dd>{config.assumptions.maxSpeed.toFixed(1)} m/s</dd></div><div><dt>Acceleration</dt><dd>{config.assumptions.acceleration.toFixed(1)} m/s²</dd></div><div><dt>Reaction delay</dt><dd>{config.assumptions.reactionDelay.toFixed(2)} s</dd></div><div><dt>Contest radius</dt><dd>{config.assumptions.contestRadius.toFixed(2)} m</dd></div><div><dt>Pass speed</dt><dd>{config.assumptions.passSpeed.toFixed(1)} m/s</dd></div><div><dt>Time step</dt><dd>{config.assumptions.dt.toFixed(3)} s</dd></div></dl><p className={s.insightBody}>{analysis.rotationCount} responsibility transfers. Recovery: {analysis.recovery.seconds === null ? 'not observed within this replay' : `${analysis.recovery.seconds.toFixed(1)} s`}.</p>{activeRun.diagnostics.warnings.map((warning, i) => <p className={s.insightBody} key={i}>{warning}</p>)}<p className={s.deckKicker}>MODEL {activeRun.modelVersion} · CONTENT {activeRun.problemVersion} · SEED {config.seed}</p></div></>}
      {modal === 'compare' && (comparison ? <><p className={s.insightBody}>{comparison.explanation}</p><p className={s.sectionLabel}>Longest opening · same opponent intent and assumptions</p><div className={s.stressTable}><div className={s.stressRow}><b>Offensive option</b><b>Before</b><b>After</b></div>{comparison.before.windows.map(before => { const after = comparison.after.windows.find(w => w.id === before.id); return <div className={s.stressRow} key={before.id}><span>{before.label}</span><span>{before.duration.toFixed(2)} s</span><span>{after?.duration.toFixed(2) ?? '—'} s</span></div> })}</div><p className={s.insightBody}>Dashed ghosts show the previous answer at the same moment. Timed cues preserve every frame before the change.</p><button className={s.primaryButton} onClick={() => { setGhost(true); setModal(null) }}>Inspect on court <Icon name="arrow" /></button></> : <p className={s.empty}>Run your answer, change a rule, then compare the resulting opportunities.</p>)}
      {modal === 'stress' && <><p className={s.insightBody}>Connected offensive continuations, replayed under the same disclosed movement and read settings. Holds / Thin / Breaks describe this model’s exposures.</p>{stressBusy ? <div className={s.empty} role="status">Testing the reads and rotations…<button className={s.secondaryButton} onClick={() => { stressAbort.current?.abort(); setStressBusy(false); notify('Stress test canceled. Your answer is unchanged.') }}>Cancel test</button></div> : stressReport ? <><div className={s.stressTable}>{stressReport.rows.map(row => <button className={s.stressRow} key={row.counter} onClick={() => { setModal(null); changeCounter(row.counter); setHasRun(true); setTime(0); pauseAt.current = DEFAULT_PROBLEM.stressAt; setPlaying(true) }}><div><b>{row.label}</b><p>{row.reason}</p></div><span className={cls(s.statusPill, row.status === 'holds' ? s.statusHolds : row.status === 'thin' ? s.statusThin : s.statusBreaks)}>{row.status === 'holds' ? 'Holds' : row.status === 'thin' ? 'Thin' : 'Breaks'}</span><Icon name="arrow" size={16} /></button>)}</div><p className={s.insightBody}>{stressReport.settings.length} paired settings per counter. These are finite checks, not odds. Click a row to inspect its possession.</p><button className={s.insightLink} onClick={() => setModal('why')}>Inspect model assumptions <Icon name="arrow" size={14} /></button></> : <button className={s.primaryButton} onClick={testCounters}>Run stress test</button>}</>}
    </Dialog>}
    <div className={cls(s.toast, !message && s.toastHidden)} role="status" aria-live="polite">{message}</div>
  </main>
}
