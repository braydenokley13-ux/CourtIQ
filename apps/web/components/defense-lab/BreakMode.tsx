'use client'

import { useEffect, useRef } from 'react'
import { attackExecutionUnresolved, attackIntentLabel, type AttackPreview, type AttackReport } from '@/lib/defense-lab/attack'
import type { PlayerId, ThreatId } from '@/lib/defense-lab/types'
import s from './BreakMode.module.css'

export type BreakPhase = 'searching' | 'selecting' | 'playing' | 'frozen' | 'fixing'
export interface BreakModeProps {
  phase: BreakPhase
  report: AttackReport | null
  candidates: AttackPreview[]
  progress: number
  time: number
  replayPlaying?: boolean
  editingDefenderId?: PlayerId | null
  /** Projected court attachment; the parent avoids players and other controls. */
  anchor?: { x: number; y: number; width?: number }
  onCaptionHeightChange?: (height:number) => void
  onCancel: () => void
  onReplay: () => void
  onFix: () => void
  onAttackAgain: () => void
  onInspect: () => void
}

const threatLabels: Record<ThreatId, string> = { drive: 'The drive', roll: 'The roller', pop: 'The pop', corner: 'The corner', lift: 'The lift', strong: 'The strong corner' }
const outcomeLabels = { held: 'No opening found', exposed: 'Opening witnessed', conditional: 'Conditional opening' }
const steps = ['Attack', 'Watch', 'Read', 'Fix']

/** Court-wide mode chrome. The 3D renderer owns the auditioned routes and actual
 * possession. This component never animates or fabricates simulation evidence. */
