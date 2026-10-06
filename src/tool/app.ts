/*
 * bloub customizer page logic (revision 2).
 * The engine is loaded separately as the global `Bloub` (see bloub.js).
 *
 * Interaction model:
 *  - Shape and colour are global settings that apply to all 16 expression tiles.
 *  - Clicking an expression tile previews it (frozen, no gaze, no click cycle);
 *    dragging it carries the current shape + colour into the sequence.
 *  - The preview has two modes: expression (static) and sequence (live, gaze
 *    follow + click cycle). The currently-previewed item gets a strong highlight.
 *  - Each sequence chip has edit + delete buttons; the edit modal lets the user
 *    override shape and colour for that single mood.
 */

/* ------------------------------------------------------------- catalogs */

const EXPRESSION_IDS = [
  'neutre', 'attentif', 'surpris', 'excite',
  'heureux', 'hilare', 'colere', 'triste',
  'effraye', 'mefiant', 'confus', 'curieux',
  'fier', 'timide', 'blase', 'somnolent'
]

const SHAPE_IDS = [
  'cercle', 'galet', 'squircle', 'capsule',
  'triangle', 'hexagone', 'nuage', 'goutte'
]

const COLOR_IDS = [
  'encre', 'brun', 'rouge', 'orange',
  'ambre', 'vert', 'turquoise', 'bleu',
  'violet', 'rose', 'gris', 'creme'
]

const COLOR_HEX: Record<string, string> = {
  encre: '#0a0a0c', brun: '#8b5e3c', rouge: '#e8483f', orange: '#f08a24',
  ambre: '#f0b429', vert: '#3ecf8e', turquoise: '#2fbfa0', bleu: '#3b93f0',
  violet: '#8b5cf6', rose: '#e152b0', gris: '#a3a3a3', creme: '#f1efe9'
}

const TOOL_ORIGIN = 'https://bloub.wangnan.net'

interface MoodItem {
  expression: string
  color: string
  shape: string
}

/* ------------------------------------------------------------- state */

let moods: MoodItem[] = [
  { expression: 'neutre', color: 'encre', shape: 'cercle' },
  { expression: 'heureux', color: 'encre', shape: 'cercle' },
  { expression: 'surpris', color: 'encre', shape: 'cercle' }
]

// Global picker settings — apply to all expression tiles.
let currentColor = 'encre'
let currentShape = 'cercle'

// Preview mode.
let previewMode: 'expression' | 'sequence' = 'sequence'
let previewExpression = 'neutre'
let sequenceIndex = 0

// Edit modal.
let editIndex = -1
let modalInstance: { destroy(): void; setMoods(m: MoodItem[]): void } | null = null

/* ------------------------------------------------------------- helpers */

function el(tag: string, className?: string): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

function frozenBall(container: HTMLElement, mood: MoodItem) {
  window.Bloub.mount(container, { moods: [mood], follow: false, clickable: false, pop: false }, 1)
}

/* ------------------------------------------------------------- expression panel */

function buildExpressionPanel() {
  const grid = document.getElementById('expr-grid')!
  grid.innerHTML = ''
  for (const id of EXPRESSION_IDS) {
    const tile = el('div', 'tile') as HTMLDivElement
    tile.draggable = true
    tile.dataset.id = id
    tile.dataset.type = 'expr'
    const thumb = el('div', 'tile-thumb')
    const label = el('span', 'tile-label')
    label.dataset.type = 'expr'
    label.dataset.id = id
    label.textContent = exprLabel(id)
    tile.append(thumb, label)
    frozenBall(thumb, { expression: id, color: currentColor, shape: currentShape })

    tile.addEventListener('click', () => {
      previewMode = 'expression'
      previewExpression = id
      remountPreview()
    })

    tile.addEventListener('dragstart', (event) => {
      const data = JSON.stringify({ kind: 'expression', id, shape: currentShape, color: currentColor })
      event.dataTransfer!.setData('application/bloub', data)
      event.dataTransfer!.effectAllowed = 'copyMove'
      tile.classList.add('drag-source')
    })
    tile.addEventListener('dragend', () => tile.classList.remove('drag-source'))

    grid.append(tile)
  }
}

