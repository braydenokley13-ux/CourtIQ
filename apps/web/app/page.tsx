export default function HomePage() {
  return (
    <main className="min-h-screen bg-bg-0 flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="font-display text-4xl font-bold text-foreground">CourtIQ</h1>
        <p className="text-foreground-dim">Train your basketball IQ.</p>
        <a
          href="/design-system"
          className="inline-block text-brand text-sm underline underline-offset-4"
        >
          View design system →
        </a>
      </div>
    </main>
  )
}
