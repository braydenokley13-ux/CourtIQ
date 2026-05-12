/**
 * Pack 2 (Phase δ-B.M3) — DROP-03-MIRROR authoring lock.
 *
 * Parallels `drop02MirrorSeed.test.ts` for the D3 low-man-tag mirror.
 * Locks the same contracts as DROP-03 (decoder, difficulty, camera,
 * single-freeze, two-defender cue cluster including the tag pulse,
 * choice grammar, wrongDemo coverage) plus a mirror-specific block:
 *
 *   - The screener starts on the LEFT half of the floor (x < 0) so
 *     the screen is set on the left, matching the base's mirror.
 *   - The low-man tagger (player role substring "low_man") now
 *     starts on the RIGHT half of the floor (x > 0) — the screen
 *     flips left, so the tag flips right.
 *   - prerequisites resolve to ['DROP-03'] (you don't see the
 *     mirror until you've seen the base).
 *   - The manifest registers DROP-03-MIRROR with the expected file.
 *
 * The help_pulse(role='tag') overlay is what names the D3 second cue
 * — the low man committing all the way. The mirror MUST retain it on
 * the now-right-side low-man defender; otherwise the cluster
 * collapses back to D1/D2 (single cue on the screen defender) and
 * the kick exploit goes unnamed.
 */

import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { sceneSchema } from './schema'

const PACK_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'db',
  'seed',
  'scenarios',
  'packs',
  'pnr-coverage-v0',
)

const MIRROR_PATH = path.join(PACK_DIR, 'DROP-03-MIRROR.json')
const PACK_PATH = path.join(PACK_DIR, 'pack.json')

interface DropMirrorScenarioJson {
  id: string
  status: string
  decoder_tag?: string
  difficulty?: number
  user_role?: string
  progression_metadata?: { prerequisites?: string[]; unlocks?: string[] }
  choices: Array<{
    id: string
    quality?: 'best' | 'acceptable' | 'wrong'
    feedback_text: string
    label: string
    order: number
  }>
  scene?: {
    camera?: string
    beatSpec?: unknown
    players: Array<{ id: string; role: string; start: { x: number; z: number } }>
    preAnswerOverlays?: Array<{
      kind: string
      playerId?: string
      targetId?: string
      role?: string
    }>
    wrongDemos?: Array<{ choiceId: string }>
  }
}

async function loadMirror(): Promise<DropMirrorScenarioJson> {
  const raw = await fs.readFile(MIRROR_PATH, 'utf8')
  const arr = JSON.parse(raw) as DropMirrorScenarioJson[]
  return arr[0]!
}

describe('DROP-03-MIRROR — Pack 2 (Phase δ-B.M3) D3 mirror authoring lock', () => {
  it('pack manifest registers DROP-03-MIRROR with prerequisite DROP-03', async () => {
    const manifestRaw = await fs.readFile(PACK_PATH, 'utf8')
    const manifest = JSON.parse(manifestRaw) as {
      slug: string
      scenarios: Array<{ id: string; file: string; prerequisites: string[] }>
    }
    expect(manifest.slug).toBe('pnr-coverage-v0')
    const entry = manifest.scenarios.find((s) => s.id === 'DROP-03-MIRROR')
    expect(entry).toBeDefined()
    expect(entry?.file).toBe('DROP-03-MIRROR.json')
    expect(entry?.prerequisites).toEqual(['DROP-03'])
  })

  it('parses through the runtime scene schema', async () => {
    const scenario = await loadMirror()
    expect(scenario.id).toBe('DROP-03-MIRROR')
    expect(scenario.scene).toBeDefined()
    expect(() => sceneSchema.parse(scenario.scene)).not.toThrow()
  })

  it('inherits the DROP-03 decoder + role contract at D3', async () => {
    const scenario = await loadMirror()
    expect(scenario.decoder_tag).toBe('READ_THE_COVERAGE')
    expect(scenario.difficulty).toBe(3)
    expect(scenario.user_role).toBe('pnr_ball_handler')
  })

  it('uses the DROP camera default (top_down)', async () => {
    const scenario = await loadMirror()
    expect(scenario.scene?.camera).toBe('top_down')
  })

  it('is single-freeze (no beatSpec) — same shape as DROP-03', async () => {
    const scenario = await loadMirror()
    expect(scenario.scene?.beatSpec).toBeUndefined()
  })

  it('places the screener on the LEFT half of the floor (mirrored from DROP-03)', async () => {
    const scenario = await loadMirror()
    const screener = scenario.scene?.players.find((p) => p.id === 'screener')
    expect(screener, 'screener must exist').toBeDefined()
    // DROP-03 puts the screener at x=+4 (right of the user). The mirror
    // must put it at x<0 (left). A copy-paste regression would land
    // it back near +4 and this assertion fails.
    expect(screener!.start.x).toBeLessThan(0)
  })

  it('places the low-man tagger on the RIGHT half of the floor (mirrored from DROP-03)', async () => {
    const scenario = await loadMirror()
    const lowMan = scenario.scene?.players.find((p) => /low_man/i.test(p.role))
    expect(lowMan, 'low-man tagger must exist').toBeDefined()
    // DROP-03 starts the low man at x=-18 (the LEFT weak corner). The
    // mirror flips the screen to the left, which moves the open
    // corner to the right — so the tagger must start at x>0.
    expect(lowMan!.start.x).toBeGreaterThan(0)
  })

  it('retains the D3 help_pulse(role=tag) on the (now right-side) low-man defender', async () => {
    const scenario = await loadMirror()
    const lowManId = scenario.scene?.players.find((p) =>
      /low_man/i.test(p.role),
    )?.id
    expect(lowManId, 'low-man tagger id must be resolvable').toBeDefined()
    const pre = scenario.scene?.preAnswerOverlays ?? []
    const tagPulse = pre.find(
      (o) => o.kind === 'help_pulse',
    )
    expect(tagPulse, 'D3 tag help_pulse overlay must be present').toBeDefined()
    expect(tagPulse?.playerId).toBe(lowManId)
    expect(tagPulse?.role).toBe('tag')
  })

  it('keeps the D1/D2 screen-defender body-cue trio alongside the new low-man cue', async () => {
    const scenario = await loadMirror()
    const pre = scenario.scene?.preAnswerOverlays ?? []
    const kinds = pre.map((o) => o.kind)
    expect(kinds).toContain('defender_chest_line')
    expect(kinds).toContain('defender_foot_arrow')
    expect(kinds).toContain('help_pulse')
  })

  it('exposes one best read and a wrongDemo for every non-best choice', async () => {
    const scenario = await loadMirror()
    const best = scenario.choices.filter((c) => c.quality === 'best')
    expect(best).toHaveLength(1)
    const nonBestIds = scenario.choices
      .filter((c) => c.quality !== 'best')
      .map((c) => c.id)
    const demos = (scenario.scene?.wrongDemos ?? []).map((d) => d.choiceId)
    for (const id of nonBestIds) {
      expect(demos).toContain(id)
    }
  })

  it('inherits prerequisites = [DROP-03] in progression_metadata', async () => {
    const scenario = await loadMirror()
    expect(scenario.progression_metadata?.prerequisites).toEqual(['DROP-03'])
  })
})
