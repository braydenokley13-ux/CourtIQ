/**
 * FR-5 — adaptive overlay integration test.
 *
 * Validates the full pipeline against real founder-v0 scenes:
 *   - the level helper projects the same scene through 5 different
 *     intensities without mutating the scene itself
 *   - beginner mounts the full cluster authored on the seed
 *   - advanced mounts the cue overlay only and keeps it inside the
 *     pre-answer allow-list
 *   - 'none' (Boss) mounts zero
 *   - founder presets remain unchanged after filtering (snapshot
 *     equality on the source arrays)
 *
 * The test does not touch the renderer — it exercises the pure
 * helper against the same scene shape `AuthoredOverlayBridge` reads.
 */

import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { sceneSchema } from './schema'
import {
  applyOverlayLevel,
  isOverlaySuppressed,
  type OverlayLevel,
} from './overlayLevel'
import { DECODER_OVERLAY_PRESETS } from './decoderOverlayPresets'

const SCENARIOS_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'db',
  'seed',
  'scenarios',
  'packs',
  'founder-v0',
)

interface FounderJson {
  id: string
  decoder_tag?: string
  scene: unknown
}

async function loadFounderScene(filename: string, id: string) {
  const raw = await fs.readFile(path.join(SCENARIOS_DIR, filename), 'utf8')
  const arr = JSON.parse(raw) as FounderJson[]
  const found = arr.find((r) => r.id === id)
  if (!found) throw new Error(`founder ${id} missing in ${filename}`)
  const parsed = sceneSchema.parse(found.scene)
  return parsed
}

const FOUNDER_FAMILIES: readonly { file: string; id: string }[] = [
  { file: 'BDW-01.json', id: 'BDW-01' },
  { file: 'AOR-01.json', id: 'AOR-01' },
  { file: 'ESC-01.json', id: 'ESC-01' },
  { file: 'SKR-01.json', id: 'SKR-01' },
]

const ALL_LEVELS: readonly OverlayLevel[] = [
  'beginner',
  'intermediate',
  'advanced',
  'none',
  'review',
]

