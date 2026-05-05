'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Scenario3DView } from '@/components/scenario3d/Scenario3DView'
import { useScenarioSceneData } from '@/lib/scenario3d/useScenarioSceneData'
import {
  QA_MATRIX,
  getQaMatrixEntry,
  groupQaMatrixByDecoder,
  type QaMatrixEntry,
} from '@/lib/scenario3d/qaMatrix'
import {
  _getPlayerFigureDecisionLog,
  isGlbAthletePreviewActive,
  isImportedBackCutClipActive,
  isImportedCloseoutClipActive,
  type PlayerFigureDecision,
} from '@/components/scenario3d/imperativeScene'
import { summarisePlayerFigureDecisions } from '@/components/scenario3d/GlbDebugBadge'
import type { ReplayPhase } from '@/components/scenario3d/ScenarioReplayController'
import type { CourtState } from '@/components/court'
import type { DecoderTag } from '@/lib/scenario3d/schema'
import type { Scene3D } from '@/lib/scenario3d/scene'
import {
  applyOverlayLevel,
  type OverlayLevel,
} from '@/lib/scenario3d/overlayLevel'

export interface PreviewScenario {
  id: string
  decoder_tag: string | null
  difficulty: number | null
  title: string | null
  prompt: string | null
  visible_cue: string | null
  best_read: string | null
  decoder_teaching_point: string | null
  explanation_md: string | null
  user_role: string | null
  concept_tags: string[]
  sub_concepts: string[]
  court_state: unknown
  scene: unknown
}

interface ScenarioPreviewClientProps {
  initialScenarioId: string
  scenarios: PreviewScenario[]
}

const DECODER_LABEL: Record<DecoderTag, string> = {
  BACKDOOR_WINDOW: 'Backdoor Window',
  EMPTY_SPACE_CUT: 'Empty-Space Cut',
  ADVANTAGE_OR_RESET: 'Advantage or Reset',
  SKIP_THE_ROTATION: 'Skip the Rotation',
}

const FAMILY_ORDER: DecoderTag[] = [
  'BACKDOOR_WINDOW',
  'EMPTY_SPACE_CUT',
  'ADVANTAGE_OR_RESET',
  'SKIP_THE_ROTATION',
]

const CHECKLIST_ITEMS: readonly string[] = [
  'Cue visible at freeze',
  'User visible',
  'Key defender visible',
  'Ball visible',
  'Open space visible at replay',
  'Best answer visually supported',
  'Player sizes readable',
  'Camera angle acceptable',
  'Overlays not cluttered',
  'Cue overlay points to the right defender',
  'Replay teaches the read clearly',
  'Mobile readability (393 px landscape)',
] as const

/**
 * FR-1 — `/dev/scenario-preview` client. Read-only renderer
 * integration: every renderer fact surfaced here is sourced from
 * exports that already exist (`_getPlayerFigureDecisionLog`,
 * `isGlbAthletePreviewActive`, etc.) — no renderer behavior
 * changes.
 */
