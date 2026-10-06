import type { Metadata } from 'next'
import DefenseLab from '@/components/defense-lab/DefenseLab'

export const metadata: Metadata = {
  title: 'Defense Lab — CourtIQ',
  description: 'Test your defensive answer against an offense that responds. See the tradeoff, change the rule, and teach your team.',
}

export default function CourtIQPage() {
  return <DefenseLab />
}
