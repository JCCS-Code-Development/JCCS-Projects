// JCCS Scope of Work generator.
//
// Turns the structured estimate form (stored as quote_requests.form_json) into
// the office's estimate wording: a title, then "Scope of Work" and bulleted
// sections in a fixed order —
//   Work Area Preparation [& Infection Control]
//   …trade sections in construction order (categories.js)…
//   Fit & Finish
//   Medical-Grade Cleaning          (infection-control jobs only)
//   Finishing & Cleanup             (always last)
// Exclusions are written inline as the last bullet of the section they belong
// to, exactly like the real estimates. Plain text with "• " bullets, because
// InvoiceToGo renders no formatting.
//
// Deterministic on purpose: the same answers always give the same wording, and
// nothing is promised that wasn't selected (no plumbing unless chosen, no
// certified mold remediation, no infection-control text when IC isn't needed).

import { ORDER, structuralChecks } from './categories'
import { list, uniq } from './text'

export const CATEGORY_KEYS = ['itemRemoval', 'demo', 'plumbing', 'framing', 'antimicrobial', 'drywall', 'ceiling', 'windowFilm', 'window', 'painting', 'coveBase', 'other']

// Defect words always appear in this order in the "free of visible …" bullet.
const DEFECT_ORDER = ['bubbles', 'wrinkles', 'peeling edges', 'paint drips', 'sanding marks', 'sharp edges', 'scratches']

const TITLE_PREFIX = { addon: 'Add-On Estimate', emergency: 'Emergency Estimate' }

export function emptyForm(overrides = {}) {
  return {
    v: 1,
    title: '',
    area: 'work area',
    locations: '',
    allRoomsPhrase: '',
    leaveArea: 'the affected area',
    ic: 'none',             // none | limited | required
    occupied: null,         // null = follow IC (coordinate around patients/staff when IC is required)
    medicalCleaning: null,  // null = follow IC
    protect: ['flooring', 'walls', 'equipment'],
    verify: ['dimensions', 'existing conditions'],
    verifyWhen: '',         // '' = automatic
    cats: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, { on: false }])),
    ...overrides,
  }
}

// Fills any keys missing from an older/partial form so the generator and the
// UI can rely on the full shape.
export function normalizeForm(form) {
  const base = emptyForm()
  const f = { ...base, ...(form ?? {}) }
  f.cats = { ...base.cats }
  for (const k of CATEGORY_KEYS) f.cats[k] = { ...base.cats[k], ...(form?.cats?.[k] ?? {}) }
  f.protect = Array.isArray(f.protect) ? f.protect : base.protect
  f.verify = Array.isArray(f.verify) ? f.verify : base.verify
  return f
}

function buildTitle(f, estimateType) {
  const t = (f.title ?? '').trim()
  const prefix = TITLE_PREFIX[estimateType]
  if (!prefix || !t || t.toLowerCase().startsWith(prefix.toLowerCase())) return t
  return `${prefix}: ${t}`
}

function prep(f) {
  const ic = f.ic
  const occupied = f.occupied ?? (ic === 'required')
  const verifyWhen = f.verifyWhen
    || (f.cats.windowFilm.on ? 'ordering and installation' : f.cats.window.on ? 'fabrication and installation' : 'beginning work')
  const bullets = [`Prepare the designated ${(f.area || 'work area').trim()}.`]
  if (ic === 'required') {
    bullets.push('Provide and install temporary infection control barriers around the active work area.')
    bullets.push('Implement dust-containment measures and seal barrier perimeters as required.')
  } else if (ic === 'limited') {
    bullets.push('Implement dust-control measures within the active work area as required.')
  }
  bullets.push(`Protect adjacent ${list([...uniq(f.protect), 'finishes'])}.`)
  if (ic === 'required') bullets.push('Comply with applicable facility ICRA requirements.')
  if (occupied) bullets.push('Coordinate work to minimize disruption to patients, staff, and facility operations.')
  const verify = uniq(f.verify)
  if (verify.length) bullets.push(`Field verify ${list(verify)} before ${verifyWhen}.`)
  return { heading: ic === 'required' ? 'Work Area Preparation & Infection Control' : 'Work Area Preparation', bullets }
}

