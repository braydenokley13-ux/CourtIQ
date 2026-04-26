'use client'

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

interface LabelSpriteProps {
  text: string
  color?: string
  bg?: string
  scale?: number
  position?: [number, number, number]
}

const FONT_STACK =
  '700 56px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
const PIXEL_SCALE = 4
const PADDING_X = 24
const TEXTURE_HEIGHT = 80

/**
 * Renders a player/object label as a Three.js Sprite backed by a procedurally
 * drawn 2D canvas texture. We deliberately do NOT use drei's <Text> here
 * because it suspends while preloading a Roboto font from the network, and a
 * failed/blocked font load (CSP, ad-blockers, flaky network) crashes the
 * entire R3F tree in production. A CanvasTexture is fully synchronous.
 */
export function LabelSprite({
  text,
  color = '#FBFBFD',
  bg = 'rgba(10,11,14,0.85)',
  scale = 1,
  position = [0, 0, 0],
}: LabelSpriteProps) {
  const { texture, aspect } = useMemo(() => buildLabelTexture(text, color, bg), [text, color, bg])

  // Dispose of the GPU texture when the sprite unmounts so we don't leak
  // memory across scenarios.
  useEffect(() => {
    return () => {
      texture.dispose()
    }
  }, [texture])

  const width = scale * 1.4 * aspect
  const height = scale * 1.4

  return (
    <sprite position={position} scale={[width, height, 1]}>
      <spriteMaterial
        map={texture}
        transparent
        depthWrite={false}
        depthTest={false}
        toneMapped={false}
      />
    </sprite>
  )
}

interface LabelTextureResult {
  texture: THREE.Texture
  aspect: number
}

function buildLabelTexture(text: string, color: string, bg: string): LabelTextureResult {
  // SSR / non-DOM environments (tests) do not have <canvas>. Fall back to a
  // minimal stub texture so consumers can still build the scene tree in
  // unit tests without crashing.
  if (typeof document === 'undefined') {
    return { texture: new THREE.Texture(), aspect: 2 }
  }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return { texture: new THREE.Texture(), aspect: 2 }
  }

  ctx.font = FONT_STACK
  const measured = ctx.measureText(text)
  const textWidth = Math.max(60, measured.width)
  const drawW = Math.ceil(textWidth + PADDING_X * 2)
  const drawH = TEXTURE_HEIGHT

  canvas.width = drawW * PIXEL_SCALE
  canvas.height = drawH * PIXEL_SCALE
  ctx.scale(PIXEL_SCALE, PIXEL_SCALE)

  // Background pill
  ctx.fillStyle = bg
  roundedRect(ctx, 0, 0, drawW, drawH, 16)
  ctx.fill()

  // Text
  ctx.font = FONT_STACK
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(text, drawW / 2, drawH / 2 + 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.anisotropy = 4
  texture.needsUpdate = true
  return { texture, aspect: drawW / drawH }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}
