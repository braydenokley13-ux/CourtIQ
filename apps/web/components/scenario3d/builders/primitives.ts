import * as THREE from 'three'

/**
 * Tube-line primitive used for court markings. We render lines as thin
 * cylinders rather than THREE.Line because line widths >1px are not
 * supported by WebGL on most platforms — cylinders give consistent,
 * crisp lines at any camera distance.
 */
export function buildTubeLine(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  color: THREE.ColorRepresentation,
): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(end, start)
  const length = dir.length()
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
  const up = new THREE.Vector3(0, 1, 0)
  const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize())

  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 8),
    new THREE.MeshBasicMaterial({ color, toneMapped: false }),
  )
  mesh.position.copy(mid)
  mesh.quaternion.copy(quat)
  return mesh
}

/**
 * Adds an arc as a chain of short tube segments to `parent`. Used for
 * the three-point arc and the free-throw arc on the court. `sweep` is
 * the angular span in radians (e.g. PI for a half-circle).
 */
export function addArcLineSegments(
  parent: THREE.Object3D,
  radius: number,
  sweep: number,
  y: number,
  z: number,
  color: THREE.ColorRepresentation,
  segmentRadius: number,
): void {
  const segments = 64
  const start = -sweep / 2
  const points: Array<[number, number]> = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const angle = start + t * sweep
    points.push([Math.sin(angle) * radius, Math.cos(angle) * radius])
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const startV = new THREE.Vector3(a[0], y, a[1] + z)
    const endV = new THREE.Vector3(b[0], y, b[1] + z)
    parent.add(buildTubeLine(startV, endV, segmentRadius, color))
  }
}
