'use client'

import type { Voice } from '@courtiq/basketball/corpus'
import { COACH_RULE_BOUNDS, coachRuleSentence } from '@courtiq/basketball/coachRules'
import { COUNTERS } from '@courtiq/basketball/scenario'
import type { CoachRule, Intervention, LabConfig, PlayerId, TeamAnswer } from '@courtiq/basketball/types'
import { who } from './basketball'
import s from './courtiq.module.css'

export type Change = (patch: Partial<TeamAnswer>, label: string) => void
/** Mirrors `LabConfig.personnel` (engine). Kept structural so this compiles before and after the engine field lands. */
export type Personnel = Partial<Record<PlayerId, { speed?: number; lateral?: number; height?: number }>>
type ConfigWithPersonnel = LabConfig & { personnel?: Personnel }

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange(v: T): void }) {
  return <div className={s.seg} role="group">{options.map(o => <button key={o.id} aria-pressed={value === o.id} className={`${s.segBtn} ${value === o.id ? s.segOn : ''}`} onClick={() => value !== o.id && onChange(o.id)}>{o.label}</button>)}</div>
}

export function Num({ label, value, min, max, step, onChange, unit = '' }: { label: string; value: number; min: number; max: number; step: number; onChange(v: number): void; unit?: string }) {
  return <>
    <div className={s.ctrlLabel}><span>{label}</span><span>{value.toFixed(step < 0.1 ? 2 : 1)}{unit}</span></div>
    <input className={s.range} type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
  </>
}

function Fired({ at }: { at: number | null | undefined }) {
  if (at === undefined) return null
  return at === null
    ? <b className={s.fcFired} style={{ color: 'var(--warn)' }}>Never fired in this run. Try a different trigger.</b>
    : <b className={s.fcFired} style={{ color: 'var(--good)' }}>Fired at {at.toFixed(1)} s.</b>
}

/* Plain labels map to numbers. "Average" removes the override so the engine
 * keeps its height-derived default for that player. */
export const QUICKNESS = { quick: { speed: 1.08, lateral: 0.92 }, slow: { speed: 0.9, lateral: 0.7 } } as const
export const SIZE = { big: 2.06, small: 1.8 } as const
export const PERSONNEL_BOUNDS = { speed: [0.6, 1.4], lateral: [0.4, 1.1], height: [1.5, 2.3] } as const
type Quick = 'quick' | 'average' | 'slow'
type Size = 'big' | 'average' | 'small'
const quickOf = (p?: Personnel[PlayerId]): Quick => p?.speed === undefined ? 'average' : p.speed >= 1.04 ? 'quick' : p.speed <= 0.94 ? 'slow' : 'average'
const sizeOf = (p?: Personnel[PlayerId]): Size => p?.height === undefined ? 'average' : p.height >= 2.0 ? 'big' : p.height <= 1.84 ? 'small' : 'average'

function cueText(c: Intervention): string {
  if (c.kind === 'move') return `${c.playerId} moves to (${c.target.x.toFixed(1)}, ${c.target.z.toFixed(1)})${c.untilTrigger === 'ball-leaves' ? ' until the ball leaves' : c.untilTrigger === 'big-secured' ? ' until the big is back' : c.until !== undefined ? ` until ${c.until.toFixed(1)} s` : ''}`
  if (c.kind === 'opponent') return `Their offense changes: ${Object.keys(c.patch).join(', ')}`
  const p = c.patch
  return `Our rules change: ${Object.entries(p).map(([k, v]) => `${k} ${typeof v === 'number' ? v.toFixed(2) : typeof v === 'object' ? 'rules' : String(v)}`).join(', ')}`
}

function Section({ title, open, children, badge }: { title: string; open?: boolean; children: React.ReactNode; badge?: string }) {
  return <details className={s.fcSec} open={open}><summary className={s.fcSum}><span>{title}{badge && <span className={s.fcBadge}>{badge}</span>}</span></summary>{children}</details>
}

/** Everything a tactician expects, behind "Full control". Each control writes
 * into the same executable LabConfig the simulation reads. */
