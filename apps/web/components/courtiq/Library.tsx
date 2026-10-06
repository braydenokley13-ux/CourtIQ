'use client'

import { useMemo, useState } from 'react'
import { ANSWERS, COLLISIONS, CONCEPTS, SITUATIONS, applyAnswers, isOfferable, type AnswerPreset, type Voice } from '@courtiq/basketball/corpus'
import { simulateCached } from '@/lib/basketball/replayCache'
import { createDefaultConfig } from '@courtiq/basketball/scenario'
import { findTeachingMoment } from '@courtiq/basketball/explore'
import MiniCourt from './MiniCourt'
import s from './courtiq.module.css'

/** An executable basketball-problem corpus, not a play bank. */
export default function Library({ voice, onTry }: { voice: Voice; onTry(preset: AnswerPreset): void }) {
  const [tab, setTab] = useState<'answers' | 'words' | 'problems'>('answers')
  const p = voice.register === 'plain'
  return (
    <div className={s.page}>
      <div className={s.pageInner}>
        <div className={s.pageHead}>
          <div>
            <div className={s.kicker}><i />Library</div>
            <h1>Real problems. Real answers.</h1>
            <p>Every answer here runs. Try one in the Lab against an offense that reacts.</p>
          </div>
          <div className={s.seg}>
            {(['answers', 'problems', 'words'] as const).map(t => <button key={t} className={`${s.segBtn} ${tab === t ? s.segOn : ''}`} onClick={() => setTab(t)}>{t === 'answers' ? 'Answers' : t === 'problems' ? 'Problems' : 'Words'}</button>)}
          </div>
        </div>
        {tab === 'answers' && <div className={s.cardGrid}>{ANSWERS.filter(a => isOfferable(a.id)).map(a => <AnswerCard key={a.id} preset={a} voice={voice} onTry={onTry} />)}</div>}
        {tab === 'problems' && <div>{SITUATIONS.map(sit => (
          <div key={sit.id} className={s.situRow}>
            <div><h4>{p ? sit.plainTitle : sit.coachTitle}</h4><small>{sit.plainDescription}</small></div>
            <span className={`${s.badge} ${sit.status === 'ready' ? '' : s.badgeMuted}`}>{sit.status === 'ready' ? 'Runs today' : 'Coming'}</span>
            <span />
          </div>))}</div>}
        {tab === 'words' && <div>
          <table className={s.rules}><tbody>{CONCEPTS.map(c => <tr key={c.id}><td><b style={{ color: 'var(--ink)' }}>{c.coach}</b><br />{c.plain}</td><td>{c.definition}</td></tr>)}</tbody></table>
          <div className={s.sectionLabel}>Same word, different meaning</div>
          {COLLISIONS.map(c => <div key={c.word} className={s.hint}><b style={{ color: 'var(--ink)' }}>“{c.word}”</b> — {c.meanings.map(m => m.note).join(' · ')}</div>)}
        </div>}
      </div>
    </div>
  )
}

function AnswerCard({ preset, voice, onTry }: { preset: AnswerPreset; voice: Voice; onTry(p: AnswerPreset): void }) {
  const p = voice.register === 'plain'
  const { result, moment } = useMemo(() => {
    const base = createDefaultConfig()
    const result = simulateCached({ ...base, answer: applyAnswers(base.answer, [preset.id]) })
    return { result, moment: findTeachingMoment(result) }
  }, [preset])
  return (
    <div className={s.card} style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <MiniCourt result={result} openThreat={moment?.threatId ?? null} playing={false} />
      <div className={s.aka} style={{ margin: 0 }}>{preset.kind === 'coverage' ? 'Coverage' : preset.kind === 'helper' ? 'Help rule' : 'Ball defender'}</div>
      <h3 style={{ margin: 0, font: '600 17px var(--ui)' }}>{p ? preset.plainName : preset.coachName}</h3>
      <p className={s.hint} style={{ margin: 0, color: 'var(--ink-2)', fontSize: 13 }}>{p ? preset.plainDescription : preset.coachDescription}</p>
      <div className={s.gt} style={{ margin: 0 }}><span className={s.gives}>+ {p ? preset.gives.plain : preset.gives.coach}</span><span className={s.takes}>− {p ? preset.takes.plain : preset.takes.coach}</span></div>
      {preset.fidelity.level === 'approximate' && <div className={s.hint} style={{ marginTop: 0 }}>Approximate: {preset.fidelity.note}</div>}
      <div style={{ marginTop: 'auto' }}><button className={s.btn} onClick={() => onTry(preset)}>Run it in the Lab →</button></div>
    </div>
  )
}
