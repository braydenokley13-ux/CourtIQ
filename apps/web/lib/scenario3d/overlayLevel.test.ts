import { describe, expect, it } from 'vitest'

import type { OverlayPrimitive } from './schema'
import {
  applyOverlayLevel,
  DEFAULT_OVERLAY_LEVEL,
  getDecoderPrimaryCueKind,
  getOverlayBudget,
  getStageInDelayMs,
  isOverlaySuppressed,
  resolveEffectiveOverlayBudget,
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

describe('applyOverlayLevel — F4 mandatory cue floor', () => {
  // The pre-answer cap at advanced is 1, intermediate is 2, beginner
  // is 3. Pre-F4 these were direct slices; F4 routes them through
  // resolveEffectiveOverlayBudget with a floor of 1 for any non-'none'
  // level. The behavioural difference only surfaces in scenarios where
  // pathwayCap < 1 OR authoredCount < 1; the latter is the only case
  // an existing scene exercises today, and the answer must be 0.

  it("'none' (Boss) still emits zero pre-answer overlays even with overlays authored", () => {
    const r = applyOverlayLevel({
      preAnswer: PRE,
      postAnswer: POST,
      level: 'none',
    })
    expect(r.preAnswer).toHaveLength(0)
    expect(r.postAnswer).toHaveLength(0)
    // droppedPre reports how many input overlays did not survive the
    // pipeline. Boss truncates everything, so the dropped count should
    // equal the input length.
    expect(r.droppedPre).toBe(PRE.length)
    expect(r.droppedPost).toBe(POST.length)
  })

  it('beginner with overlays authored mounts at least 1 pre-answer overlay', () => {
    const r = applyOverlayLevel({
      preAnswer: PRE,
      postAnswer: POST,
      level: 'beginner',
    })
    expect(r.preAnswer.length).toBeGreaterThanOrEqual(1)
  })

  it('advanced with overlays authored mounts exactly 1 pre-answer overlay (the decoder cue)', () => {
    const r = applyOverlayLevel({
      preAnswer: PRE,
      postAnswer: POST,
      level: 'advanced',
    })
    expect(r.preAnswer).toHaveLength(1)
    // Priority survival — vision_cone wins the tie.
    expect(r.preAnswer[0]!.kind).toBe('defender_vision_cone')
  })

  it('intermediate with overlays authored mounts at least 1 pre-answer overlay', () => {
    const r = applyOverlayLevel({
      preAnswer: PRE,
      postAnswer: POST,
      level: 'intermediate',
    })
    expect(r.preAnswer.length).toBeGreaterThanOrEqual(1)
  })

  it('floor does NOT invent overlays when nothing was authored', () => {
    for (const level of ['beginner', 'intermediate', 'advanced', 'none', 'review'] as const) {
      const r = applyOverlayLevel({ preAnswer: [], postAnswer: [], level })
      expect(r.preAnswer).toHaveLength(0)
      expect(r.postAnswer).toHaveLength(0)
    }
  })

  it('floor does NOT invent overlays when every authored pre-overlay is filtered by the kind allow-list', () => {
    // open_space_region is post-only; the pre-answer kind allow-list
    // strips it. Authored count is 1, but the post-allow-list count is
    // 0 — the floor must not lift this back up to 1.
    const sneaky: OverlayPrimitive[] = [
      { kind: 'open_space_region', anchor: { x: 0, z: 0 }, radiusFt: 4 },
    ]
    const r = applyOverlayLevel({ preAnswer: sneaky, postAnswer: [], level: 'advanced' })
    expect(r.preAnswer).toHaveLength(0)
    expect(r.droppedPre).toBe(1)
  })

  it('priority survival: a body-language-only authored cluster keeps its highest-priority entry under tight cap', () => {
    // No vision_cone / help_pulse — just body-language cues. Under
    // advanced (cap=1, floor=1), the highest-priority entry survives.
    // Among hand_in_lane (priority 1) and hip_arrow (priority 2),
    // hand_in_lane wins.
    const bodyOnly: OverlayPrimitive[] = [
      { kind: 'defender_hip_arrow', playerId: 'x2' },
      { kind: 'defender_hand_in_lane', playerId: 'x2' },
      { kind: 'defender_chest_line', playerId: 'x2' },
    ]
    const r = applyOverlayLevel({
      preAnswer: bodyOnly,
      postAnswer: [],
      level: 'advanced',
    })
    expect(r.preAnswer).toHaveLength(1)
    expect(r.preAnswer[0]!.kind).toBe('defender_hand_in_lane')
  })

  it('post-answer floor stays at 0 — none mode emits zero post overlays', () => {
    const r = applyOverlayLevel({ preAnswer: [], postAnswer: POST, level: 'none' })
    expect(r.postAnswer).toHaveLength(0)
  })
})

describe('getDecoderPrimaryCueKind — F6 mapping', () => {
  it('maps each founder decoder to its canonical primary cue kind', () => {
    expect(getDecoderPrimaryCueKind('BACKDOOR_WINDOW')).toBe('defender_vision_cone')
    expect(getDecoderPrimaryCueKind('EMPTY_SPACE_CUT')).toBe('defender_vision_cone')
    expect(getDecoderPrimaryCueKind('SKIP_THE_ROTATION')).toBe('help_pulse')
    expect(getDecoderPrimaryCueKind('ADVANTAGE_OR_RESET')).toBe('defender_vision_cone')
  })

  it('returns undefined for DROP / HUNT (Pack 2 stub presets)', () => {
    expect(getDecoderPrimaryCueKind('READ_THE_COVERAGE')).toBeUndefined()
    expect(getDecoderPrimaryCueKind('HUNT_THE_ADVANTAGE')).toBeUndefined()
  })

  it('returns undefined for an absent decoder tag', () => {
    expect(getDecoderPrimaryCueKind(undefined)).toBeUndefined()
  })
})

describe('applyOverlayLevel — F6 decoder-cue priority dominance', () => {
  it('SKR with help_pulse promoted: distractor vision_cone authored FIRST does not steal the cap-1 slot', () => {
    // SKR's primary cue is help_pulse. A template that authors a
    // distractor vision_cone before the help_pulse would, without F6,
    // have the vision_cone win the priority-0 tie via authored-order
    // tiebreak. With F6, help_pulse is promoted to priority -1.
    const distractorFirst: OverlayPrimitive[] = [
      { kind: 'defender_vision_cone', playerId: 'x2' }, // distractor
      { kind: 'help_pulse', playerId: 'x3', role: 'overhelp' }, // SKR cue
    ]
    const r = applyOverlayLevel({
      preAnswer: distractorFirst,
      postAnswer: [],
      level: 'advanced',
      decoderTag: 'SKIP_THE_ROTATION',
    })
    expect(r.preAnswer).toHaveLength(1)
    expect(r.preAnswer[0]!.kind).toBe('help_pulse')
  })

  it('BDW with vision_cone promoted: distractor help_pulse authored FIRST does not steal the cap-1 slot', () => {
    const distractorFirst: OverlayPrimitive[] = [
      { kind: 'help_pulse', playerId: 'x3', role: 'tag' }, // distractor
      { kind: 'defender_vision_cone', playerId: 'x2' }, // BDW cue
    ]
    const r = applyOverlayLevel({
      preAnswer: distractorFirst,
      postAnswer: [],
      level: 'advanced',
      decoderTag: 'BACKDOOR_WINDOW',
    })
    expect(r.preAnswer).toHaveLength(1)
    expect(r.preAnswer[0]!.kind).toBe('defender_vision_cone')
  })

  it('without decoderTag, behaviour matches the legacy comparator (authored-order tiebreak)', () => {
    const distractorFirst: OverlayPrimitive[] = [
      { kind: 'defender_vision_cone', playerId: 'x2' },
      { kind: 'help_pulse', playerId: 'x3', role: 'overhelp' },
    ]
    const r = applyOverlayLevel({
      preAnswer: distractorFirst,
      postAnswer: [],
      level: 'advanced',
      // decoderTag omitted — legacy behaviour.
    })
    expect(r.preAnswer).toHaveLength(1)
    // Both are priority 0; stable sort keeps authored order; the
    // first authored entry (vision_cone) wins.
    expect(r.preAnswer[0]!.kind).toBe('defender_vision_cone')
  })

  it('DROP / HUNT decoder tags fall back to the legacy comparator (no canonical cue yet)', () => {
    const overlays: OverlayPrimitive[] = [
      { kind: 'help_pulse', playerId: 'x3', role: 'tag' },
      { kind: 'defender_vision_cone', playerId: 'x2' },
    ]
    const r = applyOverlayLevel({
      preAnswer: overlays,
      postAnswer: [],
      level: 'advanced',
      decoderTag: 'READ_THE_COVERAGE',
    })
    expect(r.preAnswer).toHaveLength(1)
    // No promotion → both priority 0 → authored-order wins (help_pulse).
    expect(r.preAnswer[0]!.kind).toBe('help_pulse')
  })

  it('promotion does not invent overlays — empty input still emits zero', () => {
    const r = applyOverlayLevel({
      preAnswer: [],
      postAnswer: [],
      level: 'advanced',
      decoderTag: 'BACKDOOR_WINDOW',
    })
    expect(r.preAnswer).toHaveLength(0)
  })

  it('promotion respects the F4 floor: Boss (none) still emits zero pre overlays even with promotion', () => {
    const overlays: OverlayPrimitive[] = [
      { kind: 'defender_vision_cone', playerId: 'x2' },
    ]
    const r = applyOverlayLevel({
      preAnswer: overlays,
      postAnswer: [],
      level: 'none',
      decoderTag: 'BACKDOOR_WINDOW',
    })
    expect(r.preAnswer).toHaveLength(0)
  })

  it('beginner cap (3) keeps promoted cue + all body-language cues regardless of authored order', () => {
    // SKR cluster authored with body-language first, decoder cue last.
    // Beginner emits all three; the promoted cue should be FIRST in
    // the output (priority -1) regardless of authored order.
    const cluster: OverlayPrimitive[] = [
      { kind: 'defender_chest_line', playerId: 'x3' },
      { kind: 'defender_hip_arrow', playerId: 'x3' },
      { kind: 'help_pulse', playerId: 'x3', role: 'overhelp' },
    ]
    const r = applyOverlayLevel({
      preAnswer: cluster,
      postAnswer: [],
      level: 'beginner',
      decoderTag: 'SKIP_THE_ROTATION',
    })
    expect(r.preAnswer).toHaveLength(3)
    expect(r.preAnswer[0]!.kind).toBe('help_pulse')
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

// ---------------------------------------------------------------------------
// Pack 2 Teaching-Quality F4 — pure-helper matrix.
//
// Covers the full clamp behaviour across the realistic input domain:
//   authoredCount: 0..5  (D-cap range; D5 authors 1, D1 up to 3)
//   pathwayCap:   0..3  (none / advanced / intermediate / beginner)
//   mandatoryCueFloor: 0 and 1
// = 6 × 4 × 2 = 48 cases enumerated below, with named edge-case asserts
// for the cases the policy hinges on (Boss preserves zero, advanced
// preserves the cue floor, empty authored lists never invent).
// ---------------------------------------------------------------------------
describe('resolveEffectiveOverlayBudget — F4 pure helper', () => {
  it('returns 0 when authoredCount is 0 regardless of cap or floor', () => {
    for (const cap of [0, 1, 2, 3]) {
      for (const floor of [0, 1]) {
        expect(resolveEffectiveOverlayBudget(0, cap, floor)).toBe(0)
      }
    }
  })

  it('Boss Challenge (cap=0, floor=0) always returns 0', () => {
    for (const authored of [0, 1, 2, 3, 4, 5]) {
      expect(resolveEffectiveOverlayBudget(authored, 0, 0)).toBe(0)
    }
  })

  it('cap=0 with floor=1 lifts to floor=1 when authored is non-zero', () => {
    expect(resolveEffectiveOverlayBudget(3, 0, 1)).toBe(1)
    // …but not when nothing is authored.
    expect(resolveEffectiveOverlayBudget(0, 0, 1)).toBe(0)
  })

  it('advanced (cap=1, floor=1) keeps exactly 1 when overlays exist', () => {
    expect(resolveEffectiveOverlayBudget(3, 1, 1)).toBe(1)
    expect(resolveEffectiveOverlayBudget(1, 1, 1)).toBe(1)
    expect(resolveEffectiveOverlayBudget(0, 1, 1)).toBe(0)
  })

  it('beginner (cap=3, floor=1) returns min(authored, 3)', () => {
    expect(resolveEffectiveOverlayBudget(0, 3, 1)).toBe(0)
    expect(resolveEffectiveOverlayBudget(1, 3, 1)).toBe(1)
    expect(resolveEffectiveOverlayBudget(2, 3, 1)).toBe(2)
    expect(resolveEffectiveOverlayBudget(3, 3, 1)).toBe(3)
    expect(resolveEffectiveOverlayBudget(5, 3, 1)).toBe(3)
  })

  it('intermediate (cap=2, floor=1) returns min(authored, 2) with floor honoured', () => {
    expect(resolveEffectiveOverlayBudget(1, 2, 1)).toBe(1)
    expect(resolveEffectiveOverlayBudget(2, 2, 1)).toBe(2)
    expect(resolveEffectiveOverlayBudget(5, 2, 1)).toBe(2)
  })

  it('floor cannot invent overlays past authoredCount', () => {
    expect(resolveEffectiveOverlayBudget(0, 3, 1)).toBe(0)
    expect(resolveEffectiveOverlayBudget(0, 2, 1)).toBe(0)
    expect(resolveEffectiveOverlayBudget(0, 1, 1)).toBe(0)
  })

  it('clamps non-integer / negative inputs to safe values', () => {
    expect(resolveEffectiveOverlayBudget(-1, 3, 1)).toBe(0)
    expect(resolveEffectiveOverlayBudget(2.7, 3, 1)).toBe(2)
    expect(resolveEffectiveOverlayBudget(3, -2, 1)).toBe(1)
    expect(resolveEffectiveOverlayBudget(3, 2.4, 1)).toBe(2)
    expect(resolveEffectiveOverlayBudget(3, 3, -1)).toBe(3)
  })

  it('accepts Infinity as pathwayCap (review mode) and collapses to authoredCount', () => {
    expect(resolveEffectiveOverlayBudget(0, Number.POSITIVE_INFINITY, 1)).toBe(0)
    expect(resolveEffectiveOverlayBudget(3, Number.POSITIVE_INFINITY, 1)).toBe(3)
    expect(resolveEffectiveOverlayBudget(5, Number.POSITIVE_INFINITY, 0)).toBe(5)
  })

  it('clamps NaN inputs to 0 instead of leaking NaN through the budget', () => {
    // Each NaN-tainted input collapses to 0, so the result is bounded by
    // authoredCount and never returns NaN (which downstream takeWithCap
    // would treat as an unlimited cap).
    expect(resolveEffectiveOverlayBudget(Number.NaN, 3, 1)).toBe(0)
    expect(resolveEffectiveOverlayBudget(3, Number.NaN, 1)).toBe(1)
    expect(resolveEffectiveOverlayBudget(3, 3, Number.NaN)).toBe(3)
    expect(resolveEffectiveOverlayBudget(Number.NaN, Number.NaN, Number.NaN)).toBe(0)
  })

  it('full matrix enumeration is monotonic non-decreasing in authoredCount', () => {
    for (const cap of [0, 1, 2, 3]) {
      for (const floor of [0, 1]) {
        let prev = -1
        for (const authored of [0, 1, 2, 3, 4, 5]) {
          const got = resolveEffectiveOverlayBudget(authored, cap, floor)
          expect(got).toBeGreaterThanOrEqual(prev)
          prev = got
        }
      }
    }
  })

  it('full matrix enumeration is monotonic non-decreasing in pathwayCap', () => {
    for (const authored of [0, 1, 2, 3, 4, 5]) {
      for (const floor of [0, 1]) {
        let prev = -1
        for (const cap of [0, 1, 2, 3]) {
          const got = resolveEffectiveOverlayBudget(authored, cap, floor)
          expect(got).toBeGreaterThanOrEqual(prev)
          prev = got
        }
      }
    }
  })

  it('result is always within [0, authoredCount]', () => {
    for (const authored of [0, 1, 2, 3, 4, 5]) {
      for (const cap of [0, 1, 2, 3]) {
        for (const floor of [0, 1]) {
          const got = resolveEffectiveOverlayBudget(authored, cap, floor)
          expect(got).toBeGreaterThanOrEqual(0)
          expect(got).toBeLessThanOrEqual(authored)
        }
      }
    }
  })
})
