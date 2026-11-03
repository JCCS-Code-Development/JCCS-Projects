// The estimate prompt: a short summary of a site visit with the details that
// matter for the estimate — what the job is, where, for whom, the work as a
// few bullets, and the measurements and exclusions pulled out so nothing gets
// lost. The office edits it, and the estimate text is written from it.

const MAX_BULLETS = 10
const MAX_BULLET = 220

// "approx 1,280 LF", "12 x 10 ft", "3 windows", "48 in" …
const MEASURE = /\b(?:approx\.?\s*|aprox\.?\s*|about\s+|around\s+)?\d[\d,.]*(?:\s*(?:x|×|by)\s*\d[\d,.]*)?\s*(?:lf|sf|sq\.?\s*ft|square feet|linear feet|ft|feet|pies|in|inches|pulgadas|"|'|m|yd|yards|rooms?|cuartos?|doors?|puertas?|windows?|ventanas?|units?|unidades?|sheets?|ea)\b/gi
const EXCLUDE = /\b(?:exclud\w*|except|not including|sin incluir|excepto|menos)\b[^.;\n]*/gi

const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const clip = (s) => (s.length > MAX_BULLET ? `${s.slice(0, MAX_BULLET - 1).trimEnd()}…` : s)

// A message or note → its sentences / lines, as bullets.
function bulletsOf(text) {
  return String(text ?? '')
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ0-9])/)
    .map((s) => squash(s).replace(/^[-•*·]\s*/, '').replace(/[.]+$/, ''))
    .filter((s) => s.length > 2)
}

/**
 * @param {object} visit  the quote request (title, facility, location_detail,
 *                        description, notes, billing) plus optional
 *                        engineer {name} and company name
 * @returns {string}
 */
export function summarizeVisit({ title, facility, location_detail: locationDetail, description, notes = [], billing, engineer, company } = {}) {
  const sources = [description, ...notes.map((n) => n?.body ?? n)].filter((s) => squash(s))
  const seen = new Set()
  const bullets = []
  for (const s of sources.flatMap(bulletsOf)) {
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    bullets.push(clip(s))
  }

  const all = sources.join('\n')
  const measures = [...new Set((all.match(MEASURE) ?? []).map(squash))]
  const excludes = [...new Set((all.match(EXCLUDE) ?? []).map(squash))]

  const where = [squash(facility), squash(locationDetail)].filter(Boolean).join(' – ')
  const who = [squash(engineer?.name ?? engineer), squash(company)].filter(Boolean)

  const lines = []
  if (squash(title)) lines.push(squash(title))
  if (where) lines.push(`Location: ${where}`)
  if (who.length) lines.push(`For: ${who.length > 1 ? `${who[0]} (${who[1]})` : who[0]}`)
  if (billing === 'no_po') lines.push('No PO')
  if (bullets.length) {
    lines.push('', 'Work:')
    for (const b of bullets.slice(0, MAX_BULLETS)) lines.push(`• ${b}`)
    if (bullets.length > MAX_BULLETS) lines.push(`• …and ${bullets.length - MAX_BULLETS} more note(s) on the site visit`)
  }
  if (measures.length) lines.push('', `Measurements: ${measures.join('; ')}`)
  if (excludes.length) lines.push(`Exclusions: ${excludes.join('; ')}`)
  return lines.join('\n').trim()
}
