import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { useToast } from '../../components/ToastProvider'
import { useConfirm } from '../../components/ConfirmProvider'
import { useAuthStore } from '../../store/authStore'
import {
  getQuoteRequest, updateQuoteRequest, deleteQuoteRequest, quoteAction, addQuoteComment,
  uploadQuoteFile, deleteQuoteFile, getQuoteVersion,
} from '../../api/quoteRequests'
import { usePhotoUploader } from './photos/usePhotoUploader'
import PhotoGallery from './photos/PhotoGallery'
import WalkNotesSheet from './photos/WalkNotesSheet'
import PhotoViewer from './photos/PhotoViewer'
import { StatusPill, FlagPills, QuoteDetailsForm, TextArea, Select } from './QuoteParts'
import { useQuotePickers } from './useQuotePickers'
import { fmtDate, fmtDateTime, copyText, FILE_KINDS, formFromQuote, payloadFromForm } from './quoteUtils'

// "Prisma Health" (or the person's name when there's no company), de-duplicated.
const recipientsLabel = (list = []) => [...new Set(list.map((r) => r.company || r.name))].join(', ')

const errMsg = (err, t) => err?.response?.data?.error ?? t('common.couldNotSave')

// ── Actions ──────────────────────────────────────────────────────────────
// How each workflow action is presented. `prompt` = needs text first
// (required unless `optional`), `confirm` = yes/no dialog, `number` = asks
// for the InvoiceToGo Estimate #.
const ACTION_UI = {
  submit:        { primary: true },
  start_review:  {},
  request_info:  { prompt: 'request_info' },
  approve:       { primary: true, confirm: 'approve' },
  reopen:        { confirm: 'reopen' },
  set_estimate:  { primary: true, number: true },
  mark_sent:     { primary: true, number: 'ifMissing' },
  accept:        { primary: true },
  decline:       { prompt: 'decline', danger: true },
  undo_decision: {},
  cancel:        { confirm: 'cancel', danger: true, ghost: true },
  restore:       {},
}

function ActionBar({ quote, onDone, onDelete, canDelete }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirmDialog = useConfirm()
  const [busy, setBusy] = useState(null)
  const [dialog, setDialog] = useState(null) // { action, kind: 'prompt'|'number', optional }
  const [text, setText] = useState('')

  const run = async (action, extra = {}) => {
    setBusy(action)
    try {
      await quoteAction(quote.id, action, extra)
      setDialog(null); setText('')
      onDone()
    } catch (err) {
      toast.error(errMsg(err, t))
    } finally { setBusy(null) }
  }

  const start = async (action) => {
    const ui = ACTION_UI[action] ?? {}
    if (action === 'submit' && quote.status === 'needs_info') {
      setText(''); setDialog({ action, kind: 'prompt', promptKey: 'resubmit', optional: true }); return
    }
    if (action === 'submit' && !quote.photos.length
      && !await confirmDialog(t('quotes.prompts.noPhotos'), { confirmLabel: t('quotes.actions.submit') })) return
    if (ui.prompt) { setText(''); setDialog({ action, kind: 'prompt', promptKey: ui.prompt }); return }
    if (ui.number === true || (ui.number === 'ifMissing' && !quote.estimate_number)) {
      setText(quote.estimate_number ?? ''); setDialog({ action, kind: 'number' }); return
    }
    if (ui.confirm) {
      const key = action === 'cancel' && quote.status === 'draft' ? 'cancelDraft' : ui.confirm
      if (!await confirmDialog(t(`quotes.prompts.${key}`), { danger: !!ui.danger, confirmLabel: t(`quotes.actions.${action}`) })) return
    }
    run(action)
  }

  const submitDialog = () => {
    if (!dialog) return
    if (dialog.kind === 'number') return run(dialog.action, { estimate_number: text.trim() })
    if (!dialog.optional && !text.trim()) return
    run(dialog.action, { note: text.trim() })
  }

  // A field manager's own draft can simply be deleted — "cancel" would be redundant.
  const actions = (quote.actions ?? []).filter((a) => !(a === 'cancel' && canDelete && quote.status === 'draft'))
  if (!actions.length && !canDelete) return null
  const label = (a) => (a === 'submit' && quote.status === 'needs_info' ? t('quotes.actions.resubmit') : t(`quotes.actions.${a}`))
  const main = [...actions.filter((a) => ACTION_UI[a]?.primary), ...actions.filter((a) => !ACTION_UI[a]?.primary && !ACTION_UI[a]?.ghost)]
  const quiet = actions.filter((a) => ACTION_UI[a]?.ghost)

  return (
    <>
      <div className="flex flex-col gap-2 w-full max-w-xl mx-auto lg:mx-0 lg:max-w-none lg:flex-row lg:flex-wrap lg:items-center">
        {main.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 lg:flex lg:flex-wrap">
            {main.map((a) => {
              const ui = ACTION_UI[a] ?? {}
              return (
                <Button key={a} variant={ui.primary ? 'primary' : 'secondary'} size="lg" loading={busy === a} onClick={() => start(a)}
                  className={`${ui.danger ? '!text-red-600' : ''} ${main.length % 2 === 1 && a === main[0] ? 'sm:col-span-2' : ''}`}>
                  {label(a)}
                </Button>
              )
            })}
          </div>
        )}
        {(quiet.length > 0 || canDelete) && (
          <div className="flex flex-wrap justify-center lg:justify-start gap-1">
            {quiet.map((a) => (
              <Button key={a} variant="ghost" size="lg" loading={busy === a} onClick={() => start(a)} className="!text-red-600">{label(a)}</Button>
            ))}
            {canDelete && (
              <Button variant="ghost" size="lg" className="!text-red-600" onClick={onDelete}>{t('quotes.actions.delete')}</Button>
            )}
          </div>
        )}
      </div>

      <Modal isOpen={!!dialog} onClose={() => setDialog(null)} title={dialog ? label(dialog.action) : ''}>
        {dialog && (
          <div className="flex flex-col gap-4">
            {dialog.kind === 'number' ? (
              <Input label={t('quotes.prompts.estimateNumber')} value={text} onChange={(e) => setText(e.target.value)} inputMode="numeric" autoFocus />
            ) : (
              <TextArea label={t(`quotes.prompts.${dialog.promptKey}`)} value={text} onChange={setText} rows={4} />
            )}
            <Button size="lg" fullWidth loading={!!busy} onClick={submitDialog}
              disabled={dialog.kind === 'number' ? !text.trim() : (!dialog.optional && !text.trim())}>
              {label(dialog.action)}
            </Button>
          </div>
        )}
      </Modal>
    </>
  )
}

