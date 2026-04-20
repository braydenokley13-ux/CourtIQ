'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { PrimaryButton } from '@/components/ui/Button'
import type { CalibrationAttempt } from './CalibrationScreen'
import { computeCalibrationIQ } from '../calibration-scenarios'

interface IQResultScreenProps {
  attempts: CalibrationAttempt[]
  onContinue: (startingIQ: number) => void
  loading?: boolean
}

export function IQResultScreen({ attempts, onContinue, loading }: IQResultScreenProps) {
  const iq = computeCalibrationIQ(attempts)
  const correct = attempts.filter((a) => a.is_correct).length
  const [displayed, setDisplayed] = useState(500)

  // Animate the IQ counter up from 500 to the final value
  useEffect(() => {
    const diff = iq - 500
    const duration = 1200
    const steps = 40
    const interval = duration / steps
    let step = 0
    const timer = setInterval(() => {
      step++
      setDisplayed(Math.round(500 + (diff * step) / steps))
      if (step >= steps) clearInterval(timer)
    }, interval)
    return () => clearInterval(timer)
  }, [iq])

  const iqLabel =
    iq >= 800 ? 'ELITE' : iq >= 650 ? 'VARSITY' : 'ROOKIE'
  const iqColor =
    iq >= 800 ? 'var(--brand)' : iq >= 650 ? 'var(--xp)' : 'var(--info)'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
      className="flex flex-col items-center text-center gap-6 pt-4"
    >
      {/* IQ display */}
      <div className="relative">
        <div
          className="w-40 h-40 rounded-full flex items-center justify-center border-2"
          style={{ borderColor: iqColor, background: `${iqColor}10`, boxShadow: `0 0 48px -8px ${iqColor}60` }}
        >
          <div>
            <p
              className="font-display font-bold text-[52px] leading-none tracking-[-2px]"
              style={{ color: iqColor }}
            >
              {displayed}
            </p>
            <p className="font-mono text-[11px] font-bold tracking-[1.5px] mt-0.5" style={{ color: iqColor }}>
              IQ SCORE
            </p>
          </div>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8, duration: 0.3, type: 'spring', stiffness: 300 }}
          className="absolute -top-2 -right-2 px-2.5 py-1 rounded-full font-mono font-bold text-[11px] tracking-[1px]"
          style={{ background: iqColor, color: '#021810' }}
        >
          {iqLabel}
        </motion.div>
      </div>

      <div>
        <h2 className="font-display font-bold text-[26px] tracking-[-0.4px] text-foreground">
          Your starting IQ is {iq}
        </h2>
        <p className="mt-2 font-ui text-[15px] text-foreground-dim leading-relaxed max-w-[280px] mx-auto">
          You got {correct} of {attempts.length} right. Every session from here pushes it higher.
        </p>
      </div>

      {/* Score breakdown */}
      <div className="w-full grid grid-cols-3 gap-3">
        {[
          { label: 'Correct', value: correct, color: 'var(--brand)' },
          { label: 'Missed', value: attempts.length - correct, color: 'var(--heat)' },
          { label: 'Starting IQ', value: iq, color: iqColor },
        ].map((stat) => (
          <div key={stat.label} className="bg-bg-1 rounded-2xl p-3 border border-hairline">
            <p className="font-display font-bold text-[22px]" style={{ color: stat.color }}>
              {stat.value}
            </p>
            <p className="font-ui text-[11px] text-foreground-mute mt-0.5 uppercase tracking-[0.3px]">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      <div className="w-full space-y-2">
        <p className="font-ui text-[13px] text-foreground-mute">
          Your IQ moves with every scenario you attempt — up when you're right, a small drop when you miss.
        </p>
        <PrimaryButton onClick={() => onContinue(iq)} loading={loading} icon="arrow-right">
          Start Training
        </PrimaryButton>
      </div>
    </motion.div>
  )
}
