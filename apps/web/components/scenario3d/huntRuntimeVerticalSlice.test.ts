/**
 * Pack 2 (3.1.4) — HUNT runtime vertical-slice test.
 *
 * Loads the dummy HUNT scenario fixture and verifies the architecture
 * vertical slice end-to-end:
 *
 *   1. The scenario validates against the runtime scene schema (the
 *      seeder uses the same Zod schema, so a validation failure here
 *      proves the seeder would reject the same authoring mistake).
 *   2. The scene loader resolves `beatSpec.firstBeat` and
 *      `beatSpec.secondBeat` into `freezeAtMs` and `secondFreezeAtMs`.
 *   3. The pure pre-pick HUNT simulator emits the expected
 *      `frozen-beat-1 → consequence → frozen-beat-2` sequence.
 *   4. The compiled pre-pick total fits inside the 4000 ms cognition
 *      ceiling enforced by `timingOverridesSchema`.
 *   5. The dummy is invisible to the production pack manifest — its
 *      file lives outside `packages/db/seed/scenarios/packs/`, so the
 *      seeder cannot reach it.
 *   6. The 'mismatch' help_pulse role accepted by the schema.
 *   7. The `READ_THE_COVERAGE` / `HUNT_THE_ADVANTAGE` decoder tags
 *      coerce correctly through the scene loader.
 *
 * The full controller is a React/THREE component that requires a
 * canvas; this test exercises the deterministic data path only.
 * The visual side runs through the existing JSX bridge tests.
 */

import { describe, expect, it } from 'vitest'
import dummy from './__fixtures__/HUNT-preset-mismatch-dummy-01.json'
import { sceneSchema } from '@/lib/scenario3d/schema'
import { buildScene } from '@/lib/scenario3d/scene'
import {
  simulateHuntPrePickFlow,
  huntPrePickDurationMs,
} from '@/lib/scenario3d/replayTeachingFlow'
import { resolveFreezeTiming } from '@/lib/scenario3d/freezeFrameCognition'
import { getCameraTransitionEaseS, getCameraTransitionKind } from '@/lib/scenario3d/cameraTransitions'

