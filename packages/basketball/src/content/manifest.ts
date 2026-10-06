import generated from './generated/manifest.json'
import { canonicalStringify, contentHash, validateProgram } from '../domain/execution'
import type { ContentProgram, ContentRef } from '../domain/program'
import { HIGH_PNR_PROGRAM } from './highPnr/program'
import { BASELINE_DRIVE_PROGRAM } from './baselineDrive/program'
export interface ContentManifest {
  schemaVersion: 1
  entries: { ref: ContentRef; program: ContentProgram }[]
}
export function createContentManifest(): ContentManifest {
  const programs: ContentProgram[] = JSON.parse(JSON.stringify([HIGH_PNR_PROGRAM, BASELINE_DRIVE_PROGRAM]))
  programs.forEach(validateProgram)
  return {
    schemaVersion: 1,
    entries: programs.map((program) => ({
      ref: { id: program.id, version: program.version, hash: contentHash(program) },
      program: JSON.parse(JSON.stringify(program)),
    })),
  }
}
export function validateContentManifest(value: unknown): asserts value is ContentManifest {
  const m = value as ContentManifest
  if (!m || m.schemaVersion !== 1 || !Array.isArray(m.entries) || m.entries.length > 48)
    throw new Error('Unsupported content manifest.')
  const ids = new Set<string>()
  for (const e of m.entries) {
    validateProgram(e.program)
    if (
      e.ref.id !== e.program.id ||
      e.ref.version !== e.program.version ||
      e.ref.hash !== contentHash(e.program) ||
      ids.has(e.ref.id)
    )
      throw new Error('Manifest content identity is inconsistent.')
    ids.add(e.ref.id)
  }
}
validateContentManifest(generated)
function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
}
freeze(generated)
/** The installed executable catalog is the materialized artifact; authoring modules are build inputs. */
export const installedContentCatalog: readonly ContentManifest['entries'][number][] = (generated as ContentManifest)
  .entries
export function installedProgram(id: string): ContentProgram {
  const entry = installedContentCatalog.find((e) => e.ref.id === id)
  if (!entry) throw new Error(`Basketball content ${id} is not installed.`)
  return JSON.parse(JSON.stringify(entry.program))
}
export const contentManifestJSON = () => `${canonicalStringify(createContentManifest())}\n`
