import type { MetadataRoute } from 'next'

/**
 * Sitemap for the public, crawlable entry points. Auth-gated routes
 * are intentionally excluded — they require a session and carry no
 * indexable content. Keep this in sync with the `allow` list in
 * `robots.ts`.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const lastModified = new Date()

  return [
    { url: baseUrl, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/signup`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/login`, lastModified, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/forgot-password`, lastModified, changeFrequency: 'yearly', priority: 0.2 },
  ]
}
