'use client'

import { describeTradeoff, explainMoment, formatSeconds, type Voice } from '@/lib/defense-lab/corpus'
import { attackIntentLabel, type AttackPreview, type AttackReport } from '@/lib/defense-lab/attack'
import type { ComparisonResult } from '@/lib/defense-lab/analytics'
import type { FixOption, TeachingMoment } from '@/lib/defense-lab/explore'
import type { ThreatId } from '@/lib/defense-lab/types'
import { ROLE_OF, threatShort } from './basketball'
import s from './courtiq.module.css'

export function momentCopy(m: TeachingMoment, voice: Voice) {
  return explainMoment({ threatId: m.threatId, openFor: m.openFor, defenderNeeds: m.defenderNeeds ?? undefined, responsibleRole: m.bestDefenderId ? ROLE_OF[m.bestDefenderId] : undefined, pulledRole: m.pulledDefenderId ? ROLE_OF[m.pulledDefenderId] : undefined, cause: m.cause }, voice)
}

export function MomentPanel({ moment, voice, onWhy, onFix, onBreak, onSave, whyOn, fixesReady }: { moment: TeachingMoment; voice: Voice; onWhy(): void; onFix(): void; onBreak(): void; onSave(): void; whyOn: boolean; fixesReady: boolean }) {
  const copy = momentCopy(moment, voice)
  return (
    <div className={s.panel} role="dialog" aria-label="The problem">
      <div className={s.panelKicker}><span className={s.pulseDot} />Here’s the problem</div>
      <h2>{copy.headline}</h2>
      <p>{copy.body}</p>
      <div className={s.numbers}>
        <div className={`${s.number} ${s.numThreat}`}><b>{formatSeconds(moment.openFor)}</b><span>{voice.register === 'plain' ? 'open before anyone gets there' : 'window'}</span></div>
        {moment.defenderNeeds != null && <div className={`${s.number} ${s.numWarn}`}><b>{formatSeconds(moment.defenderNeeds)}</b><span>{voice.register === 'plain' ? `the closest defender needs` : 'closest arrival'}{moment.releaseIn != null ? ` (shot ready in ${formatSeconds(moment.releaseIn)})` : ''}</span></div>}
      </div>
      <div className={s.row}>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={onFix} disabled={!fixesReady}>{fixesReady ? 'How do I fix it?' : 'Testing fixes…'}</button>
        <button className={s.btn} onClick={onWhy} aria-pressed={whyOn}>{whyOn ? 'Back to game view' : 'Show me why'}</button>
      </div>
      <div className={s.row} style={{ marginTop: 8 }}>
        <button className={s.btn} onClick={onSave}>This is fine — save it</button>
        <button className={`${s.btn}`} style={{ color: '#ff9db6' }} onClick={onBreak}>Break my defense</button>
      </div>
      <div className={s.honesty}>Measured from this run: positions, speeds and reaction time are modeled for high-school players. It doesn’t predict makes or misses.</div>
    </div>
  )
}

export function HoldsPanel({ voice, onBreak, onSave, onAgain }: { voice: Voice; onBreak(): void; onSave(): void; onAgain(): void }) {
  return (
    <div className={s.panel}>
      <div className={`${s.panelKicker} ${s.good}`}>It held</div>
      <h2>{voice.register === 'plain' ? 'Nobody got open in this run.' : 'No window opened against this action.'}</h2>
      <p>That’s against this one offense. Real teams adjust — let CourtIQ attack it.</p>
      <div className={s.row}>
        <button className={`${s.btn} ${s.btnAttack}`} onClick={onBreak}>Break my defense</button>
        <button className={s.btn} onClick={onSave}>Save as our answer</button>
        <button className={s.btn} onClick={onAgain}>Run again</button>
      </div>
    </div>
  )
}

