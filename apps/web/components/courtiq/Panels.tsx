'use client'

import { useState } from 'react'
import { explainMoment, type Voice } from '@/lib/defense-lab/corpus'
import { attackIntentLabel, type AttackPreview, type AttackReport } from '@/lib/defense-lab/attack'
import type { Divergence, FixOption, Robustness, TeachingMoment } from '@/lib/defense-lab/explore'
import type { AttackChange } from '@/lib/defense-lab/attack'
import type { PlayerId, ThreatId } from '@/lib/defense-lab/types'
import { ROLE_OF } from './basketball'
import { FIX_PLAIN, cap, opening, person, spoken, tradeoffWords, type Delta } from './speech'
import s from './courtiq.module.css'

export function momentCopy(m: TeachingMoment, voice: Voice) {
  return explainMoment({ threatId: m.threatId, openFor: m.openFor, defenderNeeds: m.defenderNeeds ?? undefined, responsibleRole: m.bestDefenderId ? ROLE_OF[m.bestDefenderId] : undefined, pulledRole: m.pulledDefenderId ? ROLE_OF[m.pulledDefenderId] : undefined, cause: m.cause, receiverRole: ROLE_OF[m.receiverId], releaseIn: m.releaseIn ?? undefined, finish: m.finish }, voice)
}

/** One cause, named by who did what — a sentence a player could hear. */
function causeSentence(m: TeachingMoment, voice: Voice): string | null {
  const p = voice.register === 'plain'
  const pulled = m.pulledDefenderId, rec = person(m.receiverId, voice)
  switch (m.cause) {
    case 'deep-tag': {
      if (!pulled) return null
      const own = pulled.slice(1) === m.receiverId.slice(1)
      const left = own ? (p ? `his own man, ${rec}` : `his man ${rec}`) : rec
      return p ? `${cap(person(pulled, voice))} ran all the way to the screener, so nobody was left for ${left}.` : `${person(pulled, voice)} tagged deep; nobody left for ${left}.`
    }
    case 'late-rotation': return p ? `Nobody stepped in front of ${rec} in time.` : `Late rotation to ${rec}.`
    case 'switch-mismatch': return pulled ? (p ? `After the switch, ${person(pulled, voice)} is guarding someone bigger or quicker than him — and ${rec} goes right at it.` : `Switch mismatch: ${rec} attacks ${person(pulled, voice)}.`) : null
    case 'two-on-ball': return p ? `Two of your players went to the ball, so ${rec} caught it with room behind them.` : `Two on the ball; ${rec} plays 4-on-3 behind it.`
    case 'big-too-deep': return p ? 'Your big waited too far back, so the ball handler had room.' : 'Big too deep — handler has space.'
    case 'big-too-high': return p ? 'Your big came up too high, so the screener had a path to the rim.' : 'Big too high — roller behind him.'
    default: return null
  }
}

function timeSentence(m: TeachingMoment, voice: Voice): string | null {
  if (m.releaseIn == null || m.defenderNeeds == null) return null
  const late = m.defenderNeeds - m.releaseIn
  const shot = m.finish === 'layup' || (m.finish == null && (m.threatId === 'drive' || m.threatId === 'roll')) ? 'layup' : 'shot'
  const who = m.bestDefenderId ? person(m.bestDefenderId, voice) : 'your closest defender'
  if (voice.register !== 'plain') return `Release ready ${spoken(m.releaseIn, voice)}; ${who} needs ${spoken(m.defenderNeeds, voice)}${late > 0 ? ` — late ${spoken(late, voice)}` : ''}.`
  if (late <= 0) return `${cap(who)} gets there just in time — but only just.`
  // Never say the same spoken time for both and then call him late.
  const ready = spoken(m.releaseIn, voice), needs = spoken(m.defenderNeeds, voice)
  const needsText = needs === ready ? 'a little longer than that' : needs
  return `He’s ready to ${shot === 'layup' ? 'finish' : 'shoot'} in ${ready}. ${cap(who)} needs ${needsText} to get there — ${late < 0.15 ? 'a hair late' : `late by ${spoken(late, voice)}`}. That’s an open ${shot}.`
}

