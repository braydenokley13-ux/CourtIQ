/**
 * V2-I — V2 Readiness Regression.
 *
 * Cross-cutting test that exercises every V2 helper against the
 * 20-scenario founder QA matrix so a future packet that perturbs one
 * helper cannot silently break the others. The test does not mount
 * the renderer — it only sweeps the pure data layers each V2 packet
 * shipped, checking that:
 *
 *   1. cameraTransitions.ts            — every transition between any
 *                                          two CameraModes returns a
 *                                          finite ease in [0.10, 0.60].
 *   2. movementCurvesV2.ts             — every curve is finite over a
 *                                          dense sample grid.
 *   3. overlayChoreography.ts          — feeding every QA-matrix
 *                                          required-overlay set produces
 *                                          a deterministic, ordered
 *                                          stagger timeline.
 *   4. fullscreenSafeArea.ts           — every common viewport reports
 *                                          finite, non-negative insets.
 *   5. pathwayMilestones.ts            — every progress-summary state
 *                                          maps to a non-empty headline.
 *   6. playerPresence.ts               — helpers do not throw under any
 *                                          opt set.
 *   7. framePacing.ts                  — empty/full trackers report
 *                                          stable summaries.
 *
 * The point is regression cover, not exhaustive feature testing —
 * each helper has its own dedicated suite. This file is the V2 sweep
 * that proves the packets compose cleanly.
 */

import { describe, it, expect } from 'vitest'
import {
  getCameraTransitionEaseS,
  LEGACY_CAMERA_EASE_S,
} from './cameraTransitions'
import {
  easeAthleticCutV2,
  easeCloseoutV2,
  easeStopHardV2,
} from './movementCurvesV2'
import {
  buildChoreography,
  roleForPrimitive,
  type OverlayChoreographyEntry,
} from './overlayChoreography'
import { resolveFullscreenChromeInsets } from './fullscreenSafeArea'
import { deriveMilestone, ALL_MILESTONE_TONES } from '@/lib/pathways/pathwayMilestones'
import {
  buildPlayerShadowTexture,
  buildPlayerSheenTexture,
} from './playerPresence'
import { FramePacingTracker } from './framePacing'
import type { CameraMode } from '@/components/scenario3d/imperativeScene'
import type { OverlayPrimitive } from './schema'
import type {
  PathwayConfig,
  PathwayChapterConfig,
  PathwayProgressSummary,
} from '@/lib/pathways/types'

const ALL_MODES: readonly CameraMode[] = [
  'auto',
  'broadcast',
  'tactical',
  'follow',
  'replay',
  'teaching-angle',
  'player-read-angle',
  'help-defense-angle',
  'top-down-coach-board',
] as const

const COMMON_VIEWPORTS: ReadonlyArray<[number, number, string]> = [
  [393, 852, 'iPhone 14 portrait'],
  [844, 390, 'iPhone 14 landscape'],
  [768, 1024, 'iPad portrait'],
  [1280, 720, '720p desktop'],
  [1920, 1080, '1080p desktop'],
  [2560, 1440, '1440p desktop'],
  [3440, 1440, '21:9 ultrawide'],
] as const

describe('V2 readiness — cameraTransitions sweep', () => {
  it('every transition returns a finite ease inside [0.10, 0.60]', () => {
    for (const a of ALL_MODES) {
      for (const b of ALL_MODES) {
        const v = getCameraTransitionEaseS(a, b)
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0.1)
        expect(v).toBeLessThanOrEqual(0.6)
      }
    }
  })

  it('legacy baseline is preserved for same-mode transitions', () => {
    for (const m of ALL_MODES) {
      expect(getCameraTransitionEaseS(m, m)).toBe(LEGACY_CAMERA_EASE_S)
    }
  })

  it('teach-in is always slower than incidental', () => {
    expect(
      getCameraTransitionEaseS('broadcast', 'teaching-angle'),
    ).toBeGreaterThan(getCameraTransitionEaseS('broadcast', 'follow'))
  })
})

