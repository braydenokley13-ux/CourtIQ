'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { CameraId, ModelAssumptions, PlayerId, Point2, WorldFrame, XRayLayer } from '@/lib/defense-lab/types'
import { tagDepthFromFloorPoint, type TagGuide } from '@/lib/defense-lab/tagGuide'
import { isThreatOpen } from '@/lib/defense-lab/analytics'
import { bodyCapsules } from '@/lib/defense-lab/analyticalGeometry'
import { DEFAULT_ASSUMPTIONS } from '@/lib/defense-lab/scenario'
import { buildBall, buildLabEnvironment, setLabEnvironmentAnalytical, COURT, disposeTree } from './labEnvironment'
import { createLabAthlete, loadGlbAthleteAsset, type LabAthlete } from './labAthlete'

export interface LabProjectedPoint { x: number; y: number; footX: number; footY: number; visible: boolean }
export interface LabProjectedAnchors {
  width: number; height: number
  players: Partial<Record<PlayerId, LabProjectedPoint>>
  threats: { id: string; playerId: PlayerId; x: number; y: number; visible: boolean }[]
  tagTarget?: { x: number; y: number; visible: boolean }
  selected: LabProjectedPoint | null
}
export interface LabCandidatePath { id: string; points: Point2[]; status: 'probing' | 'contained' | 'conditional' | 'dangerous' | 'chosen'; verdict?: 'held' | 'exposed' | 'conditional'; threatId?: string }
export interface LabWorldProps {
  analyticalStyle?: 'porcelain' | 'spectral'
  evidenceFrames?: WorldFrame[]
  baselineEvidenceFrames?: WorldFrame[]
  tagGuide?: TagGuide | null
  onTagDepthChange?(value: number): void
  candidatePaths?: LabCandidatePath[]
  conflicts?: { defenderId: PlayerId; at: number; targets: readonly Point2[] }[]
  frame: WorldFrame
  assumptions?: ModelAssumptions
  baselineFrame?: WorldFrame | null
  selectedId: PlayerId | null
  playing: boolean
  xray: XRayLayer
  camera: CameraId
  paths?: { id: PlayerId; points: Point2[] }[]
  arrivalTarget?: Point2 | null
  cueTarget?: Point2 | null
  focusThreatId?: string | null
  onProjectAnchors?(anchors: LabProjectedAnchors): void
  onSelect(id: PlayerId): void
  onMove(id: PlayerId, target: Point2, time: number): void
}

const PRESETS: Record<Exclude<CameraId, 'player'>, { eye: number[]; target: number[] }> = {
  broadcast: { eye: [9.2, 6.1, 14.6], target: [0, 0.85, 4.4] },
  sideline: { eye: [20.5, 8.1, 7.2], target: [0, 0.9, 6.8] },
  baseline: { eye: [0, 6.0, -3.7], target: [0, 0.7, 6.0] },
  overhead: { eye: [0.01, 25.6, 7.2], target: [0, 0, 7.15] },
  coach: { eye: [10.8, 3.5, 8.8], target: [0, 1.1, 6.8] },
}
const teal = '#327d7c', amber = '#bc663b'

/** The model supplies every position, possession, responsibility and window.
 * This component owns camera/lighting/GPU resources and emits movement intent. */
