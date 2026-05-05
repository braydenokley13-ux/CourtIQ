import type { ReactNode } from 'react'

/**
 * FR-2 Packet 1 — server-rendered GLB asset preload hint.
 *
 * Emits a `<link rel="preload" as="fetch">` tag in the HTML head for
 * `/train/*` routes so the browser begins fetching the bundled
 * mannequin GLB the moment the HTML lands, before any client JS has
 * evaluated. Combined with the module-level preload inside
 * `Scenario3DView` and the `useEffect` preload inside
 * `Scenario3DCanvas`, this gives three independent triggers that
 * together remove the cold-cache "procedural-then-GLB" flicker on
 * the very first scenario after a page navigation.
 *
 * Gated on the same `NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW='1'` env var
 * the runtime gate consults, so a build with the flag off never adds
 * the 1.4 MB preload to non-GLB traffic. The env var is read at build
 * time on the server (the layout is a server component) and inlined
 * into the rendered HTML — the same shape as the runtime gate, so
 * preload presence is in lockstep with the renderer's GLB pick.
 *
 * `crossOrigin="anonymous"` matches the loader's `fetch` defaults so
 * the preload entry is reused by `GLTFLoader`'s subsequent fetch
 * instead of triggering a duplicate request.
 */
const GLB_PRELOAD_ENABLED =
  process.env.NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW === '1'

export default function TrainLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {GLB_PRELOAD_ENABLED ? (
        <link
          rel="preload"
          href="/athlete/mannequin.glb"
          as="fetch"
          type="model/gltf-binary"
          crossOrigin="anonymous"
        />
      ) : null}
      {children}
    </>
  )
}
