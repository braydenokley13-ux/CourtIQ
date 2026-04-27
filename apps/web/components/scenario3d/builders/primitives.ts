import * as THREE from 'three'

/**
 * Shared material flags for any flat decal that sits just above the
 * hardwood floor. polygonOffset pushes these meshes toward the camera
 * in the depth buffer regardless of the y-lift, which kills grazing
 * angle z-fighting that pure y-stacking cannot solve.
 */
export interface FlatDecalOptions {
  color: THREE.ColorRepresentation
  /** Larger negative units = drawn further in front of the floor. */
  polygonOffsetUnits?: number
  polygonOffsetFactor?: number
  transparent?: boolean
  opacity?: number
}

export function createFlatDecalMaterial(opts: FlatDecalOptions): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: opts.color,
    toneMapped: false,
    side: THREE.DoubleSide,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    polygonOffset: true,
    polygonOffsetFactor: opts.polygonOffsetFactor ?? -1,
    polygonOffsetUnits: opts.polygonOffsetUnits ?? -2,
  })
}

/**
 * Flat horizontal stripe between two points, used for every straight
 * court marking (sidelines, baseline, lane lines, half-court, hash
 * marks). Rendered as a thin PlaneGeometry rotated to lie on the floor
 * — a 2D rectangle, not a 3D tube — so its silhouette stays crisp from
 * any camera angle and it never pokes below the hardwood.
 */
export function buildStripe(
  start: THREE.Vector3,
  end: THREE.Vector3,
  thicknessFt: number,
  material: THREE.Material,
): THREE.Mesh {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const length = Math.hypot(dx, dz)
  const geometry = new THREE.PlaneGeometry(length, thicknessFt)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.rotation.z = -Math.atan2(dz, dx)
  mesh.position.set((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2)
  return mesh
}

/**
 * Flat solid filled rectangle (e.g. the painted key). Width along x,
 * length along z. Centered at (`centerX`, `y`, `centerZ`).
 */
export function buildFilledRect(
  width: number,
  length: number,
  centerX: number,
  y: number,
  centerZ: number,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(centerX, y, centerZ)
  return mesh
}

/**
 * Flat ring sector lying on the floor. Used for circular markings (3-pt
 * arc, free-throw circle, restricted-area arc, center circle). RingGeometry
 * gives a single clean mesh with controllable inner/outer radii and angular
 * sweep — sharper and cheaper than chaining 60+ tube segments.
 *
 * `thetaStart` is measured CCW from +X in RingGeometry's local frame.
 * After we rotate -PI/2 around X to lay flat on the XZ plane, that local
 * +Y axis ends up pointing at -Z in world space; angle 0 therefore points
 * along world +X. We expose the positioning via `centerX`/`centerZ` so
 * callers stay in court coordinates.
 */
export function buildArcRing(params: {
  radiusFt: number
  thicknessFt: number
  thetaStart: number
  thetaLength: number
  centerX: number
  y: number
  centerZ: number
  material: THREE.Material
  segments?: number
}): THREE.Mesh {
  const segments = Math.max(24, params.segments ?? 96)
  const inner = Math.max(0, params.radiusFt - params.thicknessFt / 2)
  const outer = params.radiusFt + params.thicknessFt / 2
  const geometry = new THREE.RingGeometry(
    inner,
    outer,
    segments,
    1,
    params.thetaStart,
    params.thetaLength,
  )
  const mesh = new THREE.Mesh(geometry, params.material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(params.centerX, params.y, params.centerZ)
  return mesh
}

/**
 * Legacy tube-line primitive kept for callers outside Packet 4's scope.
 * New court markings should use `buildStripe` / `buildArcRing` instead —
 * tubes poke above and below the floor plane, which causes grazing-angle
 * shimmer that polygon-offset on flat decals avoids entirely.
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
 * Legacy chained-tube arc helper, kept for callers outside Packet 4's
 * scope. Court markings now use `buildArcRing`.
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
