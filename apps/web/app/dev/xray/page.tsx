import { notFound } from 'next/navigation'
import XrayClient from './XrayClient'

export const dynamic = 'force-dynamic'

/** Dev-only harness for the X-Ray lenses, compare ghosts, Break staging and cameras.
 * Drive it with window.__xray.set({...}) (see XrayClient) so a slow software-GL run
 * can step through many states without re-loading the world. */
export default function XrayPage() {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEV_ROUTES !== '1') notFound()
  return <XrayClient />
}
