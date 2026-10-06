import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

/** /lab aliases the canonical root product and does not need a duplicate entry. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: siteUrl().origin, changeFrequency: 'weekly', priority: 1 }]
}
