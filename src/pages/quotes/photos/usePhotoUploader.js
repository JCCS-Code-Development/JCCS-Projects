import { useCallback, useEffect, useRef, useState } from 'react'
import { uploadQuotePhoto } from '../../../api/quoteRequests'
import { resizeImage } from '../../../utils/imageResize'

const CONCURRENCY = 2

// CompanyCam-style upload queue: every picked/taken photo shows up in the
// grid immediately (local preview), uploads in the background two at a time,
// and stays visible with a Retry if the job-site connection drops. client_uid
// makes retries safe — the server returns the already-stored photo instead of
// creating a duplicate.
//
// The queue itself lives in a ref (uploads are side effects and must never
// start from inside a state updater); `items` is just a render mirror.
export function usePhotoUploader(quoteRequestId, { onUploaded } = {}) {
  const queue = useRef([]) // { key, file, previewUrl, status: queued|uploading|error, error }
  const [items, setItems] = useState([])
  const active = useRef(0)
  const onUploadedRef = useRef(onUploaded)
  useEffect(() => { onUploadedRef.current = onUploaded }, [onUploaded])

  const sync = () => setItems(queue.current.map(({ file: _file, ...rest }) => rest))

  const pump = useCallback(() => {
    for (const it of queue.current) {
      if (active.current >= CONCURRENCY) break
      if (it.status !== 'queued') continue
      it.status = 'uploading'
      active.current += 1
      ;(async () => {
        try {
          const small = await resizeImage(it.file)
          await uploadQuotePhoto(quoteRequestId, small, {
            client_uid: it.key,
            taken_at: it.file.lastModified ? new Date(it.file.lastModified).toISOString() : undefined,
          })
          URL.revokeObjectURL(it.previewUrl)
          queue.current = queue.current.filter((x) => x !== it)
          onUploadedRef.current?.()
        } catch (err) {
          it.status = 'error'
          it.error = err?.response?.data?.error ?? err?.message ?? 'Upload failed'
        } finally {
          active.current -= 1
          sync()
          pump()
        }
      })()
    }
    sync()
  }, [quoteRequestId])

  const addFiles = useCallback((fileList) => {
    const added = Array.from(fileList ?? []).filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name))
    if (!added.length) return
    for (const f of added) {
      queue.current.push({
        key: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
        status: 'queued',
      })
    }
    pump()
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

  // Warn before closing the tab while photos only exist on the phone.
  const pending = items.length
  useEffect(() => {
    if (!pending) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [pending])

  return { items, addFiles, retry, discard, pending }
}