export default function LabWorld(props: LabWorldProps) {
  const host = useRef<HTMLDivElement>(null)
  const latest = useRef(props); latest.current = props
  const [fallback, setFallback] = useState(false)
  const [assetReady, setAssetReady] = useState(false)

  useEffect(() => {
    const container = host.current
    if (!container) return
    let disposed = false, lost = false, raf = 0, sceneDirty = true
    let previousFrame: WorldFrame | null = null, previousBaseline: WorldFrame | null | undefined, previousState = ''
    let previousPaths: LabWorldProps['paths']
    let analyticalAmount = 0, lastAnalyticalAmount = -1, lastTick = 0, lastRenderAt = -Infinity, candidateAnimating = false
    let analyticalTransition = { from: 0, target: 0, startedAt: 0 }
    let lastActiveLayer: XRayLayer = 'responsibilities'
    let previousEvidence: LabWorldProps['evidenceFrames'], previousCandidates: LabWorldProps['candidatePaths'], previousConflicts: LabWorldProps['conflicts'], previousBaselineEvidence: LabWorldProps['baselineEvidenceFrames'], previousTagGuide: LabWorldProps['tagGuide']
    const normalMaterials = new Map<THREE.Material, { opacity: number; transparent: boolean; depthWrite: boolean }>()
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let lastProjection = '', lastProjectionAt = -Infinity
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    } catch { setFallback(true); return }
    const gl = renderer.getContext(), debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
    const software = debugInfo ? /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))) : false
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, software ? 1 : window.innerWidth < 760 ? 1.2 : 1.5))

    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.82
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true
    let renderScale = renderer.getPixelRatio(), slowSamples = 0, fastSamples = 0, previousActiveRender = 0
    let athleteQuality: 'high' | 'low' = software ? 'low' : 'high'
    const performanceProbe = new URLSearchParams(window.location.search).get('debugLab') === '1' ? createPerformanceProbe() : null
    const canvas = renderer.domElement
    canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;outline:none'
    canvas.tabIndex = 0
    canvas.setAttribute('aria-label', 'Interactive five-on-five basketball world. Drag to orbit, right drag to pan, scroll to zoom. Freeze and drag a defender to cue a new movement.')
    container.appendChild(canvas)
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(39, 1, 0.06, 100)
    const environment = buildLabEnvironment(scene, renderer, software, () => { sceneDirty = true; lastAnalyticalAmount = -1; renderer.shadowMap.needsUpdate = true })
    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true; controls.dampingFactor = 0.1; controls.minDistance = 4; controls.maxDistance = 37
    controls.maxPolarAngle = Math.PI * 0.48; controls.minPolarAngle = 0.04; controls.screenSpacePanning = true
    controls.target.set(0, 0.6, 6.5); camera.position.set(...PRESETS.broadcast.eye as [number, number, number]); controls.update()
    const athletes = new Map<PlayerId, LabAthlete>()
    let glbReady = false
    function rebuildAthletes() {
      for (const [id, athlete] of athletes) { scene.remove(athlete.root); disposeTree(athlete.root); athletes.delete(id) }
      normalMaterials.clear(); lastAnalyticalAmount = -1
      latest.current.frame.players.forEach((player, i) => {
        const athlete = createLabAthlete(player, i, glbReady)
        ;(athlete as LabAthlete & { setQuality?(quality: 'high' | 'low'): void }).setQuality?.(athleteQuality)
        athlete.figure.traverse(o => { const material = (o as THREE.Mesh).material; for (const mat of Array.isArray(material) ? material : material ? [material] : []) normalMaterials.set(mat, { opacity: mat.opacity, transparent: mat.transparent, depthWrite: mat.depthWrite }) })
        athletes.set(player.id, athlete); scene.add(athlete.root)
      })
    }
    rebuildAthletes()
    void loadGlbAthleteAsset().then(asset => {
      if (!disposed && asset) { glbReady = true; rebuildAthletes(); sceneDirty = true; renderer.shadowMap.needsUpdate = true; setAssetReady(true) }
    })
    const ball = buildBall(); scene.add(ball)
    const overlays = createOverlays(scene)
    const analyticalWorld = createAnalyticalWorld(scene), candidates = createCandidateView(scene)
    const ghosts = new Map<PlayerId, THREE.Group>()
    for (const player of latest.current.frame.players.filter(p => p.team === 'defense')) {
      const ghost = createGhost(player.height); ghosts.set(player.id, ghost); scene.add(ghost)
    }
    const target = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.46, 48), new THREE.MeshBasicMaterial({ color: '#3567d5', transparent: true, opacity: 0.8, depthWrite: false }))
    target.rotation.x = -Math.PI / 2; target.position.y = 0.036; target.visible = false; scene.add(target)
    const cueLine = dynamicLine('#3567d5'); (cueLine.material as THREE.Material).dispose(); cueLine.material = new THREE.LineDashedMaterial({ color: '#3567d5', transparent: true, opacity: .72, dashSize: .18, gapSize: .12, depthWrite: false }); scene.add(cueLine); cueLine.visible = false
    const arrivalLine = dynamicLine(amber); (arrivalLine.material as THREE.Material).dispose(); arrivalLine.material = new THREE.LineDashedMaterial({ color: amber, transparent: true, opacity: .85, dashSize: .22, gapSize: .12, depthWrite: false }); scene.add(arrivalLine); arrivalLine.visible = false
    const arrivalRing = ring(amber, .43); scene.add(arrivalRing); arrivalRing.visible = false
    const tag = createTagGuideView(scene)
    const differences = createDifferenceView(scene)
    let tagDragging: { depth: number } | null = null
    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const groundPoint = new THREE.Vector3()
    let dragging: { id: PlayerId; startX: number; startY: number; target: Point2; moved: boolean } | null = null
    let lastCamera: CameraId | null = null, lastSelected: PlayerId | null = null
    let transition: { fromEye: THREE.Vector3; toEye: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; start: number } | null = null
    const dimensions = () => {
      const { width, height } = container.getBoundingClientRect()
      sceneDirty = true
      renderer.setSize(Math.max(1, width), Math.max(1, height), false)
      const nextAspect = Math.max(1, width) / Math.max(1, height)
      if (Math.abs(nextAspect - camera.aspect) > 0.15) lastCamera = null
      camera.aspect = nextAspect; camera.updateProjectionMatrix()
    }
    controls.addEventListener('change', () => { sceneDirty = true })
    dimensions(); const observer = new ResizeObserver(dimensions); observer.observe(container)
    function setPointer(event: PointerEvent) {
      const bounds = canvas.getBoundingClientRect()
      pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
    }
    function pick(event: PointerEvent) {
      setPointer(event)
      const hits = raycaster.intersectObjects([...athletes.values()].map(a => a.hit), false)
      return hits[0]?.object.userData.playerId as PlayerId | undefined
    }
    function down(event: PointerEvent) {
      if (event.button !== 0) return
      const guide = latest.current.tagGuide
      if (guide?.editable && guide.defenderId === latest.current.selectedId && !latest.current.playing && latest.current.camera !== 'player' && latest.current.onTagDepthChange) {
        setPointer(event)
        if (raycaster.intersectObject(tag.hit, false).length) {
          event.stopPropagation(); controls.enabled = false; canvas.setPointerCapture(event.pointerId); tagDragging = { depth: guide.tagDepth }; sceneDirty = true; return
        }
      }
      const id = pick(event)
      if (!id) return
      latest.current.onSelect(id)
      const player = latest.current.frame.players.find(p => p.id === id)
      if (player?.team === 'defense' && !latest.current.playing && latest.current.camera !== 'player') {
        event.stopPropagation(); controls.enabled = false; canvas.setPointerCapture(event.pointerId)
        dragging = { id, startX: event.clientX, startY: event.clientY, target: { x: player.x, z: player.z }, moved: false }
      }
    }
    function move(event: PointerEvent) {
      if (tagDragging && latest.current.tagGuide) {
        setPointer(event)
        if (raycaster.ray.intersectPlane(ground, groundPoint)) { tagDragging.depth = tagDepthFromFloorPoint(latest.current.tagGuide, groundPoint); sceneDirty = true }
        return
      }
      if (!dragging) return
      setPointer(event)
      if (Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY) > 5) dragging.moved = true
      if (raycaster.ray.intersectPlane(ground, groundPoint)) {
        dragging.target = { x: THREE.MathUtils.clamp(groundPoint.x, -7.32, 7.32), z: THREE.MathUtils.clamp(groundPoint.z, 0.3, 14.026) }
        target.position.set(dragging.target.x, 0.035, dragging.target.z); target.visible = dragging.moved; sceneDirty = true
      }
    }
    function up(event: PointerEvent) {
      if (tagDragging) {
        const depth = tagDragging.depth; tagDragging = null; controls.enabled = latest.current.camera !== 'player'; sceneDirty = true
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
        latest.current.onTagDepthChange?.(depth); return
      }
      if (!dragging) return
      const command = dragging; dragging = null; target.visible = false; sceneDirty = true
      controls.enabled = latest.current.camera !== 'player'
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      if (command.moved) latest.current.onMove(command.id, command.target, latest.current.frame.t)
    }
    function cancel() { dragging = null; tagDragging = null; target.visible = false; sceneDirty = true; controls.enabled = latest.current.camera !== 'player' }
    function keyboard(event: KeyboardEvent) {
      const current = latest.current
      if (current.playing || !current.selectedId || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      const p = current.frame.players.find(player => player.id === current.selectedId)
      if (!p || p.team !== 'defense') return
      event.preventDefault()
      current.onMove(p.id, { x: p.x + (event.key === 'ArrowRight' ? 0.3 : event.key === 'ArrowLeft' ? -0.3 : 0), z: p.z + (event.key === 'ArrowDown' ? 0.3 : event.key === 'ArrowUp' ? -0.3 : 0) }, current.frame.t)
    }
    function contextLost(event: Event) { event.preventDefault(); lost = true; cancelAnimationFrame(raf); setFallback(true) }
    canvas.addEventListener('pointerdown', down, true); canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancel); canvas.addEventListener('keydown', keyboard)
    canvas.addEventListener('webglcontextlost', contextLost)
    function tick(now: number) {
      if (disposed || lost) return
      const current = latest.current, frame = current.frame
      const rawDelta = lastTick ? now - lastTick : 16; lastTick = now
      const analyticalTarget = current.xray === 'off' ? 0 : 1
      if (current.xray !== 'off') lastActiveLayer = current.xray
      // Absolute time keeps the fade bounded even on a heavily loaded GPU.
      // Sample the previous transition before reversing, preserving continuity.
      const progress = Math.min(1, Math.max(0, (now - analyticalTransition.startedAt) / 450))
      const eased = progress * progress * (3 - 2 * progress)
      analyticalAmount = THREE.MathUtils.lerp(analyticalTransition.from, analyticalTransition.target, eased)
      if (analyticalTarget !== analyticalTransition.target) analyticalTransition = { from: analyticalAmount, target: analyticalTarget, startedAt: now }
      if (reduceMotion) analyticalAmount = analyticalTarget
      const analyticalAnimating = analyticalAmount !== analyticalTarget
      const analyticalStyle = current.analyticalStyle ?? (new URLSearchParams(window.location.search).get('xrayLook') === 'spectral' ? 'spectral' : 'porcelain')
      if (current.playing && now - lastRenderAt < 32 && !sceneDirty && !transition) { raf = requestAnimationFrame(tick); return }

      if (current.camera !== lastCamera || (current.camera === 'player' && current.selectedId !== lastSelected)) {
        lastCamera = current.camera; lastSelected = current.selectedId
        camera.fov = current.camera === 'baseline' ? 48 : current.camera === 'player' || current.camera === 'coach' ? 65 : 39
        camera.updateProjectionMatrix()
        controls.enabled = current.camera !== 'player' && !dragging && !tagDragging
        if (current.camera !== 'player') {
          const preset = PRESETS[current.camera]
          const targetPoint = new THREE.Vector3(...preset.target as [number, number, number])
          const adjustedEye = new THREE.Vector3(...preset.eye as [number, number, number]).sub(targetPoint).multiplyScalar(Math.max(1, 1.15 / camera.aspect)).add(targetPoint)
          if (current.camera === 'broadcast') {
            // Frame the possession's occupied width, not the architecture. This is
            // calculated only on camera entry, so playback never chases actors.
            const probe = new THREE.PerspectiveCamera(camera.fov, camera.aspect, .06, 100)
            probe.position.copy(adjustedEye); probe.lookAt(targetPoint); probe.updateMatrixWorld()
            // Fit every body, including hands, inside the usable world viewport.
            // Perspective centering alone does not guarantee the near corner fits.
            for (let iteration = 0; iteration < 8; iteration++) {
              probe.position.copy(adjustedEye); probe.lookAt(targetPoint); probe.updateMatrixWorld()
              const bounds = frame.players.flatMap(p => [-.55,.55].flatMap(dx => [0,p.height + .2].map(y => new THREE.Vector3(p.x + dx,y,p.z).project(probe))))
              const minX = Math.min(...bounds.map(p => p.x)), maxX = Math.max(...bounds.map(p => p.x))
              const minY = Math.min(...bounds.map(p => p.y)), maxY = Math.max(...bounds.map(p => p.y))
              const scale = adjustedEye.distanceTo(targetPoint) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
              const right = new THREE.Vector3(1,0,0).applyQuaternion(probe.quaternion).multiplyScalar((minX + maxX) * .5 * scale * camera.aspect)
              const up = new THREE.Vector3(0,1,0).applyQuaternion(probe.quaternion).multiplyScalar(((minY + maxY) * .5 - .14) * scale)
              targetPoint.add(right).add(up); adjustedEye.add(right).add(up)
              const needed = Math.max((maxX-minX)/1.76,(maxY-minY)/1.40)
              if (needed > 1) adjustedEye.sub(targetPoint).multiplyScalar(Math.min(1.25,needed * 1.015)).add(targetPoint)
            }
          }
          if (current.camera === 'baseline') adjustedEye.z = -3.7
          const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
          transition = { fromEye: camera.position.clone(), toEye: adjustedEye, fromTarget: controls.target.clone(), toTarget: targetPoint, start: reduce ? now - 500 : now }
        } else transition = null
      }
      if (transition) {
        const u = Math.min(1, (now - transition.start) / 450), smooth = u * u * (3 - 2 * u)
        camera.position.lerpVectors(transition.fromEye, transition.toEye, smooth); controls.target.lerpVectors(transition.fromTarget, transition.toTarget, smooth)
        if (u === 1) transition = null
      }
      if (current.camera !== 'player') controls.update()
      const stateKey = `${current.camera}:${current.selectedId}:${current.xray}:${current.playing}:${current.focusThreatId}:${current.cueTarget?.x}:${current.cueTarget?.z}:${current.arrivalTarget?.x}:${current.arrivalTarget?.z}:${analyticalStyle}`
      const frameChanged = previousFrame !== frame
      const inputsChanged = frameChanged || previousState !== stateKey || previousBaseline !== current.baselineFrame || previousPaths !== current.paths || previousEvidence !== current.evidenceFrames || previousCandidates !== current.candidatePaths || previousConflicts !== current.conflicts || previousBaselineEvidence !== current.baselineEvidenceFrames || previousTagGuide !== current.tagGuide
      if (!inputsChanged && !sceneDirty && !transition && !dragging && !tagDragging && !analyticalAnimating && !candidateAnimating && analyticalAmount === lastAnalyticalAmount) { raf = requestAnimationFrame(tick); return }
      sceneDirty = false; previousFrame = frame; previousState = stateKey; previousBaseline = current.baselineFrame; previousPaths = current.paths; previousEvidence = current.evidenceFrames; previousCandidates = current.candidatePaths; previousConflicts = current.conflicts; previousBaselineEvidence = current.baselineEvidenceFrames; previousTagGuide = current.tagGuide
      if (frameChanged && analyticalAmount < .99) renderer.shadowMap.needsUpdate = true
      for (const player of frame.players) {
        const athlete = athletes.get(player.id); if (!athlete) continue
        athlete.root.position.set(player.x, player.pose.jump, player.z)
        if (analyticalAmount < .99) athlete.setPose({ time: frame.t, speed: Math.hypot(player.vx, player.vz), velocity: { x: player.vx, z: player.vz }, defensive: player.team === 'defense', pose: player.pose.stance, phase: player.pose.phase, hands: player.pose.hands, ball: frame.ball, hasBall: frame.ball.owner === player.id, facing: player.yaw })
        const selected = player.id === current.selectedId
        athlete.ring.visible = selected
        athlete.ring.scale.setScalar(selected ? 1.3 : 1)
        ;(athlete.ring.material as THREE.MeshBasicMaterial).opacity = selected ? 0.93 : 0.33
        ;(athlete.ring.material as THREE.MeshBasicMaterial).color.set(selected ? '#c97638' : player.team === 'defense' ? teal : amber)
        athlete.label.visible = (selected || current.xray !== 'off') && (current.camera !== 'player' || player.id !== current.selectedId)
        athlete.figure.visible = analyticalAmount < .999 && (current.camera !== 'player' || player.id !== (current.selectedId ?? 'D3'))
      }
      if (lastAnalyticalAmount !== analyticalAmount || inputsChanged) {
        setLabEnvironmentAnalytical(environment, analyticalAmount, analyticalStyle)
        for (const [material, original] of normalMaterials) {
          const transparent = original.transparent || analyticalAmount > .001
          if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true }
          material.opacity = original.opacity * (1 - analyticalAmount); material.depthWrite = original.depthWrite && analyticalAmount < .5
        }
        if ((lastAnalyticalAmount < .5) !== (analyticalAmount < .5)) renderer.shadowMap.needsUpdate = true
        lastAnalyticalAmount = analyticalAmount
      }
      for (const athlete of athletes.values()) athlete.figure.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = analyticalAmount < .5 })
      updateTagGuideView(tag, current, tagDragging?.depth)
      updateDifferenceView(differences, current)
      const cue = dragging?.moved ? dragging.target : !current.playing ? current.cueTarget : null
      const cuePlayer = frame.players.find(p => p.id === (dragging?.id ?? current.selectedId))
      target.visible = !!cue
      cueLine.visible = !!cue && !!cuePlayer
      if (cue) target.position.set(cue.x, .035, cue.z)
      if (cue && cuePlayer) { updateLine(cueLine, [cuePlayer.x, .06, cuePlayer.z], [cue.x, .06, cue.z]); cueLine.computeLineDistances() }
      const arrival = current.xray === 'windows' ? current.arrivalTarget : null
      const arrivalPlayer = frame.players.find(p => p.id === current.selectedId)
      arrivalLine.visible = arrivalRing.visible = !!arrival && !!arrivalPlayer
      if (arrival && arrivalPlayer) {
        updateLine(arrivalLine, [arrivalPlayer.x, .075, arrivalPlayer.z], [arrival.x, .075, arrival.z]); arrivalLine.computeLineDistances()
        arrivalRing.position.set(arrival.x, .075, arrival.z)
      }
      ball.position.set(frame.ball.x, frame.ball.y, frame.ball.z); ball.rotation.set(frame.t * 4.5, frame.t * 1.4, frame.t * 0.8)
      if (current.camera === 'player') {
        const selected = frame.players.find(p => p.id === (current.selectedId ?? 'D3'))
        if (selected) {
          camera.position.set(selected.x, selected.height * 0.92 + selected.pose.jump, selected.z)
          const dx = Math.sin(selected.yaw), dz = Math.cos(selected.yaw)
          // Stable player view looks with the torso; the ball remains a basketball read.
          camera.lookAt(selected.x + dx * 6, selected.height * 0.75, selected.z + dz * 6)
        }
      }
      const analyticalProps = current.xray === 'off' && analyticalAmount > 0 ? { ...current, xray: lastActiveLayer } : current
      updateOverlays(overlays, analyticalProps); overlays.root.visible = analyticalAmount > .3
      updateAnalyticalWorld(analyticalWorld, analyticalProps, analyticalAmount, analyticalStyle)
      candidateAnimating = updateCandidateView(candidates, current, now)
      for (const [id, ghost] of ghosts) {
        const before = current.baselineFrame?.players.find(p => p.id === id), after = frame.players.find(p => p.id === id)
        ghost.visible = !!before && !!after && Math.hypot(before.x - after.x, before.z - after.z) > 0.08
        if (before && ghost.visible) {
          // Temporal ghost uses the baseline's own posed analytical body, not a
          // standing capsule placed over the current athlete's pose.
          const capsules = bodyCapsules(before, current.assumptions ?? DEFAULT_ASSUMPTIONS)
          ghost.children.forEach((part, index) => {
            const capsule = capsules[index]; part.visible = !!capsule
            if (!capsule) return
            const a = new THREE.Vector3(capsule.a.x, capsule.a.y, capsule.a.z), b = new THREE.Vector3(capsule.b.x, capsule.b.y, capsule.b.z)
            part.position.copy(a).add(b).multiplyScalar(.5)
            part.scale.set(capsule.radius, (a.distanceTo(b) + 2 * capsule.radius) / 3, capsule.radius)
            const direction = b.sub(a)
            if (direction.lengthSq() > 1e-10) part.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), direction.normalize())
          })
        }
      }
      if (current.onProjectAnchors && now - lastProjectionAt >= 32) {
        camera.updateMatrixWorld()
        const width = canvas.clientWidth, height = canvas.clientHeight
        const project = (x: number, y: number, z: number) => {
          const p = new THREE.Vector3(x, y, z).project(camera)
          return { x: Math.round((p.x + 1) * width * 5) / 10, y: Math.round((1 - p.y) * height * 5) / 10, visible: p.z > -1 && p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 }
        }
        const players: LabProjectedAnchors['players'] = {}
        for (const player of frame.players) {
          const head = project(player.x, player.height + player.pose.jump + 0.15, player.z), foot = project(player.x, 0.03, player.z)
          players[player.id] = { ...head, footX: foot.x, footY: foot.y }
        }
        const anchors: LabProjectedAnchors = { width, height, players, tagTarget: current.tagGuide?.editable && !current.playing && current.selectedId === current.tagGuide.defenderId ? project(current.tagGuide.currentTarget.x, .07, current.tagGuide.currentTarget.z) : undefined, selected: current.selectedId ? players[current.selectedId] ?? null : null,
          threats: frame.options.filter(o => o.available).map(o => ({ id: o.id, playerId: o.playerId, ...project(o.target.x, 0.12, o.target.z) })) }
        const signature = JSON.stringify(anchors)
        if (signature !== lastProjection) { current.onProjectAnchors(anchors); lastProjection = signature }
        lastProjectionAt = now
      }
      if (!document.hidden) {
        const began = performance.now(); renderer.render(scene, camera); lastRenderAt = now
        // Hysteresis: sustained cost lowers detail, recovery requires a much longer
        // fast run. Simulation dt, positions and evidence are never changed.
        const activelyRendering = current.playing || analyticalAnimating || !!transition || !!dragging || candidateAnimating
        const actualFrameInterval = activelyRendering && previousActiveRender ? now - previousActiveRender : 0
        performanceProbe?.record(current.candidatePaths?.length ? 'candidates' : analyticalAmount > .5 ? 'xray' : 'normal', actualFrameInterval, performance.now() - began, activelyRendering ? rawDelta : 0, renderer.info.render.calls, renderer.info.render.triangles, renderScale, athleteQuality)
        if (activelyRendering) {
          const cpuCost = performance.now() - began
          const frameInterval = previousActiveRender ? now - previousActiveRender : 33.3; previousActiveRender = now
          // Render-submission cadence includes delayed RAF scheduling; it is not a GPU presentation timestamp.
          const slow = cpuCost > 29 || frameInterval > 45
          slowSamples = slow ? slowSamples + 1 : Math.max(0, slowSamples - 1)
          fastSamples = cpuCost < 16 && frameInterval < 37 ? fastSamples + 1 : 0
          const maximum = Math.min(window.devicePixelRatio || 1, software ? 1 : 1.5), minimum = Math.min(maximum, software ? .75 : 1)
          let next = renderScale
          if (slowSamples >= 18) { next = Math.max(minimum, renderScale - .15); athleteQuality = 'low'; slowSamples = 0 }
          else if (fastSamples >= 150) { next = Math.min(maximum, renderScale + .10); athleteQuality = software ? 'low' : 'high'; fastSamples = 0 }
          if (next !== renderScale) { renderScale = next; renderer.setPixelRatio(renderScale); sceneDirty = true }
          for (const athlete of athletes.values()) (athlete as LabAthlete & { setQuality?(quality: 'high' | 'low'): void }).setQuality?.(athleteQuality)
        } else previousActiveRender = 0
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      disposed = true; cancelAnimationFrame(raf); observer.disconnect(); controls.dispose()
      canvas.removeEventListener('pointerdown', down, true); canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel); canvas.removeEventListener('keydown', keyboard)
      canvas.removeEventListener('webglcontextlost', contextLost)
      for (const athlete of athletes.values()) { const data = athlete.figure.userData; const handle = data.glbAthlete ?? data.skinnedAthlete; handle?.mixer?.stopAllAction() }
      performanceProbe?.dispose()
      environment.userData.disposed = true
      disposeTree(scene); (environment.userData.environmentTarget as THREE.WebGLRenderTarget).dispose()
      renderer.dispose(); canvas.remove()
    }
  }, [])

  return <div ref={host} className="lab-world-renderer" style={{ width: '100%', height: '100%', position: 'relative' }} data-lab-renderer={fallback ? 'fallback' : 'webgl'} data-athlete-type={assetReady ? 'skinned-glb' : 'skinned-fallback'}>
    {fallback && <FallbackCourt {...props} />}
  </div>
}

