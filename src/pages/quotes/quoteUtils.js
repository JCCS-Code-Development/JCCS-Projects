// Shared bits for the quote-request pages: status colors, the board's
// column grouping, and the overdue / follow-up flags.

export const STATUS_STYLES = {
  draft:      'bg-gray-100 text-gray-600',
  submitted:  'bg-sky-100 text-sky-800',
  needs_info: 'bg-amber-100 text-amber-800',
  in_review:  'bg-indigo-100 text-indigo-800',
  approved:   'bg-teal-100 text-teal-800',
  estimating: 'bg-violet-100 text-violet-800',
  sent:       'bg-blue-100 text-blue-800',
  accepted:   'bg-green-100 text-green-800',
  declined:   'bg-red-100 text-red-700',
  cancelled:  'bg-gray-100 text-gray-400',
}

export const BOARD_COLUMNS = [
  { key: 'intake',     statuses: ['draft', 'submitted', 'needs_info'] },
  { key: 'review',     statuses: ['in_review', 'approved'] },
  { key: 'estimating', statuses: ['estimating'] },
  { key: 'sent',       statuses: ['sent'] },
  { key: 'closed',     statuses: ['accepted', 'declined', 'cancelled'] },
]

export const CLOSED_STATUSES = ['accepted', 'declined', 'cancelled']
const PRE_SEND = ['draft', 'submitted', 'needs_info', 'in_review', 'approved', 'estimating']

const DAY = 24 * 60 * 60 * 1000
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
// MySQL DATE / DATETIME strings → local Date (no UTC shift for plain dates).
export const parseDate = (v) => {
  if (!v) return null
  const [datePart, timePart] = String(v).split(/[ T]/)
  const [y, m, d] = datePart.split('-').map(Number)
  if (!timePart) return new Date(y, m - 1, d)
  const [hh, mm, ss] = timePart.split(':').map(Number)
  return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0)
}

export function quoteFlags(q) {
  const flags = []
  const today = startOfToday()
  const neededBy = parseDate(q.needed_by)
  if (neededBy && PRE_SEND.includes(q.status)) {
    if (neededBy < today) flags.push('overdue')
    else if (neededBy - today <= 3 * DAY) flags.push('dueSoon')
  }
  const sentAt = parseDate(q.sent_at)
  if (q.status === 'sent' && sentAt && q.follow_up_days && Date.now() - sentAt.getTime() >= q.follow_up_days * DAY) {
    flags.push('followUpDue')
  }
  if (q.status === 'needs_info') flags.push('infoRequested')
  return flags
}

export const FLAG_STYLES = {
  overdue:       'bg-red-100 text-red-700',
  dueSoon:       'bg-amber-100 text-amber-800',
  followUpDue:   'bg-orange-100 text-orange-800',
  infoRequested: 'bg-amber-100 text-amber-800',
}

export const fmtDate = (v, lang) => {
  const d = parseDate(v)
  return d ? d.toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
}
export const fmtDateTime = (v, lang) => {
  const d = parseDate(v)
  return d ? d.toLocaleString(lang === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older iOS / insecure-context fallback.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch { ok = false }
    document.body.removeChild(ta)
    return ok
  }
}

export const ESTIMATE_TYPES = ['standard', 'addon', 'emergency', 'alternative', 'line_item']
export const SOURCES = ['email', 'text', 'phone', 'site_meeting', 'work_order', 'other']
export const PRIORITIES = ['low', 'normal', 'high', 'urgent']
export const FILE_KINDS = ['plan', 'sketch', 'product_data', 'finish_selection', 'client_email', 'engineering', 'icra', 'existing_estimate', 'manufacturer_instructions', 'other']

// ── Request form state ⇄ API payload ──
export const EMPTY_QUOTE_FORM = {
  work_type: 'new', estimate_type: 'standard', title: '', customer_id: '', contact_id: '',
  facility: '', location_detail: '', project_number: '', original_estimate_no: '', related_ref: '',
  description: '', needed_by: '', site_visit_date: '', priority: 'normal', request_source: '',
  field_manager_id: '', assigned_to: '', follow_up_days: 7, site_visit_at: '',
}

export function formFromQuote(q) {
  const f = { ...EMPTY_QUOTE_FORM }
  for (const k of Object.keys(f)) {
    if (q[k] !== undefined && q[k] !== null) f[k] = q[k]
  }
  if (f.site_visit_at) f.site_visit_at = String(f.site_visit_at).replace(' ', 'T').slice(0, 16)
  return f
}

const OFFICE_KEYS = ['field_manager_id', 'assigned_to', 'follow_up_days', 'site_visit_at']

// Form state → API payload. Field managers never send office-only keys.
export function payloadFromForm(f, isAdmin) {
  const p = {}
  for (const [k, v] of Object.entries(f)) {
    if (!isAdmin && OFFICE_KEYS.includes(k)) continue
    p[k] = v === '' ? null : v
  }
  if (p.work_type !== 'addon') { p.project_number = null; p.original_estimate_no = null }
  return p
}
