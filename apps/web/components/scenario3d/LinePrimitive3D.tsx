'use client'

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

interface LinePrimitive3DProps {
  points: [number, number, number][]
  color?: string
  opacity?: number
}

/**
 * Synchronous Three.js line primitive. This intentionally avoids drei's
 * helpers so court rendering cannot wait on any helper-level async work.
 */
export function LinePrimitive3D({
  points,
  color = '#FFFFFF',
  opacity = 1,
}: LinePrimitive3DProps) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(
      points.map((point) => new THREE.Vector3(point[0], point[1], point[2])),
    )
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      toneMapped: false,
    })
    return new THREE.Line(geometry, material)
  }, [color, opacity, points])

  useEffect(() => {
    return () => {
      line.geometry.dispose()
      const material = line.material
      if (Array.isArray(material)) {
        material.forEach((item) => item.dispose())
      } else {
        material.dispose()
      }
    }
  }, [line])

  return <primitive object={line} />
}