interface Overlays { root: THREE.Group; links: THREE.Line[]; circles: THREE.Mesh[]; lanes: THREE.Mesh[]; reach: THREE.Mesh[]; bodies: THREE.Group[]; paths: THREE.Line[] }
function dynamicLine(color: string) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.65, depthTest: false, depthWrite: false }))
}
function ring(color: string, radius: number) {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(radius - 0.018, radius, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false }))
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.05
  return mesh
}
function createOverlays(scene: THREE.Scene): Overlays {
  const root = new THREE.Group(); root.name = 'engine-evidence-overlays'; scene.add(root)
  const links: THREE.Line[] = [], circles: THREE.Mesh[] = [], lanes: THREE.Mesh[] = [], reach: THREE.Mesh[] = [], bodies: THREE.Group[] = [], paths: THREE.Line[] = []
  for (let i = 0; i < 10; i++) {
    const link = dynamicLine(teal); root.add(link); links.push(link)
    const circle = ring(amber, 0.64); root.add(circle); circles.push(circle)
    const reachCircle = ring(teal, 1); root.add(reachCircle); reach.push(reachCircle)
    const laneGeom = new THREE.BufferGeometry(); laneGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(108), 3))
    const lane = new THREE.Mesh(laneGeom, new THREE.MeshBasicMaterial({ color: '#c9954c', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }))
    root.add(lane); lanes.push(lane)
    const body = new THREE.Group()
    root.add(body); bodies.push(body)
    const path = dynamicLine(teal); root.add(path); paths.push(path)
  }
  return { root, links, circles, lanes, reach, bodies, paths }
}
function updateLine(line: THREE.Line, a: number[], b: number[]) {
  const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute
  attr.setXYZ(0, a[0], a[1], a[2]); attr.setXYZ(1, b[0], b[1], b[2]); attr.needsUpdate = true
  line.geometry.computeBoundingSphere()
}
function updateOverlays(overlays: Overlays, props: LabWorldProps) {
  const frame = props.frame
  overlays.root.visible = props.xray !== 'off'
  for (let i = 0; i < 10; i++) {
    const responsibility = frame.responsibilities[i], option = frame.options[i]
    const link = overlays.links[i], circle = overlays.circles[i], lane = overlays.lanes[i], reach = overlays.reach[i], body = overlays.bodies[i], path = overlays.paths[i]
    link.visible = props.xray === 'responsibilities' && !!responsibility
    reach.visible = (props.xray === 'bodies' || props.xray === 'responsibilities') && !!responsibility && (props.xray === 'bodies' || responsibility.defenderId === props.selectedId)
    if (responsibility) {
      const defender = frame.players.find(p => p.id === responsibility.defenderId)
      if (defender) {
        updateLine(link, [defender.x, 0.07, defender.z], [responsibility.target.x, 0.07, responsibility.target.z])
        ;(link.material as THREE.LineBasicMaterial).opacity = responsibility.defenderId === props.selectedId ? 0.95 : 0.38
        ;(link.material as THREE.LineBasicMaterial).color.set(responsibility.kind === 'tag' || responsibility.kind === 'split' ? amber : teal)
        reach.position.set(defender.x, 0.055, defender.z); reach.scale.setScalar(responsibility.influenceRadius)
      }
    }
    circle.visible = lane.visible = props.xray === 'windows' && !!option && option.available
    if (option) {
      const open = isThreatOpen(option, frame, props.assumptions ?? DEFAULT_ASSUMPTIONS)
      const color = open ? '#bc783c' : '#648886'
      ;(circle.material as THREE.MeshBasicMaterial).color.set(color); circle.position.set(option.target.x, 0.06, option.target.z)
      ;(lane.material as THREE.MeshBasicMaterial).color.set(color)
      ;(lane.material as THREE.MeshBasicMaterial).opacity = props.focusThreatId ? option.id === props.focusThreatId ? .25 : .035 : .12
      ;(circle.material as THREE.MeshBasicMaterial).opacity = props.focusThreatId ? option.id === props.focusThreatId ? .95 : .18 : .6
      const a = frame.ball, b = option.target, dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1
      const sx = -dz / len, sz = dx / len, attr = lane.geometry.getAttribute('position') as THREE.BufferAttribute
      // A chest-height corridor exposes pass direction and receiving space in 3D.
      // Its width is a visual affordance; clearance itself comes from analytics.
      const ay = option.kind === 'drive' ? .18 : Math.max(0.6, a.y), by = option.kind === 'drive' ? .25 : 1.18
      const vertices = [
        [a.x + sx * .11, ay - .10, a.z + sz * .11], [a.x - sx * .11, ay - .10, a.z - sz * .11],
        [b.x - sx * .38, by - .22, b.z - sz * .38], [b.x + sx * .38, by - .22, b.z + sz * .38],
        [a.x + sx * .11, ay + .10, a.z + sz * .11], [a.x - sx * .11, ay + .10, a.z - sz * .11],
        [b.x - sx * .38, by + .22, b.z - sz * .38], [b.x + sx * .38, by + .22, b.z + sz * .38],
      ]
      const indices = [0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,3,2,6,3,6,7,0,3,7,0,7,4,1,5,6,1,6,2]
      indices.forEach((index, j) => { const p = vertices[index]; attr.setXYZ(j, p[0], p[1], p[2]) })
      attr.needsUpdate = true; lane.geometry.computeBoundingSphere()
    }
    body.visible = false
    const recovery = props.paths?.[i]
    path.visible = props.xray === 'recovery' && !!recovery && (!props.selectedId || props.selectedId === recovery.id)
    if (recovery && path.userData.source !== recovery.points) {
      path.geometry.dispose(); path.geometry = new THREE.BufferGeometry().setFromPoints(recovery.points.map(p => new THREE.Vector3(p.x, 0.06, p.z))); path.userData.source = recovery.points
    }
  }
}
function createGhost(_height: number) {
  const root = new THREE.Group(), material = new THREE.MeshBasicMaterial({ color: '#698e8a', transparent: true, opacity: 0.19, depthWrite: false })
  const geometry = new THREE.CapsuleGeometry(1, 1, 3, 6)
  for (let i = 0; i < 12; i++) root.add(new THREE.Mesh(geometry, material))
  return root
}

