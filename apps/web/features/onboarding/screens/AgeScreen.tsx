'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { PrimaryButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'

interface AgeScreenProps {
  onNext: (age: number | 'hidden') => void
}

export function AgeScreen({ onNext }: AgeScreenProps) {
  const [age, setAge] = useState<number | ''>('')
  const [gated, setGated] = useState(false)

  function handleContinue() {
    const numAge = Number(age)
    if (!numAge || numAge < 5 || numAge > 99) return
    if (numAge < 13) {
      setGated(true)
      return
    }
    onNext(numAge)
  }

  function handleHide() {
    onNext('hidden')
  }

  if (gated) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center text-center gap-6 pt-4"
      >
        <div className="w-16 h-16 rounded-2xl bg-heat/10 flex items-center justify-center">
          <Icon name="shield" size={28} color="var(--heat)" />
        </div>
        <div>
          <h2 className="font-display font-bold text-[24px] tracking-[-0.3px] text-foreground">
            Almost there
          </h2>
          <p className="mt-3 font-ui text-[15px] text-foreground-dim leading-relaxed max-w-[280px] mx-auto">
            CourtIQ requires a parent or guardian to create your account.
            Ask them to sign up on your behalf.
          </p>
        </div>
        <div className="w-full space-y-3">
          <a
            href="/signup"
            className="block w-full h-[58px] rounded-xl bg-brand text-brand-ink font-display font-bold text-[17px] tracking-[0.3px] uppercase flex items-center justify-center"
          >
            Parent Sign Up
          </a>
          <button
            onClick={() => setGated(false)}
            className="w-full font-ui text-[14px] text-foreground-dim hover:text-foreground transition-colors py-2"
          >
            Go back
          </button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-8"
    >
      <div>
        <h2 className="font-display font-bold text-[26px] tracking-[-0.4px] text-foreground">
          How old are you?
        </h2>
        <p className="mt-2 font-ui text-[15px] text-foreground-dim">
          We use this to personalize your training.
        </p>
      </div>

      <div>
        <div className="relative">
          <input
            type="number"
            inputMode="numeric"
            min={5}
            max={99}
            value={age}
            onChange={(e) => setAge(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="Your age"
            className={[
              'w-full h-[64px] px-5 rounded-xl',
              'bg-bg-1 border border-hairline-2',
              'font-display font-bold text-[28px] text-foreground placeholder:font-ui placeholder:text-[16px] placeholder:text-foreground-mute placeholder:font-normal',
              'focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent',
              '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
            ].join(' ')}
            autoFocus
          />
        </div>
        <p className="mt-2 font-ui text-[12px] text-foreground-mute">
          Must be 13 or older to create an account independently.
        </p>
      </div>

      <div className="space-y-3">
        <PrimaryButton
          onClick={handleContinue}
          disabled={!age || Number(age) < 5 || Number(age) > 99}
          icon="arrow-right"
        >
          Continue
        </PrimaryButton>
        <button
          onClick={handleHide}
          className="w-full py-2.5 font-ui text-[14px] text-foreground-mute hover:text-foreground-dim transition-colors"
        >
          Prefer not to say
        </button>
      </div>
    </motion.div>
  )
}
