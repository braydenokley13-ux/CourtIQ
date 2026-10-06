import type { Metadata } from 'next'
import CourtIQApp from '@/components/courtiq/CourtIQApp'

export const metadata: Metadata = {
  title: 'CourtIQ — Basketball Strategy Lab',
  description: 'Pick a basketball problem, run your answer against an offense that reacts, see the tradeoff, fix it, break it, save it and teach it.',
}

export default function CourtIQPage() {
  return <CourtIQApp />
}
