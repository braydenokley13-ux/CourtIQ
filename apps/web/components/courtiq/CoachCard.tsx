'use client'

import { useState } from 'react'
import type { Voice } from '@/lib/defense-lab/corpus'
import { answerAt } from '@/lib/defense-lab/simulation'
import type { CoachRule, CounterId, LabConfig, PlayerId, WorldFrame } from '@/lib/defense-lab/types'
import { coverageName, helpAmount, jobSentence, primaryJob, who } from './basketball'
import FullControl, { Seg, type Change } from './FullControl'
import s from './courtiq.module.css'

/** Controls attach to the basketball role that was clicked: you coach a player,
 * not a settings page. "Full control" opens everything for power users. */
export default function CoachCard({ id, frame, config, voice, onChange, onClose, onOpponent, onAssumption, onCounter, onConfig, editFrom, onEditFrom, time, ruleFired }: {
  editFrom: 'start' | 'now'; onEditFrom(v: 'start' | 'now'): void; time: number; ruleFired: Partial<Record<CoachRule['kind'], number | null>>
  id: PlayerId; frame: WorldFrame; config: LabConfig; voice: Voice; onChange: Change; onClose(): void
  onOpponent(patch: Partial<NonNullable<LabConfig['opponent']>>): void; onAssumption(patch: Partial<LabConfig['assumptions']>): void; onCounter(c: CounterId): void; onConfig(f: (c: LabConfig) => LabConfig): void
}) {
  const [full, setFull] = useState(false)
  // The rules in force at this moment (timed edits included).
  const a = answerAt(config, time)
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

      {!isOffense && time > 0.05 && <>
        <div className={s.ctrlLabel}>{p ? 'Change it from' : 'Apply from'}</div>
        <Seg value={editFrom} options={[{ id: 'start', label: p ? 'The start of the play' : 'Start' }, { id: 'now', label: `${p ? 'This moment' : 'Now'} (${time.toFixed(1)} s)` }]} onChange={onEditFrom} />
        {editFrom === 'now' && <div className={s.hint}>Everything before {time.toFixed(1)} s stays exactly the same; your change plays out from here.</div>}
      </>}
      <button className={s.ghostLink} aria-expanded={full} onClick={() => setFull(f => !f)}>{full ? 'Hide full control' : 'Full control →'}</button>
      {full && <FullControl config={config} voice={voice} ruleFired={ruleFired} onChange={onChange} onOpponent={onOpponent} onAssumption={onAssumption} onCounter={onCounter} onConfig={onConfig} />}
    </div>
  )
}
