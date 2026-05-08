'use client'

import { useEffect, useState } from 'react'
import {
  _getPlayerFigureDecisionLog,
  isGlbAthletePreviewActive,
  isImportedBackCutClipActive,
  isImportedCloseoutClipActive,
  type PlayerFigureDecision,
} from './imperativeScene'
import { summarisePlayerFigureDecisions } from './GlbDebugBadge'
import {
  getGlbStaticPoseFallbackStats,
  type GlbStaticPoseFallbackStats,
} from './glbAthlete'
import type { Scene3D } from '@/lib/scenario3d/scene'
import type { ReplayPhase } from './ScenarioReplayController'
import {
  pickAssistedCameraMode,
  type AssistedCameraMode,
  type CameraAssist,
} from '@/lib/scenario3d/cameraPresets'
import {
  applyOverlayLevel,
  isOverlaySuppressed,
  type OverlayLevel,
} from '@/lib/scenario3d/overlayLevel'
import { getDecoderTeachingLabel } from '@/lib/scenario3d/replayTeachingTimeline'
import {
  FramePacingTracker,
  type FramePacingSummary,
} from '@/lib/scenario3d/framePacing'

/**
 * FR-1 Packet 6 — film-room teaching-state debug badge.
 *
 * Sister to `GlbDebugBadge`. Where that one reports asset state
 * (env flags, gate booleans, HEAD probes, GLTFLoader result), this
 * one reports *teaching state*: which scenario is in the canvas,
 * what decoder it belongs to, what camera mode is active, where
 * the replay machine currently is, what the figure-render summary
 * looks like.
 *
 * Mount gating mirrors `GlbDebugBadge`:
 *   - URL param `?debugFilmRoom=1`, OR
 *   - `window.__COURTIQ_FILM_ROOM_DEBUG__ === true` (long-lived
 *     opt-in from DevTools that survives same-tab navigations).
 *
 * Both gates are evaluated client-side after mount, so a production
 * user without either flag never causes this component to render.
 *
 * READ-ONLY contract: the badge only consumes already-exported
 * renderer state. It never mutates the canvas, the controller, or
 * the figure builder. Adding a field here never touches the
 * renderer.
 */
interface FilmRoomDebugBadgeProps {
  scene?: Scene3D | null
  cameraMode: string
  replayPhase: ReplayPhase
  /** Friendly concept / decoder summary already present at the canvas
   *  layer. Falls back to scene.decoderTag when absent. */
  concept?: string
  /** FR-4 §8.9 — currently active cameraAssist tier. Surfaced so QA
   *  can confirm `/dev/scenario-preview` is on `'full'` while
   *  `/train` is on `'partial'`. */
  cameraAssist?: CameraAssist
  /** FR-4 §8.6 — true when the dispatcher is standing aside because
   *  the user took manual control. The badge marks the
   *  decoder-target row with `(override)` so QA understands why
   *  the active mode does not match the predicted preset. */
  cameraManualOverride?: boolean
  /** FR-5 §9.2 — currently active overlayLevel. Surfaced so QA can
   *  see which Pathways mode the renderer is reading. */
  overlayLevel?: OverlayLevel
  /** V1 Premiumization — when true the badge moves out of the
   *  bottom-right corner so it does not collide with the fullscreen
   *  choice overlay or the centered transport pill on short
   *  mobile-landscape viewports. Top-left in fullscreen sits clear
   *  of every interactive cluster (concept chip is hidden when the
   *  scene has no `concept` prop, and dev/scenario-preview always
   *  passes a concept so the chip is visible — the badge stays
   *  beneath the chip via the `top-9` offset). */
  isFullscreen?: boolean
}

export function isFilmRoomDebugBadgeEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('debugFilmRoom') === '1') return true
  } catch {
    // ignore — malformed URL is treated as "off"
  }
  const w = window as unknown as Record<string, unknown>
  return w['__COURTIQ_FILM_ROOM_DEBUG__'] === true
}

