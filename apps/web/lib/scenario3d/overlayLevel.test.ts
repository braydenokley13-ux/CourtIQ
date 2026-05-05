import { describe, expect, it } from 'vitest'

import type { OverlayPrimitive } from './schema'
import {
  applyOverlayLevel,
  DEFAULT_OVERLAY_LEVEL,
  getOverlayBudget,
  getStageInDelayMs,
  isOverlaySuppressed,
} from './overlayLevel'

const PRE: OverlayPrimitive[] = [
  { kind: 'defender_vision_cone', playerId: 'x2', targetId: 'p1' },
  { kind: 'defender_hip_arrow', playerId: 'x2' },
  { kind: 'defender_hand_in_lane', playerId: 'x2' },
]

const POST: OverlayPrimitive[] = [
  { kind: 'passing_lane_blocked', from: 'p1', to: 'u1' },
  { kind: 'open_space_region', anchor: { x: 0, z: 18 }, radiusFt: 4 },
  {
    kind: 'drive_cut_preview',
    playerId: 'u1',
    path: [
      { x: -10, z: 16 },
      { x: -2, z: 18 },
      { x: 0, z: 22 },
    ],
  },
]

describe('getOverlayBudget', () => {
  it('beginner is 3 / 3 — Section 9.2 Learn the Cue row', () => {
    expect(getOverlayBudget('beginner')).toEqual({ preMax: 3, postMax: 3 })
  })

  it('intermediate is 2 / 2', () => {
    expect(getOverlayBudget('intermediate')).toEqual({ preMax: 2, postMax: 2 })
  })

  it('advanced is 1 / 1', () => {
    expect(getOverlayBudget('advanced')).toEqual({ preMax: 1, postMax: 1 })
  })

  it('none is 0 / 0 — Boss Challenge mode', () => {
    expect(getOverlayBudget('none')).toEqual({ preMax: 0, postMax: 0 })
  })

  it('review is uncapped — Film Room Review row', () => {
    const b = getOverlayBudget('review')
    expect(b.preMax).toBe(Number.POSITIVE_INFINITY)
    expect(b.postMax).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('applyOverlayLevel — pre-answer counts', () => {
  it('beginner emits the full cluster', () => {
    const r = applyOverlayLevel({ preAnswer: PRE, postAnswer: POST, level: 'beginner' })
    expect(r.preAnswer).toHaveLength(3)
    expect(r.postAnswer).toHaveLength(3)
    expect(r.droppedPre).toBe(0)
    expect(r.droppedPost).toBe(0)
  })

  it('intermediate emits a smaller cluster', () => {
    const r = applyOverlayLevel({ preAnswer: PRE, postAnswer: POST, level: 'intermediate' })
    expect(r.preAnswer).toHaveLength(2)
    expect(r.postAnswer).toHaveLength(2)
    expect(r.droppedPre).toBe(1)
    expect(r.droppedPost).toBe(1)
  })

  it('advanced emits the cue overlay only', () => {
    const r = applyOverlayLevel({ preAnswer: PRE, postAnswer: POST, level: 'advanced' })
    expect(r.preAnswer).toHaveLength(1)
    expect(r.postAnswer).toHaveLength(1)
    // Decoder cue (vision cone) wins under tight budget.
    expect(r.preAnswer[0]!.kind).toBe('defender_vision_cone')
  })

  it('none emits zero overlays — Boss mode', () => {
    const r = applyOverlayLevel({ preAnswer: PRE, postAnswer: POST, level: 'none' })
    expect(r.preAnswer).toHaveLength(0)
    expect(r.postAnswer).toHaveLength(0)
  })

  it('review emits everything authored — Film Room Review', () => {
    const longPre: OverlayPrimitive[] = [
      ...PRE,
      { kind: 'defender_chest_line', playerId: 'x2' },
      { kind: 'defender_foot_arrow', playerId: 'x2' },
    ]
    const r = applyOverlayLevel({
      preAnswer: longPre,
      postAnswer: POST,
      level: 'review',
    })
    expect(r.preAnswer).toHaveLength(longPre.length)
    expect(r.postAnswer).toHaveLength(POST.length)
  })
})

describe('applyOverlayLevel — pre-answer kind allow-list (defense in depth)', () => {
  it('drops kinds not in PRE_ANSWER_OVERLAY_KINDS even at review', () => {
    const sneaky: OverlayPrimitive[] = [
      { kind: 'defender_vision_cone', playerId: 'x2' },
      // Not in PRE_ANSWER_OVERLAY_KINDS — would reveal the answer.
      { kind: 'open_space_region', anchor: { x: 0, z: 0 }, radiusFt: 4 },
      { kind: 'passing_lane_open', from: 'p1', to: 'u1' },
      {
        kind: 'drive_cut_preview',
        playerId: 'u1',
        path: [
          { x: 0, z: 0 },
          { x: 1, z: 1 },
        ],
      },
    ]
    const r = applyOverlayLevel({ preAnswer: sneaky, postAnswer: [], level: 'review' })
    expect(r.preAnswer).toHaveLength(1)
    expect(r.preAnswer[0]!.kind).toBe('defender_vision_cone')
    // 3 dropped from the input.
    expect(r.droppedPre).toBe(3)
  })

  it('never emits an answer-reveal kind in pre-answer regardless of level', () => {
    const sneaky: OverlayPrimitive[] = [
      { kind: 'open_space_region', anchor: { x: 0, z: 0 }, radiusFt: 4 },
    ]
    const levels = ['beginner', 'intermediate', 'advanced', 'none', 'review'] as const
    for (const level of levels) {
      const r = applyOverlayLevel({ preAnswer: sneaky, postAnswer: [], level })
      for (const o of r.preAnswer) {
        expect([
          'defender_vision_cone',
          'defender_hip_arrow',
          'defender_foot_arrow',
          'defender_chest_line',
          'defender_hand_in_lane',
          'help_pulse',
          'label',
        ]).toContain(o.kind)
      }
    }
  })
})

describe('applyOverlayLevel — purity', () => {
  it('does not mutate input arrays', () => {
    const pre = [...PRE]
    const post = [...POST]
    const snapPre = JSON.stringify(pre)
    const snapPost = JSON.stringify(post)
    applyOverlayLevel({ preAnswer: pre, postAnswer: post, level: 'advanced' })
    expect(JSON.stringify(pre)).toBe(snapPre)
    expect(JSON.stringify(post)).toBe(snapPost)
  })

  it('returns the same shape on identical inputs', () => {
    const a = applyOverlayLevel({ preAnswer: PRE, postAnswer: POST, level: 'beginner' })
    const b = applyOverlayLevel({ preAnswer: PRE, postAnswer: POST, level: 'beginner' })
    expect(a).toEqual(b)
  })
})

describe('isOverlaySuppressed', () => {
  it('only "none" suppresses', () => {
    expect(isOverlaySuppressed('none')).toBe(true)
    expect(isOverlaySuppressed('beginner')).toBe(false)
    expect(isOverlaySuppressed('intermediate')).toBe(false)
    expect(isOverlaySuppressed('advanced')).toBe(false)
    expect(isOverlaySuppressed('review')).toBe(false)
  })
})

describe('getStageInDelayMs', () => {
  it('matches the §9.7 spec for indices 0/1/2', () => {
    expect(getStageInDelayMs(0)).toBe(40)
    expect(getStageInDelayMs(1)).toBe(120)
    expect(getStageInDelayMs(2)).toBe(220)
  })

  it('extends linearly past index 2 at 100ms/step', () => {
    expect(getStageInDelayMs(3)).toBe(320)
    expect(getStageInDelayMs(4)).toBe(420)
    expect(getStageInDelayMs(5)).toBe(520)
  })

  it('is monotonic non-decreasing', () => {
    let prev = -1
    for (let i = 0; i < 12; i += 1) {
      const v = getStageInDelayMs(i)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })

  it('clamps non-finite / negative to 0', () => {
    expect(getStageInDelayMs(-1)).toBe(0)
    expect(getStageInDelayMs(Number.NaN)).toBe(0)
    expect(getStageInDelayMs(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('is deterministic — same index yields same delay', () => {
    expect(getStageInDelayMs(2)).toBe(getStageInDelayMs(2))
    expect(getStageInDelayMs(7)).toBe(getStageInDelayMs(7))
  })
})

describe('DEFAULT_OVERLAY_LEVEL', () => {
  it('defaults to beginner so /train preserves pre-FR-5 behavior', () => {
    expect(DEFAULT_OVERLAY_LEVEL).toBe('beginner')
  })
})
