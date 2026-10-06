'use client'

import { useMemo, useRef, useState } from 'react'
import { CONCEPTS, SITUATIONS, formatSeconds, type Voice } from '@courtiq/basketball/corpus'
import { executionCompatibility, parseExecutionInput } from '@courtiq/basketball/execution'
import { compileExperiment, replayExecution } from '@courtiq/basketball/simulation'
import {
  MAX_PROGRAM_BYTES,
  SCOPES,
  contradictions,
  headVersion,
  recipeFor,
  versionDiff,
  type ProgramSystem,
  type SystemEntry,
} from '@courtiq/basketball/program'
import type { ProgramController } from '@/lib/persistence/useProgram'
import MiniCourt from './MiniCourt'
import { rulesTable, threatShort } from './basketball'
import s from './courtiq.module.css'

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function OurSystem({
  system,
  voice,
  persistence,
  onOpen,
  onTeach,
  onSolve,
  onTerm,
  onProgram,
  onDefault,
}: {
  system: ProgramSystem
  voice: Voice
  persistence: ProgramController
  onOpen(e: SystemEntry, versionId?: string): void
  onTeach(e: SystemEntry): void
  onSolve(): void
  onTerm(key: string, value: string): void
  onProgram(name: string): void
  onDefault(e: SystemEntry): void
}) {
  const [view, setView] = useState<'defense' | 'terms'>('defense')
  const [selected, setSelected] = useState<string | null>(system.entries[0]?.id ?? null)
  const entry = system.entries.find((e) => e.id === selected) ?? system.entries[0] ?? null
  const conflicts = contradictions(system)
  const known = new Set(SITUATIONS.flatMap((x) => x.subSituations?.map((sub) => sub.id) ?? [x.id]))
  const row = (e: SystemEntry, title: string) => (
    <button
      key={e.id}
      className={s.situRow}
      style={{
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        color: 'inherit',
        font: 'inherit',
        borderColor: selected === e.id ? 'rgba(79,184,255,.6)' : undefined,
      }}
      onClick={() => setSelected(e.id)}
    >
      <div>
        <h4>
          {title} — {e.name}
        </h4>
        <small>
          {e.scopeUnassigned ? 'Earlier scope not recorded' : SCOPES.find((x) => x.id === e.scope)?.label} · {e.when}
        </small>
      </div>
      <span className={s.badge}>v{headVersion(e).v}</span>
      <span className={s.chip}>Open</span>
    </button>
  )
  return (
    <div className={s.page}>
      <div className={s.pageInner}>
        <div className={s.pageHead}>
          <div>
            <div className={s.kicker}>
              <i />
              Our System
            </div>
            <h1>
              How {system.program === 'Our program' ? 'we' : system.program} play
              {system.program === 'Our program' ? '' : 's'} defense
            </h1>
            <p>Built from problems you solved in the Lab. Accepted answers keep their executable inputs and history.</p>
          </div>
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={onSolve}>
            + Solve a new problem
          </button>
        </div>
        <div className={s.sysGrid}>
          <nav className={s.sysNav}>
            <button
              className={`${s.sysNavBtn} ${view === 'defense' ? s.sysNavOn : ''}`}
              onClick={() => setView('defense')}
            >
              Our defense <span>{system.entries.length}</span>
            </button>
            <button className={`${s.sysNavBtn} ${view === 'terms' ? s.sysNavOn : ''}`} onClick={() => setView('terms')}>
              Our words <span>{Object.keys(system.terms).length}</span>
            </button>
            <div className={s.field}>
              <label htmlFor="prog">Program name</label>
              <input
                key={system.id + system.program}
                id="prog"
                className={s.textInput}
                defaultValue={system.program}
                maxLength={80}
                onBlur={(e) => onProgram(e.target.value.trim() || 'Our program')}
              />
            </div>
            <ProgramData persistence={persistence} />
          </nav>
          {view === 'terms' ? (
            <Terms system={system} voice={voice} onTerm={onTerm} />
          ) : (
            <div>
              {conflicts.length > 0 && (
                <div className={s.warnNote} style={{ marginBottom: 12 }}>
                  More than one answer applies to the same situation:{' '}
                  {conflicts.map((c) => `“${c.a.name}” and “${c.b.name}”`).join(', ')}. Open an answer and choose a
                  default.
                </div>
              )}
              {SITUATIONS.filter((x) => x.id !== 'explore').map((sit) => (
                <section key={sit.id} style={{ marginBottom: 18 }}>
                  <div className={s.sectionLabel}>{voice.register === 'plain' ? sit.plainTitle : sit.coachTitle}</div>
                  {(
                    sit.subSituations ?? [
                      { id: sit.id, plainTitle: sit.plainTitle, coachTitle: sit.coachTitle, status: sit.status },
                    ]
                  ).map((sub) => {
                    const entries = system.entries.filter((e) => e.situationId === sub.id),
                      title = voice.register === 'plain' ? sub.plainTitle : sub.coachTitle
                    return entries.length ? (
                      entries.map((e) => row(e, title))
                    ) : (
                      <div key={sub.id} className={s.situRow}>
                        <div>
                          <h4>{title}</h4>
                          <small>Not decided yet</small>
                        </div>
                        <span />
                        {sub.status === 'ready' ? (
                          <button className={s.chip} onClick={onSolve}>
                            Solve in Lab
                          </button>
                        ) : (
                          <span className={`${s.badge} ${s.badgeMuted}`}>Coming</span>
                        )}
                      </div>
                    )
                  })}
                </section>
              ))}
              {system.entries.some((e) => !known.has(e.situationId)) && (
                <section>
                  <div className={s.sectionLabel}>Other saved situations</div>
                  {system.entries.filter((e) => !known.has(e.situationId)).map((e) => row(e, e.situationId))}
                </section>
              )}
              {!system.entries.length && (
                <div className={s.empty}>
                  <h3>Nothing saved yet.</h3>
                  <p>Solve a problem in the Lab and choose “Save as our answer”. It shows up here — ready to teach.</p>
                  <button className={`${s.btn} ${s.btnPrimary}`} onClick={onSolve}>
                    Go to the Lab
                  </button>
                </div>
              )}
              {entry && (
                <EntryDetail
                  entry={entry}
                  voice={voice}
                  onOpen={onOpen}
                  onTeach={onTeach}
                  onDefault={onDefault}
                  selectedDefault={system.defaults.some((d) => d.answer.entryId === entry.id)}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EntryDetail({
  entry,
  voice,
  onOpen,
  onTeach,
  onDefault,
  selectedDefault,
}: {
  entry: SystemEntry
  voice: Voice
  onOpen(e: SystemEntry, versionId?: string): void
  onTeach(e: SystemEntry): void
  onDefault(e: SystemEntry): void
  selectedDefault: boolean
}) {
  const latest = headVersion(entry),
    recipe = useMemo(() => recipeFor(latest, compileExperiment), [latest])
  const preview = useMemo(() => {
    if (latest.snapshot.kind === 'legacy-unverified')
      return {
        result: null,
        reason:
          'Saved with an earlier model. Its original inputs and notes are preserved; re-test in the Lab before teaching with the current model.',
      }
    if (!executionCompatibility(latest.snapshot.input).replayable)
      return {
        result: null,
        reason: 'This saved model is unavailable here. Its inputs and history remain available for export.',
      }
    try {
      return { result: replayExecution(parseExecutionInput(latest.snapshot.input)), reason: null }
    } catch {
      return {
        result: null,
        reason: 'This saved replay could not run. Its inputs are preserved; export or re-test the answer.',
      }
    }
  }, [latest])
  return (
    <div className={s.card} style={{ marginTop: 14 }}>
      <div className={s.pageHead} style={{ marginBottom: 14 }}>
        <div>
          <div className={s.kicker}>
            <i />
            {preview.result ? preview.result.input.program.title : entry.situationId}
          </div>
          <h1 style={{ fontSize: 32 }}>
            {entry.name} <span className={s.badge}>v{latest.v}</span>
          </h1>
        </div>
        <div className={s.row}>
          <button className={`${s.btn} ${s.btnGood}`} disabled={!preview.result} onClick={() => onTeach(entry)}>
            Teach this
          </button>
          <button className={s.btn} disabled={!recipe} onClick={() => onOpen(entry)}>
            {preview.result ? 'Open in Lab' : 'Re-test in Lab'}
          </button>
          {!entry.scopeUnassigned && entry.scope !== 'lineup' && entry.scope !== 'game' && (
            <button className={s.chip} disabled={selectedDefault} onClick={() => onDefault(entry)}>
              {selectedDefault ? 'Selected default' : 'Set as default'}
            </button>
          )}
        </div>
      </div>
      {preview.reason && (
        <div className={s.warnNote} style={{ marginBottom: 12 }}>
          {preview.reason}
        </div>
      )}
      {preview.result && !recipe && (
        <div className={s.warnNote} style={{ marginBottom: 12 }}>
          This accepted replay is available for teaching and export. Its editing recipe cannot reproduce these inputs in
          the current Lab.
        </div>
      )}
      <div className={s.detail}>
        <div>
          {preview.result && <MiniCourt result={preview.result} height={190} />}
          <div className={s.sectionLabel}>The tradeoff we accept</div>
          {latest.accepts.length ? (
            latest.accepts.map((a) => (
              <div key={a.threatId} className={s.hint} style={{ marginTop: 3, color: '#ffb3a3' }}>
                {threatShort(a.threatId, voice)} open up to {formatSeconds(a.seconds)}
              </div>
            ))
          ) : (
            <div className={s.hint} style={{ marginTop: 0 }}>
              {latest.evidence.state === 'legacy-unknown'
                ? 'Measurements were not recorded with this earlier answer.'
                : 'Nothing opened in the accepted run.'}
            </div>
          )}
          {latest.knownBreaks.length > 0 && (
            <>
              <div className={s.sectionLabel}>Known ways to beat it</div>
              {latest.knownBreaks.map((b, i) => (
                <div key={i} className={s.hint} style={{ marginTop: 3 }}>
                  {b.label} → {threatShort(b.threatId, voice)}
                </div>
              ))}
            </>
          )}
          {latest.note && (
            <>
              <div className={s.sectionLabel}>Coach’s note</div>
              <div className={s.hint} style={{ marginTop: 0 }}>
                {latest.note}
              </div>
            </>
          )}
          {latest.teaching?.cue && (
            <>
              <div className={s.sectionLabel}>Teaching cue</div>
              <div className={s.hint}>{latest.teaching.cue}</div>
            </>
          )}
        </div>
        <div>
          {recipe && (
            <table className={s.rules}>
              <tbody>
                {rulesTable(recipe.answer, voice).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className={s.sectionLabel}>History</div>
          <div className={s.history}>
            {[...entry.versions].reverse().map((v, i, arr) => (
              <div key={v.id} className={s.hItem}>
                <b>v{v.v}</b> · {new Date(v.savedAt).toLocaleDateString()} — {versionDiff(arr[i + 1], v).join('; ')}{' '}
                {i > 0 && recipeFor(v, compileExperiment) && (
                  <button
                    className={s.ghostLink}
                    style={{ padding: 0, fontSize: 12 }}
                    onClick={() => onOpen(entry, v.id)}
                  >
                    open
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Terms({
  system,
  voice,
  onTerm,
}: {
  system: ProgramSystem
  voice: Voice
  onTerm(key: string, value: string): void
}) {
  const ids = [
    'drop',
    'switch',
    'blitz',
    'ice',
    'low-man',
    'tag',
    'lift',
    'x-out',
    'roller',
    'skip-pass',
    'closeout',
    'help',
  ]
  return (
    <div className={s.card}>
      <h3 style={{ margin: '0 0 6px', font: '600 22px var(--display)' }}>Our words</h3>
      <p className={s.hint} style={{ marginTop: 0 }}>
        Rename anything. CourtIQ will use your word in the Lab, in explanations, and when teaching players.
      </p>
      <table className={s.rules}>
        <tbody>
          {ids.map((id) => {
            const c = CONCEPTS.find((x) => x.id === id),
              key = `${c ? 'concept' : 'coverage'}:${id}`
            return (
              <tr key={key}>
                <td>{c ? `${c.coach} — ${c.plain}` : id}</td>
                <td>
                  <input
                    key={key + (system.terms[key] ?? '')}
                    aria-label={`Our word for ${id}`}
                    className={s.textInput}
                    style={{ padding: '7px 10px', fontSize: 14 }}
                    maxLength={80}
                    placeholder={c?.[voice.register] ?? id}
                    defaultValue={system.terms[key] ?? ''}
                    onBlur={(e) => onTerm(key, e.target.value.trim())}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ProgramData({ persistence }: { persistence: ProgramController }) {
  const file = useRef<HTMLInputElement>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  return (
    <div style={{ marginTop: 20 }}>
      <div className={s.sectionLabel}>Saved on this device</div>
      {(persistence.notice || notice) && (
        <p className={s.hint} role="status">
          {persistence.notice ?? notice}
        </p>
      )}
      {persistence.status === 'loading' && (
        <p className={s.hint} role="status">
          Opening your saved program…
        </p>
      )}
      <div className={s.row} style={{ flexWrap: 'wrap' }}>
        <button
          className={s.chip}
          disabled={
            persistence.status === 'loading' ||
            (persistence.status === 'blocked' && !persistence.hasPending && !persistence.lastGood)
          }
          onClick={() => {
            try {
              download(persistence.exportText(), 'courtiq-program.json')
              setNotice('Program exported. Keep this file to restore or share your answers.')
            } catch (error) {
              setNotice(error instanceof Error ? error.message : 'Export could not complete.')
            }
          }}
        >
          {persistence.hasPending
            ? 'Export unsaved session'
            : persistence.status === 'blocked' && persistence.lastGood
              ? 'Export last saved program'
              : 'Export program'}
        </button>
        <button
          className={s.chip}
          disabled={persistence.busy || persistence.status === 'loading'}
          onClick={() => file.current?.click()}
        >
          Import program
        </button>
        <input
          ref={file}
          type="file"
          aria-label="Import CourtIQ program JSON"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const selected = e.target.files?.[0]
            e.target.value = ''
            if (!selected) return
            if (selected.size > MAX_PROGRAM_BYTES) {
              setNotice(
                `Import did not change your program: this file exceeds the ${MAX_PROGRAM_BYTES / (1024 * 1024)} MiB limit.`,
              )
              return
            }
            try {
              const result = await persistence.importText(await selected.text())
              setNotice(
                result.ok
                  ? 'Program imported and saved on this device.'
                  : (result.reason ?? 'Import did not complete.'),
              )
            } catch (error) {
              setNotice(error instanceof Error ? error.message : 'The file could not be read.')
            }
          }}
        />
        {(persistence.hasPending || persistence.status === 'unavailable') && (
          <button className={s.chip} disabled={persistence.busy} onClick={() => void persistence.retry()}>
            Retry device save
          </button>
        )}
        {persistence.hasPending && (
          <button className={s.chip} disabled={persistence.busy} onClick={persistence.discardPending}>
            Use latest device program
          </button>
        )}
        <button
          className={s.chip}
          disabled={persistence.status === 'loading'}
          onClick={async () => download(await persistence.downloadRecovery(), 'courtiq-recovery.json')}
        >
          Download recovery data
        </button>
        {persistence.lastGood && (
          <button
            className={s.chip}
            disabled={persistence.busy || persistence.hasPending}
            onClick={() => void persistence.restoreLastGood()}
          >
            Restore last saved program
          </button>
        )}
      </div>
      <p className={s.hint}>Export a backup before moving devices or clearing browser data.</p>
      {confirmClear ? (
        <div>
          <p className={s.hint}>Clear this device’s program? Keep an export to restore your answers.</p>
          <button
            className={s.chip}
            disabled={persistence.busy}
            onClick={async () => {
              const result = await persistence.clear()
              if (result.ok) {
                setConfirmClear(false)
                setNotice('Program cleared on this device. Import your backup to restore it.')
              }
            }}
          >
            Clear program
          </button>
          <button className={s.chip} onClick={() => setConfirmClear(false)}>
            Cancel clear
          </button>
        </div>
      ) : (
        <button
          className={s.linkBtn}
          disabled={persistence.busy || persistence.status !== 'ready'}
          onClick={() => setConfirmClear(true)}
        >
          Clear this device
        </button>
      )}
    </div>
  )
}
