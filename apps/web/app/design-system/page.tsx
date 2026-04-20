import { Suspense } from 'react'
import { DesignSystemClient } from './DesignSystemClient'

export const metadata = { title: 'Design System' }

export default function DesignSystemPage() {
  return (
    <Suspense>
      <DesignSystemClient />
    </Suspense>
  )
}
