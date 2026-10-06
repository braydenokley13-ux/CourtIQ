import * as THREE from 'three'
import type { PlayerId, Point2, WorldFrame } from '@/lib/defense-lab/types'
import type { Anchor, Mark, Tone } from './types'

/** Analytical palette. Hues are deliberately off the maple floor (orange/yellow
 * wood) so a mark never dissolves into the court. */
export const TONES: Record<Tone, string> = {
  threat: '#ff2e63',
  good: '#3ee0a1',
  defense: '#3fb0ff',
  offense: '#f2d48a',
  neutral: '#c9d3dc',
  ghost: '#b9c7ff',
  attack: '#ff3d6e',
  focus: '#ffffff',
  warn: '#ffe14d',
}

const FLOOR = 0.022
/** Radial segment multiplier (quality tier). Set by the runtime before marks are built. */
let detail = 1
export function setMarkDetail(d: number) { detail = Math.min(1, Math.max(0.25, d || 1)) }
const seg = (n: number) => Math.max(12, Math.round(n * detail))
const up = new THREE.Vector3(0, 1, 0)
/** Marks always draw after the environment (floor overlays, haze, vignette). A Group's
 * renderOrder does NOT reach nested groups' meshes, so every mesh carries its own. */
export const MARK_ORDER = { under: 20, main: 21, halo: 22, top: 23 } as const
type Role = keyof typeof MARK_ORDER

export function resolveAnchor(frame: WorldFrame, anchor: Anchor): Point2 | null {
  if (typeof anchor === 'string') {
    const player = frame.players.find(p => p.id === anchor)
    return player ? { x: player.x, z: player.z } : null
  }
  return anchor
}

// --------------------------------------------------------------- materials

const common = { transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide } as const
const stroke = () => new THREE.MeshBasicMaterial({ ...common, color: '#02050a', opacity: 0.5, blending: THREE.NormalBlending })
const solid = (tone: Tone, map: THREE.Texture | null = null) => new THREE.MeshBasicMaterial({ ...common, color: TONES[tone], map, blending: THREE.AdditiveBlending })
const glow = (tone: Tone, map: THREE.Texture) => new THREE.MeshBasicMaterial({ ...common, color: TONES[tone], map, blending: THREE.AdditiveBlending })

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
  const ctx = canvas.getContext('2d')!, g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(0.75, 'rgba(255,255,255,.28)'); g.addColorStop(0.94, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128)
  radialTexture = new THREE.CanvasTexture(canvas)
  return radialTexture
}
let headTexture: THREE.Texture | null = null
function headGlow() {
  if (headTexture) return headTexture
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')!, g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64)
  headTexture = new THREE.CanvasTexture(canvas)
  return headTexture
}
let wedgeTexture: THREE.Texture | null = null
function wedgeFade() {
  if (wedgeTexture) return wedgeTexture
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 4
  const ctx = canvas.getContext('2d')!, g = ctx.createLinearGradient(0, 0, 64, 0)
  g.addColorStop(0, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 4)
  wedgeTexture = new THREE.CanvasTexture(canvas)
  return wedgeTexture
}
const shared = () => [gradientTexture, radialTexture, headTexture, wedgeTexture]

const VERT = `varying vec2 vUv; varying vec3 vW;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`

/** Glass corridor: faint faces, bright edges, chevrons running toward the receiver,
 * hatched when blocked, with notches where a defender's hand arrives in time. */
function glassMaterial(tone: Tone, blocked: boolean, cuts: [number, number][], length: number) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(TONES[tone]) }, uCutColor: { value: new THREE.Color(TONES.threat) },
      uOpacity: { value: 1 }, uTime: { value: 0 }, uBlocked: { value: blocked ? 1 : 0 }, uLen: { value: length },
      uCut: { value: [new THREE.Vector2(-1, -1), new THREE.Vector2(-1, -1), new THREE.Vector2(-1, -1)] },
    },
    vertexShader: VERT,
    fragmentShader: `uniform vec3 uColor; uniform vec3 uCutColor; uniform float uOpacity, uTime, uBlocked, uLen; uniform vec2 uCut[3];
varying vec2 vUv; varying vec3 vW;
void main(){
  float u = vUv.x, v = vUv.y;
  float edge = pow(1.0 - min(v, 1.0 - v) * 2.0, 4.0);
  float a = 0.12 + edge * 0.85;
  vec3 col = uColor;
  float c = fract(u * uLen * 0.8 - uTime * 0.0012 - abs(v - 0.5) * 0.7);
  float chev = smoothstep(0.0, 0.08, c) * smoothstep(0.34, 0.22, c);
  a += chev * 0.45 * (1.0 - uBlocked);
  if (uBlocked > 0.5) { float h = step(0.5, fract((u * uLen + v) * 2.6)); a = (0.05 + edge * 0.4) * (0.35 + 0.65 * h); }
  for (int i = 0; i < 3; i++) {
    vec2 k = uCut[i];
    if (k.y > k.x) { float inside = smoothstep(k.x - 0.015, k.x, u) * (1.0 - smoothstep(k.y, k.y + 0.015, u)); a *= (1.0 - 0.85 * inside); col = mix(col, uCutColor, inside * 0.9); a += inside * edge * 0.5; }
  }
  a *= smoothstep(0.0, 0.05, u);
  gl_FragColor = vec4(col, a * uOpacity);
}`,
  })
  m.userData.shader = true
  const list = m.uniforms.uCut.value as THREE.Vector2[]
  cuts.slice(0, 3).forEach((c, i) => list[i].set(c[0], c[1]))
  return m
}