export function MomentPanel({ moment, voice, onWhy, onFix, onBreak, onSave, whyOn, fixesReady, robust }: { robust: Robustness | null; moment: TeachingMoment; voice: Voice; onWhy(): void; onFix(): void; onBreak(): void; onSave(): void; whyOn: boolean; fixesReady: boolean }) {
  const copy = momentCopy(moment, voice)
  const [details, setDetails] = useState(voice.register !== 'plain')
  const cause = causeSentence(moment, voice), time = timeSentence(moment, voice)
  const p = voice.register === 'plain'
  return (
    <div className={s.panel} role="dialog" aria-label="The problem">
      <div className={s.panelKicker}><span className={s.pulseDot} />Here’s the problem</div>
      <h2>{copy.headline}</h2>
      {cause && <p className={s.lead}>{cause}</p>}
      {time && <p>{time}</p>}
      {!cause && !time && <p>{copy.body}</p>}
      {details && <MomentNumbers openFor={moment.openFor} ready={moment.releaseIn} needs={moment.defenderNeeds} threatId={moment.threatId} voice={voice} finish={moment.finish} realized={moment.realizedArrival} />}
      <div className={s.robust}>{robust ? (p
        ? <>Happens in <b>{robust.opened} of {robust.samples}</b> slightly different tries — {robust.opened >= Math.ceil(robust.samples * 0.75) ? 'a real problem.' : robust.opened <= robust.samples / 4 ? 'depends on small details.' : 'worth planning for.'}</>
        : <><b>{robust.opened}/{robust.samples}</b> under small variations (reaction, speed, spacing) — {robust.opened >= Math.ceil(robust.samples * 0.75) ? 'robust.' : robust.opened <= robust.samples / 4 ? 'fragile.' : 'likely.'}</>)
        : (p ? 'Checking how often this happens…' : 'Testing robustness…')}</div>
      <div className={s.row}>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={onFix} disabled={!fixesReady}>{fixesReady ? 'How do I fix it?' : 'Trying fixes…'}</button>
        <button className={s.btn} onClick={onWhy} aria-pressed={whyOn}>{whyOn ? 'Back to the game view' : 'Show me why'}</button>
      </div>
      <div className={s.row} style={{ marginTop: 8 }}>
        <button className={s.btn} onClick={onSave}>We can live with this — save it</button>
        <button className={s.btn} style={{ color: '#ff9db6' }} onClick={onBreak}>Break my defense</button>
      </div>
      <button className={s.linkBtn} onClick={() => setDetails(d => !d)} aria-expanded={details}>{details ? 'Hide the numbers' : 'Show the numbers'}</button>
      {details && <div className={s.honesty}>{p ? 'From this run, with high-school speeds and reaction times. It doesn’t predict makes or misses.' : 'Best-case straight-line arrival vs. catch-and-release horizon; modeled HS assumptions. No make/miss prediction.'}</div>}
    </div>
  )
}

