/**
 * Tests for the Pathway URL builders (PTH-2).
 *
 * The whole point of routing every Pathway → /train link through these
 * builders is that the query-param shape lives in one place. These
 * tests pin that shape so a refactor that accidentally drops a param
 * fails loudly in CI instead of silently breaking the training flow.
 */

import { describe, expect, it } from 'vitest'
import {
  buildChapterTrainHref,
  buildPathwayDetailHref,
  buildPathwaySummaryHref,
  buildPathwayTrainHref,
  buildSkillNodeTrainHref,
  getFoundationPathway,
} from './helpers'

const FOUNDATION = getFoundationPathway()
const READ_THE_DENIAL = FOUNDATION.chapters[0]!
const FIRST_REPS = READ_THE_DENIAL.skillNodes.find((n) => n.slug === 'first-reps')!

describe('buildPathwayTrainHref', () => {
  it('returns plain /train when called with no input', () => {
    expect(buildPathwayTrainHref()).toBe('/train')
    expect(buildPathwayTrainHref({})).toBe('/train')
  })

  it('emits scenarioIds= alone when no pathway context', () => {
    expect(buildPathwayTrainHref({ scenarioIds: ['BDW-01', 'BDW-02'] })).toBe(
      '/train?scenarioIds=BDW-01%2CBDW-02',
    )
  })

  it('drops empty scenario IDs', () => {
    expect(buildPathwayTrainHref({ scenarioIds: ['', 'BDW-01', ''] })).toBe(
      '/train?scenarioIds=BDW-01',
    )
  })

  it('emits pathway/chapter/node params alone when no scenarioIds', () => {
    const href = buildPathwayTrainHref({
      pathwaySlug: FOUNDATION.slug,
      chapterSlug: READ_THE_DENIAL.slug,
      nodeSlug: FIRST_REPS.slug,
    })
    expect(href).toBe(
      `/train?pathway=${FOUNDATION.slug}&chapter=${READ_THE_DENIAL.slug}&node=${FIRST_REPS.slug}`,
    )
  })

  it('combines pathway context + scenarioIds in canonical order', () => {
    const href = buildPathwayTrainHref({
      pathwaySlug: FOUNDATION.slug,
      chapterSlug: READ_THE_DENIAL.slug,
      nodeSlug: FIRST_REPS.slug,
      scenarioIds: ['BDW-01', 'BDW-02'],
    })
    // pathway, chapter, node come before scenarioIds — so /train can
    // read pathway context for the strip even when scenarioIds is
    // huge and might be truncated in dev tools.
    expect(href).toBe(
      `/train?pathway=${FOUNDATION.slug}&chapter=${READ_THE_DENIAL.slug}&node=${FIRST_REPS.slug}&scenarioIds=BDW-01%2CBDW-02`,
    )
  })
})

describe('buildSkillNodeTrainHref', () => {
  it('threads pathway + chapter + node context through automatically', () => {
    const href = buildSkillNodeTrainHref(FIRST_REPS, {
      pathwaySlug: FOUNDATION.slug,
      chapterSlug: READ_THE_DENIAL.slug,
    })
    // Always carries node.scenarioIds + the slugs.
    expect(href).toContain(`pathway=${FOUNDATION.slug}`)
    expect(href).toContain(`chapter=${READ_THE_DENIAL.slug}`)
    expect(href).toContain(`node=${FIRST_REPS.slug}`)
    expect(href).toContain('scenarioIds=BDW-01%2CBDW-02')
  })

  it('still works without context (legacy callers)', () => {
    const href = buildSkillNodeTrainHref(FIRST_REPS)
    expect(href).toContain('scenarioIds=BDW-01%2CBDW-02')
    expect(href).not.toContain('pathway=')
  })
})

describe('buildChapterTrainHref', () => {
  it("uses the chapter's first skill node and threads the chapter slug", () => {
    const href = buildChapterTrainHref(READ_THE_DENIAL, { pathwaySlug: FOUNDATION.slug })
    // First node of the foundation chapter 1 is "learn-the-cue" (BDW-01).
    expect(href).toContain(`pathway=${FOUNDATION.slug}`)
    expect(href).toContain(`chapter=${READ_THE_DENIAL.slug}`)
    expect(href).toContain('node=learn-the-cue')
    expect(href).toContain('scenarioIds=BDW-01')
  })
})

describe('buildPathwaySummaryHref', () => {
  it('only emits the params that are present', () => {
    expect(buildPathwaySummaryHref('/train/summary', {})).toBe('/train/summary')
    expect(
      buildPathwaySummaryHref('/train/summary', {
        sessionId: 'abc',
        pathwaySlug: FOUNDATION.slug,
      }),
    ).toBe(`/train/summary?sessionId=abc&pathway=${FOUNDATION.slug}`)
  })

  it('preserves concept and pathway context together', () => {
    const href = buildPathwaySummaryHref('/train/summary', {
      sessionId: 'abc',
      concept: 'spacing',
      pathwaySlug: FOUNDATION.slug,
      chapterSlug: READ_THE_DENIAL.slug,
    })
    expect(href).toBe(
      `/train/summary?sessionId=abc&concept=spacing&pathway=${FOUNDATION.slug}&chapter=${READ_THE_DENIAL.slug}`,
    )
  })
})

describe('buildPathwayDetailHref', () => {
  it('encodes the slug', () => {
    expect(buildPathwayDetailHref(FOUNDATION.slug)).toBe(`/pathways/${FOUNDATION.slug}`)
    expect(buildPathwayDetailHref('weird/slug?')).toBe('/pathways/weird%2Fslug%3F')
  })
})
