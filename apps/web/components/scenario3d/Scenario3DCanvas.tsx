'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { AutoFitCamera } from './AutoFitCamera'
import { Court3D } from './Court3D'
import { Debug3DScene } from './Debug3DScene'
import { EmergencyScene3D } from './EmergencyScene3D'
import { OrbitDebugControls } from './OrbitDebugControls'
import { SceneDebug3D } from './SceneDebug3D'
import { ScenarioScene3D } from './ScenarioScene3D'
import type { ReplayMode, ReplayPhase } from './ScenarioReplayController'
import { SceneMotionProvider } from './SceneMotionContext'
import {
  _getPlayerFigureDecisionLog,
  _resetPlayerFigureDecisionLog,
  _setForceGlbAthletePreview,
  buildBasketballGroup,
  CameraController,
  disposeGroup,
  fitCameraToScene,
  isGlbAthletePreviewActive,
  isImportedCloseoutClipActive,
  MotionController,
  ReplayStateMachine,
  type CameraMode,
  type ReplayState,
} from './imperativeScene'
import { TeachingOverlayController } from './imperativeTeachingOverlay'
import {
  getCameraMode,
  hasWebGL,
  isAutoFitCamera,
  isCameraShakeEnabled,
  isDebug3D,
  isEmergencyScene,
  isOrbitDebug,
  readSimpleSceneOverride,
} from '@/lib/scenario3d/feature'
import { useReducedMotion } from '@/lib/scenario3d/useReducedMotion'
import { createDefaultScene, type Scene3D } from '@/lib/scenario3d/scene'
import {
  getQualityModeFromUrl,
  resolveQualitySettings,
  settingsForTier,
  type QualityMode,
  type QualitySettings,
  type QualityTier,
} from '@/lib/scenario3d/quality'
import {
  buildDustMotes,
  buildFloorSparkles,
  getCourtSpotPulseAlpha,
  getGlassShimmerAlpha,
  getKeyDefenderPulseAlpha,
  getRimHaloPulseAlpha,
  getRimMetalShimmerIntensity,
  type DustMotes,
  type FloorSparkles,
} from '@/lib/scenario3d/atmosphere'
import { FramePacingTracker } from '@/lib/scenario3d/framePacing'
import {
  isGlbAthleteCacheReady,
  loadGlbAthleteAsset,
  preloadImportedCloseoutClip,
} from './glbAthlete'
import { GlbDebugBadge, isGlbDebugBadgeEnabled } from './GlbDebugBadge'
import {
  FilmRoomDebugBadge,
  isFilmRoomDebugBadgeEnabled,
} from './FilmRoomDebugBadge'
import {
  pickAssistedCameraMode,
  type CameraAssist,
} from '@/lib/scenario3d/cameraPresets'
import {
  DEFAULT_OVERLAY_LEVEL,
  type OverlayLevel,
} from '@/lib/scenario3d/overlayLevel'

interface Scenario3DCanvasProps {
  /** Mounted as the WebGL fallback when WebGL is unavailable. */
  fallback: React.ReactNode
  children?: React.ReactNode
  /** Optional className passed to the outer wrapper. */
  className?: string
  /** Optional explicit pixel height. Defaults to 320px. */
  height?: number
  /** Fill the parent height, used by the fullscreen film-room shell. */
  fillParent?: boolean
  /** Normalised scene to render. If omitted, the built-in default is used. */
  scene?: Scene3D | null
  /** Human-readable concept tag(s), shown in dev-only canvas diagnostics. */
  concept?: string
  /** Animation mode for the scene. */
  replayMode?: ReplayMode
  /** Bumping resets the active timeline. */
  resetCounter?: number
  onCaption?: (caption: string | undefined) => void
  onPhase?: (phase: ReplayPhase) => void
  showPaths?: boolean
  /**
   * Optional camera preset override. Wins over the `?camera=` URL
   * param when both are set. Defaults to `'auto'` so the existing
   * fit-to-scene framing keeps working without any caller change.
   */
  cameraMode?: CameraMode
  /** Optional playback rate (0.25x..4x). Defaults to 1. */
  playbackRate?: number
  /** Optional pause flag. Defaults to false (playing). */
  paused?: boolean
  /**
   * Quality mode override. Defaults to 'auto', which delegates to the
   * device-capability heuristic in `lib/scenario3d/quality.ts`. Pass
   * 'low' / 'medium' / 'high' to pin the tier explicitly. The runtime
   * FPS guard may still degrade from 'high' or 'medium' to a lower tier
   * if sustained low FPS is detected.
   */
  quality?: QualityMode
  /** Notified once the resolved tier becomes known (and again whenever
   *  the FPS guard auto-degrades it). Useful for surfacing the active
   *  tier in dev diagnostics. */
  onQualityChange?: (tier: QualityTier) => void
  /**
   * Phase G — opt the canvas into the full Court3D + ScenarioScene3D
   * path even when the URL has not set `?simple=0`. The parent
   * (`Scenario3DView`) sets this for decoder scenarios so they default
   * to the JSX scenario tree (which mounts `ScenarioReplayController`
   * and emits the `frozen` phase). Legacy scenarios omit the prop and
   * stay on the imperative simple path. URL `?simple=1` still wins so
   * authors can force the simple path during diagnostics.
   */
  forceFullPath?: boolean
  /**
   * Phase H — forwards the user's picked choice into the JSX
   * `ScenarioReplayController` so it can dispatch the consequence and
   * best-read replay legs. Only meaningful on the full path; ignored
   * by the imperative simple-mode tree.
   */
  pickedChoiceId?: string | null
  /**
   * FR-4 §8.9 — how much the renderer should help with the freeze
   * camera. The Pathways layer chooses; the renderer just respects
   * the prop. `'none'` disables decoder-aware framing entirely
   * (broadcast everywhere); `'partial'` keeps broadcast through
   * freeze but composes a teaching replay; `'full'` composes both
   * the freeze and the replay frame. Default `'partial'` so the
   * existing /train flow keeps the pre-FR-4 framing through freeze
   * but still earns a teaching replay.
   */
  cameraAssist?: CameraAssist
  /**
   * FR-4 §8.6 — explicit "user is driving the camera" flag set by
   * `Scenario3DView` when the URL `?camera=` carried a value or the
   * dropdown was touched. When true, the FR-4 dispatcher offers no
   * opinion and the controller keeps the user's pick exactly as-is.
   * Resets on scenario change so the dispatcher resumes on the next
   * scene per §8.6 ("decoder presets stop running for that scene.
   * They resume on the next scenario.").
   */
  cameraManualOverride?: boolean
  /**
   * FR-5 §9.2 — Pathways-driven overlay intensity. Forwarded into
   * the JSX `AuthoredOverlayBridge` (full path only) which projects
   * the scene's authored overlay arrays through `applyOverlayLevel`
   * before mounting them. Defaults to `'beginner'` so legacy callers
   * keep mounting the full cluster.
   */
  overlayLevel?: OverlayLevel
}

// Mid-tone gray. While the rebuild is in flight we deliberately do NOT
// use near-black: a black canvas + a black-rendered scene is
// indistinguishable from "no scene at all". Gray makes invisibility
// impossible to miss.
const CANVAS_BG = '#3F4756'
const EMERGENCY_BG = '#4A5568'

// Production "first paint" camera. Used only for the literal first
// rendered frame — the imperative CameraController takes over on the
// next parent rAF tick and snaps to its own `auto` target (see
// computeAutoTarget in imperativeScene.ts). These constants are kept
// close to the auto-fit broadcast pose so users do not see a jarring
// camera jump between frame 0 and frame 1.
//
// Packet B (renderer-polish) re-tuned this from (0, 50, 70) → (0, 18, 48)
// because the old pose sat the camera so high and far back that the
// half-court rendered as a thin sliver at the bottom of the canvas
// while ~80% of the frame stayed black. The new pose matches the
// re-tuned broadcast preset and matches what the auto-fit controller
// produces a tick later.
const CAMERA_POSITION: [number, number, number] = [0, 18, 48]
const CAMERA_LOOKAT: [number, number, number] = [0, 3, 20]
const CAMERA_FOV = 42

// Debug self-test camera. Aimed straight at the origin with a wide FOV
// so any object placed near (0, 0, 0) is guaranteed to be visible.
const DEBUG_CAMERA_POSITION: [number, number, number] = [0, 24, 30]
const DEBUG_CAMERA_LOOKAT: [number, number, number] = [0, 0, 0]
const DEBUG_CAMERA_FOV = 45

// Emergency camera. Hardcoded at (0, 30, 30) looking straight at origin
// with a generous 60° FOV — guarantees any object placed near (0, *, 0)
// is in frame regardless of coordinate scale.
const EMERGENCY_CAMERA_POSITION: [number, number, number] = [0, 30, 30]
const EMERGENCY_CAMERA_LOOKAT: [number, number, number] = [0, 0, 0]
const EMERGENCY_CAMERA_FOV = 60

/**
 * Top-level wrapper that mounts the R3F <Canvas> for a scenario scene. The
 * 3D scene IS the product — the real scene renders as the primary path
 * and we only fall back to the supplied 2D node when WebGL is genuinely
 * unavailable on the device, or the GL context is lost. Errors thrown
 * inside the canvas are caught by Scenario3DErrorBoundary further up.
 *
 * `?debug3d=1` short-circuits the entire scenario pipeline and renders a
 * dependency-free debug scene with a guaranteed-visible camera. If the
 * debug scene paints in production but the regular scene does not, the
 * problem is in scenario data / scene composition, not the renderer.
 */
