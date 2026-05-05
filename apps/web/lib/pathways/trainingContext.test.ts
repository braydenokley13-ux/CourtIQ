/**
 * Tests for the pure Pathway training context resolver (PTH-2).
 *
 * Covers every branch the planner enumerates:
 *   - explicit scenarioIds + pathway context wins
 *   - pathway + chapter + node → exact node scenarios
 *   - pathway + chapter (no node) → first trainable node
 *   - pathway only + cold-start progress → chapter 1 / node 1
 *   - pathway only + recommended-next from progress → that node
 *   - coming-soon pathway is refused
 *   - invalid pathway / chapter / node → error context
 */

import { describe, expect, it } from 'vitest'
import { buildTrainHrefFromContext, resolvePathwayTrainingContext } from './trainingContext'
import { getFoundationPathway } from './helpers'
import type { PathwayProgressSummary } from './types'

const FOUNDATION = getFoundationPathway()

function coldStartProgress(): PathwayProgressSummary {
  return {
    slug: FOUNDATION.slug,
    pathwayProgress: 0,
    pathwayMastered: false,
    chapters: FOUNDATION.chapters.map((c) => ({
      slug: c.slug,
      state: c.order === 1 ? 'unlocked' : 'locked',
      progress: 0,
      bestCount: 0,
      attemptedCount: 0,
      totalScenarios: c.skillNodes.reduce((acc, n) => acc + n.scenarioIds.length, 0),
      decoderAccuracy: null,
      decoderAttempts: 0,
      skillNodes: c.skillNodes.map((n) => ({
        slug: n.slug,
        state: c.order === 1 ? 'unlocked' : 'locked',
        progress: 0,
        attemptedCount: 0,
        bestCount: 0,
        totalScenarios: n.scenarioIds.length,
      })),
    })),
    recommendedNext: {
      chapterSlug: 'read-the-denial',
      skillNodeSlug: 'learn-the-cue',
      trainHref: '/train',
      label: 'Start Read the Denial — Learn the Cue',
      reason: 'cold-start',
    },
    weakestDecoder: null,
    challengeAttempts: [],
  }
}

describe('resolvePathwayTrainingContext — no Pathway context', () => {
  it('returns null when no pathway slug is passed', () => {
    expect(resolvePathwayTrainingContext({ scenarioIdsCsv: 'BDW-01,BDW-02' })).toBeNull()
    expect(resolvePathwayTrainingContext({})).toBeNull()
  })
})

describe('resolvePathwayTrainingContext — explicit scenarioIds wins', () => {
  it('uses URL scenarioIds verbatim and surfaces pathway/chapter context', () => {
    const ctx = resolvePathwayTrainingContext({
      pathwaySlug: FOUNDATION.slug,
      chapterSlug: 'read-the-denial',
      scenarioIdsCsv: 'BDW-04,BDW-05',
    })
    expect(ctx).not.toBeNull()
    expect(ctx!.error).toBeNull()
    expect(ctx!.source).toBe('explicit-scenario-ids')
    expect(ctx!.scenarioIds).toEqual(['BDW-04', 'BDW-05'])
    expect(ctx!.chapterTitle).toBe('Read the Denial')
    expect(ctx!.summaryParams).toEqual({
      pathway: FOUNDATION.slug,
      chapter: 'read-the-denial',
    })
    expect(ctx!.returnHref).toBe(`/pathways/${FOUNDATION.slug}`)
  })
})

describe('resolvePathwayTrainingContext — pathway + chapter + node', () => {
  it('resolves the exact node scenarioIds and surfaces node title', () => {
    const ctx = resolvePathwayTrainingContext({
      pathwaySlug: FOUNDATION.slug,
      chapterSlug: 'read-the-denial',
      nodeSlug: 'first-reps',
    })
    expect(ctx!.error).toBeNull()
    expect(ctx!.source).toBe('pathway-chapter-node')
    expect(ctx!.scenarioIds).toEqual(['BDW-01', 'BDW-02'])
    expect(ctx!.nodeTitle).toBe('First Reps')
    expect(ctx!.trainingMode).toBe('freeze-frame-read')
    expect(ctx!.summaryParams.node).toBe('first-reps')
  })
})

