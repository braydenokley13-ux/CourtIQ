/**
 * P3.3A — middleware matcher locking.
 *
 * The Next.js middleware runs the Supabase auth refresh on every
 * matched request. Static GLB assets under `/athlete/...` MUST be
 * excluded from that path: routing those bytes through Supabase
 * adds latency and, when the Supabase env vars are missing or the
 * call fails, can return a 5xx instead of the model — the exact
 * symptom that left production without GLB athletes prior to
 * P3.3A.
 *
 * The matcher is a regex inside a string. We don't execute the
 * middleware here; we parse the matcher and verify, by string /
 * regex inspection, that the canonical static-asset paths the 3D
 * runtime requests are excluded.
 */

import { describe, expect, it } from 'vitest'
import { config } from '../middleware'

function buildMatcherRegex(): RegExp {
  const matcher = config.matcher[0]
  // `next/server` matchers are anchored by Next at runtime; for the
  // contract we want to verify the regex itself excludes the
  // expected URLs, so we anchor it explicitly.
  return new RegExp(`^${matcher}$`)
}

describe('P3.3A — middleware matcher excludes GLB and other public assets', () => {
  const re = buildMatcherRegex()

  it('excludes /athlete/mannequin.glb', () => {
    expect(re.test('/athlete/mannequin.glb')).toBe(false)
  })

  it('excludes /athlete/clips/closeout.glb', () => {
    expect(re.test('/athlete/clips/closeout.glb')).toBe(false)
  })

  it('excludes /athlete/clips/back_cut.glb', () => {
    expect(re.test('/athlete/clips/back_cut.glb')).toBe(false)
  })

  it('excludes any path under /athlete/ (broader prefix lock)', () => {
    expect(re.test('/athlete/future_asset.glb')).toBe(false)
    expect(re.test('/athlete/textures/skin.ktx2')).toBe(false)
    expect(re.test('/athlete/clips/some_new_pose.glb')).toBe(false)
  })

  it('still excludes the existing image asset shapes', () => {
    expect(re.test('/icons/x.svg')).toBe(false)
    expect(re.test('/foo.png')).toBe(false)
    expect(re.test('/bar.webp')).toBe(false)
  })

  it('still matches /home and other authenticated app routes', () => {
    expect(re.test('/home')).toBe(true)
    expect(re.test('/train')).toBe(true)
    expect(re.test('/academy/decoder-101')).toBe(true)
  })
})
