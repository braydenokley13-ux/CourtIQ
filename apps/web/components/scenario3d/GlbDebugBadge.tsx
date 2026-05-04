'use client'

import { useEffect, useState } from 'react'
import * as THREE from 'three'
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
  /** HEAD probe + content-type for each public-folder asset URL.
   *  `httpStatus: null` means the probe is still in flight. */
  probes: Record<
    string,
    {
      httpStatus: number | 'fail' | null
      contentType: string | null
      bytes: number | null
    }
  >
  /** Result of `loadGlbAthleteAsset()`. `null` means the loader
   *  resolved with no cache entry (asset missing, parse failure, or
   *  no `SkinnedMesh` in the GLB). `undefined` means it threw. */
  loader: 'pending' | 'ok' | 'null' | 'error'
  /** When the loader resolves successfully, summary of what is in
   *  the asset. Lets a tester confirm the expected mesh / bone /
   *  material counts without opening the file. */
  loaderDetail: {
    sceneChildCount: number
    meshCount: number
    skinnedMeshCount: number
    boneCount: number
    materialCount: number
    materialNames: string[]
    embeddedClipNames: string[]
  } | null
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
    // Accept both `glbDebug=1` (historical, `/dev/glb-debug` heritage)
    // and `debugGlb=1` (the spelling QA & docs reach for first because
    // it groups with `forceGlb`). Either turns on the badge + console
    // logs so a tester does not have to guess the casing.
    if (params.get('glbDebug') === '1') return true
    if (params.get('debugGlb') === '1') return true
    // forceGlb is itself a diagnostic mode — auto-enable the badge so
    // a tester running `?forceGlb=1` always sees why the renderer
    // picked what it picked, not just the magenta marker.
    if (params.get('forceGlb') === '1') return true
  } catch {
    // ignore — malformed URL is treated as "off"
  }
  const w = window as unknown as Record<string, unknown>
  return w['__COURTIQ_GLB_DEBUG__'] === true
}

/**
 * `[GLB_DEBUG]` console.info channel — silent in production unless
 * `?glbDebug=1`, `?debugGlb=1`, or `?forceGlb=1` is on the URL (or
 * `window.__COURTIQ_GLB_DEBUG__` was set from devtools). All three
 * URL params share the badge / console gate above, so a tester only
 * has to set one to get the full diagnostic surface.
 *
 * Always-on logs would clutter every prod console; gating on the
 * debug flag keeps the channel quiet for normal users while still
 * giving operators a single grep-able prefix for asset / loader /
 * decision events when they need it.
 */
export function glbDebugLog(message: string, data?: unknown): void {
  if (!isGlbDebugBadgeEnabled()) return
  if (typeof console === 'undefined') return
  // eslint-disable-next-line no-console
  if (data === undefined) console.info(`[GLB_DEBUG] ${message}`)
  else console.info(`[GLB_DEBUG] ${message}`, data)
}

/**
 * Synchronous URL-based check for forceGlb=1. Avoids React-state
 * races at mount where the load effect needs to know whether forceGlb
 * is on before the React state has hydrated.
 */
export function isForceGlbUrlActive(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get('forceGlb') === '1'
  } catch {
    return false
  }
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

/**
 * Walks a loaded GLTF scene and counts the diagnostic fields the
 * debug overlay surfaces (mesh / skinned-mesh / bone / material
 * count, plus material and embedded-clip names). Pure / synchronous;
 * tolerates missing fields so a partial GLTF does not throw the
 * badge into an error state.
 */
export function summariseGlbAssetDetail(
  scene: THREE.Object3D,
  embeddedAnimations: readonly THREE.AnimationClip[] | null,
): NonNullable<BadgeState['loaderDetail']> {
  let sceneChildCount = scene.children.length
  let meshCount = 0
  let skinnedMeshCount = 0
  const bones = new Set<string>()
  const materialNames = new Set<string>()
  scene.traverse((child) => {
    const obj = child as THREE.Object3D & {
      isMesh?: boolean
      isSkinnedMesh?: boolean
      isBone?: boolean
      material?: THREE.Material | THREE.Material[]
    }
    if (obj.isSkinnedMesh) skinnedMeshCount += 1
    if (obj.isMesh) {
      meshCount += 1
      const m = obj.material
      if (Array.isArray(m)) {
        for (const mm of m) materialNames.add(mm.name || '<unnamed>')
      } else if (m) {
        materialNames.add(m.name || '<unnamed>')
      }
    }
    if (obj.isBone) bones.add(obj.name)
  })
  // Include the root if it itself counts as a child container.
  void sceneChildCount
  return {
    sceneChildCount,
    meshCount,
    skinnedMeshCount,
    boneCount: bones.size,
    materialCount: materialNames.size,
    materialNames: Array.from(materialNames).sort(),
    embeddedClipNames: (embeddedAnimations ?? []).map((c) => c.name),
  }
}

