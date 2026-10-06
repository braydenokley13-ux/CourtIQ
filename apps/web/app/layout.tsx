import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { siteUrl } from '@/lib/site'

const spaceGrotesk = localFont({
  src: './fonts/spacegrotesk-variable.woff2',
  weight: '300 700',
  style: 'normal',
  variable: '--font-display',
  display: 'swap',
})

const inter = localFont({
  src: './fonts/inter-variable.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-ui',
  display: 'swap',
})

const jetbrainsMono = localFont({
  src: './fonts/jetbrainsmono-variable.woff2',
  weight: '100 800',
  style: 'normal',
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'CourtIQ — Basketball Strategy Lab',
    template: '%s | CourtIQ',
  },
  description: 'The basketball strategy lab. Test your answer, see the tradeoffs, and teach the result.',
  metadataBase: siteUrl(),
  manifest: '/manifest.json',
  applicationName: 'CourtIQ',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CourtIQ',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.svg', type: 'image/svg+xml' }],
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: '#07080a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} dark`}>
      <body>{children}</body>
    </html>
  )
}
