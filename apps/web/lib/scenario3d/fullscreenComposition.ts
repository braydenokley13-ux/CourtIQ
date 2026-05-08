/**
 * V1 Premiumization — Fullscreen Composition Helpers.
 *
 * Pure data layer that decides how the half-court should fill a
 * given viewport aspect ratio so a wide-aspect fullscreen canvas
 * does not show a thin band of court inside a sea of black.
 *
 * The renderer's existing `computeAutoTarget` (in
 * `components/scenario3d/imperativeScene.ts`) frames a Box3 over the
 * half-court envelope (x ± 19, z [0, 24]) and the active scene
 * geometry. That math is correct for aspect ≤ ~1.6 but starts
 * undershooting when the aspect goes wider than the floor envelope
 * itself: at 21:9 (≈ 2.33), the horizontalFit term saturates while
 * the verticalFit term drives distance, so the resulting frame ends
 * up with the half-court compressed inside the upper-mid third of
 * the canvas with wide black margins on each side. The reverse is
 * true on tall portrait phones, where the camera dollies in too
 * much and crops cues at the corner.
 *
 * The helpers below produce a small, deterministic adjustment the
 * renderer can apply on top of its computed auto-fit target:
 *
 *   - `composeFullscreenFraming(aspect)` — picks a safe-area floor
 *     envelope, a vertical lookAt offset, and a padding multiplier
 *     for the auto-fit. The renderer adds the envelope's points to
 *     its Box3 so the fit always covers a sensible floor area.
 *   - `getFullscreenSafeArea(aspect)` — returns the rectangle (in
 *     court coordinates) the camera must guarantee is inside the
 *     viewport. Tests pin its monotonicity so a wider canvas always
 *     reserves at least as much floor as a narrower one.
 *
 * Pure functions; same input → same output. No THREE imports here so
 * the helpers are safe to call from server / SSR.
 */

/**
 * The half-court bounding rectangle in feet. The renderer's coords
 * module owns the canonical court size; we duplicate the relevant
 * dimensions inline rather than reach across the dependency graph
 * because this module is intentionally THREE-free.
 */
export const HALF_COURT_HALF_WIDTH_FT = 25
export const HALF_COURT_LENGTH_FT = 47

/**
 * Returned by `composeFullscreenFraming`. All values are in feet
 * (court-space) except `padding` which is a unitless multiplier on
 * the renderer's auto-fit distance, and `lookAtLiftFt` which raises
 * the camera's aim point so a wider canvas does not bias the
 * vertical centre of frame onto the floor.
 */
export interface FullscreenFraming {
  /** Floor-x envelope half-width — the camera must show at least this. */
  floorXHalfFt: number
  /** Floor-z envelope minimum (closer to baseline). */
  floorZMinFt: number
  /** Floor-z envelope maximum (toward half-court). */
  floorZMaxFt: number
  /** Multiplier on the auto-fit distance. > 1 dollies out, < 1 in. */
  padding: number
  /** Vertical offset (feet) added to the auto-fit lookAt.y. */
  lookAtLiftFt: number
}

/**
 * Composition policy.
 *
 *   aspect < 0.7 (portrait phone)
 *      Tighten the envelope to the action zone (paint + arc) so the
 *      figure remains the subject. Pull the camera in a touch
 *      (padding 0.94) and lift the lookAt slightly so a kid holding
 *      the phone vertical does not see a hot floor and a black
 *      ceiling.
 *
 *   aspect ∈ [0.7, 1.5) (square / mobile landscape)
 *      Use the renderer's existing baseline envelope (matches the
 *      imperativeScene HALF_COURT_FLOOR_X = 19, z [0, 24]). Padding
 *      stays at 1.06 — the existing Phase K value — so this band
 *      remains byte-identical to today.
 *
 *   aspect ∈ [1.5, 1.95) (desktop 16:9, 17:10)
 *      Hold the same envelope but lift the lookAt by 0.5 ft so the
 *      composition centres slightly above the floor; this keeps
 *      players' shoulders/heads near the visual centre instead of
 *      their hips, the basketball-broadcast convention.
 *
 *   aspect ≥ 1.95 (ultrawide, fullscreen-on-21:9)
 *      Widen the floor envelope to ±22 ft and z [0, 28] so the
 *      auto-fit's horizontal solver fills the wide canvas with
 *      court rather than padding-clipped sky. Drop padding to 1.02
 *      so the wider envelope is not double-padded into black.
 *
 * Why these numbers
 *   - The court is 50 ft wide (±25). A floorX of 22 leaves 3 ft of
 *     out-of-bounds visible on each side at ultrawide — enough to
 *     read sideline geometry without showing the gym backstop.
 *   - z [0, 28] keeps the rim, paint, free-throw line, and the
 *     three-point arc all inside the safe area at every aspect.
 *   - Padding values were picked so the renderer's existing
 *     `computeAutoTarget` math produces a frame that fills the
 *     viewport without cropping closeouts at the wing.
 */
