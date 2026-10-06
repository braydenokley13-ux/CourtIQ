'use client'

import { useEffect, useRef, useState } from 'react'
import { formatSeconds, type Voice } from '@/lib/defense-lab/corpus'
import { SCOPES, type Scope, type Tradeoff } from '@/lib/defense-lab/system'
import type { LabConfig } from '@/lib/defense-lab/types'
import { rulesTable, threatShort } from './basketball'
import s from './courtiq.module.css'

export interface SaveInput { name: string; scope: Scope; when: string; note: string }

/** Ask only what's necessary. Everything else is captured from the Lab. */
export default function SaveSheet({ config, voice, defaultName, accepts, knownBreaks, existingVersions, onSave, onClose }: {
  config: LabConfig; voice: Voice; defaultName: string; accepts: Tradeoff[]; knownBreaks: { label: string; threatId: Tradeoff['threatId']; seconds: number }[]
  existingVersions(name: string, scope: Scope): number; onSave(input: SaveInput, teach: boolean): void; onClose(): void
}) {
  const [name, setName] = useState(defaultName)
  const [scope, setScope] = useState<Scope>('varsity')
  const [when, setWhen] = useState('High ball screen, middle of the floor')
  const [note, setNote] = useState('')
  const [more, setMore] = useState(false)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => { first.current?.focus(); first.current?.select() }, [])
  const version = existingVersions(name, scope) + 1
  const input = { name: name.trim() || defaultName, scope, when, note }
  return (
    <div className={s.scrim} onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
      <div className={s.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-label="Save as our answer">
        <div className={s.sheetMain}>
          <div className={`${s.panelKicker} ${s.good}`}>Save as our answer</div>
          <h2>Make it part of how you play.</h2>
          <div className={s.field}>
            <label htmlFor="ans-name">What do you call it?</label>
            <input id="ans-name" ref={first} className={s.textInput} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className={s.field}>
            <label>Who uses it?</label>
            <div className={s.seg}>{SCOPES.map(sc => <button key={sc.id} className={`${s.segBtn} ${scope === sc.id ? s.segOn : ''}`} title={sc.hint} onClick={() => setScope(sc.id)}>{sc.label}</button>)}</div>
          </div>
          <div className={s.field}>
            <label htmlFor="ans-when">When do we use it?</label>
            <input id="ans-when" className={s.textInput} value={when} onChange={e => setWhen(e.target.value)} />
          </div>
          {more ? <div className={s.field}>
            <label htmlFor="ans-note">Anything to remember? (optional)</label>
            <input id="ans-note" className={s.textInput} placeholder="e.g. Helper stops at the dotted line vs. good shooters" value={note} onChange={e => setNote(e.target.value)} />
          </div> : <button className={s.linkBtn} onClick={() => setMore(true)}>+ Add a note</button>}
          <div className={s.row} style={{ marginTop: 22 }}>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => onSave(input, false)}>{version > 1 ? `Update “${input.name}” (version ${version})` : 'Save'}</button>
            <button className={`${s.btn} ${s.btnGood}`} onClick={() => onSave(input, true)}>Save and show the players</button>
            <button className={s.btn} onClick={onClose}>Cancel</button>
          </div>
        </div>
        <div className={s.sheetSide}>
          <div className={s.sectionLabel} style={{ marginTop: 0 }}>What CourtIQ will remember</div>
          <table className={s.rules}><tbody>{rulesTable(config.answer, voice).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
          <div className={s.sectionLabel}>The tradeoff you’re accepting</div>
          {accepts.length ? accepts.map(a => <div key={a.threatId} className={s.hint} style={{ marginTop: 4, color: '#ffb3a3' }}>{threatShort(a.threatId, voice)} can be open {formatSeconds(a.seconds)}</div>) : <div className={s.hint} style={{ marginTop: 0 }}>Nothing opened in the last run.</div>}
          {knownBreaks.length > 0 && <>
            <div className={s.sectionLabel}>Known ways to beat it</div>
            {knownBreaks.map(b => <div key={b.label} className={s.hint} style={{ marginTop: 4 }}>{b.label} → {threatShort(b.threatId, voice)} {formatSeconds(b.seconds)}</div>)}
          </>}
          <div className={s.hint}>Saved with the exact run, so teaching and future tests use the same basketball. Versions are kept.</div>
        </div>
      </div>
    </div>
  )
}
