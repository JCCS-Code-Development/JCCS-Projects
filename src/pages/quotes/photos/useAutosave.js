import { useEffect, useRef } from 'react'

// Saves `value` via `save` ~700ms after the last keystroke (and on unmount),
// so typing on a job site never needs a Save button.
export function useAutosave(value, save, deps = []) {
  const first = useRef(true)
  const latest = useRef(value)
  const dirty = useRef(false)
  latest.current = value
  useEffect(() => {
    if (first.current) { first.current = false; return }
    dirty.current = true
    const h = setTimeout(() => { dirty.current = false; save(latest.current) }, 700)
    return () => clearTimeout(h)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ...deps])
  // Flush on unmount (e.g. leaving the screen mid-sentence).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (dirty.current) save(latest.current) }, [])
}
