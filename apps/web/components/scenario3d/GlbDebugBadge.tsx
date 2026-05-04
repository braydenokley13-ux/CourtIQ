'use client'

import { useEffect, useState } from 'react'
import {
  _getPlayerFigureDecisionLog,
  _isForceGlbAthletePreview,
  isGlbAthletePreviewActive,
  isImportedBackCutClipActive,
  isImportedCloseoutClipActive,
  type PlayerFigureDecision,
} from './imperativeScene'
import {
  GLB_ATHLETE_ASSET_URL,
  GLB_IMPORTED_BACK_CUT_CLIP_URL,
  GLB_IMPORTED_CLOSEOUT_CLIP_URL,
  loadGlbAthleteAsset,
} from './glbAthlete'

/**
 * P3.3C — production-route GLB debug badge.
 *
 * Internal-only diagnostic chip that overlays a tiny summary of the
 * GLB gating state on top of the scenario canvas. Mounted by
 * `Scenario3DCanvas` only when one of these is true:
 *
 *   1. `?glbDebug=1` on the current URL (one-shot QA opt-in), OR
 *   2. `window.__COURTIQ_GLB_DEBUG__ === true` (long-lived QA opt-in
 *      that survives navigations within the same tab — set from the
 *      DevTools console).
 *
 * Both gates are fully client-side, evaluated after mount, so a
 * production user without either flag never even loads the asset
 * probes — the badge state machine and `fetch` calls are skipped
 * entirely. There is no production telemetry / network leak when
 * the badge is off.
 *
 * Reports, in a single fixed-position pill at the bottom-left of the
 * canvas:
 *   - `env`  — `1`/`0`/`""` for each `NEXT_PUBLIC_USE_*` flag as
 *              the *client bundle* sees it (proves DefinePlugin
 *              actually inlined the value at build time)
 *   - `gate` — the runtime gate booleans the figure builder consults
 *   - `pick` — `glb` when the figure builder will return GLB,
 *              `procedural` otherwise (with the reason)
 *   - `probes` — HTTP HEAD status for each athlete / clip URL
 *   - `loader` — whether `loadGlbAthleteAsset()` returned a populated
 *                cache entry (i.e. the GLTFLoader actually parsed
 *                the bundled mannequin)
 *
 * All values are already public — every `NEXT_PUBLIC_*` var is inlined
 * into the client bundle and visible to anyone who views source. The
 * URLs are static `/athlete/...` paths. No secrets are exposed.
 *
 * **Removal:** when GLB rendering is verified stable in prod, delete
 * this file and the badge mount in `Scenario3DCanvas.tsx` (search for
 * `GlbDebugBadge`). The fix in `imperativeScene.ts` and the
 * `/dev/glb-debug` page can stay as the long-term diagnostic surface.
 */

interface BadgeState {
  /** Client-bundle env values. After webpack DefinePlugin runs,
   *  each is a literal string (or `""` if the var was unset at
   *  build time). */
  env: {
    glb: string
    closeout: string
    backCut: string
  }
  /** Runtime gate booleans — the source of truth the figure builder
   *  consults. */
  gate: { glb: boolean; closeout: boolean; backCut: boolean }
  /** HEAD probe status for each public-folder asset URL. `null`
   *  means the probe is still in flight. */
  probes: Record<string, number | 'fail' | null>
  /** Result of `loadGlbAthleteAsset()`. `null` means the loader
   *  resolved with no cache entry (asset missing, parse failure, or
   *  no `SkinnedMesh` in the GLB). `undefined` means it threw. */
  loader: 'pending' | 'ok' | 'null' | 'error'
}

const ASSET_URLS = [
  GLB_ATHLETE_ASSET_URL,
  GLB_IMPORTED_CLOSEOUT_CLIP_URL,
  GLB_IMPORTED_BACK_CUT_CLIP_URL,
]

/**
 * Computes the renderer pick label that the figure builder *would*
 * return given the current gate state and loader result. Pure: only
 * reads its inputs, no side effects, so the renderer-pick logic can
 * be tested in isolation without mounting the canvas.
 */
export function computeGlbDebugPick(input: {
  gateGlb: boolean
  loader: BadgeState['loader']
}): { pick: 'glb' | 'procedural'; reason: string } {
  if (!input.gateGlb) {
    return { pick: 'procedural', reason: 'env-flag-off' }
  }
  if (input.loader === 'pending') {
    return { pick: 'procedural', reason: 'loader-cold-cache' }
  }
  if (input.loader === 'null') {
    return { pick: 'procedural', reason: 'asset-missing-or-no-skin' }
  }
  if (input.loader === 'error') {
    return { pick: 'procedural', reason: 'loader-threw' }
  }
  return { pick: 'glb', reason: 'gate-on-cache-warm' }
}

export function isGlbDebugBadgeEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('glbDebug') === '1') return true
  } catch {
    // ignore — malformed URL is treated as "off"
  }
  const w = window as unknown as Record<string, unknown>
  return w['__COURTIQ_GLB_DEBUG__'] === true
}

/**
 * Compact `pick:reason` summary across the per-figure decision log.
 * Folds duplicate decisions so 8 procedural figures with the same
 * `glb-cache-cold` reason show up as `procedural:glb-cache-cold ×8`,
 * not eight separate rows. Pure for testability.
 */
