import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Spinner from '../../components/ui/Spinner'
import Modal from '../../components/ui/Modal'
import { useToast } from '../../components/ToastProvider'
import { useConfirm } from '../../components/ConfirmProvider'
import { getQuoteRequest, deleteQuoteRequest, updateQuoteRequest, quoteAction } from '../../api/quoteRequests'
import { createCustomer } from '../../api/customers'
import { listLibrary } from '../../api/quoteLibrary'
import { usePhotoUploader } from './photos/usePhotoUploader'
import CameraView from './photos/CameraView'
import { release as releaseMedia } from './photos/mediaStreams'
import { useAutosave } from './photos/useAutosave'
import { Thumb } from './photos/WalkNotesSheet'
import PhotoViewer from './photos/PhotoViewer'
import VoiceRecorder from './voice/VoiceRecorder'
import VoiceMemoStack from './voice/VoiceMemoStack'
import { useVoiceMemos } from './voice/useVoiceMemos'
import { ClientPicker, useClientList, rememberClient } from './clients/ClientPicker'
import { EngineerPicker, useEngineerList, rememberEngineer, engineerWhere } from './engineers/EngineerPicker'
import { readVisitMessage, matchClient } from '../../scope-engine/fromMessage'
import { normalizeForm } from '../../scope-engine/index'

// The new title placeholder ("Site visit – Oct 13") gets replaced by the
// title the software writes from the message.
const AUTO_TITLE = /^(site visit|visita)\s+[–-]/i
const HONORIFIC = /^(mr|mrs|ms|miss|dr|sr|sra|srta|se[nñ]or(?:a)?|don|do[nñ]a)\.?\s+/i

