'use client'

import { useState } from 'react'
import type { Voice } from '@/lib/defense-lab/corpus'
import { COACH_RULE_BOUNDS, coachRuleSentence } from '@/lib/defense-lab/coachRules'
import { COUNTERS } from '@/lib/defense-lab/scenario'
import type { CoachRule, CounterId, LabConfig, PlayerId, TeamAnswer, WorldFrame } from '@/lib/defense-lab/types'
import { coverageName, helpAmount, jobSentence, primaryJob, who } from './basketball'
import s from './courtiq.module.css'

type Change = (patch: Partial<TeamAnswer>, label: string) => void

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange(v: T): void }) {
  return <div className={s.seg}>{options.map(o => <button key={o.id} className={`${s.segBtn} ${value === o.id ? s.segOn : ''}`} onClick={() => value !== o.id && onChange(o.id)}>{o.label}</button>)}</div>
}

/** Controls attach to the basketball role that was clicked: you coach a player,
 * not a settings page. "Full control" opens everything for power users. */
export default function CoachCard({ id, frame, config, voice, onChange, onClose, onOpponent, onAssumption, onCounter }: {
  id: PlayerId; frame: WorldFrame; config: LabConfig; voice: Voice; onChange: Change; onClose(): void
  onOpponent(patch: Partial<NonNullable<LabConfig['opponent']>>): void; onAssumption(patch: Partial<LabConfig['assumptions']>): void; onCounter(c: CounterId): void
}) {
  const [full, setFull] = useState(false)
  const a = config.answer
  const p = voice.register === 'plain'
  const job = primaryJob(frame, id)
  const isOffense = id.startsWith('O')
  return (
    <div className={s.coach} style={{ left: 16, top: 150, maxHeight: 'calc(100vh - 250px)', overflow: 'auto' }} role="dialog" aria-label={`Coach ${who(id, voice)}`}>
      <button className={s.closeX} onClick={onClose} aria-label="Close">×</button>
      <h3>{who(id, voice)}</h3>
      <div className={s.coachRole}>{isOffense ? 'Their offense — CourtIQ plays him. Use Break Mode to make him smarter.' : 'Your defender · click the floor to move him'}</div>
      {!isOffense && <div className={s.job}><b>Job right now</b>{jobSentence(job, voice)}</div>}

      {id === 'D1' && <>
        <div className={s.ctrlLabel}>{p ? 'When the screen comes' : 'Screen navigation'}</div>
        <Seg value={a.poa} options={[{ id: 'over', label: p ? 'Fight over it' : 'Over' }, { id: 'under', label: p ? 'Go under it' : 'Under' }]} onChange={v => onChange({ poa: v }, v === 'over' ? 'Fight over' : 'Go under')} />
      </>}

      {id === 'D5' && <>
        <div className={s.ctrlLabel}>{p ? 'How we guard the screen' : 'Coverage'}</div>
        <Seg value={a.coverage} options={(['drop', 'hedge', 'blitz', 'switch', 'ice'] as const).map(c => ({ id: c, label: coverageName({ ...a, coverage: c }, voice) }))} onChange={v => onChange({ coverage: v, ...(v === 'switch' ? { tag: false } : { tag: true }) }, coverageName({ ...a, coverage: v }, voice))} />
        <div className={s.ctrlLabel}><span>{p ? 'How far back he waits' : 'Drop depth'}</span><span>{a.bigDepth.toFixed(1)} m</span></div>
        <input className={s.range} type="range" min={1.6} max={6} step={0.1} value={a.bigDepth} onChange={e => onChange({ bigDepth: Number(e.target.value) }, 'Big depth')} />
        <div className={s.rangeEnds}><span>{p ? 'At the rim' : 'Deep'}</span><span>{p ? 'Up at the screen' : 'At the level'}</span></div>
      </>}

      {id === 'D3' && <>
        <div className={s.ctrlLabel}>{p ? 'Does he help on the screener?' : 'Tag the roller'}</div>
        <Seg value={a.tag ? 'yes' : 'no'} options={[{ id: 'yes', label: p ? 'Yes, help' : 'Tag' }, { id: 'no', label: p ? 'No, stay home' : 'No tag' }]} onChange={v => onChange({ tag: v === 'yes' }, v === 'yes' ? 'Help on the roller' : 'Stay home')} />
        {a.tag && <>
          <div className={s.ctrlLabel}><span>{p ? 'How far he helps' : 'Tag depth'}</span><span>{helpAmount(a.tagDepth, voice)}</span></div>
          <input className={s.range} type="range" min={0} max={1} step={0.05} value={a.tagDepth} onChange={e => onChange({ tagDepth: Number(e.target.value) }, 'Help amount')} />
          <div className={s.rangeEnds}><span>{p ? 'Stay near shooter' : 'Shallow'}</span><span>{p ? 'All the way' : 'Deep'}</span></div>
          <div className={s.ctrlLabel}>{p ? 'He goes back when' : 'Release'}</div>
          <Seg value={a.recovery} options={[{ id: 'on-pass', label: p ? 'The ball is passed' : 'On the pass' }, { id: 'roller-secured', label: p ? 'The big is back' : 'Roller secured' }]} onChange={v => onChange({ recovery: v }, 'Release timing')} />
          <div className={s.hint}>Tip: when paused, drag the white dot on the floor to set exactly where he helps.</div>
        </>}
      </>}

      {id === 'D4' && <>
        <div className={s.ctrlLabel}>{p ? 'When the helper leaves' : 'Backside rule'}</div>
        <Seg value={a.backside} options={[{ id: 'x-out', label: p ? 'Swap players with him' : 'X-out' }, { id: 'stay', label: p ? 'Stay with my shooter' : 'Stay' }]} onChange={v => onChange({ backside: v }, v === 'x-out' ? 'Swap on the pass' : 'Stay home')} />
        <div className={s.ctrlLabel}>{p ? 'When to swap' : 'Rotation timing'}</div>
        <Seg value={a.rotationTiming} options={[{ id: 'on-pass', label: p ? 'When the ball is passed' : 'On the pass' }, { id: 'early', label: p ? 'Before the pass' : 'Early' }]} onChange={v => onChange({ rotationTiming: v }, v === 'early' ? 'Rotate early' : 'Rotate on the pass')} />
      </>}

      {id === 'D2' && <div className={s.hint}>{p ? 'He stays home on the near-side shooter in this action.' : 'Strong-side defender stays attached; no strong-side help in this policy.'}</div>}

      <button className={s.ghostLink} onClick={() => setFull(f => !f)}>{full ? 'Hide full control' : 'Full control →'}</button>
      {full && <FullControl config={config} voice={voice} onChange={onChange} onOpponent={onOpponent} onAssumption={onAssumption} onCounter={onCounter} />}
    </div>
  )
}

