/** Screenshot the dev athlete studio: node scripts/athlete/shot_studio.mjs "<query>" out.png [w] [h]
 * e.g. node scripts/athlete/shot_studio.mjs "scenario=gallery&t=2.4" /tmp/a.png */
import { chromium } from '@playwright/test'
const [,, query = '', out = '/tmp/athlete-studio.png', w = '1280', h = '720'] = process.argv
const base = process.env.STUDIO_URL ?? 'http://localhost:3102/dev/athlete-studio'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: +w, height: +h + 40 } })
p.on('console', m => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 300)) })
p.on('pageerror', e => console.log('pageerror:', e.message.slice(0, 400)))
await p.goto(`${base}?${query}&w=${w}&h=${h}`, { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 180000 })
await p.waitForTimeout(+(process.env.EXTRA_WAIT ?? 300))
await p.screenshot({ path: out })
console.log(await p.evaluate(() => document.body.innerText.slice(0, 300)))
await b.close()