// A site visit the way crews already send it in WhatsApp: photos, then one
// message — where, what, how much, for who. The software reads the message
// (place, client, PO or not, the work and quantities), writes the Scope of
// Work, and sends it all to the office in one tap. Anything it got wrong is
// one tap to fix on the "Got it" card, and the office can fix the rest.
export default function QuoteCapture() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const confirmDialog = useConfirm()
  const { clients } = useClientList()
  const { engineers } = useEngineerList()
  const [quote, setQuote] = useState(null)
  const [message, setMessage] = useState(null) // = the request description
  const [library, setLibrary] = useState([])
  const [camera, setCamera] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [pickingClient, setPickingClient] = useState(false)
  const [pickingEngineer, setPickingEngineer] = useState(false)
  const [billing, setBilling] = useState(null) // null = what the message says
  const [place, setPlace] = useState(null)     // null = what the message says
  const [sending, setSending] = useState(false)
  const [barEl, setBarEl] = useState(null)
  const libraryRef = useRef(null)
  const textRef = useRef(null)

  const load = useCallback(() => getQuoteRequest(id).then((d) => {
    setQuote(d.quoteRequest)
    setMessage((m) => (m === null ? (d.quoteRequest.description ?? '') : m))
    return d.quoteRequest
  }).catch((err) => {
    toast.error(`${t('quotes.openFailed')}${err?.response?.data?.error ? ` (${err.response.data.error})` : ''}`)
    navigate('/quotes', { replace: true })
  }), [id, navigate, toast, t])
  useEffect(() => { load() }, [load])
  useEffect(() => { listLibrary().then((d) => setLibrary(d.items ?? [])).catch(() => {}) }, [])

  const uploader = usePhotoUploader(id, { onUploaded: load })
  const voice = useVoiceMemos(id, load)
  useEffect(() => () => releaseMedia(), [])

  useAutosave(message, (v) => {
    if (v === null) return
    updateQuoteRequest(id, { description: v }).catch((err) => toast.error(err?.response?.data?.error ?? t('common.couldNotSave')))
  })

  // Older visits written as note cards: their notes count too.
  const oldNotes = useMemo(() => (quote?.notes ?? []).map((n) => (n.body ?? '').trim()).filter(Boolean), [quote])
  const read = useMemo(() => readVisitMessage(message ?? '', { clients, library, notes: oldNotes }), [message, clients, library, oldNotes])

  // The message grows the box instead of scrolling inside it.
  useEffect(() => {
    const el = textRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(140, el.scrollHeight + 2)}px`
  }, [message])

  if (!quote) return <div className="flex justify-center py-16"><Spinner size="lg" className="text-brand-500" /></div>
  if (!quote.can_edit) return <Navigate to={`/quotes/${id}`} replace />

  const pending = uploader.items
  const failed = pending.filter((i) => i.status === 'error').length
  const photoCount = quote.photos.length + pending.filter((i) => i.status !== 'error').length
  const hasText = !!(message ?? '').trim() || oldNotes.length > 0

  // What goes to the office: picked by hand first, then what the message says.
  // The person it names ("for Mr Bobby") is an engineer on the list when one
  // matches — their company and location come with them.
  const readEngineer = read.clientName ? matchClient(read.clientName, engineers) : null
  const engineer = quote.contact_id ? (engineers.find((e) => e.id === quote.contact_id) ?? quote.engineer) : readEngineer
  const engineerCompany = engineer?.customer_id
    ? (clients.find((c) => c.id === engineer.customer_id) ?? { id: engineer.customer_id, name: engineer.company })
    : null
  const client = quote.customer_id
    ? (clients.find((c) => c.id === quote.customer_id) ?? quote.customer)
    : (engineerCompany ?? (readEngineer ? null : read.client))
  const newClientName = !client && !engineer && read.clientName ? read.clientName.replace(HONORIFIC, '').trim() : ''
  const facility = place ?? (read.facility || quote.facility || engineer?.location || '')
  const bill = billing ?? (quote.is_saved || quote.status !== 'draft' ? (quote.billing ?? read.billing) : read.billing)

  const pickClient = async (cid, c) => {
    if (c) rememberClient(c)
    try { await updateQuoteRequest(id, { customer_id: cid }); await load() }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
    setPickingClient(false)
  }

  // Picking the engineer brings their company and location along when the
  // visit doesn't have those yet.
  const pickEngineer = async (eid, e) => {
    if (e) rememberEngineer(e)
    try {
      await updateQuoteRequest(id, {
        contact_id: eid,
        ...(e?.customer_id && !quote.customer_id ? { customer_id: e.customer_id } : {}),
        ...(e?.location && !quote.facility && place === null && !read.facility ? { facility: e.location } : {}),
      })
      await load()
    } catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
    setPickingEngineer(false)
  }

  // Cancel on a visit that was never sent/saved throws it away (asks first
  // when something was captured); a saved one just goes back to its page.
  const cancel = async () => {
    if (quote.is_saved) { navigate(`/quotes/${id}`); return }
    const empty = !quote.photos.length && !pending.length && !hasText && !(quote.audio ?? []).length
    if (!empty && !await confirmDialog(t('quotes.walk.discardConfirm'), { danger: true, confirmLabel: t('quotes.walk.discard') })) return
    uploader.discardAll()
    try { await deleteQuoteRequest(id) } catch { /* already gone */ }
    navigate('/quotes', { replace: true })
  }

  const send = async () => {
    if (!hasText && !photoCount) { toast.error(t('quotes.quick.needSomething')); textRef.current?.focus(); return }
    setSending(true)
    try {
      // A client named in the message that isn't on the list yet gets added.
      let customerId = quote.customer_id ?? client?.id ?? null
      if (!customerId && newClientName) {
        try {
          const res = await createCustomer({ name: newClientName })
          rememberClient(res.client); customerId = res.client.id
        } catch (err) {
          const existing = err?.response?.status === 409 ? err.response.data?.client : null
          if (existing) { rememberClient(existing); customerId = existing.id }
        }
      }
      const title = !quote.title || AUTO_TITLE.test(quote.title)
        ? (read.title || (facility ? `${t('quotes.walk.title')} – ${facility}` : quote.title))
        : quote.title
      await updateQuoteRequest(id, {
        keep: true,
        description: message ?? '',
        title,
        billing: bill,
        ...(facility ? { facility } : {}),
        ...(customerId ? { customer_id: customerId } : {}),
        ...(engineer && !quote.contact_id ? { contact_id: engineer.id } : {}),
        // The scope draft, unless someone already started it.
        ...(quote.form ? {} : { form: normalizeForm({
          ...read.form,
          aiNotes: read.remarks.map((r) => `• ${r}`).join('\n'),
          aiDraftedAt: new Date().toISOString(),
        }) }),
      })
      if ((quote.actions ?? []).includes('submit')) await quoteAction(id, 'submit')
      toast.success(t('quotes.quick.sent'))
      navigate(`/quotes/${id}`, { replace: true })
    } catch (err) {
      toast.error(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setSending(false) }
  }

  const sendLabel = (quote.actions ?? []).includes('submit') ? t('quotes.quick.send') : t('quotes.quick.save')

  return (
    <div className="flex flex-col gap-4 w-full max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={cancel} className="text-sm font-semibold text-gray-500 py-2 pr-2">{t('common.cancel')}</button>
        <div className="min-w-0 text-center">
          <p className="text-[11px] font-bold text-gray-400 tracking-wide">{quote.request_no ?? t('quotes.walk.title')}</p>
          <p className="text-sm font-bold text-gray-900 truncate">{facility || read.title || t('quotes.quick.newVisit')}</p>
        </div>
        <span className="w-14" />
      </div>

      {/* 1 · Photos */}
      <section className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setCamera(true)}
            className="flex items-center justify-center gap-2 rounded-2xl bg-gray-900 py-4 text-base font-bold text-white active:bg-gray-700">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.66-.89l.82-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.66.89l.82 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            {t('quotes.quick.takePhotos')}
          </button>
          <button onClick={() => libraryRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white py-4 text-base font-bold text-gray-800 active:bg-gray-50">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.59-4.59a2 2 0 012.82 0L16 16m-2-2l1.59-1.59a2 2 0 012.82 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            {t('quotes.quick.fromLibrary')}
          </button>
          <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) uploader.addFiles(fs) }} />
        </div>
        {(quote.photos.length > 0 || pending.length > 0) && (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
            {pending.map((it) => (
              <Thumb key={it.key} src={it.previewUrl} pending error={it.status === 'error'} onRetry={() => uploader.retry(it.key)} />
            ))}
            {quote.photos.map((p) => <Thumb key={p.id} src={p.url} shapes={p.annotations?.shapes} onClick={() => setViewing(p.id)} />)}
          </div>
        )}
        <p className="text-xs text-gray-500">
          {t('quotes.quick.photoCount', { count: photoCount })}
          {failed > 0 && <span className="text-red-500 font-semibold"> · {t('quotes.walk.failed', { count: failed })}</span>}
        </p>
      </section>

      {/* 2 · The message */}
      <section className="flex flex-col gap-2">
        <label htmlFor="visit-message" className="text-sm font-bold text-gray-900">{t('quotes.quick.messageLabel')}</label>
        {oldNotes.length > 0 && (
          <ul className="rounded-xl bg-gray-50 px-4 py-2.5 text-sm text-gray-600 list-disc pl-8">
            {oldNotes.map((n, i) => <li key={i} className="whitespace-pre-line">{n}</li>)}
          </ul>
        )}
        <textarea id="visit-message" ref={textRef} value={message ?? ''} onChange={(e) => setMessage(e.target.value)}
          placeholder={t('quotes.quick.messagePlaceholder')} autoCapitalize="sentences"
          className="w-full resize-none rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        <p className="text-xs text-gray-500">{t('quotes.quick.messageHint')}</p>
        <div ref={setBarEl} className="relative flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2 select-none"
          style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}>
          <span className="flex-1 min-w-0 text-sm text-gray-500">{t('quotes.quick.voiceHint')}</span>
          <VoiceRecorder size="md" onRecorded={(rec) => voice.add(rec, null)} className="!w-11 !h-11" barEl={barEl} />
        </div>
        <VoiceMemoStack memos={quote.audio ?? []} voice={voice} all editable />
      </section>

      {/* 3 · What the software understood — tap to fix */}
      {hasText && (
        <section className="rounded-2xl border border-brand-100 bg-brand-100/30 p-4 flex flex-col gap-3">
          <p className="text-sm font-bold text-gray-900">{t('quotes.quick.gotIt')}</p>
          <Row label={t('quotes.quick.work')}>
            <span className="font-semibold text-gray-900">{read.title || <span className="text-gray-400 font-normal">{t('quotes.quick.workUnknown')}</span>}</span>
          </Row>
          <Row label={t('quotes.quick.place')}>
            <input value={facility} onChange={(e) => setPlace(e.target.value)} placeholder={t('quotes.fields.facilityPlaceholder')}
              className="w-full rounded-lg border border-transparent bg-white/70 px-2 py-1 text-sm font-semibold text-gray-900 outline-none focus:border-brand-500" />
          </Row>
          <Row label={t('quotes.quick.engineer')}>
            <button type="button" onClick={() => setPickingEngineer(true)} className="text-left text-sm min-w-0">
              {engineer ? (
                <span>
                  <span className="font-semibold text-gray-900">{engineer.name}</span>
                  {engineerWhere(engineer) && <span className="block text-xs text-gray-500 truncate">{engineerWhere(engineer)}</span>}
                </span>
              ) : <span className="text-gray-400">{t('quotes.quick.noEngineer')}</span>}
              <span className="ml-2 text-xs font-semibold text-brand-700">{t('quotes.clients.change')}</span>
            </button>
          </Row>
          <Row label={t('quotes.quick.client')}>
            <button type="button" onClick={() => setPickingClient(true)} className="text-left text-sm">
              {client ? <span className="font-semibold text-gray-900">{client.name}</span>
                : newClientName ? <span><span className="font-semibold text-gray-900">{newClientName}</span> <span className="text-xs text-gray-500">· {t('quotes.quick.newClient')}</span></span>
                : <span className="text-gray-400">{t('quotes.quick.noClient')}</span>}
              <span className="ml-2 text-xs font-semibold text-brand-700">{t('quotes.clients.change')}</span>
            </button>
          </Row>
          <Row label={t('quotes.quick.billing')}>
            <div className="inline-flex rounded-full bg-white p-0.5 border border-gray-200">
              {['po', 'no_po'].map((k) => (
                <button key={k} type="button" onClick={() => setBilling(k)}
                  className={`rounded-full px-3 py-1 text-xs font-bold ${bill === k ? 'bg-brand-500 text-white' : 'text-gray-600'}`}>
                  {t(`quotes.quick.billing_${k}`)}
                </button>
              ))}
            </div>
          </Row>
        </section>
      )}

      {/* Send — always within thumb reach */}
      <div className="sticky bottom-2 z-10">
        <button onClick={send} disabled={sending}
          className="w-full rounded-2xl bg-brand-500 py-4 text-lg font-bold text-white shadow-lg active:bg-brand-700 disabled:opacity-60">
          {sending ? <Spinner size="sm" className="text-white inline" /> : `${sendLabel} →`}
        </button>
      </div>

      {camera && (
        <div className="fixed inset-0 z-50 bg-black">
          <CameraView active onCapture={(f) => uploader.addFiles([f])} onFiles={(fs) => uploader.addFiles(fs)} className="h-full"
            header={(
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white">{t('quotes.quick.photoCount', { count: photoCount })}</span>
                <button onClick={() => { setCamera(false); releaseMedia('camera') }}
                  className="rounded-full bg-white px-4 py-1.5 text-sm font-bold text-gray-900">{t('quotes.quick.done')}</button>
              </div>
            )} />
        </div>
      )}

      {pickingClient && (
        <Modal isOpen onClose={() => setPickingClient(false)} title={t('quotes.clients.label')}>
          <div className="min-h-[280px]">
            <ClientPicker value={quote.customer_id} label={false} autoFocus onChange={pickClient} />
          </div>
        </Modal>
      )}

      {pickingEngineer && (
        <Modal isOpen onClose={() => setPickingEngineer(false)} title={t('quotes.engineers.label')}>
          <div className="min-h-[280px]">
            <EngineerPicker value={quote.contact_id} label={false} autoFocus onChange={pickEngineer}
              defaults={{ customer_id: client?.id ?? null, location: facility }} />
          </div>
        </Modal>
      )}

      {viewing != null && (
        <PhotoViewer photos={quote.photos} startId={viewing} canEdit onChanged={load} onClose={() => setViewing(null)} notes={quote.notes ?? []} />
      )}
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