// ── Details ──────────────────────────────────────────────────────────────
function DetailRow({ label, children }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="flex flex-col sm:flex-row sm:gap-3 py-1.5">
      <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wide sm:w-44 shrink-0 sm:pt-0.5">{label}</dt>
      <dd className="text-sm text-gray-800 whitespace-pre-wrap break-words">{children}</dd>
    </div>
  )
}

function DetailsCard({ quote, isAdmin, pickers, onSaved, startEditing, onEditDone }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [editing, setEditing] = useState(!!startEditing)
  const [form, setForm] = useState(() => formFromQuote(quote))
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const lang = i18n.language

  useEffect(() => { if (!editing) setForm(formFromQuote(quote)) }, [quote, editing])

  const save = async () => {
    if (!form.title.trim()) { toast.error(t('quotes.titleRequired')); return }
    setSaving(true)
    try {
      // Saving details always saves the request (gives an unsaved walk its Q-number).
      await updateQuoteRequest(quote.id, { ...payloadFromForm(form, isAdmin), keep: true })
      setEditing(false)
      onEditDone?.()
      onSaved()
    } catch (err) { toast.error(errMsg(err, t)) }
    finally { setSaving(false) }
  }

  return (
    <Card title={startEditing && editing ? t('quotes.capture.detailsTitle') : t('quotes.sections.details')}
      action={quote.can_edit && !editing && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>{t('quotes.actions.edit')}</Button>}>
      {editing ? (
        <div className="flex flex-col gap-4">
          <QuoteDetailsForm form={form} set={set} isAdmin={isAdmin} mode="edit" {...pickers} />
          <div className="grid grid-cols-2 sm:flex gap-2">
            <Button size="lg" onClick={save} loading={saving}>{t('quotes.actions.save')}</Button>
            <Button size="lg" variant="secondary" onClick={() => { setEditing(false); onEditDone?.() }}>{t('quotes.actions.discard')}</Button>
          </div>
        </div>
      ) : (
        <dl className="divide-y divide-gray-50">
          <DetailRow label={t('quotes.workType.label')}>
            {t(`quotes.workType.${quote.work_type}`)}{quote.project_number ? ` — #${quote.project_number}` : ''}
          </DetailRow>
          <DetailRow label={t('quotes.estimateType.label')}>{t(`quotes.estimateType.${quote.estimate_type}`)}</DetailRow>
          <DetailRow label={t('quotes.fields.recipients')}>
            {quote.recipients?.length ? (
              <span className="flex flex-col gap-0.5">
                {quote.recipients.map((r) => (
                  <span key={r.id}><span className="font-medium">{r.name}</span>{r.company ? ` · ${r.company}` : ''} <span className="text-gray-400">{r.email}</span></span>
                ))}
              </span>
            ) : null}
          </DetailRow>
          <DetailRow label={t('quotes.fields.facility')}>{quote.facility}</DetailRow>
          <DetailRow label={t('quotes.fields.locationDetail')}>{quote.location_detail}</DetailRow>
          <DetailRow label={t('quotes.fields.originalEstimate')}>{quote.original_estimate_no}</DetailRow>
          <DetailRow label={t('quotes.fields.relatedRef')}>{quote.related_ref}</DetailRow>
          <DetailRow label={t('quotes.fields.description')}>{quote.description}</DetailRow>
          <DetailRow label={t('quotes.priority.label')}>{quote.priority !== 'normal' ? t(`quotes.priority.${quote.priority}`) : null}</DetailRow>
          <DetailRow label={t('quotes.fields.neededBy')}>{fmtDate(quote.needed_by, lang)}</DetailRow>
          <DetailRow label={t('quotes.fields.siteVisitDate')}>{fmtDate(quote.site_visit_date, lang)}</DetailRow>
          <DetailRow label={t('quotes.fields.siteVisitAt')}>{fmtDateTime(quote.site_visit_at, lang)}</DetailRow>
          <DetailRow label={t('quotes.source.label')}>{quote.request_source ? t(`quotes.source.${quote.request_source}`) : null}</DetailRow>
          <DetailRow label={t('quotes.fields.fieldManager')}>{quote.field_manager_name}</DetailRow>
          <DetailRow label={t('quotes.fields.estimator')}>{quote.assigned_to_name}</DetailRow>
          <DetailRow label={t('quotes.fields.estimateNumber')}>{quote.estimate_number}</DetailRow>
          <DetailRow label={t('quotes.fields.createdBy')}>{`${quote.created_by_name} · ${fmtDateTime(quote.created_at, lang)}`}</DetailRow>
          {quote.status === 'declined' && isAdmin && <DetailRow label={t('quotes.status.declined')}>{quote.decline_reason}</DetailRow>}
        </dl>
      )}
    </Card>
  )
}

