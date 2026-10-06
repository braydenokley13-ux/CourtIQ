'use client'

import { useMemo, useState } from 'react'
import { CONCEPTS, SITUATIONS, formatSeconds, type Voice } from '@/lib/defense-lab/corpus'
import { simulateCached } from '@/lib/defense-lab/replayCache'
import { SCOPES, contradictions, versionDiff, type ProgramSystem, type SystemEntry } from '@/lib/defense-lab/system'
import MiniCourt from './MiniCourt'
import { rulesTable, threatShort } from './basketball'
import s from './courtiq.module.css'

export default function OurSystem({ system, voice, onOpen, onTeach, onSolve, onTerms, onProgram }: {
  system: ProgramSystem; voice: Voice; onOpen(e: SystemEntry, v?: number): void; onTeach(e: SystemEntry): void; onSolve(): void
  onTerms(terms: Record<string, string>): void; onProgram(name: string): void
}) {
  const [view, setView] = useState<'defense' | 'terms'>('defense')
  const [selected, setSelected] = useState<string | null>(system.entries[0]?.id ?? null)
  const entry = system.entries.find(e => e.id === selected) ?? null
  const conflicts = contradictions(system)
  return (
    <div className={s.page}>
      <div className={s.pageInner}>
        <div className={s.pageHead}>
          <div>
            <div className={s.kicker}><i />Our System</div>
            <h1>How {system.program === 'Our program' ? 'we' : system.program} play{system.program === 'Our program' ? '' : 's'} defense</h1>
            <p>Built from problems you solved in the Lab. Every answer is a real, runnable possession — not a diagram.</p>
          </div>
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={onSolve}>+ Solve a new problem</button>
        </div>
        <div className={s.sysGrid}>
          <nav className={s.sysNav}>
            <button className={`${s.sysNavBtn} ${view === 'defense' ? s.sysNavOn : ''}`} onClick={() => setView('defense')}>Our defense <span>{system.entries.length}</span></button>
            <button className={`${s.sysNavBtn} ${view === 'terms' ? s.sysNavOn : ''}`} onClick={() => setView('terms')}>Our words <span>{Object.keys(system.terms).length}</span></button>
            <div className={s.field}>
              <label htmlFor="prog">Program name</label>
              <input id="prog" className={s.textInput} defaultValue={system.program} onBlur={e => onProgram(e.target.value.trim() || 'Our program')} />
            </div>
          </nav>
          {view === 'terms' ? <Terms system={system} voice={voice} onTerms={onTerms} /> : (
            <div>
              {conflicts.length > 0 && <div className={s.warnNote} style={{ marginBottom: 12 }}>Two answers claim the same situation for the same team: {conflicts.map(c => `“${c.a.name}” and “${c.b.name}”`).join(', ')}. Pick one as the default.</div>}
              {SITUATIONS.filter(x => x.id !== 'explore').map(sit => (
                <section key={sit.id} style={{ marginBottom: 18 }}>
                  <div className={s.sectionLabel}>{voice.register === 'plain' ? sit.plainTitle : sit.coachTitle}</div>
                  {(sit.subSituations ?? [{ id: sit.id, plainTitle: sit.plainTitle, coachTitle: sit.coachTitle, status: sit.status, plainDescription: '' }]).map(sub => {
                    const entries = system.entries.filter(e => e.situationId === sub.id)
                    if (!entries.length) return (
                      <div key={sub.id} className={s.situRow}>
                        <div><h4>{voice.register === 'plain' ? sub.plainTitle : sub.coachTitle}</h4><small>Not decided yet</small></div>
                        <span />
                        {sub.status === 'ready' ? <button className={s.chip} onClick={onSolve}>Solve in Lab</button> : <span className={`${s.badge} ${s.badgeMuted}`}>Coming</span>}
                      </div>
                    )
                    return entries.map(e => (
                      <button key={e.id} className={s.situRow} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit', borderColor: selected === e.id ? 'rgba(79,184,255,.6)' : undefined }} onClick={() => setSelected(e.id)}>
                        <div><h4>{voice.register === 'plain' ? sub.plainTitle : sub.coachTitle} — {e.name}</h4><small>{SCOPES.find(x => x.id === e.scope)?.label} · {e.when}</small></div>
                        <span className={s.badge}>v{e.versions.at(-1)!.v}</span>
                        <span className={s.chip}>Open</span>
                      </button>
                    ))
                  })}
                </section>
              ))}
              {!system.entries.length && <div className={s.empty}><h3>Nothing saved yet.</h3><p>Solve a problem in the Lab and choose “Save as our answer”. It shows up here — ready to teach.</p><button className={`${s.btn} ${s.btnPrimary}`} onClick={onSolve}>Go to the Lab</button></div>}
              {entry && <EntryDetail entry={entry} voice={voice} onOpen={onOpen} onTeach={onTeach} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EntryDetail({ entry, voice, onOpen, onTeach }: { entry: SystemEntry; voice: Voice; onOpen(e: SystemEntry, v?: number): void; onTeach(e: SystemEntry): void }) {
  const latest = entry.versions.at(-1)!
  const result = useMemo(() => simulateCached(latest.config), [latest])
  return (
    <div className={s.card} style={{ marginTop: 14 }}>
      <div className={s.pageHead} style={{ marginBottom: 14 }}>
        <div><div className={s.kicker}><i />High P&R</div><h1 style={{ fontSize: 32 }}>{entry.name} <span className={s.badge}>v{latest.v}</span></h1></div>
        <div className={s.row}>
          <button className={`${s.btn} ${s.btnGood}`} onClick={() => onTeach(entry)}>Teach this</button>
          <button className={s.btn} onClick={() => onOpen(entry)}>Open in Lab</button>
        </div>
      </div>
      <div className={s.detail}>
        <div>
          <MiniCourt result={result} height={190} />
          <div className={s.sectionLabel}>The tradeoff we accept</div>
          {latest.accepts.length ? latest.accepts.map(a => <div key={a.threatId} className={s.hint} style={{ marginTop: 3, color: '#ffb3a3' }}>{threatShort(a.threatId, voice)} open up to {formatSeconds(a.seconds)}</div>) : <div className={s.hint} style={{ marginTop: 0 }}>Nothing opened when saved.</div>}
          {latest.knownBreaks.length > 0 && <><div className={s.sectionLabel}>Known ways to beat it</div>{latest.knownBreaks.map(b => <div key={b.label} className={s.hint} style={{ marginTop: 3 }}>{b.label} → {threatShort(b.threatId, voice)}</div>)}</>}
          {latest.note && <><div className={s.sectionLabel}>Coach’s note</div><div className={s.hint} style={{ marginTop: 0 }}>{latest.note}</div></>}
        </div>
        <div>
          <table className={s.rules}><tbody>{rulesTable(latest.config.answer, voice).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
          <div className={s.sectionLabel}>History</div>
          <div className={s.history}>
            {[...entry.versions].reverse().map((v, i, arr) => (
              <div key={v.v} className={s.hItem}><b>v{v.v}</b> · {new Date(v.savedAt).toLocaleDateString()} — {versionDiff(arr[i + 1], v).join('; ')} {i > 0 && <button className={s.ghostLink} style={{ padding: 0, fontSize: 12 }} onClick={() => onOpen(entry, v.v)}>open</button>}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Terms({ system, voice, onTerms }: { system: ProgramSystem; voice: Voice; onTerms(t: Record<string, string>): void }) {
  const ids = ['drop', 'switch', 'blitz', 'ice', 'low-man', 'tag', 'lift', 'x-out', 'roller', 'skip-pass', 'closeout', 'help']
  return (
    <div className={s.card}>
      <h3 style={{ margin: '0 0 6px', font: '600 22px var(--display)' }}>Our words</h3>
      <p className={s.hint} style={{ marginTop: 0 }}>Rename anything. CourtIQ will use your word in the Lab, in explanations, and when teaching players.</p>
      <table className={s.rules}><tbody>
        {ids.map(id => {
          const c = CONCEPTS.find(x => x.id === id)
          const label = c ? `${c.coach} — ${c.plain}` : id
          return (
            <tr key={id}><td>{label}</td><td>
              <input className={s.textInput} style={{ padding: '7px 10px', fontSize: 14 }} placeholder={c?.[voice.register] ?? id} defaultValue={system.terms[id] ?? ''} onBlur={e => { const v = e.target.value.trim(); const next = { ...system.terms }; if (v) next[id] = v; else delete next[id]; onTerms(next) }} />
            </td></tr>
          )
        })}
      </tbody></table>
    </div>
  )
}
