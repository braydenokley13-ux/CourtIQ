import { analyze } from '../../queries/analytics'
import type { AnalysisResult, AnalysisStatus } from '../../queries/analytics'
import { simulate } from '../../simulation/facade'
import { COUNTERS } from './scenario'
import type { CounterId, LabConfig, ModelAssumptions } from './types'

export interface AssumptionSetting {
  id: string
  label: string
  change: Partial<ModelAssumptions>
}
export interface StressSettingOutcome {
  settingId: string
  status: AnalysisStatus
  maxWindow: number
  conflicts: number
  warnings: number
  pairedDelta: number | null
}
export interface StressRow {
  counter: CounterId
  label: string
  status: AnalysisStatus
  reason: string
  nominal: AnalysisResult
  range: { min: number; max: number }
  settingsCount: number
  outcomes: StressSettingOutcome[]
}
export interface StressReport {
  rows: StressRow[]
  settings: AssumptionSetting[]
  assumptions: ModelAssumptions
  label: string
  counts: Record<AnalysisStatus, number>
  modelVersion: string
}
export interface StressOptions {
  signal?: { readonly aborted: boolean }
  beforeConfig?: LabConfig
  onProgress?: (progress: number) => void
}

/** Finite authored sensitivity settings. Their frequencies are never odds. */
export function stressSettings(config: LabConfig): AssumptionSetting[] {
  const assumptions = config.assumptions
  const bounded = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))
  return [
    { id: 'nominal', label: 'Your assumptions', change: {} },
    {
      id: 'read-later',
      label: 'Read up to 80 ms later',
      change: { reactionDelay: bounded(assumptions.reactionDelay + 0.08, 0, 0.8) },
    },
    {
      id: 'read-earlier',
      label: 'Read 80 ms earlier',
      change: { reactionDelay: Math.max(0, assumptions.reactionDelay - 0.08) },
    },
    {
      id: 'feet-slower',
      label: 'Feet up to 10% slower',
      change: {
        maxSpeed: bounded(assumptions.maxSpeed * 0.9, 1, 8),
        acceleration: bounded(assumptions.acceleration * 0.9, 1, 15),
      },
    },
    {
      id: 'feet-faster',
      label: 'Feet up to 10% faster',
      change: {
        maxSpeed: bounded(assumptions.maxSpeed * 1.1, 1, 8),
        acceleration: bounded(assumptions.acceleration * 1.1, 1, 15),
      },
    },
    {
      id: 'pass-slower',
      label: 'Pass up to 10% slower',
      change: { passSpeed: bounded(assumptions.passSpeed * 0.9, 5, 20) },
    },
    {
      id: 'pass-faster',
      label: 'Pass up to 10% faster',
      change: { passSpeed: bounded(assumptions.passSpeed * 1.1, 5, 20) },
    },
  ]
}

function maximumWindow(analysis: AnalysisResult) {
  return Math.max(0, ...analysis.windows.map((window) => window.duration))
}
function settingConfig(config: LabConfig, setting: AssumptionSetting, counter: CounterId): LabConfig {
  return {
    ...config,
    counter,
    answer: { ...config.answer },
    assumptions: { ...config.assumptions, ...setting.change },
    interventions: config.interventions.map((intervention) => ({ ...intervention })),
  }
}

function makeRow(
  counter: CounterId,
  label: string,
  analyses: AnalysisResult[],
  outcomes: StressSettingOutcome[],
): StressRow {
  const everyHolds = outcomes.every((outcome) => outcome.status === 'holds')
  const everyBreaks = outcomes.every((outcome) => outcome.status === 'breaks')
  const status: AnalysisStatus = everyHolds ? 'holds' : everyBreaks ? 'breaks' : 'thin'
  const breaks = outcomes.filter((outcome) => outcome.status === 'breaks').length
  const warnings = outcomes.some((outcome) => outcome.warnings > 0)
  const reason = warnings
    ? 'Inspect flight/catch/movement diagnostics; this branch remains assumption-sensitive.'
    : everyHolds
      ? 'No actionable opening persists in the inspected movement, read and pass settings.'
      : everyBreaks
        ? analyses[0].explanation
        : `${breaks} of ${outcomes.length} inspected settings retain an exposure; the answer depends on execution assumptions.`
  return {
    counter,
    label,
    status,
    reason,
    nominal: analyses[0],
    range: {
      min: Math.min(...outcomes.map((outcome) => outcome.maxWindow)),
      max: Math.max(...outcomes.map((outcome) => outcome.maxWindow)),
    },
    settingsCount: outcomes.length,
    outcomes,
  }
}