// ── Scope of Work (office only) ─────────────────────────────────────────
function ScopeCard({ quote, onSaved, loadIntoEditor }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [text, setText] = useState(quote.scope_text ?? '')
  const [saving, setSaving] = useState(false)
  const ref = useRef(null)
  const dirty = text !== (quote.scope_text ?? '')
  const editable = quote.can_edit_scope

  useEffect(() => { setText(quote.scope_text ?? '') }, [quote.scope_text])
  useEffect(() => {
    if (loadIntoEditor?.text != null) setText(loadIntoEditor.text)
  }, [loadIntoEditor])

  const save = async () => {
    setSaving(true)
    try {
      await updateQuoteRequest(quote.id, { scope_text: text })
      toast.success(t('quotes.scope.saved'))
      onSaved()
    } catch (err) { toast.error(errMsg(err, t)) }
    finally { setSaving(false) }
  }

  const copy = async () => {
    if (await copyText(text)) toast.success(t('quotes.scope.copied'))
    else toast.error(t('common.couldNotSave'))
  }

  // Inserts "• " at the start of the current line — phones have no bullet key.
  const insertBullet = () => {
    const el = ref.current
    if (!el) return
    const pos = el.selectionStart
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1
    const next = text.slice(0, lineStart) + '• ' + text.slice(lineStart)
    setText(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos + 2, pos + 2) })
  }

  return (
    <Card title={t('quotes.sections.scope')}
      action={text.trim() && <Button size="sm" onClick={copy}>{t('quotes.scope.copy')}</Button>}>
      {editable ? (
        <div className="flex flex-col gap-3">
          <textarea ref={ref} value={text} onChange={(e) => setText(e.target.value)} rows={18}
            placeholder={t('quotes.scope.placeholder')} spellCheck
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base lg:text-sm leading-relaxed font-mono outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          <p className="text-xs text-gray-500">{t('quotes.scope.hint')}</p>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            <Button size="lg" onClick={save} loading={saving} disabled={!dirty}>{t('quotes.scope.save')}</Button>
            <Button size="lg" variant="secondary" onClick={insertBullet}>{t('quotes.scope.insertBullet')}</Button>
            {dirty && <span className="col-span-2 text-center sm:text-left text-xs font-semibold text-amber-600">{t('quotes.scope.unsaved')}</span>}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {quote.scope_text
            ? <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-800 leading-relaxed">{quote.scope_text}</pre>
            : <p className="text-sm text-gray-400">{t('quotes.scope.empty')}</p>}
          {quote.scope_text && <p className="text-xs text-gray-400">{t('quotes.scope.locked')}</p>}
        </div>
      )}
    </Card>
  )
}