/* ------------------------------------------------------------- shape panel */

function buildShapePanel() {
  const grid = document.getElementById('shape-grid')!
  grid.innerHTML = ''
  for (const id of SHAPE_IDS) {
    const tile = el('div', 'tile') as HTMLDivElement
    tile.dataset.id = id
    tile.dataset.type = 'shape'
    if (id === currentShape) tile.classList.add('shape-active')
    const thumb = el('div', 'tile-thumb')
    const label = el('span', 'tile-label')
    label.dataset.type = 'shape'
    label.dataset.id = id
    label.textContent = shapeLabel(id)
    tile.append(thumb, label)
    frozenBall(thumb, { expression: 'neutre', color: currentColor, shape: id })

    tile.addEventListener('click', () => {
      currentShape = id
      document.querySelectorAll('#shape-grid .tile').forEach((t) => t.classList.toggle('shape-active', t.dataset.id === id))
      buildExpressionPanel()
      if (previewMode === 'expression') remountPreview()
    })

    grid.append(tile)
  }
}

/* ------------------------------------------------------------- color panel */

function buildColorPanel() {
  const grid = document.getElementById('color-grid')!
  grid.innerHTML = ''
  for (const id of COLOR_IDS) {
    const swatch = el('button', 'swatch') as HTMLButtonElement
    swatch.type = 'button'
    swatch.dataset.id = id
    if (id === currentColor) swatch.classList.add('color-active')
    swatch.style.background = COLOR_HEX[id]
    swatch.title = id

    swatch.addEventListener('click', () => {
      currentColor = id
      document.querySelectorAll('#color-grid .swatch').forEach((s) => s.classList.toggle('color-active', s.dataset.id === id))
      buildExpressionPanel()
      buildShapePanel()
      if (previewMode === 'expression') remountPreview()
    })

    grid.append(swatch)
  }
}

/* ------------------------------------------------------------- sequence editor */

function chipInsertIndex(clientX: number): number {
  const chips = [...document.querySelectorAll<HTMLElement>('#sequence .chip')]
  for (let i = 0; i < chips.length; i++) {
    const rect = chips[i]!.getBoundingClientRect()
    if (clientX < rect.left + rect.width / 2) return i
  }
  return chips.length
}

function bindSequenceDrop() {
  const sequence = document.getElementById('sequence')!

  sequence.addEventListener('dragover', (event) => {
    event.preventDefault()
    event.dataTransfer!.dropEffect = 'copyMove'
    sequence.classList.add('drag-over')
    const chipEl = (event.target as HTMLElement).closest('.chip') as HTMLElement | null
    document.querySelectorAll('.chip.drop-target').forEach((c) => c.classList.remove('drop-target'))
    chipEl?.classList.add('drop-target')
  })

  sequence.addEventListener('dragleave', (event) => {
    if (event.target === sequence) sequence.classList.remove('drag-over')
  })

  sequence.addEventListener('drop', (event) => {
    event.preventDefault()
    sequence.classList.remove('drag-over')
    document.querySelectorAll('.chip.drop-target').forEach((c) => c.classList.remove('drop-target'))

    const raw = event.dataTransfer!.getData('application/bloub')
    if (!raw) return
    const data = JSON.parse(raw) as { kind: string; id?: string; index?: number; shape?: string; color?: string }
    const chipEl = (event.target as HTMLElement).closest('.chip') as HTMLElement | null

    if (data.kind === 'expression') {
      const shape = data.shape ?? 'cercle'
      const color = data.color ?? 'encre'
      if (chipEl) {
        const i = Number(chipEl.dataset.index)
        moods[i] = { expression: data.id!, color, shape }
      } else {
        const at = chipInsertIndex(event.clientX)
        moods.splice(at, 0, { expression: data.id!, color, shape })
      }
    } else if (data.kind === 'chip') {
      const from = data.index!
      const item = moods[from]!
      moods.splice(from, 1)
      let at: number
      if (chipEl) {
        at = Number(chipEl.dataset.index)
        if (from < at) at -= 1
      } else {
        at = chipInsertIndex(event.clientX)
        if (from < at) at -= 1
      }
      at = Math.max(0, Math.min(at, moods.length))
      moods.splice(at, 0, item)
    }
    if (sequenceIndex >= moods.length) sequenceIndex = 0
    refresh()
  })
}

