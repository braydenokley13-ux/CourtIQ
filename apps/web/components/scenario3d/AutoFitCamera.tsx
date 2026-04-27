'use client'

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Scene3D } from '@/lib/scenario3d/scene'

interface AutoFitCameraProps {
  scene: Scene3D
  /** Extra padding multiplier around the bounding box. Default 1.4. */
  padding?: number
  /** Vertical lift of the camera relative to the box center. */
  pitchDeg?: number
  /** Re-fit if scene id changes. */
}

/**
 * Computes a THREE.Box3 over the scene's player + ball positions and
 * places the camera so the whole box is in frame. Coordinate-scale
 * agnostic — works whether positions are in feet, meters, or arbitrary
 * units. Always clamps near/far to safe values so geometry never
 * disappears at the boundaries.
 *
 * Runs once per scene id change and once at mount; the camera is then
 * locked. To pan the camera live use OrbitControls instead.
 */
export function AutoFitCamera({ scene, padding = 1.4, pitchDeg = 32 }: AutoFitCameraProps) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  useEffect(() => {
    if (!('isPerspectiveCamera' in camera) || !camera.isPerspectiveCamera) return
    const cam = camera as THREE.PerspectiveCamera

    // 1. Build a Box3 from player + ball start positions, plus a 6ft
    //    height buffer so the player tops are inside the box.
    const points: THREE.Vector3[] = []
    for (const p of scene.players) {
      if (Number.isFinite(p.start.x) && Number.isFinite(p.start.z)) {
        points.push(new THREE.Vector3(p.start.x, 0, p.start.z))
        points.push(new THREE.Vector3(p.start.x, 8, p.start.z))
      }
    }
    if (Number.isFinite(scene.ball.start.x) && Number.isFinite(scene.ball.start.z)) {
      points.push(new THREE.Vector3(scene.ball.start.x, 1, scene.ball.start.z))
    }
    if (points.length === 0) return

    const box = new THREE.Box3().setFromPoints(points)
    const center = new THREE.Vector3()
    const sizeVec = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(sizeVec)

    // 2. Distance required to fit the box vertically AND horizontally
    //    given the camera's FOV + aspect.
    const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 1
    const fovRad = (cam.fov * Math.PI) / 180
    const verticalFit = (sizeVec.y * 0.5 + sizeVec.z * 0.5) / Math.tan(fovRad / 2)
    const horizontalFit = (sizeVec.x * 0.5) / (Math.tan(fovRad / 2) * aspect)
    const distance = Math.max(verticalFit, horizontalFit) * padding

    // 3. Place camera behind the box along +z, lifted at `pitchDeg`.
    const pitch = (pitchDeg * Math.PI) / 180
    const camOffset = new THREE.Vector3(
      0,
      Math.sin(pitch) * distance,
      Math.cos(pitch) * distance,
    )
    const camPos = new THREE.Vector3().addVectors(center, camOffset)
    cam.position.copy(camPos)

    // 4. Aim at the center of the box.
    cam.lookAt(center)

    // 5. Clamp near/far to safe values: never closer than 0.1, far enough
    //    to cover ~3x the box diagonal so geometry at the back never
    //    clips.
    const diag = sizeVec.length()
    cam.near = Math.max(0.1, distance * 0.05)
    cam.far = Math.max(1000, distance + diag * 4)
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()

    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.info('[scenario3d] auto-fit camera', {
        sceneId: scene.id,
        center: center.toArray(),
        sizeVec: sizeVec.toArray(),
        distance,
        camPos: camPos.toArray(),
        aspect,
      })
    }
  }, [camera, scene, padding, pitchDeg, size.width, size.height])

  return null
}