function fitAndFinish(f, results) {
  const byKey = Object.fromEntries(results.map((r) => [r.key, r]))
  const s = structuralChecks(f)
  const checks = [...s.checks]
  checks.push(...(byKey.plumbing?.checks ?? []))
  checks.push(...(byKey.framing?.after ?? []))
  checks.push(...(byKey.painting?.checks ?? []))
  if (s.blendRepair) checks.push('Ensure repaired and painted surfaces blend with adjacent existing conditions as closely as possible.')
  if (s.coveRepairTransitions) checks.push(s.coveRepairTransitions)
  checks.push(...(byKey.coveBase?.checks ?? []))
  if (s.blendFull) checks.push('Ensure completed work blends with adjacent existing conditions as closely as possible.')
  checks.push(...(byKey.window?.checks ?? []))
  checks.push(...(byKey.windowFilm?.checks ?? []))

  const contributed = new Set(results.flatMap((r) => r.defects ?? []))
  if (f.cats.drywall.on && Number(f.cats.drywall.finishLevel) === 5) contributed.add('sanding marks')
  const words = DEFECT_ORDER.filter((w) => contributed.has(w))
  const lead = results.some((r) => r.replacesDefects) ? [] : ['defects']
  checks.push(`Verify finished surfaces are free of visible ${list([...lead, ...words, 'installation residue'])}.`)
  checks.push(...(byKey.windowFilm?.after ?? []))
  return { heading: 'Fit & Finish', bullets: uniq(checks) }
}

function medicalCleaning() {
  return { heading: 'Medical-Grade Cleaning', bullets: [
    'Perform hospital-grade cleaning within the affected work area.',
    'Remove construction dust, demolition residue, and surface contaminants.',
    'Clean completed surfaces according to applicable healthcare standards.',
  ] }
}

function cleanup(f) {
  const film = f.cats.windowFilm.on
  const removed = [
    f.ic === 'required' && 'infection control barriers',
    film ? 'excess film' : 'debris',
    film && 'protective coverings',
    'materials generated during work activities',
  ]
  const bullets = ['Inspect completed work for quality and proper installation.', `Remove ${list(removed)}.`]
  if (film) bullets.push('Clean the completed glass and adjacent surfaces as required.')
  bullets.push(`Leave ${(f.leaveArea || 'the affected area').trim()} clean, safe, and ready for use.`)
  return { heading: 'Finishing & Cleanup', bullets }
}

// Things the review screen should flag before the scope goes out.
function review(f, results) {
  const warnings = []
  const missing = []
  if (!results.length) missing.push('scope')
  if (!(f.title ?? '').trim()) missing.push('title')
  if (f.ic === 'none' && f.medicalCleaning === true) warnings.push('medicalCleaningWithoutIc')
  if (f.cats.drywall.on && f.cats.drywall.mode === 'replace' && !f.cats.demo.on) warnings.push('replaceWithoutDemo')
  if (f.cats.antimicrobial.on && f.ic === 'none') warnings.push('moldWithoutIc')
  if (f.cats.itemRemoval.on && f.cats.itemRemoval.plumbing && !f.cats.plumbing.on) warnings.push('disconnectWithoutPlumbing')
  return { warnings, missing }
}

// form → { title, description, sections, warnings, missing }
export function generateScope(rawForm, { estimateType } = {}) {
  const f = normalizeForm(rawForm)
  const results = ORDER.map((fn, i) => {
    const r = fn(f)
    return r ? { key: CATEGORY_KEYS[i], ...r } : null
  }).filter(Boolean)

  const sections = [prep(f), ...results.flatMap((r) => r.sections)]
  if (results.length) sections.push(fitAndFinish(f, results))
  if (f.ic === 'required' && f.medicalCleaning !== false) sections.push(medicalCleaning())
  else if (f.medicalCleaning === true) sections.push(medicalCleaning())
  sections.push(cleanup(f))

  const description = ['Scope of Work', ...sections.map((s) => [s.heading, ...s.bullets.map((b) => `• ${b}`)].join('\n'))].join('\n\n')
  return { title: buildTitle(f, estimateType), description, sections, ...review(f, results) }
}

// What gets pasted into InvoiceToGo's line item: title on its own line, then
// the description.
export const toInvoiceToGoText = (g) => (g.title ? `${g.title}\n${g.description}` : g.description)