function renderSequence() {
  const sequence = document.getElementById('sequence')!
  sequence.querySelectorAll('.chip').forEach((c) => c.remove())
  const empty = document.getElementById('sequence-empty')!
  empty.style.display = moods.length ? 'none' : ''

  moods.forEach((mood, i) => {
    const chip = el('div', 'chip') as HTMLDivElement
    chip.draggable = true
    chip.dataset.index = String(i)

    const thumb = el('div', 'chip-thumb')
    const label = el('span', 'chip-label')
    label.textContent = exprLabel(mood.expression)

    const actions = el('div', 'chip-actions')
    const editBtn = el('button', 'chip-btn chip-edit') as HTMLButtonElement
    editBtn.type = 'button'
    editBtn.title = 'Edit'
    editBtn.innerHTML = '<svg viewBox="0 0 24 24" width="10" height="10"><path d="M4 20h4l10.5-10.5-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'
    const delBtn = el('button', 'chip-btn chip-del') as HTMLButtonElement
    delBtn.type = 'button'
    delBtn.title = 'Delete'
    delBtn.textContent = '\u00d7'
    actions.append(editBtn, delBtn)

    frozenBall(thumb, mood)

    chip.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('.chip-actions')) return
      previewMode = 'sequence'
      sequenceIndex = i
      remountPreview()
    })

    editBtn.addEventListener('click', (event) => {
      event.stopPropagation()
      openEditModal(i)
    })

    delBtn.addEventListener('click', (event) => {
      event.stopPropagation()
      moods.splice(i, 1)
      if (sequenceIndex === i) sequenceIndex = 0
      else if (sequenceIndex > i) sequenceIndex -= 1
      if (sequenceIndex >= moods.length) sequenceIndex = 0
      refresh()
    })

    chip.addEventListener('dragstart', (event) => {
      event.dataTransfer!.setData('application/bloub', JSON.stringify({ kind: 'chip', index: i }))
      event.dataTransfer!.effectAllowed = 'move'
    })

    chip.append(thumb, label, actions)
    sequence.append(chip)
  })
}

/* ------------------------------------------------------------- preview */

let previewInstance: { destroy(): void; setIndex(i: number): void; getIndex(): number } | null = null

function remountPreview() {
  previewInstance?.destroy()
  previewInstance = null
  const host = document.getElementById('preview')!
  host.innerHTML = ''

  if (previewMode === 'expression') {
    // Live animation (breathing, blinking, gaze wander) but no pointer
    // follow and no click cycle — just the expression's natural idle.
    previewInstance = window.Bloub.mount(host, {
      moods: [{ expression: previewExpression, color: currentColor, shape: currentShape }],
      follow: false,
      clickable: false,
      pop: false
    })
  } else {
    previewInstance = window.Bloub.mount(host, {
      moods,
      follow: true,
      clickable: true,
      pop: true,
      onMoodChange: (i: number) => {
        sequenceIndex = i
        updateHighlight()
      }
    })
    previewInstance.setIndex(sequenceIndex)
  }
  updateHighlight()
}

