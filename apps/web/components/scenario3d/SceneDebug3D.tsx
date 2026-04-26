'use client'

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { COURT } from '@/lib/scenario3d/coords'
import type { Scene3D } from '@/lib/scenario3d/scene'

interface SceneDebug3DProps {
  scene?: Scene3D | null
}

/**
 * Dev-only helper that overlays an axes/grid helper inside the canvas and
 * logs camera + scene bounds so the team can sanity-check rendering issues
 * without shipping debug noise to production.
 *
 * Disabled in production builds via NODE_ENV — guards the JSX completely so
 * tree-shaking can drop it.
 */
export function SceneDebug3D({ scene }: SceneDebug3DProps) {
  const { camera } = useThree()

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    if (typeof console === 'undefined') return
    const cam = camera
    /* eslint-disable no-console */
    console.groupCollapsed(`[scenario3d] scene "${scene?.id ?? 'none'}"`)
    console.log('camera.position', cam.position.toArray())
    console.log('camera.fov', 'fov' in cam ? cam.fov : 'orthographic')
    if (scene) {
      const xs = scene.players.map((p) => p.start.x)
      const zs = scene.players.map((p) => p.start.z)
      console.log('player count', scene.players.length)
      console.log(
        'player x bounds',
        xs.length ? [Math.min(...xs), Math.max(...xs)] : '—',
      )
      console.log(
        'player z bounds',
        zs.length ? [Math.min(...zs), Math.max(...zs)] : '—',
      )
      console.log('ball', scene.ball)
      console.log('movements', scene.movements.length, 'answerDemo', scene.answerDemo.length)
    }
    console.groupEnd()
    /* eslint-enable no-console */
  }, [camera, scene])

  if (process.env.NODE_ENV === 'production') return null

  return (
    <group>
      <axesHelper args={[6]} />
      <gridHelper
        args={[COURT.halfWidthFt * 2, 10, '#FF8A3D', '#3B2417']}
        position={[0, 0.02, COURT.halfLengthFt / 2]}
      />
    </group>
  )
}