export function ScenarioPreviewClient({
  initialScenarioId,
  scenarios,
}: ScenarioPreviewClientProps) {
  const scenariosById = useMemo(() => {
    const m = new Map<string, PreviewScenario>()
    for (const s of scenarios) m.set(s.id, s)
    return m
  }, [scenarios])

  const [selectedId, setSelectedId] = useState(initialScenarioId)
  const [resetCounter, setResetCounter] = useState(0)
  const [replayPhase, setReplayPhase] = useState<ReplayPhase>('idle')
  // FR-5 — QA route defaults to `'review'` so the freeze frame mounts
  // every authored primitive across all 20 founder-v0 scenarios.
  // QA can flip the dropdown to inspect each Pathways tier in turn
  // without leaving the page.
  const [overlayLevel, setOverlayLevel] = useState<OverlayLevel>('review')
  const [activeCaption, setActiveCaption] = useState<string | undefined>()
  const [decisionLog, setDecisionLog] = useState<readonly PlayerFigureDecision[]>(
    [],
  )
  const [glbGate, setGlbGate] = useState({
    glb: false,
    closeout: false,
    backCut: false,
  })
  const [failedItems, setFailedItems] = useState<Record<string, boolean>>({})
  const [copyToast, setCopyToast] = useState<string | null>(null)

  const selected = scenariosById.get(selectedId)
  const matrix = getQaMatrixEntry(selectedId)

  // Build the scene from the seed JSON exactly the way `/train` does.
  const scene = useScenarioSceneData(
    selected
      ? {
          id: selected.id,
          court_state: selected.court_state as CourtState | null,
          scene: selected.scene,
          user_role: selected.user_role ?? undefined,
          concept_tags: selected.concept_tags,
        }
      : null,
  )

  // Decision log + gate readers poll. The badge in production already
  // does this every 500 ms; we mirror it here so the panel never lags
  // behind reality. Cheap — runs only on this dev page.
  useEffect(() => {
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      setDecisionLog([..._getPlayerFigureDecisionLog()])
      setGlbGate({
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
  }, [selectedId])

  // Reset transient view state on scenario change so the new pick
  // restarts from the intro phase rather than mid-replay.
  useEffect(() => {
    setReplayPhase('idle')
    setActiveCaption(undefined)
    setFailedItems({})
  }, [selectedId])

  // -- packet 2: keyboard navigation -----------------------------------
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      // Don't intercept while typing in an input/textarea.
      const target = ev.target as HTMLElement | null
      if (target) {
        const tag = target.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || target.isContentEditable) {
          return
        }
      }
      const ids = scenarios.map((s) => s.id)
      const idx = ids.indexOf(selectedId)
      switch (ev.key.toLowerCase()) {
        case 'j':
          ev.preventDefault()
          setSelectedId(ids[(idx + 1) % ids.length])
          return
        case 'k':
          ev.preventDefault()
          setSelectedId(ids[(idx - 1 + ids.length) % ids.length])
          return
        case 'r':
          ev.preventDefault()
          setResetCounter((n) => n + 1)
          return
        case 'f':
          ev.preventDefault()
          // No deterministic "skip to freeze" hook — the closest
          // honest action is a reset that lets the controller play
          // back into the freeze cap. Document the limitation in
          // the QA legend so the operator knows what F is doing.
          setResetCounter((n) => n + 1)
          return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scenarios, selectedId])

  // -- packet 5: checklist + clipboard ---------------------------------
  const toggleFail = useCallback(
    (item: string) => {
      setFailedItems((prev) => {
        const next = { ...prev }
        if (next[item]) {
          delete next[item]
        } else {
          next[item] = true
        }
        return next
      })
    },
    [],
  )

  const copyFails = useCallback(async () => {
    const failed = Object.keys(failedItems)
    if (failed.length === 0) return
    const payload = [
      `Scenario: ${selectedId}`,
      `Decoder: ${selected?.decoder_tag ?? '?'}`,
      `Title: ${selected?.title ?? '?'}`,
      '',
      'Failed checklist items:',
      ...failed.map((f) => `  - ${f}`),
    ].join('\n')
    try {
      await navigator.clipboard.writeText(payload)
      setCopyToast('Copied failed-items report to clipboard')
    } catch {
      setCopyToast('Clipboard API unavailable')
    }
    window.setTimeout(() => setCopyToast(null), 1800)
  }, [failedItems, selected, selectedId])

  // -- packet 4: live render-state derivations -------------------------
  const renderSummary = useMemo(
    () => summarisePlayerFigureDecisions(decisionLog),
    [decisionLog],
  )
  const figuresPerPath = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const d of decisionLog) {
      counts[d.pick] = (counts[d.pick] ?? 0) + 1
    }
    return counts
  }, [decisionLog])
  const fallbackReasons = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const d of decisionLog) {
      if (d.pick === 'procedural') {
        counts[d.reason] = (counts[d.reason] ?? 0) + 1
      }
    }
    return counts
  }, [decisionLog])

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#08090C',
        color: '#E7ECF3',
        fontFamily: 'system-ui, sans-serif',
      }}
      data-fr1-scenario-preview="1"
    >
      <header
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          fontSize: 12,
          letterSpacing: '0.04em',
          opacity: 0.85,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>
          DEV · FILM-ROOM QA — {selectedId}
          {selected?.decoder_tag ? ` · ${selected.decoder_tag}` : ''}
        </span>
        <span style={{ opacity: 0.6 }}>
          J/K next/prev · R reset · F freeze · gated by ENABLE_DEV_ROUTES
        </span>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 360px) 1fr',
          gap: 12,
          padding: 12,
          alignItems: 'start',
        }}
      >
        {/* ---------------- LEFT COLUMN ---------------- */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            minWidth: 0,
          }}
        >
          <ScenarioSelector
            scenarios={scenarios}
            selectedId={selectedId}
            onPick={setSelectedId}
          />
          {selected ? (
            <ScenarioMetadataPanel scenario={selected} />
          ) : (
            <Panel title="Scenario">
              <Empty>Scenario not found in seed pack.</Empty>
            </Panel>
          )}
          <RenderMetadataPanel
            decisions={decisionLog}
            renderSummary={renderSummary}
            figuresPerPath={figuresPerPath}
            fallbackReasons={fallbackReasons}
            replayPhase={replayPhase}
            freezeAtMs={scene?.freezeAtMs ?? null}
            activeCaption={activeCaption}
            preAnswerOverlayCount={scene?.preAnswerOverlays?.length ?? 0}
            postAnswerOverlayCount={scene?.postAnswerOverlays?.length ?? 0}
            decoder={selected?.decoder_tag ?? null}
            glbGate={glbGate}
            overlayLevel={overlayLevel}
            onOverlayLevelChange={setOverlayLevel}
            scene={scene ?? null}
          />
          <QaChecklistPanel
            failedItems={failedItems}
            onToggle={toggleFail}
            onCopy={copyFails}
            copyToast={copyToast}
          />
          {matrix ? <QaMatrixPanel entry={matrix} /> : null}
        </div>

        {/* ---------------- RIGHT COLUMN ---------------- */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: 720,
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {scene ? (
              <Scenario3DView
                fallback={
                  <div style={{ padding: 24, color: '#E7ECF3' }}>
                    WebGL not available.
                  </div>
                }
                scene={scene}
                concept={selected?.concept_tags?.join(' · ') ?? selectedId}
                replayMode="intro"
                resetCounter={resetCounter}
                onPhase={setReplayPhase}
                onCaption={setActiveCaption}
                forceFullPath
                height={720}
                /* FR-4 §8.9 — QA route always opts into the strongest
                 *  decoder-aware framing so the freeze frame teaches
                 *  the read; production /train inherits the partial
                 *  default. */
                cameraAssist="full"
                /* FR-5 §9.2 — QA route exposes the full level
                 *  spectrum via the dropdown above. Default is
                 *  `'review'` (max teaching support); flipping to
                 *  `'none'` validates Boss Challenge zero-overlay
                 *  rendering. */
                overlayLevel={overlayLevel}
              />
            ) : (
              <div
                style={{
                  padding: 24,
                  color: '#E7ECF3',
                  opacity: 0.7,
                }}
              >
                No scene available for {selectedId}.
              </div>
            )}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              opacity: 0.55,
            }}
          >
            Read-only renderer integration. No GLB/camera/overlay behavior is
            modified by this page.
          </div>
        </div>
      </div>
    </main>
  )
}