export default function BreakMode({ phase, report, candidates, progress, time, replayPlaying = true, editingDefenderId, anchor, onCaptionHeightChange, onCancel, onReplay, onFix, onAttackAgain, onInspect }: BreakModeProps) {
  const caption = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!caption.current || !onCaptionHeightChange) return
    const observer = new ResizeObserver(entries => {
      const height = entries[0]?.borderBoxSize?.[0]?.blockSize ?? caption.current?.getBoundingClientRect().height
      if (height && height > 32) onCaptionHeightChange(Math.ceil(height))
    })
    observer.observe(caption.current)
    return () => observer.disconnect()
  },[phase,onCaptionHeightChange])
  const searching = phase === 'searching'
  const selecting = phase === 'selecting'
  const frozen = phase === 'frozen'
  const fixing = phase === 'fixing'
  const witness = report?.selected.witness
  const selected = candidates.find(candidate => candidate.selected)
  const latest = candidates[candidates.length - 1]
  const step = searching || selecting ? 0 : phase === 'playing' ? 1 : frozen ? 2 : 3
  const selectedLabel = report ? attackIntentLabel(report.selected) : selected?.label
  const unresolved = !!report && attackExecutionUnresolved(report.selected.result)
  const verdict = witness ? witness.conditional ? 'conditional' : 'exposed' : unresolved ? 'conditional' : 'held'
  const previewSet = selecting ? selected ? [selected] : candidates.slice(-1) : candidates.slice(-1)
  const heading = searching ? 'Let the offense look for a way through.'
    : selecting ? witness ? witness.conditional ? 'A conditional route to inspect.' : report?.selected.changes.length ? 'The smallest change that exposes us.' : 'Their current offense already finds it.' : unresolved ? 'Execution stopped. Inspect the flight.' : 'No executable opening found.'
    : phase === 'playing' ? 'Watch the possession unfold.'
    : fixing ? `Coach ${witness?.limitingDefenderId ?? 'our answer'}. Then attack again.`
    : witness ? witness.conditional ? 'An opening after uncertain execution.' : `${threatLabels[witness.threatId]} opens before ${witness.limitingDefenderId} arrives.`
    : unresolved ? 'Execution stopped before an opening.' : 'No executable opening found.'
  const paired = report?.pairedRetest
  const pairedText = paired ? (paired.sameExperiment ? 'Same attack' : 'Previous opponent · other inputs changed') + ': ' + (paired.current.witness ? paired.current.witness.conditional ? 'conditional opening remains.' : 'opening remains.' : attackExecutionUnresolved(paired.current.result) ? 'execution unresolved.' : 'no supported opening found.') : null

  return <section className={s.mode} data-testid="break-mode" data-phase={phase} data-verdict={searching ? 'pending' : verdict} aria-label="Break Mode">
    <div className={s.modeBar}>
      <span className={s.modeMark} aria-hidden="true"><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3 16V11C3 8 5 6 8 6H16M12 2L16 6L12 10M3 16L8 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
      <b>BREAK MODE</b>
      <ol className={s.steps} aria-label="Break Mode sequence">{steps.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} data-complete={index < step}>{label}</li>)}</ol>
      {fixing && <span className={s.editingCue}>Coaching {editingDefenderId ?? 'our answer'}</span>}
      <button className={s.close} onClick={onCancel} aria-label={searching ? 'Cancel attack and exit Break Mode' : 'Exit Break Mode'} title="Exit Break Mode">×</button>
      {searching && <progress className={s.progress} max="1" value={progress} aria-label="Completed attack replays" />}
    </div>

    <div ref={caption} className={`${s.caption} ${fixing ? s.fixing : ''} ${frozen ? s.frozen : ''} ${phase === 'playing' ? s.watching : ''}`} style={frozen && anchor ? { left: anchor.x, top: anchor.y, width: anchor.width ?? 282, bottom: 'auto', transform: 'none' } : undefined} data-testid="attack-evidence">
      <div className={s.eyebrow}>
        <span className={s.signal} data-verdict={searching ? 'pending' : verdict} />
        {searching ? `${latest?.replays ?? 0} replays completed` : selecting ? 'Choosing the replay' : phase === 'playing' ? `${replayPlaying ? 'Live replay' : 'Replay paused'} · ${time.toFixed(2)} s` : fixing ? 'YOUR DEFENSIVE ANSWER' : witness ? `Frozen at first exposure · ${witness.at.toFixed(2)} s` : 'Search complete'}
      </div>
      <h2 role="status" aria-live="polite" aria-atomic="true">{heading}</h2>

      {(searching || selecting) && <>
        <p className={s.support}>{searching ? 'Faint routes are completed tests. Contained routes fade.' : selectedLabel}</p>
        {previewSet.length > 0 && <div className={s.branches} aria-label="Sampled tested routes">{previewSet.map(candidate => <div key={candidate.id} className={s.branch} data-verdict={candidate.verdict} data-selected={candidate.selected}>
          <span className={s.branchLine} aria-hidden="true" />
          <span><b>{candidate.label}</b><small>{candidate.verdict === 'conditional' && candidate.witnessAt === null ? 'Execution unresolved' : outcomeLabels[candidate.verdict]}</small></span>
        </div>)}</div>}
        {searching && <span className={s.limit}>A bounded search of screen, lift and counter permissions</span>}
      </>}

      {phase === 'playing' && <p className={s.support}>{selectedLabel}{witness ? ` · Follow ${witness.limitingDefenderId}` : ' · Watching the current offense'}</p>}

      {frozen && report && <>
        <p className={s.support}>{report.selected.changes.length ? selectedLabel : witness ? 'No change needed. Their current offense creates this opening.' : unresolved ? 'The modeled flight could not be completed. This is not a held possession.' : 'No opening appeared in these tested possessions.'}</p>
        {witness && <div className={s.timing} aria-label="Defensive arrival compared with next permitted release">
          <span><b>{witness.releaseSeconds.toFixed(2)}<small>s</small></b> next permitted release</span>
          <span className={s.timingDivider} aria-hidden="true">→</span>
          <span><b>{witness.arrivalSeconds.toFixed(2)}<small>s</small></b> {witness.limitingDefenderId} arrival estimate</span>
        </div>}
        {(witness?.conditional || !witness && unresolved) && <p className={s.conditional}>{witness ? 'This opening follows unresolved flight, catch or boundary evidence.' : 'The flight stopped or the catch failed. Inspect the execution.'}</p>}
        {pairedText && <p className={s.paired}>{pairedText}</p>}
        <div className={s.actions}>
          <button className={s.primary} onClick={verdict === 'conditional' ? onInspect : onFix}>{verdict === 'conditional' ? 'Inspect execution' : witness ? 'Fix it' : 'Coach our answer'} <span aria-hidden="true">↗</span></button>
          {verdict === 'conditional' && <button className={s.secondary} onClick={onFix}>Coach our answer</button>}
          <button className={s.secondary} onClick={onReplay}>Watch again</button>
          {verdict !== 'conditional' && <button className={s.secondary} onClick={onInspect}>Why?</button>}
        </div>
        <span className={s.limit}>{report.budget.used} replays · Findings apply to these tested possessions</span>
      </>}

      {fixing && <>
        <p className={s.support}>Change his responsibility. Retest the same opponent, then find the next opening.</p>
        <button className={s.primary} onClick={onAttackAgain}>Break it again <span aria-hidden="true">↗</span></button>
      </>}
    </div>
  </section>
}
