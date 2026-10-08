import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../../../components/ui/Modal'
import Button from '../../../components/ui/Button'
import Spinner from '../../../components/ui/Spinner'
import { useToast } from '../../../components/ToastProvider'
import { MarkedImage } from './AnnotationLayer'
import PhotoViewer from './PhotoViewer'
import { photoFile, collageFile, saveFiles } from './photoExport'

const COLLAGE = 4

// The office's view of every photo from a site visit, in one place, for
// building the estimate in InvoiceToGo: tap to look, Select to pick the best
// ones and download them, or pick 4 for a 2×2 collage PNG.
export default function EstimatePhotos({ quote, onChanged }) {
  const { t } = useTranslation()
  const toast = useToast()
  const notes = useMemo(() => quote.notes ?? [], [quote.notes])
  // Walk order: each note's photos, then the general ones.
  const photos = useMemo(() => {
    const byNote = notes.flatMap((n) => quote.photos.filter((p) => p.note_id === n.id))
    return [...byNote, ...quote.photos.filter((p) => !byNote.includes(p))]
  }, [quote.photos, notes])
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState([]) // photo ids, in the order picked
  const [markup, setMarkup] = useState(true)
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [collage, setCollage] = useState(false)

  // Drop picks for photos that were deleted meanwhile.
  const ids = photos.map((p) => p.id).join(',')
  useEffect(() => { setPicked((ps) => ps.filter((id) => photos.some((p) => p.id === id))) }, [ids]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!photos.length) return null

  const base = quote.request_no || `visit-${quote.id}`
  const nameFor = (p) => `${base}-photo-${photos.indexOf(p) + 1}`
  const noteLabel = (p) => {
    const i = notes.findIndex((n) => n.id === p.note_id)
    return i >= 0 ? t('quotes.walk.noteN', { n: i + 1 }) : t('quotes.walk.generalNotes')
  }
  const pickedPhotos = picked.map((id) => photos.find((p) => p.id === id)).filter(Boolean)

  const toggle = (id) => setPicked((ps) => (ps.includes(id) ? ps.filter((x) => x !== id) : [...ps, id]))
  const stopSelecting = () => { setSelecting(false); setPicked([]) }

  const download = async () => {
    setBusy(true)
    try { await saveFiles(await Promise.all(pickedPhotos.map((p) => photoFile(p, nameFor(p), { markup })))) }
    catch (err) { toast.error(err?.message ?? t('quotes.export.failed')) }
    finally { setBusy(false) }
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">
            {t('quotes.export.title')} <span className="text-gray-400 font-normal">({photos.length})</span>
          </h2>
          <p className="text-xs text-gray-500">
            {photos.length >= COLLAGE ? t('quotes.export.hintCollage') : t('quotes.export.hint')}
          </p>
        </div>
        <button onClick={selecting ? stopSelecting : () => setSelecting(true)}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${selecting ? 'bg-gray-100 text-gray-700' : 'bg-gray-900 text-white'}`}>
          {selecting ? t('common.cancel') : t('quotes.export.select')}
        </button>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
        {photos.map((p) => {
          const n = picked.indexOf(p.id)
          return (
            <button key={p.id} type="button" onClick={() => (selecting ? toggle(p.id) : setViewing(p.id))}
              className={`relative aspect-square overflow-hidden rounded-lg bg-gray-100 ${n >= 0 ? 'ring-4 ring-brand-500' : ''}`}>
              <MarkedImage src={p.url} shapes={p.annotations?.shapes} className={`w-full h-full transition-transform ${n >= 0 ? 'scale-95' : ''}`} />
              <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1 text-left text-[10px] font-semibold text-white truncate">
                {noteLabel(p)}
              </span>
              {selecting && (
                <span className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                  n >= 0 ? 'bg-brand-500 border-white text-white' : 'border-white bg-black/30'}`}>
                  {n >= 0 ? n + 1 : ''}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {selecting && (
        <div className="sticky z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white/95 backdrop-blur px-3 py-2.5 shadow-lg"
          style={{ bottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
          <span className="text-sm font-semibold text-gray-700 mr-auto">{t('quotes.export.selected', { count: picked.length })}</span>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={markup} onChange={(e) => setMarkup(e.target.checked)} className="w-4 h-4 accent-brand-500" />
            {t('quotes.export.withMarkup')}
          </label>
          <Button size="sm" variant="secondary" disabled={!picked.length || busy} loading={busy} onClick={download}>
            {t('quotes.export.download')}
          </Button>
          {photos.length >= COLLAGE && (
            <Button size="sm" disabled={picked.length !== COLLAGE || busy} onClick={() => setCollage(true)}>
              {picked.length === COLLAGE ? t('quotes.export.makeCollage') : t('quotes.export.pickFour', { count: picked.length })}
            </Button>
          )}
        </div>
      )}

      {viewing != null && (
        <PhotoViewer photos={photos} startId={viewing} canEdit onChanged={onChanged} onClose={() => setViewing(null)}
          notes={notes} downloadName={nameFor} />
      )}
      {collage && (
        <CollageModal photos={pickedPhotos} name={`${base}-collage`} markup={markup} onClose={() => setCollage(false)} />
      )}
    </section>
  )
}

function CollageModal({ photos, name, markup, onClose }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [fit, setFit] = useState('cover')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let url = null
    setFile(null); setPreview(null); setError('')
    collageFile(photos, name, { fit, markup })
      .then((f) => { if (cancelled) return; url = URL.createObjectURL(f); setFile(f); setPreview(url) })
      .catch((err) => { if (!cancelled) setError(err?.message ?? t('quotes.export.failed')) })
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [photos, name, fit, markup, t])

  const save = () => saveFiles([file]).catch((err) => toast.error(err?.message ?? t('quotes.export.failed')))

  return (
    <Modal isOpen onClose={onClose} title={t('quotes.export.collageTitle')} size="xl">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 w-fit mx-auto">
          {['cover', 'contain'].map((k) => (
            <button key={k} onClick={() => setFit(k)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${fit === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              {t(`quotes.export.fit.${k}`)}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-center rounded-xl bg-gray-50 border border-gray-100 aspect-[4/3]">
          {preview ? <img src={preview} alt="" className="max-w-full max-h-full rounded-lg shadow" />
            : error ? <p className="text-sm text-red-500 px-4 text-center">{error}</p>
            : <Spinner size="lg" className="text-brand-500" />}
        </div>
        <p className="text-xs text-gray-500 text-center">{t('quotes.export.collageOrder')}</p>
        <Button size="lg" fullWidth disabled={!file} onClick={save}>{t('quotes.export.downloadPng')}</Button>
      </div>
    </Modal>
  )
}
