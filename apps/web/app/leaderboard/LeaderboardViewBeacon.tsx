'use client'

import { useEffect } from 'react'
import { track } from '@/lib/analytics/events'

export function LeaderboardViewBeacon() {
  useEffect(() => {
    track('leaderboard_view', { period: 'weekly', scope: 'global' })
  }, [])
  return null
}