export function FilmRoomDebugBadge({
  scene,
  cameraMode,
  replayPhase,
  concept,
  cameraAssist,
  cameraManualOverride,
  overlayLevel,
  isFullscreen,
}: FilmRoomDebugBadgeProps) {
  // V1 UX completion — the badge previously hard-anchored to
  // top-right which collided with PremiumOverlay's camera selector +
  // paths toggle cluster (also top-right). Default the badge to a
  // collapsed pill at bottom-right so it sits cleanly above the
  // GlbDebugBadge (bottom-left) without crossing the camera-selector
  // zone. Operators can expand to the full readout via the click
  // header. Persist the expand state in `sessionStorage` so a refresh
  // mid-debug doesn't snap the badge closed mid-task.
  const [expanded, setExpanded] = useState<boolean>(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = window.sessionStorage.getItem(
        'courtiq.filmRoomDebugBadge.expanded',
      )
      if (saved === '1') setExpanded(true)
    } catch {
      // sessionStorage may be unavailable in private mode — ignore.
    }
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(
        'courtiq.filmRoomDebugBadge.expanded',
        expanded ? '1' : '0',
      )
    } catch {
      // ignore
    }
  }, [expanded])
  const [decisions, setDecisions] = useState<readonly PlayerFigureDecision[]>(
    [],
  )
  const [gates, setGates] = useState({
    glb: false,
    closeout: false,
    backCut: false,
  })
  // FR-2 Packet 3 — surface "GLB + static pose" fallback counts so
  // QA can see when the renderer is teaching with a still athlete
  // because the resolver-picked clip was missing.
  const [staticPose, setStaticPose] = useState<GlbStaticPoseFallbackStats>({
    total: 0,
    toIdleReady: 0,
    toBindPose: 0,
    lastMissingClip: null,
  })

  // V2-H — frame pacing summary, polled at the same 500ms cadence so
  // QA can see p50 / p95 / max alongside the existing FR-1..FR-6
  // metrics without spinning up a separate debug overlay. The
  // tracker lives on `window.__COURTIQ_FRAME_PACING__` (Scenario3DCanvas
  // attaches it inside its rAF effect); when the canvas isn't
  // mounted we get null and render zeros, never NaN.
  const [framePacing, setFramePacing] = useState<FramePacingSummary | null>(
    null,
  )

  // Poll the figure-decision log + gate booleans every 500 ms, matching
  // the GlbDebugBadge cadence. Cheap: we only mount under the flag.
  useEffect(() => {
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      setDecisions([..._getPlayerFigureDecisionLog()])
      setGates({
        glb: isGlbAthletePreviewActive(),
        closeout: isImportedCloseoutClipActive(),
        backCut: isImportedBackCutClipActive(),
      })
      setStaticPose({ ...getGlbStaticPoseFallbackStats() })
      // V2-H — pull the latest pacing snapshot. Treat the global as
      // possibly missing so a remounted canvas after a quality
      // downgrade doesn't crash the badge.
      const tracker = (window as unknown as {
        __COURTIQ_FRAME_PACING__?: FramePacingTracker
      }).__COURTIQ_FRAME_PACING__
      if (tracker) {
        setFramePacing(tracker.summary())
      } else {
        setFramePacing(null)
      }
    }
    tick()
    const id = window.setInterval(tick, 500)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const summary = summarisePlayerFigureDecisions(decisions)
  const proceduralCount = decisions.filter((d) => d.pick === 'procedural')
    .length
  const glbCount = decisions.filter((d) => d.pick === 'glb').length
  // FR-3 Packet 7 — surface the resolved key defender so QA can
  // confirm the §7.3 heat-ring landed on the right figure without
  // squinting at the floor cue. The figure-decision log carries
  // `isKeyDefender` per push (FR-3 Packet 7 also stamps the
  // procedural / premium / GLB / skinned / force-glb-marker rows
  // with the same flag) so the badge does not need to re-run the
  // closest-defender heuristic itself.
  const keyDefender = decisions.find((d) => d.isKeyDefender === true) ?? null

  const decoder = scene?.decoderTag ?? '—'
  const sceneId = scene?.id ?? '—'
  // FR-4 Packet 7 — recompute the dispatcher's pick from the same
  // pure inputs the canvas uses. Lets QA see what the preset *would
  // be* even when the manual override stops the canvas from
  // applying it.
  const dispatcherTarget: AssistedCameraMode | null = pickAssistedCameraMode({
    decoder: scene?.decoderTag ?? null,
    phase: replayPhase,
    assist: cameraAssist ?? 'partial',
    manualOverride: false,
  })
  const freezeAt =
    typeof scene?.freezeAtMs === 'number'
      ? `${scene.freezeAtMs}ms`
      : '—'
  const preCount = scene?.preAnswerOverlays?.length ?? 0
  const postCount = scene?.postAnswerOverlays?.length ?? 0

  // FR-5 — re-derive what the renderer is actually mounting under the
  // active level so the badge surfaces post-filter counts (and any
  // primitives the filter dropped). This mirrors the projection
  // `AuthoredOverlayBridge` runs at mount time; it never mutates the
  // scene.
  const effectiveLevel: OverlayLevel = overlayLevel ?? 'beginner'
  const filtered = scene
    ? applyOverlayLevel({
        preAnswer: scene.preAnswerOverlays ?? [],
        postAnswer: scene.postAnswerOverlays ?? [],
        level: effectiveLevel,
      })
    : { preAnswer: [], postAnswer: [], droppedPre: 0, droppedPost: 0, level: effectiveLevel }
  const suppressed = isOverlaySuppressed(effectiveLevel)
  // Pack 2 (3.1.2) — when the scene authors `consequenceOverlays` and
  // the controller is in the `consequence` state, the bridge mounts
  // the consequence overlay set rather than the post-answer set. The
  // badge surfaces that distinct count so debug viewers see what's
  // actually on screen.
  const consequenceCount: number = scene?.consequenceOverlays?.length ?? 0
  const phaseStaged: number =
    replayPhase === 'frozen' || replayPhase === 'cueRepaint'
      ? filtered.preAnswer.length
      : replayPhase === 'consequence'
        ? consequenceCount > 0
          ? consequenceCount
          : filtered.postAnswer.length
        : replayPhase === 'replaying' || replayPhase === 'done'
          ? filtered.postAnswer.length
          : 0

  // FR-6 — replay teaching state. Three derived bits the badge surfaces
  // so QA can see at a glance which leg is active, whether the cue
  // cluster is being repainted, and which teaching label will land
  // when the rep ends.
  const replayLeg: 'consequence' | 'best-read' | null =
    replayPhase === 'consequence'
      ? 'consequence'
      : replayPhase === 'cueRepaint' || replayPhase === 'replaying'
        ? 'best-read'
        : null
  const cueRepaintActive = replayPhase === 'cueRepaint'
  const teachingLabelActive = replayPhase === 'done'
  const teachingLabelText = scene?.decoderTag
    ? getDecoderTeachingLabel(scene.decoderTag).text
    : null

  // V1 UX completion — placement.
  //
  // Pre-V1 the badge anchored top-right which collided with
  // PremiumOverlay's camera selector + paths toggle + fullscreen
  // button cluster (also top-right). Bottom-right keeps it clear of
  // the GlbDebugBadge (bottom-left) AND the camera cluster (top-right)
  // AND the transport pill (bottom-center). In its collapsed default
  // state the badge is a small "FR" pill so the operator can see at
  // a glance that the flag is on without reading every metric; click
  // to expand for the full readout.
  // V1 Premiumization — reposition in fullscreen so the badge never
  // crosses the bottom-center transport pill or the bottom-anchored
  // FullscreenChoicesOverlay. Top-left sits clear of the camera /
  // paths cluster (top-right) and the concept chip (top-left, but
  // scenarios that mount this badge always pass concept=undefined
  // through the canvas, so the chip is empty).
  const positionClass = isFullscreen
    ? 'top-3 left-3 max-w-[40%]'
    : 'bottom-2 right-2 max-w-[44%]'
  return (
    <div
      data-film-room-debug-badge="1"
      data-expanded={expanded ? '1' : '0'}
      data-fullscreen-position={isFullscreen ? '1' : undefined}
      className={`pointer-events-auto absolute ${positionClass} rounded-md bg-black/85 font-mono text-[10px] leading-snug text-white shadow-lg`}
      style={{ zIndex: 50 }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse film-room debug badge' : 'Expand film-room debug badge'}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-white/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
      >
        <span
          aria-hidden
          style={{
            color: expanded ? '#7fdca0' : '#fcd47a',
          }}
        >
          {expanded ? '▾' : '▸'}
        </span>
        <span style={{ color: '#9cf' }}>FR-DEBUG</span>{' '}
        <span style={{ color: '#7fdca0' }}>{sceneId}</span>
        {' · '}
        <span
          style={{
            color:
              replayPhase === 'frozen'
                ? '#7fdca0'
                : replayPhase === 'cueRepaint'
                  ? '#FFB070'
                  : '#ddd',
          }}
        >
          {replayPhase}
        </span>
      </button>
      {expanded ? null : null}
      <div hidden={!expanded} className="px-2 pb-1">
        {/*
          The full readout block below stays unchanged when expanded
          so all FR-1..FR-6 metrics still surface — only the wrapper
          is responsible for the collapse / expand state.
        */}
        <div>
        <span style={{ color: '#9cf' }}>scene</span>{' '}
        <span style={{ color: '#7fdca0' }}>{sceneId}</span>
        {' · '}
        <span style={{ color: '#9cf' }}>decoder</span>{' '}
        <span style={{ color: '#fcd47a' }}>{decoder}</span>
      </div>
      <div>
        <span style={{ color: '#9cf' }}>camera</span>{' '}
        <span style={{ color: '#fcd47a' }}>{cameraMode}</span>
        {' · '}
        <span style={{ color: '#9cf' }}>phase</span>{' '}
        <span
          style={{
            color:
              replayPhase === 'frozen'
                ? '#7fdca0'
                : replayPhase === 'cueRepaint'
                  ? '#FFB070'
                  : '#ddd',
          }}
        >
          {replayPhase}
        </span>
        {' · '}
        <span style={{ color: '#9cf' }}>freeze</span>{' '}
        <span style={{ opacity: 0.85 }}>{freezeAt}</span>
      </div>
      {framePacing && framePacing.count > 0 ? (
        <div>
          <span style={{ color: '#9cf' }}>fps</span>{' '}
          <span
            style={{
              color: framePacing.avgFps >= 55 ? '#7fdca0' : framePacing.avgFps >= 35 ? '#FFB070' : '#FF4D6D',
            }}
          >
            {framePacing.avgFps.toFixed(0)}
          </span>
          {' · '}
          <span style={{ color: '#9cf' }}>p95</span>{' '}
          <span style={{ opacity: 0.9 }}>{framePacing.p95Ms.toFixed(1)}ms</span>
          {' · '}
          <span style={{ color: '#9cf' }}>max</span>{' '}
          <span style={{ opacity: 0.9 }}>{framePacing.maxMs.toFixed(1)}ms</span>
          {framePacing.slowFrames > 0 ? (
            <>
              {' · '}
              <span style={{ color: '#FFB070' }}>
                {framePacing.slowFrames} slow
              </span>
            </>
          ) : null}
        </div>
      ) : null}
      <div>
        <span style={{ color: '#9cf' }}>assist</span>{' '}
        <span style={{ color: '#fcd47a' }}>{cameraAssist ?? 'partial'}</span>
        {' · '}
        <span style={{ color: '#9cf' }}>preset</span>{' '}
        <span style={{ color: '#7fdca0' }}>{dispatcherTarget ?? '—'}</span>
        {cameraManualOverride ? (
          <>
            {' · '}
            <span style={{ color: '#FF4D6D' }}>(override)</span>
          </>
        ) : null}
      </div>
      <div>
        <span style={{ color: '#9cf' }}>overlays</span>{' '}
        <span>
          {preCount} pre · {postCount} post
        </span>
        {' · '}
        <span style={{ color: '#9cf' }}>figures</span>{' '}
        <span
          style={{
            color: proceduralCount > 0 ? '#f5a05a' : '#7fdca0',
          }}
        >
          glb ×{glbCount} · procedural ×{proceduralCount}
        </span>
      </div>
      {/* FR-5 §9.2 — adaptive overlay state. Distinct row so QA can
          see authored counts, the active level, the post-filter
          counts, dropped primitives, and whether the renderer is
          actually staging anything for the current phase. */}
      <div>
        <span style={{ color: '#9cf' }}>level</span>{' '}
        <span style={{ color: suppressed ? '#FF4D6D' : '#fcd47a' }}>
          {effectiveLevel}
          {suppressed ? ' (suppressed)' : ''}
        </span>
        {' · '}
        <span style={{ color: '#9cf' }}>active</span>{' '}
        <span style={{ color: '#7fdca0' }}>
          {filtered.preAnswer.length} pre · {filtered.postAnswer.length} post
        </span>
        {' · '}
        <span style={{ color: '#9cf' }}>staged</span>{' '}
        <span style={{ opacity: 0.85 }}>{phaseStaged}</span>
        {filtered.droppedPre + filtered.droppedPost > 0 ? (
          <>
            {' · '}
            <span style={{ color: '#9cf' }}>dropped</span>{' '}
            <span style={{ color: '#f5a05a' }}>
              {filtered.droppedPre + filtered.droppedPost}
            </span>
          </>
        ) : null}
      </div>
      {/* FR-6 — replay teaching state. Surfaces the active leg,
          the cueRepaint window, and the per-decoder teaching label
          that lands at done. */}
      <div>
        <span style={{ color: '#9cf' }}>leg</span>{' '}
        <span
          style={{
            color:
              replayLeg === 'consequence'
                ? '#FF4D6D'
                : replayLeg === 'best-read'
                  ? '#7fdca0'
                  : '#888',
          }}
        >
          {replayLeg ?? '—'}
        </span>
        {' · '}
        <span style={{ color: '#9cf' }}>cueRepaint</span>{' '}
        <span style={{ color: cueRepaintActive ? '#FFB070' : '#888' }}>
          {cueRepaintActive ? 'on' : 'off'}
        </span>
        {' · '}
        <span style={{ color: '#9cf' }}>label</span>{' '}
        <span style={{ color: teachingLabelActive ? '#fcd47a' : '#888' }}>
          {teachingLabelActive
            ? teachingLabelText ?? 'on'
            : teachingLabelText
              ? `→ ${teachingLabelText}`
              : '—'}
        </span>
      </div>
      <div>
        <span style={{ color: '#9cf' }}>render</span>{' '}
        <span style={{ opacity: 0.85 }}>{summary}</span>
      </div>
      <div>
        <span style={{ color: '#9cf' }}>keyDefender</span>{' '}
        {keyDefender ? (
          <span style={{ color: '#FF4D6D' }}>
            {keyDefender.playerId ?? '<unknown>'}
            {' · '}
            <span style={{ opacity: 0.7 }}>{keyDefender.pick}</span>
          </span>
        ) : (
          <span style={{ opacity: 0.6 }}>none</span>
        )}
      </div>
      {staticPose.total > 0 ? (
        <div>
          <span style={{ color: '#9cf' }}>staticPose</span>{' '}
          <span style={{ color: '#f5a05a' }}>
            {staticPose.total} (idle ×{staticPose.toIdleReady}
            {' / '}bind ×{staticPose.toBindPose})
          </span>
          {staticPose.lastMissingClip ? (
            <>
              {' · '}
              <span style={{ color: '#9cf' }}>missing</span>{' '}
              <span style={{ opacity: 0.85 }}>
                {staticPose.lastMissingClip}
              </span>
            </>
          ) : null}
        </div>
      ) : null}
      <div>
        <span style={{ color: '#9cf' }}>gates</span>{' '}
        <span style={{ color: gates.glb ? '#7fdca0' : '#f5a05a' }}>
          glb={String(gates.glb)}
        </span>
        {' · '}
        <span style={{ color: gates.closeout ? '#7fdca0' : '#f5a05a' }}>
          closeout={String(gates.closeout)}
        </span>
        {' · '}
        <span style={{ color: gates.backCut ? '#7fdca0' : '#f5a05a' }}>
          backCut={String(gates.backCut)}
        </span>
        {concept ? (
          <>
            {' · '}
            <span style={{ color: '#9cf' }}>concept</span>{' '}
            <span style={{ opacity: 0.7 }}>{concept}</span>
          </>
        ) : null}
        </div>
      </div>
    </div>
  )
}