export function MomentNumbers({ openFor, ready, needs, threatId, voice, finish, realized }: { openFor: number; ready: number | null | undefined; needs: number | null | undefined; threatId: ThreatId; voice: Voice; finish?: TeachingMoment['finish']; realized?: number | null }) {
  const p = voice.register === 'plain'
  const late = ready != null && needs != null ? needs - ready : null
  const layup = finish ? finish === 'layup' : threatId === 'drive' || threatId === 'roll'
  const tenth = (x: number) => `${(Math.round(x * 10) / 10).toFixed(1)} s`
  return (
    <>
      <div className={s.numbers} style={{ gridTemplateColumns: late != null ? '1fr 1fr 1fr' : '1fr 1fr' }}>
        {ready != null && <div className={s.number}><b>{tenth(ready)}</b><span>{layup ? (p ? 'Layup is ready in' : 'Finish ready') : (p ? 'Shooter is ready in' : 'Release ready')}</span></div>}
        {needs != null && <div className={`${s.number} ${s.numWarn}`}><b>{tenth(needs)}</b><span>{p ? 'Nearest defender needs' : 'Best-case arrival'}</span></div>}
        {late != null ? <div className={`${s.number} ${s.numThreat}`}><b>{tenth(Math.abs(late))}</b><span>{late > 0 ? (p ? 'He’s late by' : 'Late by') : 'In time by'}</span></div>
          : <div className={`${s.number} ${s.numThreat}`}><b>{tenth(openFor)}</b><span>{p ? 'Open for' : 'Window'}</span></div>}
      </div>
      {realized != null && ready != null && <div className={s.hint} style={{ marginTop: -6, marginBottom: 10 }}>{p ? `In the actual replay he got there ${tenth(realized)} after the catch.` : `Realized arrival in replay: ${tenth(realized)} (best-case above).`}</div>}
    </>
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

/** At most one gain and one cost, named by who. */
function Effects({ fix, voice }: { fix: FixOption; voice: Voice }) {
  const rows: Delta[] = [...fix.improves, ...fix.opens].map(c => ({ threatId: c.threatId, playerId: c.playerId, before: c.before, after: c.after }))
  const { gains, costs } = tradeoffWords(rows, voice)
  if (!gains.length && !costs.length) return <div className={s.effects}><span className={`${s.effect} ${s.effectNone}`}>No real change</span></div>
  const p = voice.register === 'plain'
  return (
    <div className={s.effects}>
      {gains[0] && <span className={`${s.effect} ${s.effectGood}`}>{p ? 'Stops' : 'Closes'}: {opening(gains[0].threatId, gains[0].playerId, voice).toLowerCase()}{gains.length > 1 ? (p ? ` and ${gains.length - 1} more` : ` +${gains.length - 1}`) : ''}</span>}
      {costs[0] && <span className={`${s.effect} ${s.effectBad}`}>{p ? 'Gives up' : 'Opens'}: {opening(costs[0].threatId, costs[0].playerId, voice).toLowerCase()}</span>}
    </div>
  )
}

export function fixLabel(f: FixOption, voice: Voice) {
  const plain = voice.register === 'plain' ? FIX_PLAIN[f.id] : undefined
  return { title: plain?.plain ?? f.plain, detail: plain?.detail ?? f.detail }
}

export function FixPanel({ moment, fixes, voice, busy, onHover, onPick, onClose, onKeep }: { moment: TeachingMoment | null; fixes: FixOption[]; voice: Voice; busy: boolean; onHover(f: FixOption | null): void; onPick(f: FixOption): void; onClose(): void; onKeep(): void }) {
  return (
    <div className={s.panel} onMouseLeave={() => onHover(null)} role="dialog" aria-label="Fixes">
      <button className={s.closeX} onClick={onClose} aria-label="Close">×</button>
      <div className={`${s.panelKicker} ${s.def}`}>Your call</div>
      <h2>How do you want to handle it?</h2>
      <p>CourtIQ already ran each one. Point at an option to see where your defenders would go — pick one to watch it.</p>
      {busy && !fixes.length && <p>Trying options…</p>}
      <div className={s.fixes}>
        {rankFixes(fixes.filter(f => f.id !== 'keep'), moment).map(({ fix: f, verdict }) => {
          const l = fixLabel(f, voice)
          return (
            <button key={f.id} className={s.fix} onMouseEnter={() => onHover(f)} onFocus={() => onHover(f)} onClick={() => onPick(f)}>
              <strong>{l.title}</strong>
              <span>{l.detail}</span>
              <Effects fix={f} voice={voice} />
              {verdict === 'worse' && <span className={`${s.effect} ${s.effectBad}`} style={{ gridColumn: 1, justifySelf: 'start' }}>{voice.register === 'plain' ? 'Makes your problem worse' : 'Worsens the original window'}</span>}
              <em>→</em>
            </button>
          )
        })}
        <button className={s.fix} onClick={onKeep}>
          <strong>Keep it as-is</strong>
          <span>Accept this tradeoff — every defense gives something up.</span>
          <em>→</em>
        </button>
      </div>
      <div className={s.hint}>Or coach it yourself: click any of your defenders on the floor.</div>
    </div>
  )
}

/** Rows come from per-player divergence windows, so labels never collide and the
 * headline, body and bars all describe the same data. */
export function compareRows(d: Divergence | null): Delta[] {
  if (!d) return []
  return d.windows.map(w => ({ threatId: w.threatId, playerId: w.playerId, before: w.before ? w.before.end - w.before.start : 0, after: w.after ? w.after.end - w.after.start : 0 }))
    .filter(r => r.before > 0.04 || r.after > 0.04)
}

export function ComparePanel({ divergence, voice, label, onAgain, onBreak, onSave, onMore, onClose }: { divergence: Divergence | null; voice: Voice; label: string; onAgain(): void; onBreak(): void; onSave(): void; onMore(): void; onClose(): void }) {
  const rows = compareRows(divergence)
  const words = tradeoffWords(rows, voice)
  const max = Math.max(0.5, ...rows.flatMap(r => [r.before, r.after]))
  const shown = [...rows].sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before)).slice(0, 4)
  return (
    <div className={s.panel} role="dialog" aria-label="What changed">
      <button className={s.closeX} onClick={onClose} aria-label="Close">×</button>
      <div className={`${s.panelKicker} ${words.gains.length && !words.costs.length ? s.good : s.def}`}>{label}</div>
      <h2>{words.headline}</h2>
      <p>{words.body}</p>
      <div className={s.bars}>
        {shown.map(r => {
          const dir = r.after - r.before
          return (
            <div key={`${r.threatId}-${r.playerId}`} className={s.bar}>
              <span>{opening(r.threatId, r.playerId, voice)}</span>
              <div className={s.barTrack}>
                <div className={s.barBefore} style={{ width: `${r.before / max * 100}%` }} />
                <div className={s.barAfter} style={{ width: `${r.after / max * 100}%`, background: dir >= 0.1 ? 'var(--threat)' : dir <= -0.1 ? 'var(--good)' : 'var(--ink-2)' }} />
              </div>
              <span className={s.barVal}>{voice.register === 'plain' ? (dir <= -0.1 ? 'fixed' : dir >= 0.1 ? 'worse' : 'same') : `${r.before.toFixed(1)}→${r.after.toFixed(1)}`}</span>
            </div>
          )
        })}
      </div>
      <div className={s.hint} style={{ marginTop: 0 }}>{voice.register === 'plain' ? 'How long each player is open before a defender gets there. Faint: before. Bright: now. Faint figures on the court show where your defenders were.' : 'Open seconds before contest. Faint = previous answer; ghosts on court = previous positions.'}</div>
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
          <span>{attempts.length} things tried · {broke} found a way in</span>
        </div>
        <div className={s.breakTrack}><div className={s.breakFill} style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        <button className={s.btn} onClick={onCancel}>Stop</button>
      </div>
      <div className={s.attempts}>
        {attempts.map(a => (
          <div key={a.id} className={`${s.attempt} ${a.verdict === 'held' ? s.attemptHeld : s.attemptBroke}`}><i />{plainAttack(a.label)}{a.verdict !== 'held' ? ' — found a way in' : ' — held'}</div>
        ))}
      </div>
    </>
  )
}

