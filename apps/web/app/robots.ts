import type { MetadataRoute } from 'next'

/**
 * Launch robots policy. Crawlers may index the public-facing entry
 * points (landing, login, signup, password recovery) so the app is
 * discoverable, but everything behind auth — plus API, dev-QA, and
 * the internal design-system route — is kept out of search indexes.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/login', '/signup', '/forgot-password', '/reset-password'],
      disallow: [
        '/api/',
        '/dev/',
        '/design-system',
        '/auth/',
        '/home',
        '/train',
        '/academy',
        '/leaderboard',
        '/profile',
        '/settings',
        '/onboarding',
        '/daily',
        '/pathways',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
