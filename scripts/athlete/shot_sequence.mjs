/** Capture a filmstrip of the dev athlete studio from one page load (deterministic stepping).
 * node scripts/athlete/shot_sequence.mjs "scenario=track&mode=slide&speed=2.2&t=3" OUT_PREFIX frames stepSeconds [w] [h] [cropX cropY cropW cropH]
 * Writes OUT_PREFIX_0.png ... ; combine with scripts/athlete/filmstrip.py */
import { chromium } from '@playwright/test'
const [,, query = '', prefix = '/tmp/seq', frames = '6', step = '0.1', w = '800', h = '600', ...crop] = process.argv
const base = process.env.STUDIO_URL ?? 'http://localhost:3102/dev/athlete-studio'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: +w, height: +h + 40 } })
p.on('pageerror', e => console.log('pageerror:', e.message.slice(0, 300)))
await p.goto(`${base}?${query}&w=${w}&h=${h}`, { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForFunction(() => document.body.dataset.ready === '1' && typeof window.__studioAdvance === 'function', null, { timeout: 180000 })
const clip = crop.length === 4 ? { x: +crop[0], y: +crop[1], width: +crop[2], height: +crop[3] } : { x: 0, y: 0, width: +w, height: +h }
for (let i = 0; i < +frames; i++) {
  if (i) await p.evaluate(s => window.__studioAdvance(s), +step)
  await p.screenshot({ path: `${prefix}_${i}.png`, clip })
}
await b.close()
console.log('done', frames)
