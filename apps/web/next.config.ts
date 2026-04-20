import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@courtiq/core'],
  experimental: {
    instrumentationHook: true,
  },
}

export default nextConfig
