import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import Button from './ui/Button'
import AutoTranslatedText from './AutoTranslatedText'

const ClockIcon    = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
const WeatherIcon  = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17.5 19a4.5 4.5 0 000-9 6 6 0 00-11.4 2A4 4 0 007 19h10.5z"/></svg>
const LocationIcon = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
const PhaseIcon    = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18M5 4h11l-2 4 2 4H5"/></svg>
const CommentIcon  = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
const ChevronLeft  = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
const ChevronRight = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
const CloseIcon    = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
const NoImageIcon  = ({ s = 'w-7 h-7' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.5-4.5a2 2 0 012.8 0L16 16M13.5 9.5h.01M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z"/><path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18"/></svg>

function fmtDateTime(ts) {
  try { return format(ts.includes('T') || ts.includes(' ') ? new Date(ts.replace(' ', 'T')) : parseISO(ts), 'h:mm a') }
  catch { return ts }
}

// Full-screen expanded view, portaled to document.body like Modal — but
// bespoke (no title bar / card chrome) since it needs to be an edge-to-edge
// image with the same prev/next/dot navigation as the inline carousel, not
// a separate page (a plain <a target="_blank"> would have left the app).
function Lightbox({ photos, index, setIndex, onClose }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && photos.length > 1) setIndex((i) => (i - 1 + photos.length) % photos.length)
      else if (e.key === 'ArrowRight' && photos.length > 1) setIndex((i) => (i + 1) % photos.length)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [photos.length, setIndex, onClose])

  const current = photos[index]
  const prev = (e) => { e.stopPropagation(); setIndex((i) => (i - 1 + photos.length) % photos.length) }
  const next = (e) => { e.stopPropagation(); setIndex((i) => (i + 1) % photos.length) }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm" onClick={onClose}>
      <button type="button" onClick={onClose} aria-label="Close"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors">
        <CloseIcon />
      </button>

      <img src={current.url} alt="" onClick={(e) => e.stopPropagation()}
        className="max-w-[92vw] max-h-[85vh] object-contain rounded-lg" />

      {photos.length > 1 && (
        <>
          <button type="button" onClick={prev} aria-label="Previous photo"
            className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors">
            <ChevronLeft />
          </button>
          <button type="button" onClick={next} aria-label="Next photo"
            className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors">
            <ChevronRight />
          </button>
          <div className="absolute bottom-6 inset-x-0 flex items-center justify-center gap-2">
            {photos.map((p, i) => (
              <button key={p.id} type="button" aria-label={`Photo ${i + 1}`}
                onClick={(e) => { e.stopPropagation(); setIndex(i) }}
                className={`w-2 h-2 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/40'}`} />
            ))}
          </div>
          <div className="absolute top-4 left-4 bg-white/10 text-white text-xs font-semibold px-2 py-1 rounded-full">
            {index + 1}/{photos.length}
          </div>
        </>
      )}
    </div>,
    document.body
  )
}

// The image slot is a fixed size and always renders — with no photos it
// shows a "no image" placeholder instead of collapsing, so the card's
// layout never jumps around depending on whether photos exist. A single
// photo just sits static; more than one becomes a carousel — one photo
// visible at a time with prev/next arrows and a dot per photo, instead of a
// grid, so the description column next to it stays the dominant element
// rather than competing with a wall of thumbnails. Clicking any photo
// expands it in-page (Lightbox above) rather than opening a new tab — the
// expanded view shares the same index/navigation as the inline strip.
const PHOTO_BOX = 'w-32 h-32 sm:w-36 sm:h-36'

