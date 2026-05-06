/**
 * V3 P8 — home Pathway CTA banding contract tests.
 *
 * Lock the four bands so a copy edit or a progress-shape regression
 * can't silently flip a brand-new player out of the cold-start path
 * or send a mastered player into a "continue" message.
 */

import { describe, expect, it } from 'vitest'

import {
  FOUNDATION_DETAIL_HREF,
  pickHomePathwayCta,
  type HomePathwayLite,
} from './homePathwayCta'

const RECOMMENDED: HomePathwayLite['recommendedNext'] = {
  trainHref: '/train?pathway=foo&chapter=bar',
  label: 'Continue Beat the Closeout',
}

describe('pickHomePathwayCta', () => {
  it('returns a loading band before the pathway payload arrives', () => {
    const cta = pickHomePathwayCta({ pathway: null, attempts: 0, loading: true })
    expect(cta.band).toBe('loading')
    expect(cta.primaryLabel).toBe('Loading…')
    expect(cta.primaryHref).toBe(FOUNDATION_DETAIL_HREF)
  })

  it('lands on cold-start for a brand-new user with zero attempts', () => {
    const cta = pickHomePathwayCta({
      pathway: { pathwayProgress: 0, pathwayMastered: false, recommendedNext: null },
      attempts: 0,
      loading: false,
    })
    expect(cta.band).toBe('cold-start')
    expect(cta.primaryLabel).toBe('Start Foundation')
    expect(cta.primarySubline.toLowerCase()).toContain('25 min')
  })

  it('still lands cold-start when attempts is 0 even if recommendedNext exists', () => {
    const cta = pickHomePathwayCta({
      pathway: { pathwayProgress: 0.04, pathwayMastered: false, recommendedNext: RECOMMENDED },
      attempts: 0,
      loading: false,
    })
    // 0 attempts → cold-start framing, but the deep-link uses the
    // recommendation when the API offers one so the user drops into a
    // real first rep.
    expect(cta.band).toBe('cold-start')
    expect(cta.primaryHref).toBe(RECOMMENDED.trainHref)
  })

  it('says "Continue: <chapter>" for a mid-pathway returning user', () => {
    const cta = pickHomePathwayCta({
      pathway: { pathwayProgress: 0.42, pathwayMastered: false, recommendedNext: RECOMMENDED },
      attempts: 7,
      loading: false,
    })
    expect(cta.band).toBe('continue')
    expect(cta.primaryLabel).toBe(RECOMMENDED.label)
    expect(cta.primaryHref).toBe(RECOMMENDED.trainHref)
    expect(cta.primarySubline).toContain('42%')
  })

  it('celebrates a mastered pathway with "Run it back"', () => {
    const cta = pickHomePathwayCta({
      pathway: { pathwayProgress: 1, pathwayMastered: true, recommendedNext: RECOMMENDED },
      attempts: 99,
      loading: false,
    })
    expect(cta.band).toBe('mastered')
    expect(cta.primaryLabel).toBe('Run it back')
    expect(cta.eyebrow.toLowerCase()).toContain('mastered')
    expect(cta.primaryHref).toBe(FOUNDATION_DETAIL_HREF)
  })

  it('falls back to cold-start when recommendedNext is missing for a returning user', () => {
    // Edge case: server returned progress but no recommendation
    // (e.g. a transient state). We still want a usable CTA, not a
    // "Continue undefined" string.
    const cta = pickHomePathwayCta({
      pathway: { pathwayProgress: 0.1, pathwayMastered: false, recommendedNext: null },
      attempts: 3,
      loading: false,
    })
    expect(cta.band).toBe('cold-start')
    expect(cta.primaryHref).toBe(FOUNDATION_DETAIL_HREF)
  })
})
