import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Spinner from '../../../components/ui/Spinner'
import PhotoViewer from './PhotoViewer'
import { parseDate } from '../quoteUtils'

// Touch devices get a "Take photo" button that opens the camera directly
// (capture="environment"). Desktop doesn't — there capture targets a camera
// that usually isn't there and the picker returns nothing (see 20e8e56) — so
// desktop only gets the library picker.
const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

const CameraIcon = ({ className = 'w-6 h-6' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.66-.89l.82-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.66.89l.82 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
)
const LibraryIcon = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21"/></svg>
)

export function PhotoPickerButtons({ onFiles, size = 'hero' }) {
  const { t } = useTranslation()
  const cameraRef = useRef(null)
  const libraryRef = useRef(null)
  const touch = isTouch()
  const take = (e) => {
    // Read the FileList before clearing the input (clearing empties it).
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    onFiles(files)
  }

  const hero = size === 'hero'
  return (
    <div className={`grid gap-2 ${touch ? 'grid-cols-2' : 'grid-cols-1'} ${hero ? '' : 'max-w-md'}`}>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={take} />
      <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={take} />
      {touch && (
        <button type="button" onClick={() => cameraRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-brand-500 text-white font-bold shadow-md shadow-brand-500/30 active:bg-brand-700 ${hero ? 'py-7 text-base' : 'py-3.5 text-sm'}`}>
          <CameraIcon className={hero ? 'w-9 h-9' : 'w-6 h-6'} />
          {t('quotes.photos.takePhoto')}
        </button>
      )}
      <button type="button" onClick={() => libraryRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl font-bold ${
          touch ? 'bg-white border border-gray-200 text-gray-800 active:bg-gray-50' : 'bg-brand-500 text-white shadow-md shadow-brand-500/30 hover:bg-brand-400'
        } ${hero ? 'py-7 text-base' : 'py-3.5 text-sm'}`}>
        {touch ? <LibraryIcon className={hero ? 'w-8 h-8' : 'w-5 h-5'} /> : <CameraIcon className={hero ? 'w-9 h-9' : 'w-6 h-6'} />}
        {touch ? t('quotes.photos.fromLibrary') : t('quotes.photos.add')}
      </button>
    </div>
  )
}

function dayLabel(d, t, lang) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const day = new Date(d); day.setHours(0, 0, 0, 0)
  const diff = Math.round((today - day) / 86400000)
  if (diff === 0) return t('quotes.photos.today')
  if (diff === 1) return t('quotes.photos.yesterday')
  return day.toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

const MarkupBadge = () => (
  <span className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center">
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 19L19 5M10 5h9v9" /></svg>
  </span>
)

// CompanyCam-style feed: tight square grid grouped by day, newest first;
// photos still uploading from this phone appear at the top with a spinner (or
// a Retry if the upload failed). Tap any photo for the full-screen viewer.
export default function PhotoGallery({ photos, uploader, canEdit, onChanged }) {
  const { t, i18n } = useTranslation()
  const [viewing, setViewing] = useState(null)

  const ordered = useMemo(() => [...photos].sort((a, b) => {
    const da = parseDate(a.taken_at || a.uploaded_at), db = parseDate(b.taken_at || b.uploaded_at)
    return (db?.getTime() ?? 0) - (da?.getTime() ?? 0) || b.id - a.id
  }), [photos])

  const groups = useMemo(() => {
    const map = new Map()
    for (const p of ordered) {
      const d = parseDate(p.taken_at || p.uploaded_at) ?? new Date()
      const key = d.toDateString()
      if (!map.has(key)) map.set(key, { date: d, items: [] })
      map.get(key).items.push(p)
    }
    return [...map.values()]
  }, [ordered])

  const pending = uploader?.items ?? []
  const grid = 'grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1'

  return (
    <div className="flex flex-col gap-4">
      {pending.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('quotes.photos.uploading', { count: pending.filter((p) => p.status !== 'error').length })}</p>
          <div className={grid}>
            {pending.map((it) => (
              <div key={it.key} className="relative aspect-square overflow-hidden rounded-md bg-gray-200">
                <img src={it.previewUrl} alt="" className="w-full h-full object-cover opacity-60" />
                {it.status === 'error' ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 p-1">
                    <button onClick={() => uploader.retry(it.key)} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-gray-900">{t('quotes.photos.retry')}</button>
                    <button onClick={() => uploader.discard(it.key)} className="text-[11px] font-semibold text-white/90 underline">{t('quotes.photos.discard')}</button>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center"><Spinner size="md" className="text-white drop-shadow" /></div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.date.toDateString()} className="flex flex-col gap-1.5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            {dayLabel(g.date, t, i18n.language)} <span className="text-gray-300">· {g.items.length}</span>
          </p>
          <div className={grid}>
            {g.items.map((p) => (
              <button key={p.id} onClick={() => setViewing(p.id)} className="relative aspect-square overflow-hidden rounded-md bg-gray-100 active:opacity-80">
                <img src={p.url} alt={p.caption ?? ''} loading="lazy" className="w-full h-full object-cover" />
                {p.annotations?.shapes?.length > 0 && <MarkupBadge />}
                {(p.is_before || p.is_reference) && (
                  <span className="absolute top-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {p.is_before ? t('quotes.photos.before') : t('quotes.photos.reference')}
                  </span>
                )}
                {p.caption && (
                  <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1 text-left text-[10px] text-white truncate">
                    {p.caption}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}

      {viewing != null && (
        <PhotoViewer photos={ordered} startId={viewing} canEdit={canEdit} onChanged={onChanged} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}