export default function FullControl({ config, voice, onChange, onOpponent, onAssumption, onCounter, onConfig, ruleFired }: {
  ruleFired: Partial<Record<CoachRule['kind'], number | null>>; config: LabConfig; voice: Voice; onChange: Change
  onOpponent(p: Partial<NonNullable<LabConfig['opponent']>>): void; onAssumption(p: Partial<LabConfig['assumptions']>): void; onCounter(c: LabConfig['counter']): void
  onConfig(f: (c: LabConfig) => LabConfig): void
}) {
  const a = config.answer, o = config.opponent, m = config.assumptions
  const personnel = (config as ConfigWithPersonnel).personnel ?? {}
  const rules = a.coachRules ?? []
  const setRule = (kind: CoachRule['kind'], rule: CoachRule | null) => onChange({ coachRules: [...rules.filter(r => r.kind !== kind), ...(rule ? [rule] : [])] }, 'Coach rule')
  const depthRule = rules.find(r => r.kind === 'roller-depth') as Extract<CoachRule, { kind: 'roller-depth' }> | undefined
  const riseRule = rules.find(r => r.kind === 'lift-rise') as Extract<CoachRule, { kind: 'lift-rise' }> | undefined
  const setPersonnel = (id: PlayerId, next: { speed?: number; lateral?: number; height?: number }) => onConfig(c => {
    const all: Personnel = { ...((c as ConfigWithPersonnel).personnel ?? {}) }
    if (Object.keys(next).length) all[id] = next; else delete all[id]
    const out: ConfigWithPersonnel = { ...c }
    if (Object.keys(all).length) out.personnel = all; else delete out.personnel
    return out
  })
  const setQuick = (id: PlayerId, q: Quick) => { const cur = personnel[id] ?? {}; const { speed, lateral, ...rest } = cur; void speed; void lateral; setPersonnel(id, { ...rest, ...(q === 'average' ? {} : QUICKNESS[q]) }) }
  const setSize = (id: PlayerId, z: Size) => { const { height, ...rest } = personnel[id] ?? {}; void height; setPersonnel(id, { ...rest, ...(z === 'average' ? {} : { height: SIZE[z] }) }) }
  const roster: PlayerId[] = ['D1', 'D2', 'D3', 'D4', 'D5', 'O1', 'O2', 'O3', 'O4', 'O5']
  const cues = config.interventions
  const dropCue = (id: string) => onConfig(c => ({ ...c, interventions: c.interventions.filter(i => i.id !== id) }))

  return (
    <div>
      <Section title="Our rules (if → then)" open>
        <div className={s.fcRule}>
          <label className={s.fcChk}><input className={s.fcChk} type="checkbox" checked={!!depthRule} onChange={e => setRule('roller-depth', e.target.checked ? { kind: 'roller-depth', depth: 4.5, response: 'low-man-tags' } : null)} /> If the roller gets deep…</label>
          {depthRule && <>
            <Num label="…past this depth (m from baseline)" value={depthRule.depth} min={COACH_RULE_BOUNDS.depth[0]} max={COACH_RULE_BOUNDS.depth[1]} step={0.1} onChange={v => setRule('roller-depth', { ...depthRule, depth: v })} />
            <Seg value={depthRule.response} options={[{ id: 'low-man-tags', label: 'Low man tags' }, { id: 'big-recovers', label: 'Big recovers' }]} onChange={v => setRule('roller-depth', { ...depthRule, response: v })} />
            <div className={s.hint}>{coachRuleSentence(depthRule)} <Fired at={ruleFired['roller-depth']} /></div>
          </>}
        </div>
        <div className={s.fcRule}>
          <label className={s.fcChk}><input className={s.fcChk} type="checkbox" checked={!!riseRule} onChange={e => setRule('lift-rise', e.target.checked ? { kind: 'lift-rise', rise: 1.0, response: 'stay-with-lift' } : null)} /> If the weak-side shooter lifts…</label>
          {riseRule && <>
            <Num label="…this far (m)" value={riseRule.rise} min={COACH_RULE_BOUNDS.rise[0]} max={COACH_RULE_BOUNDS.rise[1]} step={0.1} onChange={v => setRule('lift-rise', { ...riseRule, rise: v })} />
            <Seg value={riseRule.response} options={[{ id: 'stay-with-lift', label: 'Stay with him' }, { id: 'x-out', label: 'X-out' }]} onChange={v => setRule('lift-rise', { ...riseRule, response: v })} />
            <div className={s.hint}>{coachRuleSentence(riseRule)} <Fired at={ruleFired['lift-rise']} /></div>
          </>}
        </div>
        {a.coverage === 'switch' && rules.length > 0 && <div className={s.hint}>A switch already hands the roller to the guard on the ball, so these rules are off while you switch.</div>}
      </Section>

      <Section title="Exceptions" badge="coming">
        <div className={s.fcStub}>Different low man for a lineup (for example, your wing tags when the 5 is out). Not executable yet: the engine fixes who plays each role.</div>
        <div className={s.fcStub}>Against a named player, switch or trap. Not executable yet: saved answers cannot yet match a lineup.</div>
        <div className={s.hint}>Works today: click the low man and choose “No, stay home” so he never helps. Use “Change it from: this moment” for a one-time exception.</div>
      </Section>

      <Section title="Personnel">
        <div className={s.hint} style={{ marginTop: 0, marginBottom: 8 }}>Both teams. “Average” keeps the default for his height. Quick and slow change speed and sideways movement; size changes his reach and who he can guard.</div>
        <div className={s.fcGrid}>
          <span className={s.fcGridHead}>Player</span><span className={s.fcGridHead}>Quickness</span><span className={s.fcGridHead}>Size</span>
          {roster.map(id => <PersonRow key={id} id={id} label={`${id} ${who(id, voice)}`} p={personnel[id]} onQuick={q => setQuick(id, q)} onSize={z => setSize(id, z)} />)}
        </div>
      </Section>

      <Section title="Their offense">
        <div className={s.seg}>{COUNTERS.map(c => <button key={c.id} aria-pressed={config.counter === c.id} className={`${s.segBtn} ${config.counter === c.id ? s.segOn : ''}`} title={c.description} onClick={() => onCounter(c.id)}>{c.label}</button>)}</div>
        <div className={s.hint}>“Auto” lets them read your defense and choose. Pick one to force it.</div>
        {o && <>
          <Num label="Screen angle" value={o.screenAngle * 180 / Math.PI} min={-25} max={25} step={1} unit="°" onChange={v => onOpponent({ screenAngle: v * Math.PI / 180 })} />
          <Num label="Lift timing (earlier ← → later)" value={o.liftDelay} min={-0.2} max={0.6} step={0.05} unit=" s" onChange={v => onOpponent({ liftDelay: v })} />
          <Num label="Lift spacing (toward the sideline)" value={o.liftWidth} min={-0.7} max={0.7} step={0.05} unit=" m" onChange={v => onOpponent({ liftWidth: v })} />
          <div className={s.ctrlLabel}><span>They are allowed to…</span></div>
          <div className={s.seg}>
            {(['reject', 'rescreen', 'shortRoll'] as const).map(k => <button key={k} aria-pressed={o[k]} className={`${s.segBtn} ${o[k] ? s.segOn : ''}`} onClick={() => onOpponent({ [k]: !o[k] })}>{k === 'shortRoll' ? 'Short roll' : k === 'rescreen' ? 'Re-screen' : 'Reject'}</button>)}
          </div>
          <div className={s.hint}>These are permissions. They only use one when your defense gives them the chance, such as a reject against ice or a short roll against a trap or switch.</div>
        </>}
      </Section>

      <Section title="Model (assumptions)">
        <Num label="Reaction time" value={m.reactionDelay} min={0.05} max={0.6} step={0.01} unit=" s" onChange={v => onAssumption({ reactionDelay: v })} />
        <Num label="Defender top speed" value={m.maxSpeed} min={3} max={7} step={0.1} unit=" m/s" onChange={v => onAssumption({ maxSpeed: v })} />
        <Num label="Pass speed" value={m.passSpeed} min={7} max={16} step={0.5} unit=" m/s" onChange={v => onAssumption({ passSpeed: v })} />
        <div className={s.hint}>Modeled assumptions, not measurements. They set every window CourtIQ shows. Use Personnel for one player.</div>
      </Section>

      <Section title={`Timed cues (${cues.length})`}>
        {cues.length === 0 && <div className={s.hint} style={{ marginTop: 0 }}>None yet. Pause, choose “This moment” on a defender, or drag a player, and the cue appears here.</div>}
        {[...cues].sort((x, y) => x.at - y.at).map(c => (
          <div key={c.id} className={s.fcCue}><b>{c.at.toFixed(1)} s</b><span>{cueText(c)}</span><button className={s.fcDel} aria-label={`Delete cue at ${c.at.toFixed(1)} seconds`} onClick={() => dropCue(c.id)}>Delete</button></div>
        ))}
      </Section>
    </div>
  )
}

function PersonRow({ id, label, p, onQuick, onSize }: { id: PlayerId; label: string; p?: Personnel[PlayerId]; onQuick(q: Quick): void; onSize(z: Size): void }) {
  return <>
    <span>{label}</span>
    <select className={s.fcSel} aria-label={`${id} quickness`} value={quickOf(p)} onChange={e => onQuick(e.target.value as Quick)}><option value="quick">Quick</option><option value="average">Average</option><option value="slow">Slow</option></select>
    <select className={s.fcSel} aria-label={`${id} size`} value={sizeOf(p)} onChange={e => onSize(e.target.value as Size)}><option value="big">Big</option><option value="average">Average</option><option value="small">Small</option></select>
  </>
}
