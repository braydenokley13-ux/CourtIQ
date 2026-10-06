import { describe, expect, it } from 'vitest'
import { createBaselineExecution } from '../content/baselineDrive/program'
import { createDefaultConfig } from '../content/highPnr/scenario'
import { canonicalStringify, executionCompatibility, parseStoredExecutionInput, QUERY_VERSION } from '../execution'
import { compileExperiment } from '../simulation/facade'
import {
  acceptAnswer,
  clone,
  createProgramCodec,
  decodeLegacySource,
  emptySystem,
  fingerprint,
  LEGACY_ANSWERS_KEY,
  LEGACY_SYSTEM_KEY,
  MAX_PROGRAM_BYTES,
  mergeImport,
  planImport,
  recipeFor,
  resolveFor,
  selectDefault,
  type AcceptInput,
  type SystemVersion,
} from './index'

const at = '2026-10-06T00:00:00.000Z'
const codec = createProgramCodec({ execution: parseStoredExecutionInput })
function acceptance(versionId = 'v1'): AcceptInput {
  const input = createBaselineExecution()
  return {
    entryId: 'answer-1',
    versionId,
    at,
    name: 'Our baseline answer',
    situationId: input.content.id,
    scope: 'varsity',
    when: 'Baseline drive',
    presetIds: [],
    snapshot: { kind: 'executable', input },
    note: '',
    accepts: [],
    knownBreaks: [],
    evidence: {
      state: 'recorded',
      inputFingerprint: canonicalStringify(input),
      engineVersion: input.engineVersion,
      content: input.content,
      queryVersion: QUERY_VERSION,
    },
  }
}
function first() {
  return codec.parse(acceptAnswer(emptySystem('program-1'), acceptance()).program)
}

