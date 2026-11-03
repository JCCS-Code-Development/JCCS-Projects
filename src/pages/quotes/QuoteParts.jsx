import { useTranslation } from 'react-i18next'
import { listProjectClientIds } from '../../api/quoteRequests'
import Input from '../../components/ui/Input'
import { STATUS_STYLES, FLAG_STYLES, quoteFlags, ESTIMATE_TYPES, SOURCES, PRIORITIES } from './quoteUtils'
import { ClientPicker } from './clients/ClientPicker'

export function StatusPill({ status, className = '' }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600'} ${className}`}>
      {t(`quotes.status.${status}`)}
    </span>
  )
}

export function FlagPills({ quote }) {
  const { t } = useTranslation()
  const flags = quoteFlags(quote)
  if (!flags.length) return null
  return flags.map((f) => (
    <span key={f} className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${FLAG_STYLES[f]}`}>
      {t(`quotes.${f}`)}
    </span>
  ))
}

const WHO_ICONS = {
  client:    'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  company:   'M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1M9 13h1m4 0h1M9 17h1m4 0h1',
  location:  'M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11zm0-8.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  estimator: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
}

// Who and where a quote is for — the same four lines on the board cards and
// the quote page: client, their company, location, estimator. Missing ones
// say so, so the office can see at a glance what still needs filling in.
export function QuoteWho({ client, company, location, estimator, className = '' }) {
  const { t } = useTranslation()
  const rows = [
    ['client', client, t('quotes.who.noClient')],
    ['company', company, t('quotes.who.noCompany')],
    ['location', location, t('quotes.who.noLocation')],
    ['estimator', estimator, t('quotes.who.noEstimator')],
  ]
  return (
    <dl className={`flex flex-col gap-0.5 text-[13px] min-w-0 ${className}`}>
      {rows.map(([key, value, missing]) => (
        <div key={key} className="flex items-center gap-1.5 min-w-0">
          <dt className="shrink-0" title={t(`quotes.who.${key}`)}>
            <span className="sr-only">{t(`quotes.who.${key}`)}</span>
            <svg className={`w-3.5 h-3.5 ${value ? 'text-brand-700' : 'text-gray-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={WHO_ICONS[key]} />
            </svg>
          </dt>
          <dd className={`truncate ${value ? (key === 'client' ? 'font-bold text-gray-900' : 'text-gray-700') : 'text-gray-400 italic'}`}>{value || missing}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Select({ label, value, onChange, children, className = '', disabled }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-50 disabled:text-gray-400">
        {children}
      </select>
    </div>
  )
}

export function TextArea({ label, value, onChange, rows = 4, placeholder, className = '', helperText }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder}
        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
      {helperText && <p className="text-xs text-gray-500">{helperText}</p>}
    </div>
  )
}

// Big two-way toggle, sized for thumbs on a job site.
export function Segmented({ value, onChange, options }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${
            value === o.value ? 'border-brand-500 bg-brand-500 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// With PO → the office writes an estimate first. No PO → it gets scheduled,
// done, and invoiced at the end. Big and first: it decides what happens next.
function BillingChoice({ value, onChange, locked }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">{t('quotes.billing.label')}</label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {['po', 'no_po'].map((k) => {
          const on = value === k
          return (
            <button key={k} type="button" disabled={locked && !on} onClick={() => !locked && onChange(k)} aria-pressed={on}
              className={`rounded-2xl border-2 px-4 py-3 text-left transition-colors ${
                on ? 'border-brand-500 bg-brand-100/50' : 'border-gray-200 bg-white active:bg-gray-50'} ${locked && !on ? 'opacity-40' : ''}`}>
              <span className="flex items-center gap-2">
                <span className={`w-4 h-4 shrink-0 rounded-full border-2 ${on ? 'border-brand-500 bg-brand-500 shadow-[inset_0_0_0_2px_white]' : 'border-gray-300'}`} />
                <span className="text-sm font-bold text-gray-900">{t(`quotes.billing.${k}`)}</span>
              </span>
              <span className="block pl-6 text-xs text-gray-500">{t(`quotes.billing.${k}Hint`)}</span>
            </button>
          )
        })}
      </div>
      {locked && <p className="text-xs text-gray-400">{t('quotes.billing.locked')}</p>}
    </div>
  )
}

