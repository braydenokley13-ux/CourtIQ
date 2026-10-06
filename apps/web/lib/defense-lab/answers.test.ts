import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from './scenario'
import { simulate } from './simulation'
import { opponentAt } from './offensivePolicy'
import { ANSWER_STORAGE_KEY, createAnswer, deleteAnswer, exportAnswers, importAnswers, loadAnswers, parseLabConfig, saveAnswer, type AnswerStorage } from './answers'

function device(initial?: string): AnswerStorage & { value(): string | null; denyWrites: boolean; denyReads: boolean } {
  let value = initial ?? null
  return {
    denyWrites: false, denyReads: false,
    getItem(key) { expect(key).toBe(ANSWER_STORAGE_KEY); if (this.denyReads) throw new Error('denied'); return value },
    setItem(key, text) { expect(key).toBe(ANSWER_STORAGE_KEY); if (this.denyWrites) throw new Error('quota'); value = text },
    value: () => value,
  }
}

describe('portable team answers', () => {
  it('saves complete causal inputs and reconstructs them on a fresh device repository', () => {
    const config = createDefaultConfig()
    config.interventions = [
      { id: 'tag-edit', at: 1.2, kind: 'answer', patch: { tagDepth: 0.3 } },
      { id: 'backside-cue', at: 1.5, kind: 'move', playerId: 'D4', target: { x: -4, z: 7 }, until: 2.6, untilTrigger: 'ball-leaves' },
    ]
    config.startingPositions = { D3: { x: -4.6, z: 2.1 } }
    const answer = createAnswer({ name: 'Our blue vs lift', config, terminology: { 'low-man': 'Basket protector' }, teaching: { role: 'backside', cue: 'If low man tags, take first weakside pass.', checkpointTimes: [1.2, 1.8] } })
    const storage = device()
    const saved = saveAnswer(answer, storage)
    expect(saved.persisted).toBe(true)
    const loaded = loadAnswers(device(storage.value()!))
    expect(loaded.persisted).toBe(true)
    expect(loaded.answers[0]?.config).toEqual(config)
    expect(loaded.answers[0]?.terminology['low-man']).toBe('Basket protector')
    expect(loaded.answers[0]?.teaching.role).toBe('backside')
    expect(loaded.answers[0]?.engineVersion).toBe(answer.engineVersion)
    expect(exportAnswers(loaded.answers)).not.toContain('frames')
  })

  it('snapshots input objects so later experiment edits do not change a saved answer', () => {
    const config = createDefaultConfig()
    const originalDepth = config.answer.tagDepth
    const answer = createAnswer({ name: 'Drop', config })
    config.answer.tagDepth = 0.1
    expect(answer.config.answer.tagDepth).toBe(originalDepth)
    const storage = device()
    const result = saveAnswer(answer, storage)
    result.answers[0]!.config.answer.tagDepth = 1
    expect(loadAnswers(storage).answers[0]?.config.answer.tagDepth).toBe(originalDepth)
  })

  it('regenerates the exact canonical teaching replay after an exported causal answer is imported', () => {
    const config = createDefaultConfig()
    config.interventions = [{ id: 'shallow-at-read', at: 1.2, kind: 'answer', patch: { tagDepth: 0.3, rotationTiming: 'early' } }]
    const original = simulate(config)
    const answer = createAnswer({ name: 'Teach this revision', config, teaching: { role: 'backside', checkpointTimes: [1.2, 1.8] } })
    const imported = importAnswers(exportAnswers([answer]), device())
    const replay = simulate(imported.answers[0]!.config)
    expect(replay.frames).toEqual(original.frames)
    expect(replay.decisions).toEqual(original.decisions)
    expect(imported.answers[0]?.teaching.role).toBe('backside')
  })

  it('persists bounded opponent rules and replays timestamped opponent edits in causal order', () => {
    const config = createDefaultConfig()
    config.opponent = { screenAngle: -0.3, liftDelay: 0.2, liftWidth: 0.15, reject: true, rescreen: false, shortRoll: true }
    config.interventions = [{ id: 'allow-rescreen', at: 1.2, kind: 'opponent', patch: { rescreen: true, liftWidth: -0.2 } }]
    const expected = simulate(config)
    const answer = createAnswer({ name: 'Opponent reads', config })
    const storage = device()
    expect(saveAnswer(answer, storage).persisted).toBe(true)
    const restored = loadAnswers(device(storage.value()!)).answers[0]!.config
    expect(restored).toEqual(config)
    expect(simulate(restored).frames).toEqual(expected.frames)
    expect(opponentAt(restored, 1.19)).toEqual(config.opponent)
    expect(opponentAt(restored, 1.2)).toEqual({ ...config.opponent, rescreen: true, liftWidth: -0.2 })
  })

  it('rejects malformed opponent values and unknown opponent fields', () => {
    const config = createDefaultConfig()
    expect(() => parseLabConfig({ ...config, opponent: { ...config.opponent, screenAngle: 0.651 } })).toThrow()
    expect(() => parseLabConfig({ ...config, opponent: { ...config.opponent, madeUpRule: true } })).toThrow()
    expect(() => parseLabConfig({ ...config, interventions: [{ id: 'bad', at: 1, kind: 'opponent', patch: { liftDelay: 0.61 } }] })).toThrow()
    expect(() => parseLabConfig({ ...config, interventions: [{ id: 'bad', at: 1, kind: 'opponent', patch: { madeUpRule: true } }] })).toThrow()
  })

  it('keeps pre-opponent saved inputs valid and absent opponent means legacy strategy mode', () => {
    const current = createDefaultConfig()
    const legacy = { ...current }; delete legacy.opponent
    expect(parseLabConfig(legacy)).toEqual(legacy)
    expect(opponentAt(legacy, 1)).toBeUndefined()
  })

  it('retains and exports a new answer when writes fail, then persists on retry', () => {
    const storage = device()
    storage.denyWrites = true
    const answer = createAnswer({ name: 'Shallow tag', config: createDefaultConfig() })
    const saved = saveAnswer(answer, storage)
    expect(saved.persisted).toBe(false)
    expect(saved.error).toContain('export')
    expect(loadAnswers(storage).answers).toHaveLength(1)
    expect(JSON.parse(exportAnswers(saved.answers)).answers[0].id).toBe(answer.id)
    expect(storage.value()).toBeNull()
    storage.denyWrites = false
    expect(saveAnswer(answer, storage).persisted).toBe(true)
    expect(loadAnswers(device(storage.value()!)).answers).toHaveLength(1)
  })

  it('preserves on-disk answers when reads fail and merges session answers when access returns', () => {
    const old = createAnswer({ name: 'Earlier drop', config: createDefaultConfig() })
    const storage = device(exportAnswers([old]))
    storage.denyReads = true
    const fresh = createAnswer({ name: 'New drop', config: createDefaultConfig() })
    const failed = saveAnswer(fresh, storage)
    expect(failed.persisted).toBe(false)
    expect(JSON.parse(storage.value()!).answers[0].id).toBe(old.id)
    storage.denyReads = false
    const recovered = saveAnswer(fresh, storage)
    expect(recovered.persisted).toBe(true)
    expect(recovered.answers.map(a => a.id)).toEqual([old.id, fresh.id])
  })

  it('does not overwrite corrupt device data and permits exporting the active session', () => {
    const storage = device('{not-json')
    const saved = saveAnswer(createAnswer({ name: 'Session drop', config: createDefaultConfig() }), storage)
    expect(saved.persisted).toBe(false)
    expect(saved.error).toContain('not been replaced')
    expect(storage.value()).toBe('{not-json')
    expect(JSON.parse(exportAnswers(saved.answers)).answers).toHaveLength(1)
  })

  it('imports portable answers and preserves existing answers on ID collision', () => {
    const answer = createAnswer({ name: 'Our answer', config: createDefaultConfig() })
    const storage = device()
    saveAnswer(answer, storage)
    const imported = importAnswers(exportAnswers([answer]), storage)
    expect(imported.persisted).toBe(true)
    expect(imported.importedCount).toBe(1)
    expect(imported.answers).toHaveLength(2)
    expect(imported.answers[0]?.id).toBe(answer.id)
    expect(imported.answers[1]?.id).not.toBe(answer.id)
    expect(imported.answers[1]?.name).toBe('Our answer (imported)')
  })

  it('rejects malformed or unsupported imports atomically', () => {
    const storage = device()
    const answer = createAnswer({ name: 'Keep this', config: createDefaultConfig() })
    saveAnswer(answer, storage)
    const before = storage.value()
    const malformed = JSON.parse(exportAnswers([answer]))
    malformed.answers.push({ ...malformed.answers[0], id: 'different', engineVersion: 'unknown-model' })
    const failed = importAnswers(JSON.stringify(malformed), storage)
    expect(failed.error).toContain('engineVersion')
    expect(failed.answers).toHaveLength(1)
    expect(storage.value()).toBe(before)
    expect(importAnswers('<script>bad</script>', storage).error).toContain('JSON')
  })

  it('keeps a combined oversized import atomic and the original collection exportable', () => {
    const config = createDefaultConfig()
    config.interventions = Array.from({ length: 64 }, (_, i) => ({ id: `rule-${i}`, at: i * 0.025, kind: 'answer' as const, patch: { ...config.answer } }))
    const bulky = Array.from({ length: 100 }, (_, i) => createAnswer({ name: `Reviewed answer ${i}`, config, notes: 'n'.repeat(2000), teaching: { cue: 'c'.repeat(500) } }))
    // Both source files are valid independently, while their union exceeds the portable budget.
    const first = exportAnswers(bulky.slice(0, 50))
    const second = exportAnswers(bulky.slice(50))
    expect(() => exportAnswers(bulky)).toThrow('2 MB')
    const storage = device()
    expect(importAnswers(first, storage).persisted).toBe(true)
    const before = storage.value()
    const rejected = importAnswers(second, storage)
    expect(rejected.error).toContain('combined import')
    expect(rejected.answers).toHaveLength(50)
    expect(storage.value()).toBe(before)
    expect(() => exportAnswers(rejected.answers)).not.toThrow()

    const denied = device(second)
    denied.denyReads = true
    expect(importAnswers(first, denied).persisted).toBe(false)
    denied.denyReads = false
    const recovered = loadAnswers(denied)
    expect(recovered.persisted).toBe(false)
    expect(recovered.error).toContain('Device and session answers')
    expect(recovered.answers).toHaveLength(50)
    expect(denied.value()).toBe(second)
    expect(() => exportAnswers(recovered.answers)).not.toThrow()
  })

  it('can revise an imported record with a fast device clock without making it unexportable', () => {
    const answer = createAnswer({ name: 'Clock skew', config: createDefaultConfig() })
    answer.createdAt = '2099-01-01T00:00:00Z'
    answer.updatedAt = '2099-01-01T00:00:00.100Z'
    const storage = device()
    const imported = importAnswers(exportAnswers([answer]), storage)
    expect(imported.persisted).toBe(true)
    const revised = saveAnswer(imported.answers[0]!, storage)
    expect(revised.persisted).toBe(true)
    expect(() => exportAnswers(revised.answers)).not.toThrow()
  })

  it('rejects off-court coordinates, impossible timing and duplicate adjustment IDs', () => {
    const config = createDefaultConfig()
    expect(() => parseLabConfig({ ...config, startingPositions: { D3: { x: 200, z: 2 } } })).toThrow()
    expect(() => parseLabConfig({ ...config, assumptions: { ...config.assumptions, dt: 0 } })).toThrow()
    expect(() => parseLabConfig({ ...config, assumptions: { ...config.assumptions, maxSpeed: Infinity } })).toThrow()
    expect(() => parseLabConfig({ ...config, interventions: [{ id: 'bad', at: 2, kind: 'move', playerId: 'D3', target: { x: -3, z: 2 }, until: 1 }] })).toThrow()
    expect(() => parseLabConfig({ ...config, interventions: [{ id: 'same', at: 2, kind: 'answer', patch: { tag: true } }, { id: 'same', at: 1, kind: 'answer', patch: { tag: false } }] })).toThrow()
    expect(() => createAnswer({ name: 'Bad role', config, terminology: { unknown: 'bad' } as never })).toThrow()
    expect(() => createAnswer({ name: 'Unsupported teaching role', config, teaching: { role: 'ballhandler' } })).toThrow()
  })

  it('deletes durably and leaves other answers intact', () => {
    const storage = device()
    const one = createAnswer({ name: 'One', config: createDefaultConfig() })
    const two = createAnswer({ name: 'Two', config: createDefaultConfig() })
    saveAnswer(one, storage); saveAnswer(two, storage)
    expect(deleteAnswer(one.id, storage).persisted).toBe(true)
    expect(loadAnswers(device(storage.value()!)).answers.map(answer => answer.id)).toEqual([two.id])
  })

  it('does not share a browser answer through a server module when window is absent', () => {
    const saved = saveAnswer(createAnswer({ name: 'Server cannot persist this', config: createDefaultConfig() }))
    expect(saved.persisted).toBe(false)
    expect(saved.error).toContain('unavailable')
    expect(loadAnswers().answers).toHaveLength(0)
  })
})
