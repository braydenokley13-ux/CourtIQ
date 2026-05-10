import { describe, it, expect } from 'vitest'
import { copyForBand, recognitionReason, todaysFocusLine, decoderLabel } from './copyForBand'
import type { DecoderConfidence } from '../adaptive/types'

const baseConfidence: DecoderConfidence = {
  decoderTag: 'BACKDOOR_WINDOW',
  band: 'untested',
  evidence: {
    attempts: 0,
    accuracyLastN: 0,
    p50LatencyMs: null,
    transferTemplates: 0,
    hardestDisguiseRecognized: null,
    inadmissibleCount: 0,
  },
  nextProbe: 'first-rep',
}

describe('decoderLabel', () => {
  it('maps known founder tags to display labels', () => {
    expect(decoderLabel('BACKDOOR_WINDOW')).toBe('Backdoor Window')
    expect(decoderLabel('ADVANTAGE_OR_RESET')).toBe('Advantage or Reset')
  })

  it('maps Pack 2 tags to display labels (no raw enum leak)', () => {
    expect(decoderLabel('READ_THE_COVERAGE')).toBe('Read the Coverage')
    expect(decoderLabel('HUNT_THE_ADVANTAGE')).toBe('Hunt the Advantage')
  })

  it('humanizes an unknown SCREAMING_SNAKE tag instead of echoing it raw', () => {
    expect(decoderLabel('FUTURE_DECODER')).toBe('Future Decoder')
  })
})

describe('copyForBand', () => {
  it('untested → "New", invites first read', () => {
    const r = copyForBand(baseConfidence)
    expect(r.status).toBe('New')
    expect(r.evidence).toContain('first')
    expect(r.showProgressPulse).toBe(false)
  })

  it('recognizing → "Reading it" with evidence', () => {
    const r = copyForBand({
      ...baseConfidence,
      band: 'recognizing',
      evidence: {
        ...baseConfidence.evidence,
        attempts: 5,
        p50LatencyMs: 3400,
      },
      nextProbe: 'maintain',
    })
    expect(r.status).toBe('Reading it')
    expect(r.evidence).toContain('3.4s')
    expect(r.showProgressPulse).toBe(true)
  })

  it('reflexive → "Sharp" with latency line', () => {
    const r = copyForBand({
      ...baseConfidence,
      band: 'reflexive',
      evidence: {
        ...baseConfidence.evidence,
        attempts: 8,
        p50LatencyMs: 2800,
        hardestDisguiseRecognized: 'light',
      },
      nextProbe: 'disguise-up',
    })
    expect(r.status).toBe('Sharp')
    expect(r.evidence).toContain('2.8s')
    expect(r.showProgressPulse).toBe(true) // still has heavy ahead
  })

  it('reflexive at hardest=heavy → no progress pulse (sharp ceiling)', () => {
    const r = copyForBand({
      ...baseConfidence,
      band: 'reflexive',
      evidence: {
        ...baseConfidence.evidence,
        attempts: 10,
        p50LatencyMs: 2500,
        hardestDisguiseRecognized: 'heavy',
      },
      nextProbe: 'maintain',
    })
    expect(r.showProgressPulse).toBe(false)
  })

  it('mastered → "Nailed it"', () => {
    const r = copyForBand({
      ...baseConfidence,
      band: 'mastered',
      evidence: {
        ...baseConfidence.evidence,
        attempts: 12,
        p50LatencyMs: 2400,
        hardestDisguiseRecognized: 'heavy',
      },
      nextProbe: 'boss-ready',
    })
    expect(r.status).toBe('Nailed it')
    expect(r.evidence).toContain('pressure')
    expect(r.showProgressPulse).toBe(false)
  })

  it('never exposes engineering vocabulary in player-facing copy', () => {
    const bands: DecoderConfidence['band'][] = ['untested', 'recognizing', 'reflexive', 'mastered']
    for (const band of bands) {
      const r = copyForBand({ ...baseConfidence, band })
      const allCopy = `${r.status} ${r.evidence}`
      expect(allCopy).not.toMatch(/recognizing|reflexive|mastered|p50|latency|probe|band/i)
    }
  })
})

describe('recognitionReason', () => {
  it('returns one short coach-voice line per probe', () => {
    expect(recognitionReason('first-rep')).toBe('First read on this pattern.')
    expect(recognitionReason('disguise-up')).toMatch(/cue removed/)
    expect(recognitionReason('transfer-probe')).toBe('Same read, new shape.')
    expect(recognitionReason('mystery-mode')).toMatch(/no hints/i)
    expect(recognitionReason('boss-ready')).toMatch(/boss/i)
    expect(recognitionReason('lesson-refresh')).toMatch(/re-read/i)
    expect(recognitionReason('maintain')).toBe('Stay sharp.')
  })

  it('returns short single sentences (no exclamation marks)', () => {
    const probes = [
      'first-rep',
      'disguise-up',
      'transfer-probe',
      'lesson-refresh',
      'mystery-mode',
      'boss-ready',
      'maintain',
    ] as const
    for (const p of probes) {
      const line = recognitionReason(p)
      expect(line).not.toMatch(/!/)
      expect(line.length).toBeLessThan(60)
    }
  })
})

describe('todaysFocusLine', () => {
  it('returns null when nothing is in progress', () => {
    expect(todaysFocusLine([baseConfidence])).toBeNull()
  })

  it('prefers reflexive over recognizing', () => {
    const recognizing: DecoderConfidence = {
      ...baseConfidence,
      decoderTag: 'BACKDOOR_WINDOW',
      band: 'recognizing',
      evidence: { ...baseConfidence.evidence, attempts: 5, p50LatencyMs: 4000 },
    }
    const reflexive: DecoderConfidence = {
      ...baseConfidence,
      decoderTag: 'EMPTY_SPACE_CUT',
      band: 'reflexive',
      evidence: { ...baseConfidence.evidence, attempts: 8, p50LatencyMs: 2800 },
    }
    const line = todaysFocusLine([recognizing, reflexive])
    expect(line).toContain('Empty-Space Cut')
  })

  it('boss-ready surfaces "boss read is open"', () => {
    const reflexive: DecoderConfidence = {
      ...baseConfidence,
      band: 'reflexive',
      evidence: { ...baseConfidence.evidence, attempts: 10, p50LatencyMs: 2500 },
      nextProbe: 'boss-ready',
    }
    expect(todaysFocusLine([reflexive])).toContain('boss read is open')
  })

  it('transfer-probe gets a "new shape" line for recognizing band', () => {
    const recognizing: DecoderConfidence = {
      ...baseConfidence,
      band: 'recognizing',
      evidence: { ...baseConfidence.evidence, attempts: 5, p50LatencyMs: 3500, transferTemplates: 1 },
      nextProbe: 'transfer-probe',
    }
    expect(todaysFocusLine([recognizing])).toContain('new shape')
  })
})