export function QuoteDetailsForm({ form, set, isAdmin, clients = [], projects = [], staff = [], mode = 'create', billingLocked = false }) {
  const { t } = useTranslation()

  // Picking the project of an add-on pre-selects everyone who already has
  // portal access to it — they're who gets the add-on estimate.
  const pickProject = (pn) => {
    set('project_number', pn)
    const p = projects.find((x) => x.project_number === pn)
    if (p && !form.title) set('title', p.name)
    if (pn) {
      listProjectClientIds(pn).then((d) => {
        const ids = (d.client_ids ?? []).filter((id) => clients.some((c) => c.id === id))
        if (ids.length) set('recipient_ids', [...new Set([...(form.recipient_ids ?? []), ...ids])])
      }).catch(() => {})
    }
  }
  const setWorkType = (wt) => {
    set('work_type', wt)
    if (wt === 'addon' && form.estimate_type === 'standard') set('estimate_type', 'addon')
    if (wt === 'new' && form.estimate_type === 'addon') set('estimate_type', 'standard')
  }

  return (
    <div className="flex flex-col gap-4">
      <BillingChoice value={form.billing ?? 'po'} onChange={(v) => set('billing', v)} locked={billingLocked} />

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">{t('quotes.workType.label')}</label>
        <Segmented value={form.work_type} onChange={setWorkType}
          options={[{ value: 'new', label: t('quotes.workType.new') }, { value: 'addon', label: t('quotes.workType.addon') }]} />
      </div>

      {form.work_type === 'addon' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label={t('quotes.fields.project')} value={form.project_number} onChange={pickProject}>
            <option value="">{t('quotes.fields.pickProject')}</option>
            {projects.map((p) => <option key={p.project_number} value={p.project_number}>#{p.project_number} — {p.name}</option>)}
          </Select>
          <Input label={t('quotes.fields.originalEstimate')} value={form.original_estimate_no ?? ''} inputMode="numeric"
            onChange={(e) => set('original_estimate_no', e.target.value)} />
          <Input label={t('quotes.fields.relatedRef')} value={form.related_ref ?? ''} className="sm:col-span-2"
            onChange={(e) => set('related_ref', e.target.value)} />
        </div>
      )}

      <Input label={t('quotes.fields.title')} placeholder={t('quotes.fields.titlePlaceholder')} value={form.title}
        onChange={(e) => set('title', e.target.value)} />

      {/* Picking the client fills in where they work when the place is still empty. */}
      <ClientPicker value={form.customer_id} defaults={{ location: form.facility }}
        onChange={(id, c) => {
          set('customer_id', id)
          if (c?.location && !form.facility) set('facility', c.location)
        }} />


      <Input label={t('quotes.fields.facility')} placeholder={t('quotes.fields.facilityPlaceholder')} value={form.facility ?? ''}
        onChange={(e) => set('facility', e.target.value)} />
      <Input label={t('quotes.fields.locationDetail')} value={form.location_detail ?? ''}
        onChange={(e) => set('location_detail', e.target.value)} />

      <TextArea label={t('quotes.fields.description')} placeholder={t('quotes.fields.descriptionPlaceholder')} rows={5}
        value={form.description} onChange={(v) => set('description', v)} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label={t('quotes.estimateType.label')} value={form.estimate_type} onChange={(v) => set('estimate_type', v)}>
          {ESTIMATE_TYPES.map((et) => <option key={et} value={et}>{t(`quotes.estimateType.${et}`)}</option>)}
        </Select>
        <Select label={t('quotes.priority.label')} value={form.priority} onChange={(v) => set('priority', v)}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{t(`quotes.priority.${p}`)}</option>)}
        </Select>
        <Input label={t('quotes.fields.neededBy')} type="date" value={form.needed_by ?? ''} onChange={(e) => set('needed_by', e.target.value)} />
        <Input label={t('quotes.fields.siteVisitDate')} type="date" value={form.site_visit_date ?? ''} onChange={(e) => set('site_visit_date', e.target.value)} />
        <Select label={t('quotes.source.label')} value={form.request_source} onChange={(v) => set('request_source', v)}>
          <option value="">—</option>
          {SOURCES.map((s) => <option key={s} value={s}>{t(`quotes.source.${s}`)}</option>)}
        </Select>
      </div>

      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-gray-100 pt-4">
          <Select label={t('quotes.fields.fieldManager')} value={form.field_manager_id} onChange={(v) => set('field_manager_id', v)}>
            <option value="">{t('quotes.fields.unassigned')}</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.role === 'admin' ? ` (${t('role.admin')})` : ''}</option>)}
          </Select>
          <Select label={t('quotes.fields.estimator')} value={form.assigned_to} onChange={(v) => set('assigned_to', v)}>
            <option value="">{t('quotes.fields.unassigned')}</option>
            {staff.filter((s) => s.role === 'admin').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          {mode === 'edit' && (
            <>
              <Input label={t('quotes.fields.siteVisitAt')} type="datetime-local" value={form.site_visit_at ?? ''}
                onChange={(e) => set('site_visit_at', e.target.value)} />
              <Input label={t('quotes.fields.followUpDays')} type="number" min={1} max={90} value={form.follow_up_days ?? 7}
                onChange={(e) => set('follow_up_days', e.target.value === '' ? '' : Number(e.target.value))} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