/** Turn search edits into what an opposing coach would actually tell his players. */
function plainAttack(label: string): string {
  return label
    .replace(/Turn screen ([+−-])(\d+)°/g, (_, sign: string, deg: string) => `Set the screen at a ${Number(deg) > 20 ? 'sharper' : 'slightly different'} angle (${sign === '+' ? 'right' : 'left'})`)
    .replace(/Lift (\d+) ms earlier/g, 'Far-wing shooter moves up sooner').replace(/Lift (\d+) ms later/g, 'Far-wing shooter waits, then moves up')
    .replace(/Shift lift ([\d.]+) m/g, 'Far-wing shooter spaces wider')
    .replace('Allow the reject', 'Ball handler goes away from the screen').replace('Allow a second screen', 'Screener sets it again')
    .replace('Allow the short roll', 'Screener stops short and catches').replace('Their current offense', 'Their normal play')
}
function plainChanges(changes: AttackChange[], fallback: string): string {
  if (!changes.length) return 'their normal play already finds it'
  return plainAttack(fallback).toLowerCase()
}

export function BreakMomentPanel({ report, voice, onFix, onAccept, onReplay, onExit }: { report: AttackReport; voice: Voice; onFix(): void; onAccept(): void; onReplay(): void; onExit(): void }) {
  const w = report.selected.witness!
  const p = voice.register === 'plain'
  const copy = explainMoment({ threatId: w.threatId, openFor: Math.max(0, w.interval.end - w.interval.start), defenderNeeds: w.arrivalSeconds, responsibleRole: w.limitingRole, cause: 'unknown', receiverRole: ROLE_OF[w.playerId], releaseIn: w.releaseSeconds }, voice)
  const how = p ? plainChanges(report.selected.changes, attackIntentLabel(report.selected)) : attackIntentLabel(report.selected)
  const retest = report.pairedRetest
  const late = w.arrivalSeconds - w.releaseSeconds
  return (
    <div className={s.panel} role="dialog" aria-label="They broke it">
      <div className={`${s.panelKicker} ${s.attack}`}><span className={s.pulseDot} />They broke it</div>
      <h2>{p ? `${cap(person(w.playerId as PlayerId, voice))} is open.` : copy.headline}</h2>
      <p className={s.lead}>{p ? (report.selected.changes.length ? `How: ${how}.` : 'Their usual play already gets him a shot — no trick needed.') : `Counter: ${how}.`}</p>
      <p>{p ? `${cap(person(w.limitingDefenderId as PlayerId, voice))} needs ${spoken(w.arrivalSeconds, voice)} to get there — ${late > 0.15 ? `late by ${spoken(late, voice)}` : 'a hair late'}.` : `${person(w.limitingDefenderId as PlayerId, voice)} arrival ${spoken(w.arrivalSeconds, voice)} vs release ${spoken(w.releaseSeconds, voice)}.`}</p>
      {retest && <p style={{ fontSize: 13 }}>{retest.current.witness ? 'Their last counter still works against your new answer.' : 'Your fix holds against their last counter — this is a new way in.'}</p>}
      <div className={s.row}>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={onFix}>Fix it</button>
        <button className={s.btn} onClick={onReplay}>Watch it again</button>
        <button className={s.btn} onClick={onAccept}>We can live with that</button>
      </div>
      <button className={s.linkBtn} onClick={onExit}>Back to my defense</button>
      <div className={s.honesty}>{p ? `CourtIQ tried ${report.budget.used} different things an offense could run against you. Real teams can try more.` : `${report.budget.used} bounded counters (screen angle, lift timing/spacing, reject, re-screen, short roll). A search, not a guarantee.`}</div>
    </div>
  )
}

