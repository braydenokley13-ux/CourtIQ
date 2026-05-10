/**
 * Pack 2 (Phase β) — pnr-coverage-recognition Academy lesson shell
 * authoring lock.
 *
 * The Academy lesson seed schema lives in scripts/seed-lessons.ts (a
 * node-only script). Re-validating the JSON here keeps the shape
 * gated under vitest without dragging the seeder's Prisma imports
 * into the web app's test runner.
 *
 * Locks:
 *   - The lesson file exists at packages/db/seed/lessons/pnr-coverage-recognition.json.
 *   - module_slug matches the canonical "pnr-coverage-recognition"
 *     slug — DROP-01.lesson_connection points here.
 *   - Lesson body covers the five required teaching points (drop
 *     definition, visual cues, temporary space, decision menu,
 *     common mistake).
 *   - The lesson's prerequisite chain points at advantage-or-reset
 *     (DROP builds on the closeout-read decision skill).
 */

import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const LESSON_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'db',
  'seed',
  'lessons',
  'pnr-coverage-recognition.json',
)

interface LessonShape {
  module_slug: string
  title: string
  concept_id: string
  category: string
  order: number
  prerequisite_module_ids: string[]
  lesson: {
    order: number
    title: string
    body_md: string
  }
}

describe('Academy lesson shell — pnr-coverage-recognition', () => {
  it('exists and parses as JSON', async () => {
    const raw = await fs.readFile(LESSON_PATH, 'utf8')
    const parsed = JSON.parse(raw) as LessonShape
    expect(parsed.module_slug).toBe('pnr-coverage-recognition')
    expect(parsed.category).toBe('OFFENSE')
    expect(parsed.lesson.body_md.length).toBeGreaterThan(200)
  })

  it('has the canonical concept_id and slug shape', async () => {
    const raw = await fs.readFile(LESSON_PATH, 'utf8')
    const parsed = JSON.parse(raw) as LessonShape
    expect(parsed.concept_id).toBe('read_the_coverage')
    expect(/^[a-z0-9-]+$/.test(parsed.module_slug)).toBe(true)
  })

  it('chains off advantage-or-reset as a prerequisite', async () => {
    const raw = await fs.readFile(LESSON_PATH, 'utf8')
    const parsed = JSON.parse(raw) as LessonShape
    expect(parsed.prerequisite_module_ids).toContain('advantage-or-reset')
  })

  it('covers the five teaching points DROP D1/D2 expects', async () => {
    const raw = await fs.readFile(LESSON_PATH, 'utf8')
    const parsed = JSON.parse(raw) as LessonShape
    const body = parsed.lesson.body_md.toLowerCase()
    // 1. Drop coverage definition
    expect(body).toMatch(/what is drop coverage/i)
    // 2. Visual cues
    expect(body).toMatch(/visual cues|chest|foot/i)
    // 3. Temporary space / pocket
    expect(body).toMatch(/temporary space|pocket/i)
    // 4. Decision menu
    expect(body).toMatch(/pull up|snake|attack|reset/i)
    // 5. Common mistake
    expect(body).toMatch(/common.*mistake|driving directly/i)
  })

  it('orders after the founder lessons (>= 14)', async () => {
    const raw = await fs.readFile(LESSON_PATH, 'utf8')
    const parsed = JSON.parse(raw) as LessonShape
    expect(parsed.order).toBeGreaterThanOrEqual(14)
    expect(parsed.lesson.order).toBe(1)
  })

  it('matches the lesson_connection slug used by DROP-01', async () => {
    const dropPath = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'packages',
      'db',
      'seed',
      'scenarios',
      'packs',
      'pnr-coverage-v0',
      'DROP-01.json',
    )
    const dropRaw = await fs.readFile(dropPath, 'utf8')
    const dropArr = JSON.parse(dropRaw) as Array<{
      lesson_connection?: string
    }>
    expect(dropArr[0]?.lesson_connection).toBe('pnr-coverage-recognition')
  })
})