// =====================================================================
// Scenario selector  (Packet 2)
// =====================================================================

function ScenarioSelector({
  scenarios,
  selectedId,
  onPick,
}: {
  scenarios: PreviewScenario[]
  selectedId: string
  onPick: (id: string) => void
}) {
  const groups = useMemo(() => {
    const grouped = groupQaMatrixByDecoder()
    const seedById = new Map(scenarios.map((s) => [s.id, s]))
    return FAMILY_ORDER.map((family) => {
      const entries = grouped.get(family) ?? []
      // Re-sort by difficulty so early reps come first.
      const sorted = [...entries].sort((a, b) => {
        const sa = seedById.get(a.id)?.difficulty ?? 0
        const sb = seedById.get(b.id)?.difficulty ?? 0
        return sa - sb
      })
      return { family, entries: sorted }
    })
  }, [scenarios])

  return (
    <Panel title="Scenarios">
      {groups.map(({ family, entries }) => (
        <div key={family} style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              opacity: 0.55,
              marginBottom: 4,
            }}
          >
            {DECODER_LABEL[family]} · {entries.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {entries.map((m) => (
              <ScenarioRow
                key={m.id}
                entry={m}
                seed={scenarios.find((s) => s.id === m.id)}
                selected={selectedId === m.id}
                onPick={onPick}
              />
            ))}
          </div>
        </div>
      ))}
    </Panel>
  )
}