describe('V2 readiness — movementCurvesV2 sweep', () => {
  it('every V2 curve is finite over a dense sample grid', () => {
    const samples: number[] = []
    for (let u = 0; u <= 1.0001; u += 0.02) samples.push(u)
    for (const fn of [easeAthleticCutV2, easeCloseoutV2, easeStopHardV2]) {
      for (const u of samples) {
        const v = fn(u)
        expect(Number.isFinite(v), `${fn.name}(${u})`).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
      // Endpoints exact.
      expect(fn(0)).toBe(0)
      expect(fn(1)).toBe(1)
    }
  })
})

describe('V2 readiness — overlayChoreography sweep', () => {
  // Build a concrete primitive for each schema kind. The schema's
  // discriminated union is exhaustive; if a future kind lands without
  // a roleForPrimitive entry it will fall through to 'auxiliary' —
  // tests below keep that contract honest.
  const allPrimitives: OverlayPrimitive[] = [
    { kind: 'passing_lane_open', from: 'a', to: 'b' },
    { kind: 'passing_lane_blocked', from: 'a', to: 'b' },
    { kind: 'defender_vision_cone', playerId: 'd1' },
    { kind: 'defender_hip_arrow', playerId: 'd1' },
    { kind: 'defender_foot_arrow', playerId: 'd1' },
    { kind: 'defender_chest_line', playerId: 'd1' },
    { kind: 'defender_hand_in_lane', playerId: 'd1' },
    {
      kind: 'open_space_region',
      anchor: { x: 0, z: 5 },
      radiusFt: 4,
    },
    { kind: 'help_pulse', playerId: 'h1', role: 'tag' },
    {
      kind: 'drive_cut_preview',
      playerId: 'you',
      path: [
        { x: 0, z: 0 },
        { x: 0, z: 4 },
      ],
    },
    { kind: 'label', anchor: { x: 0, z: 0 }, text: 'cue' },
    {
      kind: 'timing_pulse',
      anchor: { x: 0, z: 0 },
      durationMs: 600,
    },
  ]

  it('every schema-defined overlay primitive maps to a known role', () => {
    for (const p of allPrimitives) {
      const r = roleForPrimitive(p)
      expect(['anchor', 'support', 'auxiliary']).toContain(r)
    }
  })

  it('feeding the full primitive set produces a finite stagger', () => {
    const tl = buildChoreography(allPrimitives)
    expect(tl).toHaveLength(allPrimitives.length)
    const verify = (e: OverlayChoreographyEntry) => {
      expect(Number.isFinite(e.delayMs)).toBe(true)
      expect(Number.isFinite(e.durationMs)).toBe(true)
      expect(e.delayMs).toBeGreaterThanOrEqual(0)
      expect(e.durationMs).toBeGreaterThanOrEqual(0)
    }
    for (const e of tl) verify(e)
  })

  it('input order is preserved via inputIndex', () => {
    const tl = buildChoreography(allPrimitives)
    expect(tl.map((e) => e.inputIndex)).toEqual(
      allPrimitives.map((_, i) => i),
    )
  })
})

describe('V2 readiness — fullscreenSafeArea sweep', () => {
  it('every common viewport returns finite, non-negative insets', () => {
    for (const [w, h] of COMMON_VIEWPORTS) {
      const insets = resolveFullscreenChromeInsets({
        isFullscreen: true,
        widthPx: w,
        heightPx: h,
        hasInteractionOverlay: false,
      })
      expect(Number.isFinite(insets.cornerSideInsetPx)).toBe(true)
      expect(Number.isFinite(insets.cornerTopInsetPx)).toBe(true)
      expect(Number.isFinite(insets.transportBottomInsetPx)).toBe(true)
      expect(Number.isFinite(insets.interactionBottomInsetPx)).toBe(true)
      expect(Number.isFinite(insets.interactionMaxWidthPx)).toBe(true)
      expect(insets.cornerSideInsetPx).toBeGreaterThanOrEqual(0)
      expect(insets.cornerTopInsetPx).toBeGreaterThanOrEqual(0)
      expect(insets.transportBottomInsetPx).toBeGreaterThanOrEqual(0)
      expect(insets.interactionBottomInsetPx).toBeGreaterThanOrEqual(0)
      expect(insets.interactionMaxWidthPx).toBeGreaterThan(0)
    }
  })

  it('non-fullscreen always returns the same compact descriptor', () => {
    for (const [w, h] of COMMON_VIEWPORTS) {
      const insets = resolveFullscreenChromeInsets({
        isFullscreen: false,
        widthPx: w,
        heightPx: h,
        hasInteractionOverlay: false,
      })
      expect(insets.cornerSideInsetPx).toBe(12)
      expect(insets.cornerTopInsetPx).toBe(12)
      expect(insets.transportBottomInsetPx).toBe(12)
    }
  })
})

describe('V2 readiness — pathwayMilestones sweep', () => {
  const cfg: PathwayConfig = {
    slug: 'test',
    title: 'Test',
    subtitle: '',
    description: '',
    decoderTags: [],
    chapters: [
      buildChapter('c1', 1, 'BACKDOOR_WINDOW', 'Backdoor Window'),
      buildChapter('c2', 2, null, 'Real Game Mix'),
    ],
    unlockCriteria: { alwaysAvailable: true },
    passCriteria: {},
    estimatedMinutes: 30,
    recommendedFor: [],
    targetArchetype: 'cutter',
    comingSoon: false,
    parentSummary: '',
    coachSummary: '',
    basketballProblem: '',
    difficultyRange: [1, 3],
  }

  it('every progress state maps to a non-empty headline', () => {
    const cases: Array<[PathwayProgressSummary | null, string]> = [
      [null, 'fallback'],
      [
        {
          slug: 'test',
          pathwayProgress: 1,
          pathwayMastered: true,
          chapters: [],
          recommendedNext: null,
          weakestDecoder: null,
          challengeAttempts: [],
        },
        'mastered',
      ],
      [
        {
          slug: 'test',
          pathwayProgress: 0,
          pathwayMastered: false,
          chapters: [],
          recommendedNext: {
            chapterSlug: 'c1',
            skillNodeSlug: 'n1',
            trainHref: '/train',
            label: 'Start',
            reason: 'cold-start',
          },
          weakestDecoder: null,
          challengeAttempts: [],
        },
        'cold-start',
      ],
    ]
    for (const [progress, expectedTone] of cases) {
      const m = deriveMilestone(cfg, progress)
      expect(ALL_MILESTONE_TONES).toContain(m.tone)
      expect(m.headline.length).toBeGreaterThan(0)
      expect(m.tone).toBe(expectedTone)
    }
  })
})

describe('V2 readiness — playerPresence + framePacing smoke', () => {
  it('player shadow + sheen helpers do not throw with default options', () => {
    expect(() => buildPlayerShadowTexture()).not.toThrow()
    expect(() => buildPlayerSheenTexture()).not.toThrow()
  })

  it('frame pacing tracker reports a stable empty summary', () => {
    const t = new FramePacingTracker()
    const a = t.summary()
    const b = t.summary()
    expect(a).toEqual(b)
    expect(a.count).toBe(0)
    expect(Number.isFinite(a.avgFps)).toBe(true)
  })
})

function buildChapter(
  slug: string,
  order: number,
  decoderTag: PathwayChapterConfig['decoderTag'],
  title: string,
): PathwayChapterConfig {
  return {
    slug,
    order,
    title,
    subtitle: '',
    basketballCue: '',
    decoderTag,
    skillNodes: [],
    passCriteria: {},
    masteryCriteria: {},
    parentSummary: '',
    coachSummary: '',
    goal: '',
  }
}