function makeReport(config: LabConfig, rows: StressRow[], settings: AssumptionSetting[]): StressReport {
  return {
    rows,
    settings,
    assumptions: { ...config.assumptions },
    label:
      'Connected counter replays under seven deterministic assumption settings. Counts describe inspected settings, not success probabilities. Paired comparisons use the same settings for each answer.',
    counts: {
      holds: rows.filter((row) => row.status === 'holds').length,
      thin: rows.filter((row) => row.status === 'thin').length,
      breaks: rows.filter((row) => row.status === 'breaks').length,
    },
    modelVersion: rows[0]?.nominal.modelVersion ?? 'unknown',
  }
}

/** All rows replay the same coupled model; coverage never selects a verdict. */
export function stress(
  config: LabConfig,
  beforeConfig?: LabConfig,
  onProgress?: (progress: number) => void,
): StressReport {
  const settings = stressSettings(config)
  const counters = COUNTERS.filter((counter) => counter.id !== 'auto')
  let complete = 0
  const rows = counters.map((counter) => {
    const analyses: AnalysisResult[] = []
    const outcomes = settings.map((setting) => {
      const analysis = analyze(simulate(settingConfig(config, setting, counter.id)))
      analyses.push(analysis)
      const paired = beforeConfig ? analyze(simulate(settingConfig(beforeConfig, setting, counter.id))) : null
      onProgress?.(++complete / (counters.length * settings.length))
      return {
        settingId: setting.id,
        status: analysis.classification,
        maxWindow: maximumWindow(analysis),
        conflicts: analysis.conflicts.length,
        warnings: analysis.warnings.length,
        pairedDelta: paired ? maximumWindow(analysis) - maximumWindow(paired) : null,
      }
    })
    return makeRow(counter.id, counter.label, analyses, outcomes)
  })
  return makeReport(config, rows, settings)
}

function abortError() {
  return Object.assign(new Error('Stress analysis canceled.'), { name: 'AbortError' })
}

export async function stressYielding(
  config: LabConfig,
  options: StressOptions,
  yieldTurn: () => Promise<void> = () => Promise.resolve(),
): Promise<StressReport> {
  const settings = stressSettings(config)
  const counters = COUNTERS.filter((counter) => counter.id !== 'auto')
  const rows: StressRow[] = []
  let complete = 0
  for (const counter of counters) {
    const analyses: AnalysisResult[] = []
    const outcomes: StressSettingOutcome[] = []
    for (const setting of settings) {
      if (options.signal?.aborted) throw abortError()
      const analysis = analyze(simulate(settingConfig(config, setting, counter.id)))
      analyses.push(analysis)
      const paired = options.beforeConfig
        ? analyze(simulate(settingConfig(options.beforeConfig, setting, counter.id)))
        : null
      outcomes.push({
        settingId: setting.id,
        status: analysis.classification,
        maxWindow: maximumWindow(analysis),
        conflicts: analysis.conflicts.length,
        warnings: analysis.warnings.length,
        pairedDelta: paired ? maximumWindow(analysis) - maximumWindow(paired) : null,
      })
      options.onProgress?.(++complete / (counters.length * settings.length))
      await yieldTurn()
    }
    rows.push(makeRow(counter.id, counter.label, analyses, outcomes))
  }
  return makeReport(config, rows, settings)
}
