import { describe, expect, it } from 'vitest'
import { AdaptiveController, chooseInitialTier, classifyRenderer, refineTier, tierSettings, type DeviceProbe, type Decision } from './quality'

const probe = (over: Partial<DeviceProbe> = {}): DeviceProbe => ({
  renderer: 'x', vendor: 'x', software: false, integrated: false, strong: false, mobile: false, devicePixelRatio: 2, hardwareConcurrency: 8, deviceMemory: 8,
  maxTextureSize: 16384, reducedMotion: false, timerQuery: false, webgl2: true, warmupMs: null, warmupMethod: null, ...over,
})

/** Feed `seconds` of frames at a fixed interval; returns every decision. */
function run(c: AdaptiveController, intervalMs: number, seconds: number, start = 0, dpr = 2, js = 3, gpu: number | null = null): { decisions: NonNullable<Decision>[]; end: number } {
  const out: NonNullable<Decision>[] = []
  let t = start
  for (; t < start + seconds * 1000; t += intervalMs) { const d = c.push({ intervalMs, jsMs: js, gpuMs: gpu }, t, dpr); if (d) out.push(d) }
  return { decisions: out, end: t }
}

describe('classifyRenderer', () => {
  it('knows software, apple, discrete and integrated GPUs', () => {
    expect(classifyRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)').software).toBe(true)
    expect(classifyRenderer('ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)').strong).toBe(true)
    expect(classifyRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)').strong).toBe(true)
    const intel = classifyRenderer('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)')
    expect(intel.integrated).toBe(true); expect(intel.strong).toBe(false)
    expect(classifyRenderer('Mali-G52').integrated).toBe(true)
  })
})

describe('initial tier', () => {
  it('maps devices to tiers and honours overrides', () => {
    expect(chooseInitialTier(probe({ software: true })).tier).toBe('low')
    expect(chooseInitialTier(probe({ strong: true })).tier).toBe('high')
    expect(chooseInitialTier(probe({ integrated: true })).tier).toBe('balanced')
    expect(chooseInitialTier(probe({ integrated: true, hardwareConcurrency: 4, deviceMemory: 4 })).tier).toBe('low')
    expect(chooseInitialTier(probe({ strong: true }), 'low').tier).toBe('low')
  })
  it('refines at most one step from a warm-up measurement', () => {
    expect(refineTier('high', 20)).toBe('balanced')
    expect(refineTier('balanced', 20)).toBe('low')
    expect(refineTier('low', 20)).toBe('low')
    expect(refineTier('balanced', 0.5)).toBe('high')
    expect(refineTier('low', 0.5)).toBe('low')
    expect(refineTier('balanced', null)).toBe('balanced')
  })
})

describe('AdaptiveController', () => {
  it('leaves a healthy 60 fps run alone', () => {
    const c = new AdaptiveController('high', 2)
    expect(run(c, 16.7, 20).decisions).toEqual([])
  })
  it('drops render scale first, then tier, with hysteresis (not on the first bad window)', () => {
    const c = new AdaptiveController('high', 2)
    const { decisions } = run(c, 40, 30)
    expect(decisions[0].kind).toBe('scale')
    expect(decisions[0].kind === 'scale' && decisions[0].scale).toBeCloseTo(1.85, 2)
    const firstTier = decisions.findIndex(d => d.kind === 'tier')
    expect(firstTier).toBeGreaterThan(0)
    expect(decisions.slice(0, firstTier).every(d => d.kind === 'scale')).toBe(true)
    expect(c.tier).not.toBe('high')
    for (const d of decisions) if (d.kind === 'scale') expect(d.scale).toBeGreaterThanOrEqual(0.55)
  })
  it('never changes tier when locked by a user override, but still protects the frame rate with scale', () => {
    const c = new AdaptiveController('high', 2, true)
    run(c, 40, 60)
    expect(c.tier).toBe('high')
    expect(c.scale).toBeCloseTo(tierSettings('high').minScale, 2)
  })
  it('recovers slowly: scale back up only after sustained headroom', () => {
    const c = new AdaptiveController('balanced', 0.7)
    const { decisions, end } = run(c, 16.7, 4, 0, 1.25)
    expect(decisions).toEqual([]) // 4 s of good frames is not enough
    const more = run(c, 16.7, 12, end, 1.25).decisions
    expect(more.some(d => d.kind === 'scale' && d.scale > 0.7)).toBe(true)
  })
  it('goes up a tier after long headroom, and backs off from a failed upgrade without flapping', () => {
    const c = new AdaptiveController('balanced', 1.25)
    let r = run(c, 16.7, 30, 0, 2)
    expect(r.decisions.some(d => d.kind === 'tier' && d.tier === 'high')).toBe(true)
    // The upgrade immediately struggles: back down, and no second upgrade for a long while.
    r = run(c, 40, 20, r.end, 2)
    expect(c.tier).not.toBe('high')
    const flap = run(c, 16.7, 60, r.end, 2)
    expect(flap.decisions.some(d => d.kind === 'tier')).toBe(false) // upgrades are blocked for 90 s+ after a failed attempt
  })
  it('treats a GPU timer over budget as bad even when frame intervals look fine', () => {
    const c = new AdaptiveController('high', 2)
    const { decisions } = run(c, 16.7, 10, 0, 2, 3, 18)
    expect(decisions.length).toBeGreaterThan(0)
  })
})