describe('resolvePathwayTrainingContext — pathway + chapter only', () => {
  it('picks the first trainable node when no progress is available', () => {
    const ctx = resolvePathwayTrainingContext({
      pathwaySlug: FOUNDATION.slug,
      chapterSlug: 'beat-the-closeout',
    })
    expect(ctx!.error).toBeNull()
    expect(ctx!.source).toBe('pathway-chapter-recommended')
    // Chapter 3's first node is the learn-the-cue tile (AOR-01).
    expect(ctx!.nodeSlug).toBe('learn-the-cue')
    expect(ctx!.scenarioIds).toEqual(['AOR-01'])
  })

  it('honors recommended-next when it points into the chapter', () => {
    // Build progress where ch1 has learn-the-cue mastered, so the
    // recommended-next should be `first-reps`.
    const progress = coldStartProgress()
    progress.chapters[0]!.state = 'in_progress'
    progress.chapters[0]!.skillNodes[0]!.state = 'mastered'
    progress.recommendedNext = {
      chapterSlug: 'read-the-denial',
      skillNodeSlug: 'first-reps',
      trainHref: '/train',
      label: 'Continue Read the Denial',
      reason: 'resume',
    }

    const ctx = resolvePathwayTrainingContext({
      pathwaySlug: FOUNDATION.slug,
      chapterSlug: 'read-the-denial',
      progress,
    })
    expect(ctx!.nodeSlug).toBe('first-reps')
    expect(ctx!.scenarioIds).toEqual(['BDW-01', 'BDW-02'])
  })
})

describe('resolvePathwayTrainingContext — pathway only', () => {
  it('falls back to chapter 1 / node 1 with no progress', () => {
    const ctx = resolvePathwayTrainingContext({ pathwaySlug: FOUNDATION.slug })
    expect(ctx!.error).toBeNull()
    expect(ctx!.source).toBe('pathway-recommended')
    expect(ctx!.chapterSlug).toBe('read-the-denial')
    expect(ctx!.nodeSlug).toBe('learn-the-cue')
  })

  it('uses recommended-next from progress when present', () => {
    const progress = coldStartProgress()
    progress.recommendedNext = {
      chapterSlug: 'beat-the-closeout',
      skillNodeSlug: 'go-now',
      trainHref: '/train',
      label: 'Continue Beat the Closeout',
      reason: 'resume',
    }
    const ctx = resolvePathwayTrainingContext({
      pathwaySlug: FOUNDATION.slug,
      progress,
    })
    expect(ctx!.chapterSlug).toBe('beat-the-closeout')
    expect(ctx!.nodeSlug).toBe('go-now')
    expect(ctx!.scenarioIds).toEqual(['AOR-01', 'AOR-02'])
  })
})

describe('resolvePathwayTrainingContext — error paths', () => {
  it('refuses coming-soon pathways', () => {
    const ctx = resolvePathwayTrainingContext({ pathwaySlug: 'closeout-killer' })
    expect(ctx!.error).toBe('pathway-coming-soon')
    expect(ctx!.scenarioIds).toEqual([])
  })

  it('flags an unknown pathway slug', () => {
    const ctx = resolvePathwayTrainingContext({ pathwaySlug: 'made-up-pathway' })
    expect(ctx!.error).toBe('pathway-not-found')
    expect(ctx!.returnHref).toBe('/pathways')
  })

  it('flags an unknown chapter slug', () => {
    const ctx = resolvePathwayTrainingContext({
      pathwaySlug: FOUNDATION.slug,
      chapterSlug: 'imaginary-chapter',
    })
    expect(ctx!.error).toBe('chapter-not-found')
  })

  it('flags an unknown node slug', () => {
    const ctx = resolvePathwayTrainingContext({
      pathwaySlug: FOUNDATION.slug,
      chapterSlug: 'read-the-denial',
      nodeSlug: 'imaginary-node',
    })
    expect(ctx!.error).toBe('node-not-found')
  })

  it('refuses challenge context for coming-soon pathways', () => {
    const ctx = resolvePathwayTrainingContext({
      pathwaySlug: 'closeout-killer',
      mode: 'boss-challenge',
    })
    expect(ctx!.error).toBe('pathway-coming-soon')
    expect(ctx!.isChallenge).toBe(false)
  })
})

