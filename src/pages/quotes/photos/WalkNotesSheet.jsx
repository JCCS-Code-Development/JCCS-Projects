import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Spinner from '../../../components/ui/Spinner'
import { useConfirm } from '../../../components/ConfirmProvider'
import { useToast } from '../../../components/ToastProvider'
import { updateQuoteNote, deleteQuoteNote } from '../../../api/quoteRequests'
import { useAutosave } from './useAutosave'
import VoiceMemoStack from '../voice/VoiceMemoStack'
import { MarkedImage } from './AnnotationLayer'

function Thumb({ src, shapes, onClick, pending, error, onRetry }) {
  return (
    <button type="button" onClick={onClick} className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
      <MarkedImage src={src} shapes={shapes} className="w-full h-full" imgClassName={pending ? 'opacity-60' : ''} />
      {pending && !error && <span className="absolute inset-0 flex items-center justify-center"><Spinner size="sm" className="text-white drop-shadow" /></span>}
      {error && (
        <span onClick={(e) => { e.stopPropagation(); onRetry() }}
          className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-bold text-white">↻</span>
      )}
    </button>
  )
}

// Photos across the top of a card: full width, roomy thumbnails.
function PhotoStrip({ photos, pending, uploader, onOpenPhoto, emptyText }) {
  if (!photos.length && !pending.length) {
    return emptyText
      ? <div className="rounded-xl border-2 border-dashed border-gray-200 py-5 text-center text-xs text-gray-400">{emptyText}</div>
      : null
  }
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
      {pending.map((it) => (
        <Thumb key={it.key} src={it.previewUrl} pending error={it.status === 'error'} onRetry={() => uploader.retry(it.key)} />
      ))}
      {photos.map((p) => <Thumb key={p.id} src={p.url} shapes={p.annotations?.shapes} onClick={(e) => { e.stopPropagation(); onOpenPhoto(p.id) }} />)}
    </div>
  )
}

// A note's text box: grows with its text (re-measured when the text OR its
// width changes, so no line ends up hidden) and autosaves as you type.
function NoteText({ note, onFocus, autoFocus }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [text, setText] = useState(note.body ?? '')
  const [saving, setSaving] = useState(false)
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }
    fit()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [text])
  useAutosave(text, async (v) => {
    setSaving(true)
    try { await updateQuoteNote(note.id, { body: v }) }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setSaving(false) }
  })
  return (
    <div className="relative">
      <textarea ref={ref} value={text} onChange={(e) => setText(e.target.value)} onFocus={onFocus} autoFocus={autoFocus}
        rows={2} placeholder={t('quotes.walk.notePlaceholder')}
        className="w-full resize-none overflow-hidden rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base leading-snug text-gray-900 placeholder-gray-300 outline-none focus:border-brand-500" />
      {saving && <Spinner size="sm" className="absolute right-2 top-2 text-gray-300" />}
    </div>
  )
}

// One note as a card: photos on top, the note below, then its voice memos.
function NoteCard({ note, index, photos, pending, active, editable, onSelect, onOpenPhoto, onDeleted, uploader, autoFocus, audio, voice }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirmDialog = useConfirm()
  const remove = async () => {
    const msg = photos.length ? t('quotes.walk.deleteNoteWithPhotos', { count: photos.length }) : t('quotes.walk.deleteNote')
    if (!await confirmDialog(msg, { danger: true, confirmLabel: t('common.delete') })) return
    try { await deleteQuoteNote(note.id); onDeleted() }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }
  return (
    <div onClick={editable ? onSelect : undefined}
      className={`rounded-2xl border bg-white p-3 flex flex-col gap-2.5 transition-shadow ${
        active ? 'border-brand-500 ring-2 ring-brand-500/30 shadow-sm' : 'border-gray-200'
      } ${editable ? 'cursor-pointer' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-bold ${active ? 'text-brand-700' : 'text-gray-400'}`}>
          {t('quotes.walk.noteN', { n: index + 1 })}{active && editable ? ` · ${t('quotes.walk.activeNote')}` : ''}
        </span>
        {editable && (
          <button type="button" onClick={(e) => { e.stopPropagation(); remove() }} aria-label={t('common.delete')}
            className="w-7 h-7 rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50">×</button>
        )}
      </div>
      <PhotoStrip photos={photos} pending={pending} uploader={uploader} onOpenPhoto={onOpenPhoto}
        emptyText={editable && active ? t('quotes.walk.photosGoHere') : null} />
      {editable
        ? <NoteText note={note} onFocus={onSelect} autoFocus={autoFocus} />
        : <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{note.body || <span className="text-gray-300">—</span>}</p>}
      <VoiceMemoStack memos={audio} voice={voice} noteId={note.id} editable={editable} />
    </div>
  )
}

