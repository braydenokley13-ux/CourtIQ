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
import type { Scene3D } from '@/lib/scenario3d/scene'
import type { ReplayPhase } from './ScenarioReplayController'

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
}: FilmRoomDebugBadgeProps) {
  const [decisions, setDecisions] = useState<readonly PlayerFigureDecision[]>(
    [],
  )
  const [gates, setGates] = useState({
    glb: false,
    closeout: false,
    backCut: false,
  })

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

  const decoder = scene?.decoderTag ?? '—'
  const sceneId = scene?.id ?? '—'
  const freezeAt =
    typeof scene?.freezeAtMs === 'number'
      ? `${scene.freezeAtMs}ms`
      : '—'
  const preCount = scene?.preAnswerOverlays?.length ?? 0
  const postCount = scene?.postAnswerOverlays?.length ?? 0

  // Top-right placement so it does not collide with the bottom-left
  // GlbDebugBadge — both can be on at the same time.
  return (
    <div
      data-film-room-debug-badge="1"
      className="pointer-events-none absolute right-2 top-2 max-w-[60%] rounded-md bg-black/80 px-2 py-1 font-mono text-[10px] leading-snug text-white shadow-lg"
      style={{ zIndex: 50 }}
    >
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
            color: replayPhase === 'frozen' ? '#7fdca0' : '#ddd',
          }}
        >
          {replayPhase}
        </span>
        {' · '}
        <span style={{ color: '#9cf' }}>freeze</span>{' '}
        <span style={{ opacity: 0.85 }}>{freezeAt}</span>
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
      <div>
        <span style={{ color: '#9cf' }}>render</span>{' '}
        <span style={{ opacity: 0.85 }}>{summary}</span>
      </div>
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
  )
}
