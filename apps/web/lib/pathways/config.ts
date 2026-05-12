/**
 * Pathways v1 catalog (PTH-1).
 *
 * Single source of truth for all 9 Pathways at launch.
 *  - One Pathway is `comingSoon: false` (Complete IQ Foundation).
 *  - The other eight ship as premium "coming soon" cards with real
 *    identity copy so the catalog feels like a real product, not a
 *    one-track demo.
 *
 * Scenario IDs reference rows that already exist in `Scenario` —
 * Pathways never duplicate scenario content, only sequence it.
 *
 * Mirrors §5 + §6 of `docs/courtiq-pathways-product-plan.md`.
 */

import type { PathwayConfig } from './types'

const BDW_IDS = ['BDW-01', 'BDW-02', 'BDW-03', 'BDW-04', 'BDW-05'] as const
const ESC_IDS = ['ESC-01', 'ESC-02', 'ESC-03', 'ESC-04', 'ESC-05'] as const
const AOR_IDS = ['AOR-01', 'AOR-02', 'AOR-03', 'AOR-04', 'AOR-05'] as const
const SKR_IDS = ['SKR-01', 'SKR-02', 'SKR-03', 'SKR-04', 'SKR-05'] as const

/**
 * Foundation chapter mastery thresholds. Mirror §6 of the planning doc:
 * a chapter is mastered when ≥ 4 of 5 best answers are present *and* the
 * chapter's decoder rolling accuracy is ≥ 0.80 across ≥ 5 attempts.
 */
const CHAPTER_PASS: PathwayConfig['chapters'][number]['passCriteria'] = {
  minBest: 3,
  minDecoderAccuracy: 0.6,
  minDecoderAttempts: 3,
}

const CHAPTER_MASTERY: PathwayConfig['chapters'][number]['masteryCriteria'] = {
  minBest: 4,
  minDecoderAccuracy: 0.8,
  minDecoderAttempts: 5,
}

