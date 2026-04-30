'use client'

import { useEffect, useRef, useState } from 'react'
import type { CameraMode } from './imperativeScene'
import type { ReplayMode } from './ScenarioReplayController'

export interface PremiumOverlayProps {
  /** Scenario concept tag(s) — rendered in the top-left chip. */
  concept?: string
  /** Current replay mode. The REPLAY badge pulses when 'answer'. */
  replayMode: ReplayMode
  /** Active camera mode. */
  cameraMode: CameraMode
  onCameraModeChange: (mode: CameraMode) => void
  /** Active playback rate. */
  playbackRate: PlaybackRate
  onPlaybackRateChange: (rate: PlaybackRate) => void
  /** Paused flag. */
  paused: boolean
  onPausedChange: (paused: boolean) => void
  /** Restart the current replay. */
  onRestart: () => void
  /** Path toggle. When `pathsAvailable` is false the toggle is hidden. */
  showPaths: boolean
  onShowPathsChange: (show: boolean) => void
  pathsAvailable: boolean
  /** Phase D — fullscreen state. When true the button shows "Exit". */
  isFullscreen?: boolean
  onFullscreenToggle?: () => void
}

export type PlaybackRate = 0.5 | 1 | 2

const CAMERA_MODES: { id: CameraMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'broadcast', label: 'Broadcast' },
  { id: 'tactical', label: 'Tactical' },
  { id: 'follow', label: 'Follow' },
  { id: 'replay', label: 'Replay' },
]

const SPEED_OPTIONS: PlaybackRate[] = [0.5, 1, 2]

/**
 * User-facing chrome rendered around (not inside) the WebGL canvas. All
 * controls operate on existing imperative-renderer state — camera mode,
 * playback rate, pause, restart counter, path toggle. No 3D objects are
 * created here, so the imperative-only renderer constraints are
 * preserved.
 *
 * Layout is corner-anchored so the controls never intrude on the court
 * action: scenario chip top-left, camera selector top-right, transport
 * + speed bottom-center.
 */
