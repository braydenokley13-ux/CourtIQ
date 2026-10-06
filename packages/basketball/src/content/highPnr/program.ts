/** The hero family's answer compiler. All basketball-specific branches live in this authored plan. */
import type {
  Condition,
  ContentProgram,
  DefensiveRule,
  ObligationDefinition,
  ParameterDefinition,
  Scalar,
  Target,
} from '../../domain/program'
import type { PolicyCondition } from './types'
import { HIGH_PNR_PROBLEM, DEFAULT_ANSWER } from './scenario'
import { DEFAULT_OPPONENT } from './offensivePolicy'
import {
  role,
  current,
  param,
  coord,
  add,
  sub,
  mul,
  min,
  max,
  bound,
  eq,
  all,
  any,
  not,
  cmp,
  choice,
  select,
  at,
  components,
  rim,
  mix,
} from '../expressions'
const p = (s: string) => param(`defense.${s}`),
  o = (s: string) => param(`offense.${s}`)
const a = (s: string, v: string | number | boolean) => eq(`defense.${s}`, v)
const adaptive = eq('offense.adaptive', true),
  ballAtHandler = { sameActor: [current('owner'), role('ballhandler')] } as Condition
const encountered = { encountered: 'high-screen' } as Condition
const screenUsed = any(all(adaptive, encountered), all(not(adaptive), cmp({ metric: 'time' }, 'gte', 0.48)))
const showRecovered = any(
  all(adaptive, { memory: 'showReleased' }),
  all(not(adaptive), cmp({ metric: 'time' }, 'gte', 1.2)),
)
const switched = all(a('coverage', 'switch'), screenUsed),
  iced = a('coverage', 'ice'),
  blitz = a('coverage', 'blitz'),
  hedge = a('coverage', 'hedge')
const passed = { memory: 'passed' } as Condition
const popping = all(cmp(coord('screener', 'z'), 'gt', 7.7), cmp(coord('screener', 'vz'), 'gte', 0.3))
const force: Scalar = { op: 'sign', value: coord('ballhandler', 'x'), zero: 1 }
const cornerGuard = rim(at('weakCorner', choice(all(iced, ballAtHandler), 0.9, 0)), 0.9)
const ownCornerGuard = rim(at('weakCorner'), 0.9),
  ownLiftGuard = rim(at('weakLift'), 0.9)
const liftGuard = rim(at('weakLift', choice(all(iced, ballAtHandler), 0.9, 0)), 0.9)
const depth = choice(iced, min(1, add(p('tagDepth'), 0.2)), p('tagDepth'))
const tagTarget = mix(
  cornerGuard,
  components(sub(coord('screener', 'x'), 0.8), bound(sub(coord('screener', 'z'), 1.2), 2.5, 3.7)),
  depth,
)
const secured = all(
  { distance: [role('big'), role('screener')], below: param('model.contestRadius') },
  not(ballAtHandler),
)
const rollThreat = any(cmp(coord('screener', 'vz'), 'lt', -0.2), cmp(coord('screener', 'z'), 'lt', 5.5))
const tagActive = all(
  a('tag', true),
  not(switched),
  rollThreat,
  selectCondition(a('recovery', 'roller-secured'), not(secured), not(passed)),
)
const tagPlanned = all(
  a('tag', true),
  not(a('coverage', 'switch')),
  ballAtHandler,
  cmp(coord('screener', 'vz'), 'lte', 0.2),
)
const passCorner = all(passed, { sameActor: [current('owner'), role('weakCorner')] }),
  passLift = all(passed, { sameActor: [current('owner'), role('weakLift')] })
