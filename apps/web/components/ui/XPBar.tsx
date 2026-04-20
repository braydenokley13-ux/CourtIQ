import { Icon } from './Icon'
import { Progress } from './Progress'

interface XPBarProps {
  current: number
  max: number
  level: number
  className?: string
}

export function XPBar({ current, max, level, className = '' }: XPBarProps) {
  return (
    <div
      className={['flex flex-col gap-1.5', className].filter(Boolean).join(' ')}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Icon name="bolt" size={12} color="#FF8A3D" />
          <span className="font-ui text-[10px] font-bold uppercase tracking-[1px] text-foreground-dim">
            Level {level}
          </span>
        </div>
        <span className="font-mono text-[10px] text-foreground-mute">
          {current.toLocaleString()} / {max.toLocaleString()} XP
        </span>
      </div>
      <Progress value={current} max={max} color="#FF8A3D" height={4} />
    </div>
  )
}