export function Scenario3DCanvas({
  fallback,
  children,
  className,
  height,
  fillParent = false,
  scene,
  concept,
  replayMode = 'intro',
  resetCounter,
  onCaption,
  onPhase,
  showPaths,
  cameraMode: cameraModeProp,
  playbackRate,
  paused,
  quality = 'auto',
  onQualityChange,
  forceFullPath,
  pickedChoiceId,
  // FR-4 Packet 4 — `partial` matches the pre-FR-4 broadcast-through-
  // freeze behaviour while still allowing a teaching replay, so the
  // default keeps existing /train sessions stable. /dev/scenario-preview
  // and any future Pathways "Learn the Cue" mode pass `'full'` to opt
  // into decoder-aware freeze framing.
  cameraAssist = 'partial',
  cameraManualOverride = false,
  overlayLevel = DEFAULT_OVERLAY_LEVEL,
}: Scenario3DCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Refs into the THREE objects R3F creates. Captured in onCreated so a
  // parent-level rAF loop can drive rendering even if R3F's reconciler
  // never mounts any of the <Canvas> children (in which case no
  // useFrame, no useEffect-from-Canvas-child, no animation at all).
  const glRef = useRef<THREE.WebGLRenderer | null>(null)
  const threeSceneRef = useRef<THREE.Scene | null>(null)
  const threeCameraRef = useRef<THREE.Camera | null>(null)
  // Owns broadcast/tactical/follow/replay/auto framing. Created once
  // per imperative scene mount and torn down with the same group so
  // it never outlives the canvas it was aimed at.
  const cameraControllerRef = useRef<CameraController | null>(null)
  // Owns deterministic player + ball motion for the imperative scene.
  // Same lifetime as the imperative scene group: rebuilt on scene/mode
  // change, ticked from the parent rAF loop, cleared on unmount.
  const motionControllerRef = useRef<MotionController | null>(null)
  // Decoder freeze + consequence + replay state machine. Wraps the
  // motion controller; created only when the scene has an authored
  // freeze marker (`scene.freezeAtMs !== null`) so legacy scenes
  // without a freeze stay on the simple `idle → playing → done` flow.
  // Subscribes once per mount and pushes state-machine transitions
  // through the parent's `onPhase` callback.
  const stateMachineRef = useRef<ReplayStateMachine | null>(null)
  const consumedChoiceRef = useRef<string | null>(null)
  // Phase B / B4 — buffer a `pickedChoiceId` that arrives before the
  // state machine reaches `frozen`. The subscribe callback below flushes
  // this on the `frozen` transition so a pick is never silently dropped
  // by the early-return in the [pickedChoiceId] effect.
  const pendingPickRef = useRef<string | null>(null)
  // Phase B / B1 — mirror the React `paused` and `playbackRate` props
  // into refs so the state-machine subscribe callback can re-apply them
  // after a leg swap. `MotionController.setMovements` (called by
  // `startConsequence` / `startReplay`) hard-resets `pausedAtT = null`,
  // so without this re-arm the consequence/replay leg always begins
  // playing even when the user paused before picking. The two effects
  // below keep the refs in lock-step with the React props.
  const pausedRef = useRef<boolean>(false)
  const playbackRateRef = useRef<number>(1)
  // Packet E (renderer-polish, learning overlays). Owns the imperative
  // teaching overlay group (paths, defender cues, spacing labels). Same
  // lifetime as the imperative scene group: built when the scene mounts,
  // ticked from the parent rAF loop, disposed on unmount.
  const teachingOverlayRef = useRef<TeachingOverlayController | null>(null)
  // Polish pass: subtle dust-mote field added to the scene on the high
  // tier only. Owns its own GPU resources, disposed alongside the
  // imperative scene group. Null on medium/low tiers.
  const dustMotesRef = useRef<DustMotes | null>(null)
  // AAA polish — sparse polished-floor twinkles. Same lifecycle shape
  // as the dust motes (build-once, animate via in-place mutation,
  // dispose on unmount). High-tier only.
  const floorSparklesRef = useRef<FloorSparkles | null>(null)
  // Polish pass: tiny decaying camera shake triggered on pass-arrival
  // events. Applied to camera.position AFTER CameraController.tick so
  // it offsets the controller's resolved framing for a few frames and
  // then naturally decays as the controller writes a fresh position
  // next tick.
  const shakeRef = useRef<{
    amplitude: number
    duration: number
    startedAt: number
  } | null>(null)
  // V1 UX completion — pass-arrival shake gate. Read once from the
  // URL flag in an effect (so SSR markup never branches on
  // `window.location`) and stored in a ref so the parent rAF loop can
  // consult it without re-rendering on every frame. Default false
  // means production users get no shake; `?shake=1` opts in for dev
  // verification.
  const shakeEnabledRef = useRef<boolean>(false)
  useEffect(() => {
    shakeEnabledRef.current = isCameraShakeEnabled()
  }, [])
  // P3.3B — bumped once when the asynchronous GLB athlete cold-load
  // completes, so the scene-build effect re-runs and swaps the
  // procedural cold-cache fallback for the loaded GLB mannequin.
  // Without this trigger, the very first scene rendered after a
  // page navigation always showed procedural figures (the imperative
  // scene-build is synchronous — calling `buildGlbAthletePreview`
  // returns `null` while the cache is cold, falling through to
  // procedural). Subsequent scenes within the same canvas mount
  // were already fine because the cache was warm by then; the bug
  // surfaced as "the very first scenario on /train always shows
  // procedural." Bump-once-on-warm-up reliably upgrades that first
  // scenario without churning later builds (the load-effect deps
  // are `[]`, so the bump fires at most once per canvas mount).
  const [glbCacheReadyTick, setGlbCacheReadyTick] = useState(0)
  const [mode, setMode] = useState<'probing' | '3d' | 'fallback'>('probing')
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null)
  const [canvasMounted, setCanvasMounted] = useState(false)
  const [rendererCreated, setRendererCreated] = useState(false)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [debugMode, setDebugMode] = useState(false)
  // P3.3C — `isGlbDebugBadgeEnabled()` reads `window.location.search`,
  // which is undefined during SSR. Gate the badge mount behind a
  // client-only post-hydration flag so the SSR markup and the first
  // client render agree (no hydration warning).
  const [glbDebugEnabled, setGlbDebugEnabled] = useState(false)
  // FR-1 Packet 6 — film-room teaching-state badge. Mounts only under
  // `?debugFilmRoom=1` or `window.__COURTIQ_FILM_ROOM_DEBUG__`. Same
  // hydration-safe gate as the GLB badge above.
  const [filmRoomDebugEnabled, setFilmRoomDebugEnabled] = useState(false)
  // FR-1 Packet 6 — local mirror of the replay phase so the
  // FilmRoomDebugBadge surfaces it without subscribing to the
  // controller. We layer it on top of the parent's onPhase callback —
  // the parent still receives every transition.
  const [filmRoomReplayPhase, setFilmRoomReplayPhase] = useState<ReplayPhase>(
    'idle',
  )
  // V1 UX completion — phase emission dedup.
  //
  // When `?simple=0` is set on the URL the canvas mounts BOTH the
  // imperative `ReplayStateMachine` (line ~1106) AND the JSX
  // `ScenarioScene3D` → `ScenarioReplayController` tree (line ~1731);
  // both emitters call `setFilmRoomReplayPhase` + the parent's
  // `onPhase` for every transition they observe. The two emitters
  // share the {idle/setup/playing/frozen/consequence/replaying/done}
  // values (only the JSX controller adds `cueRepaint`), so the same
  // phase can be emitted twice in a row — which then re-flushes the
  // FR-4 dispatcher useEffect and the FR-5 overlay-bridge effect
  // even though nothing actually changed.
  //
  // Dedup is applied at the bridge level: the helper below stamps
  // the most-recently-emitted phase in a ref and skips the
  // setFilmRoomReplayPhase + onPhase fan-out when the next emitter
  // pushes the same value. The cueRepaint phase still flows through
  // because it never duplicates with the imperative state machine
  // (only the JSX controller emits it).
  const lastEmittedPhaseRef = useRef<ReplayPhase | null>(null)
  const emitPhaseRef = useRef<((phase: ReplayPhase) => void) | null>(null)
  if (!emitPhaseRef.current) {
    emitPhaseRef.current = (phase: ReplayPhase) => {
      if (lastEmittedPhaseRef.current === phase) return
      lastEmittedPhaseRef.current = phase
      setFilmRoomReplayPhase(phase)
      onPhase?.(phase)
    }
  }
  // Re-bind the parent's `onPhase` reference each render so the
  // emitter always calls the latest closure (deps changes etc.).
  useEffect(() => {
    emitPhaseRef.current = (phase: ReplayPhase) => {
      if (lastEmittedPhaseRef.current === phase) return
      lastEmittedPhaseRef.current = phase
      setFilmRoomReplayPhase(phase)
      onPhase?.(phase)
    }
  }, [onPhase])
  // P3.3F — `?forceGlb=1` URL param. When set the figure builder
  // (a) skips the skinned/premium/Phase-F fallback chain and
  // (b) returns a bright magenta marker for any figure the GLB
  // builder cannot produce, so the failure is impossible to miss.
  // Same hydration-safe pattern as the debug badge — set inside an
  // effect so the SSR markup never depends on `window.location`.
  // Bumping `glbCacheReadyTick` after the flag flips makes the
  // scene-build effect re-run with the new policy on the next tick.
  const [forceGlb, setForceGlb] = useState(false)
  useEffect(() => {
    setGlbDebugEnabled(isGlbDebugBadgeEnabled())
    setFilmRoomDebugEnabled(isFilmRoomDebugBadgeEnabled())
    if (typeof window === 'undefined') return
    let force = false
    try {
      force = new URLSearchParams(window.location.search).get('forceGlb') === '1'
    } catch {
      // Malformed URL — treat as off.
    }
    setForceGlb(force)
    _setForceGlbAthletePreview(force)
    // FR-2 Packet 6 — when the developer flips `?forceGlb=1` the
    // env-flag-gated load effect below may have skipped the GLB
    // fetch entirely (env off → no preload → cache stays cold).
    // Without this kick the deferred mount in the imperative
    // scene-build effect would wait forever for a load that never
    // started. Firing the load here fires it once, regardless of
    // env flag. The `loadGlbAthleteAsset` cache + in-flight guards
    // make repeat calls cheap; the env-gated effect's separate
    // call is still allowed to continue.
    if (force) {
      void loadGlbAthleteAsset()
        .then(() => {
          // Bump the cache-ready tick so the imperative scene-build
          // effect re-evaluates whether to mount or keep waiting.
          // Mirrors the env-gated load effect's settle behaviour so
          // forceGlb traffic gets the same Packet-2 wait-then-render
          // contract.
          setGlbCacheReadyTick((n) => n + 1)
        })
        .catch(() => setGlbCacheReadyTick((n) => n + 1))
    }
    return () => {
      // Clear the override on unmount so a hot-reload during dev
      // doesn't leave the next mount stuck on force-glb behaviour.
      _setForceGlbAthletePreview(false)
    }
  }, [])
  const [emergencyMode, setEmergencyMode] = useState(false)
  const [orbitMode, setOrbitMode] = useState(false)
  // Always pin to the simple imperative path — the JSX Court3D +
  // ScenarioScene3D tree relies on R3F's reconciler to attach meshes to
  // the canvas scene, and that reconciler has been observed to silently
  // drop every child in production (see comment on the imperative-scene
  // mount effect below). The imperative path adds geometry directly to
  // threeSceneRef.current and is immune to that failure. Decoder
  // scenarios still get the freeze + consequence + replay flow via the
  // imperative `ReplayStateMachine` wired up in the same effect.
  // URL `?simple=0` is honored as an escape hatch for diagnostics.
  const [simpleMode, setSimpleMode] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      const raw = new URLSearchParams(window.location.search).get('simple')
      if (raw === '0') return false
    } catch {
      // ignore
    }
    return true
  })
  const [autoFitMode, setAutoFitMode] = useState(true)
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null)
  const [dpr, setDpr] = useState<number | null>(null)
  const [cameraStats, setCameraStats] = useState<CameraStats | null>(null)
  const [parentLoopStats, setParentLoopStats] = useState<{
    frames: number
    children: number
  } | null>(null)
  const [cameraModeState, setCameraModeState] = useState<CameraMode>('auto')
  // Resolved quality settings. Server-render starts on a pessimistic
  // 'medium' default so SSR markup matches; the first client-side
  // effect below replaces it with a real device-capability resolve
  // (or honors the explicit ?quality= URL override / prop).
  const [qualitySettings, setQualitySettings] = useState<QualitySettings>(
    () => settingsForTier('medium'),
  )

  const reducedMotion = useReducedMotion()

  // Resolved camera mode: prop wins over URL param wins over 'auto'.
  const activeCameraMode: CameraMode = cameraModeProp ?? cameraModeState

  const visibleScene = useMemo(
    () => scene ?? createDefaultScene('default_3d_scene'),
    [scene],
  )

  const sceneValidationStatus = useMemo(
    () => getSceneValidationStatus(visibleScene, scene, debugMode),
    [scene, visibleScene, debugMode],
  )

  useEffect(() => {
    const debug = isDebug3D()
    const emergency = isEmergencyScene()
    const orbit = isOrbitDebug()
    // Phase G — decoder scenarios default to the full Court3D +
    // ScenarioScene3D path so the JSX `ScenarioReplayController` can
    // emit the freeze edge. URL `?simple=1` still wins so testers can
    // force the simple path; URL `?simple=0` and the prop both push
    // the canvas onto the full path.
    // Pin to the imperative path. URL `?simple=0` still wins as an
    // escape hatch; `forceFullPath` is intentionally ignored here
    // because the JSX full path doesn't reliably mount its meshes
    // (R3F reconciler drops children — see imperative mount comment).
    // Decoder freeze events flow through the imperative
    // `ReplayStateMachine` set up in the imperative-scene mount effect.
    const explicit = readSimpleSceneOverride()
    const simple = explicit === false ? false : true
    const autofit = isAutoFitCamera()
    setDebugMode(debug)
    setEmergencyMode(emergency)
    setOrbitMode(orbit)
    setSimpleMode(simple)
    setAutoFitMode(autofit)
    const urlMode = getCameraMode()
    if (urlMode) setCameraModeState(urlMode)
    const supported = hasWebGL()
    setWebglSupported(supported)
    setMode(supported ? '3d' : 'fallback')
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.info('[scenario3d] mount probe', {
        webglSupported: supported,
        debugMode: debug,
        emergencyMode: emergency,
        sceneId: scene?.id ?? null,
        playerCount: visibleScene.players.length,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pin to the imperative path; URL `?simple=0` is the only opt-out.
  // `forceFullPath` no longer flips this — decoder freeze events come
  // from the imperative `ReplayStateMachine` instead of the JSX
  // ScenarioReplayController, so the JSX full path is unused unless
  // explicitly requested with `?simple=0`.
  useEffect(() => {
    const explicit = readSimpleSceneOverride()
    setSimpleMode(explicit === false ? false : true)
  }, [forceFullPath])

  // Resolve quality settings on mount and whenever the prop changes.
  // URL `?quality=` wins over the resolved auto-tier so a tester can
  // pin the renderer to e.g. 'low' from a query string. The FPS guard
  // below may further downgrade the resolved tier at runtime.
  useEffect(() => {
    const urlMode = getQualityModeFromUrl()
    const effectiveMode: QualityMode = urlMode ?? quality
    const resolved = resolveQualitySettings(effectiveMode)
    setQualitySettings(resolved)
    onQualityChange?.(resolved.tier)
  }, [quality, onQualityChange])

  // Mirror the active settings into a ref so the rAF loop can read the
  // latest quality without re-subscribing every time it changes (which
  // would tear down and recreate the loop). The FPS guard further
  // mutates this ref-and-state pair when it auto-degrades.
  const qualityRef = useRef<QualitySettings>(qualitySettings)
  useEffect(() => {
    qualityRef.current = qualitySettings
    // Push the new pixel-ratio cap into the live renderer immediately —
    // R3F reads `dpr` on Canvas creation; later changes need a manual
    // setPixelRatio so the FPS guard can take effect without a remount.
    const gl = glRef.current
    if (gl) {
      const target = Math.min(
        qualitySettings.maxPixelRatio,
        typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number'
          ? window.devicePixelRatio
          : 1,
      )
      try {
        gl.setPixelRatio(target)
        setDpr(target)
      } catch {
        /* renderer torn down between effect and apply */
      }
    }
  }, [qualitySettings])

  // Phase L / P0-LOCK — wrapper resize sync. Drives `gl.setSize` and
  // `controller.setAspect` from the wrapper's current layout box so
  // the pixel buffer + camera aspect track the visible viewport.
  //
  // Three signals can change wrapper size:
  //   1. Browser fullscreen transition. The `:fullscreen` CSS rule
  //      flips the outer column to flex-column 100vh and the wrapper
  //      to `flex: 1 1 auto`, but React's `setIsFullscreen(true)` to
  //      `data-fullscreen-fill='true'` flush is async. The Phase K
  //      bug (top-strip / bottom-half-black) was the React render
  //      flushing AFTER the document `fullscreenchange` handler
  //      called `gl.setSize` on the still-embedded wrapper height.
  //   2. GLB asset cold-load completing AFTER first paint. The
  //      figure swaps in (different bbox, different bind pose), and
  //      R3F's internal observer can coalesce the visible-size
  //      change away.
  //   3. Plain parent resize (window resize, layout change).
  //
  // The fix is a `ResizeObserver` on the wrapper itself: it fires
  // whenever the wrapper's actual layout box changes, regardless of
  // the cause, so we no longer race React's render cycle. The
  // `fullscreenchange` and `webkitfullscreenchange` events stay as a
  // belt-and-suspenders backstop for browsers where the observer
  // coalesces the transition into a stale single tick.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const wrapper = containerRef.current
    if (!wrapper) return
    let lastWidth = -1
    let lastHeight = -1
    const apply = () => {
      const gl = glRef.current
      const cam = threeCameraRef.current
      if (!gl) return
      const width = wrapper.clientWidth
      const height = wrapper.clientHeight
      if (width <= 0 || height <= 0) return
      if (width === lastWidth && height === lastHeight) return
      lastWidth = width
      lastHeight = height
      try {
        gl.setSize(width, height, false)
      } catch {
        /* renderer torn down between effect and apply */
      }
      const ctrl = cameraControllerRef.current
      if (ctrl) ctrl.setAspect(width / height)
      if (cam && (cam as THREE.PerspectiveCamera).isPerspectiveCamera) {
        const persp = cam as THREE.PerspectiveCamera
        persp.aspect = width / height
        persp.updateProjectionMatrix()
      }
      setCanvasSize({ width, height })
    }

    // Three back-to-back applies after a discrete event (fullscreen
    // toggle / GLB load): the synchronous one catches browsers that
    // settle layout before firing the event, the next-frame one
    // covers the React render flush (data-fullscreen-fill prop), and
    // a third deferred apply at ~120ms catches Safari's slower
    // post-fullscreen layout pass.
    //
    // Visual/Motion review — the final deferred apply also calls
    // `snapNext()` on the camera controller. Without this, any
    // in-flight eased lerp toward intermediate aspect targets
    // (caused by the browser publishing 1-3 sub-pixel layout
    // updates before the transition settles) would keep chasing the
    // moving target for ~0.18-0.46s after the transition ended,
    // reading as a brief shake. Snapping to the final target collapses
    // every transient lerp into one clean jump on the last apply.
    const applyAfterTransition = () => {
      apply()
      requestAnimationFrame(() => {
        apply()
        setTimeout(() => {
          apply()
          const ctrl = cameraControllerRef.current
          if (ctrl) ctrl.snapNext()
        }, 120)
      })
    }

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => apply())
      resizeObserver.observe(wrapper)
    }

    const onFullscreenChange = applyAfterTransition
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange)

    // Cold-load handoff: when the GLB flag is on, the asset cache
    // populates asynchronously and the figure-builder swaps from
    // procedural to skinned on the next scene mount. Re-running
    // apply once the load promise settles ensures the renderer's
    // pixel buffer + camera aspect track any wrapper-size change
    // that may have happened during the load. Gated on the flag so
    // GLB-off traffic never pays the 1.4MB asset fetch.
    //
    // P1.7 — when the imported closeout flag is ALSO on, kick off
    // the closeout-clip fetch in parallel so the loader cache is
    // warm before the next scene rebuild. The figure builder uses
    // whatever clip is in the cache at build time (synthetic
    // placeholder when cold, real GLB when warm); the next mount
    // (resetCounter bump or scene change) picks up the real clip.
    // Gated via `isImportedCloseoutClipActive()` so flag-off
    // traffic never fetches the 60 KB closeout asset.
    let cancelled = false
    const glbActive = isGlbAthletePreviewActive()

    // P3.3C — one-shot console summary so the in-prod gate state is
    // grep-able from the browser console (and Sentry breadcrumbs)
    // without opening `/dev/glb-debug`. Public-only payload: every
    // `NEXT_PUBLIC_*` var is already inlined in the client bundle and
    // visible in source. Logged once per canvas mount; the visual
    // `<GlbDebugBadge />` below carries the same data when
    // `?glbDebug=1` (or `window.__COURTIQ_GLB_DEBUG__`) is set.
    try {
      // eslint-disable-next-line no-console
      console.info('[CourtIQ GLB]', {
        env: {
          glb: process.env.NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW ?? '',
          closeout: process.env.NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP ?? '',
          backCut: process.env.NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP ?? '',
        },
        gate: glbActive,
        commit: process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'unknown',
      })
    } catch {
      // Console writes can throw if the page captured `console.info`
      // and rethrows; the gate decision must not depend on it.
    }

    // FR-2 Packet 2 — safety timeout. The imperative scene-build
    // effect defers its first mount when the gate is on and the
    // cache is cold so the very first scenario never renders
    // procedural-then-GLB. The effect waits for `glbCacheReadyTick`
    // to bump from zero. We always bump on load resolution (success
    // OR failure) and add a hard timeout below so a stalled fetch
    // can never trap the user behind a black canvas — after the
    // timeout fires we stop waiting and let the renderer pick the
    // best available fallback path (GLB-static-pose / procedural)
    // exactly as it does today.
    const GLB_LOAD_DEFER_TIMEOUT_MS = 1500
    if (glbActive) {
      let settled = false
      const settle = () => {
        if (settled || cancelled) return
        settled = true
        // FR-2 Packet 2 — bump on EITHER outcome (warm cache or
        // failure). Pre-FR-2 this only fired on success, which left
        // the deferred mount path waiting forever when the asset
        // was unreachable. Bumping on failure tells the scene-build
        // effect "the load is decided — proceed with whatever
        // fallback path the figure builder picks."
        setGlbCacheReadyTick((n) => n + 1)
      }
      const timeoutId = window.setTimeout(() => {
        if (!settled) {
          // eslint-disable-next-line no-console
          console.warn('[CourtIQ GLB] load defer timeout — proceeding without cache', {
            timeoutMs: GLB_LOAD_DEFER_TIMEOUT_MS,
          })
          settle()
        }
      }, GLB_LOAD_DEFER_TIMEOUT_MS)
      void loadGlbAthleteAsset()
        .then((result) => {
          if (cancelled) {
            window.clearTimeout(timeoutId)
            return
          }
          applyAfterTransition()
          window.clearTimeout(timeoutId)
          if (!result) {
            // FR-2 Packet 5 — surface the silent-failure transitions
            // (`asset-missing-or-no-skin`, `loader-threw`) into the
            // structured breadcrumb log so dev/QA never sees a quiet
            // procedural fallback again. We only know "no cache" at
            // this layer — the figure-decision log captures the
            // per-figure reason on the next rebuild.
            // eslint-disable-next-line no-console
            console.warn('[CourtIQ GLB] loader resolved without a cache entry', {
              reason: 'asset-missing-or-no-skin',
            })
          }
          settle()
        })
        .catch((err) => {
          window.clearTimeout(timeoutId)
          // FR-2 Packet 5 — explicit `loader-threw` surface. The
          // promise was created with `.catch(() => null)` inside
          // `loadGlbAthleteAsset` so this branch only fires on a
          // truly unexpected throw. We still settle so the deferred
          // mount path proceeds.
          // eslint-disable-next-line no-console
          console.warn('[CourtIQ GLB] loader threw', {
            reason: 'loader-threw',
            error: err instanceof Error ? err.message : String(err),
          })
          settle()
        })
      if (isImportedCloseoutClipActive()) {
        void preloadImportedCloseoutClip()
          .then(() => {
            if (cancelled) return
            applyAfterTransition()
          })
          .catch(() => {
            /* swallowed — synthetic placeholder fallback covers it */
          })
      }
    }

    return () => {
      cancelled = true
      if (resizeObserver) resizeObserver.disconnect()
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
    }
  }, [])

  // Parent-level rAF render driver. Polls glRef each frame and, once the
  // canvas has been created, calls gl.render(scene, camera) directly.
  // This loop is OWNED BY THE PARENT COMPONENT, not by a child of
  // <Canvas>, so it fires even when R3F's reconciler fails to mount any
  // Canvas children (the failure mode that produces a black canvas with
  // a working bg color but no geometry).
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (mode !== '3d') return
    let rafId = 0
    let running = true
    let frame = 0
    // FPS guard state — local to this rAF loop so it dies with it.
    // Tracks a rolling count of "slow" frames (>33ms). When the window
    // is full of slow frames we downgrade the tier exactly once.
    let lastFrameAt = 0
    let slowFrames = 0
    let measuredFrames = 0
    let degradeCooldownFrames = 0
    // Skip the first ~30 frames so initial mount work (geometry build,
    // texture upload, font/JIT warmup) cannot trick the guard.
    const FPS_GUARD_WARMUP = 30
    const FPS_GUARD_WINDOW = 120 // ~2s @ 60fps
    const FPS_SLOW_FRAME_MS = 33 // <30fps
    const FPS_SLOW_FRACTION = 0.6 // 60% of the window

    // V2-H — frame-pacing telemetry. The FPS guard above only emits a
    // single boolean ("should we degrade?"); the tracker keeps the
    // rolling distribution so a debug surface or telemetry probe can
    // surface p50 / p95 / max frame deltas without a second rAF. The
    // tracker is exposed on `window.__COURTIQ_FRAME_PACING__` so a
    // dev-only console can read it. SSR-safe because the assignment
    // sits inside this useEffect, which only runs on the client.
    const framePacing = new FramePacingTracker({
      bufferSize: FPS_GUARD_WINDOW,
      slowFrameMs: FPS_SLOW_FRAME_MS,
    })
    type WithFramePacing = typeof window & {
      __COURTIQ_FRAME_PACING__?: FramePacingTracker
    }
    ;(window as WithFramePacing).__COURTIQ_FRAME_PACING__ = framePacing
    const tick = () => {
      if (!running) return
      const gl = glRef.current
      const threeScene = threeSceneRef.current
      const cam = threeCameraRef.current
      if (gl && threeScene && cam) {
        try {
          // Drive the camera controller from the same parent rAF loop
          // we already trust to render. Skip when the user is manually
          // orbiting (drei OrbitControls) so the controller does not
          // fight a human dragger.
          //
          // V1 stabilization — aspect is NOT pulled from
          // `gl.domElement.clientWidth/Height` per frame any more.
          // Sub-pixel layout fluctuations during a fullscreen
          // transition (or while the wrapper is settling after a GLB
          // cold-load) used to clear the controller's 0.001 aspect
          // threshold every few frames and trigger a target recompute,
          // producing visible camera jitter. The Phase L
          // ResizeObserver-driven `apply()` (above) is the single
          // source of truth for wrapper-size changes and calls
          // `ctrl.setAspect` exactly once per real layout change. Per-
          // frame setAspect was redundant with that path and is
          // removed here.
          const ctrl = cameraControllerRef.current
          if (ctrl && !orbitMode &&
              (cam as THREE.PerspectiveCamera).isPerspectiveCamera) {
            ctrl.tick(cam as THREE.PerspectiveCamera)
          } else {
            cam.updateMatrixWorld()
          }
          // Drive imperative motion immediately after the camera tick
          // so the rendered frame sees consistent player/ball
          // transforms at the same instant the camera evaluates them.
          // Uses the same rAF loop — no extra timer, no useFrame.
          const motion = motionControllerRef.current
          const nowMs = performance.now()
          if (motion) motion.tick(nowMs)
          // Decoder state machine — drives freeze / consequence / replay
          // transitions off the same motion controller. tick() is a
          // pure event poll; safe to call every frame even when the
          // machine is in `idle` or `done`.
          stateMachineRef.current?.tick(nowMs)

          // Packet E — animate teaching overlay (dash pulse, denial
          // pulse rings, pressure halo). tick() returns immediately when
          // the group is hidden so toggling Paths off also stops the
          // animation cost.
          const overlay = teachingOverlayRef.current
          if (overlay) overlay.tick(nowMs)

          // V1 UX completion — pass-arrival camera shake is OFF by
          // default in production. The pre-V1 effect applied a damped
          // sine offset (~0.45 ft / 220 ms) to the camera position
          // every time `motion.consumePassArrival()` fired, but the
          // offset stacked on top of the controller's eased lerp
          // toward the camera target and read as jitter during
          // replay legs that contained passes. We still consume the
          // arrival flag every frame so the motion controller's
          // internal counter doesn't backfill, and we still honour
          // `?shake=1` for dev / motion-design verification.
          //
          // Visual/Motion review — amplitude tightened to 0.10 ft and
          // duration to 160 ms. The pre-review 0.18 ft / 220 ms
          // settings still landed in dev sessions as a noticeable
          // micro-bump on top of the controller's eased lerp; the
          // tighter envelope keeps the cue available for motion-
          // design verification while staying below the human-
          // noticeable jitter floor on the broadcast camera.
          // Additionally gated on the controller having reached its
          // current target (`hasSettled`) so a shake never stacks on
          // top of an in-flight teaching cut — that was the visible
          // "double bounce" the V1 stabilization pass flagged.
          if (motion && motion.consumePassArrival() &&
              shakeEnabledRef.current &&
              ctrl && !orbitMode &&
              ctrl.hasSettled() &&
              qualityRef.current.tier !== 'low') {
            shakeRef.current = {
              amplitude: 0.1,
              duration: 160,
              startedAt: nowMs,
            }
          }
          const shake = shakeRef.current
          if (
            shake &&
            ctrl && !orbitMode &&
            (cam as THREE.PerspectiveCamera).isPerspectiveCamera
          ) {
            const elapsed = nowMs - shake.startedAt
            if (elapsed >= shake.duration) {
              shakeRef.current = null
            } else {
              const u = elapsed / shake.duration
              const remaining = 1 - u
              const amp = shake.amplitude * remaining * remaining
              // Smooth deterministic shake. The previous per-frame
              // random offset read as jitter on lower frame
              // rates and made identical replays feel slightly
              // different. A damped wave keeps the pass-arrival bump
              // without adding random camera noise.
              cam.position.x += Math.sin(u * Math.PI * 7) * amp
              cam.position.y += Math.sin(u * Math.PI * 5 + Math.PI / 4) * amp * 0.32
              cam.updateMatrixWorld()
            }
          }

          // Polish pass — drift the dust motes one step. Cheap O(N)
          // buffer mutation; only present on the high tier so
          // medium/low devices skip the cost entirely.
          const dust = dustMotesRef.current
          if (dust) dust.tick(nowMs)
          // AAA polish — twinkle the polished-floor sparkles. Same
          // gating as dust (high tier only) and same shape (O(N) in-
          // place mutation).
          const sparkles = floorSparklesRef.current
          if (sparkles) sparkles.tick(nowMs)

          // V2-A — rim halo ambient breath. One material lookup per
          // frame; the helper is a single sin() call. The base opacity
          // is stamped on the mesh's userData by buildBasketballGroup
          // so the pulse multiplies the authored value instead of
          // drifting unboundedly across frames.
          if (qualityRef.current.tier !== 'low') {
            const rimGlow = threeScene.getObjectByName('rim-glow') as
              | THREE.Mesh
              | undefined
            const baseOpacity = rimGlow?.userData.baseOpacity as
              | number
              | undefined
            if (rimGlow && typeof baseOpacity === 'number') {
              const mat = rimGlow.material as THREE.MeshBasicMaterial
              mat.opacity = baseOpacity * getRimHaloPulseAlpha(nowMs)
            }
            // V4-D — key-defender heat-ring pulse. Same authored-opacity
            // / per-frame-multiplier shape as the rim halo. The figure
            // builder tags the heat ring with `name = 'key-defender-
            // heat-ring'` and stamps `userData.baseOpacity = ringOpacity`
            // so the per-frame loop can find it without a global
            // registry. We use `getObjectByName` once per frame to grab
            // the first heat ring; the founder-v0 scenarios only ever
            // mark a single key defender, so the ring is unique. If a
            // future scenario marks two, the second will be missed —
            // not a regression because the pre-V4 code didn't pulse at
            // all.
            const keyRing = threeScene.getObjectByName('key-defender-heat-ring') as
              | THREE.Mesh
              | undefined
            const keyBase = keyRing?.userData.baseOpacity as number | undefined
            if (keyRing && typeof keyBase === 'number') {
              const mat = keyRing.material as THREE.MeshBasicMaterial
              mat.opacity = keyBase * getKeyDefenderPulseAlpha(nowMs)
            }
            // AAA polish — rim metal micro-shimmer. Lifts the orange
            // torus's emissive intensity in a deterministic ±22%
            // band so the chrome catches stadium lights like a real
            // broadcast hoop. Base intensity is stamped on the rim's
            // userData at build time so the multiplier never drifts.
            const rimMesh = threeScene.getObjectByName('hoop-rim') as
              | THREE.Mesh
              | undefined
            const rimBase = rimMesh?.userData.baseEmissiveIntensity as
              | number
              | undefined
            if (rimMesh && typeof rimBase === 'number') {
              const mat = rimMesh.material as THREE.MeshStandardMaterial
              mat.emissiveIntensity = rimBase * getRimMetalShimmerIntensity(nowMs)
            }
            // AAA polish — rim bloom halo subtle breath, locked to
            // the same shimmer phase so the halo "blooms with" the
            // chrome highlight instead of fighting it.
            const rimHaloMesh = threeScene.getObjectByName('rim-bloom-halo') as
              | THREE.Mesh
              | undefined
            const rimHaloBase = rimHaloMesh?.userData.baseOpacity as
              | number
              | undefined
            if (rimHaloMesh && typeof rimHaloBase === 'number') {
              const mat = rimHaloMesh.material as THREE.MeshBasicMaterial
              mat.opacity = rimHaloBase * getRimMetalShimmerIntensity(nowMs)
            }
            // AAA polish — slow swell on the warm court spot so the
            // painted key reads as a live broadcast venue rather
            // than a static decal.
            const courtSpot = threeScene.getObjectByName('court-spot') as
              | THREE.PointLight
              | undefined
            const spotBase = courtSpot?.userData.baseIntensity as
              | number
              | undefined
            if (courtSpot && typeof spotBase === 'number') {
              courtSpot.intensity = spotBase * getCourtSpotPulseAlpha(nowMs)
            }
            // AAA polish — wandering glass highlight shimmer. The
            // backboard's bright sheen breathes off a two-frequency
            // sin so the glass reads as real tempered glass instead
            // of a static decal.
            const glassHL = threeScene.getObjectByName(
              'backboard-glass-highlight',
            ) as THREE.Mesh | undefined
            const glassBase = glassHL?.userData.baseOpacity as
              | number
              | undefined
            if (glassHL && typeof glassBase === 'number') {
              const mat = glassHL.material as THREE.MeshBasicMaterial
              mat.opacity = glassBase * getGlassShimmerAlpha(nowMs)
            }
          }

          gl.render(threeScene, cam)
          frame++

          // FPS guard — measures frame deltas without per-frame React
          // state updates. Only flips state when a tier downgrade
          // actually fires, and at most once until the cooldown clears.
          const nowFrame = performance.now()
          if (lastFrameAt !== 0 && qualityRef.current.fpsGuardEnabled) {
            const dt = nowFrame - lastFrameAt
            // V2-H — record the delta into the pacing tracker so debug
            // surfaces can surface p50/p95/max without spinning a
            // second rAF.
            if (frame > FPS_GUARD_WARMUP) framePacing.record(dt)
            if (frame > FPS_GUARD_WARMUP) {
              measuredFrames++
              if (dt > FPS_SLOW_FRAME_MS) slowFrames++
              if (degradeCooldownFrames > 0) degradeCooldownFrames--
              if (
                measuredFrames >= FPS_GUARD_WINDOW &&
                degradeCooldownFrames === 0
              ) {
                const slowFraction = slowFrames / measuredFrames
                if (slowFraction >= FPS_SLOW_FRACTION) {
                  const cur = qualityRef.current.tier
                  const next: QualityTier | null =
                    cur === 'high' ? 'medium' : cur === 'medium' ? 'low' : null
                  if (next) {
                    const nextSettings = settingsForTier(next)
                    qualityRef.current = nextSettings
                    setQualitySettings(nextSettings)
                    onQualityChange?.(next)
                    // eslint-disable-next-line no-console
                    console.info('[scenario3d] fps guard degraded tier', {
                      from: cur,
                      to: next,
                      slowFraction: slowFraction.toFixed(2),
                    })
                  }
                }
                // Reset window regardless so we don't immediately retry.
                slowFrames = 0
                measuredFrames = 0
                degradeCooldownFrames = FPS_GUARD_WINDOW
              }
            }
          }
          lastFrameAt = nowFrame

          if (frame === 1 || frame % 60 === 0) {
            setParentLoopStats({ frames: frame, children: threeScene.children.length })
          }
          if (frame === 1 || frame % 120 === 0) {
            // eslint-disable-next-line no-console
            console.info('[scenario3d] parent loop frame', frame, {
              children: threeScene.children.length,
              camPos: (cam as THREE.PerspectiveCamera).position.toArray(),
            })
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('[scenario3d] parent loop error', error)
        }
      }
      rafId = window.requestAnimationFrame(tick)
    }
    rafId = window.requestAnimationFrame(tick)
    return () => {
      running = false
      window.cancelAnimationFrame(rafId)
      // V2-H — clear the dev-mode pacing handle so a remounted canvas
      // never reads from a torn-down tracker.
      const w = window as WithFramePacing
      if (w.__COURTIQ_FRAME_PACING__ === framePacing) {
        delete w.__COURTIQ_FRAME_PACING__
      }
    }
    // onQualityChange and setQualitySettings are intentionally omitted —
    // including them would tear down and recreate the rAF loop on every
    // parent re-render. We accept a slightly stale onQualityChange
    // closure for the telemetry call inside the FPS guard; the visible
    // tier is still pushed into qualitySettings via the React setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, orbitMode])

  // IMPERATIVE SCENE BUILDER. Bypasses R3F's reconciler entirely. We
  // discovered the reconciler silently dropped every <Canvas> child in
  // production (THREE.Scene.children stayed at 0 even after 400+ frames
  // of the parent rAF loop running). Building the scene with vanilla
  // THREE primitives and adding it to threeSceneRef.current directly is
  // immune to that failure mode.
  //
  // Polls for the THREE refs every animation frame until they're set,
  // then builds the scene once and aims the camera. Rebuilds when the
  // input scene changes.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (mode !== '3d') return

    let cancelled = false
    let mounted: THREE.Group | null = null
    let pollId = 0

    const tryMount = () => {
      if (cancelled) return
      const threeScene = threeSceneRef.current
      const cam = threeCameraRef.current
      if (!threeScene || !cam) {
        pollId = window.requestAnimationFrame(tryMount)
        return
      }

      // FR-2 Packet 2 — defer the very first scene mount when the GLB
      // gate is on AND the loader cache is still cold AND the load
      // promise has not yet bumped `glbCacheReadyTick` (or fired the
      // safety timeout in the load effect above). This removes the
      // cold-cache "procedural-first frame, GLB-on-the-second-frame"
      // flicker that was the §6.7 product-trust issue: the same user
      // saw a different visual the first time vs. on later loads.
      //
      // Behavior:
      //   - GLB gate off → never wait, render whatever the fallback
      //     chain picks (procedural / 2D), exactly as before.
      //   - GLB gate on, cache already warm → render immediately
      //     with GLB figures.
      //   - GLB gate on, cache cold, first build (`tick === 0`) →
      //     hold off and re-poll on the next rAF tick.
      //   - GLB gate on, cache cold, the load resolved (`tick > 0`)
      //     → proceed with the renderer's fallback chain. The load
      //     promise OR the safety timeout in the load effect bumps
      //     the tick, so we cannot wait forever.
      //   - Subsequent scene swaps (visibleScene change) → tick is
      //     already > 0 from the initial mount, so this branch is a
      //     no-op and the scene mounts on the same frame.
      //
      // Force-glb (`?forceGlb=1`) follows the same wait policy here;
      // FR-2 Packet 6 layers the magenta-proxy guarantee on top once
      // the wait is over.
      const glbGateOn = isGlbAthletePreviewActive() || forceGlb
      if (
        !emergencyMode &&
        !debugMode &&
        simpleMode &&
        glbGateOn &&
        !isGlbAthleteCacheReady() &&
        glbCacheReadyTick === 0
      ) {
        pollId = window.requestAnimationFrame(tryMount)
        return
      }

      // Build geometry imperatively for non-debug, non-emergency, simple-mode
      // scenes — that's the production path we're trying to fix.
      if (!emergencyMode && !debugMode && simpleMode) {
        // P3.3F — clear per-figure decisions so the hard-error check
        // below only sees decisions from THIS scene-build, not any
        // earlier mount or scene swap.
        _resetPlayerFigureDecisionLog()
        let result: ReturnType<typeof buildBasketballGroup>
        try {
          result = buildBasketballGroup(visibleScene)
        } catch (error) {
          // A failed scene build leaves the canvas empty — flip to the
          // 2D fallback instead so the user never sees a blank rectangle.
          // eslint-disable-next-line no-console
          console.error('[scenario3d] imperative scene build failed', error)
          setRuntimeError(
            error instanceof Error ? error.message : 'Scene build failed',
          )
          setMode('fallback')
          return
        }
        threeScene.add(result.root)
        mounted = result.root

        // Packet I — broaden the safety net around camera + motion
        // controller setup. buildBasketballGroup is already guarded
        // (failure flips to fallback before anything reaches the scene
        // graph), but a throw inside fitCameraToScene, the
        // CameraController constructor, or the MotionController
        // constructor would previously leave the user staring at a
        // partially-initialized scene with no framing or animation.
        // Catch it, tear the partial mount back down, surface the error
        // to the operator badge, and route to the 2D fallback so the
        // training session keeps progressing.
        try {
          const sizeEl = glRef.current?.domElement
          const aspect =
            sizeEl && sizeEl.clientHeight > 0
              ? sizeEl.clientWidth / sizeEl.clientHeight
              : 1
          if (
            'isPerspectiveCamera' in cam &&
            (cam as THREE.PerspectiveCamera).isPerspectiveCamera
          ) {
            // Initial fit-to-scene so frame zero is correct even if the
            // controller's first tick hasn't run yet.
            fitCameraToScene(cam as THREE.PerspectiveCamera, visibleScene, aspect)
            // Hand the camera over to the controller. It snaps to its
            // current mode's target on the next parent rAF tick, so any
            // delta from fitCameraToScene above is invisible.
            const controller = new CameraController(visibleScene, aspect, CAMERA_FOV)
            controller.setMode(activeCameraMode)
            controller.snapNext()
            cameraControllerRef.current = controller
          }

          // Imperative motion controller — deterministic player + ball
          // playback driven from the same parent rAF loop the camera
          // already rides on. Anchors itself on the next tick so motion
          // begins from the moment the scene appears, not from canvas
          // creation.
          const motion = new MotionController(
            visibleScene,
            replayMode,
            result.players,
            result.ball,
            result.ballBaseY,
          )
          // Replay any non-default playback prop so a scene that mounts
          // with the user already at e.g. 2x or paused honors that state
          // from frame zero. The dedicated effects below handle later
          // changes; this just covers the initial mount race.
          if (playbackRate !== undefined && playbackRate !== 1) {
            motion.setPlaybackRate(playbackRate)
          }
          if (paused) {
            motion.setPaused(true)
          }
          motionControllerRef.current = motion

          // Decoder freeze pipeline. Wire up the state machine when the
          // scene has an authored freeze marker so the train flow can
          // gate its question UI on the `'frozen'` event. Legacy scenes
          // without a freeze marker skip this entirely and continue to
          // emit nothing (their flow doesn't need a freeze edge).
          if (visibleScene.freezeAtMs !== null) {
            const machine = new ReplayStateMachine(motion, visibleScene)
            stateMachineRef.current = machine
            const unsubscribe = machine.subscribe(({ state }) => {
              // ReplayState matches ReplayPhase 1:1 for the values the
              // train flow cares about; cast and forward.
              const next = state as ReplayState as ReplayPhase
              // V1 UX completion — route through the dedup emitter so
              // the JSX controller and the imperative state machine
              // can co-exist under `?simple=0` without firing twice
              // for the same phase. The emitter both updates local
              // state and forwards to the parent's `onPhase`.
              emitPhaseRef.current?.(next)
              // Phase B / B1 — re-apply React-owned playback flags after
              // every state transition. `setMovements` (called by
              // `startConsequence` / `startReplay`) clears `pausedAtT`,
              // so without this re-arm the consequence and replay legs
              // begin playing even when the user paused before picking.
              // `setPaused` is idempotent (early-returns when state
              // matches), so firing on every transition is safe; the
              // initial `idle → setup → playing` chain after
              // `machine.start()` calls `motion.reset()` is also covered
              // here, fixing the mount race where `paused = true` was
              // applied before `start()` then immediately reset.
              //
              // Phase B / B3 — defensively re-apply playbackRate too.
              // The controller preserves its internal rate across
              // `setMovements`, but re-asserting it on every transition
              // closes any drift between the React state and the
              // controller (e.g., if a React-side change ever fired
              // out-of-order with the leg swap). `setPlaybackRate`
              // early-returns when the rate already matches, so this
              // is also a no-op on the happy path.
              const m = motionControllerRef.current
              if (m) {
                m.setPlaybackRate(playbackRateRef.current)
                if (pausedRef.current) m.setPaused(true)
              }
              // Phase B / B4 — flush a buffered pickedChoiceId on the
              // `frozen` transition. Covers the race where the parent
              // forwards a pick before the machine has actually reached
              // `frozen` (e.g., scene rebuild during a fast pick path),
              // which previously silently dropped the pick because the
              // [pickedChoiceId] effect's dep is the prop alone.
              if (state === 'frozen') {
                const pendingId = pendingPickRef.current
                if (
                  pendingId !== null &&
                  consumedChoiceRef.current !== pendingId
                ) {
                  consumedChoiceRef.current = pendingId
                  pendingPickRef.current = null
                  machine.pickChoice(pendingId)
                }
              }
            })
            // Stash the unsubscribe on the ref so the cleanup below
            // can release it without re-importing the listener.
            ;(machine as unknown as { __unsubscribe: () => void }).__unsubscribe = unsubscribe
            machine.start()
          } else {
            stateMachineRef.current = null
          }
          consumedChoiceRef.current = null
          pendingPickRef.current = null
          // V1 UX completion — reset the phase-dedup high-water mark
          // on every scene rebuild so the new scenario's first
          // `idle → setup → playing` chain emits cleanly. Without
          // this, a previous scenario that ended on `'idle'` would
          // suppress the new scenario's first `'idle'` notification.
          lastEmittedPhaseRef.current = null
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('[scenario3d] camera/motion init failed', error)
          threeScene.remove(result.root)
          disposeGroup(result.root)
          mounted = null
          cameraControllerRef.current = null
          motionControllerRef.current = null
          setRuntimeError(
            error instanceof Error ? error.message : 'Scene init failed',
          )
          setMode('fallback')
          return
        }

        // Packet E — imperative teaching overlay. Owns its own GPU
        // resources and attaches itself to the scene root. We honor the
        // current showPaths prop on first mount so a scene that arrives
        // with paths-on does not flicker. The toggle effect below
        // handles subsequent prop flips without rebuilding the scene.
        try {
          const overlay = new TeachingOverlayController(
            visibleScene,
            replayMode,
            result.root,
            { reduced: reducedMotion },
          )
          overlay.setVisible(!!showPaths)
          teachingOverlayRef.current = overlay
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn('[scenario3d] teaching overlay build failed', error)
          teachingOverlayRef.current = null
        }

        // Polish: add a subtle dust-mote field on the high tier only.
        // Built once per scene mount and animated by mutating the
        // existing position buffer in-place — no per-frame mesh
        // recreation, no extra rAF loop. The medium/low tiers skip
        // this entirely so guardrail-throttled devices stay clean.
        if (qualityRef.current.tier === 'high') {
          try {
            const dust = buildDustMotes()
            result.root.add(dust.points)
            dustMotesRef.current = dust
          } catch (error) {
            // eslint-disable-next-line no-console
            console.warn('[scenario3d] dust motes build failed', error)
            dustMotesRef.current = null
          }
          // AAA polish — polished-floor twinkles. Same lifecycle and
          // gating as the dust motes (high tier only, build-once,
          // animate-in-place, dispose-on-unmount).
          try {
            const sparkles = buildFloorSparkles()
            result.root.add(sparkles.points)
            floorSparklesRef.current = sparkles
          } catch (error) {
            // eslint-disable-next-line no-console
            console.warn('[scenario3d] floor sparkles build failed', error)
            floorSparklesRef.current = null
          }
        }

        if (typeof console !== 'undefined') {
          // eslint-disable-next-line no-console
          console.info('[scenario3d] imperative scene mounted', {
            objects: result.root.children.length,
            players: result.players.size,
            sceneId: visibleScene.id,
            cameraMode: activeCameraMode,
            replayMode,
            tier: qualityRef.current.tier,
            dust: dustMotesRef.current !== null,
          })
        }

        // P3.3F — hard assertion. When the GLB gate is on AND the
        // loader cache has resolved with a populated entry (i.e.
        // `glbCacheReadyTick > 0`, the loader bumped it from `then`),
        // every figure decision must be `glb`. If any figure ended up
        // procedural / skinned / premium / force-glb-marker, log a
        // single grep-able `[CourtIQ GLB ERROR]` line so the operator
        // can see the actual reason without reproducing locally. The
        // check runs *after* the scene is mounted and the controllers
        // are wired so it never blocks rendering.
        try {
          const gateOn = isGlbAthletePreviewActive()
          const cacheReady = glbCacheReadyTick > 0
          const decisions = _getPlayerFigureDecisionLog()
          if (gateOn && cacheReady && decisions.length > 0) {
            const offenders = decisions.filter((d) => d.pick !== 'glb')
            if (offenders.length > 0) {
              // eslint-disable-next-line no-console
              console.error(
                '[CourtIQ GLB ERROR] Renderer selected procedural despite GLB ready',
                {
                  totalFigures: decisions.length,
                  glbFigures: decisions.length - offenders.length,
                  offenders,
                  forceGlb,
                  sceneId: visibleScene.id,
                },
              )
            } else {
              // Helpful "we're good" breadcrumb so QA can confirm
              // the path is healthy from the console alone.
              // eslint-disable-next-line no-console
              console.info('[CourtIQ GLB] all figures took GLB path', {
                figures: decisions.length,
                sceneId: visibleScene.id,
              })
            }
          }
        } catch {
          // Diagnostic must never throw and break rendering.
        }
      }
    }

    pollId = window.requestAnimationFrame(tryMount)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(pollId)
      // Tear down the state machine first so its listener stops
      // firing onPhase before motion / overlays disappear.
      const machine = stateMachineRef.current
      if (machine) {
        const off = (machine as unknown as { __unsubscribe?: () => void })
          .__unsubscribe
        if (typeof off === 'function') off()
        stateMachineRef.current = null
      }
      consumedChoiceRef.current = null
      pendingPickRef.current = null
      // Dispose the dust-mote GPU resources before the parent group is
      // disposed. disposeGroup() walks the descendants and frees the
      // points geometry+material, but the canvas-generated alpha map
      // is owned by the DustMotes handle, not by Material.dispose() —
      // so we must call dust.dispose() explicitly to avoid leaking it.
      const dust = dustMotesRef.current
      if (dust) {
        if (dust.points.parent) dust.points.parent.remove(dust.points)
        dust.dispose()
        dustMotesRef.current = null
      }
      // AAA polish — same disposal contract for the polished-floor
      // sparkles handle. Owns its own canvas-generated alphaMap.
      const sparkles = floorSparklesRef.current
      if (sparkles) {
        if (sparkles.points.parent) sparkles.points.parent.remove(sparkles.points)
        sparkles.dispose()
        floorSparklesRef.current = null
      }
      // Packet E — dispose the teaching overlay BEFORE disposeGroup
      // walks the scene root. disposeGroup() would still free the
      // overlay meshes (they are descendants of root) but the controller
      // also owns canvas-generated label textures that are not reached
      // by Material.dispose() alone, so we must release them via the
      // controller's dispose() to avoid leaking.
      const overlay = teachingOverlayRef.current
      if (overlay) {
        overlay.dispose()
        teachingOverlayRef.current = null
      }
      if (mounted) {
        const threeScene = threeSceneRef.current
        if (threeScene) threeScene.remove(mounted)
        disposeGroup(mounted)
        mounted = null
      }
      // Drop the controllers alongside the group so they never point
      // at a stale camera/scene/group.
      cameraControllerRef.current = null
      motionControllerRef.current = null
      // Clear any pending shake so a re-mount does not start with a
      // stale offset from the previous scene's last pass arrival.
      shakeRef.current = null
    }
    // activeCameraMode is intentionally NOT in the dep array — pushing
    // mode changes through a separate effect avoids tearing down and
    // rebuilding the entire scene on every camera switch. The motion
    // controller, in contrast, depends on replayMode (the timeline it
    // resolves changes when mode changes), so replayMode IS a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    visibleScene,
    emergencyMode,
    debugMode,
    simpleMode,
    replayMode,
    // P3.3B — rebuild the imperative scene once the GLB cold-load
    // completes so the very first scenario after a page navigation
    // upgrades from procedural to the GLB mannequin. The load effect
    // bumps this exactly once per canvas mount (when the load
    // resolves with a non-null cache entry); subsequent scene
    // changes happen via `visibleScene` and find the cache already
    // warm, so this dep is a no-op for them.
    glbCacheReadyTick,
  ])

  // Push live camera-mode changes into the existing controller. No
  // scene rebuild — just a target recompute, so the next parent rAF
  // tick eases toward the new framing.
  useEffect(() => {
    const ctrl = cameraControllerRef.current
    if (ctrl) ctrl.setMode(activeCameraMode)
  }, [activeCameraMode])

  // FR-4 Packet 4 — decoder + phase + assist dispatcher.
  //
  // On every (phase, decoder, assist) change, ask the policy layer
  // for the preset it wants and push it into the controller. The
  // controller eases between targets via its existing 180 ms time
  // constant, so a phase transition produces a smooth lerp instead
  // of a cut.
  //
  // §8.6 — manual override wins. The parent (`Scenario3DView`) sets
  // `cameraManualOverride` whenever the dropdown is touched OR the
  // URL `?camera=` carried a value, and clears it on scenario swap
  // so the dispatcher resumes on the next scene.
  //
  // Returns `null` from the dispatcher (e.g. `phase === 'done'`)
  // also leaves the controller alone, so the previous teaching
  // frame holds during the post-decision pause instead of snapping
  // back to broadcast.
  useEffect(() => {
    const ctrl = cameraControllerRef.current
    if (!ctrl) return
    const picked = pickAssistedCameraMode({
      decoder: visibleScene.decoderTag ?? null,
      phase: filmRoomReplayPhase,
      assist: cameraAssist,
      manualOverride: cameraManualOverride,
    })
    if (picked !== null) ctrl.setMode(picked)
  }, [
    visibleScene.decoderTag,
    filmRoomReplayPhase,
    cameraAssist,
    cameraManualOverride,
  ])

  // Push scene-data changes into the controller so follow mode (and
  // auto-fit) update when the scenario swaps players or ball-holder.
  useEffect(() => {
    const ctrl = cameraControllerRef.current
    if (ctrl) ctrl.setScene(visibleScene)
  }, [visibleScene])

  // Decoder pick handoff. When the parent passes a `pickedChoiceId`
  // and the state machine is in `frozen`, dispatch the consequence
  // (or short-circuit to replay) leg. Treated as a one-shot per id —
  // re-renders with the same id are ignored, and a scene swap clears
  // the consumed-id ref so a new scenario's picks fire correctly.
  //
  // Phase B / B4 — when the prop arrives before the machine has reached
  // `frozen` (mount race / fast-pick path), stash the id in
  // `pendingPickRef` instead of dropping it. The state-machine
  // subscriber flushes the buffer on the `frozen` transition.
  useEffect(() => {
    if (!pickedChoiceId) return
    if (consumedChoiceRef.current === pickedChoiceId) return
    const machine = stateMachineRef.current
    if (!machine) {
      // No machine yet (legacy scene without a freeze marker, or
      // pre-mount race). Buffer; if a machine ever appears later, the
      // subscriber will flush on `frozen`.
      pendingPickRef.current = pickedChoiceId
      return
    }
    if (machine.getSnapshot().state !== 'frozen') {
      pendingPickRef.current = pickedChoiceId
      return
    }
    consumedChoiceRef.current = pickedChoiceId
    pendingPickRef.current = null
    machine.pickChoice(pickedChoiceId)
  }, [pickedChoiceId])

  // External replay reset: when the parent bumps resetCounter, drop
  // the motion controller's playback anchor so the timeline restarts
  // from t=0 on the next parent rAF tick. The scene rebuild path
  // already covers scene/mode changes, so this handles the
  // "play again" button case without remounting the geometry.
  //
  // Phase B / B2 — state-aware dispatch. From `done`, route through
  // `ReplayStateMachine.showAgain()` so the machine cycles
  // `done → replaying → done` and re-emits its listener snapshot
  // (driving captions, phase tracker, and onPhase consumers). For all
  // other states, `motion.reset()` rewinds the currently active leg
  // (intro / consequence / answer demo) — the same behavior callers
  // had before Phase B. Legacy scenes without a state machine fall
  // through to the simple motion reset.
  useEffect(() => {
    const machine = stateMachineRef.current
    if (machine && machine.getSnapshot().state === 'done') {
      machine.showAgain()
    } else {
      motionControllerRef.current?.reset()
    }
  }, [resetCounter])

  // Push playback-rate / pause changes into the existing motion
  // controller. No scene rebuild — setPlaybackRate rebases startedAt
  // so the currently visible t does not jump. Defaults preserve the
  // pre-Packet-12 behavior when callers omit the new props.
  useEffect(() => {
    playbackRateRef.current = playbackRate ?? 1
    motionControllerRef.current?.setPlaybackRate(playbackRate ?? 1)
  }, [playbackRate])

  useEffect(() => {
    pausedRef.current = paused ?? false
    motionControllerRef.current?.setPaused(paused ?? false)
  }, [paused])

  // Packet E — flip teaching overlay visibility on showPaths changes
  // without rebuilding the overlay group. The controller toggles
  // group.visible internally, so this is O(1).
  useEffect(() => {
    teachingOverlayRef.current?.setVisible(!!showPaths)
  }, [showPaths])

  // Fullscreen cannot be represented by passing `height={undefined}`:
  // the prop's normal default height also uses `undefined`. Keep the
  // two states explicit so embedded callers still default to 320px
  // while fullscreen reliably fills its parent.
  const resolvedHeight: number | string = fillParent ? '100%' : height ?? 320

  if (mode === 'probing') {
    return (
      <div
        className={className}
        style={{ height: resolvedHeight, background: '#3F4756', minHeight: resolvedHeight, position: 'relative' }}
        aria-busy="true"
      >
        <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-[1.5px] text-text-dim">
          Loading court…
        </div>
        <CanvasDiagnostics
          canvasMounted={canvasMounted}
          rendererCreated={rendererCreated}
          webglSupported={webglSupported}
          scenarioId={scene?.id}
          concept={concept}
          validationStatus={sceneValidationStatus}
          errorMessage={runtimeError}
          debugMode={debugMode}
          playerCount={visibleScene.players.length}
          width={canvasSize?.width}
          height={canvasSize?.height}
        />
      </div>
    )
  }

  if (mode === 'fallback') {
    // Two distinct fallback reasons: WebGL is genuinely unavailable
    // (very old browsers, hardware acceleration disabled), or the 3D
    // setup raised at runtime (context lost, onCreated threw). The
    // user-visible chip differentiates them so a player on a working
    // browser sees a clear "3D unavailable" badge instead of silently
    // sliding into a degraded 2D experience.
    const fallbackReason: 'no-webgl' | 'runtime-error' = runtimeError
      ? 'runtime-error'
      : 'no-webgl'
    return (
      <div className={className} style={{ position: 'relative', height: resolvedHeight, minHeight: resolvedHeight }}>
        {fallback}
        <FallbackBadge reason={fallbackReason} message={runtimeError} />
        <CanvasDiagnostics
          canvasMounted={canvasMounted}
          rendererCreated={rendererCreated}
          webglSupported={webglSupported}
          scenarioId={scene?.id}
          concept={concept}
          validationStatus={sceneValidationStatus}
          errorMessage={runtimeError}
          debugMode={debugMode}
          playerCount={visibleScene.players.length}
          width={canvasSize?.width}
          height={canvasSize?.height}
        />
      </div>
    )
  }

  // Emergency wins if active. Otherwise debug. Otherwise production.
  const cameraPosition = emergencyMode
    ? EMERGENCY_CAMERA_POSITION
    : debugMode
      ? DEBUG_CAMERA_POSITION
      : CAMERA_POSITION
  const cameraLookAt = emergencyMode
    ? EMERGENCY_CAMERA_LOOKAT
    : debugMode
      ? DEBUG_CAMERA_LOOKAT
      : CAMERA_LOOKAT
  const cameraFov = emergencyMode
    ? EMERGENCY_CAMERA_FOV
    : debugMode
      ? DEBUG_CAMERA_FOV
      : CAMERA_FOV
  const activeBg = emergencyMode ? EMERGENCY_BG : CANVAS_BG
  // True when the imperative CameraController is the rightful owner of
  // camera framing — same gate as the imperative-scene mount effect.
  const controllerActive = !emergencyMode && !debugMode && simpleMode

  // Phase K — when the outer view is in fullscreen mode it sets
  // `fillParent` on the canvas so this wrapper fills the
  // fullscreen element. The `data-fullscreen-fill` hook lets the
  // global :fullscreen CSS lock the wrapper to 100% / 100% even when
  // a stale parent constraint would otherwise collapse it back to a
  // narrow band.
  const fillFullscreen = fillParent
  return (
    <div
      ref={containerRef}
      className={className}
      data-fullscreen-fill={fillFullscreen ? 'true' : undefined}
      style={{
        height: resolvedHeight,
        minHeight: resolvedHeight,
        width: '100%',
        position: 'relative',
        background: activeBg,
        display: 'block',
        overflow: 'hidden',
      }}
    >
      <Canvas
        // Tone mapping is set explicitly in onCreated (ACES Filmic +
        // tuned exposure) so the lit gym shell, hoop, and players get
        // proper PBR rolloff. Every MeshBasicMaterial in the scenario3d
        // tree opts out of tone mapping via `toneMapped={false}`, so
        // the floor, paint, lines, and motion paths still render at
        // the literal sRGB color we set — they are unaffected by the
        // ACES curve.
        // Production trainer scenes are rendered by the parent
        // imperative rAF loop below. Keep R3F in demand mode there so
        // it can do the first paint / setup work without also rendering
        // continuously on top of the parent loop. Debug, emergency, and
        // the explicit `?simple=0` diagnostic path keep R3F's default
        // always-on scheduler because they still depend on Canvas
        // children as their primary scene graph.
        frameloop={controllerActive ? 'demand' : 'always'}
        dpr={[1, qualitySettings.maxPixelRatio]}
        camera={{ position: cameraPosition, fov: cameraFov, near: 0.1, far: 1000 }}
        gl={{
          antialias: qualitySettings.antialias,
          alpha: false,
          powerPreference:
            qualitySettings.tier === 'low' ? 'low-power' : 'high-performance',
        }}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onCreated={({ gl, size, scene: createdScene, camera: createdCamera }) => {
          try {
            gl.setClearColor(activeBg, 1)

            // Packet C — exposure / lighting / brightness.
            // ACES Filmic tone mapping gives the lit MeshStandard
            // materials (gym shell, hoop, players) film-like highlight
            // rolloff and lifted midtones, instead of the flat clipped
            // look the previous `flat` Canvas prop produced. Exposure
            // is tuned a hair above 1 so the mid-gray gym walls read
            // as a real lit room rather than crushed shadow.
            gl.toneMapping = THREE.ACESFilmicToneMapping
            // AAA polish — exposure bumped 1.18 → 1.24 for a richer
            // broadcast feel. The lit gym shell, hoop, and players
            // get more highlight rolloff without crushing the warm
            // hardwood mid-tones, since the MeshBasic floor/lines
            // opt out of tone mapping. Stays well below clipping on
            // the rim emissive + court-spot shimmer multiplier
            // peaks (rim base 0.32 * 1.22 max ≈ 0.39 emissive).
            gl.toneMappingExposure = 1.24
            // Output color space — explicit to survive future Three.js
            // default changes. SRGB matches the textures + DOM.
            gl.outputColorSpace = THREE.SRGBColorSpace

            const dom = gl.domElement
            if (dom) {
              dom.addEventListener(
                'webglcontextlost',
                (event) => {
                  event.preventDefault()
                  setRuntimeError('WebGL context was lost')
                  setMode('fallback')
                },
                { once: true },
              )
            }
            setRendererCreated(true)
            setCanvasMounted(true)
            setCanvasSize({ width: size.width, height: size.height })
            try {
              setDpr(gl.getPixelRatio())
            } catch {
              setDpr(null)
            }

            // Capture refs so the parent-level rAF loop can drive
            // gl.render even when R3F's reconciler never mounts the
            // Canvas children (in which case the Canvas-child
            // RenderHeartbeat component would never run either).
            glRef.current = gl as THREE.WebGLRenderer
            threeSceneRef.current = createdScene as THREE.Scene
            threeCameraRef.current = createdCamera as THREE.Camera

            // Set scene.background imperatively — <color attach="background">
            // is also a reconciler-dependent Canvas child, so we cannot rely
            // on it.
            ;(createdScene as THREE.Scene).background = new THREE.Color(activeBg)

            // V4-C — Atmospheric depth fog. Linear fog with the
            // background tint, near=80ft / far=180ft, so close-up
            // players (camera typically 35-70 ft from the action)
            // remain crisp while distant gym walls and bleachers
            // gain a soft falloff. This gives the fullscreen
            // composition real depth and removes the "isolated
            // primitives floating in dark" feel without affecting
            // teaching readability.
            ;(createdScene as THREE.Scene).fog = new THREE.Fog(
              activeBg,
              80,
              180,
            )

            // CRITICAL: aim the camera before the first render. The
            // declarative `camera={{ position }}` prop only sets
            // position — no lookAt — so the default camera stares flat
            // toward -Z from y=50, missing all geometry which sits at
            // y=0..8 below. <CameraTarget> / <AutoFitCamera> set lookAt
            // via useEffect, but those effects fire AFTER the first
            // next scheduled render paints. Aiming here guarantees the
            // very first frame is correct, independent of React.
            const cam = createdCamera as THREE.PerspectiveCamera
            cam.position.set(cameraPosition[0], cameraPosition[1], cameraPosition[2])
            cam.lookAt(cameraLookAt[0], cameraLookAt[1], cameraLookAt[2])
            cam.updateMatrixWorld()
            cam.updateProjectionMatrix()

            // Force one explicit render now so the very first frame
            // shows geometry, even if the scheduler is broken.
            try {
              gl.render(createdScene as THREE.Scene, cam)
            } catch (e) {
              if (typeof console !== 'undefined') {
                // eslint-disable-next-line no-console
                console.error('[scenario3d] explicit first-frame render failed', e)
              }
            }

            if (typeof console !== 'undefined') {
              // eslint-disable-next-line no-console
              console.info('[scenario3d] canvas onCreated', {
                width: size.width,
                height: size.height,
                debugMode,
                emergencyMode,
                children: (createdScene as THREE.Scene).children.length,
                camPos: cam.position.toArray(),
                camLookAt: cameraLookAt,
              })
            }
          } catch (error) {
            setRuntimeError(error instanceof Error ? error.message : 'Unknown WebGL error')
            setMode('fallback')
          }
        }}
      >
        <color attach="background" args={[activeBg]} />
        {orbitMode ? (
          <OrbitDebugControls
            target={[cameraLookAt[0], cameraLookAt[1], cameraLookAt[2]]}
          />
        ) : controllerActive ? (
          // The imperative CameraController owns framing here, so the
          // JSX AutoFitCamera / CameraTarget paths stay out of the way
          // to avoid two systems writing the same camera per frame.
          null
        ) : autoFitMode && !emergencyMode && !debugMode ? (
          <AutoFitCamera scene={visibleScene} />
        ) : (
          <CameraTarget
            position={cameraPosition}
            lookAt={cameraLookAt}
            enableSway={!debugMode && !emergencyMode && !reducedMotion}
          />
        )}
        <CameraDiagnosticsProbe onChange={setCameraStats} />
        {controllerActive ? null : <RenderHeartbeat />}

        {emergencyMode ? (
          <EmergencyScene3D />
        ) : debugMode ? (
          <Debug3DScene />
        ) : simpleMode ? (
          // Production uses the imperative scene mounted above. Leaving
          // the old primitive JSX scene mounted here doubles the
          // geometry and makes toy-like cylinder players overlap the
          // upgraded athletes when R3F reconciles successfully.
          null
        ) : (
          <SceneMotionProvider reduced={reducedMotion}>
            <SceneLighting />
            <Court3D />
            <ScenarioScene3D
              key={visibleScene.id}
              scene={visibleScene}
              mode={replayMode}
              resetCounter={resetCounter}
              onCaption={onCaption}
              onPhase={(p) => {
                // V1 UX completion — route through the dedup emitter
                // so a JSX-emitted phase that happens to match the
                // most recent imperative state-machine emission is
                // collapsed instead of double-firing the bridge.
                emitPhaseRef.current?.(p)
              }}
              showPaths={showPaths}
              pickedChoiceId={pickedChoiceId}
              overlayLevel={overlayLevel}
            />
            <Suspense fallback={null}>{children}</Suspense>
            <SceneDebug3D scene={visibleScene} />
          </SceneMotionProvider>
        )}
      </Canvas>

      {/* AAA polish — cinematic vignette overlay. A radial transparent-to-
          dark gradient sits over the canvas via DOM so the corners of
          the frame fade into a soft falloff. Pure CSS so the cost is
          a single composited layer; no WebGL post-processing pass.
          Pointer-events disabled so any in-canvas / overlay
          interactions still pass through. Skipped when the scene is
          mounted in debug/emergency mode so QA can see the raw
          canvas. */}
      {!emergencyMode && !debugMode ? (
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.22) 88%, rgba(0,0,0,0.42) 100%)',
            mixBlendMode: 'multiply',
            zIndex: 1,
          }}
        />
      ) : null}

      <CanvasDiagnostics
        canvasMounted={canvasMounted}
        rendererCreated={rendererCreated}
        webglSupported={webglSupported}
        scenarioId={scene?.id}
        concept={concept}
        validationStatus={sceneValidationStatus}
        errorMessage={runtimeError}
        debugMode={debugMode}
        emergencyMode={emergencyMode}
        playerCount={visibleScene.players.length}
        width={canvasSize?.width}
        height={canvasSize?.height}
        dpr={dpr}
        cameraStats={cameraStats}
        parentLoopStats={parentLoopStats}
      />

      {debugMode ? (
        <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-brand/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[1.5px] text-brand">
          debug3d self-test
        </div>
      ) : null}
      {emergencyMode ? (
        <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-yellow-400/25 px-2 py-1 text-[10px] font-bold uppercase tracking-[1.5px] text-yellow-300">
          emergency render
        </div>
      ) : null}
      {/* FR-2 Packet 6 — `?forceGlb=1` waiting hint. Mounts only when
          the developer flag is on AND the imperative scene-build effect
          is still deferred behind the cold-cache load (tick === 0).
          Disappears the instant the load settles. Production users
          never see this overlay because the URL flag is dev-only. */}
      {forceGlb && glbCacheReadyTick === 0 ? (
        <div
          data-force-glb-waiting="1"
          className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-fuchsia-500/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[1.5px] text-white shadow-lg"
          style={{ zIndex: 50 }}
        >
          forceGlb waiting for asset…
        </div>
      ) : null}
      {/* P3.3C — production-route GLB debug badge. Mounts only when
          `?glbDebug=1` is on the URL or `window.__COURTIQ_GLB_DEBUG__`
          was set from the console; otherwise stays unmounted so prod
          users never load the asset probes. */}
      {glbDebugEnabled ? <GlbDebugBadge /> : null}
      {/* FR-1 Packet 6 — film-room teaching-state badge. Mounts only
          when `?debugFilmRoom=1` or `window.__COURTIQ_FILM_ROOM_DEBUG__`
          is set. Production users without either flag never render
          this component; no asset probes, no behaviour changes. */}
      {filmRoomDebugEnabled ? (
        <FilmRoomDebugBadge
          scene={scene}
          cameraMode={activeCameraMode}
          replayPhase={filmRoomReplayPhase}
          concept={concept}
          cameraAssist={cameraAssist}
          cameraManualOverride={cameraManualOverride}
          overlayLevel={overlayLevel}
          // V1 Premiumization — `height === undefined` is set by
          // Scenario3DView when the outer wrapper is in fullscreen.
          // The badge uses this signal to relocate from bottom-right
          // (which collides with the transport pill + choice overlay)
          // to top-left, where every interactive cluster gives it a
          // wide berth.
          isFullscreen={fillFullscreen}
        />
      ) : null}
    </div>
  )
}

