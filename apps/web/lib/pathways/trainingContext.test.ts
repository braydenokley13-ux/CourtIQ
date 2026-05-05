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
import { resolvePathwayTrainingContext } from './trainingContext'
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
})
