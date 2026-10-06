import { clone, emptySystem, fingerprint, type ProgramCodec, type ProgramKnowledge, type VersionRef } from './model'

export interface ImportPlan {
  copyEntryIds: string[]
  copyVersionIds: string[]
  added: number
  identical: number
  divergent: number
}
export interface ImportIdentities {
  entries: Record<string, string>
  versions: Record<string, string>
}

/** Copy divergent histories and every incoming history whose lineage would otherwise resolve to a local ancestor. */
export function planImport(current: ProgramKnowledge, incoming: ProgramKnowledge): ImportPlan {
  const currentVersions = new Set(current.entries.flatMap((e) => e.versions.map((v) => v.id)))
  const identical = new Set<string>(),
    copiedEntries = new Set<string>(),
    copiedVersions = new Set<string>()
  const copy = (entry: ProgramKnowledge['entries'][number]) => {
    copiedEntries.add(entry.id)
    for (const version of entry.versions) copiedVersions.add(version.id)
  }
  for (const entry of incoming.entries) {
    const existing = current.entries.find((e) => e.id === entry.id)
    if (existing && fingerprint(existing) === fingerprint(entry)) {
      identical.add(entry.id)
      continue
    }
    if (existing || entry.versions.some((v) => currentVersions.has(v.id))) copy(entry)
  }
  let changed = true
  while (changed) {
    changed = false
    for (const entry of incoming.entries) {
      if (!identical.has(entry.id) || copiedEntries.has(entry.id)) continue
      if (
        entry.versions.some(
          (v) => v.basedOn && (copiedEntries.has(v.basedOn.entryId) || copiedVersions.has(v.basedOn.versionId)),
        )
      ) {
        copy(entry)
        changed = true
      }
    }
  }
  const unchanged = incoming.entries.filter((e) => identical.has(e.id) && !copiedEntries.has(e.id)).length
  return {
    copyEntryIds: incoming.entries.filter((e) => copiedEntries.has(e.id)).map((e) => e.id),
    copyVersionIds: incoming.entries.filter((e) => copiedEntries.has(e.id)).flatMap((e) => e.versions.map((v) => v.id)),
    added: incoming.entries.length - unchanged,
    identical: unchanged,
    divergent: copiedEntries.size,
  }
}

export function mergeImport(
  current: ProgramKnowledge,
  incoming: ProgramKnowledge,
  identities: ImportIdentities,
  codec: ProgramCodec,
): ProgramKnowledge {
  const plan = planImport(current, incoming)
  const supplied = (map: Record<string, string>, id: string, label: string): string => {
    if (!Object.hasOwn(map, id) || typeof map[id] !== 'string' || !map[id])
      throw new Error(`A divergent ${label} needs a new supplied identity.`)
    return map[id]!
  }
  const entries = new Map(plan.copyEntryIds.map((id) => [id, supplied(identities.entries, id, 'answer')])),
    versions = new Map(plan.copyVersionIds.map((id) => [id, supplied(identities.versions, id, 'version')]))
  const ref = (value: VersionRef): VersionRef => ({
    entryId: entries.get(value.entryId) ?? value.entryId,
    versionId: versions.get(value.versionId) ?? value.versionId,
  })
  const additions = incoming.entries
    .filter(
      (e) =>
        plan.copyEntryIds.includes(e.id) ||
        !current.entries.some((c) => c.id === e.id && fingerprint(c) === fingerprint(e)),
    )
    .map((entry) => ({
      ...clone(entry),
      id: entries.get(entry.id) ?? entry.id,
      name: entries.has(entry.id) ? `${entry.name.slice(0, 69)} (imported)` : entry.name,
      headVersionId: versions.get(entry.headVersionId) ?? entry.headVersionId,
      versions: entry.versions.map((v) => ({
        ...clone(v),
        id: versions.get(v.id) ?? v.id,
        ...(v.basedOn ? { basedOn: ref(v.basedOn) } : {}),
        ...(v.priorHeadVersionId
          ? { priorHeadVersionId: versions.get(v.priorHeadVersionId) ?? v.priorHeadVersionId }
          : {}),
      })),
    }))
  // Existing name/words/defaults remain authoritative on merge. New terms fill missing keys only.
  return codec.parse({
    ...current,
    entries: [...current.entries, ...additions],
    terms: { ...incoming.terms, ...current.terms },
  })
}

export function importIntoEmpty(
  current: ProgramKnowledge,
  incoming: ProgramKnowledge,
  codec: ProgramCodec,
): ProgramKnowledge {
  if (current.entries.length) throw new Error('Replacing a non-empty program requires a separate reviewed restore.')
  return codec.parse(clone(incoming))
}

export function legacyImportBase(programId: string): ProgramKnowledge {
  return emptySystem(programId)
}