/** Both looks use the same engine geometry. Porcelain prioritizes player silhouette;
 * spectral prioritizes joints/axes. Neither is an athlete or collision approximation. */
interface AnalyticalWorld {
  root: THREE.Group
  shafts: THREE.InstancedMesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>
  caps: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
  axes: THREE.LineSegments
  velocity: THREE.LineSegments
  future: THREE.Mesh[]
  futureLabels: THREE.Sprite[]
  flight: THREE.LineSegments
  conflict: THREE.LineSegments
  transform: THREE.Object3D
}
function linePool(segments: number, color: string, opacity: number) {
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segments * 6), 3)); geometry.setDrawRange(0, 0)
  const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }))
  line.frustumCulled = false; return line
}
function createAnalyticalWorld(scene: THREE.Scene): AnalyticalWorld {
  const root = new THREE.Group(); root.name = 'analytical-universe'; root.visible = false; scene.add(root)
  const shafts = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8), new THREE.MeshStandardMaterial({ roughness: .95, metalness: 0, transparent: true, opacity: 0 }), 120)
  const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ roughness: .95, metalness: 0, transparent: true, opacity: 0 }), 240)
  shafts.instanceMatrix.setUsage(THREE.DynamicDrawUsage); caps.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  shafts.frustumCulled = caps.frustumCulled = false
  const axes = linePool(120, '#1e434c', .72), velocity = linePool(30, '#4c7992', .52), conflict = linePool(10, '#bc6337', .9)
  ;(axes.material as THREE.LineBasicMaterial).depthTest = false
  const future: THREE.Mesh[] = [], futureLabels: THREE.Sprite[] = []
  for (let i = 0; i < 3; i++) {
    const circle = ring('#327d7c', 1); root.add(circle); future.push(circle)
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 56
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#315e67'; ctx.font = '600 30px Arial'; ctx.textAlign = 'center'; ctx.fillText(`+${((i + 1) * .25).toFixed(2)} s`, 80, 37)
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false })); label.scale.set(.68, .238, 1); root.add(label); futureLabels.push(label)
  }
  const flight = linePool(128, '#b76536', .95)
  root.add(shafts, caps, axes, velocity, flight, conflict)
  return { root, shafts, caps, axes, velocity, future, futureLabels, flight, conflict, transform: new THREE.Object3D() }
}
function updateAnalyticalWorld(world: AnalyticalWorld, props: LabWorldProps, amount: number, style: 'porcelain' | 'spectral') {
  world.root.visible = amount > .01
  if (!world.root.visible) return
  const assumptions = props.assumptions ?? DEFAULT_ASSUMPTIONS, transform = world.transform, up = new THREE.Vector3(0, 1, 0)
  const axisPositions = world.axes.geometry.getAttribute('position') as THREE.BufferAttribute
  let shaftIndex = 0, capIndex = 0, axisIndex = 0
  for (const player of props.frame.players) {
    if (props.camera === 'player' && player.id === (props.selectedId ?? 'D3')) continue
    const color = new THREE.Color(player.id === props.selectedId ? '#276ca2' : player.team === 'defense' ? '#357d80' : '#88959e')
    for (const capsule of bodyCapsules(player, assumptions)) {
      const a = new THREE.Vector3(capsule.a.x, capsule.a.y, capsule.a.z), b = new THREE.Vector3(capsule.b.x, capsule.b.y, capsule.b.z), direction = b.clone().sub(a)
      transform.position.copy(a).add(b).multiplyScalar(.5); transform.scale.set(capsule.radius, Math.max(.0001, direction.length()), capsule.radius)
      transform.quaternion.identity(); if (direction.lengthSq() > 1e-10) transform.quaternion.setFromUnitVectors(up, direction.normalize())
      transform.updateMatrix(); world.shafts.setMatrixAt(shaftIndex, transform.matrix); world.shafts.setColorAt(shaftIndex++, color)
      const radius = style === 'spectral' && capsule.part !== 'head' ? Math.min(capsule.radius, .044) : capsule.radius
      for (const point of [a, b]) {
        transform.position.copy(point); transform.scale.setScalar(radius); transform.quaternion.identity(); transform.updateMatrix()
        world.caps.setMatrixAt(capIndex, transform.matrix); world.caps.setColorAt(capIndex++, color)
      }
      axisPositions.setXYZ(axisIndex++, a.x, a.y, a.z); axisPositions.setXYZ(axisIndex++, b.x, b.y, b.z)
    }
  }
  world.shafts.count = shaftIndex; world.caps.count = capIndex
  world.shafts.instanceMatrix.needsUpdate = world.caps.instanceMatrix.needsUpdate = true
  if (world.shafts.instanceColor) world.shafts.instanceColor.needsUpdate = true
  if (world.caps.instanceColor) world.caps.instanceColor.needsUpdate = true
  world.shafts.material.opacity = amount * (style === 'spectral' ? .13 : .90); world.shafts.material.depthWrite = style !== 'spectral'
  world.caps.material.opacity = amount * .96
  world.axes.visible = style === 'spectral' || props.xray === 'bodies'; (world.axes.material as THREE.LineBasicMaterial).opacity = amount * .8
  axisPositions.needsUpdate = true; world.axes.geometry.setDrawRange(0, axisIndex)

  // Sampled velocity is a vector, not an invented route or promised reach field.
  const vectors = world.velocity.geometry.getAttribute('position') as THREE.BufferAttribute; let vectorIndex = 0
  world.velocity.visible = props.xray === 'recovery' || props.xray === 'bodies'
  for (const player of props.frame.players) {
    if (props.selectedId && props.selectedId !== player.id) continue
    const speed = Math.hypot(player.vx, player.vz); if (speed < .08) continue
    const dx = player.vx * .25, dz = player.vz * .25, x = player.x + dx, z = player.z + dz
    for (const [a, b] of [[[player.x,.085,player.z],[x,.085,z]], [[x,.085,z],[x-dx*.15-dz*.12,.085,z-dz*.15+dx*.12]], [[x,.085,z],[x-dx*.15+dz*.12,.085,z-dz*.15-dx*.12]]]) {
      vectors.setXYZ(vectorIndex++, a[0], a[1], a[2]); vectors.setXYZ(vectorIndex++, b[0], b[1], b[2])
    }
  }
  vectors.needsUpdate = true; world.velocity.geometry.setDrawRange(0, vectorIndex)
  const evidence = props.evidenceFrames
  for (let i = 0; i < 3; i++) {
    const at = props.frame.t + (i + 1) * .25
    const sample = evidence?.find(frame => frame.t >= at - .001)
    const player = sample?.players.find(player => player.id === props.selectedId)
    const distinct = !i || !player || Math.hypot(player.x - world.future[i - 1].position.x, player.z - world.future[i - 1].position.z) > .10
    const visible = (props.xray === 'recovery' || props.xray === 'responsibilities') && !!player && !!props.selectedId && distinct
    world.future[i].visible = world.futureLabels[i].visible = visible
    if (player) {
      world.future[i].position.set(player.x, .075 + i * .004, player.z); world.future[i].scale.setScalar(assumptions.contestRadius)
      ;(world.future[i].material as THREE.MeshBasicMaterial).opacity = amount * (.55 - i * .12)
      world.futureLabels[i].position.set(player.x, .16, player.z); (world.futureLabels[i].material as THREE.SpriteMaterial).opacity = amount * .85
    }
  }
  // The visible arc is taken from actual simulated ball samples (past/future).
  const points = world.flight.geometry.getAttribute('position') as THREE.BufferAttribute; let flightCount = 0
  const nearby = evidence?.filter(frame => frame.t >= props.frame.t - .25 && frame.t <= props.frame.t + .55) ?? []
  for (let i = 1; i < nearby.length && flightCount < 256; i++) {
    const a = nearby[i - 1].ball, b = nearby[i].ball, af = a.flight, bf = b.flight
    if (!af || !bf || !['pass','shot'].includes(a.phase) || !['pass','shot'].includes(b.phase) || af.start !== bf.start || af.from !== bf.from || af.to !== bf.to) continue
    points.setXYZ(flightCount++, a.x, a.y, a.z); points.setXYZ(flightCount++, b.x, b.y, b.z)
  }
  points.needsUpdate = true; world.flight.geometry.setDrawRange(0, flightCount)
  world.flight.visible = props.xray === 'windows' && flightCount > 1
  ;(world.flight.material as THREE.LineBasicMaterial).opacity = amount * .95
  const conflictPositions = world.conflict.geometry.getAttribute('position') as THREE.BufferAttribute; let conflictIndex = 0
  for (const conflict of props.conflicts ?? []) {
    if (Math.abs(conflict.at - props.frame.t) > .25) continue
    const player = props.frame.players.find(p => p.id === conflict.defenderId); if (!player) continue
    for (const point of conflict.targets) {
      if (conflictIndex >= 20) break
      conflictPositions.setXYZ(conflictIndex++, player.x, .6, player.z); conflictPositions.setXYZ(conflictIndex++, point.x, .1, point.z)
    }
  }
  world.conflict.visible = props.xray === 'responsibilities' && conflictIndex > 0
  conflictPositions.needsUpdate = true; world.conflict.geometry.setDrawRange(0, conflictIndex)
}

