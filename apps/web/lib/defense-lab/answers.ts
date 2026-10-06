import { z } from 'zod'
import { CONFIG_SCHEMA_VERSION, ENGINE_VERSION, HIGH_PNR_PROBLEM } from './scenario'
import type { LabConfig, RoleId } from './types'

/** Portable inputs, not rendered frames. Teach must regenerate config in the engine. */
export interface SavedTeamAnswer {
  schemaVersion: 1
  id: string
  name: string
  createdAt: string
  updatedAt: string
  problemVersion: string
  engineVersion: string
  config: LabConfig
  terminology: Partial<Record<RoleId, string>>
  teaching: { role: RoleId; checkpointTimes: number[]; cue: string }
  notes: string
}

export interface AnswerResult {
  answers: SavedTeamAnswer[]
  persisted: boolean
  error?: string
  importedCount?: number
}

export type AnswerStorage = Pick<Storage, 'getItem' | 'setItem'>
export const ANSWER_STORAGE_KEY = 'courtiq.defense-lab.answers.v1'
export const MAX_SAVED_ANSWERS = 100
export const MAX_ANSWER_FILE_BYTES = 2 * 1024 * 1024

const roles = ['ballhandler', 'strong-corner', 'weak-corner', 'weak-lift', 'screener', 'poa', 'strong-side', 'low-man', 'backside', 'big'] as const
const teachingRoles = ['poa', 'strong-side', 'low-man', 'backside', 'big'] as const
const playerIds = ['O1', 'O2', 'O3', 'O4', 'O5', 'D1', 'D2', 'D3', 'D4', 'D5'] as const
const finite = (min: number, max: number) => z.number().finite().min(min).max(max)
const pointSchema = z.object({ x: finite(-7.3, 7.3), z: finite(0.4, 14) }).strict()
const movementTargetSchema = z.object({ x: finite(-7.25, 7.25), z: finite(0.4, 14) }).strict()
const coachRuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('roller-depth'), depth: finite(2.5, 7), response: z.enum(['low-man-tags', 'big-recovers']) }).strict(),
  z.object({ kind: z.literal('lift-rise'), rise: finite(0.5, 3), response: z.enum(['stay-with-lift', 'x-out']) }).strict(),
])
const teamAnswerSchema = z.object({
  coverage: z.enum(['drop', 'switch', 'blitz', 'hedge', 'ice', 'custom']),
  poa: z.enum(['over', 'under']),
  bigDepth: finite(1.5, 6),
  tag: z.boolean(),
  tagDepth: finite(0, 1),
  backside: z.enum(['x-out', 'stay']),
  rotationTiming: z.enum(['early', 'on-pass']),
  recovery: z.enum(['on-pass', 'roller-secured']),
  coachRules: z.array(coachRuleSchema).max(2).refine(rules => new Set(rules.map(rule => rule.kind)).size === rules.length, 'Use one response for each coaching observation.').optional(),
}).strict()
const assumptionsSchema = z.object({
  dt: finite(0.01, 0.05), duration: finite(2, 12),
  maxSpeed: finite(1, 8), acceleration: finite(1, 15),
  reactionDelay: finite(0, 0.8), passSpeed: finite(5, 20),
  ballRadius: finite(0.06, 0.2), bodyRadius: finite(0.18, 0.45),
  contestRadius: finite(0.5, 2), turnRate: finite(1, 10),
  gatherTime: finite(0.12, 0.6), readInterval: finite(0.05, 0.5),
  gravity: finite(8, 11), releaseHeight: finite(1.2, 2.4),
}).strict().refine(a => a.duration / a.dt <= 3000, 'The replay exceeds the supported frame budget.')
const opponentStrategySchema = z.object({
  screenAngle: finite(-0.65, 0.65), liftDelay: finite(-0.25, 0.6), liftWidth: finite(-0.7, 0.7),
  reject: z.boolean(), rescreen: z.boolean(), shortRoll: z.boolean(),
}).strict()
const interventionSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string().min(1).max(120), at: finite(0, 12), kind: z.literal('answer'), patch: teamAnswerSchema.partial().refine(p => Object.keys(p).length > 0, 'An adjustment needs at least one rule.') }).strict(),
  z.object({ id: z.string().min(1).max(120), at: finite(0, 12), kind: z.literal('opponent'), patch: opponentStrategySchema.partial().refine(p => Object.keys(p).length > 0, 'An opponent adjustment needs at least one rule.') }).strict(),
  z.object({ id: z.string().min(1).max(120), at: finite(0, 12), kind: z.literal('move'), playerId: z.enum(playerIds), target: movementTargetSchema, until: finite(0, 12).optional(), untilTrigger: z.enum(['ball-leaves', 'big-secured']).optional() }).strict(),
])

