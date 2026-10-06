import { notFound } from 'next/navigation'
import { GlbDebugClient } from './GlbDebugClient'

export const dynamic = 'force-dynamic'

/** Local asset diagnostics for the current CourtIQ world. */
export default function GlbDebugPage() {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEV_ROUTES !== '1') notFound()
  return <GlbDebugClient commit={process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'local'} />
}
