'use client'

import { useMemo, useState } from 'react'
import { ANSWERS, COLLISIONS, GOALS, MODELED_COVERAGES, SITUATIONS, answerById, applyAnswers, goalById, isOfferable, type Voice } from '@/lib/defense-lab/corpus'
import { findTeachingMoment } from '@/lib/defense-lab/explore'
import { simulateCached } from '@/lib/defense-lab/replayCache'
import { createDefaultConfig } from '@/lib/defense-lab/scenario'
import type { LabConfig, SimulationResult } from '@/lib/defense-lab/types'
import MiniCourt from './MiniCourt'
import s from './courtiq.module.css'

export type EntryStep = 'situation' | 'goal' | 'answers' | 'name'
export interface EntryChoice { presetIds: string[]; config: LabConfig; term: string | null; goalId: string | null }

const COVERAGE_IDS: string[] = [...MODELED_COVERAGES]

export default function Entry({ voice, onPreview, onDone, onExplore }: { voice: Voice; onPreview(result: SimulationResult | null): void; onDone(choice: EntryChoice): void; onExplore(): void }) {
  const [step, setStep] = useState<EntryStep>('situation')
  const [goalId, setGoalId] = useState<string | null>(null)
  const [answerId, setAnswerId] = useState<string | null>(null)
  const [custom, setCustom] = useState('')
  const plain = voice.register === 'plain'

  const options = useMemo(() => {
    const goal = goalId ? goalById(goalId) : null
    const ids = (goal && goal.mode !== 'custom' && goal.answers.length ? goal.answers.map(a => a.answerId) : COVERAGE_IDS).filter(isOfferable)
    return ids.slice(0, goal?.mode === 'custom' || !goal ? 5 : 4).map(id => {
      const preset = answerById(id)!
      const base = createDefaultConfig()
      const config: LabConfig = { ...base, answer: applyAnswers(base.answer, [id]) }
      const result = simulateCached(config)
      const moment = findTeachingMoment(result)
      const why = goal?.answers.find(a => a.answerId === id)?.why
      return { id, preset, config, result, moment, why }
    })
  }, [goalId])

  if (step === 'situation') {
    return (
      <div className={s.entry}>
        <div className={s.kicker}><i />Defense lab</div>
        <h1 className={s.question}>What are you working on?</h1>
        <p className={s.sub}>Pick a problem. We’ll put real basketball on the floor in seconds — no setup.</p>
        <div className={s.choices}>
          {SITUATIONS.filter(x => x.status === 'ready').map(sit => (
            <button key={sit.id} className={s.choice} onClick={() => setStep('goal')}>
              <strong>{plain ? sit.plainTitle : sit.coachTitle}</strong>
              <span>{sit.plainDescription}</span>
              <em>→</em>
            </button>
          ))}
        </div>
        <div className={s.soonRow}>
          <span className={s.soonLabel}>Next up</span>
          {SITUATIONS.filter(x => x.status !== 'ready' && x.id !== 'explore').map(sit => <span key={sit.id} className={s.soonChip}>{plain ? sit.plainTitle : sit.coachTitle.split(' (')[0]}</span>)}
        </div>
        <button className={s.ghostLink} onClick={onExplore}>I just want to explore →</button>
      </div>
    )
  }

  if (step === 'goal') {
    return (
      <div className={s.entry}>
        <button className={s.back} onClick={() => setStep('situation')}>← Back</button>
        <div className={s.kicker}><i />{plain ? 'Ball screens · top of the key' : 'High P&R · middle'}</div>
        <h1 className={s.question}>What are you trying to stop?</h1>
        <p className={s.sub}>There’s no wrong answer. Every choice gives something up — we’ll show you what.</p>
        <div className={s.choices}>
          {GOALS.map(goal => (
            <button key={goal.id} className={s.choice} onClick={() => { setGoalId(goal.id); setStep('answers'); setAnswerId(null) }}>
              <strong>{plain ? goal.plain : goal.coach}</strong>
              <span>{goal.meaning}</span>
              <em>→</em>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const chosen = answerId ? options.find(o => o.id === answerId) : null
  if (step === 'name' && chosen) {
    const aliases = chosen.preset.aliases.slice(0, 4)
    const collision = COLLISIONS.find(c => c.word.toLowerCase() === custom.trim().toLowerCase() || aliases.some(a => a.word === c.word && custom === a.word))
    const finish = (word: string | null) => onDone({ presetIds: [chosen.id], config: chosen.config, term: word, goalId })
    return (
      <div className={s.entry}>
        <button className={s.back} onClick={() => setStep('answers')}>← Back</button>
        <div className={s.kicker}><i />{chosen.preset.plainName}</div>
        <h1 className={s.question}>What does your team call it?</h1>
        <p className={s.sub}>CourtIQ will use your word everywhere — in the Lab, in Our System and when you teach it. Coaches often call this <b>{chosen.preset.coachName}</b>.</p>
        <div className={s.nameRow}>
          {aliases.map(a => <button key={a.word} className={s.chip} onClick={() => finish(a.word)}>{a.word}</button>)}
          <input className={s.nameInput} placeholder="Something else…" value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) finish(custom.trim()) }} aria-label="Your team's word" />
          {custom.trim() && <button className={`${s.chip} ${s.chipOn}`} onClick={() => finish(custom.trim())}>Use “{custom.trim()}”</button>}
        </div>
        {collision && <div className={s.warnNote}>Heads up: “{collision.word}” means different things on different teams ({collision.meanings.map(m => m.note).join('; ')}). That’s fine — CourtIQ will use it the way you mean it.</div>}
        <button className={s.ghostLink} onClick={() => finish(null)}>Doesn’t matter — run it →</button>
      </div>
    )
  }

  const goal = goalId ? goalById(goalId) : null
  return (
    <div className={s.answers}>
      <div className={s.answersHead}>
        <div>
          <button className={s.back} onClick={() => setStep('goal')}>← Back</button>
          <h2>{goal?.mode === 'custom' ? 'Which one is closest to what you do?' : plain ? `A few ways teams ${goal ? goal.plain.toLowerCase().replace(/^show me my options$/, 'guard it') : 'guard it'}.` : 'Common answers'}</h2>
          <p>These diagrams are real runs, not drawings. Hover one to watch it on the court. Pick the one you recognize.</p>
        </div>
      </div>
      <div className={s.answerRow} onMouseLeave={() => onPreview(null)}>
        {options.map(o => (
          <button key={o.id} className={`${s.answer} ${answerId === o.id ? s.answerOn : ''}`} onMouseEnter={() => onPreview(o.result)} onFocus={() => onPreview(o.result)} onClick={() => { setAnswerId(o.id); setStep('name') }}>
            <MiniCourt result={o.result} openThreat={o.moment?.threatId ?? null} />
            <h3>{plain ? o.preset.plainName : o.preset.coachName}</h3>
            <p>{o.why ?? (plain ? o.preset.plainDescription : o.preset.coachDescription)}</p>
            <div className={s.gt}>
              <span className={s.gives}>+ {plain ? o.preset.gives.plain : o.preset.gives.coach}</span>
              <span className={s.takes}>− {plain ? o.preset.takes.plain : o.preset.takes.coach}</span>
            </div>
            <div className={s.aka}>Often called <b>{o.preset.aliases.slice(0, 2).map(a => a.word).join(' / ') || o.preset.coachName}</b></div>
          </button>
        ))}
      </div>
    </div>
  )
}

export { ANSWERS }