export const labConfigSchema: z.ZodType<LabConfig> = z.object({
  problemId: z.literal(HIGH_PNR_PROBLEM.id),
  seed: z.number().int().min(0).max(0xffffffff),
  counter: z.enum(['auto', 'roll', 'reject', 'pop', 'slip', 'lift', 'skip', 'extra', 'short-roll']),
  answer: teamAnswerSchema,
  assumptions: assumptionsSchema,
  interventions: z.array(interventionSchema).max(64),
  startingPositions: z.record(z.enum(playerIds), pointSchema).optional(),
  screenAngle: finite(-Math.PI, Math.PI).optional(),
  opponent: opponentStrategySchema.optional(),
}).strict().superRefine((config, ctx) => {
  const ids = new Set<string>()
  let previous = -Infinity
  config.interventions.forEach((intervention, index) => {
    if (intervention.at < previous || intervention.at > config.assumptions.duration) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Adjustments must be chronological and inside the replay.', path: ['interventions', index, 'at'] })
    }
    if (ids.has(intervention.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Adjustment IDs must be unique.', path: ['interventions', index, 'id'] })
    if (intervention.kind === 'move' && intervention.until !== undefined && (intervention.until <= intervention.at || intervention.until > config.assumptions.duration)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Movement end must follow its start and remain inside the replay.', path: ['interventions', index, 'until'] })
    }
    ids.add(intervention.id)
    previous = intervention.at
  })
})

export const savedAnswerSchema: z.ZodType<SavedTeamAnswer> = z.object({
  schemaVersion: z.literal(CONFIG_SCHEMA_VERSION),
  id: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(80),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  problemVersion: z.literal(HIGH_PNR_PROBLEM.version),
  engineVersion: z.literal(ENGINE_VERSION),
  config: labConfigSchema,
  terminology: z.record(z.enum(roles), z.string().trim().min(1).max(80)),
  teaching: z.object({ role: z.enum(teachingRoles), checkpointTimes: z.array(finite(0, 12)).max(20), cue: z.string().max(500) }).strict(),
  notes: z.string().max(2000),
}).strict().superRefine((answer, ctx) => {
  if (Date.parse(answer.updatedAt) < Date.parse(answer.createdAt)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Revision date precedes creation.' })
  answer.teaching.checkpointTimes.forEach((time, index, times) => {
    if (time > answer.config.assumptions.duration || (index > 0 && time < times[index - 1]!)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Teaching moments must be chronological and inside the replay.', path: ['teaching', 'checkpointTimes', index] })
    }
  })
})

const collectionSchema = z.object({
  format: z.literal('courtiq-defense-lab-answers'), schemaVersion: z.literal(1),
  answers: z.array(savedAnswerSchema).max(MAX_SAVED_ANSWERS),
}).strict().refine(collection => new Set(collection.answers.map(answer => answer.id)).size === collection.answers.length, 'Answer IDs must be unique.')

export function parseLabConfig(input: unknown): LabConfig { return labConfigSchema.parse(input) }
export function validateAnswer(input: unknown): SavedTeamAnswer { return savedAnswerSchema.parse(input) }

let idSequence = 0
function newId(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `answer-${Date.now().toString(36)}-${(++idSequence).toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function createAnswer(input: {
  name: string; config: LabConfig; terminology?: Partial<Record<RoleId, string>>
  teaching?: Partial<SavedTeamAnswer['teaching']>; notes?: string
}): SavedTeamAnswer {
  const now = new Date().toISOString()
  return validateAnswer({
    schemaVersion: 1, id: newId(), name: input.name, createdAt: now, updatedAt: now,
    problemVersion: HIGH_PNR_PROBLEM.version, engineVersion: ENGINE_VERSION,
    config: input.config, terminology: input.terminology ?? {},
    teaching: { role: input.teaching?.role ?? 'low-man', checkpointTimes: input.teaching?.checkpointTimes ?? [Math.min(HIGH_PNR_PROBLEM.stressAt, input.config.assumptions.duration)], cue: input.teaching?.cue ?? '' },
    notes: input.notes ?? '',
  })
}

interface Session { answers: SavedTeamAnswer[]; loaded: boolean; persisted: boolean; error?: string }
const browserSession: Session = { answers: [], loaded: false, persisted: false }
const explicitSessions = new WeakMap<AnswerStorage, Session>()
function resolve(storage?: AnswerStorage | null): { storage: AnswerStorage | null; session: Session } {
  if (storage) {
    let session = explicitSessions.get(storage)
    if (!session) { session = { answers: [], loaded: false, persisted: false }; explicitSessions.set(storage, session) }
    return { storage, session }
  }
  if (storage === null) return { storage: null, session: browserSession }
  // Never retain browser-local answers in a shared server module between requests.
  if (typeof window === 'undefined') return { storage: null, session: { answers: [], loaded: false, persisted: false } }
  try { return { storage: window.localStorage, session: browserSession } }
  catch { return { storage: null, session: browserSession } }
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function result(session: Session, error = session.error): AnswerResult {
  return { answers: clone(session.answers), persisted: session.persisted, ...(error ? { error } : {}) }
}
function validationError(error: unknown): string {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0]
    return `Answer data is not supported: ${issue?.path.join('.') || 'document'} — ${issue?.message ?? 'invalid data'}`
  }
  return 'This file is not valid CourtIQ answer JSON.'
}
function parseCollection(text: string): SavedTeamAnswer[] {
  if (new TextEncoder().encode(text).byteLength > MAX_ANSWER_FILE_BYTES) throw new Error('File exceeds the 2 MB answer limit.')
  return collectionSchema.parse(JSON.parse(text)).answers
}

function ensureLoaded(storage: AnswerStorage | null, session: Session): void {
  if (!storage) { session.persisted = false; session.error = 'Device storage is unavailable. Answers remain in memory; export before leaving.'; return }
  if (session.loaded) return
  let stored: string | null
  try { stored = storage.getItem(ANSWER_STORAGE_KEY) }
  catch { session.persisted = false; session.error = 'Device storage could not be read. Answers remain in memory; export before leaving.'; return }
  let answers: SavedTeamAnswer[]
  try { answers = stored ? parseCollection(stored) : [] }
  catch (error) { session.persisted = false; session.error = `${validationError(error)} Existing device data has not been replaced. Export this session before leaving.`; return }
  const merged = new Map(answers.map(answer => [answer.id, answer]))
  for (const answer of session.answers) merged.set(answer.id, answer)
  try { exportAnswers([...merged.values()]) }
  catch {
    session.persisted = false
    session.error = 'Device and session answers together exceed the supported collection size. Export this session before reloading; existing device answers have not changed.'
    return
  }
  const hadMemory = session.answers.length > 0
  session.answers = [...merged.values()]
  session.loaded = true
  session.persisted = !hadMemory
  session.error = hadMemory ? 'Session answers have not yet been saved on this device.' : undefined
}

function persist(storage: AnswerStorage | null, session: Session): AnswerResult {
  if (!storage || !session.loaded) {
    session.persisted = false
    session.error ??= 'Device storage is unavailable. Answers remain in memory; export before leaving.'
    return result(session)
  }
  try {
    const text = exportAnswers(session.answers)
    storage.setItem(ANSWER_STORAGE_KEY, text)
    session.persisted = true
    session.error = undefined
  } catch {
    session.persisted = false
    session.error = 'Device storage is full or unavailable. This answer remains in memory; export before leaving.'
  }
  return result(session)
}

export function loadAnswers(storage?: AnswerStorage | null): AnswerResult {
  const resolved = resolve(storage)
  ensureLoaded(resolved.storage, resolved.session)
  return result(resolved.session)
}

export function saveAnswer(answer: SavedTeamAnswer, storage?: AnswerStorage | null): AnswerResult {
  const { storage: target, session } = resolve(storage)
  ensureLoaded(target, session)
  let checked: SavedTeamAnswer
  try { checked = validateAnswer(answer) }
  catch (error) { return result(session, validationError(error)) }
  const index = session.answers.findIndex(existing => existing.id === checked.id)
  if (index < 0 && session.answers.length >= MAX_SAVED_ANSWERS) return result(session, 'This device has 100 answers. Export and remove an answer before adding another.')
  // Preserve chronological metadata even if an imported record used a fast device clock.
  checked.updatedAt = new Date(Math.max(Date.now(), Date.parse(checked.createdAt), Date.parse(checked.updatedAt))).toISOString()
  const candidate = [...session.answers]
  if (index >= 0) candidate[index] = checked
  else candidate.push(checked)
  try { exportAnswers(candidate) }
  catch { return result(session, 'The saved collection would exceed the 2 MB limit. Existing answers have not changed; export and remove an answer before adding this one.') }
  session.answers = candidate
  return persist(target, session)
}

export function deleteAnswer(id: string, storage?: AnswerStorage | null): AnswerResult {
  const { storage: target, session } = resolve(storage)
  ensureLoaded(target, session)
  session.answers = session.answers.filter(answer => answer.id !== id)
  return persist(target, session)
}

export function exportAnswers(answers: SavedTeamAnswer[]): string {
  const collection = collectionSchema.parse({ format: 'courtiq-defense-lab-answers', schemaVersion: 1, answers })
  const text = JSON.stringify(collection, null, 2)
  if (new TextEncoder().encode(text).byteLength > MAX_ANSWER_FILE_BYTES) throw new Error('Export exceeds the 2 MB answer limit.')
  return text
}

/** Imports are atomic. Collision imports get new identities; the existing answer survives. */
export function importAnswers(text: string, storage?: AnswerStorage | null): AnswerResult {
  const { storage: target, session } = resolve(storage)
  ensureLoaded(target, session)
  let imported: SavedTeamAnswer[]
  try { imported = parseCollection(text) }
  catch (error) { return result(session, error instanceof Error && !(error instanceof z.ZodError) && error.message.includes('2 MB') ? error.message : validationError(error)) }
  if (session.answers.length + imported.length > MAX_SAVED_ANSWERS) return result(session, 'The import would exceed 100 saved answers. Existing answers have not changed.')
  const ids = new Set(session.answers.map(answer => answer.id))
  const additions = imported.map(answer => {
    if (ids.has(answer.id)) answer = { ...answer, id: newId(), name: `${answer.name.slice(0, 69)} (imported)` }
    ids.add(answer.id)
    return answer
  })
  const candidate = [...session.answers, ...additions]
  try { exportAnswers(candidate) }
  catch { return result(session, 'The combined import would exceed the 2 MB limit. Existing answers have not changed.') }
  session.answers = candidate
  return { ...persist(target, session), importedCount: additions.length }
}
