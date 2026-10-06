/*
 * bloub widget — https://bloub.wangnan.net
 * Copyright (c) 2026 Wang Nan, licensed under CC BY-NC-SA 4.0.
 *
 * Built on bloub (https://github.com/jeremy-prt/bloub),
 * Copyright (c) 2026 Jérémy Perret, released under the MIT License.
 * The full MIT license text is available in licenses/bloub-MIT-LICENSE.
 */

import { NOTIF_BLUE } from './bot/decor'
import { BotEngine, type BotFrame, type Look } from './bot/engine'
import { EXPRESSION_BY_ID } from './bot/expressions'
import { clamp, easings } from './bot/math'
import { DEMI_VIEWBOX, RAYON } from './bot/repere'
import { COLOR_BY_ID, SHAPE_BY_ID, mixHex } from './bot/skins'
import { STATE_BY_ID } from './bot/states'

/* ------------------------------------------------------------- configuration */

/** One step of the click cycle. A mood pairs an expression with a look. */
export interface MoodItem {
  /** expression id (see EXPRESSION_BY_ID), default 'neutre' */
  expression: string
  /** color id (see COLOR_BY_ID), default 'encre' (near-black) */
  color?: string
  /** shape id (see SHAPE_BY_ID), default 'cercle' (circle) */
  shape?: string
}

export interface BloubConfig {
  /** click cycle; the first item is shown when the page loads */
  moods?: MoodItem[]
  /** the eyes follow the pointer, default true */
  follow?: boolean
  /** play the scale "pop" when clicked, default true */
  pop?: boolean
  /** clicking cycles the mood; set false for a purely decorative widget */
  clickable?: boolean
  /** called after a click advances to another mood, with the new index */
  onMoodChange?: (index: number) => void
  /** colour seen through the eye holes, default white */
  paper?: string
  /** url of the customizer page opened on double click */
  toolUrl?: string
}

export interface FixedOptions {
  /** which viewport corner, default 'br' (bottom-right) */
  corner?: 'br' | 'bl' | 'tr' | 'tl'
  /** disc size in pixels, default 64 */
  size?: number
  /** distance from the viewport edge in pixels, default 16 */
  margin?: number
}

export interface BloubInstance {
  /** replace the whole mood cycle; starts at `startIndex` (default 0) */
  setMoods(moods: MoodItem[], startIndex?: number): void
  /** current mood cycle */
  getMoods(): MoodItem[]
  /** jump to the mood at `i` instantly (no morph) */
  setIndex(i: number): void
  /** currently displayed mood index */
  getIndex(): number
  destroy(): void
}

/* Gaze tracking amplitudes (same chosen values as bloub's gaze module). */
const YAW_MAX = 16
const PITCH_MAX = 13
/** Gaze held slightly above the equator when the pointer is centred. */
const PITCH_CENTER = 6

const DEFAULT_TOOL_URL = 'https://bloub.wangnan.net/'
const DOT_POOL = 8

/* ------------------------------------------------------------- injected css */

const CSS = `
.bloub-host { position: relative; box-sizing: border-box; }
.bloub-host * { box-sizing: border-box; }
.bloub-ball { position: absolute; inset: 0; }
.bloub-ball svg { display: block; width: 100%; height: 100%; }
.bloub-fixed {
  position: fixed; z-index: 9999; border-radius: 50%;
  background: #ffffff; border: 1px solid #e5e5e5;
  box-shadow: 0 1px 4px rgba(0,0,0,0.18);
  overflow: hidden; cursor: pointer; padding: 0;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.bloub-fixed:hover { transform: translateY(-1px); box-shadow: 0 2px 7px rgba(0,0,0,0.22); }
.bloub-fixed:focus-visible { outline: 2px solid #3b93f0; outline-offset: 2px; }
.bloub-fixed .bloub-ball svg { transform: scale(1.2); transform-origin: center; }
`

let cssInjected = false
function injectCss() {
  if (cssInjected) return
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)
  cssInjected = true
}

/* ------------------------------------------------------------- svg helpers */

const SVG_NS = 'http://www.w3.org/2000/svg'

function svgNode<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {}
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}