function updateHighlight() {
  document.querySelectorAll('#expr-grid .tile').forEach((t) => {
    t.classList.toggle('previewing', previewMode === 'expression' && t.dataset.id === previewExpression)
  })
  document.querySelectorAll('#sequence .chip').forEach((c) => {
    c.classList.toggle('previewing', previewMode === 'sequence' && Number(c.dataset.index) === sequenceIndex)
  })
}

/* ------------------------------------------------------------- edit modal */

function openEditModal(i: number) {
  editIndex = i
  const host = document.getElementById('edit-preview')!
  host.innerHTML = ''
  modalInstance = window.Bloub.mount(host, {
    moods: [moods[i]],
    follow: true,
    clickable: false,
    pop: false
  })
  document.getElementById('edit-label')!.textContent = exprLabel(moods[i]!.expression)

  buildEditShapeGrid()
  buildEditColorGrid()
  document.getElementById('edit-modal')!.hidden = false
}

function closeEditModal() {
  document.getElementById('edit-modal')!.hidden = true
  modalInstance?.destroy()
  modalInstance = null
  document.getElementById('edit-preview')!.innerHTML = ''
}

function buildEditShapeGrid() {
  const grid = document.getElementById('edit-shape-grid')!
  grid.innerHTML = ''
  const mood = moods[editIndex]!
  for (const id of SHAPE_IDS) {
    const tile = el('div', 'tile') as HTMLDivElement
    tile.dataset.id = id
    if (id === mood.shape) tile.classList.add('shape-active')
    const thumb = el('div', 'tile-thumb')
    const label = el('span', 'tile-label')
    label.textContent = shapeLabel(id)
    tile.append(thumb, label)
    frozenBall(thumb, { expression: 'neutre', color: 'encre', shape: id })
    tile.addEventListener('click', () => {
      moods[editIndex]!.shape = id
      modalInstance?.setMoods([moods[editIndex]!])
      refresh()
      buildEditShapeGrid()
    })
    grid.append(tile)
  }
}

function buildEditColorGrid() {
  const grid = document.getElementById('edit-color-grid')!
  grid.innerHTML = ''
  const mood = moods[editIndex]!
  for (const id of COLOR_IDS) {
    const swatch = el('button', 'swatch') as HTMLButtonElement
    swatch.type = 'button'
    swatch.dataset.id = id
    if (id === mood.color) swatch.classList.add('color-active')
    swatch.style.background = COLOR_HEX[id]
    swatch.addEventListener('click', () => {
      moods[editIndex]!.color = id
      modalInstance?.setMoods([moods[editIndex]!])
      refresh()
      buildEditColorGrid()
    })
    grid.append(swatch)
  }
}

/* ------------------------------------------------------------- code generation */

function configJson(): string {
  return JSON.stringify({
    moods: moods.map((m) => ({ expression: m.expression, color: m.color, shape: m.shape }))
  })
}

function containerCode(): string {
  return (
`<!-- bloub widget: paste inside a positioned <div> with a width and a height -->
<div data-bloub='${configJson()}' style="width:100%;height:100%"></div>
<script src="${TOOL_ORIGIN}/bloub.js"><\/script>`
  )
}

function globalCode(): string {
  return (
`<!-- bloub widget: paste inside <body> -->
<script src="${TOOL_ORIGIN}/bloub.js"><\/script>
<script>
  Bloub.fixed({ corner: "br", size: 64, margin: 16 }, ${configJson()});
<\/script>`
  )
}

function renderCode() {
  document.getElementById('code-container')!.textContent = containerCode()
  document.getElementById('code-global')!.textContent = globalCode()
}

/* ------------------------------------------------------------- copy buttons */

const CHECK_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
  '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" ' +
  'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'

function fallbackCopy(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  textarea.remove()
  return ok
}

