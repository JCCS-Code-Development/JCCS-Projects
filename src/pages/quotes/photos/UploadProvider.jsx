import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { UploadContext } from './uploadContext'
import { uploadQuotePhoto } from '../../../api/quoteRequests'
import { resizeImage } from '../../../utils/imageResize'

const CONCURRENCY = 2

// App-wide photo upload queue (mounted in StaffLayout), so uploads keep going
// while the field manager moves between the camera, notes and details —
// nothing ever waits on a slow job-site connection. Each item is shown
// immediately from a local preview; client_uid makes retries safe (the
// server returns the stored photo instead of duplicating it).
//
// The queue lives in a ref — uploads are side effects and must never start
// inside a state updater — and `items` is just a render mirror.
export default function UploadProvider({ children }) {
  const queue = useRef([]) // { key, requestId, file, meta, previewUrl, status: queued|uploading|error, error }
  const [items, setItems] = useState([])
  const active = useRef(0)
  const listeners = useRef(new Map()) // requestId → Set(callback)

  const sync = () => setItems(queue.current.map(({ file: _f, ...rest }) => rest))
  const notify = (requestId) => listeners.current.get(String(requestId))?.forEach((cb) => cb())

  const pump = useCallback(() => {
    for (const it of queue.current) {
      if (active.current >= CONCURRENCY) break
      if (it.status !== 'queued') continue
      it.status = 'uploading'
      active.current += 1
      ;(async () => {
        try {
          const small = await resizeImage(it.file)
          await uploadQuotePhoto(it.requestId, small, {
            client_uid: it.key,
            taken_at: it.file.lastModified ? new Date(it.file.lastModified).toISOString() : undefined,
            ...it.meta,
          })
          URL.revokeObjectURL(it.previewUrl)
          queue.current = queue.current.filter((x) => x !== it)
          notify(it.requestId)
        } catch (err) {
          if (it.cancelled) {
            URL.revokeObjectURL(it.previewUrl)
            queue.current = queue.current.filter((x) => x !== it)
          } else {
            it.status = 'error'
            it.error = err?.response?.data?.error ?? err?.message ?? 'Upload failed'
          }
        } finally {
          active.current -= 1
          sync()
          pump()
        }
      })()
    }
    sync()
  }, [])

  const addFiles = useCallback((requestId, fileList, meta = {}) => {
    const added = Array.from(fileList ?? []).filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name))
    for (const f of added) {
      queue.current.push({
        key: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        requestId: String(requestId), file: f, meta,
        previewUrl: URL.createObjectURL(f), status: 'queued',
      })
    }
    if (added.length) pump()
  }, [pump])

  const retry = useCallback((key) => {
    const it = queue.current.find((x) => x.key === key)
    if (it && it.status === 'error') { it.status = 'queued'; it.error = null }
    pump()
  }, [pump])

  const discard = useCallback((key) => {
    const it = queue.current.find((x) => x.key === key)
    if (!it || it.status === 'uploading') return
    URL.revokeObjectURL(it.previewUrl)
    queue.current = queue.current.filter((x) => x !== it)
    sync()
  }, [])

  // The request was discarded: forget its photos. Ones mid-upload are marked
  // cancelled and dropped silently when their request fails.
  const discardRequest = useCallback((requestId) => {
    const k = String(requestId)
    queue.current = queue.current.filter((it) => {
      if (it.requestId !== k) return true
      if (it.status === 'uploading') { it.cancelled = true; return true }
      URL.revokeObjectURL(it.previewUrl)
      return false
    })
    sync()
  }, [])

  const subscribe = useCallback((requestId, cb) => {
    const k = String(requestId)
    if (!listeners.current.has(k)) listeners.current.set(k, new Set())
    listeners.current.get(k).add(cb)
    return () => listeners.current.get(k)?.delete(cb)
  }, [])

  // Retry failed uploads automatically when the connection comes back.
  useEffect(() => {
    const onOnline = () => {
      queue.current.forEach((it) => { if (it.status === 'error') { it.status = 'queued'; it.error = null } })
      pump()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [pump])

  // Warn before closing the tab while photos only exist on the phone.
  const pending = items.length
  useEffect(() => {
    if (!pending) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [pending])

  const value = useMemo(() => ({ items: items.filter((it) => !it.cancelled), addFiles, retry, discard, discardRequest, subscribe }),
    [items, addFiles, retry, discard, discardRequest, subscribe])
  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
}
