import { useContext, useEffect, useMemo, useRef } from 'react'
import { UploadContext } from './uploadContext'

// Per-request view of the app-wide upload queue (see UploadProvider).
// addFiles(files, meta?) — meta e.g. { note_id } to file photos under a walk note.
export function usePhotoUploader(quoteRequestId, { onUploaded } = {}) {
  const ctx = useContext(UploadContext)
  const cbRef = useRef(onUploaded)
  useEffect(() => { cbRef.current = onUploaded }, [onUploaded])
  useEffect(() => ctx.subscribe(quoteRequestId, () => cbRef.current?.()), [ctx, quoteRequestId])

  const items = useMemo(() => ctx.items.filter((it) => it.requestId === String(quoteRequestId)), [ctx.items, quoteRequestId])
  return {
    items,
    pending: items.length,
    addFiles: (files, meta) => ctx.addFiles(quoteRequestId, files, meta),
    retry: ctx.retry,
    discard: ctx.discard,
  }
}