const FOUNDATION: PathwayConfig = {
  slug: 'complete-iq-foundation',
  title: 'Complete IQ Foundation',
  subtitle: 'Build your basketball brain from the ground up.',
  description:
    'Learn to read denial, move when defenders look away, beat closeouts, and punish help rotations. Five chapters, twenty reps, and the four reads every position needs.',
  accentToken: 'brand',
  decoderTags: ['BACKDOOR_WINDOW', 'EMPTY_SPACE_CUT', 'ADVANTAGE_OR_RESET', 'SKIP_THE_ROTATION'],
  estimatedMinutes: 45,
  recommendedFor: ['ball-watcher', 'cutter', 'connector', 'attacker'],
  targetArchetype: 'cutter',
  comingSoon: false,
  basketballProblem:
    'Player watches the ball, freezes on the catch, and reacts to defender cues a half-step late.',
  difficultyRange: [1, 3],
  unlockCriteria: { alwaysAvailable: true },
  passCriteria: { minBest: 16, minDecoderAccuracy: 0.7 },
  parentSummary:
    'Foundational five-chapter track that teaches a player to recognize four universal off-ball / catch-decide cues: backdoor windows, empty-space reads, advantage-vs-reset closeouts, and help-rotation skips.',
  coachSummary:
    'Built on 20 youth basketball scenarios, each authored against a single best-read with feedback for every option. Master this and your player will recognize the four reads that decide possessions before the catch.',
  chapters: [
    {
      slug: 'read-the-denial',
      order: 1,
      title: 'Read the Denial',
      subtitle: 'When the defender blocks the pass, the basket is open.',
      basketballCue:
        "Defender's hand or foot in the passing lane (chest between ball and receiver).",
      decoderTag: 'BACKDOOR_WINDOW',
      decoderTags: ['BACKDOOR_WINDOW'],
      goal: 'Learn when your defender blocks the passing lane and how to punish it by cutting behind.',
      parentSummary:
        'Player can recognize a denied passing lane and counters with a back-cut rather than holding the spot. Foundation read for off-ball offense.',
      coachSummary:
        'Player will recognize a denied passing lane (hand/foot in lane, chest blocking line) and counter with a back-cut to the rim.',
      passCriteria: CHAPTER_PASS,
      masteryCriteria: CHAPTER_MASTERY,
      skillNodes: [
        {
          slug: 'learn-the-cue',
          order: 1,
          title: 'Learn the Cue',
          subtitle: 'Read the lesson, then take one easy rep.',
          kind: 'learn-cue',
          trainingMode: 'learn-the-cue',
          academyLessonSlug: 'backdoor-window',
          scenarioIds: ['BDW-01'],
        },
        {
          slug: 'first-reps',
          order: 2,
          title: 'First Reps',
          subtitle: 'Two clean denials.',
          kind: 'scenario-set',
          trainingMode: 'freeze-frame-read',
          scenarioIds: ['BDW-01', 'BDW-02'],
          prerequisiteNodeSlugs: ['learn-the-cue'],
        },
        {
          slug: 'disguised-denials',
          order: 3,
          title: 'Disguised Denials',
          subtitle: 'Corner and slot variants.',
          kind: 'scenario-set',
          trainingMode: 'freeze-frame-read',
          scenarioIds: ['BDW-03', 'BDW-04'],
          prerequisiteNodeSlugs: ['first-reps'],
        },
        {
          slug: 'timing-test',
          order: 4,
          title: 'Timing Test',
          subtitle: 'Cut on the air pass.',
          kind: 'scenario-set',
          trainingMode: 'freeze-frame-read',
          scenarioIds: ['BDW-05'],
          prerequisiteNodeSlugs: ['disguised-denials'],
        },
      ],
      bossChallenge: {
        slug: 'denial-reader',
        title: 'Boss — Denial Reader',
        subtitle: '5 reps. No hints. 80% to pass.',
        scenarioIds: [...BDW_IDS],
        passCriteria: { bossBestRatio: 0.8, bossMinAttempts: 5 },
        hideDecoderPill: true,
      },
    },
    {
      slug: 'move-when-eyes-leave',
      order: 2,
      title: 'Move When Eyes Leave',
      subtitle: 'When the defender looks at the ball, you go.',
      basketballCue:
        "Defender's eyes / hips / shoulders rotate toward the ball; nearby floor space is empty.",
      decoderTag: 'EMPTY_SPACE_CUT',
      decoderTags: ['EMPTY_SPACE_CUT'],
      goal: 'Learn to cut, drift, or replace when your defender turns toward the ball or to help.',
      parentSummary:
        "Player anticipates help defense by reading the defender's eyes/hips and relocates *before* the rotation completes. The off-ball habit that separates effective wings from bystanders.",
      coachSummary:
        "Player will move on the help turn instead of after it, exploiting the half-second gap before the defender's body follows their eyes.",
      passCriteria: CHAPTER_PASS,
      masteryCriteria: CHAPTER_MASTERY,
      skillNodes: [
        {
          slug: 'learn-the-cue',
          order: 1,
          title: 'Learn the Cue',
          subtitle: 'Read the lesson, then take one easy rep.',
          kind: 'learn-cue',
          trainingMode: 'learn-the-cue',
          academyLessonSlug: 'empty-space-cut',
          scenarioIds: ['ESC-01'],
        },
        {
          slug: 'first-reps',
          order: 2,
          title: 'First Reps',
          subtitle: 'Tag and stunt cuts.',
          kind: 'scenario-set',
          trainingMode: 'freeze-frame-read',
          scenarioIds: ['ESC-01', 'ESC-02'],
          prerequisiteNodeSlugs: ['learn-the-cue'],
        },
        {
          slug: 'help-turn-reads',
          order: 3,
          title: 'Help-Turn Reads',
          subtitle: 'Diagonal cuts and corner lifts.',
          kind: 'scenario-set',
          trainingMode: 'freeze-frame-read',
          scenarioIds: ['ESC-03', 'ESC-04'],
          prerequisiteNodeSlugs: ['first-reps'],
        },
        {
          slug: 'replace-the-empty-spot',
          order: 4,
          title: 'Replace the Empty Spot',
          subtitle: 'Slash to the nail-help vacancy.',
          kind: 'scenario-set',
          trainingMode: 'freeze-frame-read',
          scenarioIds: ['ESC-05'],
          prerequisiteNodeSlugs: ['help-turn-reads'],
        },
      ],
      bossChallenge: {
        slug: 'cutter',
        title: 'Boss — Cutter',
        subtitle: '5 reps. No hints. 80% to pass.',
        scenarioIds: [...ESC_IDS],
        passCriteria: { bossBestRatio: 0.8, bossMinAttempts: 5 },
        hideDecoderPill: true,
      },
    },
    {
      slug: 'beat-the-closeout',
      order: 3,
      title: 'Beat the Closeout',
      subtitle: 'Read the feet. Then choose: shoot, drive, reset.',
      basketballCue:
        'Closeout defender feet/balance: parallel + forward → drive; squared + balanced → reset; late + short → shoot; high + tilted → pump-and-go; sideways recovery → attack the open hip.',
      decoderTag: 'ADVANTAGE_OR_RESET',
      decoderTags: ['ADVANTAGE_OR_RESET'],
      goal: "Learn when to shoot, drive, or reset based on the defender's feet and momentum.",
      parentSummary:
        "Player distinguishes a closeout that is an advantage from one that isn't, and selects the highest-value response on the catch (catch-and-shoot, rip-and-go, or reset/swing).",
      coachSummary:
        "Player will read the closeout's stance before the catch and choose between shoot, drive, and reset rather than defaulting to a single option.",
      passCriteria: CHAPTER_PASS,
      masteryCriteria: CHAPTER_MASTERY,
      skillNodes: [
        {
          slug: 'learn-the-cue',
          order: 1,
          title: 'Learn the Cue',
          subtitle: 'Read the lesson, then take one easy rep.',
          kind: 'learn-cue',
          trainingMode: 'learn-the-cue',
          academyLessonSlug: 'advantage-or-reset',
          scenarioIds: ['AOR-01'],
        },
        {
          slug: 'go-now',
          order: 2,
          title: 'Go Now',
          subtitle: 'Drive past flat feet.',
          kind: 'scenario-set',
          trainingMode: 'freeze-frame-read',
          scenarioIds: ['AOR-01', 'AOR-02'],
          prerequisiteNodeSlugs: ['learn-the-cue'],
        },
        {
          slug: 'reset-discipline',
          order: 3,
          title: 'Reset Discipline',
          subtitle: 'Swing the ball when the closeout is square.',
          kind: 'scenario-set',
          trainingMode: 'freeze-frame-read',
          scenarioIds: ['AOR-03'],
          prerequisiteNodeSlugs: ['go-now'],
        },
        {
          slug: 'shoot-vs-pump',
          order: 4,
          title: 'Shoot vs Pump',
          subtitle: 'Long closeout, short closeout.',
          kind: 'scenario-set',
          trainingMode: 'freeze-frame-read',
          scenarioIds: ['AOR-04'],
          prerequisiteNodeSlugs: ['reset-discipline'],
        },
        {
          slug: 'open-hip',
          order: 5,
          title: 'Open Hip',
          subtitle: 'Sideways recovery — drive the open hip.',
          kind: 'scenario-set',
          trainingMode: 'freeze-frame-read',
          scenarioIds: ['AOR-05'],
          prerequisiteNodeSlugs: ['shoot-vs-pump'],
        },
      ],
      bossChallenge: {
        slug: 'catch-decider',
        title: 'Boss — Catch Decider',
        subtitle: '5 reps. No hints. 80% to pass.',
        scenarioIds: [...AOR_IDS],
        passCriteria: { bossBestRatio: 0.8, bossMinAttempts: 5 },
        hideDecoderPill: true,
      },
    },
    {
      slug: 'punish-the-help',
      order: 4,
      title: 'Punish the Help',
      subtitle: 'When two defenders show up, find the one they left.',
      basketballCue:
        'Two defenders committed to the paint or the ball; a weak-side defender stunting/helping in.',
      decoderTag: 'SKIP_THE_ROTATION',
      decoderTags: ['SKIP_THE_ROTATION'],
      goal: 'Learn to identify help defense and pass behind the rotation.',
      parentSummary:
        'Player recognizes help-side commitments and passes opposite the rotation rather than into traffic. The read that turns drive-and-kick into open threes.',
      coachSummary:
        'Player will identify two-defender commitments and pass *opposite* the rotation, prioritizing the highest-recovery-cost shooter.',
      passCriteria: CHAPTER_PASS,
      masteryCriteria: CHAPTER_MASTERY,
      skillNodes: [
        {
          slug: 'learn-the-cue',
          order: 1,
          title: 'Learn the Cue',
          subtitle: 'Read the lesson, then take one easy rep.',
          kind: 'learn-cue',
          trainingMode: 'learn-the-cue',
          academyLessonSlug: 'skip-the-rotation',
          scenarioIds: ['SKR-01'],
        },
        {
          slug: 'paint-touch',
          order: 2,
          title: 'Paint Touch',
          subtitle: 'Skip cross-court when the help leaves the corner.',
          kind: 'scenario-set',
          trainingMode: 'freeze-frame-read',
          scenarioIds: ['SKR-01'],
          prerequisiteNodeSlugs: ['learn-the-cue'],
        },
        {
          slug: 'pnr-and-post',
          order: 3,
          title: 'PnR & Post Skips',
          subtitle: 'Tagger leaves the corner; double leaves the wing.',
          kind: 'scenario-set',
          trainingMode: 'freeze-frame-read',
          scenarioIds: ['SKR-02', 'SKR-03'],
          prerequisiteNodeSlugs: ['paint-touch'],
        },
        {
          slug: 'second-rotation',
          order: 4,
          title: 'Second Rotation',
          subtitle: 'Drop coverage and X-out skips.',
          kind: 'scenario-set',
          trainingMode: 'freeze-frame-read',
          scenarioIds: ['SKR-04', 'SKR-05'],
          prerequisiteNodeSlugs: ['pnr-and-post'],
        },
      ],
      bossChallenge: {
        slug: 'rotation-reader',
        title: 'Boss — Rotation Reader',
        subtitle: '5 reps. No hints. 80% to pass.',
        scenarioIds: [...SKR_IDS],
        passCriteria: { bossBestRatio: 0.8, bossMinAttempts: 5 },
        hideDecoderPill: true,
      },
    },
    {
      slug: 'real-game-mix',
      order: 5,
      title: 'Real Game Mix',
      subtitle: 'Now read the play, not the decoder.',
      basketballCue:
        'All four. The player has to identify the cue before answering — no decoder pill is shown.',
      decoderTag: null,
      decoderTags: [
        'BACKDOOR_WINDOW',
        'EMPTY_SPACE_CUT',
        'ADVANTAGE_OR_RESET',
        'SKIP_THE_ROTATION',
      ],
      goal: 'Make game-like decisions without being told which decoder to use.',
      parentSummary:
        'Player demonstrates cue identification and decision selection across all four foundation reads, mixed and unlabeled. This is the threshold between trainee and decoder.',
      coachSummary:
        'Player will self-identify which read the scenario presents (denial / empty-space / closeout / help rotation) and execute the correct response without a decoder cue.',
      passCriteria: { minBest: 6, minDecoderAccuracy: 0.7 },
      masteryCriteria: { minBest: 8, minDecoderAccuracy: 0.8, minDecoderAttempts: 5 },
      skillNodes: [
        {
          slug: 'mixed-warmup',
          order: 1,
          title: 'Mixed Reads — Warmup',
          subtitle: '5 randomized reps. Decoder pill hidden.',
          kind: 'mixed',
          trainingMode: 'mixed-reads',
          scenarioIds: [...BDW_IDS, ...ESC_IDS, ...AOR_IDS, ...SKR_IDS],
        },
        {
          slug: 'mixed-pressure',
          order: 2,
          title: 'Mixed Reads — Pressure',
          subtitle: '5 reps with a tighter freeze window.',
          kind: 'mixed',
          trainingMode: 'pressure-test',
          scenarioIds: [...BDW_IDS, ...ESC_IDS, ...AOR_IDS, ...SKR_IDS],
          prerequisiteNodeSlugs: ['mixed-warmup'],
        },
      ],
      bossChallenge: {
        slug: 'all-reads',
        title: 'Pathway Boss — All Reads',
        subtitle: '10 mixed reps. 80% to pass.',
        scenarioIds: [...BDW_IDS, ...ESC_IDS, ...AOR_IDS, ...SKR_IDS],
        passCriteria: { bossBestRatio: 0.8, bossMinAttempts: 10 },
        hideDecoderPill: true,
      },
    },
  ],
}

