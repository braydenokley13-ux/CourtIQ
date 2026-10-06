/** A no-screen architecture fixture. The roles and opportunities are native to a baseline drive. */
import type { ContentProgram, ExecutionInput, ObligationDefinition } from '../../domain/program'
import { CONFIG_SCHEMA_VERSION, ENGINE_VERSION, contentHash, parseExecutionInput } from '../../domain/execution'
import { DEFAULT_MODEL_ASSUMPTIONS } from '../../domain/assumptions'
import { role, current, param, coord, eq, all, cmp, choice, at, rim, mix } from '../expressions'
const guard = (id: string, defender: string, subject: string, threat: string): ObligationDefinition => ({
  id,
  defender: role(defender),
  subject: { actor: role(subject) },
  threat,
  kind: 'guard',
  target: rim(at(subject), 0.9),
  priority: 1,
})
const help = all(eq('help.enabled', true), cmp(coord('driver', 'z'), 'lt', 3.8), { possession: role('driver') })
export const BASELINE_DRIVE_PROGRAM: ContentProgram = {
  id: 'baseline-drive-corner-drift',
  version: '2.0.0',
  title: 'Baseline drive → corner drift',
  description: 'A driver turns the baseline; rim help opens the dunker or a drifting receiver.',
  players: [
    { id: 'driver-1', team: 'offense', role: 'driver', number: 1, height: 1.86, start: { x: 5.5, z: 4.6 } },
    { id: 'dunker-5', team: 'offense', role: 'dunker', number: 5, height: 2.02, start: { x: -0.8, z: 2.5 } },
    { id: 'drifter-3', team: 'offense', role: 'drifter', number: 3, height: 1.92, start: { x: -6.4, z: 1.4 } },
    { id: 'spacer-4', team: 'offense', role: 'weakSpacer', number: 4, height: 1.94, start: { x: -5.6, z: 5.6 } },
    { id: 'spacer-2', team: 'offense', role: 'strongSpacer', number: 2, height: 1.9, start: { x: 4.2, z: 8.7 } },
    { id: 'chaser-1', team: 'defense', role: 'chaser', number: 1, height: 1.87, start: { x: 5.0, z: 4.3 } },
    { id: 'rim-helper-5', team: 'defense', role: 'rimHelper', number: 5, height: 2.03, start: { x: -0.1, z: 2.9 } },
    { id: 'wing-helper-3', team: 'defense', role: 'wingHelper', number: 3, height: 1.94, start: { x: -4.5, z: 2.2 } },
    { id: 'spacer-guard-4', team: 'defense', role: 'weakGuard', number: 4, height: 1.96, start: { x: -4.7, z: 5.8 } },
    { id: 'spacer-guard-2', team: 'defense', role: 'strongGuard', number: 2, height: 1.9, start: { x: 3.4, z: 7.7 } },
  ],
  roles: {
    driver: 'driver-1',
    dunker: 'dunker-5',
    drifter: 'drifter-3',
    weakSpacer: 'spacer-4',
    strongSpacer: 'spacer-2',
    chaser: 'chaser-1',
    rimHelper: 'rim-helper-5',
    wingHelper: 'wing-helper-3',
    weakGuard: 'spacer-guard-4',
    strongGuard: 'spacer-guard-2',
  },
  initial: {
    ballOwner: 'driver-1',
    readNode: 'baseline-read',
    matchups: [
      guard('match-driver', 'chaser', 'driver', 'finish'),
      guard('match-dunker', 'rimHelper', 'dunker', 'dump'),
      guard('match-drifter', 'wingHelper', 'drifter', 'drift'),
      guard('match-weak', 'weakGuard', 'weakSpacer', 'skip'),
      guard('match-strong', 'strongGuard', 'strongSpacer', 'return'),
    ],
  },
  parameters: [
    { id: 'help.enabled', default: true },
    { id: 'help.commitment', default: 0.8, min: 0, max: 1 },
    { id: 'drift.delay', default: 0.1, min: 0, max: 0.5 },
    { id: 'release.height', default: 1.85, min: 1.2, max: 2.4 },
  ],
  actions: [
    { id: 'baseline-turn', actor: role('driver'), kind: 'drive', from: 0.15, target: { x: 1.3, z: 1.2 }, speed: 3.45 },
    { id: 'dunker-show', actor: role('dunker'), kind: 'relocate', from: 0.35, target: { x: -1.2, z: 2.3 }, speed: 2.2 },
  ],
  opportunities: [
    {
      id: 'finish',
      label: 'Keep / finish',
      actor: current('owner'),
      kind: 'keep',
      target: rim({ actor: current('owner') }, 1.6),
      scoreBias: 0.16,
      laneWeight: 0,
    },
    ...(['dump', 'drift', 'skip', 'return'] as const).map((id) => ({
      id,
      label: { dump: 'Dunker release', drift: 'Corner drift', skip: 'Weak wing', return: 'Return pass' }[id],
      actor: role({ dump: 'dunker', drift: 'drifter', skip: 'weakSpacer', return: 'strongSpacer' }[id]),
      kind: 'pass' as const,
      target: at({ dump: 'dunker', drift: 'drifter', skip: 'weakSpacer', return: 'strongSpacer' }[id]),
      scoreBias: choice(
        cmp(
          {
            coordinate: role({ dump: 'dunker', drift: 'drifter', skip: 'weakSpacer', return: 'strongSpacer' }[id]),
            axis: 'z',
          },
          'lt',
          4.5,
        ),
        0.26,
        0,
      ),
      laneWeight: id === 'dump' ? 0.3 : 0.06,
      launches: [
        {
          timing: 'iterative' as const,
          kind: 'chest' as const,
          releaseHeight: param('release.height'),
          catchHeight: 1.55,
          minDuration: 0.25,
          maxDuration: 1.3,
        },
      ],
      useCrossCourtKind: true,
    })),
  ],
  reads: [
    {
      id: 'baseline-read',
      actor: role('driver'),
      earliest: 0.8,
      decisionAt: 1.7,
      trigger: { kind: 'condition', when: cmp(coord('driver', 'z'), 'lt', 4) },
      continuousWhen: { all: [] },
      options: ['finish', 'dump', 'drift', 'skip'],
      continuations: { dump: 'dunker-read', drift: 'drift-read', skip: 'wing-read' },
    },
    {
      id: 'dunker-read',
      actor: role('dunker'),
      earliest: 0,
      trigger: { kind: 'catch' },
      options: ['finish', 'drift', 'skip'],
      continuations: { drift: 'drift-read', skip: 'wing-read' },
    },
    {
      id: 'drift-read',
      actor: role('drifter'),
      earliest: 0,
      trigger: { kind: 'catch' },
      options: ['finish', 'skip'],
      continuations: { skip: 'wing-read' },
    },
    {
      id: 'wing-read',
      actor: role('weakSpacer'),
      earliest: 0,
      trigger: { kind: 'catch' },
      options: ['finish', 'drift', 'return'],
      continuations: { drift: 'drift-read' },
    },
  ],
  offenseRules: [
    {
      id: 'baseline-drift',
      label: 'Rim help commits → corner drifts',
      earliest: 0.3,
      priority: 10,
      when: all({ obligation: role('rimHelper'), kind: 'contain' }, cmp(coord('driver', 'z'), 'lt', 4)),
      motions: [
        {
          actor: role('drifter'),
          kind: 'relocate',
          from: param('drift.delay'),
          target: { x: -6.6, z: 0.7 },
          speed: 2.8,
        },
        { actor: role('weakSpacer'), kind: 'relocate', target: { x: -5.1, z: 7.4 }, speed: 2.8 },
      ],
    },
  ],
  defenseRules: [
    {
      id: 'rim-help',
      label: 'Rim helper contains the baseline drive',
      when: help,
      replaceFor: [role('rimHelper')],
      obligations: [
        {
          id: 'baseline-rim-contain',
          defender: role('rimHelper'),
          subject: { actor: role('driver') },
          threat: 'finish',
          kind: 'contain',
          target: mix(rim(at('dunker'), 0.8), rim(at('driver'), 1), param('help.commitment')),
          priority: 1.5,
          railParameter: 'help.commitment',
        },
        guard('baseline-dunker-recover', 'rimHelper', 'dunker', 'dump'),
      ],
    },
    {
      id: 'wing-help',
      label: 'Wing helper splits drift and dunker',
      when: help,
      replaceFor: [role('wingHelper')],
      obligations: [
        {
          ...guard('baseline-drift-split', 'wingHelper', 'drifter', 'drift'),
          kind: 'split',
          target: mix(rim(at('drifter'), 0.9), rim(at('dunker'), 0.8), 0.35),
        },
        { ...guard('baseline-dump-split', 'wingHelper', 'dunker', 'dump'), kind: 'split', priority: 0.8 },
      ],
    },
  ],
  memoryRules: [],
  variations: [
    { parameter: 'help.commitment', label: 'Rim help commitment', min: 0, max: 1, step: 0.2 },
    { parameter: 'help.enabled', label: 'Rim help', toggle: true },
  ],
  editAt: 0.75,
  terminal: {
    maxPasses: 3,
    keepDuration: 0.7,
    finishRadius: 1.5,
    keepGap: 0.8,
    keepSpeed: 3.7,
    keepHorizon: 1.4,
    patientPassLead: 0.1,
    patientKeepLead: 0.35,
    shotBaseDuration: 0.55,
    shotDistanceDuration: 0.06,
    shotReleaseHeight: 2.25,
    shotHeightReference: 1.9,
    shotHeightScale: 0.5,
  },
}
export const BASELINE_DRIVE_PROBLEM = BASELINE_DRIVE_PROGRAM
export function createBaselineExecution(): ExecutionInput {
  const program = JSON.parse(JSON.stringify(BASELINE_DRIVE_PROGRAM))
  return parseExecutionInput({
    schemaVersion: CONFIG_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    content: { id: program.id, version: program.version, hash: contentHash(program) },
    program,
    seed: 2026,
    assumptions: { ...DEFAULT_MODEL_ASSUMPTIONS },
    parameters: Object.fromEntries(program.parameters.map((p: { id: string; default: unknown }) => [p.id, p.default])),
    commands: [],
  })
}
