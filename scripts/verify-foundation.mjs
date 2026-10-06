#!/usr/bin/env node
/**
 * Golden-path browser QA for the local-first CourtIQ foundation.
 *
 * Run against the root-owned production server:
 *   BASE_URL=http://localhost:3000 node scripts/verify-foundation.mjs
 *
 * Artifacts default to /tmp/courtiq-qa (override with QA_ARTIFACT_DIR).
 * Browser traces are deliberately
 * disabled because they can contain user-entered program information.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const QA_ACCESS_URL = process.env.QA_ACCESS_URL
const QA_FROM_IMPORT_FILE = process.env.QA_FROM_IMPORT_FILE
const QA_SKIP_IMPORTED_TEACH = process.env.QA_SKIP_IMPORTED_TEACH === '1'
const ARTIFACT_DIR = path.resolve(process.env.QA_ARTIFACT_DIR ?? '/tmp/courtiq-qa')
const QA_ROUTE_MODE = process.env.QA_ROUTE_MODE ?? 'skip'
const QA_ALLOW_DEV_RETIRED_ROUTES = process.env.QA_ALLOW_DEV_RETIRED_ROUTES === '1'
const QA_IGNORE_HTTPS_ERRORS = process.env.QA_IGNORE_HTTPS_ERRORS === '1'
const QA_QUALITY = process.env.QA_QUALITY
const VIEWPORT = {
  width: Number(process.env.QA_VIEWPORT_WIDTH ?? 1440),
  height: Number(process.env.QA_VIEWPORT_HEIGHT ?? 1024),
}
const TIMEOUT = Number(process.env.QA_TIMEOUT ?? 30_000)
const PLAYBACK_TIMEOUT = Number(process.env.QA_PLAYBACK_TIMEOUT ?? 180_000)

const errors = []
const failedAssets = []
const expectedNavigationAborts = []
const backendRequests = []
const steps = []
let currentStep = null
let intentionalNavigationTarget = null
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}
const step = async (name, action) => {
  const startedAt = new Date().toISOString()
  currentStep = name
  await action()
  steps.push({ name, completedAt: new Date().toISOString(), startedAt })
  currentStep = null
  console.log(`✓ ${name}`)
}
const nameRx = (value) => new RegExp(value, 'i')
const safeUrl = (raw) => {
  try {
    const url = new URL(raw)
    return `${url.origin}${url.pathname}`
  } catch {
    return '[invalid URL]'
  }
}
function sanitizeText(value) {
  let text = String(value ?? '')
  if (QA_ACCESS_URL) text = text.replaceAll(QA_ACCESS_URL, '[protected access URL]')
  return text
    .replace(/https?:\/\/[^\s)'"<>]+/g, (match) => safeUrl(match))
    .replace(/^\s*cookie:\s*.*$/gim, 'cookie: [redacted]')
    .replace(/((_vercel_jwt|_vercel_share|access_token|id_token|refresh_token)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-token]')
    .replace(/((?:token|secret|password|authorization|api[_-]?key)=)[^&\s]+/gi, '$1[redacted]')
}
function sanitizedDiagnostics() {
  return {
    backendRequests: backendRequests.map((request) => ({ ...request, url: safeUrl(request.url) })),
    failedAssets: failedAssets.map((asset) => ({ ...asset, url: safeUrl(asset.url) })),
    expectedNavigationAborts: expectedNavigationAborts.map((asset) => ({
      ...asset,
      url: safeUrl(asset.url),
    })),
    browserErrors: errors.map((error) => ({ ...error, text: sanitizeText(error.text) })),
  }
}
async function runtimeInfo(page) {
  return {
    viewport: VIEWPORT,
    requestedQuality: QA_QUALITY ?? 'device default',
    ignoreHttpsErrors: QA_IGNORE_HTTPS_ERRORS,
    actualQuality: await page
      .locator('[data-quality]')
      .getAttribute('data-quality')
      .catch(() => null),
  }
}
function screenshotNames() {
  return QA_FROM_IMPORT_FILE
    ? [
        ...(!QA_SKIP_IMPORTED_TEACH ? ['teach-first-read.png'] : []),
        'final-system.png',
        'restored-system.png',
        'library-answer-run.png',
      ]
    : [
        'lab-world-xray.png',
        'teach-first-read.png',
        'final-system.png',
        'restored-system.png',
        'library-answer-run.png',
      ]
}

async function button(page, name) {
  const target = page.getByRole('button', { name: typeof name === 'string' ? nameRx(name) : name }).first()
  await target.waitFor({ state: 'visible', timeout: TIMEOUT })
  return target
}

async function clickWhenEnabled(locator, timeout = TIMEOUT) {
  const until = Date.now() + timeout
  await locator.waitFor({ state: 'visible', timeout })
  while (!(await locator.isEnabled())) {
    if (Date.now() >= until) throw new Error('Expected action stayed disabled past its timeout')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  await locator.click()
}

async function waitForLabResult(page) {
  await page.getByRole('button', { name: /Run it/i }).waitFor({ state: 'visible', timeout: TIMEOUT })
  await page.getByRole('button', { name: /Break my defense/i }).waitFor({ state: 'visible', timeout: TIMEOUT })
  await page.getByRole('button', { name: /^Save$/i }).waitFor({ state: 'visible', timeout: TIMEOUT })
  await page.waitForFunction(
    () => {
      const text = document.body.innerText
      return /Here’s the problem|Here's the problem|It held|Nobody got open|No window opened|What changed|New problem/i.test(
        text,
      )
    },
    null,
    { timeout: PLAYBACK_TIMEOUT },
  )
}

async function waitForBreakCompletion(page) {
  await page
    .getByRole('status')
    .filter({ hasText: /Attacking your defense/i })
    .waitFor({ state: 'visible', timeout: TIMEOUT })
  await page.waitForFunction(
    () => /They broke it|CourtIQ couldn’t break it|CourtIQ couldn't break it/i.test(document.body.innerText),
    null,
    { timeout: 180_000 },
  )
}

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true })
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
  })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    acceptDownloads: true,
    ignoreHTTPSErrors: QA_IGNORE_HTTPS_ERRORS,
  })
  if (QA_ACCESS_URL) {
    const bootstrap = await context.newPage()
    bootstrap.setDefaultTimeout(TIMEOUT)
    try {
      const access = new URL(QA_ACCESS_URL)
      assert(access.protocol === 'https:' || access.protocol === 'http:', 'QA_ACCESS_URL must use HTTP or HTTPS')
      await bootstrap.goto(access.href, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
    } catch (error) {
      const detail = error instanceof Error ? error.name : 'UnknownError'
      await context.close()
      await browser.close()
      throw new Error(`Protected deployment access bootstrap failed (${detail}); the access URL was not recorded.`)
    }
    await bootstrap.close()
  }
  const page = await context.newPage()
  page.setDefaultTimeout(TIMEOUT)
  const navigate = async (url) => {
    intentionalNavigationTarget = new URL(url).pathname
    try {
      return await page.goto(url, { waitUntil: 'domcontentloaded' })
    } finally {
      intentionalNavigationTarget = null
    }
  }
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push({ type: 'console', text: message.text() })
  })
  page.on('pageerror', (error) => errors.push({ type: 'pageerror', text: error.message }))
  page.on('requestfailed', (request) => {
    const url = request.url()
    const errorText = request.failure()?.errorText
    if (
      errorText === 'net::ERR_ABORTED' &&
      intentionalNavigationTarget &&
      new URL(url).origin === new URL(BASE_URL).origin
    ) {
      expectedNavigationAborts.push({ url, duringNavigationTo: intentionalNavigationTarget, error: errorText })
    } else if (/\.(?:js|css|woff2?|ttf|otf|png|jpe?g|webp|svg|glb|gltf)(?:\?|$)/i.test(url)) {
      failedAssets.push({ url, error: request.failure()?.errorText })
    }
  })
  page.on('response', (response) => {
    if (
      response.status() >= 400 &&
      /\.(?:js|css|woff2?|ttf|otf|png|jpe?g|webp|svg|glb|gltf)(?:\?|$)/i.test(response.url())
    ) {
      failedAssets.push({ url: response.url(), status: response.status() })
    }
  })
  page.on('request', (request) => {
    const url = new URL(request.url())
    const baseOrigin = new URL(BASE_URL).origin
    const unsafeMethod = !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
    if (
      url.origin !== baseOrigin ||
      unsafeMethod ||
      /^\/api(?:\/|$)/.test(url.pathname) ||
      /^\/trpc(?:\/|$)/.test(url.pathname) ||
      /^\/graphql(?:\/|$)/.test(url.pathname)
    ) {
      backendRequests.push({ method: request.method(), url: request.url() })
    }
  })

  try {
    await step('Check root content and open the /lab route', async () => {
      const rootResponse = await navigate(new URL('/', BASE_URL).toString())
      assert(rootResponse && rootResponse.status() === 200, `GET / returned ${rootResponse?.status() ?? 'no response'}`)
      await page
        .getByRole('heading', { name: /What are you working on\?/i })
        .waitFor({ state: 'visible', timeout: TIMEOUT })
      assert((await page.getByText(/CourtIQ/i).count()) > 0, 'The root route did not render the CourtIQ app')
      const labUrl = new URL('/lab', BASE_URL)
      if (QA_QUALITY) labUrl.searchParams.set('quality', QA_QUALITY)
      const response = await navigate(labUrl.toString())
      assert(response && response.status() === 200, `GET /lab returned ${response?.status() ?? 'no response'}`)
      await page
        .getByRole('heading', { name: /What are you working on\?/i })
        .waitFor({ state: 'visible', timeout: TIMEOUT })
    })

    if (!['skip', 'production', 'development'].includes(QA_ROUTE_MODE))
      throw new Error('QA_ROUTE_MODE must be skip, development, or production')
    const shouldCheckRetired =
      QA_ROUTE_MODE === 'production' || (QA_ROUTE_MODE === 'development' && QA_ALLOW_DEV_RETIRED_ROUTES)
    if (shouldCheckRetired)
      await step('Verify retired routes return 404', async () => {
        const retiredRoutes = [
          '/login',
          '/home',
          '/train',
          '/academy',
          '/daily',
          '/settings',
          '/leaderboard',
          '/onboarding',
          '/pathways',
          '/design-system',
        ]
        for (const route of retiredRoutes) {
          // Probe through Chromium so protected-preview cookies and its network
          // configuration apply, without navigating the GPU-backed Lab page.
          const status = await page.evaluate(async (path) => {
            const response = await fetch(path, { credentials: 'include', redirect: 'manual' })
            return response.status
          }, route)
          assert(
            status === 404,
            `Retired route ${route} returned ${status}, expected 404`,
          )
        }
      })

    const answerName = 'QA Foundation Answer'
    if (QA_FROM_IMPORT_FILE) {
      await step('Seed an ordinary browser context through CourtIQ Import', async () => {
        await page
          .getByRole('button', { name: /Our System/i })
          .first()
          .click()
        await page.getByRole('button', { name: /Import program/i }).click()
        await page.getByLabel('Import CourtIQ program JSON').setInputFiles(QA_FROM_IMPORT_FILE)
        await page
          .getByRole('status')
          .filter({ hasText: /Program imported and saved on this device/i })
          .waitFor({ state: 'visible', timeout: TIMEOUT })
        await page.getByRole('button', { name: new RegExp(answerName, 'i') }).waitFor({ state: 'visible' })
      })
    } else {
      await step('Choose a situation, a goal, and a defensive answer', async () => {
        await page
          .getByRole('button', { name: /ball screen|pick.?and.?roll/i })
          .first()
          .click()
        await page.getByRole('heading', { name: /What are you trying to stop\?/i }).waitFor({ state: 'visible' })
        await page
          .getByRole('button')
          .filter({ has: page.locator('strong') })
          .first()
          .click()
        await page
          .locator('button')
          .filter({ has: page.locator('h3') })
          .first()
          .click()
        await page.getByRole('heading', { name: /What does your team call it\?/i }).waitFor({ state: 'visible' })
        await page.getByRole('button', { name: /Doesn’t matter|Doesn't matter.*run it/i }).click()
        await waitForLabResult(page)
      })

      await step('Inspect the play through X-Ray', async () => {
        const toolbar = page.getByRole('toolbar', { name: /How to look at the play/i })
        await toolbar.getByRole('button', { name: /Responsibilities|Who has who/i }).click()
        await toolbar.getByRole('button', { name: /Reach in time|Who can get there/i }).click()
        await toolbar.getByRole('button', { name: /Game view/i }).click()
      })

      await step('Change one defender responsibility and rerun the possession', async () => {
        // The situation pills are accessible buttons; selecting the helper opens its coach controls.
        await page.getByRole('button', { name: /Helper:|Low-man:|low man/i }).click()
        const coach = page.getByRole('dialog', { name: /Coach/i })
        await coach.waitFor({ state: 'visible', timeout: TIMEOUT })
        const noHelp = coach.getByRole('button', { name: /No, stay home|No tag/i }).first()
        const helping = coach.getByRole('button', { name: /Yes, help|Tag/i }).first()
        const selected = await noHelp.getAttribute('aria-pressed')
        if (selected === 'true') await helping.click()
        else await noHelp.click()
        await coach.getByRole('button', { name: /Close/i }).click()
        await page.getByRole('button', { name: /Run it/i }).click()
        await waitForLabResult(page)
      })

      await step('Break the changed defense and inspect the counter', async () => {
        const breakButton = await button(page, /Break my defense/i)
        await breakButton.click()
        await waitForBreakCompletion(page)
        await page
          .getByRole('dialog', { name: /They broke it/i })
          .waitFor({ state: 'visible', timeout: TIMEOUT })
          .catch(async () => {
            await page
              .getByText(/CourtIQ couldn’t break it|CourtIQ couldn't break it/i)
              .waitFor({ state: 'visible', timeout: TIMEOUT })
          })
      })

      await step('Adopt the discovered offense, apply a fix, and rebreak the defense', async () => {
        const fixed = page.getByRole('button', { name: /Fix it/i })
        assert(
          await fixed.isVisible().catch(() => false),
          'Break Mode found no usable counter, so there is no offense to fix',
        )
        await fixed.click()
        const fixes = page.getByRole('dialog', { name: /Fixes/i })
        await fixes.waitFor({ state: 'visible', timeout: TIMEOUT })
        await fixes
          .getByRole('button')
          .filter({ has: page.locator('strong') })
          .first()
          .click()
        await page.getByRole('dialog', { name: /What changed/i }).waitFor({ state: 'visible', timeout: TIMEOUT })
        await page.getByRole('button', { name: /Break my defense/i }).click()
        await waitForBreakCompletion(page)
        await page.getByRole('button', { name: /Back to my defense/i }).click()
      })

      await step('Rerun and compare the fix against the discovered counter', async () => {
        await page.getByRole('button', { name: /Run it/i }).click()
        await page.getByRole('dialog', { name: /What changed/i }).waitFor({ state: 'visible', timeout: TIMEOUT })
      })

      await step('Capture the Lab world with an X-Ray layer visible', async () => {
        const toolbar = page.getByRole('toolbar', { name: /How to look at the play/i })
        await toolbar.getByRole('button', { name: /Open passes|Passing windows/i }).click()
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'lab-world-xray.png'), fullPage: true })
      })
    }

    if (!QA_FROM_IMPORT_FILE || !QA_SKIP_IMPORTED_TEACH)
      await step(
        QA_FROM_IMPORT_FILE ? 'Teach the imported accepted answer' : 'Save an answer and enter Teach',
        async () => {
          if (!QA_FROM_IMPORT_FILE) {
            await page.getByRole('button', { name: /Save/i }).last().click()
            const dialog = page.getByRole('dialog', { name: /Save as our answer/i })
            await dialog.waitFor({ state: 'visible', timeout: TIMEOUT })
            await dialog.getByLabel(/What do you call it\?/i).fill(answerName)
            const addNote = dialog.getByRole('button', { name: /Add a note/i })
            if (await addNote.isVisible().catch(() => false)) await addNote.click()
            const note = dialog.getByLabel(/Anything to remember/i)
            if (await note.isVisible().catch(() => false)) await note.fill('Foundation QA note')
            await clickWhenEnabled(dialog.getByRole('button', { name: /Save and show the players/i }))
          }
          await page.getByRole('button', { name: /^Teach$/i }).click()
          await page
            .getByText(new RegExp(`${answerName}.*version 1`, 'i'))
            .waitFor({ state: 'visible', timeout: TIMEOUT })
          const player = page.getByRole('button', { name: /helper under the basket|low man/i }).first()
          await player.waitFor({ state: 'visible', timeout: TIMEOUT })
          await player.click()
          assert((await player.getAttribute('aria-pressed')) === 'true', 'Teach did not select the helper role')
          const view = page.getByRole('button', { name: /Through his eyes/i })
          await view.click()
          assert((await view.getAttribute('aria-pressed')) === 'true', 'Teach did not switch to the player view')
          // The read card starts paused at 0.0s. Start playback first; a visible
          // “Next read” checkpoint proves the teaching playback advanced.
          await page.getByRole('button', { name: /^Start$/i }).click()
          const nextRead = page.getByRole('button', { name: /Next read/i })
          const possessionDone = page.getByText(/That’s the possession|That's the possession/i)
          await Promise.race([
            nextRead.waitFor({ state: 'visible', timeout: PLAYBACK_TIMEOUT }),
            possessionDone.waitFor({ state: 'visible', timeout: PLAYBACK_TIMEOUT }),
          ])
          if (await nextRead.isVisible().catch(() => false)) {
            const readLabel = page.getByText(/Read \d+ of \d+ · [\d.]+ s/i)
            const currentRead = (await readLabel.textContent())?.match(/Read (\d+) of/i)
            assert(currentRead, 'Teach reached a Next read control without a visible checkpoint index')
            const previousReadIndex = Number(currentRead[1])
            await nextRead.click()
            await page.waitForFunction(
              (previousIndex) => {
                const text = document.body.innerText
                const match = text.match(/Read (\d+) of \d+/i)
                return (
                  (match && Number(match[1]) > previousIndex) ||
                  /That’s the possession|That's the possession/i.test(text)
                )
              },
              previousReadIndex,
              { timeout: TIMEOUT },
            )
          }
          await page.screenshot({ path: path.join(ARTIFACT_DIR, 'teach-first-read.png'), fullPage: true })
        },
      )

    await step('Open Our System and update the saved answer to version 2', async () => {
      await page
        .getByRole('button', { name: /Our System/i })
        .first()
        .click()
      await page
        .getByRole('heading', { name: /How .* plays? defense/i })
        .waitFor({ state: 'visible', timeout: TIMEOUT })
      await page.getByRole('button', { name: new RegExp(answerName, 'i') }).click()
      const open = page.getByRole('button', { name: /Open in Lab/i })
      await open.click()
      await waitForLabResult(page)
      await page.getByRole('button', { name: /Save/i }).last().click()
      const dialog = page.getByRole('dialog', { name: /Save as our answer/i })
      await dialog.getByLabel(/What do you call it\?/i).fill(answerName)
      await clickWhenEnabled(dialog.getByRole('button', { name: /Update .*version 2/i }))
      await page
        .getByRole('status')
        .filter({ hasText: /Updated .*version 2/i })
        .waitFor({ state: 'visible', timeout: TIMEOUT })
      await page
        .getByRole('button', { name: /Our System/i })
        .first()
        .click()
      await page.getByRole('button', { name: new RegExp(answerName, 'i') }).click()
      await page.getByText(/v2/).first().waitFor({ state: 'visible', timeout: TIMEOUT })
    })

    await step('Change program name, terminology, and wording preferences', async () => {
      const program = page.getByLabel(/Program name/i)
      await program.fill('QA Wildcats')
      await program.press('Tab')
      await page
        .getByRole('heading', { name: /How QA Wildcats plays? defense/i })
        .waitFor({ state: 'visible', timeout: TIMEOUT })
      const wordsTab = page
        .locator('nav')
        .filter({ hasText: /Our defense/i })
        .getByRole('button', { name: /Our words/i })
      await wordsTab.click()
      const termField = page.getByRole('textbox', { name: /Our word for drop/i })
      await termField.fill('Blue QA drop')
      await termField.press('Tab')
      const simpleWords = page.getByRole('button', { name: /Simple words/i })
      assert(await simpleWords.isVisible().catch(() => false), 'Simple words preference control missing')
      await simpleWords.click()
      const simpleClass = await simpleWords.getAttribute('class')
      await page
        .getByRole('button', { name: /Our System/i })
        .first()
        .click()
      await page
        .getByRole('heading', { name: /How QA Wildcats plays? defense/i })
        .waitFor({ state: 'visible', timeout: TIMEOUT })
      await page
        .locator('nav')
        .filter({ hasText: /Our defense/i })
        .getByRole('button', { name: /Our defense/i })
        .click()
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'final-system.png'), fullPage: true })
      page.__qaSimpleClass = simpleClass
    })

    await step('Reload and verify local persistence', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page
        .getByRole('button', { name: /Our System/i })
        .first()
        .click()
      await page
        .getByRole('heading', { name: /How QA Wildcats plays? defense/i })
        .waitFor({ state: 'visible', timeout: TIMEOUT })
      await page
        .getByRole('button', { name: new RegExp(answerName, 'i') })
        .waitFor({ state: 'visible', timeout: TIMEOUT })
      await page.getByText(/v2/).first().waitFor({ state: 'visible', timeout: TIMEOUT })
      await page
        .locator('nav')
        .filter({ hasText: /Our defense/i })
        .getByRole('button', { name: /Our words/i })
        .click()
      assert(
        (await page.getByRole('textbox', { name: /Our word for drop/i }).inputValue()) === 'Blue QA drop',
        'Custom term did not survive reload',
      )
      const language = page.getByRole('group', { name: /Language/i })
      assert(
        (await language.getByRole('button', { name: /Simple words/i }).getAttribute('class')) === page.__qaSimpleClass,
        'Wording preference did not survive reload',
      )
    })

    await step('Reopen the persisted version 2 answer in the Lab after reload', async () => {
      await page
        .locator('nav')
        .filter({ hasText: /Our defense/i })
        .getByRole('button', { name: /Our defense/i })
        .click()
      await page.getByRole('button', { name: new RegExp(answerName, 'i') }).click()
      await page.getByRole('button', { name: /Open in Lab/i }).click()
      await waitForLabResult(page)
      await page
        .getByRole('button', { name: /Our System/i })
        .first()
        .click()
      await page
        .locator('nav')
        .filter({ hasText: /Our defense/i })
        .getByRole('button', { name: /Our defense/i })
        .click()
    })

    await step('Export, clear through the interface, then restore the exported system', async () => {
      const exportButton = page.getByRole('button', { name: /Export program/i }).first()
      await exportButton.waitFor({ state: 'visible', timeout: TIMEOUT })
      const downloadPromise = page.waitForEvent('download')
      await clickWhenEnabled(exportButton)
      const download = await downloadPromise
      const exportPath = path.join(ARTIFACT_DIR, download.suggestedFilename() || 'courtiq-export.json')
      await download.saveAs(exportPath)
      const payload = JSON.parse(await readFile(exportPath, 'utf8'))
      assert(payload && typeof payload === 'object', 'Export did not produce a JSON object')
      assert(JSON.stringify(payload).includes(answerName), 'Export omitted the saved answer')

      // Invalid user files must be rejected without replacing working local data.
      const invalidPath = path.join(ARTIFACT_DIR, 'invalid-import.json')
      await writeFile(invalidPath, '{"schemaVersion":999,"program":null}')
      await page.getByRole('button', { name: /Import program/i }).click()
      const fileInput = page.getByLabel('Import CourtIQ program JSON')
      await fileInput.setInputFiles(invalidPath)
      await page
        .getByRole('status')
        .filter({ hasText: /Import did not change your program/i })
        .waitFor({ state: 'visible', timeout: TIMEOUT })
      await page
        .locator('nav')
        .filter({ hasText: /Our defense/i })
        .getByRole('button', { name: /Our defense/i })
        .click()
      await page
        .getByRole('button', { name: new RegExp(answerName, 'i') })
        .waitFor({ state: 'visible', timeout: TIMEOUT })
      await page.getByText(/v2/).first().waitFor({ state: 'visible', timeout: TIMEOUT })

      const clear = page.getByRole('button', { name: /Clear this device/i }).first()
      await clickWhenEnabled(clear)
      await clickWhenEnabled(page.getByRole('button', { name: /Clear program/i }))
      await page
        .locator('nav')
        .filter({ hasText: /Our defense/i })
        .getByRole('button', { name: /Our defense/i })
        .click()
      await page.waitForFunction(() => /Nothing saved yet|Our program/i.test(document.body.innerText), null, {
        timeout: TIMEOUT,
      })
      await page
        .getByRole('button', { name: new RegExp(answerName, 'i') })
        .waitFor({ state: 'hidden', timeout: TIMEOUT })
      const importButton = page.getByRole('button', { name: /Import program/i }).first()
      await importButton.click()
      await fileInput.setInputFiles(exportPath)
      await page
        .getByRole('status')
        .filter({ hasText: /Program imported and saved on this device/i })
        .waitFor({ state: 'visible', timeout: TIMEOUT })
      await page
        .getByRole('heading', { name: /How QA Wildcats plays? defense/i })
        .waitFor({ state: 'visible', timeout: TIMEOUT })
      await page
        .getByRole('button', { name: new RegExp(answerName, 'i') })
        .waitFor({ state: 'visible', timeout: TIMEOUT })
      await page
        .locator('nav')
        .filter({ hasText: /Our defense/i })
        .getByRole('button', { name: /Our defense/i })
        .click()
      await page.getByText(/v2/).first().waitFor({ state: 'visible', timeout: TIMEOUT })
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'restored-system.png'), fullPage: true })
    })

    await step('Open the executable Library and run an answer preset', async () => {
      await page.getByRole('button', { name: /Library/i }).click()
      await page.getByRole('heading', { name: /Real problems\. Real answers\./i }).waitFor({
        state: 'visible',
        timeout: TIMEOUT,
      })
      await page.getByRole('button', { name: /^Problems$/i }).click()
      await page
        .getByText(/Runs today/i)
        .first()
        .waitFor({ state: 'visible', timeout: TIMEOUT })
      await page.getByRole('button', { name: /^Answers$/i }).click()
      const executableAnswer = page.getByRole('button', { name: /Run it in the Lab/i }).first()
      await executableAnswer.waitFor({ state: 'visible', timeout: TIMEOUT })
      await executableAnswer.click()
      await waitForLabResult(page)
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'library-answer-run.png'), fullPage: true })
    })

    assert(backendRequests.length === 0, 'Unexpected API/backend or cross-origin requests were detected')
    assert(failedAssets.length === 0, 'Asset load failures were detected')
    assert(errors.length === 0, 'Browser console or page errors were detected')
    const report = {
      baseUrl: safeUrl(BASE_URL),
      route: '/lab',
      protectedBootstrap: Boolean(QA_ACCESS_URL),
      routeMode: QA_ROUTE_MODE,
      runMode: QA_FROM_IMPORT_FILE ? 'imported-system-shakedown' : 'full-golden-path',
      ...(await runtimeInfo(page)),
      steps,
      ...sanitizedDiagnostics(),
      screenshots: screenshotNames().map((file) => path.join(ARTIFACT_DIR, file)),
    }
    await writeFile(path.join(ARTIFACT_DIR, 'report.json'), JSON.stringify(report, null, 2))
    console.log(`PASS — ${steps.length} browser flow stages; no backend API calls, browser errors, or failed assets.`)
    console.log(`Artifacts: ${ARTIFACT_DIR}`)
  } catch (error) {
    try {
      if (!page.isClosed())
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'failure.png'), fullPage: true, timeout: 10_000 })
    } catch {
      /* Preserve diagnostics even if the page cannot be captured. */
    }
    const report = {
      baseUrl: safeUrl(BASE_URL),
      route: '/lab',
      protectedBootstrap: Boolean(QA_ACCESS_URL),
      routeMode: QA_ROUTE_MODE,
      runMode: QA_FROM_IMPORT_FILE ? 'imported-system-shakedown' : 'full-golden-path',
      ...(await runtimeInfo(page)),
      steps,
      failedStep: currentStep,
      failure: sanitizeText(error instanceof Error ? (error.stack ?? error.message) : error),
      ...sanitizedDiagnostics(),
      screenshots: ['failure.png', ...screenshotNames()].map((file) => path.join(ARTIFACT_DIR, file)),
    }
    await writeFile(path.join(ARTIFACT_DIR, 'report.json'), JSON.stringify(report, null, 2))
    throw error
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error(`FAIL — ${sanitizeText(error instanceof Error ? (error.stack ?? error.message) : error)}`)
  process.exitCode = 1
})
