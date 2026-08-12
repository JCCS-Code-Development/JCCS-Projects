// Distinctive Spanish diacritics/punctuation — decisive on their own,
// nothing in English legitimately produces these.
const SPANISH_MARK = /[ñáéíóúü¿¡]/i

// A small, hand-picked stopword list per language. Tried franc (a general
// n-gram statistical detector, ~400 languages) first — it reliably
// misclassified short, jargon-heavy construction phrases like "Poured
// slab, set rebar grid" (no common words for its model to lean on) even
// when restricted to just English/Spanish. For a narrow two-language case
// like this app, a tuned stopword count is both simpler and more reliable:
// it correctly returns "no signal" (null) on jargon it can't call, rather
// than confidently guessing wrong — the safer failure mode, since a wrong
// guess here means silently mistranslating text that didn't need it.
const ES_STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'de', 'del', 'que', 'en', 'un', 'una', 'unos', 'unas',
  'es', 'son', 'se', 'no', 'con', 'para', 'por', 'este', 'esta', 'estos', 'estas',
  'al', 'lo', 'su', 'sus', 'como', 'pero', 'ya', 'muy', 'sin', 'sobre', 'entre',
  'hasta', 'desde', 'cuando',
])
const EN_STOPWORDS = new Set([
  'the', 'is', 'are', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'with',
  'was', 'were', 'this', 'that', 'these', 'those', 'and', 'but', 'not', 'from',
  'by', 'as', 'it', 'its', 'we', 'has', 'have', 'had', 'will', 'be', 'been',
])

// Below this length there just isn't enough text for stopword counting to
// mean anything — skip detection entirely rather than risk a bad guess on
// something like "ok" or "ready for review".
const MIN_CHARS_FOR_DETECTION = 8

// Synchronous, no network call, no bundle weight. Returns 'en'/'es', or
// null when there's no reliable signal either way (short/jargon text) —
// callers should treat null as "leave it alone," not "assume English."
export function detectLanguage(text) {
  if (!text) return null
  const trimmed = text.trim()
  if (trimmed.length < MIN_CHARS_FOR_DETECTION) return null
  if (SPANISH_MARK.test(trimmed)) return 'es'

  const words = trimmed.toLowerCase().match(/[a-záéíóúñ]+/g) ?? []
  let esScore = 0
  let enScore = 0
  for (const w of words) {
    if (ES_STOPWORDS.has(w)) esScore++
    if (EN_STOPWORDS.has(w)) enScore++
  }
  if (esScore === 0 && enScore === 0) return null
  if (esScore === enScore) return null
  return esScore > enScore ? 'es' : 'en'
}

const cache = new Map()

// MyMemory Translation API — free, no API key, CORS-enabled for direct
// browser calls (same free/no-key convention already used elsewhere in this
// app for Open-Meteo/Census). Anonymous usage is rate-limited per IP
// (roughly 1000-5000 words/day) — plenty for this app's traffic; cached
// in-memory per (text, language pair) so re-renders never re-request the
// same string twice in a session.
export async function translateText(text, sourceLang, targetLang) {
  const key = `${sourceLang}|${targetLang}::${text}`
  if (cache.has(key)) return cache.get(key)

  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`
  const promise = fetch(url)
    .then((res) => res.json())
    .then((data) => data?.responseData?.translatedText || null)
    .catch(() => null)

  cache.set(key, promise)
  return promise
}
