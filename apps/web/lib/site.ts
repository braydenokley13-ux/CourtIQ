/** Optional deployment metadata; the application needs no service credentials. */
export function siteUrl(): URL {
  if (process.env.NEXT_PUBLIC_APP_URL) return new URL(process.env.NEXT_PUBLIC_APP_URL)
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  return new URL(host ? `https://${host}` : 'http://localhost:3000')
}