function ScenarioRow({
  entry,
  seed,
  selected,
  onPick,
}: {
  entry: QaMatrixEntry
  seed: PreviewScenario | undefined
  selected: boolean
  onPick: (id: string) => void
}) {
  const title = seed?.title ?? entry.id
  const difficulty = seed?.difficulty ?? null
  return (
    <button
      type="button"
      onClick={() => onPick(entry.id)}
      data-fr1-scenario-row={entry.id}
      data-selected={selected ? '1' : '0'}
      style={{
        display: 'grid',
        gridTemplateColumns: '52px 1fr auto',
        gap: 8,
        alignItems: 'center',
        padding: '6px 8px',
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.06)',
        background: selected
          ? 'rgba(59,227,131,0.12)'
          : 'rgba(255,255,255,0.02)',
        color: '#E7ECF3',
        textAlign: 'left',
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          fontFamily:
            'JetBrains Mono, ui-monospace, SFMono-Regular, monospace',
          fontSize: 11,
          opacity: 0.75,
        }}
      >
        {entry.id}
      </span>
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </span>
      {difficulty != null ? (
        <span
          style={{
            fontSize: 10,
            opacity: 0.6,
            border: '1px solid rgba(255,255,255,0.18)',
            padding: '0 5px',
            borderRadius: 999,
          }}
        >
          D{difficulty}
        </span>
      ) : (
        <span />
      )}
    </button>
  )
}

// =====================================================================
// Scenario metadata panel  (Packet 3)
// =====================================================================

function ScenarioMetadataPanel({
  scenario,
}: {
  scenario: PreviewScenario
}) {
  return (
    <Panel title="Scenario Metadata">
      <Field label="ID" value={scenario.id} mono />
      <Field label="Title" value={scenario.title ?? '—'} />
      <Field label="Decoder" value={scenario.decoder_tag ?? '—'} mono />
      <Field
        label="Difficulty"
        value={scenario.difficulty != null ? `D${scenario.difficulty}` : '—'}
      />
      <Field label="User role" value={scenario.user_role ?? '—'} />
      {scenario.concept_tags.length > 0 ? (
        <Field
          label="Concepts"
          value={scenario.concept_tags.join(' · ')}
          dim
        />
      ) : null}
      <Field label="Prompt" value={scenario.prompt ?? '—'} multiline />
      <Field
        label="Visible cue"
        value={scenario.visible_cue ?? '—'}
        multiline
      />
      <Field
        label="Best read"
        value={scenario.best_read ?? '—'}
        multiline
      />
      <Field
        label="Decoder teaching point"
        value={scenario.decoder_teaching_point ?? '—'}
        multiline
      />
    </Panel>
  )
}

// =====================================================================
// Render metadata panel  (Packet 4)
// =====================================================================

