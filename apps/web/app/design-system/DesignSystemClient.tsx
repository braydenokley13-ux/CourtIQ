'use client'

import { useState } from 'react'
import {
  Icon, PrimaryButton, GhostButton, Card, Chip, Dot,
  Progress, ProgressRing, NumberTicker, StreakFlame, XPBar,
} from '@/components/ui'
import { Court } from '@/components/court'
import type { CourtState } from '@/components/court'
import type { IconName } from '@/components/ui'

const ICON_NAMES: IconName[] = [
  'home', 'academy', 'play', 'trophy', 'flame', 'bolt', 'brain',
  'target', 'eye', 'shield', 'zap', 'clock', 'chevron-right', 'chevron-left',
  'chevron-up', 'chevron-down', 'lock', 'check', 'x', 'sparkle', 'compass',
  'info', 'stats', 'user', 'arrow-right',
]

const DEMO_COURT_STATE: CourtState = {
  offense: [
    { id: 'pg', x: 250, y: 380, role: 'PG', label: '1' },
    { id: 'sg', x: 380, y: 300, role: 'SG', label: '2' },
    { id: 'sf', x: 420, y: 180, role: 'SF', label: '3', hasBall: true },
    { id: 'pf', x: 150, y: 180, role: 'PF', label: '4', highlight: true },
    { id: 'c',  x: 250, y: 100, role: 'C',  label: '5', glow: true },
  ],
  defense: [
    { id: 'd1', x: 260, y: 350 },
    { id: 'd2', x: 370, y: 270 },
    { id: 'd3', x: 400, y: 160 },
    { id: 'd4', x: 145, y: 150 },
    { id: 'd5', x: 240, y: 80  },
  ],
  ball_location: { x: 420, y: 180 },
  motion_cues: [
    { from: [420, 180], to: [150, 180], color: '#3BE383', dashed: true },
    { from: [250, 380], to: [310, 290], color: '#3BE383', curve: { x: 20, y: -30 } },
  ],
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display font-bold text-lg text-foreground border-b border-hairline pb-2">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ children, wrap = false }: { children: React.ReactNode; wrap?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${wrap ? 'flex-wrap' : ''}`}>
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] text-foreground-mute mt-1">{children}</p>
  )
}

