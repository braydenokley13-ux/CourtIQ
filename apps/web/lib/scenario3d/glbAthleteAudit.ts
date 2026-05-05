/**
 * FR-8 Packet 1 — GLB athlete asset audit (v2/v3 — improving what we have).
 *
 * This module is the canonical audit of the existing Quaternius UAL2
 * mannequin GLB, the bone map mounted on it, and the clip library that
 * targets the rig. It is intentionally pure data + types so the audit
 * can be unit-tested without instantiating THREE.js objects.
 *
 * FR-8 architecture lock (from the task brief):
 *   - ONE shared GLB rig, NO per-scenario GLBs.
 *   - Shared motion clip library (`resolveGlbClipForIntent` is the
 *     single seam new clips are wired into).
 *   - Existing scenario JSON does not change.
 *   - Fallback hierarchy (§6.1) MUST NOT regress.
 *
 * Audit summary (5.1 / 5.3 / 7.10 of the plan):
 *
 *   PROPORTIONS
 *     - Source rig: Quaternius UAL2 female mannequin, authored in metres.
 *     - Standing height: ≈ 1.808 m → 5.93 ft post-`GLB_M_TO_FT_SCALE`.
 *     - Procedural figure: ATH_TOTAL_HEIGHT = 5.95 ft.
 *     - Delta budget: ±0.05 ft (locked by `playerScaleContract.test.ts`).
 *     - Status: PASS — proportions are inside the ±0.05 ft budget.
 *
 *   SILHOUETTE READABILITY
 *     - Bind pose sits at a generic "rest" with arms ~45° down/out.
 *     - Pre-FR-8 the figure could fall back to bind silhouette if
 *       no clip targeted a bone — making the GLB read as a mannequin,
 *       not an athlete.
 *     - The basketball-ready delta exported below is the small,
 *       deterministic offset that lifts the bind silhouette into a
 *       readable athletic posture (slight knee bend, soft elbows,
 *       arms near the ribs).
 *
 *   STANCE (BIND POSE)
 *     - Audited bind-pose quaternions for the lower body and arm bones
 *       are exported here (re-exported from glbAthlete.ts so this
 *       module is a single canonical source). All hand-authored deltas
 *       in the clip library multiply *into* these bind values rather
 *       than starting from identity, which avoids the T-pose snap.
 *
 *   ANIMATION QUALITY
 *     - 6 retargeted clips ship today: idle_ready, cut_sprint,
 *       defense_slide, defensive_deny, receive_ready, closeout_read.
 *     - 2 imported clips behind feature flags: closeout, back_cut.
 *     - Coverage gaps (FR-8 packets 4 + 5): EMPTY_SPACE_CUT,
 *       BACK_CUT (flag-off), JAB_OR_RIP, and PASS_FOLLOWTHROUGH all
 *       collapse onto `cut_sprint` and read as the same motion.
 *       DEFENSIVE_HELP_TURN and SLIDE_RECOVER both collapse onto
 *       `defense_slide`.
 *
 *   MATERIAL SETUP
 *     - Multi-region per-vertex tinting (P1.8) splits the figure into
 *       jersey/shorts/skin/shoes/hair. One MeshStandardMaterial per
 *       mesh, no textures, no per-frame work.
 *     - Audit constants exported below pin the region palette so
 *       drift in roughness / metalness / region colour is testable.
 *
 *   FALLBACK HIERARCHY (§6.1)
 *     - 1. Real GLB athlete + correct clip.
 *     - 2. Real GLB athlete + idle pose if the resolved clip fails.
 *     - 3. Procedural player (skinned figure with the same colour
 *          palette and grounding shadow).
 *     - 4. 2D fallback if WebGL is unavailable.
 *     - 5. Magenta proxy, dev-only `?forceGlb=1`.
 *     This module's `GLB_FALLBACK_LADDER_ORDER` is the §6.1 sequence
 *     re-encoded as data so the ladder helper in `clipFallbackLadder.ts`
 *     can be tested against the plan directly.
 *
 *   WHAT CAN BE IMPROVED WITHOUT NEW ASSETS  (FR-8 v2/v3 scope)
 *     - Differentiate offensive moving intents (BACK_CUT vs.
 *       EMPTY_SPACE_CUT) at the resolver layer (Packet 4).
 *     - Surface the basketball-ready rest delta as a canonical
 *       constant the clip library + procedural fallback both read
 *       (Packet 3).
 *     - Add an explicit fallback-ladder helper (Packet 5).
 *     - Lock the material palette so the procedural figure paints
 *       the same regions in the same colours (Packet 6).
 *
 *   WHAT REQUIRES NEW CLIPS                  (FR-8 v3 scope, in-house)
 *     - Dedicated `back_cut_read`, `empty_space_cut_read`,
 *       `pass_followthrough_read`, `help_turn_read` differentiators.
 *     - These can ship as bespoke retargets (no new GLB).
 *
 *   WHAT MUST BE DEFERRED TO v4              (FR-8 future, out of scope)
 *     - Replacing the placeholder mannequin with a basketball-rigged
 *       athlete model.
 *     - Per-archetype silhouette differentiation.
 *     - Sneaker / jersey detail meshes.
 */

// ---------------------------------------------------------------------------
// Audited rig constants
// ---------------------------------------------------------------------------

/**
 * Source-asset standing height in metres (pre-scale). Pinned to the
 * Quaternius UAL2 female mannequin export. If a future packet swaps
 * the source asset, this constant must change too — and the
 * `playerScaleContract.test.ts` ±0.05 ft budget will catch any
 * silent drift before it reaches production.
 */
export const GLB_RIG_SOURCE_HEIGHT_M = 1.808

