'use client'

import { useEffect, useRef } from 'react'
import type { SimulationResult, ThreatId } from '@/lib/defense-lab/types'
import { frameAt } from '@/lib/defense-lab/simulation'

/** Top-down diagram drawn from a real simulation — never an illustration.
 * Trails show where everyone went; it loops while visible. */
export default function MiniCourt({ result, highlight, openThreat, playing = true, height = 132, freezeAt }: { result: SimulationResult | null; highlight?: string[]; openThreat?: ThreatId | null; playing?: boolean; height?: number; freezeAt?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !result) return
    const ctx = canvas.getContext('2d')!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let raf = 0, start = 0, visible = true
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    io.observe(canvas)
    const duration = result.config.assumptions.duration
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (!visible) return
      const w = canvas.clientWidth, h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr) }
      if (!start) start = now
      const t = freezeAt ?? (playing ? ((now - start) / 1000 * 0.9) % (duration + 0.8) : duration)
      const clock = Math.min(duration, t)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      // Court: x ∈ [-7.6, 7.6] across, z ∈ [0, 9.8] up (half court near the basket).
      const sx = w / 15.6, sz = h / 9.9, s = Math.min(sx, sz)
      const ox = w / 2, oz = h - 4
      const X = (x: number) => ox + x * s, Z = (z: number) => oz - z * s
      ctx.fillStyle = '#16120d'; ctx.fillRect(0, 0, w, h)
      const grd = ctx.createRadialGradient(X(0), Z(3), 10, X(0), Z(3), w * 0.7)
      grd.addColorStop(0, 'rgba(201,140,74,.30)'); grd.addColorStop(1, 'rgba(201,140,74,.06)')
      ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(255,240,215,.28)'; ctx.lineWidth = 1
      ctx.strokeRect(X(-2.44), Z(5.8), 4.88 * s, 5.8 * s)
      ctx.beginPath(); ctx.arc(X(0), Z(1.575), 6.75 * s, Math.PI + 0.22, -0.22); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(X(-6.6), Z(0)); ctx.lineTo(X(-6.6), Z(2.99)); ctx.moveTo(X(6.6), Z(0)); ctx.lineTo(X(6.6), Z(2.99)); ctx.stroke()
      ctx.beginPath(); ctx.arc(X(0), Z(1.575), 0.23 * s, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,120,60,.8)'; ctx.stroke()
      // Trails.
      const samples = 24
      for (const p of result.frames[0].players) {
        ctx.beginPath()
        for (let i = 0; i <= samples; i++) {
          const f = frameAt(result, clock * i / samples).players.find(q => q.id === p.id)!
          if (i) ctx.lineTo(X(f.x), Z(f.z)); else ctx.moveTo(X(f.x), Z(f.z))
        }
        const hl = !highlight || highlight.includes(p.id)
        ctx.strokeStyle = p.team === 'defense' ? `rgba(79,184,255,${hl ? 0.75 : 0.25})` : `rgba(242,212,138,${hl ? 0.6 : 0.2})`
        ctx.lineWidth = 1.5; ctx.setLineDash(p.team === 'defense' ? [] : [3, 3]); ctx.stroke(); ctx.setLineDash([])
      }
      const frame = frameAt(result, clock)
      if (openThreat) {
        const o = frame.options.find(q => q.id === openThreat)
        const rp = o && frame.players.find(q => q.id === o.playerId)
        if (rp) { ctx.beginPath(); ctx.arc(X(rp.x), Z(rp.z), 9 + 2 * Math.sin(now / 200), 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,90,60,.9)'; ctx.lineWidth = 2; ctx.stroke() }
      }
      for (const p of frame.players) {
        const hl = !highlight || highlight.includes(p.id)
        ctx.beginPath(); ctx.arc(X(p.x), Z(p.z), 4.6, 0, Math.PI * 2)
        ctx.fillStyle = p.team === 'defense' ? (hl ? '#4fb8ff' : 'rgba(79,184,255,.4)') : (hl ? '#f2e6c8' : 'rgba(242,230,200,.4)')
        ctx.fill()
      }
      ctx.beginPath(); ctx.arc(X(frame.ball.x), Z(frame.ball.z), 2.6, 0, Math.PI * 2); ctx.fillStyle = '#ff8a3c'; ctx.fill()
      if (!playing || freezeAt !== undefined) cancelAnimationFrame(raf)
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); io.disconnect() }
  }, [result, highlight, openThreat, playing, freezeAt])
  return <canvas ref={ref} style={{ width: '100%', height, display: 'block', borderRadius: 10 }} aria-hidden />
}
