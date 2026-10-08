import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { useToast } from '../../components/ToastProvider'
import { useConfirm } from '../../components/ConfirmProvider'
import { useAuthStore } from '../../store/authStore'
import { getQuoteRequest, updateQuoteRequest, aiDraftEstimate } from '../../api/quoteRequests'
import { listLibrary } from '../../api/quoteLibrary'
import { generateScope, normalizeForm, toInvoiceToGoText, CATEGORY_KEYS } from '../../scope-engine'
import { formFromNotes } from '../../scope-engine/fromNotes'
import { useAutosave } from './photos/useAutosave'
import { Segmented } from './QuoteParts'
import VoiceRecorder from './voice/VoiceRecorder'
import VoiceMemoStack from './voice/VoiceMemoStack'
import { useVoiceMemos } from './voice/useVoiceMemos'
import { copyText } from './quoteUtils'

const LOCKED = ['approved', 'estimating', 'sent', 'accepted', 'declined', 'cancelled']
const PROTECT_SUGGESTIONS = ['flooring', 'walls', 'ceilings', 'solid ceiling', 'doors', 'window frames', 'countertops', 'fixtures', 'furniture', 'medical equipment', 'equipment', 'utilities']
const VERIFY_SUGGESTIONS = ['dimensions', 'existing conditions', 'wall construction', 'existing plumbing locations', 'existing utilities', 'substrate conditions', 'the extent of affected materials', 'mounting conditions', 'site conditions']

// First draft of the form from what the request already knows.
function seedForm(q) {
  const where = (q.location_detail ?? '').trim()
  return normalizeForm({
    title: q.title ?? '',
    locations: where,
    area: where ? `work area within ${where}` : 'work area',
  })
}

// ── Small inputs ────────────────────────────────────────────────────────
function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
    </label>
  )
}
const inputCls = 'w-full rounded-xl border border-gray-300 px-3 py-2.5 text-base lg:text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-50'
function Text({ value, onChange, disabled, placeholder, list }) {
  return <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} list={list} className={inputCls} />
}
function Check({ label, checked, onChange, disabled }) {
  return (
    <label className="flex items-center gap-2.5 py-1 text-sm text-gray-700 cursor-pointer">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled}
        className="w-5 h-5 rounded border-gray-300 text-brand-500 focus:ring-brand-400" />
      {label}
    </label>
  )
}

