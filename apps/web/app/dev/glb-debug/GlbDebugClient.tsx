'use client'

import { useEffect, useState } from 'react'
import {
  isGlbAthletePreviewActive,
  isImportedBackCutClipActive,
  isImportedCloseoutClipActive,
} from '@/components/scenario3d/imperativeScene'
import {
  GLB_ATHLETE_ASSET_URL,
  GLB_IMPORTED_BACK_CUT_CLIP_URL,
  GLB_IMPORTED_CLOSEOUT_CLIP_URL,
  loadGlbAthleteAsset,
} from '@/components/scenario3d/glbAthlete'

interface ServerEnv {
  NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW: string
  NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP: string
  NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP: string
  NEXT_PUBLIC_COMMIT_SHA: string
  NODE_ENV: string
}

interface AssetProbe {
  url: string
  status: 'pending' | 'ok' | 'error'
  httpStatus?: number
  contentType?: string | null
  bytes?: number
  error?: string
}

const ASSET_URLS = [
  GLB_ATHLETE_ASSET_URL,
  GLB_IMPORTED_CLOSEOUT_CLIP_URL,
  GLB_IMPORTED_BACK_CUT_CLIP_URL,
]

/**
 * Client-bundle GLB debug readout. Exposes:
 *   - the env-flag values the *client* sees (these are the ones the
 *     renderer consults; the server values rendered above prove the
 *     deploy got the env, the client values prove the build inlined
 *     them — both must be `'1'` for GLB to render)
 *   - each runtime gate boolean (`isGlbAthletePreviewActive` etc.)
 *   - one HEAD probe per asset URL so a 200 / 4xx / 5xx is visible
 *     here without opening DevTools
 *   - whether `loadGlbAthleteAsset()` resolved with a cache entry
 *     (i.e. the GLTFLoader actually parsed the bundled mannequin)
 */