export function DesignSystemClient() {
  const [xp, setXp] = useState(340)
  const [iq, setIq] = useState(812)
  const [loading, setLoading] = useState(false)

  function handleLoadingDemo() {
    setLoading(true)
    setTimeout(() => setLoading(false), 2000)
  }

  return (
    <div className="min-h-screen bg-bg-0 text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-12">
        {/* Header */}
        <header>
          <h1 className="font-display font-bold text-4xl text-foreground">
            CourtIQ Design System
          </h1>
          <p className="text-foreground-dim mt-2">
            Production-quality primitives — dark-mode first, motion-native.
          </p>
        </header>

        {/* Color Palette */}
        <Section title="Color Tokens">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'brand', bg: '#3BE383' },
              { label: 'xp', bg: '#FF8A3D' },
              { label: 'iq', bg: '#8B7CFF' },
              { label: 'heat', bg: '#FF4D6D' },
              { label: 'info', bg: '#5AC8FF' },
              { label: 'bg-0', bg: '#0A0B0E', border: true },
              { label: 'bg-1', bg: '#13151A', border: true },
              { label: 'bg-2', bg: '#1C1F26', border: true },
            ].map(({ label, bg, border }) => (
              <div key={label} className="space-y-1.5">
                <div
                  className="h-12 rounded-md"
                  style={{
                    background: bg,
                    border: border ? '1px solid rgba(255,255,255,0.1)' : 'none',
                  }}
                />
                <p className="font-mono text-[11px] text-foreground-dim">{label}</p>
                <p className="font-mono text-[10px] text-foreground-mute">{bg}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Typography */}
        <Section title="Typography">
          <div className="space-y-3">
            <div>
              <p className="font-display font-bold text-4xl">Space Grotesk — Display</p>
              <Label>font-display / headlines, IQ numbers, labels</Label>
            </div>
            <div>
              <p className="font-ui text-xl">Inter — UI Body Text</p>
              <Label>font-ui / body, chips, stats</Label>
            </div>
            <div>
              <p className="font-mono text-xl">JetBrains Mono — Mono</p>
              <Label>font-mono / timers, tier codes, numbers</Label>
            </div>
          </div>
        </Section>

        {/* Icons */}
        <Section title="Icons">
          <div className="grid grid-cols-5 gap-3 sm:grid-cols-8">
            {ICON_NAMES.map((name) => (
              <div key={name} className="flex flex-col items-center gap-1.5">
                <div className="w-10 h-10 rounded-md bg-bg-2 flex items-center justify-center">
                  <Icon name={name} size={20} color="#F4F5F7" />
                </div>
                <p className="font-mono text-[9px] text-foreground-mute text-center">{name}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Buttons */}
        <Section title="Buttons">
          <div className="space-y-3 max-w-xs">
            <PrimaryButton icon="arrow-right">Start Training</PrimaryButton>
            <Label>PrimaryButton — 58px, rounded-xl, brand fill</Label>
            <PrimaryButton loading={loading} onClick={handleLoadingDemo}>
              {loading ? 'Loading…' : 'Tap for loading state'}
            </PrimaryButton>
            <PrimaryButton disabled>Disabled State</PrimaryButton>
          </div>
          <div className="mt-4">
            <Row>
              <GhostButton iconLeft="chevron-left">Back</GhostButton>
              <GhostButton iconRight="chevron-right">Continue</GhostButton>
            </Row>
            <Label>GhostButton — 44px, rounded-md, hairline border</Label>
          </div>
        </Section>

        {/* Cards */}
        <Section title="Cards">
          <div className="space-y-3">
            <Card>
              <p className="text-foreground-dim text-sm">Default card — bg-1, hairline border</p>
            </Card>
            <Card variant="elevated">
              <p className="text-foreground-dim text-sm">Elevated card — bg-2, hairline-2 border</p>
            </Card>
            <Card variant="ghost">
              <p className="text-foreground-dim text-sm">Ghost card — transparent, hairline border</p>
            </Card>
            <Card interactive onClick={() => {}} className="cursor-pointer">
              <p className="text-foreground-dim text-sm">Interactive card — hover + press states</p>
            </Card>
          </div>
        </Section>

        {/* Chips */}
        <Section title="Chips">
          <Row wrap>
            <Chip>Default</Chip>
            <Chip color="#3BE383" dot="#3BE383">Brand</Chip>
            <Chip color="#FF8A3D" dot="#FF8A3D">XP</Chip>
            <Chip color="#8B7CFF" dot="#8B7CFF">IQ</Chip>
            <Chip color="#FF4D6D" dot="#FF4D6D">Heat</Chip>
            <Chip color="#5AC8FF">Info</Chip>
          </Row>
          <Label>Chip — 11px uppercase, pill shape, optional dot</Label>
        </Section>

        {/* Dots */}
        <Section title="Dots">
          <Row>
            <Dot size={6} color="#3BE383" />
            <Dot size={8} color="#FF8A3D" />
            <Dot size={10} color="#8B7CFF" />
            <Dot size={12} color="#FF4D6D" />
          </Row>
          <Label>Dot — status indicator / inline accent</Label>
        </Section>

        {/* Progress */}
        <Section title="Progress">
          <div className="space-y-4 max-w-sm">
            <div>
              <Progress value={72} color="#3BE383" glow />
              <Label>Progress — brand, glow</Label>
            </div>
            <div>
              <Progress value={45} color="#FF8A3D" height={8} glow />
              <Label>Progress — xp, 8px, glow</Label>
            </div>
            <div>
              <Progress value={88} color="#8B7CFF" height={4} />
              <Label>Progress — iq, 4px</Label>
            </div>
          </div>
        </Section>

        {/* Progress Ring */}
        <Section title="Progress Ring">
          <Row>
            <div className="text-center">
              <ProgressRing value={72} size={80} color="#3BE383">
                <span className="font-display font-bold text-sm text-foreground">72%</span>
              </ProgressRing>
              <Label>Brand</Label>
            </div>
            <div className="text-center">
              <ProgressRing value={45} size={80} color="#FF8A3D" stroke={8}>
                <span className="font-display font-bold text-sm text-xp">XP</span>
              </ProgressRing>
              <Label>XP (8px)</Label>
            </div>
            <div className="text-center">
              <ProgressRing value={88} size={80} color="#8B7CFF">
                <span className="font-display font-bold text-sm text-iq">88%</span>
              </ProgressRing>
              <Label>IQ</Label>
            </div>
          </Row>
        </Section>

        {/* NumberTicker */}
        <Section title="Number Ticker">
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <span className="font-display font-bold text-5xl text-foreground">
                <NumberTicker value={iq} />
              </span>
              <span className="font-ui text-foreground-dim text-sm">IQ Score</span>
            </div>
            <Row>
              <GhostButton onClick={() => setIq((v) => Math.max(0, v - 15))}>−15</GhostButton>
              <GhostButton onClick={() => setIq((v) => Math.min(1000, v + 15))}>+15</GhostButton>
            </Row>
            <Label>NumberTicker — animates on value change, skips on mount</Label>
          </div>
        </Section>

        {/* Streak Flame */}
        <Section title="Streak Flame">
          <Row>
            <StreakFlame streak={7} active />
            <StreakFlame streak={14} active size={40} />
            <StreakFlame streak={0} active={false} />
          </Row>
          <Label>StreakFlame — active (orange glow) / inactive (grey)</Label>
        </Section>

        {/* XP Bar */}
        <Section title="XP Bar">
          <div className="max-w-sm space-y-3">
            <XPBar xp={xp} xpForNextLevel={500} level={4} />
            <Row>
              <GhostButton onClick={() => setXp((v) => Math.max(0, v - 50))}>−50 XP</GhostButton>
              <GhostButton onClick={() => setXp((v) => Math.min(500, v + 50))}>+50 XP</GhostButton>
            </Row>
          </div>
          <Label>XPBar — level + progress bar with NumberTicker</Label>
        </Section>

        {/* Court */}
        <Section title="Court SVG Primitive">
          <div className="space-y-3">
            <div className="rounded-2xl overflow-hidden border border-hairline inline-block">
              <Court courtState={DEMO_COURT_STATE} you="pg" width={400} height={376} />
            </div>
            <div className="space-y-1 font-mono text-[11px] text-foreground-mute">
              <p>viewBox 0 0 500 470 · basket at (250, 40)</p>
              <p>Green = offense · Red = defense · Yellow dot = you</p>
              <p>Dashed green = pass option · Solid green = cut path</p>
              <p>Player #4 highlighted · #5 has glow</p>
            </div>
          </div>
        </Section>

        {/* Motion */}
        <Section title="Motion Variants">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 font-mono text-[11px] text-foreground-dim">
            {[
              { name: 'fadeIn', desc: '120ms ease' },
              { name: 'slideUp', desc: '280ms y:24→0' },
              { name: 'pop', desc: 'spring scale:0.6→1' },
              { name: 'pulse', desc: '1.8s loop opacity' },
              { name: 'tapPress', desc: 'whileTap scale:0.97' },
              { name: 'progressFill', desc: '500ms cubic' },
              { name: 'stagger', desc: '60ms children delay' },
            ].map(({ name, desc }) => (
              <div key={name} className="bg-bg-2 rounded-md p-3 border border-hairline">
                <p className="text-foreground font-semibold">{name}</p>
                <p className="mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}
