/**
 * P3.0 — Overlay beat spec.
 *
 * The flat `preAnswerOverlays[]` / `postAnswerOverlays[]` arrays are the
 * right shape for the founder scenarios — there's a single freeze and a
 * single replay. As the curriculum grows into chained-decision reps,
 * scenes will need *timed reveal* during replay (cue → action → advantage,
 * separated by a few hundred milliseconds).
 *
 * `OverlayBeat` is the structured author-time format for that future
 * shape. **It is intentionally not wired into the scene schema or the
 * runtime renderer in P3.0**; doing so would force a migration of every
 * existing scenario without a present need.
 *
 * What ships in P3.0:
 *   - the `OverlayBeat` type (so authors can experiment in lesson docs)
 *   - `sortBeats(beats)` — deterministic sort, stable across runs
 *   - `compileBeatsToFlatOverlays(beats, opts)` — pure flattener that
 *     emits the validated arrays the renderer already understands
 *
 * Architecture lock:
 *   - Pure data + types. No THREE.js, no scene reads, no clocks.
 *   - Same inputs always produce the same outputs.
 *   - No NaN / Infinity propagates through the helpers.
 */

import type { DecoderTag, OverlayPrimitive } from './schema'

export type OverlayBeatPhase =
  | 'watch'
  | 'freeze'
  | 'answer_replay'
  | 'consequence'

export type OverlayTeachingQuestion =
  | 'what_changed'
  | 'what_space_opened'
  | 'what_is_best_read'
  | 'what_is_next_best'

export interface OverlayBeatVisibility {
  beginner: boolean
  intermediate: boolean
  advanced: boolean
}

/**
 * Structured author-time format for a single overlay reveal.
 *
 * `at_phase_ms` is *relative to the phase entry*, not absolute scene
 * time. The runtime treats `freeze` and `answer_replay` as separate
 * phases anchored at their respective state-machine entries. This keeps
 * beats authored in one phase from drifting if the prior phase's
 * duration changes.
 */
export interface OverlayBeat {
  /** Stable identifier; used as the final tiebreaker in `sortBeats`. */
  beat_id: string
  decoder: DecoderTag
  phase: OverlayBeatPhase
  /** Time relative to the phase entry, in ms. >= 0; finite. */
  at_phase_ms: number
  teaching_question: OverlayTeachingQuestion
  primitive: OverlayPrimitive
  /** Lower number = mounted first. Stacking order on screen, and the
   *  order in which clutter rules drop overlays under pressure. */
  clutter_priority: number
  visibility: OverlayBeatVisibility
  /** Optional fade-in duration (ms). Renderer applies a default when
   *  absent. */
  fade_in_ms?: number
  fade_out_ms?: number
  /** Optional camera mode hint; informational only — the camera system
   *  remains the source of truth. */
  camera_mode_hint?: 'auto' | 'follow' | 'replay' | 'broadcast'
}

const PHASE_ORDER: Record<OverlayBeatPhase, number> = {
  watch: 0,
  freeze: 1,
  answer_replay: 2,
  consequence: 3,
}

/**
 * Returns `true` when a beat's numeric fields are all finite (no NaN,
 * no Infinity). Used by `sortBeats` to skip malformed beats and by
 * tests to assert geometry safety.
 */
export function isBeatFinite(beat: OverlayBeat): boolean {
  if (!Number.isFinite(beat.at_phase_ms)) return false
  if (beat.at_phase_ms < 0) return false
  if (!Number.isFinite(beat.clutter_priority)) return false
  if (beat.fade_in_ms !== undefined && !Number.isFinite(beat.fade_in_ms)) return false
  if (beat.fade_out_ms !== undefined && !Number.isFinite(beat.fade_out_ms)) return false
  return true
}

/**
 * Deterministic, stable sort.
 *
 * Order: `(phase, at_phase_ms, clutter_priority, beat_id)`.
 * Same input always produces the same ordered list. Malformed beats
 * (NaN / Infinity / negative time) are dropped silently — the caller's
 * test suite is the right place to reject them, not the runtime.
 */
export function sortBeats(beats: readonly OverlayBeat[]): OverlayBeat[] {
  const safe = beats.filter(isBeatFinite)
  return [...safe].sort((a, b) => {
    const ap = PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase]
    if (ap !== 0) return ap
    if (a.at_phase_ms !== b.at_phase_ms) return a.at_phase_ms - b.at_phase_ms
    if (a.clutter_priority !== b.clutter_priority) {
      return a.clutter_priority - b.clutter_priority
    }
    return a.beat_id < b.beat_id ? -1 : a.beat_id > b.beat_id ? 1 : 0
  })
}

export interface CompileBeatsOptions {
  /** Difficulty tier governs which beats are emitted. Beats whose
   *  visibility flag for the active tier is `false` are dropped. */
  tier: 'beginner' | 'intermediate' | 'advanced'
  /** Per-phase clutter cap. After sorting and tier filtering, beats
   *  beyond the cap are dropped, **lowest priority first**. */
  maxPerPhase: Partial<Record<OverlayBeatPhase, number>>
}

/**
 * Pure flattener. Compiles a list of beats into the existing flat arrays
 * the renderer consumes. The arrays are returned unwrapped:
 *
 *   - `preAnswer`  — beats with phase `'watch'` or `'freeze'`
 *   - `postAnswer` — beats with phase `'answer_replay'`
 *   - `consequence` — beats with phase `'consequence'`
 *
 * The renderer in P3.0 does not consume `consequence` beats; they exist
 * in the spec so the type can grow without a breaking change later.
 */
export function compileBeatsToFlatOverlays(
  beats: readonly OverlayBeat[],
  opts: CompileBeatsOptions,
): {
  preAnswer: OverlayPrimitive[]
  postAnswer: OverlayPrimitive[]
  consequence: OverlayPrimitive[]
  dropped: number
} {
  const sorted = sortBeats(beats)
  const visible = sorted.filter((b) => b.visibility[opts.tier])

  const byPhase: Record<OverlayBeatPhase, OverlayBeat[]> = {
    watch: [],
    freeze: [],
    answer_replay: [],
    consequence: [],
  }
  for (const b of visible) byPhase[b.phase].push(b)

  let dropped = sorted.length - visible.length

  const trim = (phase: OverlayBeatPhase): OverlayBeat[] => {
    const cap = opts.maxPerPhase[phase]
    const list = byPhase[phase]
    if (cap === undefined || list.length <= cap) return list
    // Drop lowest-priority (highest clutter_priority numeric) first;
    // the sort already orders ascending, so the first `cap` survive.
    const kept = list.slice(0, cap)
    dropped += list.length - kept.length
    return kept
  }

  return {
    preAnswer: [...trim('watch').map((b) => b.primitive), ...trim('freeze').map((b) => b.primitive)],
    postAnswer: trim('answer_replay').map((b) => b.primitive),
    consequence: trim('consequence').map((b) => b.primitive),
    dropped,
  }
}
