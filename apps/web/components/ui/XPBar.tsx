'use client'

import { Progress } from './Progress'
import { NumberTicker } from './NumberTicker'

interface XPBarProps {
  xp: number
  xpForNextLevel: number
  level: number
  className?: string
}

export function XPBar({ xp, xpForNextLevel, level, className = '' }: XPBarProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="font-ui text-[11px] font-semibold text-foreground-dim uppercase tracking-[0.2px]">
          Level <NumberTicker value={level} className="text-foreground font-bold font-mono" />
        </span>
        <span className="font-mono text-[11px] text-foreground-dim">
          <NumberTicker value={xp} /> / {xpForNextLevel} XP
        </span>
      </div>
      <Progress value={xp} max={xpForNextLevel} color="#FF8A3D" height={4} glow />
    </div>
  )
}