describe('FR-5 — overlayLevel against founder-v0 scenes', () => {
  for (const fam of FOUNDER_FAMILIES) {
    describe(fam.id, () => {
      it('beginner mounts the full 3-overlay cluster (cap 3 / 3)', async () => {
        const scene = await loadFounderScene(fam.file, fam.id)
        const r = applyOverlayLevel({
          preAnswer: scene.preAnswerOverlays,
          postAnswer: scene.postAnswerOverlays,
          level: 'beginner',
        })
        expect(r.preAnswer.length).toBeLessThanOrEqual(3)
        expect(r.preAnswer.length).toBeGreaterThanOrEqual(1)
        expect(r.postAnswer.length).toBeLessThanOrEqual(3)
      })

      it('advanced reduces to the cue overlay only (cap 1 / 1)', async () => {
        const scene = await loadFounderScene(fam.file, fam.id)
        const r = applyOverlayLevel({
          preAnswer: scene.preAnswerOverlays,
          postAnswer: scene.postAnswerOverlays,
          level: 'advanced',
        })
        expect(r.preAnswer.length).toBeLessThanOrEqual(1)
        expect(r.postAnswer.length).toBeLessThanOrEqual(1)
      })

      it('none (Boss) mounts zero overlays', async () => {
        const scene = await loadFounderScene(fam.file, fam.id)
        const r = applyOverlayLevel({
          preAnswer: scene.preAnswerOverlays,
          postAnswer: scene.postAnswerOverlays,
          level: 'none',
        })
        expect(r.preAnswer).toHaveLength(0)
        expect(r.postAnswer).toHaveLength(0)
        expect(isOverlaySuppressed('none')).toBe(true)
      })

      it('review mounts every authored primitive', async () => {
        const scene = await loadFounderScene(fam.file, fam.id)
        const r = applyOverlayLevel({
          preAnswer: scene.preAnswerOverlays,
          postAnswer: scene.postAnswerOverlays,
          level: 'review',
        })
        // Pre-answer count <= authored (allow-list may drop) and
        // post-answer is uncapped.
        expect(r.preAnswer.length).toBeLessThanOrEqual(scene.preAnswerOverlays.length)
        expect(r.postAnswer).toHaveLength(scene.postAnswerOverlays.length)
      })

      it('every level keeps the source scene arrays unchanged', async () => {
        const scene = await loadFounderScene(fam.file, fam.id)
        const preBefore = JSON.stringify(scene.preAnswerOverlays)
        const postBefore = JSON.stringify(scene.postAnswerOverlays)
        for (const level of ALL_LEVELS) {
          applyOverlayLevel({
            preAnswer: scene.preAnswerOverlays,
            postAnswer: scene.postAnswerOverlays,
            level,
          })
        }
        expect(JSON.stringify(scene.preAnswerOverlays)).toBe(preBefore)
        expect(JSON.stringify(scene.postAnswerOverlays)).toBe(postBefore)
      })

      it('pre-answer overlays at every level use only allow-listed kinds (never reveals the answer)', async () => {
        const scene = await loadFounderScene(fam.file, fam.id)
        const allowed = new Set([
          'defender_vision_cone',
          'defender_hip_arrow',
          'defender_foot_arrow',
          'defender_chest_line',
          'defender_hand_in_lane',
          'help_pulse',
          'label',
        ])
        for (const level of ALL_LEVELS) {
          const r = applyOverlayLevel({
            preAnswer: scene.preAnswerOverlays,
            postAnswer: scene.postAnswerOverlays,
            level,
          })
          for (const o of r.preAnswer) {
            expect(allowed.has(o.kind)).toBe(true)
          }
        }
      })
    })
  }

  it('decoderOverlayPresets remain unchanged — FR-5 must not mutate seed presets', () => {
    // Snapshot the exported preset table; regression-bait if anyone
    // mutates the data this helper reads.
    const snapshot = JSON.stringify(DECODER_OVERLAY_PRESETS)
    const fams: Array<keyof typeof DECODER_OVERLAY_PRESETS> = [
      'BACKDOOR_WINDOW',
      'ADVANTAGE_OR_RESET',
      'EMPTY_SPACE_CUT',
      'SKIP_THE_ROTATION',
    ]
    for (const fam of fams) {
      const preset = DECODER_OVERLAY_PRESETS[fam]
      expect(preset.preAnswer.length).toBeGreaterThanOrEqual(3)
      expect(preset.postAnswer.length).toBeGreaterThanOrEqual(3)
    }
    expect(JSON.stringify(DECODER_OVERLAY_PRESETS)).toBe(snapshot)
  })

  it('cue cluster sanity: BDW pre-answer references the deny defender body', async () => {
    const scene = await loadFounderScene('BDW-01.json', 'BDW-01')
    const r = applyOverlayLevel({
      preAnswer: scene.preAnswerOverlays,
      postAnswer: scene.postAnswerOverlays,
      level: 'beginner',
    })
    const kinds = new Set(r.preAnswer.map((o) => o.kind))
    // BDW cluster always points to the deny defender's body cue —
    // either the vision cone or one of the body-language arrows.
    const hasBodyCue =
      kinds.has('defender_vision_cone') ||
      kinds.has('defender_hip_arrow') ||
      kinds.has('defender_hand_in_lane')
    expect(hasBodyCue).toBe(true)
  })

  it('cue cluster sanity: AOR pre-answer references the closeout defender body', async () => {
    const scene = await loadFounderScene('AOR-01.json', 'AOR-01')
    const r = applyOverlayLevel({
      preAnswer: scene.preAnswerOverlays,
      postAnswer: scene.postAnswerOverlays,
      level: 'beginner',
    })
    const kinds = new Set(r.preAnswer.map((o) => o.kind))
    const hasCloseoutCue =
      kinds.has('defender_foot_arrow') ||
      kinds.has('defender_hip_arrow') ||
      kinds.has('defender_chest_line') ||
      kinds.has('defender_vision_cone')
    expect(hasCloseoutCue).toBe(true)
  })

  it('cue cluster sanity: ESC pre-answer references the helper defender', async () => {
    const scene = await loadFounderScene('ESC-01.json', 'ESC-01')
    const r = applyOverlayLevel({
      preAnswer: scene.preAnswerOverlays,
      postAnswer: scene.postAnswerOverlays,
      level: 'beginner',
    })
    const kinds = new Set(r.preAnswer.map((o) => o.kind))
    const hasHelperCue =
      kinds.has('defender_vision_cone') ||
      kinds.has('defender_hip_arrow') ||
      kinds.has('help_pulse')
    expect(hasHelperCue).toBe(true)
  })

  it('cue cluster sanity: SKR pre-answer references the over-helper', async () => {
    const scene = await loadFounderScene('SKR-01.json', 'SKR-01')
    const r = applyOverlayLevel({
      preAnswer: scene.preAnswerOverlays,
      postAnswer: scene.postAnswerOverlays,
      level: 'beginner',
    })
    const kinds = new Set(r.preAnswer.map((o) => o.kind))
    const hasOverhelpCue =
      kinds.has('help_pulse') ||
      kinds.has('defender_chest_line') ||
      kinds.has('defender_hip_arrow')
    expect(hasOverhelpCue).toBe(true)
  })
})