interface CandidateView { root: THREE.Group; paths: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>[]; rings: THREE.Mesh[]; startedById: Map<string, number> }
function createCandidateView(scene: THREE.Scene): CandidateView {
  const root = new THREE.Group(); root.name = 'evaluated-attack-continuations'; scene.add(root)
  const paths: CandidateView['paths'] = [], rings: THREE.Mesh[] = []
  for (let i = 0; i < 4; i++) {
    const path = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: amber, transparent: true, opacity: .5, dashSize: .22, gapSize: .12, depthWrite: false }))
    path.frustumCulled = false; root.add(path); paths.push(path)
    const end = ring(amber, .32); root.add(end); rings.push(end)
  }
  return { root, paths, rings, startedById: new Map() }
}
function updateCandidateView(view: CandidateView, props: LabWorldProps, now: number) {
  const candidates = props.candidatePaths ?? []
  view.root.visible = candidates.length > 0
  const ids = new Set(candidates.map(candidate => candidate.id))
  for (const id of view.startedById.keys()) if (!ids.has(id)) view.startedById.delete(id)
  let animating = false
  for (let i = 0; i < 4; i++) {
    const candidate = candidates[i], path = view.paths[i], end = view.rings[i]
    path.visible = end.visible = !!candidate && candidate.points.length > 1
    if (!candidate || candidate.points.length < 2) continue
    if (!view.startedById.has(candidate.id)) view.startedById.set(candidate.id, now)
    const age = Math.max(0, now - view.startedById.get(candidate.id)!), reveal = Math.min(1, age / 600)
    animating ||= age < 1200
    if (path.userData.source !== candidate.points) {
      path.geometry.dispose(); path.geometry = new THREE.BufferGeometry().setFromPoints(candidate.points.map(p => new THREE.Vector3(p.x, .10 + i * .008, p.z)))
      path.computeLineDistances(); path.userData.source = candidate.points
    }
    const held = candidate.verdict === 'held' || candidate.status === 'contained', conditional = candidate.verdict === 'conditional' || candidate.status === 'conditional', selected = candidate.status === 'chosen'
    const color = held ? '#78938d' : conditional ? '#af8545' : '#bd653b'
    const opacity = selected ? .92 : held ? Math.max(.035, .30 * (1 - age / 1100)) : conditional ? .38 : .52
    path.material.color.set(color); path.material.opacity = opacity; path.material.gapSize = selected && !conditional ? 0 : .12
    path.geometry.setDrawRange(0, Math.max(2, Math.floor(candidate.points.length * reveal)))
    const endpoint = candidate.points[candidate.points.length - 1]
    end.position.set(endpoint.x, .1, endpoint.z); (end.material as THREE.MeshBasicMaterial).color.set(color); (end.material as THREE.MeshBasicMaterial).opacity = selected ? .9 : opacity * .6
  }
  return view.root.visible && animating
}