interface CameraStats {
  position: [number, number, number]
  fov: number
  childCount: number
  firstChildKind: string | null
  firstChildPosition: [number, number, number] | null
}

interface CanvasDiagnosticsProps {
  canvasMounted: boolean
  rendererCreated: boolean
  webglSupported: boolean | null
  scenarioId?: string
  concept?: string
  validationStatus: string
  errorMessage: string | null
  debugMode: boolean
  emergencyMode?: boolean
  playerCount: number
  width?: number
  height?: number
  dpr?: number | null
  cameraStats?: CameraStats | null
  parentLoopStats?: { frames: number; children: number } | null
}

function CanvasDiagnostics({
  canvasMounted,
  rendererCreated,
  webglSupported,
  scenarioId,
  concept,
  validationStatus,
  errorMessage,
  debugMode,
  emergencyMode,
  playerCount,
  width,
  height,
  dpr,
  cameraStats,
  parentLoopStats,
}: CanvasDiagnosticsProps) {
  // Diagnostics overlay: HIDDEN BY DEFAULT now that the imperative
  // scene has been confirmed reliable in production. Pass ?debug=1
  // to surface the renderer telemetry when investigating an issue.
  // Errors still render unconditionally below so users see actual
  // failures even when the panel is hidden.
  let hideOverlay = true
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search)
      hideOverlay = params.get('debug') !== '1' && params.get('nodebug') !== '0'
    } catch {
      hideOverlay = true
    }
  }

  if (errorMessage) {
    return (
      <div className="pointer-events-none absolute bottom-2 left-2 max-w-[92%] rounded-lg bg-red-900/80 px-2 py-1 font-mono text-[10px] leading-snug text-white">
        scene error: {errorMessage}
      </div>
    )
  }

  if (hideOverlay) return null

  const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '–')
  const renderMode = emergencyMode
    ? 'emergency'
    : debugMode
      ? 'debug self-test'
      : 'scenario'

  return (
    <div className="pointer-events-none absolute bottom-2 left-2 max-w-[60%] rounded-lg bg-black/75 px-2 py-1 font-mono text-[9px] leading-snug text-white/85">
      <div>canvas mounted: {canvasMounted ? 'yes' : 'no'}</div>
      <div>renderer created: {rendererCreated ? 'yes' : 'no'}</div>
      <div>webgl: {webglSupported === null ? 'checking' : webglSupported ? 'yes' : 'no'}</div>
      <div>size: {width ?? '–'}×{height ?? '–'} @ dpr {dpr ?? '–'}</div>
      <div>mode: {renderMode}</div>
      <div>players: {playerCount}</div>
      <div>scene: {validationStatus}</div>
      <div>scenario: {scenarioId ?? 'none'}</div>
      {concept ? <div>concept: {concept}</div> : null}
      <div>
        parent loop: {parentLoopStats ? `${parentLoopStats.frames}f` : 'idle'} /
        children: {parentLoopStats ? parentLoopStats.children : '–'}
      </div>
      {cameraStats ? (
        <>
          <div>
            cam: {fmt(cameraStats.position[0])}, {fmt(cameraStats.position[1])},{' '}
            {fmt(cameraStats.position[2])} @ fov {fmt(cameraStats.fov)}
          </div>
          <div>
            children: {cameraStats.childCount} / first:{' '}
            {cameraStats.firstChildKind ?? '–'}
            {cameraStats.firstChildPosition
              ? ` (${fmt(cameraStats.firstChildPosition[0])}, ${fmt(
                  cameraStats.firstChildPosition[1],
                )}, ${fmt(cameraStats.firstChildPosition[2])})`
              : ''}
          </div>
        </>
      ) : null}
    </div>
  )
}