function RenderMetadataPanel({
  decisions,
  renderSummary,
  figuresPerPath,
  fallbackReasons,
  replayPhase,
  freezeAtMs,
  activeCaption,
  preAnswerOverlayCount,
  postAnswerOverlayCount,
  decoder,
  glbGate,
  overlayLevel,
  onOverlayLevelChange,
  scene,
}: {
  decisions: readonly PlayerFigureDecision[]
  renderSummary: string
  figuresPerPath: Record<string, number>
  fallbackReasons: Record<string, number>
  replayPhase: ReplayPhase
  freezeAtMs: number | null
  activeCaption: string | undefined
  preAnswerOverlayCount: number
  postAnswerOverlayCount: number
  decoder: string | null
  glbGate: { glb: boolean; closeout: boolean; backCut: boolean }
  overlayLevel: OverlayLevel
  onOverlayLevelChange: (next: OverlayLevel) => void
  scene: Scene3D | null
}) {
  const filtered = applyOverlayLevel({
    preAnswer: scene?.preAnswerOverlays ?? [],
    postAnswer: scene?.postAnswerOverlays ?? [],
    level: overlayLevel,
  })
  return (
    <Panel title="Render Metadata">
      <Field label="Replay phase" value={replayPhase} mono />
      <Field
        label="freezeAtMs"
        value={freezeAtMs == null ? '—' : `${freezeAtMs} ms`}
        mono
      />
      <Field
        label="Active caption"
        value={activeCaption ?? '—'}
        multiline
        dim
      />
      <Field label="Decoder" value={decoder ?? '—'} mono />
      <Field
        label="Pre / post overlays"
        value={`${preAnswerOverlayCount} pre · ${postAnswerOverlayCount} post`}
        mono
      />
      {/* FR-5 §9.2 — overlayLevel dropdown so QA can flip between
          Pathways modes without leaving the page. The active counts
          and dropped counts below show the helper's projection of
          the scene's authored arrays under the selected level. */}
      <FieldRow label="Overlay level">
        <select
          value={overlayLevel}
          onChange={(e) => onOverlayLevelChange(e.target.value as OverlayLevel)}
          style={{
            background: '#101622',
            color: '#E7ECF3',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            padding: '2px 6px',
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
          }}
        >
          <option value="beginner">beginner (3 / 3)</option>
          <option value="intermediate">intermediate (2 / 2)</option>
          <option value="advanced">advanced (1 / 1)</option>
          <option value="none">none — Boss (0 / 0)</option>
          <option value="review">review — Film Room (∞)</option>
        </select>
      </FieldRow>
      <Field
        label="Active overlays"
        value={`${filtered.preAnswer.length} pre · ${filtered.postAnswer.length} post`}
        mono
      />
      {filtered.droppedPre + filtered.droppedPost > 0 ? (
        <Field
          label="Dropped"
          value={`${filtered.droppedPre} pre · ${filtered.droppedPost} post`}
          mono
          dim
        />
      ) : null}
      <Field
        label="GLB gates"
        value={[
          `glb=${String(glbGate.glb)}`,
          `closeout=${String(glbGate.closeout)}`,
          `backCut=${String(glbGate.backCut)}`,
        ].join(' · ')}
        mono
        dim
      />
      <Field
        label="Figures by path"
        value={
          Object.keys(figuresPerPath).length
            ? Object.entries(figuresPerPath)
                .map(([k, n]) => `${k} ×${n}`)
                .join(' · ')
            : '—'
        }
        mono
      />
      <Field
        label="Fallback reasons"
        value={
          Object.keys(fallbackReasons).length
            ? Object.entries(fallbackReasons)
                .map(([k, n]) => `${k} ×${n}`)
                .join(' · ')
            : '—'
        }
        mono
        dim
      />
      <Field label="Render summary" value={renderSummary} mono dim multiline />
      <details style={{ marginTop: 6 }}>
        <summary style={{ cursor: 'pointer', fontSize: 11, opacity: 0.7 }}>
          Per-figure decision log ({decisions.length})
        </summary>
        <div
          style={{
            marginTop: 6,
            maxHeight: 160,
            overflow: 'auto',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.06)',
            padding: 6,
            fontFamily:
              'JetBrains Mono, ui-monospace, SFMono-Regular, monospace',
            fontSize: 10,
            background: '#000',
          }}
        >
          {decisions.map((d, i) => (
            <div key={i} style={{ opacity: 0.85 }}>
              [{i}] {d.pick} · {d.reason}
              {d.error ? ` · ${d.error}` : ''}
            </div>
          ))}
          {decisions.length === 0 ? (
            <div style={{ opacity: 0.5 }}>no figures yet</div>
          ) : null}
        </div>
      </details>
    </Panel>
  )
}

// =====================================================================
// QA checklist  (Packet 5)
// =====================================================================

