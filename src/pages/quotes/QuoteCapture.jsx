import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Spinner from '../../components/ui/Spinner'
import { useToast } from '../../components/ToastProvider'
import { useConfirm } from '../../components/ConfirmProvider'
import { getQuoteRequest, deleteQuoteRequest, createQuoteNote, updateQuoteRequest } from '../../api/quoteRequests'
import { usePhotoUploader } from './photos/usePhotoUploader'
import CameraView from './photos/CameraView'
import { useAutosave } from './photos/useAutosave'
import WalkNotesSheet from './photos/WalkNotesSheet'
import PhotoViewer from './photos/PhotoViewer'

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

// The site walk, Cornell-notes style: a sheet of short notes (one per area or
// issue) with the photos for each note beside it, and a live in-app camera. Every photo taken is filed under the active note.
//  - iPad / landscape (md+): sheet on the left, camera on the right.
//  - Upright phone: swipe (or tap) between Notes and Camera.
// Everything saves as you go and uploads run in the background, so nothing
// ever blocks the field manager.
export default function QuoteCapture() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const confirmDialog = useConfirm()
  const [quote, setQuote] = useState(null)
  const [activeNoteId, setActiveNoteId] = useState(null)
  const [focusNoteId, setFocusNoteId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [tab, setTab] = useState('camera') // phones only: notes | camera
  const [viewing, setViewing] = useState(null)
  const [generalNotes, setGeneralNotes] = useState(null) // = the request description
  const seeded = useRef(false)
  const wide = useMediaQuery('(min-width: 768px)')
  const touchX = useRef(null)

  const load = useCallback(() => getQuoteRequest(id).then((d) => {
    setQuote(d.quoteRequest)
    setGeneralNotes((g) => (g === null ? (d.quoteRequest.description ?? '') : g))
    return d.quoteRequest
  }).catch(() => { navigate('/quotes', { replace: true }) }), [id, navigate])

  const uploader = usePhotoUploader(id, { onUploaded: load })

  const addNote = useCallback(async ({ focus = true } = {}) => {
    setAdding(true)
    try {
      const { note } = await createQuoteNote(id, { client_uid: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` })
      await load()
      setActiveNoteId(note.id)
      if (focus) setFocusNoteId(note.id)
      return note
    } catch (err) {
      toast.error(err?.response?.data?.error ?? t('common.couldNotSave'))
      return null
    } finally { setAdding(false) }
  }, [id, load, toast, t])

  // First load: start on the last note, or create the first one.
  useEffect(() => {
    load().then((q) => {
      if (!q || seeded.current) return
      seeded.current = true
      if (q.notes?.length) setActiveNoteId(q.notes[q.notes.length - 1].id)
      else if (q.can_edit) addNote({ focus: false })
    })
  }, [load, addNote])


  useAutosave(generalNotes, (v) => {
    if (v === null) return
    updateQuoteRequest(id, { description: v }).catch((err) => toast.error(err?.response?.data?.error ?? t('common.couldNotSave')))
  })

  if (!quote) return <div className="flex justify-center py-16"><Spinner size="lg" className="text-brand-500" /></div>
  if (!quote.can_edit) return <Navigate to={`/quotes/${id}`} replace />

  const notes = quote.notes ?? []
  const activeIndex = notes.findIndex((n) => n.id === activeNoteId)
  const active = notes[activeIndex]
  const meta = activeNoteId ? { note_id: activeNoteId } : {}
  const capture = (file) => uploader.addFiles([file], meta)
  const addFiles = (files) => uploader.addFiles(files, meta)
  const uploading = uploader.items.filter((i) => i.status !== 'error').length
  const failed = uploader.items.filter((i) => i.status === 'error').length

  const newNoteFromCamera = async () => {
    const n = await addNote()
    if (n) setTab('notes')
  }

  // Cancel on a walk that was never saved discards it entirely — it never
  // becomes a quote and never takes a Q-number. (Asks first if anything was
  // captured.) A saved walk just goes back to its page.
  const cancel = async () => {
    if (quote.is_saved) { navigate(`/quotes/${id}`); return }
    const empty = !quote.photos.length && !uploader.items.length && !(generalNotes ?? '').trim()
      && notes.every((n) => !(n.body ?? '').trim())
    if (!empty && !await confirmDialog(t('quotes.walk.discardConfirm'), { danger: true, confirmLabel: t('quotes.walk.discard') })) return
    uploader.discardAll()
    try { await deleteQuoteRequest(id) } catch { /* already gone */ }
    navigate('/quotes', { replace: true })
  }
  // Next = save: the walk becomes a quote request and gets its Q-number.
  const next = async () => {
    try {
      if (!quote.is_saved) await updateQuoteRequest(id, { keep: true, ...(generalNotes !== null ? { description: generalNotes } : {}) })
      navigate(`/quotes/${id}?edit=1`)
    } catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    if (touchX.current == null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (Math.abs(dx) > 70) setTab(dx < 0 ? 'camera' : 'notes')
  }

  const cameraChip = (
    <div className="flex items-center justify-between gap-2">
      <button onClick={() => setTab('notes')}
        className="min-w-0 max-w-[70%] rounded-full bg-black/60 backdrop-blur px-3 py-1.5 text-left text-xs text-white">
        <span className="font-bold">{active ? `${t('quotes.walk.noteN', { n: activeIndex + 1 })}` : t('quotes.walk.unfiled')}</span>
        {active?.body ? <span className="text-white/80"> · {active.body.split('\n')[0]}</span> : null}
      </button>
      {/* Side by side, the sheet's own "+ New note" is right there. */}
      {!wide && (
        <button onClick={newNoteFromCamera} disabled={adding}
          className="shrink-0 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-gray-900 disabled:opacity-60">
          + {t('quotes.walk.newNote')}
        </button>
      )}
    </div>
  )

  const sheet = (
    <WalkNotesSheet notes={notes} photos={quote.photos} uploader={uploader} editable
      activeNoteId={activeNoteId} onSelect={setActiveNoteId} focusNoteId={focusNoteId}
      onOpenPhoto={setViewing} onChanged={load} onAddNote={() => addNote()} adding={adding}
      generalNotes={generalNotes} onGeneralNotesChange={setGeneralNotes} />
  )

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={cancel} className="text-sm font-semibold text-gray-500 py-2 pr-2">{t('common.cancel')}</button>
        <div className="min-w-0 text-center">
          <p className="text-[11px] font-bold text-gray-400 tracking-wide">{quote.request_no ?? t('quotes.unsaved')}</p>
          <p className="text-sm font-bold text-gray-900 truncate">{quote.title}</p>
        </div>
        <button onClick={next} className="shrink-0 rounded-full bg-gray-900 text-white px-4 py-2 text-sm font-bold active:bg-gray-700">
          <span className="sm:hidden">{t('quotes.walk.nextShort')}</span>
          <span className="hidden sm:inline">{t('quotes.walk.next')}</span> →
        </button>
      </div>

      {(uploading > 0 || failed > 0) && (
        <p className="text-center text-xs text-gray-500">
          {uploading > 0 && t('quotes.photos.uploading', { count: uploading })}
          {failed > 0 && <span className="text-red-500 font-semibold"> · {t('quotes.walk.failed', { count: failed })}</span>}
        </p>
      )}

      {/* Phones: Notes | Camera tabs (swipe or tap). Only one layout is
          rendered at a time so there's never a second camera stream. */}
      {!wide && (<>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
        {['notes', 'camera'].map((k) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-lg py-2 text-sm font-semibold ${tab === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            {k === 'notes' ? `${t('quotes.walk.notesCol')} (${notes.length})` : `${t('quotes.walk.camera')} (${quote.photos.length + uploader.items.length})`}
          </button>
        ))}
      </div>

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {tab === 'notes' ? sheet : (
          <CameraView active onCapture={capture} onFiles={addFiles} header={cameraChip}
            className="h-[calc(100svh-260px)] min-h-[380px]" />
        )}
      </div>
      </>)}

      {/* iPad / landscape: notes left, camera right. */}
      {wide && (
      <div className="grid grid-cols-2 gap-4 items-start">
        <div className="min-w-0">{sheet}</div>
        <div className="sticky top-2">
          <CameraView active onCapture={capture} onFiles={addFiles} header={cameraChip}
            className="h-[calc(100svh-200px)] min-h-[420px]" />
        </div>
      </div>
      )}

      {viewing != null && (
        <PhotoViewer photos={quote.photos} startId={viewing} canEdit onChanged={load} onClose={() => setViewing(null)}
          notes={notes} />
      )}
    </div>
  )
}
