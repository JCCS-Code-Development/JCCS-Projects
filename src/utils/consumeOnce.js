// Dedupes a one-shot "jump to this item" deep-link action (from a
// notification click) across component remounts within the same browser
// tab — e.g. switching away from Documents and back remounts that tab's
// component fresh, but shouldn't re-open the same item's modal a second
// time. Backed by sessionStorage (not a plain ref) specifically because it
// needs to survive that remount; it's cleared naturally when the tab/session
// ends, so a fresh visit later can trigger the same deep link again.
//
// Returns true the FIRST time called for a given key ("go ahead, consume
// it"), false on every call after ("already consumed, skip").
export function consumeOnce(key) {
  const storageKey = `jccs-projects:consumed:${key}`
  if (typeof sessionStorage === 'undefined') return true
  if (sessionStorage.getItem(storageKey)) return false
  sessionStorage.setItem(storageKey, '1')
  return true
}
