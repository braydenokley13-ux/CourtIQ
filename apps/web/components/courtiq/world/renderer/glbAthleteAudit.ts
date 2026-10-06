/**
 * Data-only dimensional, palette and animation audit for the preserved
 * Quaternius UAL2 fallback rig. The primary authored athlete and this
 * fallback share the renderer's presentation interface; basketball
 * simulation remains independent of their geometry and animation.
 *
 * The source rig is authored in metres and measures about 1.808 m,
 * becoming 5.93 court feet after scaling. Its off-axis rest pose needs
 * bind-relative rotations for readable basketball stances. The clip
 * library supplies six readable actions, plus two optional imported
 * actions attached explicitly by a caller. Several moving intents
 * share a clip, so this audit does not claim dedicated motion coverage
 * for every intent.
 *
 * Region and material constants keep fallback jersey, shorts, skin,
 * shoes and hair presentation consistent. These tables can be tested
 * without constructing Three.js objects. The reference fallback-tier
 * list at the end describes the original asset audit; active loading
 * and error handling are implemented by labAthlete and WorldCanvas.
 */

// ---------------------------------------------------------------------------
// Audited rig constants
// ---------------------------------------------------------------------------

/**
 * Source-asset standing height in metres (pre-scale). Pinned to the
 * Quaternius UAL2 mannequin export. Update the audit and inspect
 * court-foot proportions together when replacing the source rig.
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
 * The original procedural figure's audited standing height,
 * retained as a dimensional reference for the fallback rig.
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
 * Visual/Motion review (this packet):
 *   - roughness 0.64, metalness 0.03 — slightly less rough so the
 *     jersey picks up more of the broadcast key/rim lighting,
 *     pushing the athlete toward an NBA-broadcast premium feel
 *     without crossing into vinyl. Stays inside the locked
 *     [0.60, 0.85] roughness and [0, 0.06] metalness budgets so
 *     the audit guards still trip on accidental drift.
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
    bodyRoughness: 0.64,
    bodyMetalness: 0.03,
    jointsRoughness: 0.7,
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
 * Optional imported actions. Counted separately because callers
 * explicitly request their attachment and they may be absent from
 * a figure's mixer. No environment flags control attachment.
 */
export const GLB_ATHLETE_IMPORTED_CLIP_NAMES: readonly string[] = [
  'closeout',
  'back_cut',
] as const

/**
 * The original twelve audited animation intents, retained as a
 * reference for the fallback clip coverage table.
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
 * Reference tiers from the original asset audit. This table is
 * descriptive data, not the active WorldCanvas loading policy.
 */
export const GLB_FALLBACK_LADDER_ORDER: readonly GlbFallbackTier[] = [
  'glb-with-clip',
  'glb-with-idle',
  'procedural',
  'two-d',
  'magenta-proxy',
] as const