function Effects({ fix, voice }: { fix: FixOption; voice: Voice }) {
  if (!fix.improves.length && !fix.opens.length) return <div className={s.effects}><span className={`${s.effect} ${s.effectNone}`}>{fix.id === 'keep' ? 'Accept this tradeoff' : 'No real change'}</span></div>
  return (
    <div className={s.effects}>
      {fix.improves.map(c => <span key={`i${c.threatId}`} className={`${s.effect} ${s.effectGood}`}>{threatShort(c.threatId, voice)} −{(c.before - c.after).toFixed(2)} s</span>)}
      {fix.opens.map(c => <span key={`o${c.threatId}`} className={`${s.effect} ${s.effectBad}`}>{threatShort(c.threatId, voice)} +{(c.after - c.before).toFixed(2)} s</span>)}
    </div>
  )
}

export function FixPanel({ fixes, voice, busy, onHover, onPick, onClose, onKeep }: { fixes: FixOption[]; voice: Voice; busy: boolean; onHover(f: FixOption | null): void; onPick(f: FixOption): void; onClose(): void; onKeep(): void }) {
  return (
    <div className={s.panel} onMouseLeave={() => onHover(null)}>
      <button className={s.closeX} onClick={onClose} aria-label="Close">×</button>
      <div className={`${s.panelKicker} ${s.def}`}>Your call</div>
      <h2>How do you want to handle it?</h2>
      <p>Each option was already run. Hover to see where your defenders would be instead — then pick one to watch it.</p>
      {busy && !fixes.length && <p>Testing options…</p>}
      <div className={s.fixes}>
        {fixes.filter(f => f.id !== 'keep').map(f => (
          <button key={f.id} className={s.fix} onMouseEnter={() => onHover(f)} onFocus={() => onHover(f)} onClick={() => onPick(f)}>
            <strong>{f.plain}</strong>
            <span>{f.detail}</span>
            <Effects fix={f} voice={voice} />
            <em>→</em>
          </button>
        ))}
        <button className={s.fix} onClick={onKeep}>
          <strong>Keep it as-is</strong>
          <span>Accept this tradeoff — every defense gives something up.</span>
          <em>→</em>
        </button>
      </div>
      <div className={s.hint}>Or coach it yourself: click any defender on the floor.</div>
    </div>
  )
}

