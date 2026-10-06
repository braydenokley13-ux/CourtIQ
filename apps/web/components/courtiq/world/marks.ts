import * as THREE from 'three'
import type { PlayerId, Point2, WorldFrame } from '@/lib/defense-lab/types'
import type { Anchor, Mark, Tone } from './types'

/** Analytical palette. Lit like light, not paint: additive, untonemapped. */
export const TONES: Record<Tone, string> = {
  threat: '#ff5a3c',
  good: '#3ee0a1',
  defense: '#4fb8ff',
  offense: '#f2d48a',
  neutral: '#c9d3dc',
  ghost: '#b9c7ff',
  attack: '#ff3d6e',
  focus: '#ffffff',
  warn: '#ffb238',
}

const FLOOR = 0.022
const up = new THREE.Vector3(0, 1, 0)

export function resolveAnchor(frame: WorldFrame, anchor: Anchor): Point2 | null {
  if (typeof anchor === 'string') {
    const player = frame.players.find(p => p.id === anchor)
    return player ? { x: player.x, z: player.z } : null
  }
  return anchor
}

function material(tone: Tone, opacity: number, additive = true) {
  return new THREE.MeshBasicMaterial({
    color: TONES[tone], transparent: true, opacity, depthWrite: false, toneMapped: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide,
  })
}

/** Soft-edged gradient texture shared by discs and ribbons. */
let gradientTexture: THREE.Texture | null = null
function softTexture() {
  if (gradientTexture) return gradientTexture
  const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 64
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, 64)
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.28, 'rgba(255,255,255,.9)'); g.addColorStop(0.5, 'rgba(255,255,255,1)')
  g.addColorStop(0.72, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 64)
  gradientTexture = new THREE.CanvasTexture(canvas)
  return gradientTexture
}
let radialTexture: THREE.Texture | null = null
function radial() {
  if (radialTexture) return radialTexture
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(0.75, 'rgba(255,255,255,.28)'); g.addColorStop(0.94, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128)
  radialTexture = new THREE.CanvasTexture(canvas)
  return radialTexture
}

/** Floor ribbon along a polyline: width in metres, UV.y across, UV.x along. */
function ribbonGeometry(points: Point2[], width: number, y: number, arrow: boolean): THREE.BufferGeometry {
  const pts = points.length >= 2 ? points : [points[0] ?? { x: 0, z: 0 }, points[0] ?? { x: 0, z: 0 }]
  const positions: number[] = [], uvs: number[] = [], index: number[] = []
  let along = 0
  const arrowLength = arrow ? Math.min(0.55, width * 3.2) : 0
  const total = pts.reduce((sum, p, i) => i ? sum + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0, 0)
  // Trim the shaft so the arrowhead owns the final segment.
  let trimmed = pts
  if (arrow && total > arrowLength * 1.2) {
    trimmed = []
    let acc = 0
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) { trimmed.push(pts[0]); continue }
      const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
      if (acc + seg >= total - arrowLength) {
        const u = (total - arrowLength - acc) / (seg || 1)
        trimmed.push({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u, z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * u })
        break
      }
      acc += seg; trimmed.push(pts[i])
    }
  }
  for (let i = 0; i < trimmed.length; i++) {
    const prev = trimmed[Math.max(0, i - 1)], next = trimmed[Math.min(trimmed.length - 1, i + 1)]
    let dx = next.x - prev.x, dz = next.z - prev.z
    const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len
    const nx = -dz * width / 2, nz = dx * width / 2
    if (i) along += Math.hypot(trimmed[i].x - trimmed[i - 1].x, trimmed[i].z - trimmed[i - 1].z)
    positions.push(trimmed[i].x + nx, y, trimmed[i].z + nz, trimmed[i].x - nx, y, trimmed[i].z - nz)
    uvs.push(along, 0, along, 1)
    if (i) { const b = (i - 1) * 2; index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2) }
  }
  if (arrow && pts.length >= 2) {
    const end = pts[pts.length - 1], from = trimmed[trimmed.length - 1]
    let dx = end.x - from.x, dz = end.z - from.z
    const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len
    const half = width * 1.6, base = positions.length / 3
    positions.push(from.x - dz * half, y, from.z + dx * half, from.x + dz * half, y, from.z - dx * half, end.x, y, end.z)
    uvs.push(along, 0, along, 1, along + arrowLength, 0.5)
    index.push(base, base + 1, base + 2)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(index)
  geometry.computeBoundingSphere()
  return geometry
}

interface Entry { object: THREE.Object3D; signature: string; mark: Mark; born: number }

/** Keyed, pooled renderer for analytical marks. Geometry rebuilds only when a
 * mark's spatial signature changes; per-frame anchored marks update in place. */
export class MarkLayer {
  readonly root = new THREE.Group()
  private entries = new Map<string, Entry>()
  private dashTexture: THREE.Texture

