'use client'

import dynamic from 'next/dynamic'

const AthleteStudioClient = dynamic(() => import('./AthleteStudioClient').then(m => m.AthleteStudioClient), {
  ssr: false,
  loading: () => <div style={{ color: '#ccc', padding: 16 }}>Loading athlete studio...</div>,
})

export function AthleteStudioLoader() {
  return <AthleteStudioClient />
}
