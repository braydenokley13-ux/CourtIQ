import Link from 'next/link'

/**
 * Branded 404 served by the App Router whenever notFound() is called
 * or a route doesn't match. Inherits the root layout's fonts +
 * `dark` html class so the CourtIQ token palette resolves correctly.
 */
export default function NotFound() {
  return (
    <main className="min-h-[100dvh] bg-bg-0 text-foreground flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-foreground-mute mb-3">
          404 · Not found
        </p>
        <h1 className="font-display font-bold text-3xl leading-tight mb-3">
          Off the court.
        </h1>
        <p className="font-ui text-[15px] text-foreground-dim mb-8">
          The page you&apos;re looking for doesn&apos;t exist or moved.
          Let&apos;s get you back in the rotation.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center h-[58px] px-7 rounded-xl bg-brand text-brand-ink font-display font-bold uppercase tracking-[0.3px] text-[17px] shadow-brand"
        >
          Back to CourtIQ
        </Link>
      </div>
    </main>
  )
}
