/**
 * Production security headers applied via next.config.ts `headers()`.
 *
 * Scope intentionally excludes Content-Security-Policy. CSP needs an
 * explicit allowlist for Sentry, PostHog, Supabase, Vercel monitoring,
 * GLB CDN sources, three.js workers, and inline runtime hashes; a
 * mis-tuned policy will silently break analytics or the renderer.
 * Tracked as a follow-up: ship CSP-Report-Only first, observe, then
 * enforce.
 *
 * Header set (defensible defaults for a consumer web app):
 *  - Strict-Transport-Security: lock the apex + subdomains to HTTPS
 *    for 2 years with preload eligibility.
 *  - X-Frame-Options: DENY — no embedding (clickjacking).
 *  - X-Content-Type-Options: nosniff — disable MIME sniffing.
 *  - Referrer-Policy: strict-origin-when-cross-origin — leak only the
 *    origin to cross-site navigation.
 *  - Permissions-Policy: deny camera/mic/geolocation/usb/payment by
 *    default; we don't ask for any of these yet.
 *  - X-DNS-Prefetch-Control: on — small TTFB win for Supabase + CDN.
 */

interface NextHeader {
  key: string
  value: string
}

const PERMISSIONS_POLICY = [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'usb=()',
  'payment=()',
  'magnetometer=()',
  'accelerometer=()',
  'gyroscope=()',
].join(', ')

export const PRODUCTION_SECURITY_HEADERS: NextHeader[] = [
  // 2 years, include subdomains, preload-eligible. HSTS is only
  // enforced when served over HTTPS, so local dev is unaffected.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
]
