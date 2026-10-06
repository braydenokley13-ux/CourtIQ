import { z } from 'zod'
import {
  canonicalStringify,
  executionCompatibility,
  parseExecutionInput,
  parseLabConfig,
  type StoredExecutionInput,
} from '../execution'
import type { ExecutionInput, LabConfig } from '../types'
import { parseLegacyRecipe } from './legacyRecipe'

export const PROGRAM_SCHEMA_VERSION = 2 as const
export const MAX_PROGRAM_BYTES = 128 * 1024 * 1024
export const LEGACY_SYSTEM_KEY = 'courtiq.our-system.v1'
export const LEGACY_ANSWERS_KEY = 'courtiq.defense-lab.answers.v1'
export type Scope = 'program' | 'varsity' | 'jv' | 'freshman' | 'lineup' | 'game'
export type VersionRef = { entryId: string; versionId: string }
export interface Tradeoff {
  threatId: string
  seconds: number
}
export interface TeachingRecipe {
  role?: string
  checkpointTimes: number[]
  cue: string
}
export type StoredJson = null | boolean | number | string | StoredJson[] | { [key: string]: StoredJson }

export type AcceptedSnapshot =
  | { kind: 'executable'; input: StoredExecutionInput; recipe?: LabConfig | StoredJson }
  | {
      kind: 'legacy-unverified'
      recipe: LabConfig
      source: 'our-system-v1' | 'answers-v1'
      engineVersion?: string
      problemVersion?: string
      createdAt?: string
      updatedAt?: string
    }

export interface BreakEvidence extends Tradeoff {
  label: string
  candidate?: StoredExecutionInput
  candidateInputFingerprint?: string
  baseInputFingerprint?: string
  queryVersion?: string
  search?: { id: string; version: string; recipe: StoredJson; allowedParameterIds: string[] }
  witness?: { at: number; start: number; end: number; playerId: string; defenderId: string }
}
export interface AcceptanceEvidence {
  state: 'recorded' | 'legacy-unknown'
  configFingerprint?: string
  inputFingerprint?: string
  engineVersion?: string
  content?: { id: string; version: string; hash: string }
  queryVersion?: string
}
export interface SystemVersion {
  id: string
  v: number
  savedAt: string
  basedOn?: VersionRef
  priorHeadVersionId?: string
  snapshot: AcceptedSnapshot
  presetIds: string[]
  note: string
  accepts: Tradeoff[]
  knownBreaks: BreakEvidence[]
  evidence: AcceptanceEvidence
  teachAt?: number
  teaching?: TeachingRecipe
  terms?: Record<string, string>
}
export interface SystemEntry {
  id: string
  situationId: string
  name: string
  scope: Scope
  scopeTargetId?: string
  scopeUnassigned?: boolean
  when: string
  headVersionId: string
  versions: SystemVersion[]
}
export interface ProgramKnowledge {
  schema: 2
  id: string
  program: string
  register: 'plain' | 'coach' | 'program'
  /** Namespaced concept/coverage/role identifiers. Words do not change execution. */
  terms: Record<string, string>
  entries: SystemEntry[]
  defaults: { situationId: string; scope: Scope; targetId?: string; answer: VersionRef }[]
}
export type ProgramSystem = ProgramKnowledge
export interface ProgramRecord {
  revision: number
  program: ProgramKnowledge
}
export interface LabOrigin extends VersionRef {
  expectedHeadVersionId: string
  name: string
  scope: Scope
  when: string
  presetIds: string[]
}

export const SCOPES: { id: Scope; label: string; hint: string }[] = [
  { id: 'program', label: 'Whole program', hint: 'Default for every level' },
  { id: 'varsity', label: 'Varsity', hint: 'Overrides the program default' },
  { id: 'jv', label: 'JV', hint: 'Inherits the program default unless set' },
  { id: 'freshman', label: 'Freshman', hint: 'Inherits the program default unless set' },
  { id: 'lineup', label: 'One lineup', hint: 'Describes this answer; select the lineup before using it as a default' },
  { id: 'game', label: 'This game only', hint: 'Describes this answer; select the game before using it as a default' },
]

const identifier = z.string().min(1).max(240)
const stamp = z.string().datetime({ offset: true })
const seconds = z.number().finite().min(0).max(20)
const scopeSchema = z.enum(['program', 'varsity', 'jv', 'freshman', 'lineup', 'game'])
const refSchema = z.object({ entryId: identifier, versionId: identifier }).strict()
const termsSchema = z
  .record(z.string().min(1).max(180), z.string().trim().min(1).max(80))
  .refine((t) => Object.keys(t).length <= 500, 'Too many program terms.')