export function composeFullscreenFraming(aspect: number): FullscreenFraming {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    return {
      floorXHalfFt: 19,
      floorZMinFt: 0,
      floorZMaxFt: 24,
      padding: 1.06,
      lookAtLiftFt: 0,
    }
  }

  if (aspect < 0.7) {
    return {
      floorXHalfFt: 16,
      floorZMinFt: 0,
      floorZMaxFt: 22,
      padding: 0.94,
      lookAtLiftFt: 1,
    }
  }

  if (aspect < 1.5) {
    // Embedded canvases (calibration / /train at ~280-320 px tall) sit
    // around aspect 1.2-1.4. The pre-existing 1.06 padding wrapped a
    // ~6 % grey ring around the action and made the play feel small.
    // Drop to a no-breathing-room fit so the same auto-fit envelope
    // fills the canvas tighter without cropping any movement endpoint
    // (the envelope itself already has the §8.7 safe-area margin
    // baked in).
    return {
      floorXHalfFt: 19,
      floorZMinFt: 0,
      floorZMaxFt: 24,
      padding: 1.0,
      lookAtLiftFt: 0,
    }
  }

  if (aspect < 1.95) {
    // Desktop 16:9 in-page (non-fullscreen) keeps the 19/0/24
    // envelope (locked by `composeFullscreenFraming` test) but
    // tightens padding to fill the visible canvas.
    return {
      floorXHalfFt: 19,
      floorZMinFt: 0,
      floorZMaxFt: 24,
      padding: 1.0,
      lookAtLiftFt: 0.5,
    }
  }

  return {
    floorXHalfFt: 22,
    floorZMinFt: 0,
    floorZMaxFt: 28,
    padding: 1.02,
    lookAtLiftFt: 1,
  }
}

/**
 * Defensive guard for the auto-fit's distance math. Some browsers
 * (Safari mid-fullscreen transition) have been observed to publish
 * a (size.width, size.height) pair where one component is briefly
 * 0; the resulting NaN aspect would propagate into the camera's
 * projection matrix. The renderer can call this helper to coerce
 * any non-finite or zero aspect back to a safe 16:9 default before
 * passing it into the auto-fit.
 */
export function safeFullscreenAspect(width: number, height: number): number {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return 16 / 9
  }
  return width / height
}

/**
 * The minimum floor rectangle (in court space) that must be visible
 * for the half-court to feel intentional. Used by the renderer to
 * seed its Box3 on top of the active scene geometry — the auto-fit
 * always covers at least this much court regardless of where the
 * play happens to start.
 */
export interface FullscreenSafeArea {
  xHalf: number
  zMin: number
  zMax: number
}

export function getFullscreenSafeArea(aspect: number): FullscreenSafeArea {
  const f = composeFullscreenFraming(aspect)
  return {
    xHalf: f.floorXHalfFt,
    zMin: f.floorZMinFt,
    zMax: f.floorZMaxFt,
  }
}

/**
 * Background extension distance. The Court3D background plane is
 * sized in feet; this helper returns how many feet of floor the
 * gym shell should extend beyond the half-court rectangle so the
 * fullscreen composition does not show a hard floor edge into a
 * black void. Wider aspects need more extension on the X axis;
 * the Z axis is bounded by the back wall regardless.
 */
export function getGymShellExtensionFt(aspect: number): {
  xExtensionFt: number
  zBackExtensionFt: number
} {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9
  if (a < 0.7) {
    return { xExtensionFt: 18, zBackExtensionFt: 14 }
  }
  if (a < 1.5) {
    return { xExtensionFt: 24, zBackExtensionFt: 16 }
  }
  if (a < 1.95) {
    return { xExtensionFt: 32, zBackExtensionFt: 18 }
  }
  return { xExtensionFt: 48, zBackExtensionFt: 22 }
}
