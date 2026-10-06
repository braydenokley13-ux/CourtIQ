import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createDefaultConfig } from '../../packages/basketball/src/content/highPnr/scenario'
import { canonicalStringify, parseStoredExecutionInput, QUERY_VERSION } from '../../packages/basketball/src/execution'
import { compileExperiment } from '../../packages/basketball/src/simulation/facade'
import { acceptAnswer, createProgramCodec, emptySystem, fingerprint } from '../../packages/basketball/src/program'

const outputPath = path.resolve(process.argv[2] ?? '/tmp/courtiq-qa-fixture.json')
const at = '2026-01-01T00:00:00.000Z'
const recipe = createDefaultConfig()
const input = compileExperiment(recipe)
const codec = createProgramCodec({ execution: parseStoredExecutionInput })
const accepted = codec.parse(
  acceptAnswer(emptySystem('qa-foundation-program'), {
    entryId: 'qa-foundation-answer',
    versionId: 'qa-foundation-answer-v1',
    at,
    name: 'QA Foundation Answer',
    situationId: input.content.id,
    scope: 'program',
    when: 'Ball screen at the top of the key',
    presetIds: [],
    snapshot: { kind: 'executable', input, recipe },
    note: 'Portable fixture generated through ProgramCodec for browser QA.',
    accepts: [],
    knownBreaks: [],
    evidence: {
      state: 'recorded',
      configFingerprint: fingerprint(recipe),
      inputFingerprint: canonicalStringify(input),
      engineVersion: input.engineVersion,
      content: input.content,
      queryVersion: QUERY_VERSION,
    },
  }).program,
)

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, codec.export(accepted, at), 'utf8')
console.log(`Created valid QA import fixture at ${outputPath}`)