const exchange = all(
  a('backside', 'x-out'),
  any(passCorner, all(a('rotationTiming', 'early'), tagActive, cmp(depth, 'gt', 0.45))),
)
function selectCondition(c: Condition, yes: Condition, no: Condition): Condition {
  return any(all(c, yes), all(not(c), no))
}
const ob = (
  id: string,
  defender: string,
  subject: string,
  threat: string,
  kind: ObligationDefinition['kind'],
  target: Target,
  priority = 1,
  when?: Condition,
  railParameter?: string,
  dueAfterPass = false,
): ObligationDefinition => ({
  id,
  defender: role(defender),
  subject: { actor: role(subject) },
  threat,
  kind,
  target,
  priority,
  ...(when ? { when } : {}),
  ...(railParameter ? { railParameter } : {}),
  ...(dueAfterPass ? { dueAfterPass: true } : {}),
})
const fixed = (
  id: string,
  label: string,
  defenders: string[],
  obligations: ObligationDefinition[],
  when?: Condition,
): DefensiveRule => ({ id, label, replaceFor: defenders.map(role), obligations, ...(when ? { when } : {}) })
const prepared: Target = {
  axes: {
    x: mix(cornerGuard, components(sub(coord('screener', 'x'), 0.8), 2.8), mul(depth, 0.65)),
    z: mix(cornerGuard, components(sub(coord('screener', 'x'), 0.8), 2.8), depth),
  },
}
const split = mul(bound(mul(sub(depth, 0.3), 0.95), 0, 0.6), choice(tagActive, 1, 0.4))
const bigOwnsRoll = any(not(ballAtHandler), all(hedge, showRecovered))
const ballTarget = select(
  all(iced, ballAtHandler),
  at('ballhandler', mul(force, -0.75), 0.1, 0.3),
  select(ballAtHandler, at('ballhandler', 0.12, choice(a('poa', 'over'), 0.65, -0.85)), rim(at('ballhandler'), 0.9)),
)
const bigTarget = select(
  all(blitz, ballAtHandler),
  select(screenUsed, at('ballhandler', -0.75, 0, 0.45), at('ballhandler', -0.5, -0.2)),
  select(
    all(hedge, ballAtHandler, not(showRecovered)),
    at('ballhandler', -0.35, -1.3),
    select(
      bigOwnsRoll,
      rim(at('screener'), 0.8),
      select(
        iced,
        components(
          bound(add(coord('ballhandler', 'x'), mul(force, 0.9)), -6.5, 6.5),
          min(add(p('bigDepth'), 1.9), sub(coord('ballhandler', 'z'), 1.2)),
        ),
        components(coord('ballhandler', 'x'), min(add(p('bigDepth'), 1.9), sub(coord('ballhandler', 'z'), 0.95))),
      ),
    ),
  ),
)
const base: ObligationDefinition[] = [
  ob(
    'poa:switch',
    'poa',
    'screener',
    'roll',
    'switch',
    components(
      add(coord('screener', 'x'), mul(coord('screener', 'vx'), param('model.reactionDelay'))),
      min(13, add(coord('screener', 'z'), mul(coord('screener', 'vz'), param('model.reactionDelay')), 0.85)),
    ),
    1,
    all(switched, not(popping)),
  ),
  ob('poa:switch-pop', 'poa', 'screener', 'pop', 'switch', rim(at('screener'), 0.85), 1, all(switched, popping)),
  ob(
    'big:switch',
    'big',
    'ballhandler',
    'drive',
    'switch',
    rim(at('ballhandler', 0, 0, param('model.reactionDelay')), 0.85),
    1,
    switched,
  ),
  ob(
    'poa:contain',
    'poa',
    'ballhandler',
    'drive',
    'contain',
    ballTarget,
    1,
    all(not(switched), any(iced, blitz), ballAtHandler),
  ),
  ob(
    'poa:chase',
    'poa',
    'ballhandler',
    'drive',
    'chase',
    ballTarget,
    1,
    all(not(switched), not(all(any(iced, blitz), ballAtHandler))),
  ),
  ...(['drive', 'roll', 'pop'] as const).flatMap((threat) =>
    ['contain', 'chase', 'recover'].map((kind) =>
      ob(
        `big:${threat}:${kind}`,
        'big',
        threat === 'drive' ? 'ballhandler' : 'screener',
        threat,
        kind as ObligationDefinition['kind'],
        bigTarget,
        1,
        all(
          not(switched),
          threat === 'drive' ? not(bigOwnsRoll) : all(bigOwnsRoll, threat === 'pop' ? popping : not(popping)),
          kind === 'contain'
            ? any(all(blitz, ballAtHandler), all(not(bigOwnsRoll), not(hedge)))
            : kind === 'recover'
              ? bigOwnsRoll
              : all(hedge, not(bigOwnsRoll), not(blitz)),
        ),
      ),
    ),
  ),
  ob('strong:guard', 'strongSide', 'strongCorner', 'strong', 'guard', rim(at('strongCorner'), 0.9)),
  ob('low:tag', 'lowMan', 'screener', 'roll', 'tag', tagTarget, 1.5, tagActive, 'defense.tagDepth'),
  ob(
    'low:recover-lift',
    'lowMan',
    'weakLift',
    'lift',
    'recover',
    liftGuard,
    0.35,
    all(tagActive, exchange),
    undefined,
    true,
  ),
  ob(
    'low:recover-corner',
    'lowMan',
    'weakCorner',
    'corner',
    'recover',
    cornerGuard,
    0.35,
    all(tagActive, not(exchange)),
    undefined,
    true,
  ),
  ob('low:closeout-lift', 'lowMan', 'weakLift', 'lift', 'closeout', liftGuard, 1, all(not(tagActive), exchange)),
  ob(
    'low:recover-home',
    'lowMan',
    'weakCorner',
    'corner',
    'recover',
    select(tagPlanned, prepared, cornerGuard),
    1,
    all(not(tagActive), not(exchange)),
    'defense.tagDepth',
  ),
  ob('back:exchange', 'backside', 'weakCorner', 'corner', 'closeout', cornerGuard, 1, exchange),
  ob(
    'back:stay',
    'backside',
    'weakLift',
    'lift',
    'guard',
    liftGuard,
    1,
    all(not(exchange), any(a('backside', 'stay'), passLift, all(not(tagActive), not(tagPlanned)))),
  ),
  ob(
    'back:split-lift',
    'backside',
    'weakLift',
    'lift',
    'split',
    mix(liftGuard, cornerGuard, split),
    1,
    all(not(exchange), not(any(a('backside', 'stay'), passLift, all(not(tagActive), not(tagPlanned))))),
  ),
  ob(
    'back:split-corner',
    'backside',
    'weakCorner',
    'corner',
    'split',
    mix(liftGuard, cornerGuard, split),
    0.9,
    all(not(exchange), not(any(a('backside', 'stay'), passLift, all(not(tagActive), not(tagPlanned))))),
  ),
]
function translate(c: PolicyCondition): Condition {
  switch (c.kind) {
    case 'all':
      return all(...c.conditions.map(translate))
    case 'any':
      return any(...c.conditions.map(translate))
    case 'not':
      return not(translate(c.condition))
    case 'enabled':
      return eq(`offense.${c.key}`, true)
    case 'possession':
      return { possession: role(c.role) }
    case 'distance':
      return { distance: [role(c.a), role(c.b)], below: c.below }
    case 'coordinate':
      return all(
        ...([
          c.above === undefined ? undefined : cmp(coord(c.role, c.axis), 'gt', c.above),
          c.below === undefined ? undefined : cmp(coord(c.role, c.axis), 'lt', c.below),
        ].filter(Boolean) as Condition[]),
      )
    case 'relative':
      return all(
        ...([
          c.above === undefined ? undefined : cmp(sub(coord(c.a, c.axis), coord(c.b, c.axis)), 'gt', c.above),
          c.below === undefined ? undefined : cmp(sub(coord(c.a, c.axis), coord(c.b, c.axis)), 'lt', c.below),
        ].filter(Boolean) as Condition[]),
      )
    case 'responsibility':
      return { obligation: role(c.role), kind: c.task }
    case 'activated':
      return { activated: c.ruleId }
    case 'screen-used':
      return encountered
    case 'action-present':
      return { all: [] }
  }
}
const rotate = (target: Target): Target => ({
  rotate: target,
  pivot: HIGH_PNR_PROBLEM.players.find((p) => p.id === 'O5')!.start,
  angle: o('screenAngle'),
})
const parameters: ParameterDefinition[] = [
  ...Object.entries(DEFAULT_ANSWER)
    .filter(([k]) => k !== 'coachRules')
    .map(([k, v]) => ({
      id: `defense.${k}`,
      default: v,
      ...(k === 'tagDepth'
        ? { min: 0, max: 1 }
        : k === 'bigDepth'
          ? { min: 1.5, max: 6 }
          : typeof v === 'string'
            ? {
                choices:
                  k === 'coverage'
                    ? ['drop', 'switch', 'blitz', 'hedge', 'ice', 'custom']
                    : k === 'poa'
                      ? ['over', 'under']
                      : k === 'backside'
                        ? ['stay', 'split', 'x-out']
                        : k === 'rotationTiming'
                          ? ['early', 'on-pass']
                          : ['on-pass', 'roller-secured'],
              }
            : {}),
    })),
  {
    id: 'offense.intent',
    default: 'lift',
    choices: ['auto', 'lift', 'roll', 'reject', 'pop', 'slip', 'skip', 'extra', 'short-roll'],
  },
  { id: 'offense.adaptive', default: true },
  ...Object.entries(DEFAULT_OPPONENT).map(([k, v]) => ({
    id: `offense.${k}`,
    default: v,
    ...(typeof v === 'number'
      ? k === 'screenAngle'
        ? { min: -0.75, max: 0.75 }
        : k === 'liftDelay'
          ? { min: -0.25, max: 0.6 }
          : { min: -0.7, max: 0.7 }
      : {}),
  })),
  { id: 'model.reactionDelay', default: 0.3, min: 0, max: 0.8 },
  { id: 'model.contestRadius', default: 1.25, min: 0.5, max: 2 },
  { id: 'model.releaseHeight', default: 1.85, min: 1.2, max: 2.4 },
  { id: 'legacy.screenAngle', default: 0, min: -Math.PI, max: Math.PI },
  { id: 'initial.liftZ', default: 5.25, min: 0.4, max: 14 },
  { id: 'coach.roller.enabled', default: false },
  { id: 'coach.roller.depth', default: 4.5, min: 2.5, max: 7 },
  { id: 'coach.roller.response', default: 'low-man-tags', choices: ['low-man-tags', 'big-recovers'] },
  { id: 'coach.lift.enabled', default: false },
  { id: 'coach.lift.rise', default: 0.5, min: 0.5, max: 3 },
  { id: 'coach.lift.response', default: 'stay-with-lift', choices: ['stay-with-lift', 'x-out'] },
]
const coachRoll = all(
  eq('coach.roller.enabled', true),
  not(a('coverage', 'switch')),
  encountered,
  ballAtHandler,
  rollThreat,
  cmp(coord('screener', 'z'), 'lt', param('coach.roller.depth')),
)
const coachLift = all(
  eq('coach.lift.enabled', true),
  not(a('coverage', 'switch')),
  encountered,
  ballAtHandler,
  rollThreat,
  cmp(sub(coord('weakLift', 'z'), param('initial.liftZ')), 'gte', param('coach.lift.rise')),
)
const coachX = all(coachLift, eq('coach.lift.response', 'x-out'))
const coachTag = tagTarget
const offenseRules = HIGH_PNR_PROBLEM.offenseRules!.map((r) => ({
  ...r,
  when: all(adaptive, translate(r.when)),
  motions: r.motions.map((m) => ({
    actor: role(m.role),
    kind: m.kind,
    target:
      m.role === 'weakLift'
        ? components(sub('x' in m.target ? m.target.x : -5.1, o('liftWidth')), 'z' in m.target ? m.target.z : 7.5)
        : rotate('relativeTo' in m.target ? at(m.target.relativeTo, m.target.offset.x, m.target.offset.z) : m.target),
    speed: m.speed ?? 3.4,
    ...(r.id === 'lift-behind-tag'
      ? { from: max(0, add(0.25, o('liftDelay'))) }
      : m.from === undefined
        ? {}
        : { from: m.from }),
    ...(m.until === undefined ? {} : { until: m.until }),
  })),
}))
const handlerBias = choice(
  { sameActor: [current('reader'), role('screener')] },
  choice(cmp(coord('screener', 'z'), 'lt', 4.6), 0.7, 0.15),
  choice({ sameActor: [current('reader'), role('ballhandler')] }, 0.04, 0.15),
)
const opportunities = ['roll', 'lift', 'corner', 'drive', 'pop', 'strong'].map((id) => {
  const actor =
    id === 'drive'
      ? current('owner')
      : role(
          id === 'roll' || id === 'pop'
            ? 'screener'
            : id === 'corner'
              ? 'weakCorner'
              : id === 'lift'
                ? 'weakLift'
                : 'strongCorner',
        )
  const intent =
    id === 'roll'
      ? any(eq('offense.intent', 'roll'), eq('offense.intent', 'slip'), eq('offense.intent', 'short-roll'))
      : id === 'corner'
        ? any(eq('offense.intent', 'skip'), eq('offense.intent', 'extra'))
        : id === 'drive'
          ? eq('offense.intent', 'reject')
          : eq('offense.intent', id)
  return {
    id,
    label: {
      roll: 'Roll',
      lift: 'Weakside lift',
      corner: 'Weak corner',
      drive: 'Keep / attack',
      pop: 'Pop',
      strong: 'Strong corner',
    }[id]!,
    actor,
    kind: id === 'drive' ? ('keep' as const) : ('pass' as const),
    target: id === 'drive' ? rim({ actor }, 1.6) : { actor },
    when:
      id === 'roll'
        ? all(not(eq('offense.intent', 'pop')), cmp(coord('screener', 'z'), 'lt', 7.7))
        : id === 'pop'
          ? eq('offense.intent', 'pop')
          : undefined,
    scoreBias: add(
      choice(
        all(cmp({ metric: 'passCount' }, 'eq', 0), intent),
        0.22,
        choice(
          all(
            eq('offense.intent', 'extra'),
            cmp({ metric: 'passCount' }, 'eq', 1),
            not({ sameActor: [actor, current('owner')] }),
          ),
          0.15,
          0,
        ),
      ),
      choice(cmp({ coordinate: actor, axis: 'z' }, 'lt', 4.5), 0.26, 0),
      id === 'drive' ? handlerBias : 0,
    ),
    laneWeight: id === 'roll' ? 0.3 : 0.06,
    ...(id === 'drive'
      ? {}
      : {
          launches:
            id === 'roll'
              ? [
                  {
                    timing: 'iterative' as const,
                    kind: 'pocket' as const,
                    releaseHeight: 1.25,
                    catchHeight: 1.55,
                    minDuration: 0.25,
                    maxDuration: 1.3,
                  },
                  {
                    timing: 'extend-first' as const,
                    kind: 'lob' as const,
                    releaseHeight: add(param('model.releaseHeight'), 0.15),
                    catchHeight: 1.85,
                    durationOffset: 0.2,
                    minDuration: 0.25,
                    maxDuration: 1.1,
                  },
                ]
              : [
                  {
                    timing: 'iterative' as const,
                    kind: 'chest' as const,
                    releaseHeight: param('model.releaseHeight'),
                    catchHeight: 1.55,
                    minDuration: 0.25,
                    maxDuration: 1.3,
                  },
                ],
          useCrossCourtKind: id !== 'roll',
          previewThreshold: 0.08,
        }),
  }
})
const reads = HIGH_PNR_PROBLEM.reads.map((r) => ({
  id: r.id,
  actor: { player: r.actorId },
  earliest: r.earliest,
  ...(r.decisionAt === undefined ? {} : { decisionAt: r.decisionAt }),
  trigger: r.trigger === 'catch' ? { kind: 'catch' as const } : { kind: 'encounter' as const, action: 'high-screen' },
  continuousWhen: adaptive,
  options: r.options,
  continuations: Object.fromEntries(
    Object.entries(r.continuations ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  ),
  ...(r.id === 'handler-read'
    ? {
        initialOptionsWhen: Object.entries({
          roll: ['roll'],
          'short-roll': ['roll'],
          slip: ['roll'],
          skip: ['lift', 'corner'],
          extra: ['lift', 'corner'],
          pop: ['pop'],
          reject: ['drive'],
        }).map(([intent, options]) => ({ when: eq('offense.intent', intent), options })),
      }
    : {}),
}))
const extra: DefensiveRule[] = [
  fixed(
    'protect-strong-spacing',
    'Protect strong-side spacing',
    ['strongSide'],
    [ob('strong:authored', 'strongSide', 'strongCorner', 'strong', 'guard', rim(at('strongCorner'), 0.9))],
  ),
  fixed(
    'stay-with-lift',
    'Stay with lift',
    ['backside'],
    [ob('back:authored-stay', 'backside', 'weakLift', 'lift', 'guard', ownLiftGuard)],
    a('backside', 'stay'),
  ),
  fixed(
    'stop-short-roll',
    'Low man stops the short roll; backside rotates',
    ['lowMan', 'backside'],
    [
      ob('low:short-roll', 'lowMan', 'screener', 'roll', 'contain', rim(at('screener'), 1), 2),
      ob('back:short-roll', 'backside', 'weakCorner', 'corner', 'closeout', ownCornerGuard),
    ],
    { activated: 'release-two-on-ball' },
  ),
  fixed(
    'nail-the-reject',
    'Strong helper contains the rejected drive',
    ['strongSide'],
    [ob('strong:reject', 'strongSide', 'ballhandler', 'drive', 'contain', rim(at('ballhandler'), 1.6), 2)],
    { activated: 'reject-overplay' },
  ),
  fixed(
    'meet-the-rescreen',
    'Low man meets the second screen',
    ['lowMan'],
    [ob('low:rescreen', 'lowMan', 'screener', 'roll', 'tag', tagTarget, 1.5, undefined, 'defense.tagDepth')],
    { activated: 'second-screen' },
  ),
  fixed(
    'coach-roller',
    'If roller enters, low man tags and big contains',
    ['lowMan', 'big'],
    [
      ob('coach:roll', 'lowMan', 'screener', 'roll', 'tag', coachTag, 1.5, undefined, 'defense.tagDepth'),
      ob('coach:big-contain', 'big', 'ballhandler', 'drive', 'contain', rim(at('ballhandler'), 0.85), 1.5),
    ],
    all(coachRoll, eq('coach.roller.response', 'low-man-tags')),
  ),
  fixed(
    'coach-roller-recover',
    'If roller enters, big recovers and low man returns',
    ['big', 'lowMan'],
    [
      ob('coach:big-recover', 'big', 'screener', 'roll', 'recover', rim(at('screener'), 0.8), 1.5),
      ob('coach:low-home', 'lowMan', 'weakCorner', 'corner', 'recover', ownCornerGuard),
    ],
    all(coachRoll, eq('coach.roller.response', 'big-recovers')),
  ),
  fixed(
    'coach-lift-stay',
    'If wing rises, backside stays with lift',
    ['backside'],
    [ob('coach:lift', 'backside', 'weakLift', 'lift', 'guard', ownLiftGuard, 1.2)],
    all(coachLift, eq('coach.lift.response', 'stay-with-lift')),
  ),
  fixed(
    'coach-three-person-exchange',
    'Authored three-person exchange',
    ['lowMan', 'backside', 'big'],
    [
      ob('coach:x-big', 'big', 'screener', 'roll', 'recover', rim(at('screener'), 0.8), 1.5),
      ob('coach:x-lift', 'lowMan', 'weakLift', 'lift', 'closeout', ownLiftGuard, 1.2),
      ob('coach:x-corner', 'backside', 'weakCorner', 'corner', 'closeout', ownCornerGuard, 1.2),
    ],
    coachX,
  ),
]

const coachLabels: Record<string, [string, string]> = {
  'coach-roller': [
    'After the screen, when the roller gets below {depth} m from the baseline, the low man tags and the big contains the ball.',
    'depth',
  ],
  'coach-roller-recover': [
    'After the screen, when the roller gets below {depth} m from the baseline, the big takes the roller and the low man returns to the corner.',
    'depth',
  ],
  'coach-lift-stay': [
    'After the screen, when the weakside lift rises {rise} m during the roll, the backside stays with the lift.',
    'rise',
  ],
  'coach-three-person-exchange': [
    'After the screen, when the weakside lift rises {rise} m during the roll, X-out: backside takes corner, low man takes lift, big takes roller.',
    'rise',
  ],
}
for (const rule of extra) {
  const label = coachLabels[rule.id]
  if (label) {
    rule.label = label[0]
    rule.labelBindings = [
      { token: label[1], parameter: label[1] === 'depth' ? 'coach.roller.depth' : 'coach.lift.rise', decimals: 1 },
    ]
  }
}
// The first authored obligation on the incoming receiver takes closeout priority.
extra.push({
  id: 'incoming-receiver',
  label: 'Incoming receiver owns this closeout',
  when: all(not(ballAtHandler)),
  replaceFor: [],
  obligations: [],
  adjust: {
    subject: current('owner'),
    excludeKinds: ['recover', 'tag'],
    first: true,
    target: rim({ actor: current('owner') }, 0.7),
    priority: 2,
  },
})
export const HIGH_PNR_PROGRAM: ContentProgram = {
  id: HIGH_PNR_PROBLEM.id,
  version: '2.0.0',
  title: HIGH_PNR_PROBLEM.title,
  description: HIGH_PNR_PROBLEM.description,
  players: HIGH_PNR_PROBLEM.players,
  roles: HIGH_PNR_PROBLEM.roles,
  initial: { ballOwner: 'O1', readNode: 'handler-read', matchups: [] },
  parameters,
  actions: HIGH_PNR_PROBLEM.actions.map((ac) => ({
    id: ac.id,
    actor: { player: ac.playerId },
    kind: ac.kind,
    from: ac.from,
    speed: ac.speed ?? 3.4,
    priority: ac.counter ? 1 : 0,
    ...(ac.id === 'high-screen'
      ? { until: 0.48, screen: { beneficiary: role('ballhandler'), encounterDistance: 1.9, minimumSpeed: 0.2 } }
      : {}),
    target:
      ac.id === 'high-screen'
        ? rotate(
            select(
              eq('legacy.screenAngle', 0),
              ac.target,
              components(
                add(ac.target.x, mul({ op: 'sin', value: param('legacy.screenAngle') }, 0.35)),
                add(ac.target.z, mul({ op: 'cos', value: param('legacy.screenAngle') }, 0.15)),
              ),
            ),
          )
        : ac.playerId === 'O1' || ac.playerId === 'O5'
          ? rotate(ac.target)
          : ac.target,
    ...(ac.counter ? { when: any(...ac.counter.map((c) => eq('offense.intent', c))) } : {}),
    ...(ac.id === 'weak-lift' ? { when: not(adaptive) } : {}),
  })),
  opportunities,
  reads,
  offenseRules,
  defenseRules: [
    fixed('hero-coverage', 'Authored P&R coverage', ['poa', 'big', 'strongSide', 'lowMan', 'backside'], base),
    ...extra,
  ],
  memoryRules: [
    { id: 'passed', when: { ballPhase: ['pass', 'gather', 'shot'] }, value: true, latch: true },
    {
      id: 'showReleased',
      when: all(encountered, cmp({ metric: 'time' }, 'gt', add({ encounterTime: 'high-screen' }, 0.02))),
      value: true,
      latch: true,
    },
  ],
  variations: [
    { parameter: 'defense.tagDepth', label: 'Tag depth', min: 0, max: 1, step: 0.2 },
    { parameter: 'defense.bigDepth', label: 'Big depth', min: 1.5, max: 6, step: 0.6 },
    { parameter: 'defense.tag', label: 'Low help', toggle: true },
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
