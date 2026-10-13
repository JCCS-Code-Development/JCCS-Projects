// Reads the one message a field manager writes on a site visit — the same
// thing they'd send in WhatsApp — and pulls out what the office needs:
//
//   "Estimado para Prisma north green hospital, instalar wall protection impro
//    throughout the hallways on hospital side, excluding the ER side,
//    approximately 1,280 linear ft of impro wall protection, for Mr Bobby"
//
//   → billing 'po' · facility "Prisma North Green Hospital" · client "Mr Bobby"
//     (matched to the client list when possible) · the scope draft + title.
//
// English, Spanish or both mixed. Free and offline — no AI service.

import { formFromNotes } from './fromNotes'
import { generateScope } from './index'

const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// "prisma north green hospital" → "Prisma North Green Hospital" (ER, ICU stay as typed)
const nameCase = (s) => s.replace(/(^|\s)([a-zà-ÿ])/g, (_, p, c) => p + c.toUpperCase())

const PLACE_WORDS = /(hospital|clinic|cl[ií]nica|medical|center|centre|centro|building|edificio|office|oficina|school|escuela|hotel|plaza|tower|torre|campus|church|iglesia|apartments?|apartamentos?)/i
const HONORIFIC = /^(mr|mrs|ms|miss|dr|sr|sra|srta|senor|señor|senora|señora|don|dona|doña)\.?\s+/i

// "pasillo del Greenville Medical Center" / "hallway of the X Hospital" →
// just the place's name.
function placeName(s) {
  const parts = s.split(/\s+(?:del|de la|de los|de|of the|of|at the|at|in the)\s+/i)
  const name = parts.length > 1 && PLACE_WORDS.test(parts[parts.length - 1]) ? parts[parts.length - 1] : s
  return nameCase(name.trim())
}

// The facility: "estimado para X," / "estimate for X," / "at X Hospital".
export function findFacility(text) {
  const lead = text.match(/\b(?:estimad[oa]|estimate|quote|cotizaci[oó]n|presupuesto|trabajo|job)\s+(?:para|for|at|en)\s+(?:el |la |the )?([^,.;\n]+)/i)
  if (lead && !HONORIFIC.test(lead[1].trim())) return placeName(lead[1])
  const at = text.match(/\b(?:at|en|in|para|for)\s+(?:el |la |the )?([^,.;\n]*?\b(?:hospital|clinic|cl[ií]nica|medical center|center|centro|building|edificio|office|school|hotel)\b[^,.;\n]*)/i)
  if (at) return placeName(at[1])
  return ''
}

// Who it's for: "for Mr Bobby", "para el señor Juan", "client: Ana".
export function findClientName(text) {
  const labeled = text.match(/\b(?:client|cliente|contact|contacto)\s*[:-]\s*([^,.;\n]+)/i)
  if (labeled) return labeled[1].trim()
  const all = [...text.matchAll(/\b(?:for|para)\s+(?:el |la )?((?:mr|mrs|ms|miss|dr|sr|sra|srta|se[nñ]or(?:a)?|don|do[nñ]a)\.?\s+[A-Za-zÀ-ÿ'’-]+(?:\s+[A-Z][A-Za-zÀ-ÿ'’-]+)?)/gi)]
  if (all.length) return all[all.length - 1][1].trim()
  // "…, for Bobby" at the very end, when it isn't a place.
  const tail = text.trim().match(/\b(?:for|para)\s+([A-Z][A-Za-zÀ-ÿ'’-]+(?:\s+[A-Z][A-Za-zÀ-ÿ'’-]+)?)\s*[.!]?$/)
  if (tail && !PLACE_WORDS.test(tail[1])) return tail[1].trim()
  return ''
}

// Best client on the list for a typed name ("Mr Bobby" → "Bobby Smith").
export function matchClient(name, clients = []) {
  const bare = fold(name.replace(HONORIFIC, '')).trim()
  if (!bare) return null
  const words = bare.split(/\s+/)
  const score = (c) => {
    const n = fold(c.name)
    if (n === bare) return 0
    const parts = n.split(/[\s,&-]+/)
    if (words.every((w) => parts.some((p) => p.startsWith(w)))) return 1
    if (fold(c.email).split('@')[0].includes(words[0])) return 2
    return -1
  }
  const ranked = clients.map((c) => [score(c), c]).filter(([s]) => s >= 0).sort((a, b) => a[0] - b[0])
  return ranked[0]?.[1] ?? null
}

// No PO → scheduled and invoiced when done; anything else is an estimate.
export function findBilling(text) {
  return /\b(sin|no|without|w\/o)\s+(p\.?\s?o\.?|orden de compra|purchase order)\b/i.test(text) ? 'no_po' : 'po'
}

/**
 * @param {string} message      what the field manager wrote
 * @param {{ clients?: object[], library?: object[], notes?: string[] }} ctx
 * @returns {{ billing, facility, clientName, client, title, form, remarks }}
 */
export function readVisitMessage(message, { clients = [], library = [], notes = [] } = {}) {
  const text = String(message ?? '')
  const all = [text, ...notes].join('\n')
  const clientName = findClientName(all)
  const client = clientName ? matchClient(clientName, clients) : null
  const facility = findFacility(all)
  const { form, notes: remarks } = formFromNotes({ notes, generalNotes: text, library })
  const g = generateScope(form)
  return {
    billing: findBilling(all),
    facility,
    clientName,
    client,
    title: (g.title || form.title || '').trim(),
    form,
    remarks,
  }
}