export function PremiumOverlay({
  concept,
  replayMode,
  cameraMode,
  onCameraModeChange,
  playbackRate,
  onPlaybackRateChange,
  paused,
  onPausedChange,
  onRestart,
  showPaths,
  onShowPathsChange,
  pathsAvailable,
  isFullscreen = false,
  onFullscreenToggle,
}: PremiumOverlayProps) {
  const isReplay = replayMode === 'answer'

  // Packet G — controls fade to a quiet idle weight while the play is
  // visible, then come back to full strength when the user hovers,
  // focuses inside the canvas surface, or has the replay paused. Wrapping
  // every cluster in a single group/canvas-overlay container lets the
  // hover/focus state cascade with one declarative rule per cluster
  // instead of per-button JS state.
  const idleAttention = paused

  // Phase D — in fullscreen the viewport is large; push controls away
  // from the edge for breathing room and always show label text.
  const inset = isFullscreen ? '20px' : '12px'
  const bottomInset = isFullscreen ? '20px' : '12px'

  return (
    <div
      className="group/overlay pointer-events-none absolute inset-0"
      data-attention={idleAttention ? 'on' : 'off'}
    >
      {/* Top-left: scenario chip — quietly orients the user. Idle dims to
          ~55% so the chip never competes with the court; comes back to
          full when the overlay is engaged. Hidden on decoder scenarios
          where the train header decoder pill plays this role. */}
      {concept ? (
        <div
          className="ciq-broadcast-chip pointer-events-none absolute flex max-w-[55%] items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[1.6px] text-white/90 transition-opacity duration-200 [opacity:0.65] group-hover/overlay:[opacity:1] group-focus-within/overlay:[opacity:1] group-data-[attention=on]/overlay:[opacity:1]"
          style={{ left: inset, top: inset }}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#3BFF9D] shadow-[0_0_8px_#3BFF9D]" />
          <span className="truncate">{concept}</span>
        </div>
      ) : null}

      {/* Top-right cluster: replay badge + paths toggle + camera selector.
          The paths toggle was previously bottom-anchored where it
          competed with the answer caption rendered by the page; moving
          it next to the camera selector groups all "what am I looking
          at" controls in one zone and frees the bottom edge for the
          caption + transport. */}
      <div
        className="pointer-events-none absolute flex items-center gap-1.5 transition-opacity duration-200 [opacity:0.7] group-hover/overlay:[opacity:1] group-focus-within/overlay:[opacity:1] group-data-[attention=on]/overlay:[opacity:1]"
        style={{ right: inset, top: inset }}
      >
        {isReplay ? (
          <div
            data-active="true"
            className="ciq-broadcast-chip flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1.5px] text-[#3BFF9D]"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3BFF9D]/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#3BFF9D]" />
            </span>
            Replay
          </div>
        ) : null}
        {pathsAvailable ? (
          <button
            type="button"
            onClick={() => onShowPathsChange(!showPaths)}
            aria-pressed={showPaths}
            data-active={showPaths ? 'true' : 'false'}
            title={showPaths ? 'Hide teaching paths' : 'Show teaching paths'}
            className={`ciq-broadcast-chip pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3BFF9D]/70 ${
              showPaths ? 'text-[#3BFF9D]' : 'text-white/80 hover:text-white'
            }`}
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
            {/* Always show the label in fullscreen; fall back to sm: responsive outside. */}
            <span className={isFullscreen ? undefined : 'hidden sm:inline'}>
              {showPaths ? 'Paths on' : 'Paths off'}
            </span>
            {isFullscreen ? null : <span className="sm:hidden">Paths</span>}
          </button>
        ) : null}
        <CameraSelector
          value={cameraMode}
          onChange={onCameraModeChange}
          isFullscreen={isFullscreen}
        />
        {onFullscreenToggle ? (
          <button
            type="button"
            onClick={onFullscreenToggle}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className={`ciq-broadcast-chip pointer-events-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3BFF9D]/70 ${
              isFullscreen ? 'text-[#3BFF9D] hover:text-[#5cffae]' : 'text-white/80 hover:text-white'
            }`}
          >
            {isFullscreen ? <CollapseIcon /> : <ExpandIcon />}
          </button>
        ) : null}
      </div>

      {/* Bottom-center: compact transport pill. Single anchored row, no
          longer stacks a second pill below it (the paths toggle moved
          to the top-right cluster). The transport is always visible
          but quietly dims to ~70% while playing so the eye lands on
          the action; pause flips it back to full strength because the
          user is now thinking about controls. */}
      <div
        className="pointer-events-none absolute inset-x-0 flex justify-center px-3"
        style={{ bottom: bottomInset }}
      >
        <div
          role="toolbar"
          aria-label="Replay controls"
          className="ciq-broadcast-chip pointer-events-auto flex items-center gap-0.5 rounded-full px-1.5 py-1 text-white transition-opacity duration-200 [opacity:0.7] hover:[opacity:1] focus-within:[opacity:1] group-data-[attention=on]/overlay:[opacity:1]"
        >
          <IconButton
            label="Restart replay"
            onClick={onRestart}
            kind="ghost"
          >
            <RestartIcon />
          </IconButton>
          <IconButton
            label={paused ? 'Play' : 'Pause'}
            onClick={() => onPausedChange(!paused)}
            kind="primary"
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
          </IconButton>
          <span className="mx-0.5 h-5 w-px bg-white/10" aria-hidden />
          <SpeedSelector value={playbackRate} onChange={onPlaybackRateChange} />
        </div>
      </div>
    </div>
  )
}

interface IconButtonProps {
  label: string
  onClick: () => void
  children: React.ReactNode
  kind?: 'primary' | 'ghost'
}

