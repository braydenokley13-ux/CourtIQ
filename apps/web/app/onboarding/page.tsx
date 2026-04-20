import type { Metadata } from 'next'
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard'

export const metadata: Metadata = { title: 'Get Started' }

export default function OnboardingPage() {
  return <OnboardingWizard />
}