describe('accepted program knowledge', () => {
  it('stores generic materialized inputs, keeps stable identity through renaming, and pins base and replaced head independently', () => {
    const original = first(),
      input = acceptance('v2')
    input.targetEntryId = 'answer-1'
    input.expectedHeadVersionId = 'v1'
    input.basedOn = { entryId: 'answer-1', versionId: 'v1' }
    input.name = 'Renamed answer'
    const saved = codec.parse(acceptAnswer(original, input).program)
    expect(saved.entries[0]?.id).toBe('answer-1')
    expect(saved.entries[0]?.headVersionId).toBe('v2')
    expect(saved.entries[0]?.versions[1]).toMatchObject({
      id: 'v2',
      priorHeadVersionId: 'v1',
      basedOn: { entryId: 'answer-1', versionId: 'v1' },
    })
    expect(original.entries[0]?.name).toBe('Our baseline answer')
    input.snapshot = { kind: 'executable', input: { ...createBaselineExecution(), seed: 7 } }
    expect(saved.entries[0]?.versions[1]?.snapshot).toEqual(original.entries[0]?.versions[0]?.snapshot)
    expect(codec.parseExport(codec.export(saved, at))).toEqual(saved)
  })

  it('refuses an unseen head even when storage has already refreshed to its revision', () => {
    const initial = first(),
      second = { ...acceptance('v2'), targetEntryId: 'answer-1', expectedHeadVersionId: 'v1' }
    const refreshed = acceptAnswer(initial, second).program
    expect(() =>
      acceptAnswer(refreshed, {
        ...acceptance('v3'),
        targetEntryId: 'answer-1',
        expectedHeadVersionId: 'v1',
        basedOn: { entryId: 'answer-1', versionId: 'v1' },
      }),
    ).toThrow('changed since you opened')
    const reviewed = codec.parse(
      acceptAnswer(refreshed, {
        ...acceptance('v3'),
        targetEntryId: 'answer-1',
        expectedHeadVersionId: 'v2',
        basedOn: { entryId: 'answer-1', versionId: 'v1' },
      }).program,
    )
    expect(reviewed.entries[0]?.versions[2]).toMatchObject({ priorHeadVersionId: 'v2', basedOn: { versionId: 'v1' } })
  })

  it('keeps history beyond the legacy fifty-version cap and validates lineage', () => {
    let program = first()
    for (let n = 2; n <= 55; n++)
      program = acceptAnswer(program, {
        ...acceptance(`v${n}`),
        targetEntryId: 'answer-1',
        expectedHeadVersionId: `v${n - 1}`,
        basedOn: { entryId: 'answer-1', versionId: `v${n - 1}` },
      }).program
    expect(codec.parse(program).entries[0]?.versions).toHaveLength(55)
    const cyclic = clone(program)
    cyclic.entries[0]!.versions[0]!.basedOn = { entryId: 'answer-1', versionId: 'v55' }
    expect(() => codec.parse(cyclic)).toThrow('cycle')
    const forwardHead = clone(program)
    forwardHead.entries[0]!.versions[0]!.priorHeadVersionId = 'v55'
    expect(() => codec.parse(forwardHead)).toThrow('earlier version')
  })

  it('retains and portably round-trips 24 representative frozen versions with recorded Breaks beyond the former capacity', () => {
    const recipe = createDefaultConfig(),
      compiled = compileExperiment(recipe),
      originalTitle = compiled.program.title
    let program = emptySystem('multi-year-program')
    for (let n = 1; n <= 24; n++) {
      const input = { ...compiled, seed: n },
        candidate = clone(input),
        versionRecipe = { ...recipe, seed: n }
      candidate.parameters['offense.liftDelay'] = 0.3
      program = acceptAnswer(program, {
        ...acceptance(`season-version-${n}`),
        entryId: 'season-answer',
        ...(n > 1
          ? {
              targetEntryId: 'season-answer',
              expectedHeadVersionId: `season-version-${n - 1}`,
              basedOn: { entryId: 'season-answer', versionId: `season-version-${n - 1}` },
            }
          : {}),
        name: 'Our middle-screen answer',
        situationId: input.content.id,
        snapshot: { kind: 'executable', input, recipe: versionRecipe },
        note: `Accepted during season review ${n}`,
        evidence: {
          state: 'recorded',
          configFingerprint: fingerprint(versionRecipe),
          inputFingerprint: canonicalStringify(input),
          engineVersion: input.engineVersion,
          content: input.content,
          queryVersion: QUERY_VERSION,
        },
        knownBreaks: [
          {
            label: 'Lift timing',
            threatId: 'lift',
            seconds: 0.5,
            candidate,
            candidateInputFingerprint: canonicalStringify(candidate),
            baseInputFingerprint: canonicalStringify(input),
            queryVersion: QUERY_VERSION,
            search: {
              id: 'high-pnr-bounded-attack',
              version: QUERY_VERSION,
              recipe: { budget: 10 },
              allowedParameterIds: ['offense.liftDelay'],
            },
            witness: { at: 1.2, start: 1, end: 1.5, playerId: 'O3', defenderId: 'D3' },
          },
        ],
      }).program
    }
    compiled.program.title = 'Edited after these versions were accepted'
    const saved = codec.parse(program),
      compact = codec.export(saved, at),
      historicalPretty = JSON.stringify(JSON.parse(compact), null, 2),
      restored = codec.parseExport(compact)
    expect(MAX_PROGRAM_BYTES).toBe(128 * 1024 * 1024)
    expect(compact.length).toBeGreaterThan(8 * 1024 * 1024)
    expect(historicalPretty.length).toBeGreaterThan(compact.length)
    expect(compact).not.toContain('\n')
    expect(restored).toEqual(saved)
    expect(codec.parseExport(historicalPretty)).toEqual(saved)
    expect(restored.entries[0]!.headVersionId).toBe('season-version-24')
    expect(restored.entries[0]!.versions).toHaveLength(24)
    for (const [index, version] of restored.entries[0]!.versions.entries()) {
      expect(version.snapshot.kind).toBe('executable')
      if (version.snapshot.kind !== 'executable') throw new Error('Expected frozen native input')
      expect(version.snapshot.input).toMatchObject({ seed: index + 1, program: { title: originalTitle } })
      expect(version.knownBreaks[0]!.candidate).toMatchObject({
        seed: index + 1,
        parameters: { 'offense.liftDelay': 0.3 },
      })
      expect(version.evidence.inputFingerprint).toBe(canonicalStringify(version.snapshot.input))
      if (index > 0)
        expect(version).toMatchObject({
          priorHeadVersionId: `season-version-${index}`,
          basedOn: { entryId: 'season-answer', versionId: `season-version-${index}` },
        })
    }
  }, 30_000)

  it('preserves unavailable executable and recipe JSON for export while refusing editable projection', () => {
    const future = first(),
      version = future.entries[0]!.versions[0]!
    const input = {
      schemaVersion: 3,
      engineVersion: 'basketball-3.0.0',
      content: { id: 'future-cut', version: '3', hash: 'future-materialized-hash' },
      program: { actions: [{ kind: 'cut', actor: 'future-player' }] },
      parameters: {},
    }
    version.snapshot = {
      kind: 'executable',
      input,
      recipe: { counter: 'future-cut', coachingGrammar: { future: true } },
    }
    version.evidence = {
      state: 'recorded',
      inputFingerprint: canonicalStringify(input),
      configFingerprint: fingerprint(version.snapshot.recipe),
      engineVersion: input.engineVersion,
      content: input.content,
      queryVersion: 'queries-3',
    }
    const saved = codec.parse(future)
    expect(saved.entries[0]!.versions[0]!.snapshot).toEqual(version.snapshot)
    expect(executionCompatibility(input).replayable).toBe(false)
    expect(recipeFor(saved.entries[0]!.versions[0]!, compileExperiment)).toBeNull()
    expect(codec.parseExport(codec.export(saved, at))).toEqual(saved)
  })

  it('stores a foreign editing recipe independently of supported inline execution', () => {
    const program = first(),
      version = program.entries[0]!.versions[0]!
    const input = createBaselineExecution()
    version.snapshot = { kind: 'executable', input, recipe: { family: 'baseline-drive', version: 3, help: true } }
    version.evidence.configFingerprint = fingerprint(version.snapshot.recipe)
    const stored = codec.parse(program)
    expect(executionCompatibility(input).replayable).toBe(true)
    expect(recipeFor(stored.entries[0]!.versions[0]!, compileExperiment)).toBeNull()
    expect(codec.parseExport(codec.export(stored, at))).toEqual(stored)
    expect(stored.entries[0]!.versions[0]!.snapshot).toEqual(version.snapshot)
  })

  it('uses locale-independent recipe identities and preserves historical ordering without changing recorded provenance', () => {
    const program = first(),
      version = program.entries[0]!.versions[0]!,
      recipe = { z: 0, ä: 1 }
    version.snapshot = { kind: 'executable', input: createBaselineExecution(), recipe }
    // Older implementations sorted with the browser locale; this is the valid en-US ordering.
    version.evidence.configFingerprint = '{"ä":1,"z":0}'
    expect(fingerprint(recipe)).toBe('{"z":0,"ä":1}')
    const stored = codec.parse(program)
    expect(codec.parseExport(codec.export(stored, at))).toEqual(stored)
    expect(stored.entries[0]!.versions[0]!.evidence.configFingerprint).toBe('{"ä":1,"z":0}')
    version.evidence.configFingerprint = '{"ä":2,"z":0}'
    expect(() => codec.parse(program)).toThrow('different Lab experiment')
  })

  it('only offers native editing when the installed authoring recipe exactly reproduces the accepted input', () => {
    const recipe = createDefaultConfig(),
      input = compileExperiment(recipe),
      command = acceptance()
    command.snapshot = { kind: 'executable', input, recipe }
    command.evidence = {
      state: 'recorded',
      configFingerprint: fingerprint(recipe),
      inputFingerprint: canonicalStringify(input),
      engineVersion: input.engineVersion,
      content: input.content,
      queryVersion: QUERY_VERSION,
    }
    const saved = codec.parse(acceptAnswer(emptySystem('native-program'), command).program),
      version = saved.entries[0]!.versions[0]!
    expect(recipeFor(version, compileExperiment)).toEqual(recipe)

    version.snapshot = { kind: 'executable', input, recipe: { ...recipe, problemId: 'archived-authoring-family' } }
    version.evidence.configFingerprint = fingerprint(version.snapshot.recipe)
    const archived = codec.parse(saved)
    expect(executionCompatibility(input).replayable).toBe(true)
    expect(recipeFor(archived.entries[0]!.versions[0]!, compileExperiment)).toBeNull()
    expect(codec.parseExport(codec.export(archived, at))).toEqual(archived)

    version.snapshot = { kind: 'executable', input, recipe: { ...recipe, seed: recipe.seed + 1 } }
    version.evidence.configFingerprint = fingerprint(version.snapshot.recipe)
    const mismatched = codec.parse(saved)
    expect(recipeFor(mismatched.entries[0]!.versions[0]!, compileExperiment)).toBeNull()
    expect(codec.parseExport(codec.export(mismatched, at))).toEqual(mismatched)

    version.snapshot = { kind: 'legacy-unverified', source: 'our-system-v1', recipe }
    version.evidence = { state: 'legacy-unknown' }
    expect(recipeFor(codec.parse(saved).entries[0]!.versions[0]!, compileExperiment)).toEqual(recipe)
    version.snapshot.recipe = { ...recipe, problemId: 'archived-authoring-family' }
    expect(recipeFor(version, compileExperiment)).toBeNull()
  })

  it('rejects mismatched accepted engine/content evidence and stale or unrelated break search', () => {
    const wrongEngine = first()
    wrongEngine.entries[0]!.versions[0]!.evidence.engineVersion = 'engine-wrong'
    expect(() => codec.parse(wrongEngine)).toThrow('different engine or content')
    const wrongContent = first()
    wrongContent.entries[0]!.versions[0]!.evidence.content!.hash = 'hash-wrong'
    expect(() => codec.parse(wrongContent)).toThrow('different engine or content')
    const program = first(),
      version = program.entries[0]!.versions[0]!,
      candidate = createBaselineExecution()
    candidate.parameters['drift.delay'] = 0.3
    version.knownBreaks = [
      {
        label: 'Corner drifts',
        threatId: 'drift',
        seconds: 0.5,
        candidate,
        candidateInputFingerprint: canonicalStringify(candidate),
        baseInputFingerprint: version.evidence.inputFingerprint,
        queryVersion: QUERY_VERSION,
        search: {
          id: 'drift-search',
          version: QUERY_VERSION,
          recipe: { budget: 10 },
          allowedParameterIds: ['drift.delay'],
        },
        witness: { at: 1.2, start: 1, end: 1.5, playerId: 'drifter-3', defenderId: 'wing-helper-3' },
      },
    ]
    expect(() => codec.parse(program)).not.toThrow()
    version.knownBreaks[0]!.baseInputFingerprint = 'stale-base'
    expect(() => codec.parse(program)).toThrow('tested base')
    version.knownBreaks[0]!.baseInputFingerprint = version.evidence.inputFingerprint
    candidate.seed++
    version.knownBreaks[0]!.candidateInputFingerprint = canonicalStringify(candidate)
    expect(() => codec.parse(program)).toThrow('outside its declared search')
  })

  const invalidEvidence: { label: string; change: (v: SystemVersion) => void; reason: string }[] = [
    {
      label: 'absent accepted threat',
      change: (v) => {
        v.accepts[0]!.threatId = 'absent-threat'
      },
      reason: 'absent content opportunity',
    },
    {
      label: 'accepted exposure beyond duration',
      change: (v) => {
        v.accepts[0]!.seconds = 19
      },
      reason: 'exceeds its replay duration',
    },
    {
      label: 'absent break threat',
      change: (v) => {
        v.knownBreaks[0]!.threatId = 'absent-threat'
      },
      reason: 'absent content opportunity',
    },
    {
      label: 'break exposure beyond duration',
      change: (v) => {
        v.knownBreaks[0]!.seconds = 19
      },
      reason: 'exceeds its replay duration',
    },
    {
      label: 'absent search parameter',
      change: (v) => {
        v.knownBreaks[0]!.search!.allowedParameterIds = ['absent-parameter']
      },
      reason: 'absent or repeated content parameter',
    },
    {
      label: 'repeated search parameter',
      change: (v) => {
        v.knownBreaks[0]!.search!.allowedParameterIds.push('drift.delay')
      },
      reason: 'absent or repeated content parameter',
    },
    {
      label: 'absent offensive witness',
      change: (v) => {
        v.knownBreaks[0]!.witness!.playerId = 'absent-player'
      },
      reason: 'absent offensive or defensive players',
    },
    {
      label: 'wrong offensive witness team',
      change: (v) => {
        v.knownBreaks[0]!.witness!.playerId = 'wing-helper-3'
      },
      reason: 'absent offensive or defensive players',
    },
    {
      label: 'absent defensive witness',
      change: (v) => {
        v.knownBreaks[0]!.witness!.defenderId = 'absent-defender'
      },
      reason: 'absent offensive or defensive players',
    },
    {
      label: 'wrong defensive witness team',
      change: (v) => {
        v.knownBreaks[0]!.witness!.defenderId = 'drifter-3'
      },
      reason: 'absent offensive or defensive players',
    },
    {
      label: 'witness beyond candidate duration',
      change: (v) => {
        v.knownBreaks[0]!.witness = { ...v.knownBreaks[0]!.witness!, at: 19, start: 18, end: 20 }
      },
      reason: 'exceeds its candidate replay duration',
    },
  ]
  it.each(invalidEvidence)('rejects $label in supported recorded evidence', ({ change, reason }) => {
    const program = first(),
      version = program.entries[0]!.versions[0]!,
      candidate = createBaselineExecution()
    candidate.parameters['drift.delay'] = 0.3
    version.accepts = [{ threatId: 'drift', seconds: 0.5 }]
    version.knownBreaks = [
      {
        label: 'Corner drifts',
        threatId: 'drift',
        seconds: 0.5,
        candidate,
        candidateInputFingerprint: canonicalStringify(candidate),
        baseInputFingerprint: version.evidence.inputFingerprint,
        queryVersion: QUERY_VERSION,
        search: {
          id: 'drift-search',
          version: QUERY_VERSION,
          recipe: { budget: 10 },
          allowedParameterIds: ['drift.delay'],
        },
        witness: { at: 1.2, start: 1, end: 1.5, playerId: 'drifter-3', defenderId: 'wing-helper-3' },
      },
    ]
    expect(() => codec.parse(program)).not.toThrow()
    change(version)
    expect(() => codec.parse(program)).toThrow(reason)
  })

  it('preserves unavailable evidence semantics without interpreting them through the current execution graph', () => {
    const program = first(),
      version = program.entries[0]!.versions[0]!,
      input = createBaselineExecution()
    input.schemaVersion = 3
    input.engineVersion = 'basketball-3.0.0'
    version.snapshot = { kind: 'executable', input }
    version.evidence = {
      state: 'recorded',
      inputFingerprint: canonicalStringify(input),
      engineVersion: input.engineVersion,
      content: input.content,
      queryVersion: 'queries-3',
    }
    version.accepts = [{ threatId: 'future-threat', seconds: 19 }]
    version.knownBreaks = [
      {
        label: 'Future search',
        threatId: 'future-threat',
        seconds: 19,
        candidate: input,
        candidateInputFingerprint: canonicalStringify(input),
        baseInputFingerprint: version.evidence.inputFingerprint,
        queryVersion: 'queries-3',
        search: { id: 'future-search', version: 'queries-3', recipe: {}, allowedParameterIds: ['future-parameter'] },
        witness: { at: 19, start: 18, end: 20, playerId: 'future-player', defenderId: 'future-defender' },
      },
    ]
    const stored = codec.parse(program)
    expect(executionCompatibility(input).replayable).toBe(false)
    expect(codec.parseExport(codec.export(stored, at))).toEqual(stored)
  })

  it('requires explicit authority when multiple answers apply and preserves supplied default', () => {
    const original = first(),
      alternate = acceptAnswer(original, {
        ...acceptance('other-v1'),
        entryId: 'answer-other',
        name: 'Other answer',
      }).program
    expect(resolveFor(alternate, createBaselineExecution().content.id, 'varsity').kind).toBe('ambiguous')
    const selected = codec.parse(selectDefault(alternate, 'answer-other'))
    expect(resolveFor(selected, createBaselineExecution().content.id, 'varsity')).toMatchObject({
      kind: 'resolved',
      entry: { id: 'answer-other' },
      version: { id: 'other-v1' },
    })
  })
})

