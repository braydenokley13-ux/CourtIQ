import type { SVGProps } from 'react'

export type IconName =
  | 'home' | 'academy' | 'play' | 'trophy' | 'flame' | 'bolt' | 'brain'
  | 'chevron-right' | 'chevron-left' | 'chevron-up' | 'chevron-down'
  | 'lock' | 'check' | 'x'
  | 'target' | 'eye' | 'shield' | 'zap' | 'clock'
  | 'user' | 'stats' | 'arrow-right' | 'arrow-left'
  | 'sparkle' | 'compass' | 'info'

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
  color?: string
  strokeWidth?: number
}

function Paths({ name, color }: { name: IconName; color: string }) {
  switch (name) {
    case 'home':
      return <path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2V10z" />
    case 'academy':
      return (
        <>
          <path d="M3 7l9-4 9 4-9 4-9-4z" />
          <path d="M7 9v5c3 2 7 2 10 0V9" />
          <path d="M21 7v6" />
        </>
      )
    case 'play':
      return <path d="M6 4l14 8-14 8V4z" fill={color} />
    case 'trophy':
      return (
        <>
          <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
          <path d="M4 4h4v3a2 2 0 0 1-4 0V4zM16 4h4v3a2 2 0 0 1-4 0V4z" />
          <path d="M10 16h4v3h-4zM8 21h8" />
        </>
      )
    case 'flame':
      return <path d="M12 2s5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 1-5 0 0 2 1 2 3 0-3 2-5 2-8z" />
    case 'bolt':
      return <path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" fill={color} stroke="none" />
    case 'brain':
      return (
        <>
          <path d="M12 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5v1a3 3 0 0 0 6 0v-1a3 3 0 0 0 2-5 3 3 0 0 0-2-5V7a3 3 0 0 0-3-3z" />
          <path d="M12 4v16M9 9h.5M9 15h1" />
        </>
      )
    case 'chevron-right': return <path d="M9 6l6 6-6 6" />
    case 'chevron-left':  return <path d="M15 6l-6 6 6 6" />
    case 'chevron-up':    return <path d="M6 15l6-6 6 6" />
    case 'chevron-down':  return <path d="M6 9l6 6 6-6" />
    case 'lock':
      return (
        <>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </>
      )
    case 'check': return <path d="M5 12l5 5L20 7" />
    case 'x':     return <path d="M6 6l12 12M18 6L6 18" />
    case 'target':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1" fill={color} />
        </>
      )
    case 'eye':
      return (
        <>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )
    case 'shield': return <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z" />
    case 'zap':    return <path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" />
    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      )
    case 'user':
      return (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </>
      )
    case 'stats':       return <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
    case 'arrow-right': return <path d="M5 12h14M13 6l6 6-6 6" />
    case 'arrow-left':  return <path d="M19 12H5M11 18l-6-6 6-6" />
    case 'sparkle':
      return (
        <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
      )
    case 'compass':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M15 9l-2 6-4 2 2-6 4-2z" fill={color} stroke="none" />
        </>
      )
    case 'info':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v.5M12 11v5" />
        </>
      )
    default:
      return null
  }
}

export function Icon({
  name,
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <Paths name={name} color={color} />
    </svg>
  )
}