function QaChecklistPanel({
  failedItems,
  onToggle,
  onCopy,
  copyToast,
}: {
  failedItems: Record<string, boolean>
  onToggle: (item: string) => void
  onCopy: () => void
  copyToast: string | null
}) {
  const failedCount = Object.keys(failedItems).length
  return (
    <Panel
      title="QA Checklist"
      action={
        <button
          type="button"
          onClick={onCopy}
          disabled={failedCount === 0}
          style={{
            fontSize: 11,
            padding: '4px 8px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.18)',
            background:
              failedCount > 0 ? 'rgba(255,77,109,0.18)' : 'transparent',
            color: '#E7ECF3',
            cursor: failedCount > 0 ? 'pointer' : 'not-allowed',
            opacity: failedCount > 0 ? 1 : 0.5,
          }}
        >
          Copy {failedCount} fail{failedCount === 1 ? '' : 's'}
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {CHECKLIST_ITEMS.map((item) => {
          const failed = !!failedItems[item]
          return (
            <button
              key={item}
              type="button"
              onClick={() => onToggle(item)}
              data-fr1-checklist-item={item}
              data-failed={failed ? '1' : '0'}
              style={{
                display: 'grid',
                gridTemplateColumns: '20px 1fr',
                gap: 8,
                alignItems: 'center',
                textAlign: 'left',
                padding: '5px 6px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.06)',
                background: failed
                  ? 'rgba(255,77,109,0.12)'
                  : 'rgba(255,255,255,0.02)',
                color: '#E7ECF3',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  border: '1px solid rgba(255,255,255,0.3)',
                  background: failed ? '#FF4D6D' : 'transparent',
                  display: 'inline-block',
                }}
              />
              <span>{item}</span>
            </button>
          )
        })}
      </div>
      {copyToast ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            opacity: 0.85,
            color: '#3BE383',
          }}
        >
          {copyToast}
        </div>
      ) : null}
    </Panel>
  )
}

// =====================================================================
// QA matrix entry  (Packet 7)
// =====================================================================

function QaMatrixPanel({ entry }: { entry: QaMatrixEntry }) {
  const priorityColor =
    entry.priority === 'high'
      ? '#FF4D6D'
      : entry.priority === 'medium'
        ? '#FF8A3D'
        : '#9BA1AD'
  return (
    <Panel
      title="QA Matrix Contract"
      action={
        <span
          style={{
            fontSize: 10,
            padding: '2px 6px',
            border: `1px solid ${priorityColor}`,
            color: priorityColor,
            borderRadius: 999,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {entry.priority}
        </span>
      }
    >
      <Field label="Primary cue" value={entry.primaryCue} multiline />
      <Field
        label="Required framing"
        value={entry.requiredFraming}
        multiline
      />
      <Field
        label="Required highlight"
        value={entry.requiredHighlight}
      />
      <Field
        label="Required overlays"
        value={entry.requiredOverlays.join(' · ')}
        mono
        dim
      />
      <Field label="Known risk" value={entry.knownRisk} multiline dim />
    </Panel>
  )
}

// Coverage of all entries; quoted by tests so unused-export drift is
// a CI failure rather than a silent rot.
export const __ALL_QA_MATRIX_FOR_TESTS = QA_MATRIX

// =====================================================================
// Tiny shared UI primitives
// =====================================================================

function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      style={{
        background: '#13151A',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        padding: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 12,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            opacity: 0.7,
          }}
        >
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Field({
  label,
  value,
  mono,
  dim,
  multiline,
}: {
  label: string
  value: string
  mono?: boolean
  dim?: boolean
  multiline?: boolean
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          opacity: 0.55,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          opacity: dim ? 0.7 : 1,
          fontFamily: mono
            ? 'JetBrains Mono, ui-monospace, SFMono-Regular, monospace'
            : 'system-ui, sans-serif',
          whiteSpace: multiline ? 'pre-wrap' : 'nowrap',
          overflow: multiline ? 'visible' : 'hidden',
          textOverflow: multiline ? 'clip' : 'ellipsis',
        }}
      >
        {value || '—'}
      </div>
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 12, opacity: 0.6 }}>{children}</div>
  )
}

/**
 * Same uppercase label as `Field` but the value slot is a `children`
 * region so callers can drop in a `<select>` / button / etc. Used by
 * the FR-5 overlay-level dropdown.
 */
function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          opacity: 0.55,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12 }}>{children}</div>
    </div>
  )
}

