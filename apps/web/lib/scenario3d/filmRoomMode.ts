/**
 * FR-7 — Pathways → Film-Room renderer contract.
 *
 * Pathways owns the chapter-level configuration ("Boss Challenge",
 * "Learn the Cue"). The renderer owns `overlayLevel` + `cameraAssist`.
 * This module is the one place the mapping between the two surfaces
 * lives, so the contract is data-bounded and unit-testable without
 * mounting a 3D scene.
 *
 * Architecture lock (§13.11):
 *   - Pure functions. No imports from `apps/web/components/scenario3d/*`,
 *     no DOM, no Pathways services. The renderer never imports Pathways
 *     modules; Pathways never imports `imperativeTeachingOverlay`.
 *     This file lives in the renderer's `lib/scenario3d/` directory and
 *     the Pathways-side type is the only `lib/pathways` import — purely
 *     so the mapping can be exhaustive on the union.
 *   - Same inputs always produce the same outputs. No process.env reads,
 *     no clock reads, no `Math.random`.
 *   - The §13.7 table is the source of truth. Each row maps to one
 *     entry in `FILM_ROOM_MODE_TABLE`; the table is exported for tests
 *     and for any QA surface that needs to render the contract.
 *
 * Plan refs:
 *   - §13.1 Pathway-aware overlay intensity
 *   - §13.2 Pathway-aware camera assist
 *   - §13.5 Boss challenges = no overlays, no decoder label
 *   - §13.7 Chapter difficulty maps to overlay level
 */

import type { CameraAssist } from './cameraPresets'
import type { OverlayLevel } from './overlayLevel'
import type { PathwayTrainingMode } from '@/lib/pathways/types'

export interface FilmRoomMode {
  /** §9.2 — overlay intensity. */
  overlayLevel: OverlayLevel
  /** §8.9 — how much the renderer helps with framing. */
  cameraAssist: CameraAssist
}

/**
 * §13.7 contract table. The key is the Pathways `trainingMode`
 * vocabulary (see `apps/web/lib/pathways/types.ts`). The value is the
 * renderer-facing pair the canvas reads. Frozen so a runtime mutation
 * is impossible — the test suite snapshots this object too, so any
 * accidental rewrite shows up in CI.
 *
 * Mapping rationale:
 *   - `learn-the-cue`        — Decoder Lesson row → Beginner / Full.
 *   - `freeze-frame-read`    — Skill Node (early/mid) row → Beginner /
 *                              Partial. The plan splits early vs. mid
 *                              by overlay budget; the canvas picks the
 *                              tighter `intermediate` budget under the
 *                              `no-hint` mode below.
 *   - `no-hint`              — Skill Node (late) → Advanced / Partial.
 *   - `mixed-reads`          — Mixed-Read Final row → Intermediate /
 *                              None. "Limited / no assist" per §13.7.
 *   - `boss-challenge`       — Boss row → None / None. Zero hints.
 *   - `film-room`            — Film Room Review row → Review / Full.
 *                              Maxed overlays, full camera assist.
 *   - `pressure-test`        — Capstone "Mixed Reads — Pressure" row.
 *                              Tighter than mixed-reads: the player
 *                              still gets the intermediate post-answer
 *                              reveal but no camera help. Treated as
 *                              `advanced` overlay so the freeze cue
 *                              cluster is reduced to the cue overlay
 *                              alone, while camera stays `'none'`.
 */
export const FILM_ROOM_MODE_TABLE: Readonly<
  Record<PathwayTrainingMode, FilmRoomMode>
> = Object.freeze({
  'learn-the-cue': { overlayLevel: 'beginner', cameraAssist: 'full' },
  'freeze-frame-read': { overlayLevel: 'beginner', cameraAssist: 'partial' },
  'no-hint': { overlayLevel: 'advanced', cameraAssist: 'partial' },
  'mixed-reads': { overlayLevel: 'intermediate', cameraAssist: 'none' },
  'boss-challenge': { overlayLevel: 'none', cameraAssist: 'none' },
  'film-room': { overlayLevel: 'review', cameraAssist: 'full' },
  'pressure-test': { overlayLevel: 'advanced', cameraAssist: 'none' },
})

/**
 * The renderer defaults if Pathways isn't driving the session — i.e.
 * the legacy /train flow with no `?pathway=`. Per FR-7 success
 * criteria: "/train default unchanged". The canvas's own prop
 * defaults (`overlayLevel='beginner'`, `cameraAssist='partial'`)
 * still kick in if a caller passes `null` for the mode; this object
 * is exported only so the mapping helper can return it explicitly.
 */
export const FILM_ROOM_DEFAULT: FilmRoomMode = Object.freeze({
  overlayLevel: 'beginner',
  cameraAssist: 'partial',
})

/**
 * Returns the renderer's `overlayLevel` + `cameraAssist` for a given
 * Pathway training mode. `null` (no Pathway → /train default flow)
 * returns `FILM_ROOM_DEFAULT`. Unknown strings (forward-compat /
 * misconfiguration) also return the default rather than throwing,
 * because the renderer should always render something — a crash here
 * would block /train entirely.
 */
export function pickFilmRoomMode(
  trainingMode: PathwayTrainingMode | null | undefined,
): FilmRoomMode {
  if (trainingMode == null) return FILM_ROOM_DEFAULT
  const row = FILM_ROOM_MODE_TABLE[trainingMode]
  if (!row) return FILM_ROOM_DEFAULT
  return row
}

/**
 * §13.5 — Boss challenges suppress every renderer-level hint. This is
 * a convenience predicate so callers (e.g. /train) can tell at a
 * glance whether the *page-layer* decoder chrome should also vanish
 * (decoder pill, lesson hand-off). Today the page already gates
 * those on `pathwayContext.isChallenge` — this predicate documents
 * the renderer-side equivalent so the two surfaces never drift.
 */
export function isFilmRoomBossMode(
  trainingMode: PathwayTrainingMode | null | undefined,
): boolean {
  return trainingMode === 'boss-challenge'
}

/**
 * §13.7 — convenience predicate for "this mode hides the decoder
 * pill". The plan's table calls this out explicitly: Boss Challenge
 * and Mixed-Read Final say "No" in the decoder-pill column. The
 * renderer-side `overlayLevel` already enforces the visual side of
 * this (no decoder pill mounts under `'none'`); this predicate
 * mirrors the page-layer equivalent the train route already
 * implements via `pathwayContext.hideDecoderPill`.
 */
export function suppressesDecoderPill(
  trainingMode: PathwayTrainingMode | null | undefined,
): boolean {
  return trainingMode === 'boss-challenge' || trainingMode === 'mixed-reads'
}
