import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Spinner from '../../components/ui/Spinner'
import { useToast } from '../../components/ToastProvider'
import { getQuoteRequest, deleteQuoteRequest } from '../../api/quoteRequests'
import { usePhotoUploader } from './photos/usePhotoUploader'
import PhotoGallery, { PhotoPickerButtons } from './photos/PhotoGallery'

// Step 1 of a site walk — photos first, CompanyCam style. The draft request
// already exists (created by "New site walk") so every photo uploads the
// moment it's taken. "Next" goes to the details form; "Skip" is there for
// the rare job with nothing to photograph.
export default function QuoteCapture() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const [quote, setQuote] = useState(null)

  const load = useCallback(() => {
    getQuoteRequest(id).then((d) => setQuote(d.quoteRequest)).catch(() => navigate('/quotes', { replace: true }))
  }, [id, navigate])
  useEffect(load, [load])

  const uploader = usePhotoUploader(id, { onUploaded: load })

  if (!quote) return <div className="flex justify-center py-16"><Spinner size="lg" className="text-brand-500" /></div>

  // Photos can only be added while the request is editable — anything else
  // belongs on the normal detail page.
  if (!quote.can_edit) return <Navigate to={`/quotes/${id}`} replace />

  const count = quote.photos.length
  const busy = uploader.items.some((i) => i.status !== 'error')
  const failed = uploader.items.filter((i) => i.status === 'error').length

  const next = () => {
    if (failed) { toast.error(t('quotes.photos.failedWarning', { count: failed })); return }
    navigate(`/quotes/${id}?edit=1`)
  }
  // Leaving an untouched, photo-less draft shouldn't leave junk behind.
  const cancel = async () => {
    if (!count && !uploader.items.length && quote.status === 'draft' && !quote.description) {
      try { await deleteQuoteRequest(id) } catch { /* fine — it just stays as a draft */ }
    }
    navigate('/quotes')
  }

  return (
    <div className="flex flex-col gap-5 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between gap-3">
        <button onClick={cancel} className="text-sm font-semibold text-gray-500 py-2 pr-3">{t('common.cancel')}</button>
        <span className="text-xs font-bold text-gray-400 tracking-wide">{quote.request_no}</span>
      </div>

      <div className="text-center">
        <p className="text-xs font-bold text-brand-500 uppercase tracking-widest">{t('quotes.capture.step')}</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">{t('quotes.capture.title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('quotes.capture.subtitle')}</p>
      </div>

      <PhotoPickerButtons onFiles={uploader.addFiles} />

      {(count > 0 || uploader.items.length > 0) ? (
        <PhotoGallery photos={quote.photos} uploader={uploader} canEdit onChanged={load} />
      ) : (
        <p className="text-sm text-gray-400 text-center py-6">{t('quotes.capture.empty')}</p>
      )}

      {/* Sticky footer above the mobile bottom nav. */}
      <div className="sticky bottom-20 lg:bottom-4 z-20 flex flex-col gap-2 rounded-2xl bg-white/95 backdrop-blur border border-gray-100 shadow-lg p-3">
        <button onClick={next} disabled={busy}
          className="w-full rounded-xl bg-gray-900 text-white py-4 text-base font-bold disabled:bg-gray-300 active:bg-gray-700">
          {busy
            ? t('quotes.photos.uploading', { count: uploader.items.filter((i) => i.status !== 'error').length })
            : count > 0 ? t('quotes.capture.next', { count }) : t('quotes.capture.nextNoPhotos')}
        </button>
        {count === 0 && !uploader.items.length && (
          <p className="text-xs text-gray-400 text-center">{t('quotes.capture.skipHint')}</p>
        )}
      </div>
    </div>
  )
}