// The site-visit sheet: one card per note (an area or issue) with its photos
// on top and the note below, then a General card for anything not tied to one
// area (general notes, photos and voice memos with no note). In capture mode
// the selected card is where new photos and voice memos go — activeNoteId
// null means General.
export default function WalkNotesSheet({
  notes, photos, uploader, activeNoteId, onSelect, editable, onOpenPhoto, onChanged,
  onAddNote, adding, focusNoteId, generalNotes, onGeneralNotesChange, audio = [], voice,
}) {
  const { t } = useTranslation()
  const pendingFor = (noteId) => (uploader?.items ?? []).filter((it) => (it.meta?.note_id ?? null) === noteId)
  const general = photos.filter((p) => !p.note_id || !notes.some((n) => n.id === p.note_id))
  const generalPending = pendingFor(null)
  const generalActive = editable && activeNoteId == null
  const showGeneral = editable || generalNotes || general.length || audio.some((a) => !a.note_id)

  return (
    <div className="flex flex-col gap-3">
      {notes.map((n, i) => (
        <NoteCard key={n.id} note={n} index={i} active={editable && n.id === activeNoteId} editable={editable}
          photos={photos.filter((p) => p.note_id === n.id)} pending={pendingFor(n.id)} uploader={uploader}
          onSelect={() => onSelect?.(n.id)} onOpenPhoto={onOpenPhoto} onDeleted={onChanged} autoFocus={n.id === focusNoteId}
          audio={audio} voice={editable ? voice : null} />
      ))}

      {editable && (
        <button type="button" onClick={onAddNote} disabled={adding}
          className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-400/50 py-3 text-sm font-bold text-brand-700 active:bg-brand-100/50 disabled:opacity-50">
          {adding ? <Spinner size="sm" /> : <span className="text-lg leading-none">+</span>} {t('quotes.walk.newNote')}
        </button>
      )}

      {showGeneral && (
        <div onClick={editable ? () => onSelect?.(null) : undefined}
          className={`rounded-2xl border p-3 flex flex-col gap-2.5 ${generalActive ? 'border-brand-500 ring-2 ring-brand-500/30 bg-white' : 'border-gray-200 bg-gray-50'} ${editable ? 'cursor-pointer' : ''}`}>
          <span className={`text-xs font-bold uppercase tracking-wider ${generalActive ? 'text-brand-700' : 'text-gray-400'}`}>
            {t('quotes.walk.generalNotes')}{generalActive ? ` · ${t('quotes.walk.activeNote')}` : ''}
          </span>
          <PhotoStrip photos={general} pending={generalPending} uploader={uploader} onOpenPhoto={onOpenPhoto}
            emptyText={generalActive ? t('quotes.walk.photosGoHere') : null} />
          {editable ? (
            <textarea value={generalNotes ?? ''} onChange={(e) => onGeneralNotesChange(e.target.value)} onFocus={() => onSelect?.(null)} rows={3}
              placeholder={t('quotes.walk.generalNotesPlaceholder')}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500" />
          ) : (
            generalNotes ? <p className="text-sm text-gray-800 whitespace-pre-wrap">{generalNotes}</p> : null
          )}
          <VoiceMemoStack memos={audio} voice={editable ? voice : null} noteId={null} editable={editable} />
        </div>
      )}
    </div>
  )
}