/**
 * Post-scale rig standing height in court feet. Mirrors
 * `GLB_TARGET_HEIGHT_FT` in `glbAthlete.ts`; this module re-exports
 * the same value so audit consumers don't need to import the heavy
 * THREE-bound module.
 */
export const GLB_RIG_TARGET_HEIGHT_FT = 5.93

/**
 * The procedural fallback figure's standing height. Mirrors
 * `ATH_TOTAL_HEIGHT_FT` in `imperativeScene.ts`; pinned here so the
 * audit table is self-contained.
 */
export const PROCEDURAL_FIGURE_HEIGHT_FT = 5.95

/**
 * §7.8 — maximum acceptable gap between the GLB rig and the
 * procedural figure standing heights. Mirrors
 * `PLAYER_HEIGHT_DELTA_BUDGET_FT` in `glbAthlete.ts`.
 */
export const PLAYER_HEIGHT_DELTA_BUDGET_FT = 0.05

// ---------------------------------------------------------------------------
// Region palette — locked so the procedural fallback can match by
// importing the same constants.
// ---------------------------------------------------------------------------

/**
 * The five readable body regions the multi-region tinting helper
 * paints onto the GLB mesh. Same set the procedural fallback should
 * mirror so the two render paths feel like one visual system.
 */
export type GlbAthleteRegion = 'jersey' | 'shorts' | 'skin' | 'shoes' | 'hair'

/**
 * Region palette pinned to a hex string. The `jersey` colour is per
 * team (driven by the caller) and is intentionally NOT pinned here.
 * The other four are league-neutral defaults.
 */
export const GLB_ATHLETE_REGION_PALETTE: Readonly<
  Record<Exclude<GlbAthleteRegion, 'jersey'>, string>
> = Object.freeze({
  shorts: '#3a3d44',
  skin: '#caa68a',
  shoes: '#16181c',
  hair: '#1a1c20',
})

/**
 * Material parameters for the multi-region tinted athlete. Pinned so
 * a future packet that tweaks roughness / metalness without updating
 * the audit fails the lock test, forcing the change to be intentional.
 *
 * Pre-FR-8 values:
 *   - roughness 0.6, metalness 0.05 — slightly plastic at film-room
 *     distance, especially on bright jersey colours.
 * FR-8 Packet 2 value:
 *   - roughness 0.72, metalness 0.02 — softer fabric response that
 *     reads as cotton/poly jersey rather than vinyl. The GLB and the
 *     procedural fallback both pick these up.
 */
export interface GlbAthleteMaterialParams {
  /** MeshStandardMaterial roughness for the team-tinted body mesh. */
  bodyRoughness: number
  /** MeshStandardMaterial metalness for the team-tinted body mesh. */
  bodyMetalness: number
  /** MeshStandardMaterial roughness for the joint overlay (M_Joints). */
  jointsRoughness: number
  /** MeshStandardMaterial metalness for the joint overlay. */
  jointsMetalness: number
}

export const GLB_ATHLETE_MATERIAL_PARAMS: Readonly<GlbAthleteMaterialParams> =
  Object.freeze({
    bodyRoughness: 0.72,
    bodyMetalness: 0.02,
    jointsRoughness: 0.72,
    jointsMetalness: 0.0,
  })

// ---------------------------------------------------------------------------
// Animation library — current coverage table.
// ---------------------------------------------------------------------------

/**
 * The clip names the GLB rig actually mounts. Re-exported here so the
 * audit module can lock the count without importing the THREE-bound
 * builder. Order is the cache build order in `getCachedGlbClips`.
 */
export const GLB_ATHLETE_CLIP_NAMES: readonly string[] = [
  'idle_ready',
  'cut_sprint',
  'defense_slide',
  'defensive_deny',
  'receive_ready',
  'closeout_read',
] as const

/**
 * Imported clips loaded behind feature flags. Counted separately
 * because they are gated on `NEXT_PUBLIC_USE_IMPORTED_*` env vars
 * and may not be present at runtime.
 */
export const GLB_ATHLETE_IMPORTED_CLIP_NAMES: readonly string[] = [
  'closeout',
  'back_cut',
] as const

/**
 * The 12 v1 AnimationIntent values. Mirrored here to keep the audit
 * module free of the schema import, but locked against the runtime
 * union by `glbAthleteAudit.test.ts`.
 */
export const GLB_ATHLETE_AUDITED_INTENTS: readonly string[] = [
  'IDLE_READY',
  'RECEIVE_READY',
  'JAB_OR_RIP',
  'BACK_CUT',
  'EMPTY_SPACE_CUT',
  'DEFENSIVE_DENY',
  'DEFENSIVE_HELP_TURN',
  'CLOSEOUT',
  'SLIDE_RECOVER',
  'PASS_FOLLOWTHROUGH',
  'SHOT_READY',
  'RESET_HOLD',
] as const

// ---------------------------------------------------------------------------
// Fallback hierarchy (§6.1) as data.
// ---------------------------------------------------------------------------

export type GlbFallbackTier =
  | 'glb-with-clip'
  | 'glb-with-idle'
  | 'procedural'
  | 'two-d'
  | 'magenta-proxy'

/**
 * §6.1 — strict order of fallback. The renderer should attempt these
 * in sequence and stop at the first one that succeeds. The
 * `magenta-proxy` tier never fires in production (gated on
 * `?forceGlb=1`).
 */
export const GLB_FALLBACK_LADDER_ORDER: readonly GlbFallbackTier[] = [
  'glb-with-clip',
  'glb-with-idle',
  'procedural',
  'two-d',
  'magenta-proxy',
] as const