describe('portable histories', () => {
  it.each(['toString', 'constructor', '__proto__'])(
    'treats %s as an authored identity rather than an inherited map property',
    (id) => {
      const local = first(),
        incoming = codec.parse(
          acceptAnswer(emptySystem('other-program'), { ...acceptance(id), entryId: id, name: 'Imported answer' })
            .program,
        ),
        added = mergeImport(local, incoming, { entries: {}, versions: {} }, codec)
      expect(added.entries[1]).toMatchObject({ id, headVersionId: id, versions: [{ id }] })
      const divergent = clone(incoming)
      divergent.entries[0]!.versions[0]!.note = 'Different imported history'
      expect(() => mergeImport(added, divergent, { entries: {}, versions: {} }, codec)).toThrow('new supplied identity')
      const merged = mergeImport(
        added,
        divergent,
        {
          entries: Object.fromEntries([[id, 'copied-answer']]),
          versions: Object.fromEntries([[id, 'copied-version']]),
        },
        codec,
      )
      expect(merged.entries[2]).toMatchObject({ id: 'copied-answer', headVersionId: 'copied-version' })
      expect(merged.entries[1]).toEqual(incoming.entries[0])
    },
  )

  it.each([1, 2])('copies %i cross-entry descendants when their incoming ancestor diverges', (depth) => {
    let local = first()
    for (let n = 1; n <= depth; n++)
      local = acceptAnswer(local, {
        ...acceptance(`descendant-${n}-v1`),
        entryId: `descendant-${n}`,
        basedOn: {
          entryId: n === 1 ? 'answer-1' : `descendant-${n - 1}`,
          versionId: n === 1 ? 'v1' : `descendant-${n - 1}-v1`,
        },
      }).program
    local = codec.parse(
      acceptAnswer(local, { ...acceptance('unrelated-v1'), entryId: 'unrelated', name: 'Unaffected answer' }).program,
    )
    const incoming = clone(local)
    incoming.entries.find((e) => e.id === 'answer-1')!.versions[0]!.note = 'Divergent imported ancestor'
    // Reverse order requires the planner to revisit indirect descendants after discovering their copied base.
    incoming.entries.reverse()
    const plan = planImport(local, codec.parse(incoming)),
      identities = {
        entries: Object.fromEntries(plan.copyEntryIds.map((id) => [id, `copy-${id}`])),
        versions: Object.fromEntries(plan.copyVersionIds.map((id) => [id, `copy-${id}`])),
      },
      merged = mergeImport(local, incoming, identities, codec)
    expect(plan).toMatchObject({ added: depth + 1, identical: 1, divergent: depth + 1 })
    expect(merged.entries).toHaveLength(local.entries.length + depth + 1)
    expect(merged.entries.slice(0, local.entries.length)).toEqual(local.entries)
    for (let n = 1; n <= depth; n++) {
      const imported = merged.entries.find((entry) => entry.id === `copy-descendant-${n}`)!
      expect(imported.versions[0]!.basedOn).toEqual({
        entryId: n === 1 ? 'copy-answer-1' : `copy-descendant-${n - 1}`,
        versionId: n === 1 ? 'copy-v1' : `copy-descendant-${n - 1}-v1`,
      })
    }
    expect(merged.entries.find((e) => e.id === 'copy-answer-1')!.versions[0]!.note).toBe('Divergent imported ancestor')
    expect(merged.entries.find((e) => e.id === 'answer-1')!.versions[0]!.note).toBe('')
    expect(codec.parseExport(codec.export(merged, at))).toEqual(merged)
  })

  it('copies divergent graphs atomically with all internal references remapped and preserves local preferences', () => {
    const local = first()
    local.program = 'Local team'
    local.terms = { 'coverage:drop': 'Local name' }
    const incoming = acceptAnswer(first(), {
      ...acceptance('v2'),
      targetEntryId: 'answer-1',
      expectedHeadVersionId: 'v1',
      basedOn: { entryId: 'answer-1', versionId: 'v1' },
      name: 'Changed elsewhere',
    }).program
    incoming.terms = { 'coverage:drop': 'Other name', 'concept:help': 'Our help' }
    expect(planImport(local, incoming).divergent).toBe(1)
    const merged = mergeImport(
      local,
      incoming,
      { entries: { 'answer-1': 'copy-answer' }, versions: { v1: 'copy-v1', v2: 'copy-v2' } },
      codec,
    )
    expect(merged.entries).toHaveLength(2)
    expect(merged.entries[1]).toMatchObject({
      id: 'copy-answer',
      headVersionId: 'copy-v2',
      versions: [
        { id: 'copy-v1' },
        { id: 'copy-v2', priorHeadVersionId: 'copy-v1', basedOn: { entryId: 'copy-answer', versionId: 'copy-v1' } },
      ],
    })
    expect(merged.program).toBe('Local team')
    expect(merged.terms).toEqual({ 'coverage:drop': 'Local name', 'concept:help': 'Our help' })
    expect(mergeImport(local, first(), { entries: {}, versions: {} }, codec).entries).toHaveLength(1)
  })

  it('preserves original legacy metadata and uses the frozen recipe parser independently of the installed recipe grammar', () => {
    const config = createDefaultConfig()
    const raw = JSON.stringify({
      format: 'courtiq-defense-lab-answers',
      schemaVersion: 1,
      answers: [
        {
          schemaVersion: 1,
          id: 'old-answer',
          name: 'Old answer',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-02-01T00:00:00.000Z',
          problemVersion: 'problem-original',
          engineVersion: 'engine-original',
          config,
          terminology: { 'low-man': 'Anchor' },
          teaching: { role: 'low-man', checkpointTimes: [0.3, 1], cue: 'Hold the corner' },
          notes: 'Original note',
        },
      ],
    })
    const saved = codec.parse(decodeLegacySource(LEGACY_ANSWERS_KEY, raw, 'migrated-program'))
    expect(saved.entries[0]).toMatchObject({
      id: 'legacy-answer:old-answer',
      scopeUnassigned: true,
      versions: [
        {
          note: 'Original note',
          snapshot: {
            kind: 'legacy-unverified',
            engineVersion: 'engine-original',
            problemVersion: 'problem-original',
            createdAt: '2025-01-01T00:00:00.000Z',
          },
          teaching: { cue: 'Hold the corner' },
          terms: { 'role:low-man': 'Anchor' },
          evidence: { state: 'legacy-unknown' },
        },
      ],
    })
    const system = JSON.stringify({
      schema: 1,
      program: 'Old team',
      register: 'program',
      terms: { drop: 'Blue' },
      entries: [
        {
          id: 'original-entry',
          situationId: 'high-pnr-middle',
          name: 'Blue',
          presetIds: ['drop'],
          scope: 'varsity',
          when: 'Middle screen',
          versions: [{ v: 4, savedAt: at, config, note: '', accepts: [], knownBreaks: [], teachAt: 1 }],
        },
      ],
    })
    const migrated = codec.parse(decodeLegacySource(LEGACY_SYSTEM_KEY, system, 'legacy-team'))
    expect(migrated.entries[0]).toMatchObject({
      id: 'original-entry',
      headVersionId: 'legacy-system:original-entry:v4',
    })
    expect(migrated.entries[0]!.versions[0]!.snapshot).not.toHaveProperty('engineVersion')
    expect(migrated.terms).toEqual({ 'coverage:drop': 'Blue' })
  })
})