export function GlbDebugBadge() {
  const [state, setState] = useState<BadgeState>(() => ({
    env: {
      glb: process.env.NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW ?? '',
      closeout: process.env.NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP ?? '',
      backCut: process.env.NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP ?? '',
    },
    gate: { glb: false, closeout: false, backCut: false },
    probes: Object.fromEntries(
      ASSET_URLS.map((u) => [
        u,
        { httpStatus: null, contentType: null, bytes: null },
      ]),
    ),
    loader: 'pending',
    loaderDetail: null,
  }))
  const [decisions, setDecisions] = useState<readonly PlayerFigureDecision[]>(
    [],
  )
  const [forceGlb, setForceGlb] = useState(false)
  const [expanded, setExpanded] = useState(true)

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
      ASSET_URLS.map(
        async (
          url,
        ): Promise<
          [string, BadgeState['probes'][string]]
        > => {
          try {
            const res = await fetch(url, {
              method: 'HEAD',
              cache: 'no-store',
            })
            const contentType = res.headers.get('content-type')
            const length = res.headers.get('content-length')
            return [
              url,
              {
                httpStatus: res.status,
                contentType,
                bytes: length ? Number(length) : null,
              },
            ]
          } catch {
            return [
              url,
              { httpStatus: 'fail', contentType: null, bytes: null },
            ]
          }
        },
      ),
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
        if (!entry) {
          setState((prev) => ({ ...prev, loader: 'null', loaderDetail: null }))
          return
        }
        const detail = summariseGlbAssetDetail(
          entry.gltf.scene,
          entry.gltf.animations ?? null,
        )
        setState((prev) => ({ ...prev, loader: 'ok', loaderDetail: detail }))
      })
      .catch(() => {
        if (cancelled) return
        setState((prev) => ({ ...prev, loader: 'error', loaderDetail: null }))
      })

    // Poll the figure-decision log every 500ms so a scene swap or
    // cold-cache rebuild surfaces in the badge without a parent
    // re-render. Cheap: the badge only mounts behind the
    // `?glbDebug=1` / `?debugGlb=1` / `?forceGlb=1` / window-global
    // gate, so production users without the gate never run this
    // interval.
    setForceGlb(_isForceGlbAthletePreview())
    setDecisions([..._getPlayerFigureDecisionLog()])
    const decisionPoll = window.setInterval(() => {
      setForceGlb(_isForceGlbAthletePreview())
      setDecisions([..._getPlayerFigureDecisionLog()])
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

  const allProbesOk = ASSET_URLS.every(
    (u) => state.probes[u]?.httpStatus === 200,
  )
  const anyProbeFailed = ASSET_URLS.some((u) => {
    const s = state.probes[u]?.httpStatus
    return s != null && s !== 200
  })

  const decisionsSummary = summarisePlayerFigureDecisions(decisions)
  const markerCount = decisions.filter((d) => d.pick === 'force-glb-marker')
    .length
  const proceduralCount = decisions.filter((d) => d.pick === 'procedural')
    .length
  const glbCount = decisions.filter((d) => d.pick === 'glb').length

  // Render mode summary — what the user is actually looking at.
  const renderMode = (() => {
    if (markerCount > 0) return 'proxy-error (forceGlb failed)'
    if (decisions.length === 0) return 'pending'
    if (glbCount === decisions.length) return 'GLB'
    if (proceduralCount === decisions.length) return 'procedural'
    return 'mixed'
  })()

  return (
    <div
      data-glb-debug-badge="1"
      className="pointer-events-auto absolute bottom-2 left-2 max-w-[92%] rounded-md bg-black/85 px-2 py-1 font-mono text-[10px] leading-snug text-white shadow-lg"
      style={{ zIndex: 50, maxHeight: '70vh', overflow: 'auto' }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
      >
        <span style={{ color: '#9cf', fontWeight: 700 }}>GLB DEBUG</span>
        <span style={{ opacity: 0.7 }}>{expanded ? '▼' : '▶'}</span>
        <span
          style={{
            color: renderMode.startsWith('GLB')
              ? '#7fdca0'
              : renderMode.includes('proxy')
                ? '#ff79c6'
                : '#f5a05a',
            fontWeight: 700,
          }}
        >
          mode={renderMode}
        </span>
        {forceGlb ? (
          <span style={{ color: '#ff79c6', fontWeight: 700 }}>
            forceGlb=on
          </span>
        ) : null}
      </div>

      <div>
        <span style={{ color: '#9cf' }}>glb</span>{' '}
        env=
        <span style={{ color: state.env.glb === '1' ? '#7fdca0' : '#f5a05a' }}>
          {state.env.glb || 'unset'}
        </span>
        {' · '}gate=
        <span style={{ color: state.gate.glb ? '#7fdca0' : '#f5a05a' }}>
          {String(state.gate.glb)}
        </span>
        {' · '}pick=
        <span style={{ color: pick === 'glb' ? '#7fdca0' : '#f5a05a' }}>
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
      </div>
      <div>
        <span style={{ color: '#9cf' }}>probes</span>{' '}
        <span
          style={{
            color: allProbesOk ? '#7fdca0' : anyProbeFailed ? '#f5a05a' : '#ddd',
          }}
        >
          {ASSET_URLS.map((u) => state.probes[u]?.httpStatus ?? '…').join(' / ')}
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

      {expanded ? (
        <>
          <div style={{ marginTop: 4, opacity: 0.85 }}>
            <span style={{ color: '#9cf' }}>flags</span>{' '}
            closeout=
            <span style={{ color: state.gate.closeout ? '#7fdca0' : '#888' }}>
              {String(state.gate.closeout)}
            </span>
            {' · '}backCut=
            <span style={{ color: state.gate.backCut ? '#7fdca0' : '#888' }}>
              {String(state.gate.backCut)}
            </span>
          </div>

          <div style={{ marginTop: 4 }}>
            <div style={{ color: '#9cf' }}>asset URLs / status</div>
            {ASSET_URLS.map((url) => {
              const probe = state.probes[url]
              const ok = probe?.httpStatus === 200
              return (
                <div key={url} style={{ paddingLeft: 6 }}>
                  <span style={{ opacity: 0.85 }}>{url}</span>{' '}
                  <span
                    style={{
                      color: ok
                        ? '#7fdca0'
                        : probe?.httpStatus == null
                          ? '#ddd'
                          : '#f5a05a',
                    }}
                  >
                    {probe?.httpStatus ?? '…'}
                  </span>
                  {probe?.contentType ? (
                    <span style={{ opacity: 0.7 }}>
                      {' '}
                      · {probe.contentType}
                    </span>
                  ) : null}
                  {probe?.bytes != null ? (
                    <span style={{ opacity: 0.7 }}> · {probe.bytes}B</span>
                  ) : null}
                </div>
              )
            })}
          </div>

          {state.loaderDetail ? (
            <div style={{ marginTop: 4 }}>
              <div style={{ color: '#9cf' }}>athlete GLB content</div>
              <div style={{ paddingLeft: 6 }}>
                meshes={state.loaderDetail.meshCount} · skinned=
                {state.loaderDetail.skinnedMeshCount} · bones=
                {state.loaderDetail.boneCount} · materials=
                {state.loaderDetail.materialCount}
              </div>
              {state.loaderDetail.materialNames.length > 0 ? (
                <div style={{ paddingLeft: 6, opacity: 0.7 }}>
                  matNames=[{state.loaderDetail.materialNames.join(', ')}]
                </div>
              ) : null}
              {state.loaderDetail.embeddedClipNames.length > 0 ? (
                <div style={{ paddingLeft: 6, opacity: 0.7 }}>
                  embeddedClips=[
                  {state.loaderDetail.embeddedClipNames.join(', ')}]
                </div>
              ) : (
                <div style={{ paddingLeft: 6, opacity: 0.7 }}>
                  embeddedClips=[] (clip GLBs loaded separately)
                </div>
              )}
            </div>
          ) : null}

          {decisions.length > 0 ? (
            <div style={{ marginTop: 4 }}>
              <div style={{ color: '#9cf' }}>
                per-figure decisions ({decisions.length})
              </div>
              {decisions.map((d, i) => (
                <div key={i} style={{ paddingLeft: 6 }}>
                  <span
                    style={{
                      color:
                        d.pick === 'glb'
                          ? '#7fdca0'
                          : d.pick === 'force-glb-marker'
                            ? '#ff79c6'
                            : '#f5a05a',
                      fontWeight: 600,
                    }}
                  >
                    [{i}] {d.pick}
                  </span>{' '}
                  <span style={{ opacity: 0.7 }}>({d.reason})</span>
                  {d.error ? (
                    <span style={{ opacity: 0.6 }}> · err: {d.error}</span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {markerCount > 0 ? (
            <div
              style={{
                marginTop: 4,
                color: '#ff79c6',
                fontWeight: 700,
              }}
            >
              ⚠ magenta proxy active for {markerCount}/{decisions.length}{' '}
              figure(s) — forceGlb=1 was set but GLB build failed (see
              decision reasons above)
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
