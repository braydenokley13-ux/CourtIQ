'use client'

import { useMemo } from 'react'
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
 */
export function PolyLine3D({
  points,
  color = '#FFFFFF',
  opacity = 1,
  transparent = false,
  loop = false,
}: PolyLine3DProps) {
  const geometry = useMemo(() => {
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
    return geo
  }, [points, loop])

  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color,
        transparent,
        opacity,
        toneMapped: false,
      }),
    [color, transparent, opacity],
  )

  // R3F's `<line>` primitive accepts a geometry + material as args.
  return <primitive object={new THREE.Line(geometry, material)} />
}