interface TagGuideView { root: THREE.Group; rail: THREE.Line; handle: THREE.Mesh; hit: THREE.Mesh; home: THREE.Mesh; commit: THREE.Mesh }
function createTagGuideView(scene: THREE.Scene): TagGuideView {
  const root = new THREE.Group(); root.name = 'editable-tag-policy-target'; scene.add(root)
  const rail = dynamicLine('#3567d5'); (rail.material as THREE.Material).dispose(); rail.material = new THREE.LineDashedMaterial({ color: '#3567d5', dashSize: .14, gapSize: .10, transparent: true, opacity: .65, depthWrite: false })
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.22, .025, 6, 36), new THREE.MeshBasicMaterial({ color: '#3567d5', depthWrite: false })); handle.rotation.x = -Math.PI / 2
  const hit = new THREE.Mesh(new THREE.SphereGeometry(.36, 12, 8), new THREE.MeshBasicMaterial({ visible: false }))
  const home = ring('#7296c9', .12), commit = ring('#3567d5', .17)
  root.add(rail, handle, hit, home, commit); root.visible = false
  return { root, rail, handle, hit, home, commit }
}
function updateTagGuideView(view: TagGuideView, props: LabWorldProps, previewDepth?: number) {
  const guide = props.tagGuide
  view.root.visible = !!guide?.editable && guide.defenderId === props.selectedId && !props.playing && props.camera !== 'player'
  if (!guide || !view.root.visible) return
  updateLine(view.rail, [guide.home.x, .065, guide.home.z], [guide.commit.x, .065, guide.commit.z]); view.rail.computeLineDistances()
  const point = previewDepth === undefined ? guide.currentTarget : { x: THREE.MathUtils.lerp(guide.home.x, guide.commit.x, previewDepth), z: THREE.MathUtils.lerp(guide.home.z, guide.commit.z, previewDepth) }
  view.handle.position.set(point.x, .075, point.z); view.hit.position.set(point.x, .11, point.z)
  view.home.position.set(guide.home.x, .068, guide.home.z); view.commit.position.set(guide.commit.x, .068, guide.commit.z)
}
interface DifferenceView { root: THREE.Group; displacement: THREE.LineSegments; before: THREE.LineSegments; after: THREE.LineSegments; source?: WorldFrame[]; baseline?: WorldFrame[]; at: number }
function createDifferenceView(scene: THREE.Scene): DifferenceView {
  const root = new THREE.Group(); root.name = 'synchronized-world-differences'; scene.add(root)
  const displacement = linePool(15, '#a07b49', .7), before = linePool(400, '#85938f', .30), after = linePool(400, '#347b84', .62)
  root.add(displacement, before, after); root.visible = false
  return { root, displacement, before, after, at: -1 }
}
function updateDifferenceView(view: DifferenceView, props: LabWorldProps) {
  view.root.visible = !!props.baselineFrame
  if (!view.root.visible || !props.baselineFrame) return
  const vectors = view.displacement.geometry.getAttribute('position') as THREE.BufferAttribute; let count = 0
  const changed = new Set<PlayerId>()
  for (const player of props.frame.players.filter(p => p.team === 'defense')) {
    const prior = props.baselineFrame.players.find(p => p.id === player.id)
    if (!prior || Math.hypot(player.x - prior.x, player.z - prior.z) < .15) continue
    changed.add(player.id)
    const dx = player.x - prior.x, dz = player.z - prior.z, length = Math.hypot(dx,dz), ux = dx / length, uz = dz / length
    for (const [a,b] of [[[prior.x,.085,prior.z],[player.x,.085,player.z]], [[player.x,.085,player.z],[player.x-ux*.16-uz*.10,.085,player.z-uz*.16+ux*.10]], [[player.x,.085,player.z],[player.x-ux*.16+uz*.10,.085,player.z-uz*.16-ux*.10]]]) {
      vectors.setXYZ(count++, a[0],a[1],a[2]); vectors.setXYZ(count++,b[0],b[1],b[2])
    }
  }
  vectors.needsUpdate = true; view.displacement.geometry.setDrawRange(0,count)
  for (const [line, frames] of [[view.before, props.baselineEvidenceFrames], [view.after, props.evidenceFrames]] as const) {
    const points = line.geometry.getAttribute('position') as THREE.BufferAttribute; let used = 0
    const nearby = frames?.filter((f,index) => index % 3 === 0 && f.t >= props.frame.t - .6 && f.t <= props.frame.t + .8) ?? []
    for (const id of changed) for (let i = 1; i < nearby.length && used < 800; i++) {
      const a = nearby[i-1].players.find(p => p.id === id), b = nearby[i].players.find(p => p.id === id)
      if (!a || !b) continue
      points.setXYZ(used++,a.x,.08,a.z); points.setXYZ(used++,b.x,.08,b.z)
    }
    points.needsUpdate = true; line.geometry.setDrawRange(0,used)
  }
}