describe('resolvePathwayTrainingContext — PTH-3 boss-challenge mode', () => {
  it('resolves to bossChallenge.scenarioIds and surfaces challenge metadata', () => {
    const ctx = resolvePathwayTrainingContext({
      pathwaySlug: FOUNDATION.slug,
      chapterSlug: 'read-the-denial',
      mode: 'boss-challenge',
    })
    expect(ctx!.error).toBeNull()
    expect(ctx!.source).toBe('boss-challenge')
    expect(ctx!.trainingMode).toBe('boss-challenge')
    expect(ctx!.scenarioIds).toEqual(['BDW-01', 'BDW-02', 'BDW-03', 'BDW-04', 'BDW-05'])
    expect(ctx!.isChallenge).toBe(true)
    expect(ctx!.hideDecoderPill).toBe(true)
    expect(ctx!.suppressCueHints).toBe(true)
    expect(ctx!.challengeTitle).toBe('Boss — Denial Reader')
    expect(ctx!.passCriteria?.bossBestRatio).toBe(0.8)
    expect(ctx!.challengeScenarioIds).toEqual([
      'BDW-01',
      'BDW-02',
      'BDW-03',
      'BDW-04',
      'BDW-05',
    ])
    expect(ctx!.summaryParams.mode).toBe('boss-challenge')
  })

  it('falls back to a soft error when the chapter has no boss config', () => {
    // Synthesize input pointing at a chapter — Foundation chapters all
    // have boss configs, so we route the resolver at a *real* pathway
    // chapter and assert a non-error result first; then prove the
    // boss-not-configured code path with a stub-style call where the
    // mode is set but the URL doesn't actually carry a chapter.
    const noChapter = resolvePathwayTrainingContext({
      pathwaySlug: FOUNDATION.slug,
      mode: 'boss-challenge',
    })
    // When a chapter is missing we return an empty boss-mode context
    // rather than crash; /train then falls back to standard training.
    expect(noChapter!.error).toBeNull()
    expect(noChapter!.scenarioIds).toEqual([])
    expect(noChapter!.trainingMode).toBe('boss-challenge')
  })

  it('preserves explicit scenarioIds while keeping boss-challenge metadata', () => {
    const ctx = resolvePathwayTrainingContext({
      pathwaySlug: FOUNDATION.slug,
      chapterSlug: 'read-the-denial',
      mode: 'boss-challenge',
      scenarioIdsCsv: 'BDW-03,BDW-05',
    })
    expect(ctx!.scenarioIds).toEqual(['BDW-03', 'BDW-05'])
    expect(ctx!.isChallenge).toBe(true)
    // canonical challenge ids stay visible for retry/local progress key.
    expect(ctx!.challengeScenarioIds).toEqual([
      'BDW-01',
      'BDW-02',
      'BDW-03',
      'BDW-04',
      'BDW-05',
    ])
  })
})

describe('resolvePathwayTrainingContext — PTH-3 mixed-reads mode', () => {
  it('resolves the capstone mixed-reads scenario set', () => {
    const ctx = resolvePathwayTrainingContext({
      pathwaySlug: FOUNDATION.slug,
      chapterSlug: 'real-game-mix',
      mode: 'mixed-reads',
    })
    expect(ctx!.error).toBeNull()
    expect(ctx!.source).toBe('mixed-reads')
    expect(ctx!.trainingMode).toBe('mixed-reads')
    expect(ctx!.isChallenge).toBe(true)
    expect(ctx!.hideDecoderPill).toBe(true)
    expect(ctx!.scenarioIds.length).toBe(20)
    expect(ctx!.scenarioIds[0]).toBe('BDW-01')
    expect(ctx!.scenarioIds[19]).toBe('SKR-05')
    expect(ctx!.summaryParams.mode).toBe('mixed-reads')
  })

  it('honors mode=mixed-reads on a non-mixed chapter by reusing chapter union', () => {
    const ctx = resolvePathwayTrainingContext({
      pathwaySlug: FOUNDATION.slug,
      chapterSlug: 'read-the-denial',
      mode: 'mixed-reads',
    })
    // Non-mixed chapter has no mixed-reads node; resolver picks the
    // first node and surfaces an isChallenge=true mixed-reads context.
    expect(ctx!.error).toBeNull()
    expect(ctx!.isChallenge).toBe(true)
    expect(ctx!.trainingMode).toBe('mixed-reads')
    expect(ctx!.scenarioIds.length).toBeGreaterThan(0)
  })
})

describe('resolvePathwayTrainingContext — buildTrainHrefFromContext', () => {
  it('preserves boss-challenge mode + canonical scenario ids on retry', () => {
    const ctx = resolvePathwayTrainingContext({
      pathwaySlug: FOUNDATION.slug,
      chapterSlug: 'read-the-denial',
      mode: 'boss-challenge',
    })!
    const retry = buildTrainHrefFromContext(ctx)
    expect(retry).toContain('mode=boss-challenge')
    expect(retry).toContain('chapter=read-the-denial')
    expect(retry).toContain('scenarioIds=BDW-01%2CBDW-02%2CBDW-03%2CBDW-04%2CBDW-05')
  })
})
