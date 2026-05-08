/**
 * /dev/scenario-preview — pack readers.
 *
 * Pack 2 §3.1.4 / §3.1.13 — the preview surface resolves `?id=` against
 * BOTH the founder-v0 QA matrix and the materialized template-v1 pack.
 * These helpers live in their own module so the resolution logic is
 * unit-testable; the route file (`page.tsx`) is a thin Next.js shell on
 * top of them.
 *
 * Adding a new pack means appending a directory to `PREVIEW_PACK_DIRS`.
 * The id-resolution order matches the array order, so packs listed
 * earlier win when the same id appears in two packs (it never should).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface ScenarioRecord {
  id: string
  decoder_tag: string | null
  difficulty: number | null
  title: string | null
  prompt: string | null
  visible_cue: string | null
  best_read: string | null
  decoder_teaching_point: string | null
  explanation_md: string | null
  user_role: string | null
  concept_tags: string[]
  sub_concepts: string[]
  court_state: unknown
  scene: unknown
}

export const PREVIEW_PACK_DIRS: readonly string[] = [
  'founder-v0',
  'templates-v1',
]

function packDirAbs(pack: string, cwd: string = process.cwd()): string {
  return path.resolve(
    cwd,
    '..',
    '..',
    'packages',
    'db',
    'seed',
    'scenarios',
    'packs',
    pack,
  )
}

export async function readScenario(
  id: string,
  cwd?: string,
): Promise<ScenarioRecord | null> {
  for (const pack of PREVIEW_PACK_DIRS) {
    const filePath = path.join(packDirAbs(pack, cwd), `${id}.json`)
    let raw: string
    try {
      raw = await fs.readFile(filePath, 'utf8')
    } catch {
      continue
    }
    const record = parseScenarioRecord(id, raw)
    if (record) return record
  }
  return null
}

export async function listAllPackIds(cwd?: string): Promise<string[]> {
  const ids = new Set<string>()
  for (const pack of PREVIEW_PACK_DIRS) {
    const dir = packDirAbs(pack, cwd)
    const manifestPath = path.join(dir, 'pack.json')
    let usedManifest = false
    try {
      const raw = await fs.readFile(manifestPath, 'utf8')
      const parsed = JSON.parse(raw) as {
        scenarios?: Array<{ id?: unknown }>
      }
      if (Array.isArray(parsed.scenarios)) {
        for (const s of parsed.scenarios) {
          if (typeof s.id === 'string' && s.id.length > 0) ids.add(s.id)
        }
        usedManifest = true
      }
    } catch {
      // fall through to directory scan
    }
    if (usedManifest) continue
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const e of entries) {
        if (
          e.isFile() &&
          e.name.endsWith('.json') &&
          e.name !== 'pack.json'
        ) {
          ids.add(e.name.replace(/\.json$/, ''))
        }
      }
    } catch {
      // missing pack — no-op
    }
  }
  return [...ids].sort()
}

function parseScenarioRecord(
  id: string,
  raw: string,
): ScenarioRecord | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const records = Array.isArray(parsed) ? parsed : [parsed]
  const found = records.find(
    (r): r is Record<string, unknown> =>
      typeof r === 'object' && r !== null && (r as { id?: unknown }).id === id,
  )
  if (!found) return null
  return {
    id,
    decoder_tag:
      typeof found.decoder_tag === 'string' ? found.decoder_tag : null,
    difficulty:
      typeof found.difficulty === 'number' ? found.difficulty : null,
    title: typeof found.title === 'string' ? found.title : null,
    prompt: typeof found.prompt === 'string' ? found.prompt : null,
    visible_cue:
      typeof found.visible_cue === 'string' ? found.visible_cue : null,
    best_read: typeof found.best_read === 'string' ? found.best_read : null,
    decoder_teaching_point:
      typeof found.decoder_teaching_point === 'string'
        ? found.decoder_teaching_point
        : null,
    explanation_md:
      typeof found.explanation_md === 'string' ? found.explanation_md : null,
    user_role: typeof found.user_role === 'string' ? found.user_role : null,
    concept_tags: Array.isArray(found.concept_tags)
      ? (found.concept_tags as unknown[]).filter(
          (s): s is string => typeof s === 'string',
        )
      : [],
    sub_concepts: Array.isArray(found.sub_concepts)
      ? (found.sub_concepts as unknown[]).filter(
          (s): s is string => typeof s === 'string',
        )
      : [],
    court_state: found.court_state,
    scene: found.scene,
  }
}

/**
 * Resolves a query-string id (`?id=` or back-compat `?scenario=`) into
 * the id the preview should land on. Falls back to `defaultId` when the
 * requested id is not present in any pack — silent fallback is
 * intentional so a typo doesn't 404 a QA session, but the chosen id is
 * always reflected back to the UI.
 */
export function resolveRequestedId(args: {
  requested: string | null
  knownIds: readonly string[]
  defaultId: string
}): string {
  const { requested, knownIds, defaultId } = args
  if (requested && knownIds.includes(requested)) return requested
  return defaultId
}