const ORDER: ThreatId[] = ['lift', 'corner', 'roll', 'drive', 'pop', 'strong']
export function ComparePanel({ comparison, voice, label, onAgain, onBreak, onSave, onMore, onClose }: { comparison: ComparisonResult; voice: Voice; label: string; onAgain(): void; onBreak(): void; onSave(): void; onMore(): void; onClose(): void }) {
  const rows = ORDER.map(id => comparison.tradeoffs.find(t => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t && (t.before > 0.04 || t.after > 0.04))
  const sentence = describeTradeoff(rows.map(r => ({ threatId: r.id, before: r.before, after: r.after })), voice)
  const max = Math.max(0.5, ...rows.flatMap(r => [r.before, r.after]))
  const better = rows.some(r => r.direction === 'closes'), worse = rows.some(r => r.direction === 'opens')
  return (
    <div className={s.panel}>
      <button className={s.closeX} onClick={onClose} aria-label="Close">×</button>
      <div className={`${s.panelKicker} ${better && !worse ? s.good : s.def}`}>{label}</div>
      <h2>{sentence}</h2>
      <p>The faint figures on the court are where your defenders were before. Trails show where each one went instead.</p>
      <div className={s.bars}>
        {rows.length ? rows.map(r => (
          <div key={r.id} className={s.bar}>
            <span>{threatShort(r.id, voice)}</span>
            <div className={s.barTrack}>
              <div className={s.barBefore} style={{ width: `${r.before / max * 100}%` }} />
              <div className={s.barAfter} style={{ width: `${r.after / max * 100}%`, background: r.direction === 'opens' ? 'var(--threat)' : r.direction === 'closes' ? 'var(--good)' : 'var(--ink-2)' }} />
            </div>
            <span className={s.barVal}>{r.before.toFixed(2)}→{r.after.toFixed(2)}</span>
          </div>
        )) : <p>No pass or drive opened in either version.</p>}
      </div>
      <div className={s.hint} style={{ marginTop: 0 }}>Seconds open before anyone could get there. Faint bar: before. Bright bar: now.</div>
      <div className={s.row} style={{ marginTop: 14 }}>
        <button className={`${s.btn} ${s.btnAttack}`} onClick={onBreak}>Break it</button>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={onSave}>Save as our answer</button>
      </div>
      <div className={s.row} style={{ marginTop: 8 }}>
        <button className={s.btn} onClick={onAgain}>Watch again</button>
        <button className={s.btn} onClick={onMore}>Try something else</button>
      </div>
    </div>
  )
}

export function BreakBar({ progress, attempts, onCancel }: { progress: number; attempts: AttackPreview[]; onCancel(): void }) {
  const broke = attempts.filter(a => a.verdict !== 'held').length
  return (
    <>
      <div className={s.breakBar} role="status">
        <span className={s.pulseDot} style={{ color: '#ff3d6e' }} />
        <div>
          <strong>Attacking your defense</strong><br />
          <span>{attempts.length} counters run · {broke} found something</span>
        </div>
        <div className={s.breakTrack}><div className={s.breakFill} style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        <button className={s.btn} onClick={onCancel}>Stop</button>
      </div>
      <div className={s.attempts}>
        {attempts.map(a => (
          <div key={a.id} className={`${s.attempt} ${a.verdict === 'held' ? s.attemptHeld : s.attemptBroke}`}><i />{a.label}{a.verdict !== 'held' ? ' — opening' : ' — held'}</div>
        ))}
      </div>
    </>
  )
}

export function BreakMomentPanel({ report, voice, onFix, onAccept, onReplay, onExit }: { report: AttackReport; voice: Voice; onFix(): void; onAccept(): void; onReplay(): void; onExit(): void }) {
  const w = report.selected.witness!
  const copy = explainMoment({ threatId: w.threatId, openFor: Math.max(0, w.interval.end - w.interval.start), defenderNeeds: w.arrivalSeconds, responsibleRole: w.limitingRole, cause: 'unknown' }, voice)
  const how = attackIntentLabel(report.selected)
  const retest = report.pairedRetest
  return (
    <div className={s.panel}>
      <div className={`${s.panelKicker} ${s.attack}`}><span className={s.pulseDot} />They broke it</div>
      <h2>{copy.headline}</h2>
      <p><b style={{ color: 'var(--ink)' }}>How:</b> {how === 'Their current offense' ? 'Their normal offense already finds this.' : how}. {copy.body}</p>
      <div className={s.numbers}>
        <div className={`${s.number} ${s.numThreat}`}><b>{formatSeconds(Math.max(0, w.interval.end - w.interval.start))}</b><span>open</span></div>
        <div className={`${s.number} ${s.numWarn}`}><b>{formatSeconds(w.arrivalSeconds)}</b><span>closest defender needs</span></div>
      </div>
      {retest && <p style={{ fontSize: 13 }}>{retest.current.witness ? 'Their previous counter still works against your new answer.' : 'Your fix holds against their previous counter — this is a new way in.'}</p>}
      <div className={s.row}>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={onFix}>Fix it</button>
        <button className={s.btn} onClick={onReplay}>Watch it again</button>
      </div>
      <div className={s.row} style={{ marginTop: 8 }}>
        <button className={s.btn} onClick={onAccept}>We can live with that</button>
        <button className={s.btn} onClick={onExit}>Leave Break Mode</button>
      </div>
      <div className={s.honesty}>CourtIQ tried {report.budget.used} basketball-legal counters (screen angle, lift timing and spacing, reject, re-screen, short roll). It’s a search, not a guarantee — real teams have more.</div>
    </div>
  )
}

export function BreakHeldPanel({ report, onExit, onSave }: { report: AttackReport; onExit(): void; onSave(): void }) {
  return (
    <div className={s.panel}>
      <div className={`${s.panelKicker} ${s.good}`}>It held up</div>
      <h2>CourtIQ couldn’t break it.</h2>
      <p>{report.budget.used} counters tried — none found an opening the offense could actually use in time. Against these counters and assumptions, this answer holds.</p>
      <div className={s.row}>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={onSave}>Save as our answer</button>
        <button className={s.btn} onClick={onExit}>Back to the Lab</button>
      </div>
      <div className={s.honesty}>A bounded search isn’t a guarantee. It does not include every offense or player-specific matchups.</div>
    </div>
  )
}