export function GlbDebugClient({ serverEnv }: { serverEnv: ServerEnv }) {
  // Client-bundle env values. Each is a static `process.env.LITERAL`
  // member expression so webpack's DefinePlugin replaces it at build
  // time with the literal string from the build environment.
  const clientEnv = {
    NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW:
      process.env.NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW ?? '',
    NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP:
      process.env.NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP ?? '',
    NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP:
      process.env.NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP ?? '',
    NEXT_PUBLIC_COMMIT_SHA: process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'unknown',
    NODE_ENV: process.env.NODE_ENV ?? 'unknown',
  }

  const [gates, setGates] = useState<{
    glb: boolean
    closeout: boolean
    backCut: boolean
  } | null>(null)
  const [probes, setProbes] = useState<AssetProbe[]>(
    ASSET_URLS.map((url) => ({ url, status: 'pending' })),
  )
  const [loaderResult, setLoaderResult] = useState<
    'pending' | 'ok' | 'null' | 'error'
  >('pending')

  useEffect(() => {
    setGates({
      glb: isGlbAthletePreviewActive(),
      closeout: isImportedCloseoutClipActive(),
      backCut: isImportedBackCutClipActive(),
    })

    let cancelled = false
    Promise.all(
      ASSET_URLS.map(async (url): Promise<AssetProbe> => {
        try {
          const res = await fetch(url, { method: 'HEAD', cache: 'no-store' })
          const length = res.headers.get('content-length')
          return {
            url,
            status: res.ok ? 'ok' : 'error',
            httpStatus: res.status,
            contentType: res.headers.get('content-type'),
            bytes: length ? Number(length) : undefined,
          }
        } catch (err) {
          return {
            url,
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          }
        }
      }),
    ).then((next) => {
      if (cancelled) return
      setProbes(next)
    })

    void loadGlbAthleteAsset()
      .then((entry) => {
        if (cancelled) return
        setLoaderResult(entry ? 'ok' : 'null')
      })
      .catch(() => {
        if (cancelled) return
        setLoaderResult('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const envMatches =
    clientEnv.NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW ===
      serverEnv.NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW &&
    clientEnv.NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP ===
      serverEnv.NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP &&
    clientEnv.NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP ===
      serverEnv.NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP

  return (
    <main
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        padding: '24px',
        maxWidth: 920,
        margin: '0 auto',
        color: '#e6e6e6',
        background: '#111',
        minHeight: '100vh',
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <h1 style={{ fontSize: 18, marginBottom: 4 }}>GLB Debug Readout</h1>
      <p style={{ opacity: 0.7, marginBottom: 24 }}>
        P3.3B — production-safe verification surface. All values shown
        here are already public (NEXT_PUBLIC_* are inlined into the
        client bundle).
      </p>

      <Section title={`Build / commit (${envMatches ? 'env aligned' : 'ENV MISMATCH'})`}>
        <Row label="NEXT_PUBLIC_COMMIT_SHA" value={clientEnv.NEXT_PUBLIC_COMMIT_SHA} />
        <Row label="NODE_ENV (client bundle)" value={clientEnv.NODE_ENV} />
        <Row label="NODE_ENV (server)" value={serverEnv.NODE_ENV} />
      </Section>

      <Section title="Env flags (client bundle, what the renderer reads)">
        <Row
          label="NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW"
          value={quote(clientEnv.NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW)}
          good={clientEnv.NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW === '1'}
        />
        <Row
          label="NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP"
          value={quote(clientEnv.NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP)}
          good={clientEnv.NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP === '1'}
        />
        <Row
          label="NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP"
          value={quote(clientEnv.NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP)}
          good={clientEnv.NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP === '1'}
        />
      </Section>

      <Section title="Env flags (server, what Vercel injected at build)">
        <Row
          label="NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW"
          value={quote(serverEnv.NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW)}
        />
        <Row
          label="NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP"
          value={quote(serverEnv.NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP)}
        />
        <Row
          label="NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP"
          value={quote(serverEnv.NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP)}
        />
      </Section>

      <Section title="Runtime gates (what buildPlayerFigure consults)">
        <Row
          label="isGlbAthletePreviewActive()"
          value={gates ? String(gates.glb) : 'measuring…'}
          good={gates?.glb}
        />
        <Row
          label="isImportedCloseoutClipActive()"
          value={gates ? String(gates.closeout) : 'measuring…'}
          good={gates?.closeout}
        />
        <Row
          label="isImportedBackCutClipActive()"
          value={gates ? String(gates.backCut) : 'measuring…'}
          good={gates?.backCut}
        />
      </Section>

      <Section title="Asset HEAD probes (what the loader will fetch)">
        {probes.map((p) => (
          <Row
            key={p.url}
            label={p.url}
            value={
              p.status === 'pending'
                ? 'measuring…'
                : p.status === 'ok'
                  ? `${p.httpStatus} ${p.contentType ?? ''} ${
                      p.bytes != null ? `${p.bytes}B` : ''
                    }`
                  : `${p.httpStatus ?? 'fetch failed'} ${p.error ?? ''}`
            }
            good={p.status === 'ok'}
          />
        ))}
      </Section>

      <Section title="Loader cold-load result">
        <Row
          label="loadGlbAthleteAsset()"
          value={
            loaderResult === 'pending'
              ? 'loading…'
              : loaderResult === 'ok'
                ? 'cache populated (GLTFLoader parsed the mannequin)'
                : loaderResult === 'null'
                  ? 'resolved with null (asset missing or no SkinnedMesh)'
                  : 'threw'
          }
          good={loaderResult === 'ok'}
        />
      </Section>

      <p style={{ opacity: 0.6, marginTop: 24 }}>
        Renderer selection (what `buildPlayerFigure` returns):
        <br />
        {gates?.glb
          ? 'GLB mannequin path (procedural fallback only on per-figure throw or if the loader cache is still cold at first build)'
          : 'procedural Phase F figure (env flag is off, so the GLB path is never entered)'}
      </p>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 20, border: '1px solid #2a2a2a', padding: 12 }}>
      <h2 style={{ fontSize: 13, marginBottom: 8, color: '#9cf' }}>{title}</h2>
      <div>{children}</div>
    </section>
  )
}

function Row({
  label,
  value,
  good,
}: {
  label: string
  value: string
  good?: boolean
}) {
  const color = good == null ? '#ddd' : good ? '#7fdca0' : '#f5a05a'
  return (
    <div style={{ display: 'flex', gap: 12, padding: '2px 0' }}>
      <span style={{ flex: '0 0 56%', opacity: 0.85 }}>{label}</span>
      <span style={{ flex: '1 1 auto', color, fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function quote(s: string): string {
  return `"${s}"`
}