function PhotoCarousel({ photos }) {
  const [index, setIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  if (photos.length === 0) {
    return (
      <div className={`${PHOTO_BOX} rounded-xl bg-gray-100 border border-dashed border-gray-200 flex items-center justify-center text-gray-300`}>
        <NoImageIcon />
      </div>
    )
  }

  const current = photos[index]

  if (photos.length === 1) {
    return (
      <>
        <button type="button" onClick={() => setLightboxOpen(true)}
          className={`block ${PHOTO_BOX} rounded-xl overflow-hidden bg-gray-100`}>
          <img src={current.url} alt="" className="w-full h-full object-cover" />
        </button>
        {lightboxOpen && (
          <Lightbox photos={photos} index={index} setIndex={setIndex} onClose={() => setLightboxOpen(false)} />
        )}
      </>
    )
  }

  const prev = (e) => { e.stopPropagation(); setIndex((i) => (i - 1 + photos.length) % photos.length) }
  const next = (e) => { e.stopPropagation(); setIndex((i) => (i + 1) % photos.length) }

  return (
    <div className={`relative ${PHOTO_BOX} rounded-xl overflow-hidden bg-gray-100 group`}>
      <button type="button" onClick={() => setLightboxOpen(true)} className="block w-full h-full">
        <img src={current.url} alt="" className="w-full h-full object-cover" />
      </button>
      <button type="button" onClick={prev} aria-label="Previous photo"
        className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors">
        <ChevronLeft s="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={next} aria-label="Next photo"
        className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors">
        <ChevronRight s="w-3.5 h-3.5" />
      </button>
      <div className="absolute top-1 right-1 bg-black/40 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full">
        {index + 1}/{photos.length}
      </div>
      <div className="absolute bottom-1 inset-x-0 flex justify-center gap-1">
        {photos.map((p, i) => (
          <button key={p.id} type="button" aria-label={`Photo ${i + 1}`} onClick={(e) => { e.stopPropagation(); setIndex(i) }}
            className={`w-1 h-1 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/50'}`} />
        ))}
      </div>
      {lightboxOpen && (
        <Lightbox photos={photos} index={index} setIndex={setIndex} onClose={() => setLightboxOpen(false)} />
      )}
    </div>
  )
}

// Shared between the staff and client-portal daily-log views — same rich
// card (date, created time, required photos, auto-fetched weather,
// project location, associated phase, comment thread) either side. The log
// content itself is always read-only here (no edit UI anywhere); only the
// comment thread is writable, via the injected listComments/createComment
// functions so this component stays agnostic of which of the two entirely
// separate auth/API tracks (staff vs client) it's being used from.
export default function DailyLogCard({ log, location, listComments, createComment }) {
  const { t } = useTranslation()
  const [comments, setComments] = useState([])
  const [loadingComments, setLoadingComments] = useState(true)
  const [message, setMessage] = useState('')
  const [posting, setPosting] = useState(false)

  const loadComments = () => {
    setLoadingComments(true)
    listComments(log.id)
      .then((data) => setComments(data.comments ?? []))
      .catch(() => {})
      .finally(() => setLoadingComments(false))
  }

  useEffect(loadComments, [log.id])

  const handlePost = async (e) => {
    e.preventDefault()
    if (!message.trim()) return
    setPosting(true)
    try {
      await createComment(log.id, message.trim())
      setMessage('')
      loadComments()
    } catch {
      // swallow — the comment box just stays populated so the user can retry
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-gray-100">
        <p className="text-sm font-bold text-gray-900">{log.log_date}</p>
        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
          <ClockIcon s="w-3.5 h-3.5" /> {t('dailyLogs.loggedAt', { time: fmtDateTime(log.created_at) })}
        </p>
      </div>

      <div className="px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-4 border-b border-gray-100 text-sm">
        <div className="flex items-center gap-2 text-gray-700 min-w-0">
          <WeatherIcon s="w-4 h-4 text-brand-500 shrink-0" />
          <span className="truncate">{log.weather || t('dailyLogs.weatherUnavailable')}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-700 min-w-0">
          <LocationIcon s="w-4 h-4 text-brand-500 shrink-0" />
          <span className="truncate">{location || '—'}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-700 min-w-0">
          <PhaseIcon s="w-4 h-4 text-brand-500 shrink-0" />
          <span className="truncate">
            {log.phase_name
              ? t('dailyLogs.phaseLabel', { number: log.phase_sequence, name: log.phase_name })
              : t('dailyLogs.noPhaseAssociated')}
          </span>
        </div>
      </div>

      <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4">
        <PhotoCarousel photos={log.photos} />
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('dailyLogs.description')}</p>
          <AutoTranslatedText text={log.work_performed} className="text-sm text-gray-700 whitespace-pre-line" />
        </div>
      </div>

      <div className="px-5 py-4 flex flex-col gap-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <CommentIcon s="w-3.5 h-3.5" /> {t('dailyLogs.comments')}
        </p>

        {loadingComments ? (
          <p className="text-sm text-gray-400">{t('common.loading')}</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-gray-400">{t('dailyLogs.noComments')}</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {comments.map((c) => (
              <div key={c.id} className={`rounded-xl px-3 py-2 text-sm max-w-[85%] ${
                c.author_type === 'client' ? 'bg-brand-100 text-brand-900 self-end' : 'bg-gray-100 text-gray-800 self-start'
              }`}>
                <p className="text-xs font-semibold opacity-70">{c.author_name}</p>
                <AutoTranslatedText text={c.message} className="whitespace-pre-line" />
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handlePost} className="flex items-end gap-2 mt-1">
          <textarea rows={1} value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder={t('dailyLogs.commentPlaceholder')}
            className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 resize-none" />
          <Button type="submit" size="sm" loading={posting}>{t('dailyLogs.postComment')}</Button>
        </form>
      </div>
    </div>
  )
}