function resolveMood(item: MoodItem | undefined) {
  const expression =
    EXPRESSION_BY_ID.get(item?.expression ?? 'neutre') ??
    EXPRESSION_BY_ID.get('neutre')!
  const shape =
    SHAPE_BY_ID.get(item?.shape ?? 'cercle') ?? SHAPE_BY_ID.get('cercle')!
  const color =
    COLOR_BY_ID.get(item?.color ?? 'encre') ?? COLOR_BY_ID.get('encre')!
  return { expression, shape, color }
}

/* ------------------------------------------------------------- mount */

/**
 * Render a bloub into `target`. The target controls the size: give it a width
 * and a height (e.g. via CSS). Pass a frozen timestamp instead of a live loop
 * for static thumbnails; defaults to a live widget.
 */
export function mount(
  target: HTMLElement | string,
  config: BloubConfig = {},
  frozen: boolean | number = false
): BloubInstance {
  injectCss()
  const host =
    typeof target === 'string' ? document.querySelector<HTMLElement>(target)! : target
  if (!host) throw new Error('bloub: mount target not found')
  host.classList.add('bloub-host')

  const paper = config.paper ?? '#ffffff'
  const toolUrl = config.toolUrl ?? DEFAULT_TOOL_URL
  const follow = config.follow !== false
  const popEnabled = config.pop !== false
  const clickable = config.clickable !== false

  let moods: MoodItem[] =
    config.moods && config.moods.length
      ? config.moods
      : [{ expression: 'neutre', color: 'encre', shape: 'cercle' }]
  let index = 0

  /* ----- svg skeleton, built once -------------------------------------- */

  const uid = Math.random().toString(36).slice(2, 8)
  const maskId = `bloub-mask-${uid}`

  const svg = svgNode('svg', {
    viewBox: `${-DEMI_VIEWBOX} ${-DEMI_VIEWBOX} ${DEMI_VIEWBOX * 2} ${DEMI_VIEWBOX * 2}`,
    width: '100%',
    height: '100%',
    role: 'img',
    'aria-label': 'bloub'
  })

  const defs = svgNode('defs')
  const mask = svgNode('mask', {
    id: maskId,
    maskUnits: 'userSpaceOnUse',
    x: String(-DEMI_VIEWBOX),
    y: String(-DEMI_VIEWBOX),
    width: String(DEMI_VIEWBOX * 2),
    height: String(DEMI_VIEWBOX * 2)
  })
  const maskBody = svgNode('path', { fill: '#fff' })
  mask.append(maskBody)
  const maskEyes = [0, 1].map(() => svgNode('path', { fill: '#000' }))
  maskEyes.forEach((e) => {
    e.style.display = 'none'
    mask.append(e)
  })
  const maskNotch = svgNode('circle', { fill: '#000' })
  maskNotch.style.display = 'none'
  mask.append(maskNotch)
  defs.append(mask)

  const gBackArcs = svgNode('g', { fill: 'none', 'stroke-linecap': 'round' })
  const gDotsBehind = svgNode('g')
  const gBody = svgNode('g')
  const bodyPaper = svgNode('path', { fill: paper })
  const gMasked = svgNode('g', { mask: `url(#${maskId})` })
  const rectInk = svgNode('rect', {
    x: String(-DEMI_VIEWBOX),
    y: String(-DEMI_VIEWBOX),
    width: String(DEMI_VIEWBOX * 2),
    height: String(DEMI_VIEWBOX * 2)
  })
  gMasked.append(rectInk)
  gBody.append(bodyPaper, gMasked)
  const gDotsFront = svgNode('g')
  const notifCircle = svgNode('circle', { fill: NOTIF_BLUE })
  notifCircle.style.display = 'none'
  const gFrontArcs = svgNode('g', { fill: 'none', 'stroke-linecap': 'round' })

  svg.append(defs, gBackArcs, gDotsBehind, gBody, gDotsFront, notifCircle, gFrontArcs)

  interface DotSlot {
    circle: SVGCircleElement
    path: SVGPathElement
  }
  const makeDotSlot = (): DotSlot => {
    const circle = svgNode('circle')
    const path = svgNode('path')
    circle.style.display = 'none'
    path.style.display = 'none'
    return { circle, path }
  }
  const slotsBehind = Array.from({ length: DOT_POOL }, makeDotSlot)
  const slotsFront = Array.from({ length: DOT_POOL }, makeDotSlot)
  slotsBehind.forEach((s) => gDotsBehind.append(s.circle, s.path))
  slotsFront.forEach((s) => gDotsFront.append(s.circle, s.path))

  const ball = document.createElement('div')
  ball.className = 'bloub-ball'
  ball.append(svg)
  host.append(ball)

  /* ----- engine --------------------------------------------------------- */

  const first = resolveMood(moods[0])
  let engine: BotEngine = new BotEngine(
    RAYON,
    'idle',
    first.shape.radii,
    first.expression
  )

  // Colour morph, aligned with the engine's own shape/expression morph
  // (same 0.45 s ease-out curve).
  let inkHex = first.color.hex
  let cFrom = inkHex
  let cTo = inkHex
  let cAt = -10
  const C_DUR = BotEngine.SHAPE_MORPH

  function currentInk(now: number): string {
    const k = (now - cAt) / C_DUR
    if (k >= 1) return cTo
    return mixHex(cFrom, cTo, easings.easeOutQuint(clamp(k)))
  }

  function applyMood(i: number, now: number, instant: boolean) {
    index = i
    const m = resolveMood(moods[i])
    if (instant) {
      engine = new BotEngine(RAYON, 'idle', m.shape.radii, m.expression)
      cFrom = m.color.hex
      cTo = m.color.hex
      cAt = -10
      inkHex = m.color.hex
      return
    }
    engine.setExpression(m.expression, now)
    engine.setShape(m.shape.radii, now)
    cFrom = currentInk(now)
    cTo = m.color.hex
    cAt = now
  }

  /* ----- frame reconciliation ------------------------------------------ */

  const gradients = new Map<string, SVGLinearGradientElement>()
  const backPaths = new Map<string, SVGPathElement>()
  const frontPaths = new Map<string, SVGPathElement>()

  function reconcileArcs(frame: BotFrame) {
    const live = new Set<string>()
    for (const arc of frame.arcs) {
      live.add(arc.id)
      let grad = gradients.get(arc.id)
      if (!grad) {
        grad = svgNode('linearGradient', {
          id: `${uid}-${arc.id}`,
          gradientUnits: 'userSpaceOnUse',
          x1: String(arc.grad.x1),
          y1: String(arc.grad.y1),
          x2: String(arc.grad.x2),
          y2: String(arc.grad.y2)
        })
        arc.grad.stops.forEach((c, i) => {
          grad!.append(
            svgNode('stop', {
              offset: String(i / (arc.grad.stops.length - 1)),
              'stop-color': c
            })
          )
        })
        defs.append(grad)
        gradients.set(arc.id, grad)
      }
      let back = backPaths.get(arc.id)
      if (!back) {
        back = svgNode('path', { fill: 'none' })
        gBackArcs.append(back)
        backPaths.set(arc.id, back)
      }
      back.setAttribute('d', arc.back)
      back.setAttribute('stroke', `url(#${uid}-${arc.id})`)
      back.setAttribute('stroke-width', String(arc.width))
      back.setAttribute('opacity', String(arc.opacity))

      let front = frontPaths.get(arc.id)
      if (!front) {
        front = svgNode('path', { fill: 'none' })
        gFrontArcs.append(front)
        frontPaths.set(arc.id, front)
      }
      front.setAttribute('d', arc.front)
      front.setAttribute('stroke', `url(#${uid}-${arc.id})`)
      front.setAttribute('stroke-width', String(arc.width))
      front.setAttribute('opacity', String(arc.opacity))
    }
    for (const map of [gradients, backPaths, frontPaths]) {
      for (const [id, node] of map) {
        if (!live.has(id)) {
          node.remove()
          map.delete(id)
        }
      }
    }
  }

  function dotFill(d: BotFrame['dots'][number], ink: string): string {
    if (d.color) return d.color
    if (d.depth === undefined) return ink
    return mixHex(paper, ink, d.depth)
  }

  function reconcileDots(slots: DotSlot[], dots: BotFrame['dots'], ink: string) {
    for (let i = 0; i < slots.length; i++) {
      const d = dots[i]
      const slot = slots[i]!
      if (!d) {
        slot.circle.style.display = 'none'
        slot.path.style.display = 'none'
        continue
      }
      const fill = dotFill(d, ink)
      if (d.d) {
        slot.circle.style.display = 'none'
        slot.path.style.display = ''
        slot.path.setAttribute('d', d.d)
        slot.path.setAttribute(
          'transform',
          `translate(${d.x} ${d.y}) rotate(${d.rot ?? 0}) scale(${RAYON})`
        )
        slot.path.setAttribute('fill', fill)
        slot.path.setAttribute('opacity', String(d.opacity))
      } else {
        slot.path.style.display = 'none'
        slot.circle.style.display = ''
        slot.circle.setAttribute('cx', String(d.x))
        slot.circle.setAttribute('cy', String(d.y))
        slot.circle.setAttribute('r', String(d.r))
        slot.circle.setAttribute('fill', fill)
        slot.circle.setAttribute('opacity', String(d.opacity))
      }
    }
  }

  function render(frame: BotFrame, ink: string) {
    maskBody.setAttribute('d', frame.bodyPath)
    bodyPaper.setAttribute('d', frame.bodyPath)
    gBody.setAttribute('opacity', String(frame.bodyAlpha))
    rectInk.setAttribute('fill', ink)

    for (let i = 0; i < maskEyes.length; i++) {
      const eye = frame.eyes[i]
      const node = maskEyes[i]!
      if (!eye) {
        node.style.display = 'none'
        continue
      }
      node.style.display = ''
      node.setAttribute('d', eye.d)
      node.setAttribute('transform', eye.matrix)
      node.setAttribute('opacity', String(eye.alpha))
    }

    if (frame.notch) {
      maskNotch.style.display = ''
      maskNotch.setAttribute('cx', String(frame.notch.x))
      maskNotch.setAttribute('cy', String(frame.notch.y))
      maskNotch.setAttribute('r', String(frame.notch.r))
    } else {
      maskNotch.style.display = 'none'
    }

    reconcileDots(slotsBehind, frame.dotsBehind ? frame.dots : [], ink)
    reconcileDots(slotsFront, frame.dotsBehind ? [] : frame.dots, ink)

    if (frame.notif) {
      notifCircle.style.display = ''
      notifCircle.setAttribute('cx', String(frame.notif.x))
      notifCircle.setAttribute('cy', String(frame.notif.y))
      notifCircle.setAttribute('r', String(frame.notif.r))
    } else {
      notifCircle.style.display = 'none'
    }

    reconcileArcs(frame)
  }

  /* ----- clock ---------------------------------------------------------- */

  let raf = 0
  let last = 0
  let clock = 0
  let inView = true
  let running = false

  function frame(ms: number) {
    raf = requestAnimationFrame(frame)
    const dt = last ? Math.min((ms - last) / 1000, 0.064) : 0
    last = ms
    clock += dt
    if (inView) {
      if (follow) aim()
      inkHex = currentInk(clock)
      render(engine.sample(clock), inkHex)
    }
  }

  function start() {
    if (running) return
    running = true
    last = 0
    raf = requestAnimationFrame(frame)
  }
  function stop() {
    running = false
    cancelAnimationFrame(raf)
  }

  /* ----- pointer gaze --------------------------------------------------- */

  let pointer: { x: number; y: number } | null = null
  let aiming = false

  function release() {
    pointer = null
    if (aiming) {
      engine.setLook(null, clock)
      aiming = false
    }
  }

  function aim() {
    if (!pointer) {
      if (aiming) {
        engine.setLook(null, clock)
        aiming = false
      }
      return
    }
    // Gaze control only applies to rest-face states (the widget stays on
    // idle while moods change).
    if (!STATE_BY_ID.get(engine.state)?.baseFace) {
      if (aiming) {
        engine.setLook(null, clock)
        aiming = false
      }
      return
    }
    const box = svg.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return
    const demiW = Math.max(1, window.innerWidth / 2)
    const demiH = Math.max(1, window.innerHeight / 2)
    const nx = clamp((pointer.x - (box.left + box.width / 2)) / demiW, -1, 1)
    const ny = clamp((pointer.y - (box.top + box.height / 2)) / demiH, -1, 1)
    const look: Look = {
      yaw: nx * YAW_MAX,
      pitch: PITCH_CENTER - ny * PITCH_MAX,
      mix: 1,
      spin: 0,
      wander: pointer ? 0 : 1
    }
    engine.setLook(look, clock)
    aiming = true
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType === 'touch') return
    pointer = { x: event.clientX, y: event.clientY }
  }

  /* ----- click / dblclick ------------------------------------------------ */

  function pop() {
    ball.animate(
      [
        { transform: 'scale(0.8)' },
        { transform: 'scale(1.06)' },
        { transform: 'scale(1)' }
      ],
      { duration: 320, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
    )
  }

  function onClick(event: Event) {
    event.stopPropagation()
    applyMood((index + 1) % moods.length, clock, false)
    if (popEnabled) pop()
    config.onMoodChange?.(index)
  }

  function encodeConfig(): string {
    // Compact form: [expression, color, shape] triples.
  const payload = moods.map((m) => [
      m.expression,
      m.color ?? 'encre',
      m.shape ?? 'cercle'
    ])
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  function onDblClick() {
    // The customizer page itself sets this flag to avoid opening itself.
    if ((window as any).BLOUB_TOOL) return
    window.open(`${toolUrl}#cfg=${encodeConfig()}`, '_blank')
  }

  /* ----- lifecycle ------------------------------------------------------ */

  let observer: IntersectionObserver | null = null

  if (frozen === false) {
    observer = new IntersectionObserver(
      (entries) => {
        inView = entries[0]?.isIntersecting ?? true
        if (inView) start()
        else stop()
      },
      { rootMargin: '40px' }
    )
    observer.observe(host)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', release)
    if (clickable) host.addEventListener('click', onClick)
    host.addEventListener('dblclick', onDblClick)
    start()
  } else {
    const t = frozen === true ? 1 : frozen
    render(engine.sample(t), inkHex)
  }

  return {
    setMoods(next: MoodItem[], startIndex = 0) {
      moods = next.length ? next : moods
      applyMood(startIndex % moods.length, clock, true)
      inkHex = currentInk(clock)
      render(engine.sample(clock), inkHex)
    },
    getMoods() {
      return moods
    },
    setIndex(i: number) {
      const n = moods.length
      index = ((i % n) + n) % n
      applyMood(index, clock, true)
      inkHex = currentInk(clock)
      render(engine.sample(clock), inkHex)
    },
    getIndex() {
      return index
    },
    destroy() {
      stop()
      observer?.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      document.documentElement.removeEventListener('mouseleave', release)
      host.removeEventListener('click', onClick)
      host.removeEventListener('dblclick', onDblClick)
      ball.remove()
      host.classList.remove('bloub-host')
    }
  }
}

/* ------------------------------------------------------------- fixed disc */

/**
 * Global mode: create a fixed badge disc in a viewport corner and append it to
 * the document body. No container element is needed.
 */
export function fixed(
  fixedOptions: FixedOptions = {},
  config: BloubConfig = {}
): BloubInstance {
  injectCss()
  const size = fixedOptions.size ?? 64
  const margin = fixedOptions.margin ?? 16
  const corner = fixedOptions.corner ?? 'br'

  const host = document.createElement('div')
  host.className = 'bloub-fixed'
  host.style.width = `${size}px`
  host.style.height = `${size}px`
  const vertical = corner[0] === 't' ? 'top' : 'bottom'
  const horizontal = corner[1] === 'l' ? 'left' : 'right'
  host.style[vertical] = `${margin}px`
  host.style[horizontal] = `${margin}px`
  host.setAttribute('tabindex', '0')
  host.setAttribute('role', 'button')
  host.setAttribute('aria-label', 'bloub')

  document.body.append(host)
  return mount(host, config)
}

/* ------------------------------------------------------------- auto init */

function autoInit() {
  document.querySelectorAll<HTMLElement>('[data-bloub]').forEach((el) => {
    if (el.classList.contains('bloub-host')) return
    let config: BloubConfig = {}
    try {
      config = JSON.parse(el.getAttribute('data-bloub') ?? '{}')
    } catch {
      config = {}
    }
    mount(el, config)
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoInit)
} else {
  autoInit()
}

/* ------------------------------------------------------------- public api */

export const VERSION = '1.0.0'

declare global {
  interface Window {
    Bloub?: {
      mount: typeof mount
      fixed: typeof fixed
      VERSION: string
    }
  }
}
if (typeof window !== 'undefined') {
  window.Bloub = { mount, fixed, VERSION }
}
