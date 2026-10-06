import { notFound } from 'next/navigation'
import { AthleteStudioLoader } from './AthleteStudioLoader'

export const dynamic = 'force-dynamic'

/**
 * Dev-only athlete/animation review stage. Renders a floor, key light and a handful of
 * Defense Lab athletes cycling clips (stance, slide, closeout, run, pass, catch, dribble)
 * so movement and look can be screenshotted without the full lab UI.
 *
 *   ?scenario=gallery   10 athletes performing different actions (default)
 *   ?scenario=track     one athlete at constant speed beside a metre grid, camera following
 *                       (judge foot planting): &mode=slide|run|jog|walk|back|chop &speed=2.2 &dir=left|right
 *   ?t=2.4              freeze at simulation time t (deterministic) - otherwise runs live
 *   ?cam=broadcast|close|side|front|top   &focus=3 (index)   &turntable=1
 *   ?quality=low        tactical mesh + cheaper arm correction
 */
export default function AthleteStudioPage() {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEV_ROUTES !== '1') notFound()
  return <AthleteStudioLoader />
}
