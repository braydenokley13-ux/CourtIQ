/**
 * FR-8 Packet 4 — intent motion class + stationary fallback tests.
 *
 * Pin the per-intent classification so the Packet 5 ladder helper
 * has stable inputs to build on.
 */

import { describe, expect, it } from 'vitest'

import {
  ALL_ANIMATION_INTENTS,
  getIntentMotionClass,
  getStationaryFallbackClip,
  type AnimationIntent,
  type IntentMotionClass,
} from './animationIntent'

describe('FR-8 Packet 4 — getIntentMotionClass', () => {
  const STATIONARY: AnimationIntent[] = [
    'IDLE_READY',
    'RECEIVE_READY',
    'SHOT_READY',
    'RESET_HOLD',
    'JAB_OR_RIP',
    'DEFENSIVE_DENY',
  ]
  const MOVING_OFFENSE: AnimationIntent[] = [
    'BACK_CUT',
    'EMPTY_SPACE_CUT',
    'PASS_FOLLOWTHROUGH',
  ]
  const MOVING_DEFENSE: AnimationIntent[] = [
    'CLOSEOUT',
    'SLIDE_RECOVER',
    'DEFENSIVE_HELP_TURN',
  ]

  it.each(STATIONARY)('%s is stationary', (intent) => {
    expect(getIntentMotionClass(intent)).toBe<IntentMotionClass>('stationary')
  })

  it.each(MOVING_OFFENSE)('%s is moving-offense', (intent) => {
    expect(getIntentMotionClass(intent)).toBe<IntentMotionClass>(
      'moving-offense',
    )
  })

  it.each(MOVING_DEFENSE)('%s is moving-defense', (intent) => {
    expect(getIntentMotionClass(intent)).toBe<IntentMotionClass>(
      'moving-defense',
    )
  })

  it('every AnimationIntent has a class — total partition', () => {
    const all = new Set([...STATIONARY, ...MOVING_OFFENSE, ...MOVING_DEFENSE])
    expect(all.size).toBe(ALL_ANIMATION_INTENTS.length)
    for (const intent of ALL_ANIMATION_INTENTS) {
      expect(all.has(intent)).toBe(true)
    }
  })

  it('determinism — same intent always returns the same class', () => {
    for (const intent of ALL_ANIMATION_INTENTS) {
      expect(getIntentMotionClass(intent)).toBe(getIntentMotionClass(intent))
    }
  })
})

describe('FR-8 Packet 4 — getStationaryFallbackClip', () => {
  it('DEFENSIVE_DENY routes to defensive_deny — the dedicated denial pose', () => {
    expect(getStationaryFallbackClip('DEFENSIVE_DENY')).toBe('defensive_deny')
  })

  it('every non-denial stationary intent routes to receive_ready', () => {
    expect(getStationaryFallbackClip('IDLE_READY')).toBe('receive_ready')
    expect(getStationaryFallbackClip('RECEIVE_READY')).toBe('receive_ready')
    expect(getStationaryFallbackClip('SHOT_READY')).toBe('receive_ready')
    expect(getStationaryFallbackClip('RESET_HOLD')).toBe('receive_ready')
    expect(getStationaryFallbackClip('JAB_OR_RIP')).toBe('receive_ready')
  })

  it('every moving intent forced to its stationary fallback routes to receive_ready', () => {
    // The ladder will use this when it has to drop a moving clip
    // (e.g. cache miss or feature flag drop). Prefer a planted
    // athletic stance over freezing in bind.
    expect(getStationaryFallbackClip('BACK_CUT')).toBe('receive_ready')
    expect(getStationaryFallbackClip('EMPTY_SPACE_CUT')).toBe('receive_ready')
    expect(getStationaryFallbackClip('PASS_FOLLOWTHROUGH')).toBe('receive_ready')
    expect(getStationaryFallbackClip('CLOSEOUT')).toBe('receive_ready')
    expect(getStationaryFallbackClip('SLIDE_RECOVER')).toBe('receive_ready')
    expect(getStationaryFallbackClip('DEFENSIVE_HELP_TURN')).toBe('receive_ready')
  })

  it('every intent has a stationary fallback that is NOT cut_sprint or defense_slide', () => {
    // Stationary fallbacks must hold a pose, never play a moving
    // clip. cut_sprint and defense_slide are by definition moving
    // — they are never valid stationary fallbacks.
    for (const intent of ALL_ANIMATION_INTENTS) {
      const clip = getStationaryFallbackClip(intent)
      expect(clip).not.toBe('cut_sprint')
      expect(clip).not.toBe('defense_slide')
    }
  })
})
