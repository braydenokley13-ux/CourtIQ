import { z } from 'zod'
import { labConfigSchema } from './answers'
import type { LabConfig, ThreatId } from './types'

/** Our System: where CourtIQ remembers how a program plays. It grows from
 * solved Lab problems; every version keeps the exact executable config. */
export type Scope = 'program' | 'varsity' | 'jv' | 'freshman' | 'lineup' | 'game'
export const SCOPES: { id: Scope; label: string; hint: string }[] = [
  { id: 'program', label: 'Whole program', hint: 'Default for every level' },
  { id: 'varsity', label: 'Varsity', hint: 'Overrides the program default' },
  { id: 'jv', label: 'JV', hint: 'Inherits the program default unless set' },
  { id: 'freshman', label: 'Freshman', hint: 'Inherits the program default unless set' },
  { id: 'lineup', label: 'One lineup', hint: 'An exception for certain personnel' },
  { id: 'game', label: 'This game only', hint: 'A temporary game-plan override' },
]

export interface Tradeoff { threatId: ThreatId; seconds: number }
export interface SystemVersion {
  v: number
  savedAt: string
  config: LabConfig
  /** What changed from the previous version, in the coach's words. */
  note: string
  /** Openings the coach saw and accepted when saving: the honest cost. */
  accepts: Tradeoff[]
  /** Counters CourtIQ found that break this version (Break Mode evidence). */
  knownBreaks: { label: string; threatId: ThreatId; seconds: number }[]
  teachAt?: number
}
export interface SystemEntry {
  id: string
  situationId: string
  /** The team's own word, e.g. "Blue". */
  name: string
  presetIds: string[]
  scope: Scope
  when: string
  versions: SystemVersion[]
}
export interface ProgramSystem {
  schema: 1
  program: string
  register: 'plain' | 'coach'
  /** Team terminology: concept/answer/role id → team word. */
  terms: Record<string, string>
  entries: SystemEntry[]
}

const tradeoff = z.object({ threatId: z.enum(['drive', 'roll', 'pop', 'corner', 'lift', 'strong']), seconds: z.number().finite().min(0).max(20) })
const versionSchema = z.object({
  v: z.number().int().min(1), savedAt: z.string().max(40), config: labConfigSchema, note: z.string().max(400),
  accepts: z.array(tradeoff).max(12),
  knownBreaks: z.array(z.object({ label: z.string().max(200), threatId: tradeoff.shape.threatId, seconds: z.number().finite().min(0).max(20) })).max(12),
  teachAt: z.number().finite().min(0).max(20).optional(),
})
const entrySchema = z.object({
  id: z.string().max(80), situationId: z.string().max(80), name: z.string().min(1).max(60), presetIds: z.array(z.string().max(60)).max(12),
  scope: z.enum(['program', 'varsity', 'jv', 'freshman', 'lineup', 'game']), when: z.string().max(120), versions: z.array(versionSchema).min(1).max(50),
})
export const systemSchema = z.object({
  schema: z.literal(1), program: z.string().max(80), register: z.enum(['plain', 'coach']),
  terms: z.record(z.string().max(60), z.string().max(40)), entries: z.array(entrySchema).max(200),
})

export const SYSTEM_KEY = 'courtiq.our-system.v1'
export function emptySystem(): ProgramSystem { return { schema: 1, program: 'Our program', register: 'plain', terms: {}, entries: [] } }

type Store = Pick<Storage, 'getItem' | 'setItem'>
let memory: ProgramSystem | null = null
function store(): Store | null { try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null } }

export function loadSystem(s: Store | null = store()): ProgramSystem {
  if (memory) return memory
  try {
    const raw = s?.getItem(SYSTEM_KEY)
    memory = raw ? systemSchema.parse(JSON.parse(raw)) as ProgramSystem : emptySystem()
  } catch { memory = emptySystem() }
  return memory
}
export function persistSystem(next: ProgramSystem, s: Store | null = store()): { ok: boolean } {
  memory = next
  try { s?.setItem(SYSTEM_KEY, JSON.stringify(next)); return { ok: !!s } } catch { return { ok: false } }
}
export function resetSystemCache() { memory = null }

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `e-${Date.now()}-${Math.random().toString(36).slice(2)}`)

/** Save the Lab result as our answer. Same name + situation + scope → new version. */
export function saveToSystem(system: ProgramSystem, input: { name: string; situationId: string; scope: Scope; when: string; presetIds: string[]; config: LabConfig; note: string; accepts: Tradeoff[]; knownBreaks?: SystemVersion['knownBreaks']; teachAt?: number }, now = new Date()): { system: ProgramSystem; entry: SystemEntry; version: SystemVersion } {
  const config = labConfigSchema.parse(JSON.parse(JSON.stringify(input.config))) as LabConfig
  const existing = system.entries.find(e => e.situationId === input.situationId && e.scope === input.scope && e.name.trim().toLowerCase() === input.name.trim().toLowerCase())
  const version: SystemVersion = { v: (existing?.versions.at(-1)?.v ?? 0) + 1, savedAt: now.toISOString(), config, note: input.note, accepts: input.accepts, knownBreaks: input.knownBreaks ?? [], ...(input.teachAt !== undefined ? { teachAt: input.teachAt } : {}) }
  const entry: SystemEntry = existing
    ? { ...existing, presetIds: input.presetIds, when: input.when, versions: [...existing.versions, version].slice(-50) }
    : { id: newId(), situationId: input.situationId, name: input.name.trim(), presetIds: input.presetIds, scope: input.scope, when: input.when, versions: [version] }
  const entries = existing ? system.entries.map(e => e.id === existing.id ? entry : e) : [...system.entries, entry]
  return { system: { ...system, entries }, entry, version }
}

/** Resolve which entry applies for a level: specific scope beats program default. */
export function resolveFor(system: ProgramSystem, situationId: string, level: Scope): SystemEntry | null {
  const order: Scope[] = level === 'game' ? ['game', 'varsity', 'program'] : level === 'lineup' ? ['lineup', 'varsity', 'program'] : [level, 'program']
  for (const scope of order) { const hit = system.entries.find(e => e.situationId === situationId && e.scope === scope); if (hit) return hit }
  return null
}

/** Two saved answers for the same situation and level contradict each other. */
export function contradictions(system: ProgramSystem): { a: SystemEntry; b: SystemEntry }[] {
  const out: { a: SystemEntry; b: SystemEntry }[] = []
  for (let i = 0; i < system.entries.length; i++) for (let j = i + 1; j < system.entries.length; j++) {
    const a = system.entries[i], b = system.entries[j]
    if (a.situationId === b.situationId && a.scope === b.scope) out.push({ a, b })
  }
  return out
}

/** Human-readable diff between two versions' executable answers. */
export function versionDiff(prev: SystemVersion | undefined, next: SystemVersion): string[] {
  if (!prev) return ['First version']
  const a = prev.config.answer, b = next.config.answer, out: string[] = []
  for (const key of Object.keys(b) as (keyof typeof b)[]) {
    if (key === 'coachRules') continue
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) out.push(`${key}: ${fmt(a[key])} → ${fmt(b[key])}`)
  }
  if (JSON.stringify(a.coachRules ?? []) !== JSON.stringify(b.coachRules ?? [])) out.push('coach rules changed')
  return out.length ? out : ['Same rules (re-saved)']
}
const fmt = (v: unknown) => typeof v === 'number' ? (Math.round(v * 100) / 100).toString() : String(v)
