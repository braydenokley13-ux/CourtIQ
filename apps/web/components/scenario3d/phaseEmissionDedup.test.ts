/* @vitest-environment jsdom */
/**
 * V1 UX completion — phase-emission dedup.
 *
 * Pre-V1, when `?simple=0` was set on the URL the canvas mounted BOTH
 * the imperative `ReplayStateMachine` AND the JSX
 * `ScenarioReplayController` and forwarded every transition from each
 * to the parent's `onPhase` callback. The two emitters share the
 * `idle/setup/playing/frozen/consequence/replaying/done` values, so
 * the same phase could fire twice in a row — and the FR-4 dispatcher
 * useEffect + FR-5 overlay-bridge effect would re-flush each time.
 *
 * V1 routes both emitters through a single dedup helper that stamps
 * the most-recently-emitted phase in a ref and skips the fan-out
 * when the next emitter pushes the same value.
 *
 * This test is a structural regression over `Scenario3DCanvas.tsx`
 * (we don't mount the renderer here — that needs THREE.js / WebGL):
 * it asserts that BOTH emitters call the dedup helper and that the
 * helper's identity guard is in place.
 */

import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const CANVAS_SOURCE = fs.readFileSync(
  path.resolve(__dirname, 'Scenario3DCanvas.tsx'),
  'utf8',
)

describe('Scenario3DCanvas — phase emission dedup', () => {
  it('declares a single emitPhaseRef helper that guards on lastEmittedPhaseRef', () => {
    expect(CANVAS_SOURCE).toMatch(/const lastEmittedPhaseRef = useRef<ReplayPhase \| null>\(null\)/)
    expect(CANVAS_SOURCE).toMatch(/const emitPhaseRef = useRef<\(\(phase: ReplayPhase\) => void\) \| null>\(null\)/)
    expect(CANVAS_SOURCE).toMatch(/if \(lastEmittedPhaseRef\.current === phase\) return/)
  })

  it('imperative ReplayStateMachine subscriber routes through emitPhaseRef', () => {
    // Match the unsubscribe = machine.subscribe(...) handler. Inside,
    // the dedup helper must be the only call that updates phase state
    // (no direct setFilmRoomReplayPhase, no direct phaseListener?.()).
    const subBlock = CANVAS_SOURCE.match(
      /const unsubscribe = machine\.subscribe\(\(\{ state \}\) => \{[\s\S]*?\n\s+\}\)/,
    )
    expect(subBlock, 'machine.subscribe block not found').not.toBeNull()
    const body = subBlock![0]
    expect(body).toMatch(/emitPhaseRef\.current\?\.\(next\)/)
    // Dedup contract: the imperative-machine subscriber MUST go
    // through the dedup helper; direct setFilmRoomReplayPhase /
    // phaseListener?.( forwards inside the subscriber would bypass
    // the dedup and re-introduce double-firing.
    expect(body).not.toMatch(/setFilmRoomReplayPhase\(next\)/)
    expect(body).not.toMatch(/phaseListener\?\.\(next\)/)
  })

  it('JSX ScenarioScene3D onPhase routes through emitPhaseRef', () => {
    // Match the inline `onPhase={(p) => { ... }}` block on the
    // ScenarioScene3D JSX. Should call emitPhaseRef.current?.(p).
    const onPhaseBlock = CANVAS_SOURCE.match(
      /onPhase=\{\(p\) => \{[\s\S]*?\}\}/,
    )
    expect(onPhaseBlock, 'JSX onPhase block not found').not.toBeNull()
    const body = onPhaseBlock![0]
    expect(body).toMatch(/emitPhaseRef\.current\?\.\(p\)/)
    // Same constraint as the imperative path — direct
    // setFilmRoomReplayPhase / onPhase calls bypass the dedup.
    expect(body).not.toMatch(/setFilmRoomReplayPhase\(p\)/)
  })

  it('dedup ref is reset on scene rebuild so new scenarios re-emit idle/setup/playing', () => {
    expect(CANVAS_SOURCE).toMatch(
      /lastEmittedPhaseRef\.current = null/,
    )
  })
})

// =====================================================================
// Functional regression — exercise the dedup helper's logic in
// isolation. We can't construct the closure inside the React
// component here, but the helper's contract is small enough to
// re-implement and pin: same phase twice = one emit.
// =====================================================================

function makeEmitter(forward: (phase: string) => void) {
  let last: string | null = null
  return (phase: string) => {
    if (last === phase) return
    last = phase
    forward(phase)
  }
}

describe('phase-emission dedup helper contract', () => {
  it('forwards the first emission for a given phase', () => {
    const seen: string[] = []
    const emit = makeEmitter((p) => seen.push(p))
    emit('frozen')
    expect(seen).toEqual(['frozen'])
  })

  it('drops a duplicate of the most-recent phase', () => {
    const seen: string[] = []
    const emit = makeEmitter((p) => seen.push(p))
    emit('frozen')
    emit('frozen')
    expect(seen).toEqual(['frozen'])
  })

  it('forwards a different next phase', () => {
    const seen: string[] = []
    const emit = makeEmitter((p) => seen.push(p))
    emit('frozen')
    emit('consequence')
    emit('replaying')
    expect(seen).toEqual(['frozen', 'consequence', 'replaying'])
  })

  it('A → B → A re-emits A (only consecutive duplicates are dropped)', () => {
    const seen: string[] = []
    const emit = makeEmitter((p) => seen.push(p))
    emit('frozen')
    emit('cueRepaint')
    emit('frozen')
    expect(seen).toEqual(['frozen', 'cueRepaint', 'frozen'])
  })

  it('cueRepaint flows through (only the JSX path emits it)', () => {
    // Imperative machine: idle → setup → playing → frozen → consequence → replaying → done
    // JSX controller (?simple=0): same path PLUS cueRepaint between
    // consequence and replaying.
    const seen: string[] = []
    const emit = makeEmitter((p) => seen.push(p))
    // Imperative machine reaches frozen first.
    emit('frozen')
    // User picks → both emitters reach consequence; second is dropped.
    emit('consequence')
    emit('consequence')
    // JSX controller emits cueRepaint (imperative does not).
    emit('cueRepaint')
    // Both emitters reach replaying; second is dropped.
    emit('replaying')
    emit('replaying')
    emit('done')
    expect(seen).toEqual([
      'frozen',
      'consequence',
      'cueRepaint',
      'replaying',
      'done',
    ])
  })

  it('a redundant initial emission of the starting phase is dropped only when the helper has already emitted', () => {
    // Mount race: the imperative state-machine subscriber fires once
    // synchronously with the current state ('idle'). If the JSX
    // controller also reports 'idle' as its first phase, it should
    // be dropped. But the FIRST 'idle' must propagate so the parent
    // can reset its UI.
    const seen: string[] = []
    const emit = makeEmitter((p) => seen.push(p))
    emit('idle') // imperative subscriber
    emit('idle') // JSX controller
    emit('setup')
    emit('playing')
    expect(seen).toEqual(['idle', 'setup', 'playing'])
  })
})