// ── Photos (the lead section, CompanyCam style) ──────────────────────────
function PhotosSection({ quote, canEdit, onChanged }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const uploader = usePhotoUploader(quote.id, { onUploaded: onChanged })
  const [viewing, setViewing] = useState(null)
  const count = quote.photos.length
  const notes = quote.notes ?? []
  // A walk captured on the walk sheet reads best the same way: notes beside
  // their photos (Cornell style). Older/admin requests without notes keep the
  // plain day-grouped gallery.
  const asSheet = notes.length > 0
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">
          {asSheet ? t('quotes.walk.title') : t('quotes.sections.photos')} <span className="text-gray-400 font-normal">({count})</span>
        </h2>
        {canEdit && quote.can_edit && (
          <button onClick={() => navigate(`/quotes/${quote.id}/capture`)}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white shadow-sm active:bg-brand-700">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.66-.89l.82-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.66.89l.82 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
            {t('quotes.walk.open')}
          </button>
        )}
      </div>
      {asSheet ? (
        <>
          <WalkNotesSheet notes={notes} photos={quote.photos} uploader={uploader} editable={false}
            onOpenPhoto={setViewing} summary={quote.description} />
          {viewing != null && (
            <PhotoViewer photos={quote.photos} startId={viewing} canEdit={canEdit} notes={notes}
              onChanged={onChanged} onClose={() => setViewing(null)} />
          )}
        </>
      ) : (
        <>
          {count === 0 && uploader.items.length === 0
            ? <p className="text-sm text-gray-400 text-center py-4">{t('quotes.photos.empty')}</p>
            : <PhotoGallery photos={quote.photos} uploader={uploader} canEdit={canEdit} onChanged={onChanged} />}
        </>
      )}
    </section>
  )
}

// ── Documents ────────────────────────────────────────────────────────────
function FilesCard({ quote, canEdit, onChanged }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirmDialog = useConfirm()
  const inputRef = useRef(null)
  const [kind, setKind] = useState('other')
  const [uploading, setUploading] = useState(false)

  const onFile = async (e) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    setUploading(true)
    for (const f of files) {
      try { await uploadQuoteFile(quote.id, f, kind) }
      catch (err) { toast.error(errMsg(err, t)) }
    }
    setUploading(false)
    onChanged()
  }
  const remove = async (f) => {
    if (!await confirmDialog(f.original_filename, { danger: true, confirmLabel: t('common.delete') })) return
    try { await deleteQuoteFile(f.id); onChanged() }
    catch (err) { toast.error(errMsg(err, t)) }
  }

  if (!canEdit && quote.files.length === 0) return null
  return (
    <Card title={t('quotes.sections.files')}>
      <div className="flex flex-col gap-3">
        {quote.files.length === 0 ? <p className="text-sm text-gray-400">{t('quotes.files.empty')}</p> : (
          <ul className="divide-y divide-gray-100">
            {quote.files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                <a href={f.url} target="_blank" rel="noreferrer" className="min-w-0">
                  <span className="block text-sm font-medium text-brand-700 hover:underline truncate">{f.original_filename}</span>
                  <span className="block text-xs text-gray-400">{t(`quotes.files.kind.${f.kind}`)} · {f.uploaded_by_name}</span>
                </a>
                {canEdit && <button onClick={() => remove(f)} className="text-sm font-semibold text-red-500 px-2 py-2 rounded-lg active:bg-red-50 hover:underline shrink-0">{t('common.delete')}</button>}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="flex flex-col sm:flex-row sm:items-end gap-2">
            <Select value={kind} onChange={setKind} className="sm:w-56">
              {FILE_KINDS.map((k) => <option key={k} value={k}>{t(`quotes.files.kind.${k}`)}</option>)}
            </Select>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={onFile} />
            <Button variant="secondary" size="lg" loading={uploading} onClick={() => inputRef.current?.click()} className="w-full sm:w-auto">{t('quotes.files.add')}</Button>
          </div>
        )}
      </div>
    </Card>
  )
}