function Num({ label, value, min, max, step, onChange, unit = '' }: { label: string; value: number; min: number; max: number; step: number; onChange(v: number): void; unit?: string }) {
  return <>
    <div className={s.ctrlLabel}><span>{label}</span><span>{value.toFixed(step < 0.1 ? 2 : 1)}{unit}</span></div>
    <input className={s.range} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
  </>
}

function FullControl({ config, onChange, onOpponent, onAssumption, onCounter }: { config: LabConfig; voice: Voice; onChange: Change; onOpponent(p: Partial<NonNullable<LabConfig['opponent']>>): void; onAssumption(p: Partial<LabConfig['assumptions']>): void; onCounter(c: CounterId): void }) {
  const a = config.answer, o = config.opponent, m = config.assumptions
  const rules = a.coachRules ?? []
  const setRule = (kind: CoachRule['kind'], rule: CoachRule | null) => onChange({ coachRules: [...rules.filter(r => r.kind !== kind), ...(rule ? [rule] : [])] }, 'Coach rule')
  const depthRule = rules.find(r => r.kind === 'roller-depth') as Extract<CoachRule, { kind: 'roller-depth' }> | undefined
  const riseRule = rules.find(r => r.kind === 'lift-rise') as Extract<CoachRule, { kind: 'lift-rise' }> | undefined
  return (
    <div>
      <div className={s.sectionLabel}>Our rules (if → then)</div>
      <label className={s.ctrlLabel}><span><input type="checkbox" checked={!!depthRule} onChange={e => setRule('roller-depth', e.target.checked ? { kind: 'roller-depth', depth: 4.5, response: 'low-man-tags' } : null)} /> If the roller gets deep…</span></label>
      {depthRule && <>
        <Num label="…past this depth (m from baseline)" value={depthRule.depth} min={COACH_RULE_BOUNDS.depth[0]} max={COACH_RULE_BOUNDS.depth[1]} step={0.1} onChange={v => setRule('roller-depth', { ...depthRule, depth: v })} />
        <Seg value={depthRule.response} options={[{ id: 'low-man-tags', label: 'Low man tags' }, { id: 'big-recovers', label: 'Big recovers' }]} onChange={v => setRule('roller-depth', { ...depthRule, response: v })} />
        <div className={s.hint}>{coachRuleSentence(depthRule)}</div>
      </>}
      <label className={s.ctrlLabel}><span><input type="checkbox" checked={!!riseRule} onChange={e => setRule('lift-rise', e.target.checked ? { kind: 'lift-rise', rise: 1.5, response: 'stay-with-lift' } : null)} /> If the weak-side shooter lifts…</span></label>
      {riseRule && <>
        <Num label="…this far (m)" value={riseRule.rise} min={COACH_RULE_BOUNDS.rise[0]} max={COACH_RULE_BOUNDS.rise[1]} step={0.1} onChange={v => setRule('lift-rise', { ...riseRule, rise: v })} />
        <Seg value={riseRule.response} options={[{ id: 'stay-with-lift', label: 'Stay with him' }, { id: 'x-out', label: 'X-out' }]} onChange={v => setRule('lift-rise', { ...riseRule, response: v })} />
        <div className={s.hint}>{coachRuleSentence(riseRule)}</div>
      </>}

      <div className={s.sectionLabel}>Their offense</div>
      <div className={s.seg}>{COUNTERS.map(c => <button key={c.id} className={`${s.segBtn} ${config.counter === c.id ? s.segOn : ''}`} title={c.description} onClick={() => onCounter(c.id)}>{c.label}</button>)}</div>
      {o && <>
        <Num label="Screen angle" value={o.screenAngle * 180 / Math.PI} min={-25} max={25} step={1} unit="°" onChange={v => onOpponent({ screenAngle: v * Math.PI / 180 })} />
        <Num label="Lift delay" value={o.liftDelay} min={-0.2} max={0.6} step={0.05} unit=" s" onChange={v => onOpponent({ liftDelay: v })} />
        <div className={s.seg} style={{ marginTop: 8 }}>
          {(['reject', 'rescreen', 'shortRoll'] as const).map(k => <button key={k} className={`${s.segBtn} ${o[k] ? s.segOn : ''}`} onClick={() => onOpponent({ [k]: !o[k] })}>{k === 'shortRoll' ? 'Short roll' : k === 'rescreen' ? 'Re-screen' : 'Reject'}</button>)}
        </div>
      </>}

      <div className={s.sectionLabel}>Our players & assumptions</div>
      <Num label="Reaction time" value={m.reactionDelay} min={0.05} max={0.6} step={0.01} unit=" s" onChange={v => onAssumption({ reactionDelay: v })} />
      <Num label="Top speed" value={m.maxSpeed} min={3} max={7} step={0.1} unit=" m/s" onChange={v => onAssumption({ maxSpeed: v })} />
      <Num label="Pass speed" value={m.passSpeed} min={7} max={16} step={0.5} unit=" m/s" onChange={v => onAssumption({ passSpeed: v })} />
      <div className={s.hint}>These numbers drive every window CourtIQ shows. Set them to your players.</div>
    </div>
  )
}