describe('Pack 2 — HUNT runtime vertical slice', () => {
  it('dummy fixture validates against the runtime scene schema', () => {
    const result = sceneSchema.safeParse(dummy.scene)
    if (!result.success) {
      // eslint-disable-next-line no-console
      console.error('Dummy fixture failed schema validation:', result.error.flatten())
    }
    expect(result.success).toBe(true)
  })

  it('scene loader resolves beatSpec.firstBeat and beatSpec.secondBeat', () => {
    const scene = buildScene({
      id: dummy.id,
      decoder_tag: dummy.decoder_tag,
      scene: dummy.scene,
    })
    expect(scene.freezeAtMs).toBe(1500)
    expect(scene.secondFreezeAtMs).toBe(3200)
    expect(scene.decoderTag).toBe('HUNT_THE_ADVANTAGE')
  })

  it('scene loader surfaces consequence + secondBeat overlay arrays', () => {
    const scene = buildScene({
      id: dummy.id,
      decoder_tag: dummy.decoder_tag,
      scene: dummy.scene,
    })
    expect(scene.consequenceOverlays).toBeDefined()
    expect(scene.consequenceOverlays!.length).toBe(2)
    expect(scene.secondBeatPreAnswerOverlays).toBeDefined()
    expect(scene.secondBeatPreAnswerOverlays!.length).toBe(2)
    // Beat 2 cue cluster swaps in a foot_arrow alongside the persistent
    // mismatch pulse — that's the "what changed between beats" diff.
    const beat2Kinds = scene.secondBeatPreAnswerOverlays!.map((o) => o.kind).sort()
    expect(beat2Kinds).toEqual(['defender_foot_arrow', 'help_pulse'])
  })

  it('mismatch help_pulse role validates through the schema', () => {
    const result = sceneSchema.safeParse(dummy.scene)
    expect(result.success).toBe(true)
    // Find the mismatch pulse in the parsed pre-overlay set.
    if (result.success) {
      const mismatch = result.data.preAnswerOverlays.find(
        (o) => o.kind === 'help_pulse' && o.role === 'mismatch',
      )
      expect(mismatch).toBeDefined()
    }
  })

  it('HUNT pre-pick simulator emits the expected three-event sequence', () => {
    const scene = buildScene({
      id: dummy.id,
      decoder_tag: dummy.decoder_tag,
      scene: dummy.scene,
    })
    const timing = resolveFreezeTiming(scene.timingOverrides)
    const events = simulateHuntPrePickFlow({
      startedAtMs: 0,
      firstFreezeAtMs: scene.freezeAtMs!,
      secondFreezeAtMs: scene.secondFreezeAtMs!,
      cognitionHoldMs: timing.cognitionHoldMs,
    })
    expect(events).toHaveLength(3)
    expect(events[0].phase).toBe('frozen-beat-1')
    expect(events[0].atMs).toBe(1500)
    expect(events[0].beatIndex).toBe(0)
    expect(events[1].phase).toBe('consequence')
    expect(events[1].atMs).toBe(1500 + 1100) // freeze + cognition hold
    expect(events[1].beatIndex).toBe(0)
    expect(events[2].phase).toBe('frozen-beat-2')
    // Beat 2 = consequence + (secondFreezeAtMs - firstFreezeAtMs)
    //       = 2600 + (3200 - 1500) = 4300 ms.
    expect(events[2].atMs).toBe(4300)
    expect(events[2].beatIndex).toBe(1)
  })

  it('HUNT pre-pick total stays inside the 4000 ms cognition ceiling per beat', () => {
    const scene = buildScene({
      id: dummy.id,
      decoder_tag: dummy.decoder_tag,
      scene: dummy.scene,
    })
    const timing = resolveFreezeTiming(scene.timingOverrides)
    // The schema floor for cognitionHoldMs is 1100 ms; this dummy uses
    // the floor. Each beat individually must be <= 4000 ms cognition.
    // The pre-pick TOTAL (~4300 ms) is the sum of two beats — that's
    // expected; the per-beat ceiling is the relevant test.
    expect(timing.cognitionHoldMs).toBeLessThanOrEqual(4_000)
    expect(timing.cognitionHoldMs).toBe(1100)
    const total = huntPrePickDurationMs({
      startedAtMs: 0,
      firstFreezeAtMs: scene.freezeAtMs!,
      secondFreezeAtMs: scene.secondFreezeAtMs!,
      cognitionHoldMs: timing.cognitionHoldMs,
    })
    // Audit the total envelope so a future regression doesn't blow
    // past 6 seconds without forcing this test to update.
    expect(total).toBeLessThan(6_000)
  })

  it('chained-freeze-bridge camera ease activates only with HUNT context', () => {
    // Same preset on both beats — without HUNT context, this collapses
    // to the legacy 0.18 s. With context, it elevates to ~0.36 s.
    const baseline = getCameraTransitionEaseS('teaching-angle', 'teaching-angle')
    const bridged = getCameraTransitionEaseS('teaching-angle', 'teaching-angle', {
      chainedFreezeBridge: true,
    })
    expect(baseline).toBeLessThan(bridged)
    expect(bridged).toBeGreaterThan(0.3)
    expect(bridged).toBeLessThan(0.5)

    // Kind labels match.
    expect(getCameraTransitionKind('teaching-angle', 'teaching-angle')).toBe('instant')
    expect(
      getCameraTransitionKind('teaching-angle', 'teaching-angle', {
        chainedFreezeBridge: true,
      }),
    ).toBe('chained-freeze-bridge')

    // Non-identity bridges still go through the existing teach-pivot
    // path even when context is set — the bridge label is reserved
    // for the same-preset case where the legacy path was instant.
    expect(
      getCameraTransitionKind('teaching-angle', 'player-read-angle', {
        chainedFreezeBridge: true,
      }),
    ).toBe('teach-pivot')
  })

  it('dummy fixture is excluded from production pack manifests', async () => {
    // The dummy fixture lives at apps/web/components/scenario3d/__fixtures__/.
    // The seeder reads from packages/db/seed/scenarios/packs/<pack>/pack.json;
    // confirm the dummy id does not appear in any pack manifest. This
    // guards against an accidental copy-paste into a production pack.
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const packsDir = path.resolve(
      __dirname,
      '../../../../packages/db/seed/scenarios/packs',
    )
    const packDirs = await fs.readdir(packsDir, { withFileTypes: true })
    const offenders: string[] = []
    for (const entry of packDirs) {
      if (!entry.isDirectory()) continue
      const manifestPath = path.join(packsDir, entry.name, 'pack.json')
      try {
        const raw = await fs.readFile(manifestPath, 'utf-8')
        if (raw.includes(dummy.id)) {
          offenders.push(`${entry.name}/pack.json`)
        }
      } catch {
        // No manifest in this dir — nothing to check.
      }
    }
    expect(offenders).toEqual([])
  })

  it('decoder tag coerces both DROP and HUNT into Scene3D.decoderTag', () => {
    // Pack 1 founder tags must still coerce.
    const bdwScene = buildScene({
      id: 'test-bdw',
      decoder_tag: 'BACKDOOR_WINDOW',
      scene: dummy.scene,
    })
    expect(bdwScene.decoderTag).toBe('BACKDOOR_WINDOW')

    // Pack 2 tags must now coerce.
    const dropScene = buildScene({
      id: 'test-drop',
      decoder_tag: 'READ_THE_COVERAGE',
      scene: dummy.scene,
    })
    expect(dropScene.decoderTag).toBe('READ_THE_COVERAGE')
    const huntScene = buildScene({
      id: 'test-hunt',
      decoder_tag: 'HUNT_THE_ADVANTAGE',
      scene: dummy.scene,
    })
    expect(huntScene.decoderTag).toBe('HUNT_THE_ADVANTAGE')

    // Unknown tags still coerce to undefined (defensive).
    const unknownScene = buildScene({
      id: 'test-unknown',
      decoder_tag: 'NOT_A_REAL_DECODER',
      scene: dummy.scene,
    })
    expect(unknownScene.decoderTag).toBeUndefined()
  })

  it('Pack 1 single-beat scenarios produce no second freeze', () => {
    // Construct a scene without beatSpec — the loader must leave
    // secondFreezeAtMs absent (or null), preserving Pack 1 behavior.
    const sceneNoBeatSpec = {
      ...dummy.scene,
      beatSpec: undefined,
      secondBeatPreAnswerOverlays: [],
      secondBeatPostAnswerOverlays: [],
      consequenceOverlays: [],
    }
    const scene = buildScene({
      id: 'pack1-shape',
      decoder_tag: 'BACKDOOR_WINDOW',
      scene: sceneNoBeatSpec,
    })
    // freezeAtMs falls through to scene.freezeMarker, which is absent
    // here — the scene has no freeze.
    expect(scene.freezeAtMs).toBeNull()
    expect(scene.secondFreezeAtMs).toBeNull()
  })
})