function IconButton({ label, onClick, children, kind = 'ghost' }: IconButtonProps) {
  // Touch-friendly target (h-9/w-9 = 36px hit area) with the visual
  // glyph kept small via the inner SVG. Maintains a comfortable tap
  // target on mobile while the pill itself stays compact.
  const base =
    'inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3BFF9D]/70'
  const styles =
    kind === 'primary'
      ? 'bg-[#3BFF9D] text-[#062118] shadow-[0_0_12px_-2px_rgba(59,255,157,0.55)] hover:bg-[#5cffae] active:scale-[0.96]'
      : 'text-white/85 hover:bg-white/10 hover:text-white active:scale-[0.96]'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`${base} ${styles}`}
    >
      {children}
    </button>
  )
}

function SpeedSelector({
  value,
  onChange,
}: {
  value: PlaybackRate
  onChange: (rate: PlaybackRate) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Playback speed"
      className="flex items-center rounded-full bg-white/5 p-0.5"
    >
      {SPEED_OPTIONS.map((opt) => {
        const active = opt === value
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt)}
            className={`min-w-[32px] rounded-full px-2 py-0.5 font-display text-[10px] font-bold tabular-nums tracking-[0.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3BFF9D]/70 ${
              active
                ? 'bg-[#3BFF9D]/15 text-[#3BFF9D] shadow-[inset_0_0_0_1px_rgba(59,255,157,0.45)]'
                : 'text-white/70 hover:text-white'
            }`}
          >
            {opt === 1 ? '1x' : `${opt}x`}
          </button>
        )
      })}
    </div>
  )
}

function CameraSelector({
  value,
  onChange,
  isFullscreen = false,
}: {
  value: CameraMode
  onChange: (mode: CameraMode) => void
  isFullscreen?: boolean
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const active = CAMERA_MODES.find((m) => m.id === value) ?? CAMERA_MODES[0]

  useEffect(() => {
    if (!open) return
    const onDoc = (event: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={containerRef} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Camera: ${active.label}`}
        title={`Camera: ${active.label}`}
        data-active={open ? 'true' : 'false'}
        className="ciq-broadcast-chip flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1.5px] text-white/80 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3BFF9D]/70"
      >
        <CameraIcon />
        {/* Always show label in fullscreen; sm: responsive outside fullscreen. */}
        <span className={isFullscreen ? undefined : 'hidden sm:inline'}>{active.label}</span>
        <ChevronIcon open={open} />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Camera mode"
          className="ciq-broadcast-chip absolute right-0 top-[calc(100%+6px)] z-10 min-w-[148px] overflow-hidden rounded-xl py-1 text-[11px] font-semibold text-white/85"
        >
          {CAMERA_MODES.map((mode) => {
            const isActive = mode.id === value
            return (
              <li key={mode.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    onChange(mode.id)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none ${
                    isActive ? 'bg-[#3BFF9D]/10 text-[#3BFF9D]' : 'text-white/85'
                  }`}
                >
                  <span>{mode.label}</span>
                  {isActive ? (
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#3BFF9D] shadow-[0_0_6px_currentColor]" />
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function PlayIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="currentColor"
    >
      <path d="M4.5 3.2v9.6c0 .55.6.88 1.06.6l8.04-4.8a.7.7 0 0 0 0-1.2L5.56 2.6a.7.7 0 0 0-1.06.6Z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="currentColor"
    >
      <rect x="3.5" y="2.5" width="3.2" height="11" rx="1.1" />
      <rect x="9.3" y="2.5" width="3.2" height="11" rx="1.1" />
    </svg>
  )
}

function RestartIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.46" />
      <path d="M3.2 2.5v3h3" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.4 4.8h2.2l1-1.4h4.8l1 1.4h2.2c.55 0 1 .45 1 1V12c0 .55-.45 1-1 1H2.4c-.55 0-1-.45-1-1V5.8c0-.55.45-1 1-1Z" />
      <circle cx="8" cy="9" r="2.4" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms ease' }}
    >
      <path d="M3.6 6.2l4.4 4 4.4-4" />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 6V3h3M10.5 3h3v3M13.5 10v3h-3M5.5 13h-3v-3" />
    </svg>
  )
}

function CollapseIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5.5 2.5v3h-3M13.5 5.5h-3v-3M10.5 13.5v-3h3M2.5 10.5h3v3" />
    </svg>
  )
}