const contentRef = z.object({ id: identifier, version: identifier, hash: z.string().min(1).max(240) }).strict()
const tradeoffSchema = z.object({ threatId: identifier, seconds }).strict()
const evidenceSchema = z
  .object({
    state: z.enum(['recorded', 'legacy-unknown']),
    configFingerprint: z.string().max(250_000).optional(),
    inputFingerprint: z.string().max(500_000).optional(),
    engineVersion: identifier.optional(),
    content: contentRef.optional(),
    queryVersion: identifier.optional(),
  })
  .strict()
const teachingSchema = z
  .object({ role: identifier.optional(), checkpointTimes: z.array(seconds).max(40), cue: z.string().max(2000) })
  .strict()
const snapshotSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('executable'), input: z.unknown(), recipe: z.unknown().optional() }).strict(),
  z
    .object({
      kind: z.literal('legacy-unverified'),
      recipe: z.unknown(),
      source: z.enum(['our-system-v1', 'answers-v1']),
      engineVersion: identifier.optional(),
      problemVersion: identifier.optional(),
      createdAt: stamp.optional(),
      updatedAt: stamp.optional(),
    })
    .strict(),
])
const versionSchema = z
  .object({
    id: identifier,
    v: z.number().int().min(1).max(1_000_000),
    savedAt: stamp,
    basedOn: refSchema.optional(),
    priorHeadVersionId: identifier.optional(),
    snapshot: snapshotSchema,
    presetIds: z.array(identifier).max(64),
    note: z.string().max(4000),
    accepts: z.array(tradeoffSchema).max(64),
    knownBreaks: z
      .array(
        z
          .object({
            ...tradeoffSchema.shape,
            label: z.string().max(500),
            candidate: z.unknown().optional(),
            candidateInputFingerprint: z.string().max(500_000).optional(),
            baseInputFingerprint: z.string().max(500_000).optional(),
            queryVersion: identifier.optional(),
            search: z
              .object({
                id: identifier,
                version: identifier,
                recipe: z.unknown(),
                allowedParameterIds: z.array(identifier).max(64),
              })
              .strict()
              .optional(),
            witness: z
              .object({ at: seconds, start: seconds, end: seconds, playerId: identifier, defenderId: identifier })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .max(64),
    evidence: evidenceSchema,
    teachAt: seconds.optional(),
    teaching: teachingSchema.optional(),
    terms: termsSchema.optional(),
  })
  .strict()
const shapeSchema = z
  .object({
    schema: z.literal(PROGRAM_SCHEMA_VERSION),
    id: identifier,
    program: z.string().trim().min(1).max(80),
    register: z.enum(['plain', 'coach', 'program']),
    terms: termsSchema,
    entries: z
      .array(
        z
          .object({
            id: identifier,
            situationId: identifier,
            name: z.string().trim().min(1).max(80),
            scope: scopeSchema,
            scopeTargetId: identifier.optional(),
            scopeUnassigned: z.boolean().optional(),
            when: z.string().max(200),
            headVersionId: identifier,
            versions: z.array(versionSchema).min(1).max(500),
          })
          .strict(),
      )
      .max(300),
    defaults: z
      .array(
        z
          .object({ situationId: identifier, scope: scopeSchema, targetId: identifier.optional(), answer: refSchema })
          .strict(),
      )
      .max(300),
  })
  .strict()

export class UnsupportedProgramSchemaError extends Error {
  constructor(readonly schemaVersion: number) {
    super(`Program schema ${schemaVersion} is newer or unsupported. The original is preserved.`)
  }
}
export interface ProgramCodec {
  parse(input: unknown): ProgramKnowledge
  parseText(text: string): ProgramKnowledge
  export(program: ProgramKnowledge, exportedAt: string): string
  parseExport(text: string): ProgramKnowledge
}

/** Validators are injected pure engine/schema functions; availability is checked only before replay. */
export function createProgramCodec(validators: { execution(input: unknown): StoredExecutionInput }): ProgramCodec {
  function parse(input: unknown): ProgramKnowledge {
    if (
      input &&
      typeof input === 'object' &&
      'schema' in input &&
      typeof input.schema === 'number' &&
      input.schema !== PROGRAM_SCHEMA_VERSION
    )
      throw new UnsupportedProgramSchemaError(input.schema)
    const program = shapeSchema.parse(input) as unknown as ProgramKnowledge
    const entryIds = new Set<string>(),
      versionIds = new Set<string>()
    let count = 0
    for (const entry of program.entries) {
      if (entryIds.has(entry.id)) throw new Error('Answer IDs must be unique.')
      entryIds.add(entry.id)
      if (entry.scope !== 'lineup' && entry.scope !== 'game' && entry.scopeTargetId)
        throw new Error('Only lineup and game answers may have a target identity.')
      const ownIds = new Set(entry.versions.map((v) => v.id))
      if (!ownIds.has(entry.headVersionId)) throw new Error('The accepted head must refer to an existing version.')
      let ordinal = 0
      for (const version of entry.versions) {
        if (versionIds.has(version.id)) throw new Error('Version IDs must be unique.')
        versionIds.add(version.id)
        count++
        if (version.v <= ordinal) throw new Error('Version ordinals must increase within an answer.')
        ordinal = version.v
        if (
          version.priorHeadVersionId &&
          !entry.versions.some((v) => v.id === version.priorHeadVersionId && v.v < version.v)
        )
          throw new Error('A replaced head must be an earlier version of the same answer.')
        if (version.snapshot.kind === 'executable') {
          version.snapshot.input = validators.execution(version.snapshot.input)
          // Editing provenance may belong to another family or archived grammar, independently of replay support.
          if (version.snapshot.recipe !== undefined) version.snapshot.recipe = parseStoredJson(version.snapshot.recipe)
        } else version.snapshot.recipe = parseLegacyRecipe(version.snapshot.recipe)
        for (const found of version.knownBreaks) {
          if (found.candidate !== undefined) found.candidate = validators.execution(found.candidate)
          if (found.search) found.search.recipe = parseStoredJson(found.search.recipe)
          if (
            found.witness &&
            (found.witness.end < found.witness.start ||
              found.witness.at < found.witness.start ||
              found.witness.at > found.witness.end)
          )
            throw new Error('Break witness times must lie inside their interval.')
        }
        const supportedInput =
          version.snapshot.kind === 'executable' && executionCompatibility(version.snapshot.input).replayable
            ? parseExecutionInput(version.snapshot.input)
            : null
        const duration =
          version.snapshot.kind === 'legacy-unverified'
            ? version.snapshot.recipe.assumptions.duration
            : supportedInput
              ? supportedInput.assumptions.duration
              : undefined
        if (duration !== undefined) {
          if (version.teachAt !== undefined && version.teachAt > duration)
            throw new Error('Teaching moment exceeds the replay duration.')
          let previous = -1
          for (const at of version.teaching?.checkpointTimes ?? []) {
            if (at < previous || at > duration)
              throw new Error('Teaching checkpoints must be chronological and inside the replay.')
            previous = at
          }
        }
        if (version.evidence.state === 'recorded') {
          if (
            version.snapshot.kind !== 'executable' ||
            (version.snapshot.recipe && !version.evidence.configFingerprint) ||
            !version.evidence.inputFingerprint ||
            !version.evidence.engineVersion ||
            !version.evidence.content ||
            !version.evidence.queryVersion
          )
            throw new Error('Recorded evidence needs exact executable and query provenance.')
          if (version.evidence.inputFingerprint !== canonicalStringify(version.snapshot.input))
            throw new Error('Accepted evidence refers to a different executable input.')
          if (
            version.evidence.engineVersion !== version.snapshot.input.engineVersion ||
            fingerprint(version.evidence.content) !== fingerprint(version.snapshot.input.content)
          )
            throw new Error('Accepted evidence uses different engine or content versions.')
          if (
            version.snapshot.recipe &&
            !matchesFingerprint(version.evidence.configFingerprint, version.snapshot.recipe)
          )
            throw new Error('Accepted evidence refers to a different Lab experiment.')
          if (supportedInput) for (const accepted of version.accepts) validateTradeoff(accepted, supportedInput)
          for (const found of version.knownBreaks) {
            if (
              !found.candidate ||
              !found.witness ||
              !found.search ||
              found.baseInputFingerprint !== version.evidence.inputFingerprint ||
              found.queryVersion !== version.evidence.queryVersion ||
              found.search.version !== found.queryVersion ||
              found.candidateInputFingerprint !== canonicalStringify(found.candidate)
            )
              throw new Error('A recorded break needs its tested base, candidate, witness and query recipe identity.')
            if (
              found.candidate.engineVersion !== version.snapshot.input.engineVersion ||
              fingerprint(found.candidate.content) !== fingerprint(version.snapshot.input.content)
            )
              throw new Error('A recorded break uses different engine or content versions.')
            // Unknown execution versions remain opaque. Semantic evidence validation needs supported input semantics.
            if (!supportedInput) continue
            const candidate = parseExecutionInput(found.candidate)
            validateTradeoff(found, candidate)
            const parameters = new Set(supportedInput.program.parameters.map((p) => p.id))
            if (
              new Set(found.search.allowedParameterIds).size !== found.search.allowedParameterIds.length ||
              found.search.allowedParameterIds.some((id) => !parameters.has(id))
            )
              throw new Error('Break search refers to an absent or repeated content parameter.')
            if (
              !candidate.program.players.some((p) => p.id === found.witness!.playerId && p.team === 'offense') ||
              !candidate.program.players.some((p) => p.id === found.witness!.defenderId && p.team === 'defense')
            )
              throw new Error('Break witness refers to absent offensive or defensive players.')
            if (found.witness.end > candidate.assumptions.duration + 1e-9)
              throw new Error('Break witness exceeds its candidate replay duration.')
            const fixedInput = (input: StoredExecutionInput) => {
              const parameters = input.parameters
              if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters))
                throw new Error('Recorded parameter search needs a parameterized executable input.')
              return {
                ...input,
                parameters: Object.fromEntries(
                  Object.entries(parameters).filter(([id]) => !found.search!.allowedParameterIds.includes(id)),
                ),
              }
            }
            if (
              canonicalStringify(fixedInput(found.candidate)) !== canonicalStringify(fixedInput(version.snapshot.input))
            )
              throw new Error('A recorded break changed inputs outside its declared search parameters.')
          }
        }
      }
    }
    if (count > 5000) throw new Error('The program exceeds 5000 accepted versions. Export before removing history.')
    const visits = new Set<string>(),
      visited = new Set<string>()
    function checkLineage(ref: VersionRef): void {
      if (visits.has(ref.versionId)) throw new Error('Accepted version lineage cannot contain a cycle.')
      if (visited.has(ref.versionId)) return
      visits.add(ref.versionId)
      const version = getVersion(program, ref)
      if (version.basedOn) checkLineage(version.basedOn)
      visits.delete(ref.versionId)
      visited.add(ref.versionId)
    }
    for (const entry of program.entries)
      for (const version of entry.versions) checkLineage({ entryId: entry.id, versionId: version.id })
    const defaultKeys = new Set<string>()
    for (const binding of program.defaults) {
      const key = `${binding.situationId}:${binding.scope}:${binding.targetId ?? ''}`
      if (defaultKeys.has(key)) throw new Error('Only one selected default may apply to a scope.')
      defaultKeys.add(key)
      const entry = getEntry(program, binding.answer.entryId)
      getVersion(program, binding.answer)
      if (
        entry.situationId !== binding.situationId ||
        entry.scope !== binding.scope ||
        entry.scopeUnassigned ||
        (entry.scopeTargetId ?? '') !== (binding.targetId ?? '')
      )
        throw new Error('Selected default does not match its answer scope.')
      if ((binding.scope === 'game' || binding.scope === 'lineup') && !binding.targetId)
        throw new Error('Lineup and game defaults need a target identity.')
      if (binding.scope !== 'game' && binding.scope !== 'lineup' && binding.targetId)
        throw new Error('A team-level default cannot have a lineup or game target.')
    }
    checkBytes(
      JSON.stringify({ format: 'courtiq-program', schemaVersion: 2, exportedAt: '9999-12-31T23:59:59.999Z', program }),
    )
    return program
  }
  function parseText(text: string) {
    checkBytes(text)
    return parse(JSON.parse(text))
  }
  return {
    parse,
    parseText,
    export(program, exportedAt) {
      stamp.parse(exportedAt)
      const text = JSON.stringify({ format: 'courtiq-program', schemaVersion: 2, exportedAt, program: parse(program) })
      checkBytes(text)
      return text
    },
    parseExport(text) {
      checkBytes(text)
      const outer = JSON.parse(text)
      if (outer?.format !== 'courtiq-program') throw new Error('This file is not a CourtIQ program export.')
      if (outer.schemaVersion !== 2) throw new UnsupportedProgramSchemaError(outer.schemaVersion)
      const envelope = z
        .object({
          format: z.literal('courtiq-program'),
          schemaVersion: z.literal(2),
          exportedAt: stamp,
          program: z.unknown(),
        })
        .strict()
        .parse(outer)
      return parse(envelope.program)
    },
  }
}

function validateTradeoff(tradeoff: Tradeoff, input: ExecutionInput): void {
  if (!input.program.opportunities.some((opportunity) => opportunity.id === tradeoff.threatId))
    throw new Error('Recorded tradeoff refers to an absent content opportunity.')
  // The Lab rounds measured exposure to hundredths when accepting an answer.
  if (tradeoff.seconds > input.assumptions.duration + 0.005 + 1e-9)
    throw new Error('Recorded exposure exceeds its replay duration.')
}

export function checkBytes(text: string): void {
  const exceeded = () => {
    throw new Error(`This program exceeds the ${MAX_PROGRAM_BYTES / (1024 * 1024)} MiB portable program limit.`)
  }
  // Every UTF-16 code unit needs at least one UTF-8 byte. Reject oversized ASCII without scanning or parsing it.
  if (text.length > MAX_PROGRAM_BYTES) exceeded()
  // UTF-8 byte counting without a DOM/global TextEncoder requirement.
  let bytes = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    bytes +=
      code < 0x80
        ? 1
        : code < 0x800
          ? 2
          : code >= 0xd800 &&
              code <= 0xdbff &&
              i + 1 < text.length &&
              text.charCodeAt(i + 1) >= 0xdc00 &&
              text.charCodeAt(i + 1) <= 0xdfff
            ? (i++, 4)
            : 3
    if (bytes > MAX_PROGRAM_BYTES) exceeded()
  }
}
/** Preserve unavailable editing provenance as bounded JSON without interpreting a future recipe. */
export function parseStoredJson(value: unknown): StoredJson {
  let nodes = 0
  function visit(item: unknown, depth: number): void {
    if (++nodes > 20_000 || depth > 40) throw new Error('Stored recipe exceeds its JSON budget.')
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new Error('Stored recipe numbers must be finite.')
    } else if (typeof item === 'string') {
      if (item.length > 100_000) throw new Error('Stored recipe strings exceed their budget.')
    } else if (item && typeof item === 'object') {
      if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype)
        throw new Error('Stored recipe must be plain JSON.')
      for (const [key, child] of Object.entries(item)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key))
          throw new Error('Stored recipe contains an unsupported object key.')
        visit(child, depth + 1)
      }
    } else if (item !== null && typeof item !== 'boolean') throw new Error('Stored recipe must be serializable JSON.')
  }
  visit(value, 0)
  return clone(value) as StoredJson
}
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
/** Lossless canonical identity, deliberately not a lossy/adversarially-collidable short hash. */
export function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${fingerprint(v)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
/** Historical locale-ordered canonical JSON remains valid without rewriting its recorded identity. */
function matchesFingerprint(recorded: string | undefined, value: unknown): boolean {
  const expected = fingerprint(value)
  if (recorded === expected) return true
  if (!recorded) return false
  try {
    checkBytes(recorded)
    return fingerprint(parseStoredJson(JSON.parse(recorded))) === expected
  } catch {
    return false
  }
}
export function emptySystem(id: string): ProgramKnowledge {
  return { schema: 2, id, program: 'Our program', register: 'plain', terms: {}, entries: [], defaults: [] }
}
export function getEntry(program: ProgramKnowledge, entryId: string): SystemEntry {
  const entry = program.entries.find((e) => e.id === entryId)
  if (!entry) throw new Error('The saved answer no longer exists.')
  return entry
}
export function getVersion(program: ProgramKnowledge, ref: VersionRef): SystemVersion {
  const version = getEntry(program, ref.entryId).versions.find((v) => v.id === ref.versionId)
  if (!version) throw new Error('The selected saved version no longer exists.')
  return version
}
export function headVersion(entry: SystemEntry): SystemVersion {
  const version = entry.versions.find((v) => v.id === entry.headVersionId)
  if (!version) throw new Error('The accepted version is missing.')
  return version
}
/** Structural metadata only; a parsed recipe does not establish authoring availability. */
function parsedRecipeFor(version: SystemVersion): LabConfig | null {
  if (version.snapshot.recipe === undefined) return null
  try {
    return parseLabConfig(version.snapshot.recipe)
  } catch {
    return null
  }
}

/** Native editing must reproduce the accepted executable exactly. Legacy recipes can only be explicitly re-tested. */
export function recipeFor(version: SystemVersion, compile: (recipe: LabConfig) => ExecutionInput): LabConfig | null {
  const recipe = parsedRecipeFor(version)
  if (!recipe) return null
  try {
    const compiled = compile(recipe)
    if (
      version.snapshot.kind === 'executable' &&
      canonicalStringify(compiled) !== canonicalStringify(version.snapshot.input)
    )
      return null
    return recipe
  } catch {
    return null
  }
}

export interface AcceptInput {
  entryId: string
  versionId: string
  at: string
  targetEntryId?: string
  expectedHeadVersionId?: string
  basedOn?: VersionRef
  name: string
  situationId: string
  scope: Scope
  when: string
  presetIds: string[]
  snapshot: AcceptedSnapshot
  note: string
  accepts: Tradeoff[]
  knownBreaks: BreakEvidence[]
  evidence: AcceptanceEvidence
  teachAt?: number
  teaching?: TeachingRecipe
  terms?: Record<string, string>
}
/** IDs, wall-clock time and the materialized executable snapshot arrive from the application boundary. */
export function acceptAnswer(
  program: ProgramKnowledge,
  input: AcceptInput,
): { program: ProgramKnowledge; entry: SystemEntry; version: SystemVersion } {
  const existing = input.targetEntryId ? getEntry(program, input.targetEntryId) : undefined
  if (existing && existing.headVersionId !== input.expectedHeadVersionId)
    throw new Error('This answer changed since you opened it. Review its latest version before saving.')
  if (!existing && program.entries.some((e) => e.id === input.entryId))
    throw new Error('The new answer identity already exists.')
  if (program.entries.some((e) => e.versions.some((v) => v.id === input.versionId)))
    throw new Error('The new version identity already exists.')
  if (input.basedOn) getVersion(program, input.basedOn)
  const version: SystemVersion = clone({
    id: input.versionId,
    v: (existing?.versions.at(-1)?.v ?? 0) + 1,
    savedAt: input.at,
    ...(input.basedOn ? { basedOn: input.basedOn } : {}),
    ...(existing ? { priorHeadVersionId: existing.headVersionId } : {}),
    snapshot: input.snapshot,
    presetIds: input.presetIds,
    note: input.note,
    accepts: input.accepts,
    knownBreaks: input.knownBreaks,
    evidence: input.evidence,
    ...(input.teachAt !== undefined ? { teachAt: input.teachAt } : {}),
    ...(input.teaching ? { teaching: input.teaching } : {}),
    ...(input.terms ? { terms: input.terms } : {}),
  })
  const entry: SystemEntry = {
    id: existing?.id ?? input.entryId,
    name: input.name.trim(),
    situationId: input.situationId,
    scope: input.scope,
    when: input.when,
    headVersionId: version.id,
    versions: [...(existing?.versions ?? []), version],
    ...((input.scope === 'game' || input.scope === 'lineup') && existing?.scopeTargetId
      ? { scopeTargetId: existing.scopeTargetId }
      : {}),
  }
  const next = {
    ...program,
    entries: existing ? program.entries.map((e) => (e.id === existing.id ? entry : e)) : [...program.entries, entry],
  }
  // Scope changes invalidate an old selected default, rather than silently moving its authority.
  next.defaults = program.defaults
    .filter(
      (d) =>
        d.answer.entryId !== entry.id ||
        (d.scope === entry.scope &&
          d.situationId === entry.situationId &&
          (d.targetId ?? '') === (entry.scopeTargetId ?? '')),
    )
    .map((d) => (d.answer.entryId === entry.id ? { ...d, answer: { entryId: entry.id, versionId: version.id } } : d))
  return { program: next, entry, version }
}

export function selectDefault(program: ProgramKnowledge, entryId: string): ProgramKnowledge {
  const entry = getEntry(program, entryId)
  if (entry.scopeUnassigned || ((entry.scope === 'lineup' || entry.scope === 'game') && !entry.scopeTargetId))
    throw new Error('Select a team or game identity before using this answer as a default.')
  const binding = {
    situationId: entry.situationId,
    scope: entry.scope,
    ...(entry.scopeTargetId ? { targetId: entry.scopeTargetId } : {}),
    answer: { entryId, versionId: entry.headVersionId },
  }
  return {
    ...program,
    defaults: [
      ...program.defaults.filter(
        (d) =>
          !(
            d.situationId === binding.situationId &&
            d.scope === binding.scope &&
            (d.targetId ?? '') === (binding.targetId ?? '')
          ),
      ),
      binding,
    ],
  }
}
export function resolveFor(
  program: ProgramKnowledge,
  situationId: string,
  scope: Scope,
  targetId?: string,
):
  | { kind: 'none' }
  | { kind: 'ambiguous'; entries: SystemEntry[] }
  | { kind: 'resolved'; entry: SystemEntry; version: SystemVersion } {
  for (const level of [...new Set([scope, 'program' as const])]) {
    const entries = program.entries.filter(
      (e) =>
        e.situationId === situationId &&
        e.scope === level &&
        !e.scopeUnassigned &&
        ((level !== 'lineup' && level !== 'game') || (!!targetId && e.scopeTargetId === targetId)),
    )
    const selected = program.defaults.find(
      (d) =>
        d.situationId === situationId &&
        d.scope === level &&
        (d.targetId ?? '') === (level === 'lineup' || level === 'game' ? (targetId ?? '') : ''),
    )
    if (selected) {
      const entry = getEntry(program, selected.answer.entryId)
      return { kind: 'resolved', entry, version: getVersion(program, selected.answer) }
    }
    if (entries.length > 1) return { kind: 'ambiguous', entries }
    if (entries.length === 1) return { kind: 'resolved', entry: entries[0]!, version: headVersion(entries[0]!) }
  }
  return { kind: 'none' }
}
export function contradictions(program: ProgramKnowledge): { a: SystemEntry; b: SystemEntry }[] {
  const out: { a: SystemEntry; b: SystemEntry }[] = []
  for (let i = 0; i < program.entries.length; i++)
    for (let j = i + 1; j < program.entries.length; j++) {
      const a = program.entries[i]!,
        b = program.entries[j]!
      if (
        !a.scopeUnassigned &&
        !b.scopeUnassigned &&
        a.situationId === b.situationId &&
        a.scope === b.scope &&
        (a.scopeTargetId ?? '') === (b.scopeTargetId ?? '') &&
        ((a.scope !== 'lineup' && a.scope !== 'game') || !!a.scopeTargetId) &&
        !program.defaults.some(
          (d) =>
            d.situationId === a.situationId && d.scope === a.scope && (d.targetId ?? '') === (a.scopeTargetId ?? ''),
        )
      )
        out.push({ a, b })
    }
  return out
}
export function programVoice(
  program: Pick<ProgramKnowledge, 'register' | 'terms'>,
  answerTerms?: Record<string, string>,
): { register: 'plain' | 'coach'; terms: Record<string, string> } {
  const terms: Record<string, string> = {}
  for (const [key, value] of Object.entries({ ...program.terms, ...answerTerms })) {
    if (key.startsWith('coverage:')) terms[key.slice(9)] = value
    else if (program.register === 'program') terms[key.startsWith('concept:') ? key.slice(8) : key] = value
  }
  return { register: program.register === 'program' ? 'coach' : program.register, terms }
}
export function versionDiff(prev: SystemVersion | undefined, next: SystemVersion): string[] {
  if (!prev) return ['First version']
  const a = parsedRecipeFor(prev),
    b = parsedRecipeFor(next)
  if (!a || !b)
    return fingerprint(prev.snapshot) === fingerprint(next.snapshot)
      ? ['Same executable inputs']
      : ['Executable inputs changed']
  const out: string[] = []
  for (const key of new Set([...Object.keys(a.answer), ...Object.keys(b.answer)])) {
    const before = a.answer[key as keyof typeof a.answer],
      after = b.answer[key as keyof typeof b.answer]
    if (fingerprint(before) !== fingerprint(after))
      out.push(key === 'coachRules' ? 'coach rules changed' : `${key}: ${String(before)} → ${String(after)}`)
  }
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
    if (key !== 'answer' && fingerprint(a[key as keyof LabConfig]) !== fingerprint(b[key as keyof LabConfig]))
      out.push(`${key} changed`)
  return out.length ? out : ['Same basketball (re-saved)']
}
