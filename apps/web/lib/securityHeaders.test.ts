import { describe, expect, it } from 'vitest'
import { PRODUCTION_SECURITY_HEADERS } from './securityHeaders'

function find(key: string): string | undefined {
  return PRODUCTION_SECURITY_HEADERS.find((h) => h.key === key)?.value
}

describe('PRODUCTION_SECURITY_HEADERS', () => {
  it('enforces HSTS with preload eligibility', () => {
    const hsts = find('Strict-Transport-Security')
    expect(hsts).toBeDefined()
    expect(hsts).toMatch(/max-age=\d{6,}/)
    expect(hsts).toContain('includeSubDomains')
    expect(hsts).toContain('preload')
  })

  it('blocks framing entirely to prevent clickjacking', () => {
    expect(find('X-Frame-Options')).toBe('DENY')
  })

  it('disables MIME sniffing', () => {
    expect(find('X-Content-Type-Options')).toBe('nosniff')
  })

  it('uses strict-origin-when-cross-origin for referrer policy', () => {
    expect(find('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })

  it('denies the high-risk browser surfaces by default', () => {
    const policy = find('Permissions-Policy')
    expect(policy).toBeDefined()
    expect(policy).toContain('camera=()')
    expect(policy).toContain('microphone=()')
    expect(policy).toContain('geolocation=()')
    expect(policy).toContain('payment=()')
  })

  it('does not ship a CSP yet — that lands as report-only first', () => {
    expect(find('Content-Security-Policy')).toBeUndefined()
    expect(find('Content-Security-Policy-Report-Only')).toBeUndefined()
  })

  it('each header has a non-empty string value', () => {
    for (const h of PRODUCTION_SECURITY_HEADERS) {
      expect(typeof h.key).toBe('string')
      expect(h.key.length).toBeGreaterThan(0)
      expect(typeof h.value).toBe('string')
      expect(h.value.length).toBeGreaterThan(0)
    }
  })
})