export function BreakHeldPanel({ report, onExit, onSave }: { report: AttackReport; onExit(): void; onSave(): void }) {
  return (
    <div className={s.panel}>
      <div className={`${s.panelKicker} ${s.good}`}>It held up</div>
      <h2>CourtIQ couldn’t break it.</h2>
      <p>{report.budget.used} things tried — none found an opening the offense could use in time.</p>
      <div className={s.row}>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={onSave}>Save as our answer</button>
        <button className={s.btn} onClick={onExit}>Back to my defense</button>
      </div>
      <div className={s.honesty}>A search isn’t a guarantee. It doesn’t include every offense or your actual players.</div>
    </div>
  )
}

/** Fixes that help the problem the coach is looking at come first; ones that
 * make it worse are flagged rather than hidden (it is still his call). */
function rankFixes(fixes: FixOption[], moment: TeachingMoment | null): { fix: FixOption; verdict: 'helps' | 'neutral' | 'worse' }[] {
  const score = (f: FixOption) => {
    if (!moment) return 0
    const same = (c: { threatId: ThreatId; playerId: PlayerId }) => c.threatId === moment.threatId && c.playerId === moment.receiverId
    const g = f.improves.find(same), o = f.opens.find(same)
    return g ? g.before - g.after : o ? -(o.after - o.before) : 0
  }
  return fixes.map(fix => { const sc = score(fix); return { fix, sc, verdict: (sc > 0.05 ? 'helps' : sc < -0.05 ? 'worse' : 'neutral') as 'helps' | 'neutral' | 'worse' } })
    .sort((a, b) => b.sc - a.sc).map(({ fix, verdict }) => ({ fix, verdict }))
}
