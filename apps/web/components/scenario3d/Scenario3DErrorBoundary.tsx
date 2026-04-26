'use client'

import * as React from 'react'

interface Scenario3DErrorBoundaryProps {
  /** Optional id (scenario id or concept tag) included in the error log. */
  scenarioId?: string
  children: React.ReactNode
}

interface Scenario3DErrorBoundaryState {
  error: Error | null
  attempt: number
}

/**
 * Catches any error thrown inside the 3D canvas tree (R3F itself wraps its
 * own children, but it re-throws errors out to React on each render). We
 * isolate the failure to the court area so the rest of /train keeps working,
 * and offer a retry that remounts the canvas.
 */
export class Scenario3DErrorBoundary extends React.Component<
  Scenario3DErrorBoundaryProps,
  Scenario3DErrorBoundaryState
> {
  constructor(props: Scenario3DErrorBoundaryProps) {
    super(props)
    this.state = { error: null, attempt: 0 }
  }

  static getDerivedStateFromError(error: Error): Partial<Scenario3DErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (typeof console !== 'undefined') {
      console.error('[scenario3d] render error', {
        scenarioId: this.props.scenarioId,
        message: error.message,
        componentStack: info.componentStack,
      })
    }
  }

  private handleRetry = () => {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))
  }

  render() {
    if (this.state.error) {
      const isDev = process.env.NODE_ENV !== 'production'
      return (
        <div
          role="alert"
          className="flex h-[280px] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-hairline-2 bg-bg-1 px-6 text-center text-text"
        >
          <div className="font-display text-[15px] font-bold text-heat">
            3D scene failed to load
          </div>
          <p className="max-w-[280px] text-[12px] text-text-dim">
            We had trouble drawing this play. You can keep going — the question still works.
          </p>
          {isDev ? (
            <pre className="max-w-full overflow-hidden text-ellipsis text-[10px] text-text-dim">
              {this.state.error.message}
            </pre>
          ) : null}
          <button
            type="button"
            onClick={this.handleRetry}
            className="rounded-xl border border-hairline-2 bg-bg-2 px-4 py-2 font-display text-[12px] font-bold uppercase tracking-[1px] text-text active:scale-[0.99]"
          >
            Try again
          </button>
        </div>
      )
    }

    // Re-mount the children with a key tied to attempt + scenario so a
    // retry actually rebuilds the canvas (refs and GL context).
    return (
      <React.Fragment key={`${this.props.scenarioId ?? 'scene'}-${this.state.attempt}`}>
        {this.props.children}
      </React.Fragment>
    )
  }
}