export function summarisePlayerFigureDecisions(
  log: readonly PlayerFigureDecision[],
): string {
  if (log.length === 0) return 'no figures yet'
  const counts = new Map<string, number>()
  for (const d of log) {
    const key = `${d.pick}:${d.reason}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([k, n]) => (n === 1 ? k : `${k} ×${n}`))
    .join(' · ')
}

export function GlbDebugBadge() {
  const [state, setState] = useState<BadgeState>(() => ({
    env: {
      glb: process.env.NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW ?? '',
      closeout: process.env.NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP ?? '',
      backCut: process.env.NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP ?? '',
    },
    gate: { glb: false, closeout: false, backCut: false },
    probes: Object.fromEntries(ASSET_URLS.map((u) => [u, null])),
    loader: 'pending',
  }))
  const [decisionsSummary, setDecisionsSummary] = useState<string>(
    'no figures yet',
  )
  const [forceGlb, setForceGlb] = useState(false)

  useEffect(() => {
    let cancelled = false

    setState((prev) => ({
      ...prev,
      gate: {
        glb: isGlbAthletePreviewActive(),
        closeout: isImportedCloseoutClipActive(),
        backCut: isImportedBackCutClipActive(),
      },
    }))

    Promise.all(
      ASSET_URLS.map(async (url): Promise<[string, number | 'fail']> => {
        try {
          const res = await fetch(url, { method: 'HEAD', cache: 'no-store' })
          return [url, res.status]
        } catch {
          return [url, 'fail']
        }
      }),
    ).then((entries) => {
      if (cancelled) return
      setState((prev) => ({
        ...prev,
        probes: Object.fromEntries(entries),
      }))
    })

    void loadGlbAthleteAsset()
      .then((entry) => {
        if (cancelled) return
        setState((prev) => ({ ...prev, loader: entry ? 'ok' : 'null' }))
      })
      .catch(() => {
        if (cancelled) return
        setState((prev) => ({ ...prev, loader: 'error' }))
      })

    // Poll the figure-decision log every 500ms so a scene swap or
    // cold-cache rebuild surfaces in the badge without a parent
    // re-render. Cheap: the badge only mounts behind the
    // `?glbDebug=1` / window-global gate, so production users
    // without the gate never run this interval.
    setForceGlb(_isForceGlbAthletePreview())
    setDecisionsSummary(
      summarisePlayerFigureDecisions(_getPlayerFigureDecisionLog()),
    )
    const decisionPoll = window.setInterval(() => {
      setForceGlb(_isForceGlbAthletePreview())
      setDecisionsSummary(
        summarisePlayerFigureDecisions(_getPlayerFigureDecisionLog()),
      )
    }, 500)

    return () => {
      cancelled = true
      window.clearInterval(decisionPoll)
    }
  }, [])

  const { pick, reason } = computeGlbDebugPick({
    gateGlb: state.gate.glb,
    loader: state.loader,
  })

  const allProbesOk = ASSET_URLS.every((u) => state.probes[u] === 200)
  const anyProbeFailed = ASSET_URLS.some(
    (u) => state.probes[u] != null && state.probes[u] !== 200,
  )

  return (
    <div
      data-glb-debug-badge="1"
      className="pointer-events-none absolute bottom-2 left-2 max-w-[92%] rounded-md bg-black/80 px-2 py-1 font-mono text-[10px] leading-snug text-white shadow-lg"
      style={{ zIndex: 50 }}
    >
      <div>
        <span style={{ color: '#9cf' }}>glb</span>{' '}
        env=<span style={{ color: state.env.glb === '1' ? '#7fdca0' : '#f5a05a' }}>
          {state.env.glb || 'unset'}
        </span>
        {' · '}gate=<span style={{ color: state.gate.glb ? '#7fdca0' : '#f5a05a' }}>
          {String(state.gate.glb)}
        </span>
        {' · '}pick=<span style={{ color: pick === 'glb' ? '#7fdca0' : '#f5a05a' }}>
          {pick}
        </span>{' '}
        <span style={{ opacity: 0.7 }}>({reason})</span>
      </div>
      <div>
        <span style={{ color: '#9cf' }}>figures</span>{' '}
        <span
          style={{
            color: decisionsSummary.startsWith('glb:') ? '#7fdca0' : '#f5a05a',
          }}
        >
          {decisionsSummary}
        </span>
        {forceGlb ? (
          <>
            {' · '}
            <span style={{ color: '#ff79c6', fontWeight: 700 }}>forceGlb=on</span>
          </>
        ) : null}
      </div>
      <div>
        <span style={{ color: '#9cf' }}>probes</span>{' '}
        <span
          style={{
            color: allProbesOk ? '#7fdca0' : anyProbeFailed ? '#f5a05a' : '#ddd',
          }}
        >
          {ASSET_URLS.map((u) => state.probes[u] ?? '…').join(' / ')}
        </span>
        {' · '}
        <span style={{ color: '#9cf' }}>loader</span>{' '}
        <span
          style={{
            color:
              state.loader === 'ok'
                ? '#7fdca0'
                : state.loader === 'pending'
                  ? '#ddd'
                  : '#f5a05a',
          }}
        >
          {state.loader}
        </span>
      </div>
    </div>
  )
}
