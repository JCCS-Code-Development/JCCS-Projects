import { useCallback, useRef, useState } from 'react'
import { uploadQuoteAudio, deleteQuoteAudio } from '../../../api/quoteRequests'

// Uploads voice memos for one request. A memo shows up immediately as a
// "sending" bubble (playable from the local recording) and turns into the
// saved one once the server has it; on a dropped connection it stays with a
// Retry. client_uid makes a retry safe (no duplicates).
export function useVoiceMemos(quoteRequestId, onSaved) {
  const [pending, setPendingState] = useState([]) // { key, url, duration_sec, peaks, note_id, error }
  const pendingRef = useRef([])
  // Keep a ref mirror so retry() can read the list without starting an
  // upload inside a state updater (React may run updaters twice).
  const setPending = (fn) => setPendingState((p) => (pendingRef.current = fn(p)))
  const blobs = useRef(new Map())
  const savedRef = useRef(onSaved)
  savedRef.current = onSaved

  const send = useCallback(async (item) => {
    const { blob, mime } = blobs.current.get(item.key)
    setPending((p) => p.map((x) => (x.key === item.key ? { ...x, error: false } : x)))
    try {
      await uploadQuoteAudio(quoteRequestId, blob, {
        mime, duration: item.duration_sec, peaks: item.peaks, noteId: item.note_id, clientUid: item.key,
      })
      await savedRef.current?.()
      URL.revokeObjectURL(item.url)
      blobs.current.delete(item.key)
      setPending((p) => p.filter((x) => x.key !== item.key))
    } catch {
      setPending((p) => p.map((x) => (x.key === item.key ? { ...x, error: true } : x)))
    }
  }, [quoteRequestId])

  const add = useCallback(({ blob, mime, duration, peaks }, noteId = null) => {
    const key = `v-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    blobs.current.set(key, { blob, mime })
    const item = { key, url: URL.createObjectURL(blob), duration_sec: duration, peaks, note_id: noteId, error: false }
    setPending((p) => [...p, item])
    send(item)
  }, [send])

  const retry = useCallback((key) => {
    const it = pendingRef.current.find((x) => x.key === key)
    if (it) send(it)
  }, [send])

  const remove = useCallback(async (id) => {
    await deleteQuoteAudio(id)
    await savedRef.current?.()
  }, [])

  return { pending, add, retry, remove }
}