const MAX_SRC = 6
/** Arrival map: for every floor point, when does the fastest defender get there?
 * Same kinematics as the arrival estimator (reaction + accelerate + cap). */
function arrivalMaterial() {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
    uniforms: {
      uSrc: { value: Array.from({ length: MAX_SRC }, () => new THREE.Vector4(0, 0, 0, 0)) }, uN: { value: 0 },
      uAccel: { value: 6.2 }, uVmax: { value: 4.7 }, uReact: { value: 0.3 }, uContest: { value: 1.25 }, uBall: { value: -1 },
      uOpacity: { value: 1 }, uTime: { value: 0 },
      uBand: { value: new THREE.Color(TONES.defense) }, uThreat: { value: new THREE.Color(TONES.threat) },
    },
    vertexShader: VERT,
    fragmentShader: `uniform vec4 uSrc[${MAX_SRC}]; uniform int uN; uniform float uAccel, uVmax, uReact, uContest, uBall, uOpacity, uTime; uniform vec3 uBand, uThreat;
varying vec2 vUv; varying vec3 vW;
float travelT(float d, float v0){
  if (d <= 0.0) return 0.0;
  float v = clamp(v0, -uVmax, uVmax); float capT = (uVmax - v) / uAccel; float capD = v * capT + 0.5 * uAccel * capT * capT;
  if (d <= capD) return (sqrt(v * v + 2.0 * uAccel * d) - v) / uAccel;
  return capT + (d - capD) / uVmax;
}
void main(){
  float T = 99.0;
  for (int i = 0; i < ${MAX_SRC}; i++) {
    if (i >= uN) break;
    vec4 s = uSrc[i]; vec2 d = vW.xz - s.xy; float gap = length(d);
    float proj = gap > 0.001 ? dot(d, s.zw) / gap : 0.0;
    float t = uReact + travelT(gap - uContest, proj * 0.6);
    T = min(T, t);
  }
  float step_ = 0.25;
  float band = floor(T / step_);
  float f = fract(T / step_);
  float w = max(fwidth(T) / step_, 0.015);
  float line = (1.0 - smoothstep(0.0, w * 1.6, min(f, 1.0 - f))) * step(band, 6.0) * step(0.5, T);
  float fill = 0.46 * pow(0.66, max(band - 1.0, 0.0)) * step(band, 6.0);
  float beyond = 0.0, ballLine = 0.0;
  if (uBall > 0.0) {
    beyond = smoothstep(uBall, uBall + 0.03, T);
    ballLine = 1.0 - smoothstep(0.0, max(fwidth(T) * 2.4, 0.01), abs(T - uBall));
  }
  vec3 col = uBand; float a = fill * (1.0 - beyond) + line * 0.55;
  col = mix(col, vec3(1.0), line * 0.5);
  col = mix(col, uThreat, beyond);
  a += beyond * (0.16 + 0.1 * sin(uTime * 0.004));
  col = mix(col, vec3(1.0), ballLine);
  a = max(a, ballLine * 0.95);
  if (T > 40.0) a = beyond * 0.16;
  gl_FragColor = vec4(col, a * uOpacity);
}`,
  })
  m.userData.shader = true
  return m
}

const setOpacity = (m: THREE.Material, v: number) => {
  const u = (m as THREE.ShaderMaterial).uniforms
  if (u?.uOpacity) u.uOpacity.value = v; else m.opacity = v
}

// ---------------------------------------------------------------- geometry

interface Geo { pos: number[]; uv: number[]; idx: number[] }

/** Floor ribbon along a polyline: width in metres, UV.y across, UV.x along. */
function ribbonGeo(points: Point2[], width: number, y: number, arrow: boolean): Geo {
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
  return { pos: positions, uv: uvs, idx: index }
}
const ribbonGeometry = (points: Point2[], width: number, y: number, arrow: boolean) => toGeometry(ribbonGeo(points, width, y, arrow))

