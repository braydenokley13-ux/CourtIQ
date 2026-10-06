'use client'

import dynamic from 'next/dynamic'

const WorldLookClient = dynamic(() => import('./WorldLookClient'), { ssr: false })

export function WorldLookLoader() {
  return <WorldLookClient />
}
