import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '@courtiq/basketball/scenario'
import { frameAt, simulate } from '@courtiq/basketball/simulation'
import { LENSES, divergenceLabels, divergenceMarks, ballClock, lensLabels, lensMarks } from './lenses'
import type { Lens } from './world/types'

const config = createDefaultConfig()
const result = simulate(config)
// A frame while the problem is live: after the screen, ball handler on the ball.
import { analyze } from '@courtiq/basketball/analytics'
import { findTeachingMoment } from '@courtiq/basketball/explore'
const moment = findTeachingMoment(result, analyze(result))
const times = [0.8, 1.6, 2.4, 3.2, ...(moment ? [moment.t] : [])]

describe('x-ray lenses are pure and always yield marks for the default frame', () => {
  for (const lens of LENSES.filter((l) => l.id !== 'normal').map((l) => l.id as Lens)) {
    it(`${lens} draws something at every sampled time`, () => {
      for (const t of times) {
        const frame = frameAt(result, t)
        const marks = lensMarks(lens, frame, config.assumptions, null, frameAt(result, Math.max(0, t - 0.5)))
        expect(marks.length, `${lens}@${t}`).toBeGreaterThan(0)
        const ids = marks.map((m) => m.id)
        expect(new Set(ids).size, 'ids are unique').toBe(ids.length)
        // Pure: same inputs, same marks.
        expect(lensMarks(lens, frame, config.assumptions, null, frameAt(result, Math.max(0, t - 0.5)))).toEqual(marks)
      }
    })
  }
  it('normal draws nothing', () =>
    expect(lensMarks('normal', frameAt(result, 1), config.assumptions, null)).toEqual([]))

  it('duty strings: one string per tied defender, at chest height', () => {
    const frame = frameAt(result, 1.6)
    const marks = lensMarks('ownership', frame, config.assumptions, null)
    const strings = marks.filter((m) => m.kind === 'tether')
    expect(strings.length).toBeGreaterThanOrEqual(new Set(frame.responsibilities.map((r) => r.defenderId)).size)
    for (const m of strings) expect(m.kind === 'tether' && m.y).toBeGreaterThan(0.8)
  })

  it('arrival map: one sampled domain field and a positive ball clock', () => {
    const frame = frameAt(result, 1.6)
    const [map] = lensMarks('reach', frame, config.assumptions, null).filter((m) => m.kind === 'arrival')
    expect(map && map.kind === 'arrival' && map.field.seconds.length).toBe(33 * 31)
    expect(map && map.kind === 'arrival' && map.field.seconds.every(Number.isFinite)).toBe(true)
    expect(ballClock(frame, config.assumptions, new Set())).toBeGreaterThan(0)
  })

  it('glass corridors: one lane per available receiver, cuts stay in 0..1', () => {
    const frame = frameAt(result, 0.8)
    const lanes = lensMarks('passing', frame, config.assumptions, null).filter(
      (m) => m.kind === 'lane' && m.id !== 'lane-drive',
    )
    const mates = frame.players.filter((p) => p.team === 'offense' && p.id !== frame.ball.owner)
    expect(lanes.length).toBe(mates.length)
    for (const l of lanes)
      if (l.kind === 'lane')
        for (const [a, b] of l.cuts ?? []) {
          expect(a).toBeGreaterThanOrEqual(0)
          expect(b).toBeLessThanOrEqual(1)
          expect(b).toBeGreaterThanOrEqual(a)
        }
  })

  it('compare is difference only: identical worlds produce no marks or labels', () => {
    expect(divergenceMarks(result, result, 2)).toEqual([])
    expect(divergenceLabels(result, result, 2)).toEqual([])
    const other = simulate({
      ...config,
      answer: { ...config.answer, tagDepth: Math.min(1, config.answer.tagDepth + 0.6) },
    })
    const marks = divergenceMarks(result, other, 2.6)
    for (const m of marks)
      if (m.kind === 'path' && m.id.startsWith('dv-b-')) expect(m.points.length).toBeLessThanOrEqual(11)
  })
})

describe('the default teaching frame shows the open man in every lens', () => {
  it('draws the open player (ring or island) and a pinned phrase', () => {
    expect(moment).toBeTruthy()
    const frame = frameAt(result, moment!.t)
    for (const lens of ['ownership', 'reach', 'passing', 'space'] as Lens[]) {
      expect(lensLabels(lens, frame, config.assumptions).length, lens).toBeGreaterThan(0)
    }
    const arrival = lensMarks('reach', frame, config.assumptions, null).find((m) => m.kind === 'arrival')
    expect(arrival && arrival.kind === 'arrival' && (arrival.islands ?? []).length).toBeGreaterThan(0)
  })
})
