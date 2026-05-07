/**
 * Phase 7 — Daily Challenge: deterministic seed.
 *
 * Same 5 reps for every player on a given UTC date. The library
 * fingerprint is part of the seed so adding scenarios mid-day does
 * NOT shift today's daily — once the day rolls over, today's
 * scenarios are pinned for 24 hours.
 *
 * Pure function. No I/O. No randomness in the cryptographic sense —
 * we use a small FNV-1a hash + a Mulberry32 PRNG seeded from the
 * date+fingerprint. Deterministic by construction, reproducible from
 * tests.
 */

export interface DailyCatalogScenario {
  id: string
  decoderTag: string | null
  templateId: string | null
  disguise: 'none' | 'light' | 'moderate' | 'heavy'
  difficulty: number
  /** True when status === 'LIVE'. */
  isLive: boolean
}

export type DailySlot =
  /** Confidence anchor — strongest decoder, easy disguise. */
  | { kind: 'anchor'; decoder: string; disguise: 'none' | 'light' }
  /** Cross-decoder mid-tier rep. */
  | { kind: 'mid'; decoder: string; disguise: 'none' | 'light' }
  /** Boss-tier closer. */
  | { kind: 'boss'; preferDisguise: 'heavy' | 'moderate' }

export const STANDARD_DAILY_SHAPE: readonly DailySlot[] = [
  { kind: 'anchor', decoder: 'BACKDOOR_WINDOW', disguise: 'none' },
  { kind: 'mid', decoder: 'ADVANTAGE_OR_RESET', disguise: 'light' },
  { kind: 'mid', decoder: 'EMPTY_SPACE_CUT', disguise: 'none' },
  { kind: 'mid', decoder: 'SKIP_THE_ROTATION', disguise: 'light' },
  { kind: 'boss', preferDisguise: 'heavy' },
]

/** Sunday gets a boss-only shape — strategy §9. */
export const BOSS_SUNDAY_SHAPE: readonly DailySlot[] = [
  { kind: 'boss', preferDisguise: 'heavy' },
  { kind: 'boss', preferDisguise: 'heavy' },
  { kind: 'boss', preferDisguise: 'heavy' },
  { kind: 'boss', preferDisguise: 'moderate' },
  { kind: 'boss', preferDisguise: 'heavy' },
]

const MIN_LIVE_FOR_DAILY = 20

export interface DailySeedInput {
  /** UTC midnight of the day to seed. The function strips time
   *  components defensively. */
  utcDate: Date
  catalog: readonly DailyCatalogScenario[]
}

export interface DailySeedResult {
  /** True when the catalog is rich enough for a daily today. */
  available: boolean
  /** Ordered scenario ids. Empty when `available` is false. */
  scenarioIds: string[]
  /** Per-slot diagnostic. Same length as scenarioIds when available. */
  slotPicks: { slot: DailySlot; scenarioId: string; downgrades: string[] }[]
  /** True when at least one slot was downgraded. */
  catalogIncomplete: boolean
  /** Stable seed string used by the PRNG — surfaced for debugging. */
  seedKey: string
}

export function seedDailyChallenge(input: DailySeedInput): DailySeedResult {
  const live = input.catalog.filter((s) => s.isLive)
  if (live.length < MIN_LIVE_FOR_DAILY) {
    return {
      available: false,
      scenarioIds: [],
      slotPicks: [],
      catalogIncomplete: true,
      seedKey: '',
    }
  }

  const dateKey = utcDateKey(input.utcDate)
  const fingerprint = libraryFingerprint(live)
  const seedKey = `${dateKey}|${fingerprint}`
  const rng = mulberry32(fnv1a(seedKey))

  const isSunday = input.utcDate.getUTCDay() === 0
  const shape = isSunday ? BOSS_SUNDAY_SHAPE : STANDARD_DAILY_SHAPE

  const slotPicks: DailySeedResult['slotPicks'] = []
  const used = new Set<string>()
  let catalogIncomplete = false

  for (const slot of shape) {
    const picked = pickForSlot(slot, live, used, rng)
    if (picked.downgrades.length > 0) catalogIncomplete = true
    used.add(picked.scenarioId)
    slotPicks.push({ slot, scenarioId: picked.scenarioId, downgrades: picked.downgrades })
  }

  return {
    available: true,
    scenarioIds: slotPicks.map((p) => p.scenarioId),
    slotPicks,
    catalogIncomplete,
    seedKey,
  }
}

function pickForSlot(
  slot: DailySlot,
  pool: readonly DailyCatalogScenario[],
  used: Set<string>,
  rng: () => number,
): { scenarioId: string; downgrades: string[] } {
  const downgrades: string[] = []
  let cands = pool.filter((s) => !used.has(s.id))
  if (cands.length === 0) {
    cands = [...pool]
    downgrades.push('reused-from-earlier-slot')
  }

  if (slot.kind === 'anchor' || slot.kind === 'mid') {
    const decoderMatched = cands.filter((s) => s.decoderTag === slot.decoder)
    if (decoderMatched.length > 0) cands = decoderMatched
    else downgrades.push('no-decoder-match')

    const disguiseMatched = cands.filter((s) => s.disguise === slot.disguise)
    if (disguiseMatched.length > 0) cands = disguiseMatched
    else downgrades.push('no-disguise-match')
  } else {
    // boss
    const heavy = cands.filter((s) => s.disguise === 'heavy')
    const moderate = cands.filter((s) => s.disguise === 'moderate')
    if (slot.preferDisguise === 'heavy' && heavy.length > 0) {
      cands = heavy
    } else if (heavy.length > 0) {
      cands = heavy
    } else if (moderate.length > 0) {
      cands = moderate
      downgrades.push('boss-fell-back-to-moderate')
    } else {
      const hardest = cands.filter((s) => s.difficulty >= 3)
      if (hardest.length > 0) {
        cands = hardest
        downgrades.push('boss-fell-back-to-difficulty')
      } else {
        downgrades.push('boss-fell-back-to-anything')
      }
    }
  }

  // Deterministic seeded pick — sort by id, then index by rng.
  cands = [...cands].sort((a, b) => a.id.localeCompare(b.id))
  const idx = Math.floor(rng() * cands.length)
  return { scenarioId: cands[idx]!.id, downgrades }
}

// ---------- helpers (deterministic hashing) ----------

function utcDateKey(d: Date): string {
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function libraryFingerprint(catalog: readonly DailyCatalogScenario[]): string {
  // Stable across catalog reordering — sort + concat ids.
  const sorted = [...catalog].sort((a, b) => a.id.localeCompare(b.id))
  return fnv1a(sorted.map((s) => s.id).join(',')).toString(16)
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
