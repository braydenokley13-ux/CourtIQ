'use client'

import type { WorldRuntime } from './world/WorldRuntime'
import type { WorldStats } from './world/types'
import type { QualityOverride } from './world/quality'
import s from './courtiq.module.css'

/** ?debug overlay: the world's health in one glance + a manual quality tier (persisted). */
export default function PerfHud({ stats, runtime }: { stats: WorldStats | null; runtime: WorldRuntime | null }) {
  if (!stats) return <div className={s.stats}>waiting for frames…</div>
  const gpu = stats.gpuMs === null ? 'gpu n/a' : `gpu ${stats.gpuMs} ms`
  const override: QualityOverride = runtime?.getQualityOverride() ?? 'auto'
  return (
    <div className={s.stats} style={{ whiteSpace: 'pre', lineHeight: 1.45, pointerEvents: 'auto' }}>
      {`${stats.fps} fps · frame p50 ${stats.frameP50} / p95 ${stats.frameP95} ms · js ${stats.jsMs} ms (p95 ${stats.jsP95}) · ${gpu}${stats.software ? ' · SOFTWARE GL' : ''}\n`}
      {`${stats.calls} calls · ${(stats.triangles / 1000).toFixed(0)}k tris · ${stats.programs} programs · ${stats.textures} tex · ${stats.geometries} geo · ×${stats.scale.toFixed(2)} · long tasks ${stats.longTasks}\n`}
      {`tier ${stats.tier}${stats.auto ? ' (auto)' : ' (locked)'}${stats.change ? ` · ${stats.change}` : ''}  `}
      <select aria-label="Quality tier" value={override} onChange={e => runtime?.setQualityOverride(e.target.value as QualityOverride)} style={{ font: 'inherit', background: '#0b1118', color: 'inherit', border: '1px solid #2a3642' }}>
        <option value="auto">auto</option><option value="high">high</option><option value="balanced">balanced</option><option value="low">low</option>
      </select>
    </div>
  )
}
