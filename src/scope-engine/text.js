// Small text helpers shared by the scope templates.

// "a", "a and b", "a, b, and c" — JCCS estimates use the serial comma.
export function list(items) {
  const xs = items.filter(Boolean)
  if (xs.length <= 1) return xs[0] ?? ''
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`
  return `${xs.slice(0, -1).join(', ')}, and ${xs[xs.length - 1]}`
}

// "mold-resistant" → "Mold-Resistant", "storage space" → "Storage Space".
export const titleCase = (s) => String(s ?? '').replace(/(^|[\s-])([a-z])/g, (_, p, c) => p + c.toUpperCase())

export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

// De-duplicates while keeping first-seen order.
export const uniq = (xs) => [...new Set(xs.filter(Boolean))]

// Small numbers written out, as in "Provide and install one frosted sliding window".
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
export const countWord = (n) => (Number.isInteger(n) && n >= 0 && n <= 10 ? WORDS[n] : String(n))