const COMING_SOON: PathwayConfig[] = [
  {
    slug: 'off-ball-weapon',
    title: 'Off-Ball Weapon',
    subtitle: 'Make your defender forget you exist.',
    description:
      'Drift on the stunt. Replace into the vacated wing. Backdoor the ball-watcher. Catch-and-shoot vs. catch-and-attack reads.',
    accentToken: 'info',
    decoderTags: ['EMPTY_SPACE_CUT', 'BACKDOOR_WINDOW', 'ADVANTAGE_OR_RESET'],
    chapters: [],
    unlockCriteria: { pathwaysMastered: ['complete-iq-foundation'] },
    passCriteria: {},
    estimatedMinutes: 60,
    recommendedFor: ['cutter'],
    targetArchetype: 'off-ball-weapon',
    comingSoon: true,
    parentSummary:
      'Player spaces with intent and converts catch opportunities into shots, drives, or extras.',
    coachSummary:
      'Builds the off-ball habit set that earns minutes: drift on the stunt, replace into vacancies, attack the closeout your defender gives you.',
    basketballProblem:
      'Player gets stuck in the corner and gets ignored on defense — same spot, same shot, no advantage.',
    difficultyRange: [2, 4],
  },
  {
    slug: 'closeout-killer',
    title: 'Closeout Killer',
    subtitle: 'Read the feet. Take what they give you.',
    description:
      'Flat feet → drive. Square stance → reset. High close → pump-and-go. Late close → catch-and-shoot.',
    accentToken: 'xp',
    decoderTags: ['ADVANTAGE_OR_RESET', 'BACKDOOR_WINDOW', 'SKIP_THE_ROTATION'],
    chapters: [],
    unlockCriteria: { pathwaysMastered: ['complete-iq-foundation'] },
    passCriteria: {},
    estimatedMinutes: 60,
    recommendedFor: ['attacker'],
    targetArchetype: 'attacker',
    comingSoon: true,
    parentSummary:
      'Player distinguishes a closeout that is an advantage from one that isn’t, and selects between shoot, drive, and reset.',
    coachSummary:
      'Closeout decisions decide most half-court possessions. This Pathway turns the catch into an instant read instead of a panic.',
    basketballProblem:
      'Player either rushes a contested three or holds too long and gives the advantage back.',
    difficultyRange: [2, 4],
  },
  {
    slug: 'help-defense-punisher',
    title: 'Help Defense Punisher',
    subtitle: 'When two defenders show up, find the one they left.',
    description:
      'Read low-man tag. Skip behind the rotation. Punish the X-out. Read who came to bracket.',
    accentToken: 'iq',
    decoderTags: ['SKIP_THE_ROTATION', 'EMPTY_SPACE_CUT', 'ADVANTAGE_OR_RESET'],
    chapters: [],
    unlockCriteria: { pathwaysMastered: ['complete-iq-foundation'] },
    passCriteria: {},
    estimatedMinutes: 75,
    recommendedFor: ['connector'],
    targetArchetype: 'help-defender-punisher',
    comingSoon: true,
    parentSummary:
      'Player identifies help-defense commitments and passes opposite the rotation rather than into traffic.',
    coachSummary:
      'The fastest way to make your team better is to find the shooter the help left. This Pathway trains that read until it is automatic.',
    basketballProblem: 'Player forces the layup into help instead of finding the abandoned shooter.',
    difficultyRange: [3, 5],
  },
  {
    slug: 'point-guard-brain',
    title: 'Point Guard Brain',
    subtitle: 'See the second-side action before you start the first.',
    description: 'Reset discipline. Dribble-at reads. Skip rhythm. Re-screen calls.',
    accentToken: 'iq',
    decoderTags: ['ADVANTAGE_OR_RESET', 'SKIP_THE_ROTATION'],
    chapters: [],
    unlockCriteria: { pathwaysMastered: ['complete-iq-foundation'] },
    passCriteria: {},
    estimatedMinutes: 75,
    recommendedFor: ['floor-general'],
    targetArchetype: 'floor-general',
    comingSoon: true,
    parentSummary:
      'Player anticipates defensive rotations and organizes spacing accordingly; capable of the right read under shot-clock pressure.',
    coachSummary:
      'PGs who reset the right way get the ball back. This Pathway trains the patience that separates a primary creator from a turnover machine.',
    basketballProblem:
      'Player isn’t seeing the second-side action; runs the same play into a wall.',
    difficultyRange: [3, 5],
  },
  {
    slug: 'wing-decision-maker',
    title: 'Wing Decision-Maker',
    subtitle: 'Catch. Read. Shoot, drive, or move it.',
    description: 'Catch decisions. Live-dribble reads. Shoot/drive/skip triples.',
    accentToken: 'brand',
    decoderTags: [
      'ADVANTAGE_OR_RESET',
      'BACKDOOR_WINDOW',
      'EMPTY_SPACE_CUT',
      'SKIP_THE_ROTATION',
    ],
    chapters: [],
    unlockCriteria: { pathwaysMastered: ['complete-iq-foundation', 'closeout-killer'] },
    passCriteria: {},
    estimatedMinutes: 90,
    recommendedFor: ['attacker', 'connector'],
    targetArchetype: 'attacker',
    comingSoon: true,
    parentSummary:
      'Player handles modern wing responsibilities: read the catch, react quickly, and choose between shoot, drive, and the next pass.',
    coachSummary:
      'The modern wing role demands triple-decision speed on every catch. This Pathway turns catch-and-freeze into catch-and-act.',
    basketballProblem: 'Player has tools but freezes on the catch.',
    difficultyRange: [3, 5],
  },
  {
    slug: 'big-man-connector',
    title: 'Big Man Connector',
    subtitle: 'A big who passes opens every action on the floor.',
    description:
      'Find the helper who left. Catch on the elbow and choose: shoot, drive, or kick. Punish the double instead of forcing through it.',
    accentToken: 'info',
    decoderTags: ['SKIP_THE_ROTATION', 'ADVANTAGE_OR_RESET'],
    chapters: [
      {
        slug: 'find-the-helper',
        order: 1,
        title: 'Find the Helper',
        subtitle: 'When two defenders come, somebody left a man.',
        basketballCue:
          'A weak-side defender stunts or fully rotates into the ball; the shooter he left is open.',
        decoderTag: 'SKIP_THE_ROTATION',
        decoderTags: ['SKIP_THE_ROTATION'],
        goal: 'Read the help-side rotation and pass to the abandoned shooter rather than forcing the finish.',
        parentSummary:
          'Player learns to see the defender who committed to help, name the shooter he left, and deliver the skip pass before the recovery.',
        coachSummary:
          'Bigs who catch and force are easy to guard. This chapter teaches the read that turns a paint catch into a kick-out three.',
        passCriteria: CHAPTER_PASS,
        masteryCriteria: CHAPTER_MASTERY,
        skillNodes: [
          {
            slug: 'learn-the-cue',
            order: 1,
            title: 'Learn the Cue',
            subtitle: 'Read the lesson, then take one easy rep.',
            kind: 'learn-cue',
            trainingMode: 'learn-the-cue',
            academyLessonSlug: 'skip-the-rotation',
            scenarioIds: ['SKR-01'],
          },
          {
            slug: 'corner-help-leaves',
            order: 2,
            title: 'Corner Help Leaves',
            subtitle: 'Tagger steps up; corner shooter is alone.',
            kind: 'scenario-set',
            trainingMode: 'freeze-frame-read',
            scenarioIds: ['SKR-01', 'SKR-02'],
            prerequisiteNodeSlugs: ['learn-the-cue'],
          },
          {
            slug: 'wing-double-leaves',
            order: 3,
            title: 'Wing Double Leaves',
            subtitle: 'Post double leaves the wing.',
            kind: 'scenario-set',
            trainingMode: 'freeze-frame-read',
            scenarioIds: ['SKR-03'],
            prerequisiteNodeSlugs: ['corner-help-leaves'],
          },
        ],
        bossChallenge: {
          slug: 'helper-finder',
          title: 'Boss — Helper Finder',
          subtitle: '5 reps. No hints. 80% to pass.',
          scenarioIds: [...SKR_IDS],
          passCriteria: { bossBestRatio: 0.8, bossMinAttempts: 5 },
          hideDecoderPill: true,
        },
      },
      {
        slug: 'catch-and-decide',
        order: 2,
        title: 'Catch and Decide',
        subtitle: 'Read the closeout before you put it on the floor.',
        basketballCue:
          'Help defender flying out at the catch — read his feet, balance, and cushion before you dribble.',
        decoderTag: 'ADVANTAGE_OR_RESET',
        decoderTags: ['ADVANTAGE_OR_RESET'],
        goal: 'On the elbow / short-roll catch, choose between shoot, drive, and kick based on the closing defender, not a habit.',
        parentSummary:
          'Player handles catches in the middle of the floor without defaulting to a single move; reads the defender first.',
        coachSummary:
          'High-post and short-roll catches force a three-way choice. This chapter trains the closeout read that picks the right one.',
        passCriteria: CHAPTER_PASS,
        masteryCriteria: CHAPTER_MASTERY,
        skillNodes: [
          {
            slug: 'learn-the-cue',
            order: 1,
            title: 'Learn the Cue',
            subtitle: 'Read the lesson, then take one easy rep.',
            kind: 'learn-cue',
            trainingMode: 'learn-the-cue',
            academyLessonSlug: 'advantage-or-reset',
            scenarioIds: ['AOR-01'],
          },
          {
            slug: 'flat-feet-go',
            order: 2,
            title: 'Flat Feet Means Go',
            subtitle: 'Drive past the closeout when his feet stop.',
            kind: 'scenario-set',
            trainingMode: 'freeze-frame-read',
            scenarioIds: ['AOR-01', 'AOR-02'],
            prerequisiteNodeSlugs: ['learn-the-cue'],
          },
          {
            slug: 'square-reset',
            order: 3,
            title: 'Square Stance, Reset',
            subtitle: 'Balanced defender; swing the ball.',
            kind: 'scenario-set',
            trainingMode: 'freeze-frame-read',
            scenarioIds: ['AOR-03'],
            prerequisiteNodeSlugs: ['flat-feet-go'],
          },
          {
            slug: 'long-vs-short-close',
            order: 4,
            title: 'Long vs Short Close',
            subtitle: 'Catch-and-shoot vs catch-and-attack.',
            kind: 'scenario-set',
            trainingMode: 'freeze-frame-read',
            scenarioIds: ['AOR-04', 'AOR-05'],
            prerequisiteNodeSlugs: ['square-reset'],
          },
        ],
        bossChallenge: {
          slug: 'catch-decider',
          title: 'Boss — Big Decider',
          subtitle: '5 reps. No hints. 80% to pass.',
          scenarioIds: [...AOR_IDS],
          passCriteria: { bossBestRatio: 0.8, bossMinAttempts: 5 },
          hideDecoderPill: true,
        },
      },
      {
        slug: 'connector-mix',
        order: 3,
        title: 'Connector Mix',
        subtitle: 'Now read the play, not the decoder.',
        basketballCue:
          'Help rotations and closeouts, mixed and unlabeled. The big has to name the cue before answering.',
        decoderTag: null,
        decoderTags: ['SKIP_THE_ROTATION', 'ADVANTAGE_OR_RESET'],
        goal: 'Make game-like connector reads (skip vs catch-and-decide) without being told which decoder to use.',
        parentSummary:
          'Player demonstrates cross-decoder cue identification across the two reads bigs face most: the help rotation and the closeout.',
        coachSummary:
          'Player will self-identify whether the rep is a rotation read or a catch read, then execute the right answer without a decoder pill.',
        passCriteria: { minBest: 6, minDecoderAccuracy: 0.7 },
        masteryCriteria: { minBest: 8, minDecoderAccuracy: 0.8, minDecoderAttempts: 5 },
        skillNodes: [
          {
            slug: 'mixed-warmup',
            order: 1,
            title: 'Mixed Reads — Warmup',
            subtitle: '5 randomized reps. Decoder pill hidden.',
            kind: 'mixed',
            trainingMode: 'mixed-reads',
            scenarioIds: [...SKR_IDS, ...AOR_IDS],
          },
          {
            slug: 'mixed-pressure',
            order: 2,
            title: 'Mixed Reads — Pressure',
            subtitle: '5 reps with a tighter freeze window.',
            kind: 'mixed',
            trainingMode: 'pressure-test',
            scenarioIds: [...SKR_IDS, ...AOR_IDS],
            prerequisiteNodeSlugs: ['mixed-warmup'],
          },
        ],
        bossChallenge: {
          slug: 'connector-boss',
          title: 'Pathway Boss — Connector',
          subtitle: '10 mixed reps. 80% to pass.',
          scenarioIds: [...SKR_IDS, ...AOR_IDS],
          passCriteria: { bossBestRatio: 0.8, bossMinAttempts: 10 },
          hideDecoderPill: true,
        },
      },
    ],
    unlockCriteria: { pathwaysMastered: ['complete-iq-foundation'] },
    passCriteria: { minBest: 14, minDecoderAccuracy: 0.7 },
    estimatedMinutes: 75,
    recommendedFor: ['connector'],
    targetArchetype: 'connector',
    comingSoon: false,
    parentSummary:
      'Player makes correct passing reads from the high post and short roll, finding the open shooter behind a help rotation.',
    coachSummary:
      'High-IQ bigs unlock four-out spacing. This Pathway trains the elbow and short-roll reads that turn a catch into an advantage.',
    basketballProblem:
      'Bigs who catch and either force a contested finish or pass into help.',
    difficultyRange: [3, 5],
  },
  {
    slug: 'pressure-and-speed',
    title: 'Pressure & Speed Mode',
    subtitle: 'Read it fast — game speed, no hints.',
    description: '4-second reads. No-hint reps. Rapid-fire mixed reads.',
    accentToken: 'heat',
    decoderTags: [
      'BACKDOOR_WINDOW',
      'EMPTY_SPACE_CUT',
      'ADVANTAGE_OR_RESET',
      'SKIP_THE_ROTATION',
    ],
    chapters: [],
    unlockCriteria: {},
    passCriteria: {},
    estimatedMinutes: 60,
    recommendedFor: ['floor-general', 'attacker'],
    targetArchetype: 'floor-general',
    comingSoon: true,
    parentSummary:
      'Player can recognize and execute the correct read at varsity / AAU game speed without pre-freeze prompts.',
    coachSummary:
      'Slow correct equals garbage time. This Pathway shrinks the read window until decisions are automatic at game speed.',
    basketballProblem: 'Player can read it slow but can’t read it fast.',
    difficultyRange: [4, 5],
  },
  {
    slug: 'advanced-game-reads',
    title: 'Advanced Game Reads',
    subtitle: 'Cross-decoder, cue-identification, real-game mix.',
    description: 'Cue identification. Multi-step reads. Decoder mix as it appears in real basketball.',
    accentToken: 'iq',
    decoderTags: [
      'BACKDOOR_WINDOW',
      'EMPTY_SPACE_CUT',
      'ADVANTAGE_OR_RESET',
      'SKIP_THE_ROTATION',
    ],
    chapters: [],
    unlockCriteria: {},
    passCriteria: {},
    estimatedMinutes: 60,
    recommendedFor: ['floor-general'],
    targetArchetype: 'floor-general',
    comingSoon: true,
    parentSummary:
      'Player demonstrates cross-decoder cue identification and multi-step decision-making — the threshold between trainee and decoder.',
    coachSummary:
      'Real basketball doesn’t tell you which read it is. This Pathway forces the player to identify the cue before they execute.',
    basketballProblem:
      'Real basketball doesn’t tell you which read it is — you have to identify the cue.',
    difficultyRange: [4, 5],
  },
]

export const PATHWAYS: readonly PathwayConfig[] = [FOUNDATION, ...COMING_SOON]

/** Slug of the Foundation Pathway. Surfaced as a constant so the home
 * page CTA and the recommendation logic don't have to hand-roll the
 * string. */
export const FOUNDATION_SLUG = 'complete-iq-foundation'