/** Development-only counters: rendered cadence is distinct from RAF responsiveness
 * and GL submission CPU time. No coach-facing performance claims are inferred. */
function createPerformanceProbe() {
  interface Samples { renders: number; frames: number[]; cpu: number[]; raf: number[]; calls: number; triangles: number }
  const modes: Record<string, Samples> = {}, limit = 180
  let scale = 1, quality = 'high', switches = 0
  const percentile = (values: number[], q: number) => { const sorted = [...values].sort((a,b) => a-b); return sorted.length ? Math.round(sorted[Math.min(sorted.length-1, Math.floor(sorted.length*q))] * 100) / 100 : null }
  const publicProbe = { snapshot: () => ({ renderScale: scale, athleteQuality: quality, qualitySwitches: switches, modes: Object.fromEntries(Object.entries(modes).map(([name, values]) => [name, { renders: values.renders, activeSamples: values.frames.length, p50RenderedFrameMs: percentile(values.frames,.5), p95RenderedFrameMs: percentile(values.frames,.95), p95RAFMs: percentile(values.raf,.95), p95SubmitCpuMs: percentile(values.cpu,.95), drawCalls: values.calls, triangles: values.triangles }])) }) }
  const target = window as typeof window & { __courtIQLabPerformance?: typeof publicProbe }; target.__courtIQLabPerformance = publicProbe
  return {
    record(mode: string, frame: number, cpu: number, raf: number, calls: number, triangles: number, nextScale: number, nextQuality: string) {
      const samples = modes[mode] ??= { renders: 0, frames: [], cpu: [], raf: [], calls: 0, triangles: 0 }
      samples.renders++; samples.calls = calls; samples.triangles = triangles
      if (frame > 0) samples.frames.push(frame); if (raf > 0) samples.raf.push(raf); samples.cpu.push(cpu)
      for (const values of [samples.frames,samples.cpu,samples.raf]) if (values.length > limit) values.shift()
      if (nextScale !== scale || nextQuality !== quality) switches++
      scale = nextScale; quality = nextQuality
    },
    dispose() { if (target.__courtIQLabPerformance === publicProbe) delete target.__courtIQLabPerformance },
  }
}

