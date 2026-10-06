import { z } from 'zod'
import type { LabConfig } from '../types'
import {
  LEGACY_ANSWERS_KEY,
  LEGACY_SYSTEM_KEY,
  clone,
  emptySystem,
  type ProgramKnowledge,
  type Scope,
  type SystemEntry,
  type SystemVersion,
} from './model'

import { legacyRecipeSchema } from './legacyRecipe'
export { legacyRecipeSchema, parseLegacyRecipe } from './legacyRecipe'

const n = (min: number, max: number) => z.number().finite().min(min).max(max)
const roles = [
  'ballhandler',
  'strong-corner',
  'weak-corner',
  'weak-lift',
  'screener',
  'poa',
  'strong-side',
  'low-man',
  'backside',
  'big',
] as const
const time = z.string().datetime({ offset: true })
const id = z.string().min(1).max(120)
const tradeoff = z
  .object({ threatId: z.enum(['drive', 'roll', 'pop', 'corner', 'lift', 'strong']), seconds: n(0, 20) })
  .strict()
const version = z
  .object({
    v: z.number().int().min(1),
    savedAt: time,
    config: legacyRecipeSchema,
    note: z.string().max(400),
    accepts: z.array(tradeoff).max(12),
    knownBreaks: z
      .array(z.object({ label: z.string().max(200), threatId: tradeoff.shape.threatId, seconds: n(0, 20) }).strict())
      .max(12),
    teachAt: n(0, 20).optional(),
  })
  .strict()
const scope = z.enum(['program', 'varsity', 'jv', 'freshman', 'lineup', 'game'])
const systemSchema = z
  .object({
    schema: z.literal(1),
    program: z.string().max(80),
    register: z.enum(['plain', 'coach', 'program']),
    terms: z.record(z.string().max(60), z.string().max(40)),
    entries: z
      .array(
        z
          .object({
            id,
            situationId: id,
            name: z.string().min(1).max(60),
            presetIds: z.array(z.string().max(60)).max(12),
            scope,
            when: z.string().max(120),
            versions: z.array(version).min(1).max(50),
          })
          .strict(),
      )
      .max(200),
  })
  .strict()
const oldAnswer = z
  .object({
    schemaVersion: z.literal(1),
    id,
    name: z.string().trim().min(1).max(80),
    createdAt: time,
    updatedAt: time,
    problemVersion: z.string().min(1).max(80),
    engineVersion: z.string().min(1).max(80),
    config: legacyRecipeSchema,
    terminology: z.record(z.enum(roles), z.string().trim().min(1).max(80)),
    teaching: z
      .object({
        role: z.enum(['poa', 'strong-side', 'low-man', 'backside', 'big']),
        checkpointTimes: z.array(n(0, 12)).max(20),
        cue: z.string().max(500),
      })
      .strict(),
    notes: z.string().max(2000),
  })
  .strict()
const answersSchema = z
  .object({
    format: z.literal('courtiq-defense-lab-answers'),
    schemaVersion: z.literal(1),
    answers: z.array(oldAnswer).max(100),
  })
  .strict()
const coverageIds = new Set(['drop', 'switch', 'blitz', 'hedge', 'ice', 'custom'])
const conceptIds = new Set([
  'ball-screen',
  'poa',
  'screen-defender',
  'low-man',
  'tag',
  'lift',
  'x-out',
  'skip-pass',
  'closeout',
  'roller',
  'pocket-pass',
  'short-roll',
  'pop',
  'reject',
  'rotation',
  'help',
  'recover',
  'stunt',
  'weak-side',
  'strong-side',
  'corner',
  'nail',
  'drive',
  'strong-corner',
  'weak-corner',
])
export function namespaceTerms(terms: Record<string, string>, roleOnly = false): Record<string, string> {
  return Object.fromEntries(
    Object.entries(terms)
      .filter(([, v]) => v.trim())
      .map(([k, v]) => [
        k.includes(':')
          ? k
          : roleOnly
            ? `role:${k}`
            : coverageIds.has(k)
              ? `coverage:${k}`
              : conceptIds.has(k)
                ? `concept:${k}`
                : `legacy:${k}`,
        v.trim(),
      ]),
  )
}

export function decodeLegacySource(key: string, raw: string, programId: string): ProgramKnowledge {
  if (raw.length > 2 * 1024 * 1024)
    throw new Error('The legacy source exceeds its supported 2 MB limit; the original is preserved.')
  const decoded: unknown = JSON.parse(raw)
  const program = emptySystem(programId)
  if (key === LEGACY_SYSTEM_KEY) {
    const legacy = systemSchema.parse(decoded)
    program.program = legacy.program.trim() || 'Our program'
    program.register = legacy.register
    program.terms = namespaceTerms(legacy.terms)
    program.entries = legacy.entries.map((e) => {
      let prior: string | undefined
      const versions: SystemVersion[] = e.versions.map((v) => {
        const versionId = `legacy-system:${e.id}:v${v.v}`
        const next: SystemVersion = {
          id: versionId,
          v: v.v,
          savedAt: v.savedAt,
          ...(prior ? { basedOn: { entryId: e.id, versionId: prior }, priorHeadVersionId: prior } : {}),
          snapshot: { kind: 'legacy-unverified', source: 'our-system-v1', recipe: v.config as LabConfig },
          presetIds: [...e.presetIds],
          note: v.note,
          accepts: v.accepts,
          knownBreaks: v.knownBreaks,
          evidence: { state: 'legacy-unknown' },
          ...(v.teachAt !== undefined ? { teachAt: v.teachAt } : {}),
        }
        prior = versionId
        return next
      })
      return {
        id: e.id,
        situationId: e.situationId,
        name: e.name,
        scope: e.scope,
        when: e.when,
        headVersionId: prior!,
        versions,
      }
    })
    return clone(program)
  }
  if (key === LEGACY_ANSWERS_KEY) {
    const legacy = answersSchema.parse(decoded)
    if (new Set(legacy.answers.map((a) => a.id)).size !== legacy.answers.length)
      throw new Error('Legacy answer IDs must be unique.')
    program.entries = legacy.answers.map((a) => {
      const entryId = `legacy-answer:${a.id}`,
        versionId = `${entryId}:v1`
      const entry: SystemEntry = {
        id: entryId,
        name: a.name,
        situationId: 'high-pnr-middle',
        scope: 'program' as Scope,
        scopeUnassigned: true,
        when: 'Legacy saved answer — team scope was not recorded',
        headVersionId: versionId,
        versions: [
          {
            id: versionId,
            v: 1,
            savedAt: a.updatedAt,
            snapshot: {
              kind: 'legacy-unverified',
              source: 'answers-v1',
              recipe: a.config as LabConfig,
              engineVersion: a.engineVersion,
              problemVersion: a.problemVersion,
              createdAt: a.createdAt,
              updatedAt: a.updatedAt,
            },
            presetIds: [],
            note: a.notes,
            accepts: [],
            knownBreaks: [],
            evidence: { state: 'legacy-unknown' },
            teaching: a.teaching,
            terms: namespaceTerms(a.terminology, true),
          },
        ],
      }
      if (Date.parse(a.updatedAt) < Date.parse(a.createdAt)) throw new Error('Legacy revision date precedes creation.')
      return entry
    })
    return clone(program)
  }
  throw new Error('The legacy source format is not recognized.')
}