  constructor(scene: THREE.Scene) {
    this.root.name = 'analytical-marks'
    this.root.renderOrder = 10
    scene.add(this.root)
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 4
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 18, 4)
    this.dashTexture = new THREE.CanvasTexture(canvas)
    this.dashTexture.wrapS = THREE.RepeatWrapping
  }

  /** Returns true if any mark animates (needs continuous rendering). */
  update(marks: Mark[], frame: WorldFrame, now: number, fade = 1): boolean {
    const seen = new Set<string>()
    let animating = false
    for (const mark of marks) {
      seen.add(mark.id)
      const signature = this.signature(mark, frame)
      let entry = this.entries.get(mark.id)
      if (!entry || entry.signature !== signature) {
        if (entry) this.dispose(entry)
        const object = this.build(mark, frame)
        if (!object) continue
        entry = { object, signature, mark, born: entry?.born ?? now }
        this.entries.set(mark.id, entry); this.root.add(object)
      }
      entry.mark = mark
      this.place(entry, frame)
      const age = Math.min(1, (now - entry.born) / 320)
      if (age < 1) animating = true
      const pulse = 'pulse' in mark && mark.pulse
      if (pulse) animating = true
      const base = (mark.opacity ?? defaultOpacity(mark)) * fade * (age * age * (3 - 2 * age))
      entry.object.traverse(o => {
        const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined
        if (!m) return
        const role = (o.userData.role as string) ?? 'main'
        m.opacity = base * (role === 'halo' ? 0.35 : 1) * (pulse && role === 'halo' ? 0.6 + 0.4 * Math.sin(now / 230) : 1)
      })
      if (pulse) {
        const halo = entry.object.getObjectByName('halo')
        if (halo) { const s = 1 + 0.18 * (0.5 + 0.5 * Math.sin(now / 230)); halo.scale.set(s, s, 1) }
      }
    }
    for (const [id, entry] of this.entries) if (!seen.has(id)) { this.dispose(entry); this.entries.delete(id) }
    return animating
  }

  private signature(mark: Mark, frame: WorldFrame): string {
    switch (mark.kind) {
      case 'path': return `p:${mark.tone}:${mark.width}:${mark.arrow}:${mark.dashed}:${mark.lift}:${mark.points.map(p => `${p.x.toFixed(2)},${p.z.toFixed(2)}`).join(';')}`
      case 'lane': case 'tether': {
        const a = resolveAnchor(frame, mark.from), b = resolveAnchor(frame, mark.to)
        return `${mark.kind}:${mark.tone}:${mark.width}:${a?.x.toFixed(2)},${a?.z.toFixed(2)}:${b?.x.toFixed(2)},${b?.z.toFixed(2)}`
      }
      case 'wedge': {
        const a = resolveAnchor(frame, mark.apex), b = resolveAnchor(frame, mark.toward)
        return `w:${mark.tone}:${mark.length.toFixed(2)}:${mark.spread.toFixed(2)}:${a?.x.toFixed(2)},${a?.z.toFixed(2)}:${b?.x.toFixed(2)},${b?.z.toFixed(2)}`
      }
      case 'ring': return `r:${mark.tone}:${mark.radius ?? 0.55}`
      case 'disc': return `d:${mark.tone}:${mark.radius.toFixed(2)}:${mark.edge}`
    }
  }

  private build(mark: Mark, frame: WorldFrame): THREE.Object3D | null {
    const group = new THREE.Group()
    if (mark.kind === 'ring') {
      const r = mark.radius ?? 0.55
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.045, r, 64), material(mark.tone, 1))
      ring.rotation.x = -Math.PI / 2
      const halo = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.22, 64), new THREE.MeshBasicMaterial({ map: softTexture(), color: TONES[mark.tone], transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }))
      halo.rotation.x = -Math.PI / 2; halo.name = 'halo'; halo.userData.role = 'halo'
      const holder = new THREE.Group(); holder.add(ring)
      group.add(holder); group.add(halo)
      // Halo scales on its own XY plane (rotated), so wrap rotation in place.
      return group
    }
    if (mark.kind === 'disc') {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(mark.radius, 72), new THREE.MeshBasicMaterial({ map: radial(), color: TONES[mark.tone], transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }))
      disc.rotation.x = -Math.PI / 2
      group.add(disc)
      if (mark.edge) {
        const edge = new THREE.Mesh(new THREE.RingGeometry(mark.radius - 0.03, mark.radius, 96), material(mark.tone, 1))
        edge.rotation.x = -Math.PI / 2; group.add(edge)
      }
      return group
    }
    if (mark.kind === 'path') {
      const width = mark.width ?? 0.16
      const geometry = ribbonGeometry(mark.points, width, FLOOR + (mark.lift ?? 0), !!mark.arrow)
      const mat = new THREE.MeshBasicMaterial({ color: TONES[mark.tone], transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, map: mark.dashed ? this.dashTexture.clone() : null })
      if (mark.dashed && mat.map) { mat.map.wrapS = THREE.RepeatWrapping; mat.map.repeat.set(2.2, 1); mat.map.needsUpdate = true }
      const mesh = new THREE.Mesh(geometry, mat)
      group.add(mesh)
      const glow = new THREE.Mesh(ribbonGeometry(mark.points, width * 3.2, FLOOR + (mark.lift ?? 0) - 0.002, false), new THREE.MeshBasicMaterial({ map: softTexture(), color: TONES[mark.tone], transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
      glow.userData.role = 'halo'; group.add(glow)
      return group
    }
    if (mark.kind === 'lane' || mark.kind === 'tether') {
      const a = resolveAnchor(frame, mark.from), b = resolveAnchor(frame, mark.to)
      if (!a || !b) return null
      const width = mark.width ?? (mark.kind === 'lane' ? 0.5 : 0.07)
      if (mark.kind === 'lane') {
        // A passing volume: a tapered band at chest height from passer to receiver.
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1
        const nx = -dz / len, nz = dx / len, w0 = 0.12, w1 = width
        const y0 = 1.25, y1 = 1.15
        const positions = [a.x + nx * w0, y0, a.z + nz * w0, a.x - nx * w0, y0, a.z - nz * w0, b.x + nx * w1, y1, b.z + nz * w1, b.x - nx * w1, y1, b.z - nz * w1]
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0, 1, 1], 2)); geo.setIndex([0, 1, 2, 1, 3, 2])
        const band = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: softTexture(), color: TONES[mark.tone], transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
        group.add(band)
        // Floor shadow of the lane grounds it spatially.
        const shadow = new THREE.Mesh(ribbonGeometry([a, b], w1 * 0.8, FLOOR, false), new THREE.MeshBasicMaterial({ map: softTexture(), color: TONES[mark.tone], transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
        shadow.userData.role = 'halo'; group.add(shadow)
        return group
      }
      const mesh = new THREE.Mesh(ribbonGeometry([a, b], width, FLOOR + 0.004, false), material(mark.tone, 1))
      group.add(mesh)
      const glow = new THREE.Mesh(ribbonGeometry([a, b], width * 4, FLOOR, false), new THREE.MeshBasicMaterial({ map: softTexture(), color: TONES[mark.tone], transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
      glow.userData.role = 'halo'; group.add(glow)
      return group
    }
    if (mark.kind === 'wedge') {
      const a = resolveAnchor(frame, mark.apex), b = resolveAnchor(frame, mark.toward)
      if (!a || !b) return null
      const angle = Math.atan2(b.x - a.x, b.z - a.z), segments = 24
      const positions = [a.x, FLOOR, a.z], uvs = [0, 0.5]
      for (let i = 0; i <= segments; i++) {
        const t = angle - mark.spread / 2 + mark.spread * i / segments
        positions.push(a.x + Math.sin(t) * mark.length, FLOOR, a.z + Math.cos(t) * mark.length); uvs.push(1, i / segments)
      }
      const index: number[] = []
      for (let i = 0; i < segments; i++) index.push(0, i + 1, i + 2)
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(index)
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 4
      const ctx = canvas.getContext('2d')!, g = ctx.createLinearGradient(0, 0, 64, 0)
      g.addColorStop(0, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 4)
      group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), color: TONES[mark.tone], transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })))
      return group
    }
    return null
  }

  private place(entry: Entry, frame: WorldFrame) {
    const mark = entry.mark
    if (mark.kind === 'ring') {
      const p = resolveAnchor(frame, mark.at)
      entry.object.visible = !!p
      if (p) entry.object.position.set(p.x, FLOOR + 0.003, p.z)
    } else if (mark.kind === 'disc') {
      const p = resolveAnchor(frame, mark.center)
      entry.object.visible = !!p
      if (p) entry.object.position.set(p.x, FLOOR - 0.004, p.z)
    }
  }

  private dispose(entry: Entry) {
    this.root.remove(entry.object)
    entry.object.traverse(o => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose()
      const m = mesh.material as THREE.MeshBasicMaterial | undefined
      if (m) { if (m.map && m.map !== gradientTexture && m.map !== radialTexture && m.map !== this.dashTexture) m.map.dispose(); m.dispose() }
    })
  }

  clear() { for (const entry of this.entries.values()) this.dispose(entry); this.entries.clear() }
}

function defaultOpacity(mark: Mark): number {
  switch (mark.kind) {
    case 'ring': return 0.95
    case 'disc': return 0.32
    case 'path': return 0.85
    case 'lane': return 0.5
    case 'tether': return 0.8
    case 'wedge': return 0.45
  }
}

export const _internals = { ribbonGeometry, up }
export type { PlayerId }
