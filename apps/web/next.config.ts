import type { NextConfig } from 'next'
import { PRODUCTION_SECURITY_HEADERS } from './lib/securityHeaders'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@courtiq/basketball'],
  // Keep parallel local asset review and production QA servers isolated.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async headers() {
    return [{ source: '/:path*', headers: PRODUCTION_SECURITY_HEADERS }]
  },
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
  },
}

export default nextConfig
