/**
 * Pack 2 §3.3 — Prose-bank scaffolder.
 *
 * Generates a starter `prose-bank.json` for a template. The generated
 * file is a STARTER, not a finished bank — the author edits the
 * skeletons, fills slot values per variant, and re-runs the lint.
 *
 * Usage
 * -----
 *   pnpm templates:prose-bank <template-id>
 *   # writes packages/db/seed/scenarios/templates/<id>/prose-bank.json
 *
 * Architecture
 * ------------
 *   - Pure data flow: read template.json → emit prose-bank.json with
 *     placeholder skeletons referencing canonical slot identifiers.
 *   - Idempotent: refuses to overwrite an existing prose-bank.json
 *     unless `--force` is passed. The author's hand-tuned bank is the
 *     source of truth once it exists.
 *   - Deterministic: same template input → same prose-bank output.
 *     No timestamps in the file, no random-id generation.
 *   - Lint-ready: every emitted skeleton uses only slots from
 *     PROSE_BANK_SLOT_IDS. The schema's superRefine catches typos at
 *     parse time; this scaffolder ensures there are none on emission.
 *
 * Future AI-assist hook
 * ---------------------
 * When AI prose drafting lands, the scaffolder gains a `--draft` mode
 * that fills in default skeletons per decoder family. The slot
 * vocabulary stays unchanged so the AI just emits more skeletons; the
 * shape of this file does not need to grow.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  proseBankSchema,
  templateSchema,
  type ProseBank,
} from '../packages/db/seed/scenarios/templates/_schema'

const TEMPLATES_DIR = path.join(
  process.cwd(),
  'packages',
  'db',
  'seed',
  'scenarios',
  'templates',
)

interface CliArgs {
  templateId: string
  force: boolean
}

function usage(): never {
  console.error(
    'Usage:  pnpm templates:prose-bank <template-id> [--force]',
  )
  process.exit(2)
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2)
  const templateId = args.find((a) => !a.startsWith('--'))
  if (!templateId) usage()
  const force = args.includes('--force')
  return { templateId, force }
}

/**
 * Per-quality starter skeletons. Each skeleton uses canonical slots
 * from `PROSE_BANK_SLOT_IDS`. The skeletons here are intentionally
 * generic — they apply across decoders and are safe defaults; the
 * author replaces them with decoder-specific phrasings when they edit
 * the bank.
 */
const STARTER_SKELETONS = {
  best: {
    encouraging: [
      'Good read. He {cue_atom_short_desc}, so {action_short_desc}.',
      'Right. {cue_atom_short_desc} = {action_short_desc}.',
      'Yes. {decoder_micro_explainer}',
    ],
    neutral: [
      '{cue_atom_short_desc}; {action_short_desc}.',
      '{decoder_micro_explainer}',
    ],
    corrective: [
      'Better next time, but yes — {cue_atom_short_desc}, so {action_short_desc}.',
    ],
  },
  acceptable: {
    encouraging: [
      'OK. You kept the play alive, but the better read was {action_short_desc}.',
      "Not bad. {partial_choice_short_desc} works; {action_short_desc} was higher EV.",
    ],
    neutral: [
      '{partial_choice_short_desc} is fine. The higher-EV read was {action_short_desc}.',
    ],
    corrective: [
      'You missed a tighter read. {cue_atom_short_desc} → {action_short_desc}.',
    ],
  },
  wrong: {
    encouraging: [],
    neutral: [
      '{wrong_choice_short_desc} loses the advantage. {decoder_micro_explainer}',
    ],
    corrective: [
      'Wrong read — {cue_atom_short_desc}, not {wrong_choice_short_desc}.',
      "{wrong_choice_short_desc} doesn't punish the cue; {action_short_desc} does.",
    ],
  },
} as const

function buildStarterBank(templateId: string): ProseBank {
  const entries: ProseBank['entries'] = []
  for (const quality of ['best', 'acceptable', 'wrong'] as const) {
    for (const tone of ['encouraging', 'neutral', 'corrective'] as const) {
      const skeletons = STARTER_SKELETONS[quality][tone]
      if (skeletons.length === 0) continue
      entries.push({ quality, tone, skeletons: [...skeletons] })
    }
  }
  return { template: templateId, version: 1, entries }
}

async function main(): Promise<void> {
  const { templateId, force } = parseArgs(process.argv)
  const dir = path.join(TEMPLATES_DIR, templateId)
  const templatePath = path.join(dir, 'template.json')
  const bankPath = path.join(dir, 'prose-bank.json')

  // Validate the template parses before emitting a bank — this catches
  // a typo'd template-id ahead of writing a stray file.
  const tplRaw = await fs.readFile(templatePath, 'utf8').catch(() => null)
  if (!tplRaw) {
    console.error(`No template.json found at ${templatePath}`)
    process.exit(1)
  }
  templateSchema.parse(JSON.parse(tplRaw))

  // Refuse to overwrite without --force. The bank is hand-tuned once
  // an author starts filling slots; clobbering it would silently
  // discard work.
  const exists = await fs
    .stat(bankPath)
    .then(() => true)
    .catch(() => false)
  if (exists && !force) {
    console.error(
      `Refusing to overwrite ${bankPath}. Pass --force to regenerate.`,
    )
    process.exit(1)
  }

  const bank = buildStarterBank(templateId)
  // Validate the generated bank — the scaffolder must never emit a
  // file the schema would reject. Catches a slot-name regression in
  // STARTER_SKELETONS at scaffold time, not at parse time later.
  proseBankSchema.parse(bank)

  // Deterministic JSON: stable key order via JSON.stringify with
  // explicit indent; no Date.now in payload.
  await fs.writeFile(bankPath, JSON.stringify(bank, null, 2) + '\n', 'utf8')
  console.log(`scaffold-prose-bank: wrote ${bankPath}`)
  console.log(`  ${bank.entries.length} entries (quality × tone)`)
  console.log(
    '  Next: edit the skeletons to fit the template, then start filling slot',
  )
  console.log('  values per variant.')
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