function bindCopy(buttonId: string, getCode: () => string) {
  const button = document.getElementById(buttonId)! as HTMLButtonElement
  const original = button.innerHTML
  button.addEventListener('click', async () => {
    const text = getCode()
    let ok = false
    try { await navigator.clipboard.writeText(text); ok = true } catch { ok = fallbackCopy(text) }
    if (!ok) return
    button.classList.add('copied')
    button.innerHTML = CHECK_SVG
    window.setTimeout(() => {
      button.classList.remove('copied')
      button.innerHTML = original
    }, 1600)
  })
}

/* ------------------------------------------------------------- i18n */

const EXPR_LABELS: Record<string, { zh: string; en: string }> = {
  neutre: { zh: '平静', en: 'Calm' },
  attentif: { zh: '专注', en: 'Attentive' },
  surpris: { zh: '惊讶', en: 'Surprised' },
  excite: { zh: '兴奋', en: 'Excited' },
  heureux: { zh: '开心', en: 'Happy' },
  hilare: { zh: '大笑', en: 'Laughing' },
  colere: { zh: '生气', en: 'Angry' },
  triste: { zh: '难过', en: 'Sad' },
  effraye: { zh: '害怕', en: 'Scared' },
  mefiant: { zh: '警惕', en: 'Wary' },
  confus: { zh: '困惑', en: 'Confused' },
  curieux: { zh: '好奇', en: 'Curious' },
  fier: { zh: '骄傲', en: 'Proud' },
  timide: { zh: '害羞', en: 'Shy' },
  blase: { zh: '无聊', en: 'Bored' },
  somnolent: { zh: '困倦', en: 'Sleepy' }
}

const SHAPE_LABELS: Record<string, { zh: string; en: string }> = {
  cercle: { zh: '圆形', en: 'Circle' },
  galet: { zh: '卵石', en: 'Pebble' },
  squircle: { zh: '方圆', en: 'Squircle' },
  capsule: { zh: '胶囊', en: 'Capsule' },
  triangle: { zh: '三角', en: 'Triangle' },
  hexagone: { zh: '六边', en: 'Hexagon' },
  nuage: { zh: '云朵', en: 'Cloud' },
  goutte: { zh: '水滴', en: 'Drop' }
}

function exprLabel(id: string): string {
  return EXPR_LABELS[id]?.[lang] ?? id
}
function shapeLabel(id: string): string {
  return SHAPE_LABELS[id]?.[lang] ?? id
}

const I18N: Record<string, Record<string, string>> = {
  zh: {
    h_intro: '介绍',
    intro_sub: '将一个会呼吸、会眨眼、视线跟随鼠标的动画 SVG 挂件放进你的页面',
    h_how: '使用方法',
    how_1: '在右侧选择形状与颜色，所有表情会同步更新',
    how_2: '点击表情可在中间预览；拖拽表情到下方序列即可添加或替换',
    how_3: '序列中拖动卡片可排序；点击卡片预览并高亮，点击编辑图标可单独修改形状与颜色',
    how_4: '点击小球预览切换效果',
    how_5: '选择一种模式，一键复制代码，插入你的页面',
    h_container: '容器模式',
    container_desc: '放入已设定尺寸的容器，如头像角落或侧边栏',
    h_global: '全局模式',
    global_desc: '粘贴进 <body>，自动在窗口角落生成徽章',
    h_advanced: '高级设置',
    advanced_pre: '进入',
    advanced_post: '查看详细配置',
    h_editor: '点击切换序列',
    seq_empty: '将右侧表情拖到这里',
    code_container: '容器模式',
    code_global: '全局模式',
    h_expressions: '表情',
    h_shapes: '形状',
    h_colors: '颜色'
  },
  en: {
    h_intro: 'Introduction',
    intro_sub: 'Drop an animated SVG widget — breathing, blinking, gaze-following — into your page.',
    h_how: 'How to use',
    how_1: 'Pick a shape and colour on the right; all expressions update together.',
    how_2: 'Click an expression to preview it in the centre; drag one into the sequence below to add or replace.',
    how_3: 'Drag cards in the sequence to reorder; click a card to preview and highlight it; use the edit icon to override its shape and colour.',
    how_4: 'Click the ball to cycle through effects.',
    how_5: 'Pick a mode, copy the code with one click, and paste it into your page.',
    h_container: 'Container mode',
    container_desc: 'Place inside a sized container, such as an avatar corner or a sidebar.',
    h_global: 'Global mode',
    global_desc: 'Paste into <body>; a badge is created automatically in a viewport corner.',
    h_advanced: 'Advanced',
    advanced_pre: 'Visit',
    advanced_post: 'for detailed configuration.',
    h_editor: 'Click cycle',
    seq_empty: 'Drag expressions here',
    code_container: 'Container mode',
    code_global: 'Global mode',
    h_expressions: 'Expressions',
    h_shapes: 'Shapes',
    h_colors: 'Colours'
  }
}