// ── Comments ─────────────────────────────────────────────────────────────
function ThreadCard({ quote, onChanged }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!text.trim()) return
    setSending(true)
    try { await addQuoteComment(quote.id, text.trim()); setText(''); onChanged() }
    catch (err) { toast.error(errMsg(err, t)) }
    finally { setSending(false) }
  }

  const tone = { info_request: 'bg-amber-50 border-amber-200', info_response: 'bg-sky-50 border-sky-200', note: 'bg-gray-50 border-gray-100' }
  return (
    <Card title={t('quotes.sections.thread')}>
      <div className="flex flex-col gap-3">
        {quote.comments.length === 0 ? <p className="text-sm text-gray-400">{t('quotes.thread.empty')}</p> : quote.comments.map((c) => (
          <div key={c.id} className={`rounded-xl border px-3 py-2 ${tone[c.kind] ?? tone.note}`}>
            <p className="text-[11px] font-semibold text-gray-500">
              {c.kind === 'info_request' ? `${t('quotes.thread.infoRequest')} · ` : c.kind === 'info_response' ? `${t('quotes.thread.infoResponse')} · ` : ''}
              {c.author_name} · {fmtDateTime(c.created_at, i18n.language)}
            </p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap break-words mt-0.5">{c.body}</p>
          </div>
        ))}
        {quote.status !== 'cancelled' && (
          <div className="flex flex-col gap-2">
            <TextArea value={text} onChange={setText} rows={2} placeholder={t('quotes.thread.placeholder')} />
            <Button size="lg" className="w-full lg:w-auto lg:self-end" onClick={send} loading={sending} disabled={!text.trim()}>{t('quotes.thread.send')}</Button>
          </div>
        )}
      </div>
    </Card>
  )
}

