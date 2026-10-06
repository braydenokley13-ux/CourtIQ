import { notFound } from 'next/navigation'
import { WorldLookLoader } from './WorldLookLoader'

export const dynamic = 'force-dynamic'

/**
 * Dev-only review route for the Normal World environment/lighting look.
 *
 * Query params:
 *   ?view=broadcast|sideline|top   camera preset (default broadcast)
 *   ?analytical=1|0.5              analytical fade amount (default 0)
 *   ?style=night|spectral          analytical style (default night)
 *   ?quality=high|low              environment quality (default high)
 *   ?hud=1                         show renderer.info / frame-time readout
 */
export default function WorldLookPage() {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEV_ROUTES !== '1') notFound()
  return <WorldLookLoader />
}