function toGeometry(g: Geo): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2))
  geometry.setIndex(g.idx)
  geometry.computeBoundingSphere()
  return geometry
}

const STRING_SEG = 14
/** Chest-height duty string: two crossed ribbons along a drooping line, so it reads from any angle. */
function stringGeo(a: Point2, b: Point2, o: { y: number; sag: number; width: number; jitter: number; time: number; inset: number; bias: number }): Geo {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len
  const sx = a.x + ux * Math.min(o.inset, len * 0.3), sz = a.z + uz * Math.min(o.inset, len * 0.3)
  const ex = b.x - ux * Math.min(o.inset, len * 0.3), ez = b.z - uz * Math.min(o.inset, len * 0.3)
  const nx = -uz, nz = ux
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  for (let i = 0; i <= STRING_SEG; i++) {
    const t = i / STRING_SEG
    const wob = o.jitter * Math.sin(t * 19 + o.time * 0.03) * Math.sin(t * Math.PI) + o.bias * Math.sin(t * Math.PI)
    const x = sx + (ex - sx) * t + nx * wob, z = sz + (ez - sz) * t + nz * wob
    const y = o.y - o.sag * 4 * t * (1 - t)
    const h = o.width / 2
    pos.push(x, y + h, z, x, y - h, z, x + nx * h, y, z + nz * h, x - nx * h, y, z - nz * h)
    uv.push(t * len, 0, t * len, 1, t * len, 0, t * len, 1)
    if (i) { const p = (i - 1) * 4, q = i * 4; idx.push(p, p + 1, q, p + 1, q + 1, q, p + 2, p + 3, q + 2, p + 3, q + 3, q + 2) }
  }
  return { pos, uv, idx }
}

const GLASS_SEG = 18
/** Glass corridor: a rectangular prism following the flight arc, tapering toward the receiver. */
function glassGeo(a: Point2, b: Point2, w0: number, w1: number, apex: number, thick: number): Geo {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  for (let i = 0; i <= GLASS_SEG; i++) {
    const t = i / GLASS_SEG
    const x = a.x + dx * t, z = a.z + dz * t
    const w = w0 + (w1 - w0) * t
    const yc = 1.2 + 4 * Math.max(0, apex - 1.2) * t * (1 - t) - 0.1 * t
    const hy = thick / 2
    // Four faces, each its own pair of vertices so edges stay crisp: v runs 0..1 across the face.
    const c = [[-w, -hy], [-w, hy], [w, hy], [w, -hy], [-w, -hy]]
    for (let f = 0; f < 4; f++) {
      for (const k of [0, 1]) { const [s, yy] = c[f + k]; pos.push(x + nx * s, yc + yy, z + nz * s); uv.push(t, k) }
    }
    if (i) {
      const p = (i - 1) * 8, q = i * 8
      for (let f = 0; f < 4; f++) { const pa = p + f * 2, qa = q + f * 2; idx.push(pa, pa + 1, qa, pa + 1, qa + 1, qa) }
    }
  }
  return { pos, uv, idx }
}

function crossedVertical(height: number, width: number): Geo {
  const h = width / 2
  return { pos: [-h, 0, 0, h, 0, 0, -h, height, 0, h, height, 0, 0, 0, -h, 0, 0, h, 0, height, -h, 0, height, h], uv: [0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 1], idx: [0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6] }
}

function wedgeGeo(a: Point2, b: Point2, length: number, spread: number): Geo {
  const angle = Math.atan2(b.x - a.x, b.z - a.z), segments = 24
  const pos = [a.x, FLOOR, a.z], uv = [0, 0.5]
  for (let i = 0; i <= segments; i++) {
    const t = angle - spread / 2 + spread * i / segments
    pos.push(a.x + Math.sin(t) * length, FLOOR, a.z + Math.cos(t) * length); uv.push(1, i / segments)
  }
  const idx: number[] = []
  for (let i = 0; i < segments; i++) idx.push(0, i + 1, i + 2)
  return { pos, uv, idx }
}

// ------------------------------------------------------------------- layer

interface Entry { object: THREE.Object3D; signature: string; mark: Mark; born: number; shape: string }

const dynamic = (m: Mark) => m.kind === 'tether' && m.y !== undefined

/** Keyed, pooled renderer for analytical marks. Structure (meshes, materials) is
 * built once per signature; vertex data is rewritten in place as actors move. */
export class MarkLayer {
  readonly root = new THREE.Group()
  private entries = new Map<string, Entry>()
  private dashTexture: THREE.Texture

