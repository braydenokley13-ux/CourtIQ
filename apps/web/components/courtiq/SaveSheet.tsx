'use client'

import { useEffect, useRef, useState } from 'react'
import { formatSeconds, type Voice } from '@courtiq/basketball/corpus'
import { SCOPES, type Scope, type Tradeoff } from '@courtiq/basketball/program'
import type { LabConfig } from '@courtiq/basketball/types'
import { rulesTable } from './basketball'
import { opening } from './speech'
import s from './courtiq.module.css'

export interface SaveInput {
  name: string
  scope: Scope
  when: string
  note: string
  targetEntryId?: string
  expectedHeadVersionId?: string
}

/** Ask only what's necessary. Everything else is captured from the Lab. */
export default function SaveSheet({
  config,
  voice,
  defaultName,
  defaultScope,
  defaultWhen,
  originEntryId,
  originExpectedHeadVersionId,
  accepts,
  knownBreaks,
  existingVersions,
  matches,
  busy,
  error,
  onSave,
  onClose,
}: {
  config: LabConfig
  voice: Voice
  defaultName: string
  accepts: Tradeoff[]
  knownBreaks: { label: string; threatId: Tradeoff['threatId']; seconds: number }[]
  defaultScope?: Scope
  defaultWhen?: string
  originEntryId?: string
  originExpectedHeadVersionId?: string
  existingVersions(entryId?: string): number
  matches: { id: string; name: string; scope: Scope; headVersionId: string }[]
  busy: boolean
  error?: string
  onSave(input: SaveInput, teach: boolean): void
  onClose(): void
}) {
  const [name, setName] = useState(defaultName)
  const [scope, setScope] = useState<Scope>(defaultScope ?? 'varsity')
  const [when, setWhen] = useState(defaultWhen ?? 'High ball screen, middle of the floor')
  const [note, setNote] = useState('')
  const [more, setMore] = useState(false)
  const [targetEntryId, setTargetEntryId] = useState<string | undefined>(originEntryId)
  // Opening or explicitly selecting a target acknowledges its head. Background refresh does not.
  const [expectedHeadVersionId, setExpectedHeadVersionId] = useState(originExpectedHeadVersionId)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    first.current?.focus()
    first.current?.select()
  }, [])
  const version = existingVersions(targetEntryId) + 1
  const input = {
    name: name.trim() || defaultName,
    scope,
    when,
    note,
    ...(targetEntryId ? { targetEntryId, expectedHeadVersionId } : {}),
  }
  return (
    <div
      className={s.scrim}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className={s.sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Save as our answer">
        <div className={s.sheetMain}>
          <div className={`${s.panelKicker} ${s.good}`}>Save as our answer</div>
          <h2>Make it part of how you play.</h2>
          <div className={s.field}>
            <label htmlFor="ans-name">What do you call it?</label>
            <input
              id="ans-name"
              ref={first}
              className={s.textInput}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {(originEntryId || matches.length > 0) && (
            <div className={s.field}>
              <label htmlFor="answer-update">Save as</label>
              <select
                id="answer-update"
                className={s.textInput}
                value={targetEntryId ?? ''}
                onChange={(e) => {
                  const id = e.target.value || undefined
                  setTargetEntryId(id)
                  setExpectedHeadVersionId(matches.find((entry) => entry.id === id)?.headVersionId)
                }}
              >
                <option value="">A new answer</option>
                {matches.map((e) => (
                  <option key={e.id} value={e.id}>
                    Update “{e.name}”
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className={s.field}>
            <label>Who uses it?</label>
            <div className={s.seg}>
              {SCOPES.map((sc) => (
                <button
                  key={sc.id}
                  className={`${s.segBtn} ${scope === sc.id ? s.segOn : ''}`}
                  title={sc.hint}
                  onClick={() => setScope(sc.id)}
                >
                  {sc.label}
                </button>
              ))}
            </div>
          </div>
          <div className={s.field}>
            <label htmlFor="ans-when">When do we use it?</label>
            <input
              id="ans-when"
              className={s.textInput}
              maxLength={200}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </div>
          {more ? (
            <div className={s.field}>
              <label htmlFor="ans-note">Anything to remember? (optional)</label>
              <input
                id="ans-note"
                className={s.textInput}
                maxLength={4000}
                placeholder="e.g. Helper stops at the dotted line vs. good shooters"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          ) : (
            <button className={s.linkBtn} onClick={() => setMore(true)}>
              + Add a note
            </button>
          )}
          <div className={s.row} style={{ marginTop: 22 }}>
            <button className={`${s.btn} ${s.btnPrimary}`} disabled={busy} onClick={() => onSave(input, false)}>
              {busy ? 'Saving…' : version > 1 ? `Update “${input.name}” (version ${version})` : 'Save'}
            </button>
            <button className={`${s.btn} ${s.btnGood}`} disabled={busy} onClick={() => onSave(input, true)}>
              Save and show the players
            </button>
            <button className={s.btn} onClick={onClose}>
              Cancel
            </button>
          </div>
          {error && (
            <p className={s.warnNote} role="status">
              {error}
            </p>
          )}
        </div>
        <div className={s.sheetSide}>
          <div className={s.sectionLabel} style={{ marginTop: 0 }}>
            What CourtIQ will remember
          </div>
          <table className={s.rules}>
            <tbody>
              {rulesTable(config.answer, voice).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={s.sectionLabel}>The tradeoff you’re accepting</div>
          {accepts.length ? (
            accepts.map((a) => (
              <div key={a.threatId} className={s.hint} style={{ marginTop: 4, color: '#ffb3a3' }}>
                {opening(a.threatId, undefined, voice)} can be open {formatSeconds(a.seconds)}
              </div>
            ))
          ) : (
            <div className={s.hint} style={{ marginTop: 0 }}>
              Nothing opened in the last run.
            </div>
          )}
          {knownBreaks.length > 0 && (
            <>
              <div className={s.sectionLabel}>Known ways to beat it</div>
              {knownBreaks.map((b) => (
                <div key={b.label} className={s.hint} style={{ marginTop: 4 }}>
                  {b.label} → {opening(b.threatId, undefined, voice)} {formatSeconds(b.seconds)}
                </div>
              ))}
            </>
          )}
          <div className={s.hint}>
            The accepted executable inputs and their history are kept. Saving finishes when this device confirms the
            write.
          </div>
        </div>
      </div>
    </div>
  )
}
