import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg-0 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-[400px]">
        {/* Wordmark */}
        <div className="flex justify-center mb-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-brand flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 2L14 5V10C14 13 11.5 15.5 9 16C6.5 15.5 4 13 4 10V5L9 2Z" fill="#021810"/>
              </svg>
            </div>
            <span className="font-display font-bold text-[22px] tracking-[-0.3px] text-foreground">
              CourtIQ
            </span>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
