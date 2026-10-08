// Free, offline "auto-fill from walk notes": reads a site walk's notes and
// general notes (English or Spanish) and drafts the estimate form answers by
// recognizing the work described. No AI service, nothing leaves the phone.
//
// It reads WORDS, not photos — so it only turns on what the notes mention,
// and lists what it assumed / what to confirm in `notes` for the estimator.
// The answers then go through the same deterministic generator (index.js),
// so the wording is always the office's.

import { emptyForm } from './index'
import { list, uniq } from './text'

// Lower-case and strip accents so "zócalo" / "zocalo" / "ZÓCALO" all match.
const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const has = (text, ...patterns) => patterns.some((p) => p.test(text))

const W = {
  ic:          [/infection control/, /\bicra\b/, /control de infecc/, /barrier|barrera/],
  dust:        [/\bdust\b/, /\bpolvo\b/],
  clinical:    [/\bexam\b/, /patient/, /hospital/, /procedure/, /\bclinic/, /consultorio/, /paciente/, /quirofano/],
  water:       [/water damage/, /water[- ]damaged/, /\bleak/, /\bwet\b/, /moisture/, /dano (por|de) agua/, /\bfuga/, /gotera/, /humedad/, /mojad/],
  mold:        [/\bmold\b/, /\bmould\b/, /mildew/, /\bmoho\b/, /\bhongo/],
  drywall:     [/drywall/, /sheetrock/, /wallboard/, /gypsum/, /tablaroca/, /\byeso\b/, /panel de yeso/, /\bwall(s)?\b.*(damag|hole|crack|repair)/, /pared(es)?.*(dan|hueco|grieta|repar)/],
  moldRes:     [/mold[- ]resistant/, /resistente al moho/, /green ?board/, /purple ?board/],
  moistRes:    [/moisture[- ]resistant/, /resistente a (la )?humedad/],
  fireRated:   [/fire[- ]rated/, /type x/, /contra fuego/, /resistente al fuego/],
  level5:      [/level ?5/, /nivel ?5/],
  insulation:  [/insulation/, /aislamiento/, /aislante/],
  newWalls:    [/new wall/, /all (the )?wallboard/, /replace all/, /pared(es)? nueva/, /todo el (drywall|panel|tablaroca)/, /reemplazar todo/],
  ceilingHard: [/(hard|solid|drywall|sheetrock)[- ]?(lid )?ceiling/, /ceiling.*(drywall|sheetrock)/, /techo (de )?(drywall|tablaroca|solido|yeso)/],
  ceilingTile: [/ceiling tile/, /acoustical/, /\bgrid\b/, /drop ceiling/, /plafon/, /rejilla/, /techo (falso|suspendido)/],
  paint:       [/\bpaint/, /primer/, /repaint/, /pintar/, /pintura/, /retoc/],
  paintAll:    [/repaint (all|the whole|entire)/, /paint (all|the whole|entire)/, /pintar todo/, /pintar (las )?paredes completas/],
  extDoor:     [/exterior door/, /puerta exterior/],
  cove:        [/cove ?base/, /base ?board/, /\bzocalo/, /rodapie/, /guardapolvo/],
  film:        [/\bfilm\b/, /pelicula/, /\bvinil\b.*ventana/, /privacy/, /privacidad/],
  tint:        [/\btint/, /polariz/],
  window:      [/(new|sliding|pass[- ]through|slider) window/, /window.*(install|opening)/, /ventana (nueva|corrediza)/, /instalar (una )?ventana/, /pass[- ]through/],
  framing:     [/\bfram(e|ing)\b/, /stud/, /enmarcar/, /estructura/, /close (it )?(in|off)/, /cerrar (el|la) (hueco|espacio|area)/],
  storage:     [/storage/, /closet/, /almacenamiento/, /bodega/, /armario/],
  cap:         [/\bcap\b/, /cap (off|it)/, /capped/, /tapon/, /taponar/, /sellar (la )?(tuberia|plomeria)/],
  plumbingAny: [/plumb/, /plomer/, /tuberia/, /supply line/, /\bdrain\b/, /desague/],
  reconnect:   [/reconnect/, /reconectar/],
}

const ITEMS = [
  ['bathtub', [/bath ?tub/, /\btub\b/, /\btina\b/, /banera/]],
  ['sink', [/\bsink\b/, /lavabo/, /lavamanos/, /fregadero/]],
  ['toilet', [/toilet/, /inodoro/, /\bsanitario/]],
  ['cabinet', [/cabinet/, /gabinete/, /mueble/]],
  ['countertop', [/countertop/, /encimera/, /meson/, /mostrador/]],
  ['shower', [/shower/, /\bducha\b/, /regadera/]],
]
const REMOVE = /(remove|removal|demo|tear out|take out|quitar|remover|retirar|sacar|demoler)/

