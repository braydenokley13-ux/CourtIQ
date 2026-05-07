/**
 * Variant scaffolder — emits a variant skeleton from a template.
 *
 * Usage:
 *   pnpm exec tsx scripts/scaffold-variant.ts <template-id> \
 *     --id BDW-T1-03 \
 *     [--mirror] \
 *     [--user-slot <slot>] \
 *     [--disguise none|light|moderate|heavy] \
 *     [--clock none|shot_clock|game_clock] \
 *     [--difficulty <1..5>] \
 *     [--out <path>]
 *
 * The output is a JSON file with all required prose marked TODO so the
 * author can `$EDITOR` straight to the gaps. The materializer will refuse
 * to compile a variant whose prose still contains `TODO:` (lint check)
 * — see scripts/lint-variants.ts.
 *
 * The scaffolder does not invent prose. It produces structure only.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  templateSchema,
  variationSignature,
  type Template,
} from '../packages/db/seed/scenarios/templates/_schema'

const TEMPLATES_DIR = path.join(process.cwd(), 'packages', 'db', 'seed', 'scenarios', 'templates')

interface Args {
  templateId: string
  variantId: string
  mirror: boolean
  userSlot: string | null
  disguise: 'none' | 'light' | 'moderate' | 'heavy'
  clock: 'none' | 'shot_clock' | 'game_clock'
  difficulty: number | null
  out: string | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    templateId: '',
    variantId: '',
    mirror: false,
    userSlot: null,
    disguise: 'none',
    clock: 'none',
    difficulty: null,
    out: null,
  }
  const positional: string[] = []
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]!
    if (!a.startsWith('--')) {
      positional.push(a)
      continue
    }
    if (a === '--id') args.variantId = argv[++i] ?? ''
    else if (a === '--mirror') args.mirror = true
    else if (a === '--user-slot') args.userSlot = argv[++i] ?? null
    else if (a === '--disguise') args.disguise = (argv[++i] as Args['disguise']) ?? 'none'
    else if (a === '--clock') args.clock = (argv[++i] as Args['clock']) ?? 'none'
    else if (a === '--difficulty') args.difficulty = Number(argv[++i] ?? NaN)
    else if (a === '--out') args.out = argv[++i] ?? null
    else throw new Error(`Unknown flag: ${a}`)
  }
  args.templateId = positional[0] ?? ''
  if (!args.templateId) throw new Error('usage: scaffold-variant <template-id> --id <VAR-ID> [flags]')
  if (!args.variantId) throw new Error('--id <VAR-ID> is required (e.g. --id BDW-T1-03)')
  return args
}

async function loadTemplate(templateId: string): Promise<{ template: Template; dir: string }> {
  const dir = path.join(TEMPLATES_DIR, templateId)
  const file = path.join(dir, 'template.json')
  const raw = await fs.readFile(file, 'utf8').catch(() => {
    throw new Error(`Template not found: ${templateId} (looked at ${path.relative(process.cwd(), file)})`)
  })
  const template = templateSchema.parse(JSON.parse(raw))
  return { template, dir }
}

function nextVariantFileName(args: Args): string {
  // Keep filename sortable + descriptive: NN-<axes>.json
  const axes: string[] = []
  if (args.mirror) axes.push('mirror')
  if (args.userSlot) axes.push(`as-${args.userSlot}`)
  if (args.disguise !== 'none') axes.push(args.disguise)
  if (args.clock !== 'none') axes.push(args.clock.replace('_', '-'))
  if (axes.length === 0) axes.push('base')
  // Pull the trailing two-digit suffix from variantId for the file prefix.
  const m = /-(\d{2})$/.exec(args.variantId)
  const prefix = m ? m[1] : '99'
  return `${prefix}-${axes.join('-')}.json`
}

function buildSkeleton(template: Template, args: Args): Record<string, unknown> {
  const userSlot = args.userSlot ?? template.tactical.user_slot_default
  const userPlayer = template.scene.players.find((p) => p.slot === userSlot)
  if (!userPlayer) {
    throw new Error(
      `--user-slot "${userSlot}" not in template ${template.id}. Available: ${template.scene.players.map((p) => p.slot).join(', ')}`,
    )
  }
  if (args.disguise !== 'none' && !template.disguises[args.disguise]) {
    throw new Error(`Template ${template.id} does not declare disguise "${args.disguise}".`)
  }

  const choices: Record<string, { label: string; feedback_text: string; partial_feedback_text?: string }> = {}
  for (const c of template.choices) {
    choices[c.outcome] =
      c.quality === 'acceptable'
        ? {
            label: `TODO: variant label for "${c.outcome}" (acceptable)`,
            feedback_text: `TODO: feedback if user picks "${c.outcome}".`,
            partial_feedback_text: `TODO: shorter post-rep nudge for "${c.outcome}".`,
          }
        : {
            label: `TODO: variant label for "${c.outcome}" (${c.quality})`,
            feedback_text: `TODO: feedback if user picks "${c.outcome}".`,
          }
  }

  const skeleton: Record<string, unknown> = {
    id: args.variantId,
    template: template.id,
    status: 'DRAFT',
    version: 1,

    copy: {
      title: `TODO: ${template.id} — short identity line`,
      prompt: 'TODO: ≤140 chars, imperative, basketball-first voice.',
      game_context: 'TODO: 4-on-4 half-court setup line. Where the ball started, what the clock says.',
      possession_setup: 'TODO: where you are, where the ball is, what the defense is doing.',
      decision_moment: 'TODO: the precise body cue at the freeze.',
      visible_cue: 'TODO: the single most readable thing the player should look at.',
      best_read: `TODO: 1–2 sentence player-voice description of the best action (corresponds to template outcome "${template.choices.find((c) => c.quality === 'best')?.outcome ?? 'best'}").`,
      explanation_md: `TODO: **${template.id}.** Re-state the cue, then the decision, then the consequence. Tie back to lesson "${template.tactical.lesson_connection}".`,

      feedback: {
        correct: 'TODO: short praise that names the cue.',
        partial: 'TODO: short nudge for the acceptable read.',
        wrong: 'TODO: short coach voice that points at the cue without giving the answer.',
      },

      self_review_checklist: [
        'TODO: yes/no question about the player\'s body, not the defender\'s.',
        'TODO: yes/no about the action.',
        'TODO: yes/no about the timing.',
        'TODO: yes/no about the finish.',
      ],

      acceptable_reads: [
        `TODO: explanation of the ${template.choices.find((c) => c.quality === 'acceptable')?.outcome ?? 'acceptable'} branch.`,
      ],
      bad_reads: ['TODO: short consequence line for each wrong outcome.'],

      choices,
    },

    variation: {
      user_slot: userSlot,
      mirror: args.mirror,
      disguise: args.disguise,
      clock_pressure: args.clock,
      ...(args.difficulty !== null ? { difficulty: args.difficulty } : {}),
      overrides: { players: [], movements: [] },
    },
  }

  return skeleton
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  const { template, dir } = await loadTemplate(args.templateId)
  const skeleton = buildSkeleton(template, args)

  // Compute and report the variation signature so the author can sanity-check
  // for collisions before they spend prose time.
  const sig = variationSignature(
    {
      id: args.variantId,
      template: template.id,
      status: 'DRAFT',
      version: 1,
      copy: skeleton.copy as never,
      variation: skeleton.variation as never,
    } as never,
    template,
  )

  const outFile = args.out ?? path.join(dir, 'variants', nextVariantFileName(args))
  await fs.mkdir(path.dirname(outFile), { recursive: true })
  await fs.writeFile(outFile, JSON.stringify(skeleton, null, 2) + '\n', 'utf8')

  console.log(`scaffold-variant: wrote ${path.relative(process.cwd(), outFile)}`)
  console.log(`  template:  ${template.id}`)
  console.log(`  variant:   ${args.variantId}`)
  console.log(`  signature: ${sig}`)
  console.log(`  status:    DRAFT (replace TODO: prose, then flip to LIVE)`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
