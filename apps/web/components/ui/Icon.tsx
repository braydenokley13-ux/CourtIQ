import type { SVGAttributes } from 'react'

export type IconName =
  | 'home' | 'academy' | 'play' | 'trophy' | 'flame' | 'bolt' | 'brain'
  | 'target' | 'eye' | 'shield' | 'zap' | 'clock' | 'chevron-right'
  | 'chevron-left' | 'chevron-up' | 'chevron-down' | 'lock' | 'check' | 'x'
  | 'sparkle' | 'compass' | 'info' | 'stats' | 'user' | 'arrow-right'

interface IconProps extends SVGAttributes<SVGElement> {
  name: IconName
  size?: number
  color?: string
  strokeWidth?: number
}

export function Icon({ name, size = 20, color = 'currentColor', strokeWidth = 2, ...rest }: IconProps) {
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...rest,
  }
  switch (name) {
    case 'home':
      return <svg {...p}><path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2V10z"/></svg>
    case 'academy':
      return <svg {...p}><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M7 9v5c3 2 7 2 10 0V9"/><path d="M21 7v6"/></svg>
    case 'play':
      return <svg {...p}><path d="M6 4l14 8-14 8V4z" fill={color}/></svg>
    case 'trophy':
      return <svg {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M4 4h4v3a2 2 0 0 1-4 0V4zM16 4h4v3a2 2 0 0 1-4 0V4z"/><path d="M10 16h4v3h-4zM8 21h8"/></svg>
    case 'flame':
      return <svg {...p}><path d="M12 2s5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 1-5 0 0 2 1 2 3 0-3 2-5 2-8z"/></svg>
    case 'bolt':
      return <svg {...p}><path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" fill={color} stroke="none"/></svg>
    case 'brain':
      return <svg {...p}><path d="M12 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5v1a3 3 0 0 0 6 0v-1a3 3 0 0 0 2-5 3 3 0 0 0-2-5V7a3 3 0 0 0-3-3z"/><path d="M12 4v16M9 9h.5M9 15h1"/></svg>
    case 'chevron-right':
      return <svg {...p}><path d="M9 6l6 6-6 6"/></svg>
    case 'chevron-left':
      return <svg {...p}><path d="M15 6l-6 6 6 6"/></svg>
    case 'chevron-up':
      return <svg {...p}><path d="M18 15l-6-6-6 6"/></svg>
    case 'chevron-down':
      return <svg {...p}><path d="M6 9l6 6 6-6"/></svg>
    case 'lock':
      return <svg {...p}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
    case 'check':
      return <svg {...p}><path d="M5 12l5 5L20 7"/></svg>
    case 'x':
      return <svg {...p}><path d="M6 6l12 12M18 6L6 18"/></svg>
    case 'target':
      return <svg {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill={color}/></svg>
    case 'eye':
      return <svg {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
    case 'shield':
      return <svg {...p}><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z"/></svg>
    case 'zap':
      return <svg {...p}><path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z"/></svg>
    case 'clock':
      return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
    case 'user':
      return <svg {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
    case 'stats':
      return <svg {...p}><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>
    case 'arrow-right':
      return <svg {...p}><path d="M5 12h14M13 6l6 6-6 6"/></svg>
    case 'sparkle':
      return <svg {...p}><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z"/></svg>
    case 'compass':
      return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M15 9l-2 6-4 2 2-6 4-2z" fill={color} stroke="none"/></svg>
    case 'info':
      return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 8v.5M12 11v5"/></svg>
    default:
      return null
  }
}
