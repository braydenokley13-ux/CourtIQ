'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: '#0a0a0a',
          color: '#fafafa',
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center', padding: '2rem', maxWidth: 480 }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>
            Something went wrong
          </h1>
          <p style={{ opacity: 0.7, marginBottom: '1.5rem' }}>
            Try opening CourtIQ again.
          </p>
          {error.digest && <p style={{ opacity: 0.5, fontSize: 12 }}>Reference: {error.digest}</p>}
          <button
            onClick={reset}
            style={{
              background: '#fafafa',
              color: '#0a0a0a',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.625rem 1.25rem',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