  constructor(scene: THREE.Scene) {
    this.root.name = 'analytical-marks'
    this.root.renderOrder = MARK_ORDER.under
    scene.add(this.root)
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 4
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 18, 4)
    this.dashTexture = new THREE.CanvasTexture(canvas)
    this.dashTexture.wrapS = THREE.RepeatWrapping
  }

  get size() { return this.entries.size }
  /** Every mesh currently drawn (for structural checks). */
  meshes(): THREE.Mesh[] { const out: THREE.Mesh[] = []; this.root.traverse(o => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh) }); return out }

  /** Returns true if any mark animates (needs continuous rendering). */
  update(marks: Mark[], frame: WorldFrame, now: number, fade = 1, xray = 1): boolean {
    const additive = xray >= 0.5
    const seen = new Set<string>()
    let animating = false
    for (const mark of marks) {
      seen.add(mark.id)
      const signature = this.signature(mark), shape = dynamic(mark) ? '' : this.shape(mark, frame)
      let entry = this.entries.get(mark.id)
      if (!entry || entry.signature !== signature) {
        if (entry) this.dispose(entry)
        const object = this.build(mark, frame)
        if (!object) continue
        entry = { object, signature, shape, mark, born: entry?.born ?? now }
        this.entries.set(mark.id, entry); this.root.add(object)
      } else if (entry.shape !== shape) {
        entry.mark = mark; entry.shape = shape
        this.reshape(entry, frame)
      }
      entry.mark = mark
      this.place(entry, frame, now)
      const age = Math.min(1, (now - entry.born) / 320)
      if (age < 1) animating = true
      const pulse = 'pulse' in mark && mark.pulse
      if (pulse) animating = true
      let opacityMul = 1
      if (mark.kind === 'path' && mark.grow) {
        const u = Math.min(1, (now - entry.born) / mark.grow), eased = 1 - (1 - u) ** 3
        if (u < 1) animating = true
        entry.object.traverse(o => {
          const g = (o as THREE.Mesh).geometry
          if (g?.index) g.setDrawRange(0, Math.max(3, Math.floor(g.index.count * eased / 3) * 3))
        })
      }
      if (mark.kind === 'comet') { const r = this.animateComet(entry, now); animating = animating || r.animating; opacityMul = r.opacity }
      if (mark.kind === 'flare') { const r = this.animateFlare(entry, now); animating = animating || r.animating; opacityMul = r.opacity }
      if (mark.kind === 'arrival' || mark.kind === 'lane' || (mark.kind === 'tether' && (mark.fray || (mark.flash ?? 0) > 0))) animating = true
      const base = (('opacity' in mark ? mark.opacity : undefined) ?? defaultOpacity(mark)) * fade * (age * age * (3 - 2 * age)) * opacityMul
      entry.object.traverse(o => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined
        if (!m) return
        const role = (o.userData.role as string) ?? 'main'
        const u = (m as THREE.ShaderMaterial).uniforms
        if (u?.uTime) u.uTime.value = now
        if (role === 'always') { setOpacity(m, base); return }
        const k = role === 'halo' ? 0.35 * (pulse ? 0.6 + 0.4 * Math.sin(now / 230) : 1) : role === 'under' ? 0.6 : 1
        setOpacity(m, base * k)
        if (role === 'main' && !u) (m as THREE.MeshBasicMaterial).blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending
      })
      if (pulse) {
        const halo = entry.object.getObjectByName('halo')
        if (halo) { const s = 1 + 0.18 * (0.5 + 0.5 * Math.sin(now / 230)); halo.scale.set(s, s, 1) }
      }
    }
    for (const [id, entry] of this.entries) if (!seen.has(id)) { this.dispose(entry); this.entries.delete(id) }
    return animating
  }

  /** Structure: what meshes/materials exist. Shape: where vertices are. */
  private signature(mark: Mark): string {
    switch (mark.kind) {
      case 'path': return `p:${mark.tone}:${mark.width}:${mark.arrow}:${mark.dashed}:${mark.lift}:${mark.points.length}`
      case 'lane': return `l:${mark.tone}:${mark.width}:${mark.arc}:${!!mark.blocked}:${(mark.cuts ?? []).map(c => c.map(n => n.toFixed(2))).join('|')}`
      case 'tether': return `${mark.kind}:${mark.tone}:${mark.width}:${mark.y}:${mark.fray}`
      case 'wedge': return `w:${mark.tone}:${mark.length.toFixed(2)}:${mark.spread.toFixed(2)}`
      case 'ring': return `r:${mark.tone}:${mark.radius ?? 0.55}`
      case 'disc': return `d:${mark.tone}:${mark.radius.toFixed(2)}:${mark.edge}`
      case 'arrival': return `a:${mark.sources.length}`
      case 'pin': return `pin:${mark.tone}:${mark.height}:${mark.radius}`
      case 'comet': return `c:${mark.outcome}:${mark.points.length}:${mark.selected}:${mark.points[0]?.x.toFixed(2)},${mark.points[0]?.z.toFixed(2)}:${mark.points.at(-1)?.x.toFixed(2)},${mark.points.at(-1)?.z.toFixed(2)}`
      case 'flare': return `f:${mark.tone}:${mark.radius}`
    }
  }
  private shape(mark: Mark, frame: WorldFrame): string {
    const f = (p: Point2 | null) => p ? `${p.x.toFixed(3)},${p.z.toFixed(3)}` : '-'
    switch (mark.kind) {
      case 'path': return mark.points.map(f).join(';')
      case 'lane': case 'tether': return `${f(resolveAnchor(frame, mark.from))}>${f(resolveAnchor(frame, mark.to))}`
      case 'wedge': return `${f(resolveAnchor(frame, mark.apex))}>${f(resolveAnchor(frame, mark.toward))}`
      default: return ''
    }
  }

  /** Vertex data per mesh, in the order build() creates them. */
  private geometries(mark: Mark, frame: WorldFrame, now = 0): Geo[] | null {
    switch (mark.kind) {
      case 'path': {
        const w = mark.width ?? 0.16, y = FLOOR + (mark.lift ?? 0)
        return [ribbonGeo(mark.points, w * 1.9, y - 0.003, !!mark.arrow), ribbonGeo(mark.points, w, y, !!mark.arrow), ribbonGeo(mark.points, w * 3.2, y - 0.002, false)]
      }
      case 'comet': {
        const w = mark.selected ? 0.16 : 0.09
        return [ribbonGeo(mark.points, w * 1.9, FLOOR - 0.003, false), ribbonGeo(mark.points, w, FLOOR, false), ribbonGeo(mark.points, w * 3.4, FLOOR - 0.002, false)]
      }
      case 'lane': {
        const a = resolveAnchor(frame, mark.from), b = resolveAnchor(frame, mark.to)
        if (!a || !b) return null
        const w1 = mark.width ?? 0.5
        return [glassGeo(a, b, 0.1, w1, mark.arc ?? 1.25, 0.2), ribbonGeo([a, b], w1 * 1.6, FLOOR - 0.004, false)]
      }
      case 'tether': {
        const a = resolveAnchor(frame, mark.from), b = resolveAnchor(frame, mark.to)
        if (!a || !b) return null
        const width = mark.width ?? 0.07
        if (mark.y !== undefined) {
          const flash = mark.flash ?? 0
          const o = { y: mark.y, sag: mark.sag ?? 0.05, width: width * (1 + flash * 1.4), jitter: mark.fray ? 0.07 : 0, time: now, inset: 0.32, bias: 0 }
          return [stringGeo(a, b, o), stringGeo(a, b, { ...o, width: width * 4 })]
        }
        return [ribbonGeo([a, b], width * 1.9, FLOOR, false), ribbonGeo([a, b], width, FLOOR + 0.004, false), ribbonGeo([a, b], width * 4, FLOOR, false)]
      }
      case 'wedge': {
        const a = resolveAnchor(frame, mark.apex), b = resolveAnchor(frame, mark.toward)
        if (!a || !b) return null
        return [wedgeGeo(a, b, mark.length, mark.spread)]
      }
      default: return null
    }
  }

  /** Rewrite vertex data in place, reusing GPU buffers when sizes match. */
  private reshape(entry: Entry, frame: WorldFrame, now = 0) {
    const geos = this.geometries(entry.mark, frame, now)
    if (!geos) return
    const meshes: THREE.Mesh[] = []
    entry.object.traverse(o => { if ((o as THREE.Mesh).isMesh && o.userData.part !== undefined) meshes.push(o as THREE.Mesh) })
    meshes.sort((a, b) => a.userData.part - b.userData.part)
    meshes.forEach((mesh, i) => {
      const g = geos[i]; if (!g) return
      const a = mesh.geometry.getAttribute('position') as THREE.BufferAttribute, ua = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute
      if (a.count * 3 === g.pos.length && ua.count * 2 === g.uv.length) {
        ;(a.array as Float32Array).set(g.pos); a.needsUpdate = true
        ;(ua.array as Float32Array).set(g.uv); ua.needsUpdate = true
        mesh.geometry.computeBoundingSphere()
      } else {
        mesh.geometry.dispose(); mesh.geometry = toGeometry(g)
      }
    })
  }

  private mesh(group: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, role: Role | 'halo', order: Role, part?: number, name?: string) {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.renderOrder = MARK_ORDER[order]; mesh.frustumCulled = false
    mesh.userData.role = role === 'main' || role === 'under' || role === 'halo' ? role : 'main'
    if (part !== undefined) mesh.userData.part = part
    if (name) mesh.name = name
    group.add(mesh)
    return mesh
  }

  private build(mark: Mark, frame: WorldFrame): THREE.Object3D | null {
    const group = new THREE.Group()
    group.renderOrder = MARK_ORDER.under
    const flat = (m: THREE.Mesh) => { m.rotation.x = -Math.PI / 2; return m }
    if (mark.kind === 'ring') {
      const r = mark.radius ?? 0.55
      flat(this.mesh(group, new THREE.RingGeometry(r - 0.07, r + 0.03, seg(64)), stroke(), 'under', 'under'))
      flat(this.mesh(group, new THREE.RingGeometry(r - 0.045, r, seg(64)), solid(mark.tone), 'main', 'main'))
      const halo = flat(this.mesh(group, new THREE.RingGeometry(r, r + 0.22, seg(64)), glow(mark.tone, softTexture()), 'halo', 'halo', undefined, 'halo'))
      halo.userData.role = 'halo'
      return group
    }
    if (mark.kind === 'disc') {
      flat(this.mesh(group, new THREE.CircleGeometry(mark.radius, seg(72)), glow(mark.tone, radial()), 'halo', 'main'))
      group.children[0].userData.role = 'always'
      if (mark.edge) {
        flat(this.mesh(group, new THREE.RingGeometry(mark.radius - 0.05, mark.radius + 0.015, seg(96)), stroke(), 'under', 'under'))
        flat(this.mesh(group, new THREE.RingGeometry(mark.radius - 0.03, mark.radius, seg(96)), solid(mark.tone), 'main', 'main'))
      }
      return group
    }
    if (mark.kind === 'arrival') {
      const mat = arrivalMaterial()
      const plane = flat(this.mesh(group, new THREE.PlaneGeometry(15.24, 14.326), mat, 'main', 'under'))
      plane.userData.role = 'always'; plane.position.set(0, FLOOR - 0.006, 14.326 / 2)
      plane.rotation.x = -Math.PI / 2
      return group
    }
    if (mark.kind === 'pin') {
      const r = mark.radius ?? 0.28, h = mark.height ?? 2.1
      flat(this.mesh(group, new THREE.RingGeometry(r - 0.06, r + 0.025, seg(48)), stroke(), 'under', 'under'))
      flat(this.mesh(group, new THREE.RingGeometry(r - 0.04, r, seg(48)), solid(mark.tone), 'main', 'main'))
      this.mesh(group, toGeometry(crossedVertical(h, 0.035)), solid(mark.tone, softTexture()), 'main', 'main')
      const line = this.mesh(group, toGeometry(crossedVertical(h, 0.28)), glow(mark.tone, softTexture()), 'halo', 'halo')
      line.userData.role = 'halo'
      const cap = this.mesh(group, new THREE.SphereGeometry(0.06, 10, 8), solid(mark.tone), 'main', 'main')
      cap.position.y = h
      return group
    }
    if (mark.kind === 'flare') {
      const r = mark.radius ?? 1.1
      const ring = flat(this.mesh(group, new THREE.RingGeometry(0.9, 1, seg(64)), solid(mark.tone), 'main', 'top', undefined, 'ring'))
      ring.userData.role = 'always'
      const disc = flat(this.mesh(group, new THREE.CircleGeometry(1, seg(48)), glow(mark.tone, radial()), 'halo', 'halo', undefined, 'disc'))
      disc.userData.role = 'always'
      const beam = this.mesh(group, toGeometry(crossedVertical(3.2, 0.9)), glow(mark.tone, softTexture()), 'halo', 'halo', undefined, 'beam')
      beam.userData.role = 'always'
      group.userData.radius = r
      return group
    }
    if (mark.kind === 'comet') {
      const geos = this.geometries(mark, frame)!
      this.mesh(group, toGeometry(geos[0]), stroke(), 'under', 'under', 0)
      this.mesh(group, toGeometry(geos[1]), solid('attack'), 'main', 'main', 1, 'main')
      const halo = this.mesh(group, toGeometry(geos[2]), glow('attack', softTexture()), 'halo', 'halo', 2, 'trail')
      halo.userData.role = 'halo'
      const head = flat(this.mesh(group, new THREE.CircleGeometry(0.34, 24), glow('focus', headGlow()), 'halo', 'top', undefined, 'head'))
      head.userData.role = 'always'
      const end = flat(this.mesh(group, new THREE.RingGeometry(0.4, 0.46, seg(40)), solid('defense'), 'main', 'top', undefined, 'end'))
      end.userData.role = 'always'; end.visible = false
      const endHalo = flat(this.mesh(group, new THREE.CircleGeometry(0.62, seg(32)), glow('defense', radial()), 'halo', 'halo', undefined, 'endHalo'))
      endHalo.userData.role = 'always'; endHalo.visible = false
      return group
    }
    const geos = this.geometries(mark, frame)
    if (!geos) return null
    if (mark.kind === 'path') {
      const dashed = () => { const t = this.dashTexture.clone(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(2.2, 1); t.needsUpdate = true; return t }
      this.mesh(group, toGeometry(geos[0]), stroke(), 'under', 'under', 0)
      this.mesh(group, toGeometry(geos[1]), solid(mark.tone, mark.dashed ? dashed() : null), 'main', 'main', 1)
      this.mesh(group, toGeometry(geos[2]), glow(mark.tone, softTexture()), 'halo', 'halo', 2).userData.role = 'halo'
      return group
    }
    if (mark.kind === 'lane') {
      const a = resolveAnchor(frame, mark.from)!, b = resolveAnchor(frame, mark.to)!
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      const glass = this.mesh(group, toGeometry(geos[0]), glassMaterial(mark.tone, !!mark.blocked, mark.cuts ?? [], len), 'main', 'main', 0)
      glass.userData.role = 'always'
      this.mesh(group, toGeometry(geos[1]), glow(mark.tone, softTexture()), 'halo', 'halo', 1).userData.role = 'halo'
      return group
    }
    if (mark.kind === 'tether') {
      if (mark.y !== undefined) {
        this.mesh(group, toGeometry(geos[0]), solid(mark.tone), 'main', 'main', 0)
        this.mesh(group, toGeometry(geos[1]), glow(mark.tone, softTexture()), 'halo', 'halo', 1).userData.role = 'halo'
        return group
      }
      this.mesh(group, toGeometry(geos[0]), stroke(), 'under', 'under', 0)
      this.mesh(group, toGeometry(geos[1]), solid(mark.tone), 'main', 'main', 1)
      this.mesh(group, toGeometry(geos[2]), glow(mark.tone, softTexture()), 'halo', 'halo', 2).userData.role = 'halo'
      return group
    }
    if (mark.kind === 'wedge') {
      this.mesh(group, toGeometry(geos[0]), new THREE.MeshBasicMaterial({ ...common, color: TONES[mark.tone], map: wedgeFade(), blending: THREE.AdditiveBlending }), 'main', 'main', 0)
      return group
    }
    return null
  }

  private place(entry: Entry, frame: WorldFrame, now: number) {
    const mark = entry.mark
    const obj = entry.object
    if (mark.kind === 'ring') {
      const p = resolveAnchor(frame, mark.at)
      obj.visible = !!p
      if (p) { obj.position.set(p.x, FLOOR + 0.003, p.z); obj.rotation.y = mark.rot ?? 0; obj.scale.set(mark.aspect ?? 1, 1, 1) }
    } else if (mark.kind === 'disc') {
      const p = resolveAnchor(frame, mark.center)
      obj.visible = !!p
      if (p) obj.position.set(p.x, FLOOR - 0.004, p.z)
    } else if (mark.kind === 'pin') {
      const p = resolveAnchor(frame, mark.at)
      obj.visible = !!p
      if (p) obj.position.set(p.x, FLOOR + 0.004, p.z)
    } else if (mark.kind === 'flare') {
      const p = resolveAnchor(frame, mark.at)
      obj.visible = !!p
      if (p) obj.position.set(p.x, FLOOR + 0.006, p.z)
    } else if (mark.kind === 'arrival') {
      const mesh = obj.children[0] as THREE.Mesh, u = (mesh.material as THREE.ShaderMaterial).uniforms
      const list = u.uSrc.value as THREE.Vector4[]
      let n = 0
      for (const anchor of mark.sources) {
        if (n >= MAX_SRC) break
        const p = resolveAnchor(frame, anchor); if (!p) continue
        const pl = typeof anchor === 'string' ? frame.players.find(q => q.id === anchor) : null
        list[n++].set(p.x, p.z, pl?.vx ?? 0, pl?.vz ?? 0)
      }
      u.uN.value = n; u.uAccel.value = mark.accel; u.uVmax.value = mark.maxSpeed; u.uReact.value = mark.react; u.uContest.value = mark.contest
      u.uBall.value = mark.ballTime ?? -1
    } else if (dynamic(mark)) {
      this.reshape(entry, frame, now)
      // Transfers flash: the string pulses bright as the job lands.
      const flash = (mark as Extract<Mark, { kind: 'tether' }>).flash ?? 0
      entry.object.userData.flash = flash
    }
  }

  private animateComet(entry: Entry, now: number): { animating: boolean; opacity: number } {
    const mark = entry.mark as Extract<Mark, { kind: 'comet' }>
    const run = mark.run ?? 640
    const u = Math.min(1, (now - entry.born) / run), eased = u * (2 - u)
    const obj = entry.object
    const pts = mark.points
    // Route length parametrisation.
    const lens: number[] = [0]
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z))
    const total = lens[lens.length - 1] || 1
    const at = eased * total
    let k = 1; while (k < lens.length - 1 && lens[k] < at) k++
    const seg = (lens[k] - lens[k - 1]) || 1, f = Math.min(1, Math.max(0, (at - lens[k - 1]) / seg))
    const hx = pts[k - 1].x + (pts[k].x - pts[k - 1].x) * f, hz = pts[k - 1].z + (pts[k].z - pts[k - 1].z) * f
    const head = obj.getObjectByName('head') as THREE.Mesh
    head.position.set(hx, 0.05, hz); head.visible = u < 1
    obj.traverse(o => { const g = (o as THREE.Mesh).geometry; if (o.userData.part !== undefined && g?.index) g.setDrawRange(0, Math.max(3, Math.floor(g.index.count * eased / 3) * 3)) })
    const main = obj.getObjectByName('main') as THREE.Mesh, trail = obj.getObjectByName('trail') as THREE.Mesh
    const end = obj.getObjectByName('end') as THREE.Mesh, endHalo = obj.getObjectByName('endHalo') as THREE.Mesh
    const last = pts[pts.length - 1]
    end.position.set(last.x, 0.06, last.z); endHalo.position.set(last.x, 0.05, last.z)
    let animating = u < 1, opacity = 1
    const since = now - entry.born - run
    const exposed = mark.outcome === 'exposed'
    const col = (m: THREE.Mesh, c: string) => ((m.material as THREE.MeshBasicMaterial).color.set(c))
    col(main, exposed ? TONES.attack : TONES.neutral); col(trail, exposed ? TONES.attack : TONES.neutral)
    col(head, exposed ? TONES.focus : TONES.neutral)
    if (u >= 1) {
      end.visible = endHalo.visible = true
      col(end, exposed ? TONES.attack : TONES.defense); col(endHalo, exposed ? TONES.attack : TONES.defense)
      const pop = Math.min(1, since / 240), s = exposed ? 1 + (1 - pop) * 0.9 : 1.25 - 0.25 * pop
      end.scale.set(s, s, 1); endHalo.scale.set(s * (exposed ? 1.5 : 1), s * (exposed ? 1.5 : 1), 1)
      if (!exposed) {
        // Held: the shield flares once, then the whole attempt greys out.
        const fadeT = Math.min(1, Math.max(0, (since - 260) / 700))
        opacity = 1 - 0.78 * fadeT
        if (fadeT < 1 || pop < 1) animating = true
      } else if (pop < 1) animating = true
    }
    return { animating, opacity: exposed ? 1 : opacity }
  }

  private animateFlare(entry: Entry, now: number): { animating: boolean; opacity: number } {
    const mark = entry.mark as Extract<Mark, { kind: 'flare' }>
    const dur = mark.duration ?? 900, u = Math.min(1, (now - entry.born) / dur)
    const r = (entry.object.userData.radius as number) ?? 1.1
    const ring = entry.object.getObjectByName('ring')!, disc = entry.object.getObjectByName('disc')!, beam = entry.object.getObjectByName('beam')!
    const e = 1 - (1 - u) ** 3
    ring.scale.set(r * (0.25 + 0.75 * e), r * (0.25 + 0.75 * e), 1)
    disc.scale.set(r * (0.4 + 0.9 * e), r * (0.4 + 0.9 * e), 1)
    beam.scale.set(1, 0.4 + 0.6 * Math.min(1, u * 3), 1)
    return { animating: u < 1, opacity: (1 - u) ** 1.6 }
  }

  private dispose(entry: Entry) {
    this.root.remove(entry.object)
    const keep = new Set<THREE.Texture | null>([...shared(), this.dashTexture])
    entry.object.traverse(o => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose()
      const m = mesh.material as THREE.MeshBasicMaterial | undefined
      if (m) { if (m.map && !keep.has(m.map) && m.map !== this.dashTexture) m.map.dispose(); m.dispose() }
    })
  }

  clear() { for (const entry of this.entries.values()) this.dispose(entry); this.entries.clear() }
}

function defaultOpacity(mark: Mark): number {
  switch (mark.kind) {
    case 'ring': return 0.95
    case 'disc': return 0.32
    case 'path': return 0.85
    case 'lane': return 0.8
    case 'tether': return 0.85
    case 'wedge': return 0.5
    case 'arrival': return 0.9
    case 'pin': return 0.9
    case 'comet': return 0.95
    case 'flare': return 1
  }
}

export const _internals = { ribbonGeometry, up }
export type { PlayerId }
