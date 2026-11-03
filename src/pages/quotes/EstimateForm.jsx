import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { useToast } from '../../components/ToastProvider'
import { useConfirm } from '../../components/ConfirmProvider'
import { getQuoteRequest, updateQuoteRequest, aiDraftEstimate } from '../../api/quoteRequests'
import { listLibrary } from '../../api/quoteLibrary'
import { generateScope, normalizeForm, toInvoiceToGoText } from '../../scope-engine'
import { formFromNotes } from '../../scope-engine/fromNotes'
import { draftText, generatedText } from '../../scope-engine/draft'
import { summarizeVisit } from '../../scope-engine/summary'
import { Thumb } from './photos/WalkNotesSheet'
import { useAutosave } from './photos/useAutosave'
import VoiceMemoStack from './voice/VoiceMemoStack'
import { useVoiceMemos } from './voice/useVoiceMemos'
import { copyText } from './quoteUtils'

const LOCKED = ['accepted', 'declined', 'cancelled', 'invoiced']

// First draft of the form from what the request already knows.
function seedForm(q) {
  const where = (q.location_detail ?? '').trim()
  return normalizeForm({
    title: q.title ?? '',
    locations: where,
    area: where ? `work area within ${where}` : 'work area',
  })
}

// ── Page ────────────────────────────────────────────────────────────────
// The estimate for one site visit: a short summary of its notes (the
// estimate prompt) and one key photo → the estimate text, written by the
// software the moment the page opens. The text is the main thing: edit it
// right there (saves as you type, editable again any time) and copy it into
// InvoiceToGo.
export default function EstimateForm() {
  const { id } = useParams()
  const { t } = useTranslation()
  const toast = useToast()
  const confirmDialog = useConfirm()
  const [quote, setQuote] = useState(null)
  const [form, setForm] = useState(null)
  const [library, setLibrary] = useState([])
  const [saving, setSaving] = useState(false)
  const [savedOnce, setSavedOnce] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const textRef = useRef(null)
  const promptRef = useRef(null)
  const voice = useVoiceMemos(id, () => load())

  // Step 1: the notes → a short summary with the important details (the
  // estimate prompt). Step 2: the estimate text is written from that prompt.
  const summaryOf = useCallback((q) => summarizeVisit({
    ...q, engineer: q.engineer, company: q.customer?.name,
  }), [])
  const fromPrompt = useCallback((prompt, q, lib, keep = {}) => {
    const { form: draft, notes: remarks } = formFromNotes({
      notes: [],
      generalNotes: prompt,
      title: q.title,
      locationDetail: q.location_detail ?? '',
      library: lib,
    })
    return normalizeForm({ ...draft, ...keep, aiNotes: remarks.map((r) => `• ${r}`).join('\n'), aiDraftedAt: new Date().toISOString() })
  }, [])

  const load = useCallback(() => Promise.all([
    getQuoteRequest(id),
    listLibrary().catch(() => ({ items: [] })),
  ]).then(([d, lib]) => {
    const q = d.quoteRequest
    setQuote(q)
    setLibrary(lib.items ?? [])
    setForm((f) => {
      if (f) return f
      const keyPhotoId = q.form?.keyPhotoId ?? q.photos?.[0]?.id ?? null
      // Earlier estimates had no prompt yet: give them one, keep their text.
      if (q.form) return normalizeForm({ prompt: { text: summaryOf(q), edited: false }, keyPhotoId, ...q.form })
      const prompt = summaryOf(q)
      const keep = { prompt: { text: prompt, edited: false }, keyPhotoId }
      return prompt.split('\n').length > 1 ? fromPrompt(prompt, q, lib.items ?? [], keep) : { ...seedForm(q), ...keep }
    })
  }), [id, summaryOf, fromPrompt])
  useEffect(() => { load() }, [load])

  // The estimate text has one home: the request's scope_text. This page is
  // where it's written and edited; the quote page only shows and copies it.
  // Older requests kept it on the form (form.draft) — that's where it starts.
  const [text, setText] = useState(null)
  useEffect(() => {
    if (quote && form && text === null) setText(quote.scope_text ?? draftText(form, quote.estimate_type))
  }, [quote, form, text])

  const readOnly = !quote || !quote.can_edit_scope || LOCKED.includes(quote.status)
  // A freshly written draft is saved straight away, so it's there next time.
  useEffect(() => {
    if (quote && form && text !== null && !readOnly && !savedOnce && (!quote.form || quote.scope_text == null)) {
      setSavedOnce(true)
      updateQuoteRequest(id, { form, ...(quote.scope_text == null && text.trim() ? { scope_text: text } : {}) }).catch(() => {})
    }
  }, [quote, form, text, readOnly, savedOnce, id])
  useAutosave(form, (v) => {
    if (!v || readOnly) return
    updateQuoteRequest(id, { form: v }).catch((err) => toast.error(err?.response?.data?.error ?? t('common.couldNotSave')))
  }, [readOnly])
  useAutosave(text, (v) => {
    if (v === null || readOnly) return
    setSaving(true)
    updateQuoteRequest(id, { scope_text: v })
      .catch((err) => toast.error(err?.response?.data?.error ?? t('common.couldNotSave')))
      .finally(() => setSaving(false))
  }, [readOnly])

  const g = useMemo(() => (form ? generateScope(form, { estimateType: quote?.estimate_type }) : null), [form, quote?.estimate_type])
  const generated = g ? toInvoiceToGoText(g) : ''
  // Edited = differs from what the prompt would write (so regenerating asks first).
  const edited = text !== null && text !== generated

  // Let the box grow with the text instead of scrolling inside it.
  useEffect(() => {
    const el = textRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [text])

  if (!quote || !form || text === null) return <div className="flex justify-center py-16"><Spinner size="lg" className="text-brand-500" /></div>

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  // A new form from a generator → its text replaces the estimate text.
  const applyForm = (next) => {
    setForm({ ...next, draft: null })
    setText(generatedText(next, quote.estimate_type))
  }

  const copy = async (value) => {
    if (await copyText(value)) toast.success(t('quotes.est.copied'))
    else toast.error(t('common.couldNotSave'))
  }

  const promptText = form.prompt?.text ?? ''
  const keyPhoto = (quote.photos ?? []).find((p) => p.id === form.keyPhotoId) ?? null
  const editPrompt = (v) => setForm((f) => ({ ...f, prompt: { text: v, edited: true } }))
  const resummarize = async () => {
    if (form.prompt?.edited && !await confirmDialog(t('quotes.est.prompt.redoConfirm'), { confirmLabel: t('quotes.est.prompt.redo') })) return
    setForm((f) => ({ ...f, prompt: { text: summaryOf(quote), edited: false } }))
  }
  // What the generators keep from the current form: the prompt and key photo.
  const keep = () => ({ prompt: form.prompt, keyPhotoId: form.keyPhotoId })
  const generate = async () => {
    if (!promptText.trim()) { toast.error(t('quotes.est.prompt.empty')); promptRef.current?.focus(); return }
    if (edited && !await confirmDialog(t('quotes.est.redoConfirm'), { confirmLabel: t('quotes.est.generate') })) return
    applyForm(fromPrompt(promptText, quote, library, keep()))
    toast.success(t('quotes.est.auto.done'))
  }
  // Paid option — only offered when the server has an Anthropic key. It is
  // the one that actually looks at the key photo.
  const draftWithAi = async () => {
    if (!promptText.trim()) { toast.error(t('quotes.est.prompt.empty')); promptRef.current?.focus(); return }
    if (edited && !await confirmDialog(t('quotes.est.redoConfirm'), { confirmLabel: t('quotes.est.ai.button') })) return
    setDrafting(true)
    try {
      const res = await aiDraftEstimate(id, { prompt: promptText, key_photo_id: form.keyPhotoId })
      applyForm(normalizeForm({ ...res.form, ...keep(), aiNotes: res.office_notes, aiDraftedAt: new Date().toISOString() }))
      toast.success(t('quotes.est.ai.done', { count: res.photos_used }))
    } catch (err) {
      toast.error(err?.response?.data?.error ?? t('quotes.est.ai.failed'))
    } finally { setDrafting(false) }
  }

  // Title = first line; the rest is the description (what InvoiceToGo wants).
  const [titleLine, ...rest] = text.split('\n')
  const description = rest.join('\n')

  const draftCard = (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">{t('quotes.est.draftTitle')}</h2>
          <p className="text-xs text-gray-500">
            {readOnly ? t('quotes.est.readOnly') : edited ? t('quotes.est.draftEdited') : t('quotes.est.draftHint')}
          </p>
        </div>
        <span className="shrink-0 text-xs font-semibold text-gray-400">
          {readOnly ? null : saving ? t('quotes.est.saving') : t('quotes.est.saved')}
        </span>
      </div>

      {(g.missing.length > 0 || g.warnings.length > 0) && (
        <ul className="flex flex-col gap-1">
          {g.missing.map((m) => <li key={m} className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">{t(`quotes.est.missing.${m}`)}</li>)}
          {g.warnings.map((w) => <li key={w} className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">{t(`quotes.est.warn.${w}`)}</li>)}
        </ul>
      )}


      {readOnly ? (
        <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-800 leading-relaxed">{text}</pre>
      ) : (
        <textarea ref={textRef} value={text} onChange={(e) => setText(e.target.value)} spellCheck rows={12}
          className="w-full resize-none overflow-hidden rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-base lg:text-sm leading-relaxed text-gray-800 outline-none focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
      )}

      <Button size="lg" onClick={() => copy(text)} disabled={!text.trim()}>{t('quotes.scope.copy')}</Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => copy(titleLine)} disabled={!titleLine.trim()}>{t('quotes.est.copyTitle')}</Button>
        <Button variant="secondary" onClick={() => copy(description)} disabled={!description.trim()}>{t('quotes.est.copyDescription')}</Button>
      </div>
    </section>
  )

  // 1 · The estimate prompt (summary of the notes) + 2 · the key photo → Generate.
  const photos = quote.photos ?? []
  const promptCard = (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-gray-900">{t('quotes.est.prompt.title')}</h2>
        <p className="text-xs text-gray-500">{t('quotes.est.prompt.hint')}</p>
      </div>
      {readOnly ? (
        <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-700">{promptText}</pre>
      ) : (
        <textarea ref={promptRef} value={promptText} onChange={(e) => editPrompt(e.target.value)} rows={Math.min(14, Math.max(5, promptText.split('\n').length + 1))}
          className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-base lg:text-sm leading-relaxed text-gray-800 outline-none focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
      )}
      {!readOnly && (
        <button type="button" onClick={resummarize} className="self-start text-xs font-semibold text-gray-500 hover:underline">{t('quotes.est.prompt.redo')}</button>
      )}

      <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">{t('quotes.est.keyPhoto.title')}</p>
          <p className="text-xs text-gray-500">{quote.ai_available ? t('quotes.est.keyPhoto.hintAi') : t('quotes.est.keyPhoto.hint')}</p>
        </div>
        {photos.length === 0 ? (
          <p className="text-xs text-gray-400">{t('quotes.est.keyPhoto.none')}</p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            {keyPhoto && (
              <img src={keyPhoto.url} alt="" className="w-full sm:w-56 aspect-[4/3] object-cover rounded-xl border border-gray-100" />
            )}
            <div className="grid grid-cols-5 sm:grid-cols-4 gap-1.5 flex-1">
              {photos.map((p) => (
                <div key={p.id} className={`grid rounded-lg ${p.id === form.keyPhotoId ? 'ring-2 ring-brand-500 ring-offset-1' : ''}`}>
                  <Thumb src={p.url} shapes={p.annotations?.shapes} onClick={readOnly ? undefined : () => set('keyPhotoId', p.id)} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" className="flex-1" onClick={generate} disabled={drafting}>{t('quotes.est.generate')}</Button>
          {quote.ai_available && (
            <Button size="lg" variant="secondary" className="flex-1" onClick={draftWithAi} loading={drafting}>
              {drafting ? t('quotes.est.ai.working') : `✨ ${t('quotes.est.ai.button')}`}
            </Button>
          )}
        </div>
      )}
    </section>
  )

  const checkThese = form.aiNotes && (
    <details className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-amber-700">{t('quotes.est.auto.notesTitle')}</summary>
      <p className="mt-2 text-sm text-amber-900 whitespace-pre-wrap">{form.aiNotes}</p>
    </details>
  )

  const noteNo = Object.fromEntries((quote.notes ?? []).map((n, i) => [n.id, i + 1]))
  const memos = ((quote.audio ?? []).length > 0 || voice.pending.length > 0) && (
    <details className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <summary className="cursor-pointer p-4 text-base font-semibold text-gray-900">
        {t('quotes.voice.title')} <span className="font-normal text-gray-400">({(quote.audio ?? []).length})</span>
      </summary>
      <div className="px-4 pb-4">
        <VoiceMemoStack memos={quote.audio ?? []} voice={voice} all editable={!readOnly}
          labelFor={(m) => (m.note_id && noteNo[m.note_id] ? t('quotes.walk.noteN', { n: noteNo[m.note_id] }) : t('quotes.walk.generalNotes'))} />
      </div>
    </details>
  )

  return (
    <div className="flex flex-col gap-4 w-full max-w-3xl mx-auto">
      <Link to={`/quotes/${id}`} className="text-sm font-semibold text-brand-500 hover:underline w-fit py-1">← {quote.request_no ?? t('quotes.unsaved')} · {quote.title}</Link>
      {promptCard}
      {draftCard}
      {checkThese}
      {memos}
    </div>
  )
}