// ── History ──────────────────────────────────────────────────────────────
function HistoryCard({ quote, isAdmin, onLoadVersion }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [viewing, setViewing] = useState(null)

  const view = async (v) => {
    try { const d = await getQuoteVersion(v.id); setViewing(d.version) }
    catch (err) { toast.error(errMsg(err, t)) }
  }

  return (
    <Card title={t('quotes.sections.activity')}>
      <ul className="flex flex-col gap-2">
        {quote.activity.map((a) => (
          <li key={a.id} className="text-sm">
            <span className="font-semibold text-gray-800">{t(`quotes.activity.${a.action}`, a.action)}</span>
            {a.note && <span className="text-gray-600"> — {a.note}</span>}
            <span className="block text-[11px] text-gray-400">{a.actor_name} · {fmtDateTime(a.created_at, i18n.language)}</span>
          </li>
        ))}
      </ul>

      {isAdmin && quote.versions?.length > 0 && (
        <div className="mt-5 pt-4 border-t border-gray-100">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('quotes.sections.versions')}</h3>
          <ul className="flex flex-col gap-1.5">
            {quote.versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-gray-800">{t(`quotes.versionKind.${v.kind}`)}</span>
                  <span className="text-gray-400 text-xs"> · {v.created_by_name} · {fmtDateTime(v.created_at, i18n.language)}</span>
                </span>
                <button onClick={() => view(v)} className="text-sm font-semibold text-brand-700 px-2 py-1.5 rounded-lg active:bg-brand-100 hover:underline shrink-0">{t('quotes.scope.viewVersion')}</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal isOpen={!!viewing} onClose={() => setViewing(null)} size="xl"
        title={viewing ? `${t(`quotes.versionKind.${viewing.kind}`)} · ${fmtDateTime(viewing.created_at, i18n.language)}` : ''}>
        {viewing && (
          <div className="flex flex-col gap-4">
            {viewing.scope_text
              ? <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-800 leading-relaxed max-h-[55vh] overflow-y-auto">{viewing.scope_text}</pre>
              : <p className="text-sm text-gray-400">{t('quotes.scope.empty')}</p>}
            {viewing.scope_text && quote.can_edit_scope && (
              <Button onClick={() => { onLoadVersion(viewing.scope_text); setViewing(null) }}>{t('quotes.scope.restore')}</Button>
            )}
          </div>
        )}
      </Modal>
    </Card>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function QuoteDetail() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const confirmDialog = useConfirm()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const pickers = useQuotePickers(isAdmin)

  const [quote, setQuote] = useState(null)
  const [error, setError] = useState(false)
  const [loadIntoEditor, setLoadIntoEditor] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  // ?edit=1 — arriving from the photo step of a new site walk.
  const startEditing = searchParams.get('edit') === '1' && !!quote?.can_edit

  const load = useCallback(() => {
    getQuoteRequest(id).then((d) => setQuote(d.quoteRequest)).catch(() => setError(true))
  }, [id])
  useEffect(load, [load])

  const canDelete = quote && (isAdmin || (quote.status === 'draft' && quote.created_by === user?.id))
  const handleDelete = async () => {
    if (!await confirmDialog(t('quotes.prompts.delete'), { danger: true, confirmLabel: t('quotes.actions.delete') })) return
    try { await deleteQuoteRequest(quote.id); navigate('/quotes', { replace: true }) }
    catch (err) { toast.error(errMsg(err, t)) }
  }

  if (error) return <Card><p className="text-sm text-gray-500">{t('quotes.noResults')}</p><Link to="/quotes" className="text-sm font-semibold text-brand-500">← {t('nav.quotes')}</Link></Card>
  if (!quote) return <div className="flex justify-center py-16"><Spinner size="lg" className="text-brand-500" /></div>

  const fieldReadOnly = !isAdmin && !quote.can_edit
  // Field managers can add photos/files exactly while they can edit; the
  // office until the request is closed.
  const canEditMedia = isAdmin ? !['accepted', 'declined', 'cancelled'].includes(quote.status) : quote.can_edit

  return (
    <div className="flex flex-col gap-4">
      <Link to="/quotes" className="text-sm font-semibold text-brand-500 hover:underline w-fit py-1">← {isAdmin ? t('nav.quotes') : t('nav.siteWalks')}</Link>

      <div className="flex flex-col items-center text-center gap-2 lg:items-start lg:text-left">
        <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2">
          <span className="text-xs font-bold text-gray-400 tracking-wide">{quote.request_no ?? t('quotes.unsaved')}{quote.estimate_number ? ` · #${quote.estimate_number}` : ''}</span>
          <StatusPill status={quote.status} />
          <FlagPills quote={quote} />
        </div>
        <h1 className="text-xl font-bold text-gray-900">{quote.title}</h1>
        {(quote.recipients?.length > 0 || quote.facility) && (
          <p className="text-sm text-gray-500">{[recipientsLabel(quote.recipients), quote.facility].filter(Boolean).join(' · ')}</p>
        )}
      </div>

      {!isAdmin && quote.status === 'needs_info' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('quotes.needsInfoBanner')}</div>
      )}
      {fieldReadOnly && quote.status !== 'cancelled' && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">{t('quotes.readOnlyField')}</div>
      )}
      {/* While filling in step 2 of a new site walk, the details form is the
          only thing to do — submit/delete come back once it's saved. */}
      {!startEditing && (
        <>
          {!isAdmin && quote.status === 'draft' && (
            <p className="text-xs text-gray-500 text-center lg:text-left">{t('quotes.submitHint')}</p>
          )}
          <ActionBar quote={quote} onDone={load} onDelete={handleDelete} canDelete={canDelete} />
        </>
      )}

      {!startEditing && <PhotosSection quote={quote} canEdit={canEditMedia} onChanged={load} />}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        <div className="lg:col-span-3 flex flex-col gap-4 min-w-0">
          <DetailsCard quote={quote} isAdmin={isAdmin} pickers={pickers} onSaved={load}
            startEditing={startEditing} onEditDone={() => setSearchParams({}, { replace: true })} />
          {isAdmin && <ScopeCard quote={quote} onSaved={load} loadIntoEditor={loadIntoEditor} />}
          <FilesCard quote={quote} canEdit={canEditMedia} onChanged={load} />
        </div>
        <div className="lg:col-span-2 flex flex-col gap-4 min-w-0">
          <ThreadCard quote={quote} onChanged={load} />
          <HistoryCard quote={quote} isAdmin={isAdmin} onLoadVersion={(text) => setLoadIntoEditor({ text, at: Date.now() })} />
        </div>
      </div>
    </div>
  )
}
