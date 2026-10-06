/*
 * Renders docs/calm.gif: a calm (neutre) bloub looping its natural idle
 * animation (breathing, slow gaze drift, occasional blinks).
 *
 * The loop seam is hidden by crossfading the last 0.4 seconds into the first
 * frames. Run via:
 *   esbuild scripts/make-gif.ts --bundle --platform=node --format=esm --outfile=/tmp/make-gif.mjs && node /tmp/make-gif.mjs
 */

import { writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import { BotEngine, type BotFrame } from '../src/bot/engine'
import { EXPRESSION_BY_ID } from '../src/bot/expressions'
import { DEMI_VIEWBOX, RAYON } from '../src/bot/repere'

const SIZE = 320
const FPS = 10
const LOOP_SECONDS = 8
const FADE_SECONDS = 0.4
const PAPER = '#ffffff'
const INK = '#0a0a0c'

function frameSvg(frame: BotFrame): string {
  const eyes = frame.eyes
    .map(
      (e) =>
        `<path d="${e.d}" transform="${e.matrix}" opacity="${e.alpha}" fill="#000"/>`
    )
    .join('')

  const body = frame.bodyPath
  const demi = DEMI_VIEWBOX

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-demi} ${-demi} ${demi * 2} ${demi * 2}">
  <defs>
    <mask id="m" maskUnits="userSpaceOnUse" x="${-demi}" y="${-demi}" width="${demi * 2}" height="${demi * 2}">
      <path d="${body}" fill="#fff"/>
      ${eyes}
    </mask>
  </defs>
  <path d="${body}" fill="${PAPER}"/>
  <g mask="url(#m)">
    <rect x="${-demi}" y="${-demi}" width="${demi * 2}" height="${demi * 2}" fill="${INK}"/>
  </g>
</svg>`
}

function raster(svg: string): Uint8Array {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: SIZE },
    background: PAPER
  })
  return new Uint8Array(resvg.render().pixels)
}

function blend(a: Uint8Array, b: Uint8Array, k: number): Uint8Array {
  const out = new Uint8Array(a.length)
  for (let i = 0; i < a.length; i++) {
    out[i] = Math.round(a[i] * (1 - k) + b[i] * k)
  }
  return out
}

function main() {
  const engine = new BotEngine(
    RAYON,
    'idle',
    null,
    EXPRESSION_BY_ID.get('neutre') ?? undefined
  )

  const frameCount = LOOP_SECONDS * FPS
  const fadeFrames = FADE_SECONDS * FPS
  const frames: Uint8Array[] = []

  for (let i = 0; i < frameCount; i++) {
    const t = i / FPS
    frames.push(raster(frameSvg(engine.sample(t))))
  }

  // Crossfade the tail into the head so the GIF loops without a jump.
  for (let j = 0; j < fadeFrames; j++) {
    const index = frameCount - fadeFrames + j
    const k = (j + 1) / fadeFrames
    frames[index] = blend(frames[index]!, frames[j]!, k)
  }

  const gif = GIFEncoder()
  const delay = Math.round(1000 / FPS)
  for (const frame of frames) {
    const palette = quantize(frame, 256, { format: 'rgba4444' })
    const index = applyPalette(frame, palette, 'rgba4444')
    gif.writeFrame(index, SIZE, SIZE, { palette, delay })
  }
  gif.finish()

  const bytes = gif.bytes()
  writeFileSync(new URL('../docs/calm.gif', import.meta.url), bytes)
  console.log(`docs/calm.gif written: ${bytes.length} bytes, ${frameCount} frames`)
}

main()