let lang: 'zh' | 'en' =
  (localStorage.getItem('bloub-lang') as 'zh' | 'en') || 'zh'

function applyI18n() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  const dict = I18N[lang]
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((node) => {
    const key = node.dataset.i18n!
    if (dict[key] !== undefined) node.textContent = dict[key]
  })
  // Expression and shape tile labels.
  document.querySelectorAll<HTMLElement>('.tile-label').forEach((node) => {
    const id = node.dataset.id
    const type = node.dataset.type
    if (!id) return
    node.textContent = type === 'shape' ? shapeLabel(id) : exprLabel(id)
  })
  document.querySelectorAll<HTMLElement>('#sequence .chip-label').forEach((node, i) => {
    if (moods[i]) node.textContent = exprLabel(moods[i]!.expression)
  })
  const editLabel = document.getElementById('edit-label')
  if (editLabel && editIndex >= 0 && moods[editIndex]) {
    editLabel.textContent = exprLabel(moods[editIndex]!.expression)
  }
  document.getElementById('lang-toggle')!.textContent = lang === 'zh' ? 'EN' : '中文'
}

function bindLangToggle() {
  document.getElementById('lang-toggle')!.addEventListener('click', () => {
    lang = lang === 'zh' ? 'en' : 'zh'
    localStorage.setItem('bloub-lang', lang)
    applyI18n()
  })
}

/* ------------------------------------------------------------- config restore */

function restoreFromHash() {
  const match = location.hash.match(/#cfg=([\w-]+)/)
  if (!match) return
  try {
    let b64 = match[1].replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const json = decodeURIComponent(escape(atob(b64)))
    const payload = JSON.parse(json) as unknown[]
    if (Array.isArray(payload) && payload.length) {
      moods = payload.map((entry) => {
        const e = entry as [string, string?, string?]
        return { expression: e[0] ?? 'neutre', color: e[1] ?? 'encre', shape: e[2] ?? 'cercle' }
      })
    }
  } catch {
    /* malformed hash: keep the default sequence */
  }
}

/* ------------------------------------------------------------- refresh */

function refresh() {
  renderSequence()
  renderCode()
  if (previewMode === 'sequence') {
    previewInstance?.destroy()
    const host = document.getElementById('preview')!
    host.innerHTML = ''
    previewInstance = window.Bloub.mount(host, {
      moods,
      follow: true,
      clickable: true,
      pop: true,
      onMoodChange: (i: number) => { sequenceIndex = i; updateHighlight() }
    })
    previewInstance.setIndex(sequenceIndex)
  }
  updateHighlight()
}

/* ------------------------------------------------------------- init */

function init() {
  restoreFromHash()
  buildExpressionPanel()
  buildShapePanel()
  buildColorPanel()
  bindSequenceDrop()
  bindCopy('copy-container', containerCode)
  bindCopy('copy-global', globalCode)
  bindLangToggle()

  document.getElementById('edit-close')!.addEventListener('click', closeEditModal)
  document.getElementById('edit-modal')!.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeEditModal()
  })

  remountPreview()
  renderSequence()
  applyI18n()
  renderCode()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
