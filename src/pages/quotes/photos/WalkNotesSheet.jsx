import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Spinner from '../../../components/ui/Spinner'
import { useConfirm } from '../../../components/ConfirmProvider'
import { useToast } from '../../../components/ToastProvider'
import { updateQuoteNote, deleteQuoteNote } from '../../../api/quoteRequests'
import { useAutosave } from './useAutosave'
import VoiceRecorder from '../voice/VoiceRecorder'
import VoiceMemoStack from '../voice/VoiceMemoStack'

function Thumb({ src, onClick, pending, error, onRetry }) {
  return (
    <button type="button" onClick={onClick} className="relative aspect-square overflow-hidden rounded-md bg-gray-100">
      <img src={src} alt="" loading="lazy" className={`w-full h-full object-cover ${pending ? 'opacity-60' : ''}`} />
      {pending && !error && <span className="absolute inset-0 flex items-center justify-center"><Spinner size="sm" className="text-white drop-shadow" /></span>}
      {error && (
        <span onClick={(e) => { e.stopPropagation(); onRetry() }}
          className="absolute inset-0 flex items-center justify-center bg-black/50 text-[11px] font-bold text-white">↻</span>
      )}
    </button>
  )
}

function NoteRow({ note, index, photos, pending, active, editable, onSelect, onOpenPhoto, onDeleted, uploader, autoFocus, audio, voice }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirmDialog = useConfirm()
  const [text, setText] = useState(note.body ?? '')
  const [saving, setSaving] = useState(false)
  const taRef = useRef(null)
  // Grow the box with its text instead of scrolling inside a tiny field —
  // re-measured when the text changes AND when its width changes (tab
  // switches, rotation, layout shifts), or a line can end up hidden.
  useLayoutEffect(() => {
    const el = taRef.current
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

  const remove = async () => {
    const msg = photos.length ? t('quotes.walk.deleteNoteWithPhotos', { count: photos.length }) : t('quotes.walk.deleteNote')
    if (!await confirmDialog(msg, { danger: true, confirmLabel: t('common.delete') })) return
    try { await deleteQuoteNote(note.id); onDeleted() }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }

  const count = photos.length + pending.length
  return (
    <div onClick={onSelect}
      className={`border-b border-gray-200 transition-colors ${active ? 'bg-brand-100/50' : 'bg-white'} ${editable ? 'cursor-pointer' : ''}`}>
    <div className="grid grid-cols-2">
      {/* Cue column: the note */}
      <div className={`relative min-h-[7.5rem] border-r border-gray-200 p-3 ${active ? 'border-l-4 border-l-brand-500' : 'border-l-4 border-l-transparent'}`}>
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className={`text-[11px] font-bold ${active ? 'text-brand-700' : 'text-gray-400'}`}>
            {index + 1}{active && editable ? ` · ${t('quotes.walk.activeNote')}` : ''}
          </span>
          {editable && (
            <span className="flex items-center gap-1">
              {saving && <Spinner size="sm" className="text-gray-300" />}
              {voice && <VoiceRecorder onRecorded={(rec) => { onSelect(); voice.add(rec, note.id) }} />}
              <button type="button" onClick={(e) => { e.stopPropagation(); remove() }} aria-label={t('common.delete')}
                className="w-6 h-6 rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 text-sm leading-none">×</button>
            </span>
          )}
        </div>
        {editable ? (
          <textarea ref={taRef} value={text} onChange={(e) => setText(e.target.value)} onFocus={onSelect} autoFocus={autoFocus}
            rows={2} placeholder={t('quotes.walk.notePlaceholder')}
            className="w-full resize-none overflow-hidden bg-transparent text-base lg:text-sm leading-snug text-gray-900 placeholder-gray-300 outline-none" />
        ) : (
          <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{note.body || <span className="text-gray-300">—</span>}</p>
        )}
      </div>
      {/* Main column: the photos for that note */}
      <div className="min-h-[7.5rem] p-2">
        {count === 0 ? (
          <p className="h-full min-h-[7rem] flex items-center justify-center text-xs text-gray-300 text-center px-2">
            {editable && active ? t('quotes.walk.photosGoHere') : t('quotes.walk.noPhotos')}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {pending.map((it) => (
              <Thumb key={it.key} src={it.previewUrl} pending error={it.status === 'error'} onRetry={() => uploader.retry(it.key)} />
            ))}
            {photos.map((p) => <Thumb key={p.id} src={p.url} onClick={(e) => { e.stopPropagation(); onOpenPhoto(p.id) }} />)}
          </div>
        )}
      </div>
    </div>
    {/* Voice memos for this note — full width so the waveform has room. */}
    {(audio.some((a) => a.note_id === note.id) || (voice?.pending ?? []).some((p) => p.note_id === note.id)) && (
      <div className={`px-3 pb-3 ${active ? 'border-l-4 border-l-brand-500' : 'border-l-4 border-l-transparent'}`}>
        <VoiceMemoStack memos={audio} voice={voice} noteId={note.id} editable={editable} />
      </div>
    )}
    </div>
  )
}

// The Cornell-style walk sheet: one row per note (note on the left, its photos
// on the right, equal width) and a General notes box at the bottom for
// anything that isn't about one area (stored as the request description). In
// capture mode the tapped row is the "active" note new photos are filed under.
export default function WalkNotesSheet({
  notes, photos, uploader, activeNoteId, onSelect, editable, onOpenPhoto, onChanged,
  onAddNote, adding, focusNoteId, generalNotes, onGeneralNotesChange, audio = [], voice,
}) {
  const { t } = useTranslation()
  const pendingFor = (noteId) => (uploader?.items ?? []).filter((it) => (it.meta?.note_id ?? null) === noteId)
  const unfiled = photos.filter((p) => !p.note_id || !notes.some((n) => n.id === p.note_id))
  const unfiledPending = pendingFor(null)

  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="grid grid-cols-2 border-b-2 border-gray-300 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-400">
        <span className="px-3 py-2 border-r border-gray-200">{t('quotes.walk.notesCol')}</span>
        <span className="px-3 py-2">{t('quotes.walk.photosCol')}</span>
      </div>

      {notes.map((n, i) => (
        <NoteRow key={n.id} note={n} index={i} active={editable && n.id === activeNoteId} editable={editable}
          photos={photos.filter((p) => p.note_id === n.id)} pending={pendingFor(n.id)} uploader={uploader}
          onSelect={() => onSelect?.(n.id)} onOpenPhoto={onOpenPhoto} onDeleted={onChanged} autoFocus={n.id === focusNoteId}
          audio={audio} voice={editable ? voice : null} />
      ))}

      {(unfiled.length > 0 || unfiledPending.length > 0) && (
        <div className="grid grid-cols-2 border-b border-gray-200">
          <div className="border-r border-gray-200 p-2.5 border-l-4 border-l-transparent">
            <span className="text-[11px] font-bold text-gray-400">{t('quotes.walk.unfiled')}</span>
          </div>
          <div className="p-2 grid grid-cols-3 gap-1">
            {unfiledPending.map((it) => <Thumb key={it.key} src={it.previewUrl} pending error={it.status === 'error'} onRetry={() => uploader.retry(it.key)} />)}
            {unfiled.map((p) => <Thumb key={p.id} src={p.url} onClick={() => onOpenPhoto(p.id)} />)}
          </div>
        </div>
      )}

      {editable && (
        <button type="button" onClick={onAddNote} disabled={adding}
          className="flex items-center justify-center gap-2 py-3 text-sm font-bold text-brand-700 border-b border-gray-200 active:bg-brand-100/50 disabled:opacity-50">
          {adding ? <Spinner size="sm" /> : <span className="text-lg leading-none">+</span>} {t('quotes.walk.newNote')}
        </button>
      )}

      {(editable || generalNotes || audio.some((a) => !a.note_id)) && (
        <div className="p-3 bg-gray-50 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{t('quotes.walk.generalNotes')}</p>
            {editable && voice && <VoiceRecorder onRecorded={(rec) => voice.add(rec, null)} />}
          </div>
          {editable ? (
            <textarea value={generalNotes ?? ''} onChange={(e) => onGeneralNotesChange(e.target.value)} rows={3}
              placeholder={t('quotes.walk.generalNotesPlaceholder')}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-base lg:text-sm outline-none focus:border-brand-500" />
          ) : (
            generalNotes ? <p className="text-sm text-gray-800 whitespace-pre-wrap">{generalNotes}</p> : null
          )}
          <VoiceMemoStack memos={audio} voice={voice} noteId={null} editable={editable} />
        </div>
      )}
    </div>
  )
}