// "Exam Rooms 7, 8 & 10" / "consultorios 7 y 8" → "Exam Rooms 7, 8, and 10"
function findRooms(raw) {
  // Field shorthand too: "Exam rm 3", "exam rms 7-8", "consultorios 7 y 8".
  const m = raw.match(/\b(exam|patient|procedure|break|rest|treatment|consult(?:ation|orio)?)s?\s*(?:rooms?|rms?\.?)?\s*#?\s*(\d+(?:\s*(?:,|&|and|y|-)\s*\d+)*)/i)
  if (!m) return ''
  const nums = m[2].split(/\s*(?:,|&|and|y)\s*/i).map((x) => x.trim()).filter(Boolean)
  const kind = /consult/i.test(m[1]) ? 'Exam' : m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()
  return `${kind} Room${nums.length > 1 ? 's' : ''} ${list(nums)}`
}

// 28x28, 28" x 28", 28 × 28 in → { width, height }
function findSize(text) {
  const m = text.match(/(\d{1,3}(?:\.\d+)?)\s*(?:"|''|in(?:ch(?:es)?)?|pulg(?:adas)?)?\s*[x×]\s*(\d{1,3}(?:\.\d+)?)/)
  return m ? { width: m[1], height: m[2] } : null
}

// Square feet / linear feet mentioned, for the estimator's checklist.
function findQuantities(raw) {
  const out = []
  for (const m of raw.matchAll(/~?\s*(\d+(?:\.\d+)?)\s*(sf|sq\.? ?ft|square feet|pies cuadrados|lf|linear feet|pies lineales)\b/gi)) out.push(`${m[1]} ${m[2]}`)
  return uniq(out)
}

// A saved material named in the notes (e.g. "Canvas Tan", "Moon Rock").
function findLibrary(text, library, kind) {
  return library.filter((l) => l.kind === kind).find((l) => fold(text).includes(fold(l.label)))?.label ?? ''
}

/**
 * @param {{ notes: string[], generalNotes?: string, title?: string, locationDetail?: string, library?: {kind,label}[] }} walk
 * @returns {{ form: object, notes: string[] }}
 */
export function formFromNotes({ notes = [], generalNotes = '', title = '', locationDetail = '', library = [] }) {
  const raw = [...notes, generalNotes].filter(Boolean).join('\n')
  const t = fold(raw)
  const f = emptyForm()
  const c = f.cats
  const remarks = []

  const rooms = findRooms(raw)
  const where = rooms || (locationDetail ?? '').trim()
  f.locations = rooms
  f.area = where ? `work area within ${where}` : 'work area'
  if (rooms && /rooms/i.test(rooms)) f.leaveArea = 'the affected areas'

  // ── Removal of a specific item ──
  for (const [item, pats] of ITEMS) {
    if (has(t, ...pats) && REMOVE.test(t)) {
      Object.assign(c.itemRemoval, { on: true, item, plumbing: ['bathtub', 'sink', 'toilet', 'shower'].includes(item) })
      break
    }
  }

  // ── Water damage / mold ──
  const water = has(t, ...W.water)
  const mold = has(t, ...W.mold)
  if (mold) c.antimicrobial.on = true

  // ── Drywall ──
  const drywallWords = has(t, ...W.drywall)
  if (drywallWords || water || mold) {
    const full = has(t, ...W.newWalls)
    c.drywall.on = true
    c.drywall.mode = full ? 'full' : (water || mold || !has(t, ...W.framing)) ? 'replace' : 'new'
    c.drywall.type = has(t, ...W.moldRes) ? 'mold-resistant' : has(t, ...W.moistRes) ? 'moisture-resistant' : has(t, ...W.fireRated) ? 'fire-rated' : 'standard'
    c.drywall.insulation = has(t, ...W.insulation)
    c.drywall.finishLevel = has(t, ...W.level5) ? 5 : 4
    c.demo.on = true
    if (full) c.demo.mode = 'wallboard'
    else Object.assign(c.demo, { mode: 'affected', wallDrywall: true, insulation: c.drywall.insulation })
  }

  // ── Ceilings ──
  if (has(t, ...W.ceilingTile)) remarks.push('notes mention ceiling tile / grid — tile & grid work isn’t a form category yet; add it under Other if needed')
  if (has(t, ...W.ceilingHard)) {
    c.ceiling.on = true
    if (c.demo.on && c.demo.mode === 'affected') c.demo.solidCeiling = true
  }

  // ── Cove base ──
  if (has(t, ...W.cove)) {
    const color = findLibrary(raw, library, 'cove_base')
    Object.assign(c.coveBase, { on: true, mode: color ? 'new' : 'match', color })
    if (c.demo.on && c.demo.mode === 'affected' && !color) c.demo.coveBase = true
  }

  // ── Painting (implied by any drywall work) ──
  if (has(t, ...W.paint) || c.drywall.on || c.ceiling.on) {
    const color = findLibrary(raw, library, 'paint_color')
    const full = has(t, ...W.paintAll) || c.drywall.mode === 'full'
    Object.assign(c.painting, { on: true, mode: full ? 'full' : 'match', color, exteriorDoor: has(t, ...W.extDoor) })
    if (!has(t, ...W.paint)) remarks.push('painting added because drywall/ceiling work needs it — remove if not wanted')
  }

  // ── Windows ──
  const size = findSize(t)
  if (has(t, ...W.film)) Object.assign(c.windowFilm, { on: true, film: has(t, ...W.tint) ? 'tinted' : 'frosted' })
  if (has(t, ...W.window) || (size && /ventana|window/.test(t) && !c.windowFilm.on)) {
    Object.assign(c.window, {
      on: true, kind: /fixed|fija/.test(t) ? 'fixed' : 'sliding',
      glazing: /frost|esmerilad/.test(t) ? 'frosted' : /clear|transparente/.test(t) ? 'clear' : '',
      qty: 1, width: size?.width ?? '', height: size?.height ?? '', approx: true, touchUp: true,
    })
    if (!size) remarks.push('window size not found in the notes — add width × height')
  }

  // ── Framing ──
  if (has(t, ...W.framing)) {
    const purpose = has(t, ...W.storage) ? 'storage space' : 'designated space'
    Object.assign(c.framing, { on: true, area: c.itemRemoval.on ? `former ${c.itemRemoval.item} area` : 'designated area', purpose })
    if (c.drywall.on && c.drywall.mode === 'replace' && !water && !mold) c.drywall.mode = 'new'
  }

  // ── Plumbing — only when the notes ask for it ──
  if (has(t, ...W.cap) || (c.itemRemoval.on && c.itemRemoval.plumbing && has(t, ...W.plumbingAny))) {
    Object.assign(c.plumbing, { on: true, work: has(t, ...W.reconnect) ? 'reconnect' : 'cap' })
  } else if (has(t, ...W.plumbingAny)) {
    remarks.push('notes mention plumbing — confirm whether plumbing work is in scope (not turned on automatically)')
  }
  if (c.itemRemoval.on && c.itemRemoval.plumbing && !c.plumbing.on) {
    remarks.push(`confirm what happens to the ${c.itemRemoval.item}’s plumbing (cap off / reconnect)`)
  }

  // ── Infection control ──
  if (has(t, ...W.ic)) f.ic = 'required'
  else if (has(t, ...W.clinical) && (c.demo.on || c.drywall.on || c.ceiling.on)) {
    f.ic = 'required'
    remarks.push('infection control set to Required because it’s demolition in a clinical area — confirm with the facility')
  } else if (has(t, ...W.dust)) f.ic = 'limited'

  // ── Protect / verify ──
  f.protect = uniq([
    'flooring', 'walls',
    c.ceiling.on && 'solid ceiling',
    /countertop|encimera|meson|mostrador/.test(t) && 'countertops',
    has(t, ...W.clinical) && 'medical equipment',
    'equipment',
    (c.demo.on || c.plumbing.on) && 'utilities',
  ])
  f.verify = uniq([
    c.windowFilm.on && 'window dimensions', c.windowFilm.on && 'glazing conditions',
    c.window.on && 'the opening dimensions', c.window.on && 'wall construction', c.window.on && 'mounting conditions',
    c.plumbing.on && 'existing plumbing locations',
    (water || mold) && 'the extent of affected materials',
    !c.window.on && !c.windowFilm.on && 'dimensions',
    'existing conditions',
  ])

  // ── Title ──
  const parts = uniq([
    c.itemRemoval.on && `${c.itemRemoval.item[0].toUpperCase()}${c.itemRemoval.item.slice(1)} Removal`,
    c.drywall.on && (c.drywall.type !== 'standard' ? `${c.drywall.type.replace(/(^|-)([a-z])/g, (_, p, ch) => p + ch.toUpperCase())} Drywall` : 'Drywall'),
    c.drywall.insulation && 'Insulation',
    c.coveBase.on && 'Cove Base',
    c.ceiling.on && 'Hard-Ceiling',
    c.windowFilm.on && `${c.windowFilm.film === 'tinted' ? 'Tinted' : 'Frosted'} Window Film`,
    c.window.on && `${c.window.glazing ? `${c.window.glazing[0].toUpperCase()}${c.window.glazing.slice(1)} ` : ''}${c.window.kind === 'fixed' ? 'Fixed' : 'Sliding'} Window`,
  ])
  const repair = c.drywall.on && c.drywall.mode === 'replace'
  const generated = parts.length ? `${list(parts)} ${repair ? 'Repairs' : 'Installation'}${rooms ? ` – ${rooms}` : ''}` : ''
  f.title = generated || title

  // ── Checklist for the estimator ──
  const qty = findQuantities(raw)
  if (qty.length) remarks.push(`quantities in the notes: ${qty.join(', ')}`)
  if (!Object.values(c).some((x) => x.on)) remarks.push('no scope recognized in the notes — pick the categories by hand')
  remarks.push('auto-filled from the written notes only; check it against the photos')

  return { form: f, notes: remarks }
}