// Toggle chips from a suggestion list, plus free-typed extras.
function Chips({ value, onChange, suggestions, disabled, addLabel }) {
  const [extra, setExtra] = useState('')
  const all = [...new Set([...suggestions, ...value])]
  const toggle = (x) => onChange(value.includes(x) ? value.filter((v) => v !== x) : [...value, x])
  const add = () => { const v = extra.trim(); if (v && !value.includes(v)) onChange([...value, v]); setExtra('') }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {all.map((x) => (
          <button key={x} type="button" disabled={disabled} onClick={() => toggle(x)}
            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold border transition-colors ${
              value.includes(x) ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-600'
            }`}>{x}</button>
        ))}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <input value={extra} onChange={(e) => setExtra(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
            placeholder={addLabel} className={inputCls} />
          <Button variant="secondary" onClick={add} disabled={!extra.trim()}>+</Button>
        </div>
      )}
    </div>
  )
}

// ── Per-category settings ───────────────────────────────────────────────
function CategoryFields({ k, c, set, disabled, t, library }) {
  const s = (key) => (v) => set({ ...c, [key]: v })
  const seg = (key, opts) => (
    <Segmented value={c[key] ?? opts[0]} onChange={disabled ? () => {} : s(key)}
      options={opts.map((o) => ({ value: o, label: t(`quotes.est.opt.${k}.${key}.${o}`) }))} />
  )
  switch (k) {
    case 'itemRemoval': return (<>
      <Field label={t('quotes.est.f.item')}><Text value={c.item} onChange={s('item')} disabled={disabled} placeholder="bathtub" /></Field>
      <Check label={t('quotes.est.f.disconnectPlumbing')} checked={c.plumbing} onChange={s('plumbing')} disabled={disabled} />
    </>)
    case 'demo': return (<>
      {seg('mode', ['affected', 'wallboard'])}
      {(c.mode ?? 'affected') === 'affected' && (<>
        <Check label={t('quotes.est.f.wallDrywall')} checked={c.wallDrywall} onChange={s('wallDrywall')} disabled={disabled} />
        <Check label={t('quotes.est.f.insulation')} checked={c.insulation} onChange={s('insulation')} disabled={disabled} />
        <Check label={t('quotes.est.f.coveBase')} checked={c.coveBase} onChange={s('coveBase')} disabled={disabled} />
        <Check label={t('quotes.est.f.solidCeiling')} checked={c.solidCeiling} onChange={s('solidCeiling')} disabled={disabled} />
        <Field label={t('quotes.est.f.otherMaterial')}><Text value={c.other} onChange={s('other')} disabled={disabled} /></Field>
      </>)}
    </>)
    case 'plumbing': return seg('work', ['cap', 'reconnect'])
    case 'framing': return (<>
      <Field label={t('quotes.est.f.framingArea')}><Text value={c.area} onChange={s('area')} disabled={disabled} placeholder="former bathtub area" /></Field>
      <Field label={t('quotes.est.f.framingPurpose')}><Text value={c.purpose} onChange={s('purpose')} disabled={disabled} placeholder="storage space" /></Field>
    </>)
    case 'antimicrobial': return <p className="text-xs text-gray-500">{t('quotes.est.f.antimicrobialNote')}</p>
    case 'drywall': return (<>
      {seg('mode', ['new', 'replace', 'full'])}
      <Field label={t('quotes.est.f.drywallType')}>
        <select value={c.type ?? 'standard'} onChange={(e) => s('type')(e.target.value)} disabled={disabled} className={inputCls}>
          {['standard', 'mold-resistant', 'moisture-resistant', 'fire-rated'].map((x) => <option key={x} value={x}>{t(`quotes.est.opt.drywall.type.${x}`)}</option>)}
        </select>
      </Field>
      <Check label={t('quotes.est.f.newInsulation')} checked={c.insulation} onChange={s('insulation')} disabled={disabled} />
      <Check label={t('quotes.est.f.level5')} checked={Number(c.finishLevel) === 5} onChange={(v) => s('finishLevel')(v ? 5 : 4)} disabled={disabled} />
    </>)
    case 'ceiling': return <p className="text-xs text-gray-500">{t('quotes.est.f.ceilingNote')}</p>
    case 'windowFilm': return seg('film', ['frosted', 'tinted'])
    case 'window': return (<>
      {seg('kind', ['sliding', 'fixed'])}
      <div className="grid grid-cols-3 gap-2">
        <Field label={t('quotes.est.f.qty')}><Text value={c.qty ?? 1} onChange={(v) => s('qty')(v.replace(/\D/g, ''))} disabled={disabled} /></Field>
        <Field label={t('quotes.est.f.width')}><Text value={c.width} onChange={(v) => s('width')(v.replace(/[^\d.]/g, ''))} disabled={disabled} /></Field>
        <Field label={t('quotes.est.f.height')}><Text value={c.height} onChange={(v) => s('height')(v.replace(/[^\d.]/g, ''))} disabled={disabled} /></Field>
      </div>
      <Field label={t('quotes.est.f.glazing')}><Text value={c.glazing} onChange={s('glazing')} disabled={disabled} placeholder="frosted" /></Field>
      <Check label={t('quotes.est.f.approx')} checked={c.approx} onChange={s('approx')} disabled={disabled} />
      <Check label={t('quotes.est.f.touchUp')} checked={c.touchUp !== false} onChange={s('touchUp')} disabled={disabled} />
    </>)
    case 'painting': return (<>
      {seg('mode', ['match', 'full'])}
      <Field label={t('quotes.est.f.color')} hint={t('quotes.est.f.colorHint')}>
        <Text value={c.color} onChange={s('color')} disabled={disabled} list="lib-paint" />
      </Field>
      <datalist id="lib-paint">{library.filter((l) => l.kind === 'paint_color').map((l) => <option key={l.id} value={l.label} />)}</datalist>
      {c.mode === 'full' && <Check label={t('quotes.est.f.exteriorDoor')} checked={c.exteriorDoor} onChange={s('exteriorDoor')} disabled={disabled} />}
    </>)
    case 'coveBase': return (<>
      {seg('mode', ['match', 'new'])}
      {c.mode === 'new' && (<>
        <Field label={t('quotes.est.f.color')}><Text value={c.color} onChange={s('color')} disabled={disabled} list="lib-cove" /></Field>
        <datalist id="lib-cove">{library.filter((l) => l.kind === 'cove_base').map((l) => <option key={l.id} value={l.label} />)}</datalist>
      </>)}
    </>)
    case 'other': {
      const sections = c.sections?.length ? c.sections : [{ heading: '', bullets: [] }]
      const setSec = (i, patch) => set({ ...c, sections: sections.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
      return (<>
        {sections.map((sec, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-gray-100 p-2.5">
            <Field label={t('quotes.est.f.sectionHeading')}><Text value={sec.heading} onChange={(v) => setSec(i, { heading: v })} disabled={disabled} /></Field>
            <Field label={t('quotes.est.f.sectionBullets')}>
              <textarea value={(sec.bullets ?? []).join('\n')} onChange={(e) => setSec(i, { bullets: e.target.value.split('\n') })} disabled={disabled} rows={4} className={inputCls} />
            </Field>
          </div>
        ))}
        {!disabled && <Button variant="secondary" onClick={() => set({ ...c, sections: [...sections, { heading: '', bullets: [] }] })}>+ {t('quotes.est.f.addSection')}</Button>}
      </>)
    }
    default: return null
  }
}

// Sensible defaults when a category is first switched on.
const CATEGORY_DEFAULTS = {
  demo: { mode: 'affected', wallDrywall: true },
  plumbing: { work: 'cap' },
  drywall: { mode: 'new', type: 'standard', finishLevel: 4 },
  ceiling: { type: 'hard' },
  windowFilm: { film: 'frosted' },
  window: { kind: 'sliding', qty: 1, approx: true, touchUp: true },
  painting: { mode: 'match' },
  coveBase: { mode: 'match' },
}

// ── Page ────────────────────────────────────────────────────────────────
// The full JCCS estimate form for one request: structured answers on one
// side, the generated Scope of Work (live) on the other. Autosaves into the
// request's form_json; any time later, by the field manager or the office.
export default function EstimateForm() {
  const { id } = useParams()
  const { t } = useTranslation()
  const toast = useToast()
  const confirmDialog = useConfirm()
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin')
  const [quote, setQuote] = useState(null)
  const [form, setForm] = useState(null)
  const [library, setLibrary] = useState([])
  const [tab, setTab] = useState('form') // phones: form | preview
  const [saving, setSaving] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const voice = useVoiceMemos(id, () => load())

  const load = useCallback(() => getQuoteRequest(id).then((d) => {
    setQuote(d.quoteRequest)
    setForm((f) => f ?? (d.quoteRequest.form ? normalizeForm(d.quoteRequest.form) : seedForm(d.quoteRequest)))
  }), [id])
  useEffect(() => { load(); listLibrary().then((d) => setLibrary(d.items ?? [])).catch(() => {}) }, [load])

  const readOnly = !quote || !quote.can_edit || LOCKED.includes(quote.status)
  useAutosave(form, (v) => {
    if (!v || readOnly) return
    setSaving(true)
    updateQuoteRequest(id, { form: v })
      .catch((err) => toast.error(err?.response?.data?.error ?? t('common.couldNotSave')))
      .finally(() => setSaving(false))
  }, [readOnly])

  const g = useMemo(() => (form ? generateScope(form, { estimateType: quote?.estimate_type }) : null), [form, quote?.estimate_type])

  if (!quote || !form) return <div className="flex justify-center py-16"><Spinner size="lg" className="text-brand-500" /></div>

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setCat = (k, v) => setForm((f) => ({ ...f, cats: { ...f.cats, [k]: v } }))
  const toggleCat = (k) => {
    const c = form.cats[k]
    setCat(k, c.on ? { ...c, on: false } : { ...CATEGORY_DEFAULTS[k], ...c, on: true })
  }

  const copy = async (text) => {
    if (await copyText(text)) toast.success(t('quotes.est.copied'))
    else toast.error(t('common.couldNotSave'))
  }
  // Free, instant: recognize the work described in the walk's notes (runs in
  // the browser — no AI service, nothing charged).
  const autofillFromNotes = async () => {
    const started = CATEGORY_KEYS.some((k) => form.cats[k].on)
    if (started && !await confirmDialog(t('quotes.est.auto.replace'), { confirmLabel: t('quotes.est.auto.button') })) return
    const { form: draft, notes: remarks } = formFromNotes({
      notes: (quote.notes ?? []).map((n) => n.body).filter(Boolean),
      generalNotes: quote.description ?? '',
      title: quote.title,
      locationDetail: quote.location_detail ?? '',
      library,
    })
    setForm(normalizeForm({ ...draft, aiNotes: remarks.map((r) => `• ${r}`).join('\n'), aiDraftedAt: new Date().toISOString() }))
    toast.success(t('quotes.est.auto.done'))
  }

  // Claude reads the walk's notes + photos and fills the form. The answers
  // stay fully editable; its notes for the estimator are kept on the form.
  const draftWithAi = async () => {
    const started = CATEGORY_KEYS.some((k) => form.cats[k].on)
    if (started && !await confirmDialog(t('quotes.est.ai.replace'), { confirmLabel: t('quotes.est.ai.button') })) return
    setDrafting(true)
    try {
      const res = await aiDraftEstimate(id)
      setForm(normalizeForm({ ...res.form, aiNotes: res.office_notes, aiDraftedAt: new Date().toISOString() }))
      toast.success(t('quotes.est.ai.done', { count: res.photos_used }))
    } catch (err) {
      toast.error(err?.response?.data?.error ?? t('quotes.est.ai.failed'))
    } finally { setDrafting(false) }
  }

  const useAsScope = async () => {
    if (quote.scope_text && !await confirmDialog(t('quotes.est.replaceScope'), { confirmLabel: t('quotes.est.useAsScope') })) return
    try {
      await updateQuoteRequest(id, { scope_text: toInvoiceToGoText(g) })
      toast.success(t('quotes.scope.saved'))
      load()
    } catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }

  const general = (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-4">
      <h2 className="text-base font-semibold text-gray-900">{t('quotes.est.general')}</h2>
      <Field label={t('quotes.est.f.title')}><Text value={form.title} onChange={(v) => set('title', v)} disabled={readOnly} /></Field>
      <Field label={t('quotes.est.f.area')} hint={t('quotes.est.f.areaHint')}><Text value={form.area} onChange={(v) => set('area', v)} disabled={readOnly} /></Field>
      <Field label={t('quotes.est.f.locations')}><Text value={form.locations} onChange={(v) => set('locations', v)} disabled={readOnly} placeholder="Exam Rooms 7, 8, 9, and 10" /></Field>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-gray-700">{t('quotes.est.f.ic')}</span>
        <Segmented value={form.ic} onChange={readOnly ? () => {} : (v) => set('ic', v)}
          options={['none', 'limited', 'required'].map((x) => ({ value: x, label: t(`quotes.est.ic.${x}`) }))} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-gray-700">{t('quotes.est.f.protect')}</span>
        <Chips value={form.protect} onChange={(v) => set('protect', v)} suggestions={PROTECT_SUGGESTIONS} disabled={readOnly} addLabel={t('quotes.est.f.addOther')} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-gray-700">{t('quotes.est.f.verify')}</span>
        <Chips value={form.verify} onChange={(v) => set('verify', v)} suggestions={VERIFY_SUGGESTIONS} disabled={readOnly} addLabel={t('quotes.est.f.addOther')} />
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-gray-500">{t('quotes.est.more')}</summary>
        <div className="flex flex-col gap-3 pt-3">
          <Field label={t('quotes.est.f.allRooms')} hint={t('quotes.est.f.allRoomsHint')}><Text value={form.allRoomsPhrase} onChange={(v) => set('allRoomsPhrase', v)} disabled={readOnly} placeholder="all four exam rooms" /></Field>
          <Field label={t('quotes.est.f.leaveArea')}><Text value={form.leaveArea} onChange={(v) => set('leaveArea', v)} disabled={readOnly} /></Field>
        </div>
      </details>
    </section>
  )

  const noteNo = Object.fromEntries((quote.notes ?? []).map((n, i) => [n.id, i + 1]))
  const memos = (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">{t('quotes.voice.title')}</h2>
          <p className="text-xs text-gray-500">{t('quotes.voice.formHint')}</p>
        </div>
        {!readOnly && <VoiceRecorder onRecorded={(rec) => voice.add(rec, null)} />}
      </div>
      {(quote.audio ?? []).length === 0 && voice.pending.length === 0
        ? <p className="text-sm text-gray-400">{t('quotes.voice.empty')}</p>
        : <VoiceMemoStack memos={quote.audio ?? []} voice={voice} all editable={!readOnly}
            labelFor={(m) => (m.note_id && noteNo[m.note_id] ? t('quotes.walk.noteN', { n: noteNo[m.note_id] }) : t('quotes.walk.generalNotes'))} />}
    </section>
  )

  const scope = (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
      <h2 className="text-base font-semibold text-gray-900">{t('quotes.est.scope')}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {CATEGORY_KEYS.map((k) => (
          <button key={k} type="button" disabled={readOnly} onClick={() => toggleCat(k)}
            className={`rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
              form.cats[k].on ? 'border-brand-500 bg-brand-500 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-brand-400'
            }`}>
            {t(`quotes.est.cat.${k}`)}
          </button>
        ))}
      </div>
      {CATEGORY_KEYS.filter((k) => form.cats[k].on).map((k) => (
        <div key={k} className="rounded-xl border border-gray-200 p-3 flex flex-col gap-3">
          <p className="text-sm font-bold text-gray-900">{t(`quotes.est.cat.${k}`)}</p>
          <CategoryFields k={k} c={form.cats[k]} set={(v) => setCat(k, v)} disabled={readOnly} t={t} library={library} />
        </div>
      ))}
    </section>
  )

  const preview = (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900">{t('quotes.est.preview')}</h2>
        {saving && <Spinner size="sm" className="text-gray-300" />}
      </div>
      {(g.missing.length > 0 || g.warnings.length > 0) && (
        <ul className="flex flex-col gap-1">
          {g.missing.map((m) => <li key={m} className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">{t(`quotes.est.missing.${m}`)}</li>)}
          {g.warnings.map((w) => <li key={w} className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">{t(`quotes.est.warn.${w}`)}</li>)}
        </ul>
      )}
      <p className="text-sm font-bold text-gray-900">{g.title}</p>
      <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-800 leading-relaxed">{g.description}</pre>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => copy(g.title)} disabled={!g.title}>{t('quotes.est.copyTitle')}</Button>
        <Button variant="secondary" onClick={() => copy(g.description)}>{t('quotes.est.copyDescription')}</Button>
      </div>
      {isAdmin && !LOCKED.includes(quote.status) && (
        <Button onClick={useAsScope} disabled={g.missing.includes('scope')}>{t('quotes.est.useAsScope')}</Button>
      )}
    </section>
  )

  return (
    <div className="flex flex-col gap-4">
      <Link to={`/quotes/${id}`} className="text-sm font-semibold text-brand-500 hover:underline w-fit py-1">← {quote.request_no ?? t('quotes.unsaved')} · {quote.title}</Link>
      <div className="text-center lg:text-left">
        <h1 className="text-lg lg:text-xl font-bold text-gray-900">{t('quotes.est.title')}</h1>
        <p className="text-sm text-gray-500">{readOnly ? t('quotes.est.readOnly') : t('quotes.est.subtitle')}</p>
      </div>

      {!readOnly && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 flex flex-col gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-violet-900">{t('quotes.est.auto.title')}</p>
            <p className="text-xs text-violet-800/80">{drafting ? t('quotes.est.ai.working') : t('quotes.est.auto.hint')}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={autofillFromNotes} disabled={drafting} className="!bg-violet-600 hover:!bg-violet-500">
              {t('quotes.est.auto.button')}
            </Button>
            {/* Paid option — only when the server has an Anthropic key. */}
            {quote.ai_available && (
              <Button variant="secondary" onClick={draftWithAi} loading={drafting}>✨ {t('quotes.est.ai.button')}</Button>
            )}
          </div>
        </div>
      )}
      {form.aiNotes && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-1">{t('quotes.est.auto.notesTitle')}</p>
          <p className="text-sm text-amber-900 whitespace-pre-wrap">{form.aiNotes}</p>
        </div>
      )}

      <div className="lg:hidden grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
        {['form', 'preview'].map((k) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-lg py-2 text-sm font-semibold ${tab === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            {t(`quotes.est.tab.${k}`)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className={`flex flex-col gap-4 min-w-0 ${tab === 'form' ? '' : 'hidden lg:flex'}`}>{memos}{general}{scope}</div>
        <div className={`lg:sticky lg:top-4 min-w-0 ${tab === 'preview' ? '' : 'hidden lg:block'}`}>{preview}</div>
      </div>
    </div>
  )
}