/**
 * Always-visible chip surfaced when the canvas is in fallback mode so
 * users (and Sentry-watching engineers) immediately see why the 2D
 * court is showing instead of the 3D scene. Distinct copy for the
 * "WebGL not available on this device" path vs the "3D scene crashed at
 * runtime" path so the chip carries diagnostic value without being
 * alarming for users on legitimately-old browsers.
 */
function FallbackBadge({
  reason,
  message,
}: {
  reason: 'no-webgl' | 'runtime-error'
  message: string | null
}) {
  const label = reason === 'no-webgl' ? '2D mode' : '3D unavailable'
  const detail =
    reason === 'no-webgl'
      ? 'WebGL not supported on this device'
      : message ?? 'Scene failed to load'
  const accent =
    reason === 'no-webgl' ? 'border-white/15 text-white/85' : 'border-heat/50 text-heat'
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none absolute right-2 top-2 max-w-[80%] rounded-full border bg-black/70 px-3 py-1 text-[10px] font-bold uppercase tracking-[1.5px] backdrop-blur-md ${accent}`}
      title={detail}
    >
      <span className="mr-1">●</span>
      {label}
    </div>
  )
}

function getSceneValidationStatus(
  visibleScene: Scene3D,
  inputScene: Scene3D | null | undefined,
  debugMode: boolean,
): string {
  if (debugMode) return 'debug self-test'
  if (!inputScene) return 'missing input, using default'

  const hasPlayers = visibleScene.players.length > 0
  const hasFinitePlayers = visibleScene.players.every(
    (player) => Number.isFinite(player.start.x) && Number.isFinite(player.start.z),
  )
  const ballIsFinite =
    Number.isFinite(visibleScene.ball.start.x) && Number.isFinite(visibleScene.ball.start.z)

  if (hasPlayers && hasFinitePlayers && ballIsFinite) return 'valid'
  return 'invalid, using safe values'
}

/**
 * Minimal lighting rig. Every visibility-critical surface uses
 * meshBasicMaterial (unlit), so lighting here is purely decorative and
 * cannot make the scene go black. We keep a bright ambient + hemisphere
 * fill so any future lit material (e.g. backboard) still renders well.
 *
 * AAA polish — added a warm directional key and a cool back rim so any
 * lit material (PBR glass, rim metalness, padded posts) catches a real
 * three-light setup instead of flat fill. Pure scene-graph additions,
 * no extra textures.
 */
function SceneLighting() {
  return (
    <>
      <ambientLight intensity={1.05} color="#FFF1E0" />
      <hemisphereLight args={['#D7E2F4', '#1A1408', 0.55]} />
      {/* AAA polish — warm broadcast key, cool back rim. */}
      <directionalLight intensity={0.85} color="#FFF1D6" position={[20, 38, 24]} />
      <directionalLight intensity={0.45} color="#C6DCFF" position={[0, 32, -22]} />
    </>
  )
}

interface CameraTargetProps {
  position: [number, number, number]
  lookAt: [number, number, number]
  enableSway?: boolean
}

/**
 * Locks the camera to a broadcast frame every render. Optionally adds an
 * extremely subtle horizontal sway inside the R3F render loop so the scene
 * doesn't feel statically posed.
 */
/**
 * Lives inside the <Canvas> and pushes camera + scene-graph snapshots back
 * to the parent every ~250ms via a state-setter callback. Throttled so the
 * React tree doesn't re-render every frame.
 */
function CameraDiagnosticsProbe({
  onChange,
}: {
  onChange: (stats: CameraStats) => void
}) {
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const lastEmit = useRef(0)

  useFrame(() => {
    const now = performance.now()
    if (now - lastEmit.current < 250) return
    lastEmit.current = now

    const cam = camera as THREE.PerspectiveCamera
    const children = scene.children
    let firstObjectKind: string | null = null
    let firstObjectPos: [number, number, number] | null = null
    for (const child of children) {
      if (child.type === 'AmbientLight' || child.type === 'DirectionalLight' ||
          child.type === 'HemisphereLight' || child.type === 'PerspectiveCamera') {
        continue
      }
      firstObjectKind = child.type
      firstObjectPos = [child.position.x, child.position.y, child.position.z]
      break
    }

    onChange({
      position: [cam.position.x, cam.position.y, cam.position.z],
      fov: 'fov' in cam ? (cam.fov as number) : NaN,
      childCount: children.length,
      firstChildKind: firstObjectKind,
      firstChildPosition: firstObjectPos,
    })
  })

  return null
}

/**
 * Belt-and-suspenders render driver for debug / emergency / explicit
 * diagnostic Canvas-child paths. Even with `frameloop="always"`, on
 * some environments (specific R3F + React 19 + Next 15 builds, or when
 * Next's chunking ends up with two R3F instances after a dynamic import)
 * the default scheduler does not actually paint, leaving the canvas
 * black despite the renderer being created and the bg color set.
 *
 * This component sets up its own `requestAnimationFrame` loop in a
 * `useEffect` and imperatively calls `gl.render(scene, camera)` plus
 * `camera.updateMatrixWorld()` every frame. It is fully independent of
 * `useFrame` subscribers, so it paints even when those are dead. If R3F
 * is also painting, these diagnostic paths may render twice per frame.
 * The production imperative trainer path disables this heartbeat and
 * uses the parent rAF loop only.
 *
 * Logs a heartbeat to the console every 60 frames so we can confirm
 * from any browser session that frames are actually being driven.
 */
function RenderHeartbeat() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    if (typeof window === 'undefined') return
    let rafId = 0
    let running = true
    let frame = 0
    const tick = () => {
      if (!running) return
      try {
        camera.updateMatrixWorld()
        gl.render(scene, camera)
        frame++
        if (frame === 1 || frame % 60 === 0) {
          // eslint-disable-next-line no-console
          console.info('[scenario3d] heartbeat frame', frame, {
            children: scene.children.length,
            camPos: camera.position.toArray(),
          })
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[scenario3d] heartbeat error', error)
      }
      rafId = window.requestAnimationFrame(tick)
    }
    rafId = window.requestAnimationFrame(tick)
    return () => {
      running = false
      window.cancelAnimationFrame(rafId)
    }
  }, [gl, scene, camera])

  return null
}

function CameraTarget({ position, lookAt, enableSway = false }: CameraTargetProps) {
  const camera = useThree((state) => state.camera)
  const target = useMemo(() => new THREE.Vector3(...lookAt), [lookAt])
  const baseX = position[0]

  useEffect(() => {
    camera.position.set(position[0], position[1], position[2])
    camera.lookAt(target)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
  }, [camera, position, target])

  useFrame((state) => {
    if (!enableSway) return
    const sway = Math.sin(state.clock.getElapsedTime() * 0.18) * 0.55
    camera.position.x = baseX + sway
    camera.lookAt(target)
  })

  return null
}


export type { Scene3D, ReplayMode, ReplayPhase }
