'use client'

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

interface PolyLine3DProps {
  points: Array<[number, number, number]>
  color?: string
  /** Render width is fixed at 1 pixel by WebGL — only used for materials that
   *  honour it. Kept as a no-op prop to ease drop-in replacement. */
  lineWidth?: number
  opacity?: number
  transparent?: boolean
  loop?: boolean
}

/**
 * Plain three.js LineBasicMaterial line. We deliberately avoid drei's <Line>
 * here because it pulls Line2/LineMaterial from `three-stdlib`, which has a
 * history of breaking under aggressive bundlers (tree-shaking can drop the
 * shader chunks, leaving the line invisible). The native primitive renders
 * via gl.LINE_STRIP and is stable across every browser that supports WebGL.
 *
 * The geometry, material, and the wrapping THREE.Line itself are all
 * memoised so unchanged lines are not removed and re-added to the scene
 * graph on every parent rerender. We dispose the GPU resources when the
 * component unmounts.
 */
export function PolyLine3D({
  points,
  color = '#FFFFFF',
  opacity = 1,
  transparent = false,
  loop = false,
}: PolyLine3DProps) {
  const line = useMemo(() => {
    const verts: number[] = []
    for (const p of points) {
      verts.push(p[0], p[1], p[2])
    }
    if (loop && points.length > 0) {
      const first = points[0]!
      verts.push(first[0], first[1], first[2])
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent,
      opacity,
      toneMapped: false,
    })
    return new THREE.Line(geo, mat)
  }, [points, loop, color, transparent, opacity])

  // Free the GPU buffers and shader program when the line unmounts or the
  // memoised instance changes (e.g. point list or color updated).
  useEffect(() => {
    return () => {
      line.geometry.dispose()
      const m = line.material
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose())
      else (m as THREE.Material).dispose()
    }
  }, [line])

  return <primitive object={line} />
}