function FallbackCourt(props: LabWorldProps) {
  const toX = (x: number) => x + COURT.width / 2
  const view = { width: COURT.width, length: COURT.length }
  const drag = useRef<{ id: PlayerId; x: number; y: number } | null>(null)
  function pointer(event: React.PointerEvent<SVGSVGElement>) {
    if (!drag.current || props.playing) return
    const intent = drag.current; drag.current = null
    if (Math.hypot(event.clientX - intent.x, event.clientY - intent.y) < 5) return
    const svg = event.currentTarget, point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY
    const matrix = svg.getScreenCTM(); if (!matrix) return
    const p = point.matrixTransform(matrix.inverse()), id = intent.id
    props.onMove(id, { x: THREE.MathUtils.clamp(p.x - view.width / 2, -7.32, 7.32), z: THREE.MathUtils.clamp(p.y, 0.3, 14.026) }, props.frame.t)
  }
  return <div style={{ position: 'absolute', inset: 0, background: '#e8ebe3', display: 'grid', placeItems: 'center' }}>
    <svg viewBox={`-1 -1 ${view.width + 2} ${view.length + 2}`} style={{ width: '100%', height: '100%', maxHeight: '100%' }} role="img" aria-label="Interactive overhead basketball world. WebGL unavailable; all simulation controls remain active." onPointerUp={pointer} onPointerCancel={() => { drag.current = null }}>
      <rect width={view.width} height={view.length} fill="#dfba82" stroke="#f5efd9" strokeWidth=".06" />
      <rect x={toX(-1.8288)} width="3.6576" height="5.7912" fill="#426c69" stroke="#f5efd9" strokeWidth=".04" />
      <path d={`M ${toX(-6.0198)} 0 L ${toX(-6.0198)} ${COURT.basketZ} A 6.0198 6.0198 0 0 0 ${toX(6.0198)} ${COURT.basketZ} L ${toX(6.0198)} 0`} fill="none" stroke="#faf3e4" strokeWidth=".04" />
      <circle cx={toX(0)} cy="5.7912" r="1.8288" fill="none" stroke="#f5efd9" strokeWidth=".04" />
      <circle cx={toX(0)} cy={COURT.basketZ} r=".2286" fill="none" stroke="#be6030" strokeWidth=".04" />
      {props.xray === 'responsibilities' && props.frame.responsibilities.map(r => { const p = props.frame.players.find(p => p.id === r.defenderId); return p && <line key={r.id} x1={toX(p.x)} y1={p.z} x2={toX(r.target.x)} y2={r.target.z} stroke={teal} strokeWidth=".035" strokeDasharray=".13 .1" /> })}
      {props.baselineFrame?.players.filter(p => p.team === 'defense').map(p => <circle key={`ghost-${p.id}`} cx={toX(p.x)} cy={p.z} r=".34" fill="none" stroke="#60847d" strokeWidth=".08" opacity=".3" />)}
      {props.frame.players.map(p => <g key={p.id} transform={`translate(${toX(p.x)} ${p.z})`} role="button" tabIndex={0} aria-label={`${p.id}, ${p.role.replaceAll('-', ' ')}`} onClick={() => props.onSelect(p.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') props.onSelect(p.id) }} onPointerDown={e => { if (!props.playing && p.team === 'defense') { drag.current = { id: p.id, x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId) } }} style={{ cursor: 'pointer', touchAction: 'none' }}>
        <circle r=".34" fill={p.team === 'defense' ? '#1c6263' : '#f8efd9'} stroke={p.id === props.selectedId ? '#cb753c' : '#2b6664'} strokeWidth={p.id === props.selectedId ? '.1' : '.025'} />
        <text textAnchor="middle" dominantBaseline="central" fontSize=".24" fontWeight="700" fill={p.team === 'defense' ? '#fff6e6' : '#79502e'}>{p.id}</text>
      </g>)}
      <circle cx={toX(props.frame.ball.x)} cy={props.frame.ball.z} r=".13" fill="#bc6429" stroke="#4b3824" strokeWidth=".02" />
    </svg>
    <span style={{ position: 'absolute', bottom: 8, right: 14, color: '#5f7166', fontSize: 11 }}>Overhead view · WebGL unavailable</span>
  </div>
}
