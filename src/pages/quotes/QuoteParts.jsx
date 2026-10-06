import { useTranslation } from 'react-i18next'
import Input from '../../components/ui/Input'
import { STATUS_STYLES, FLAG_STYLES, quoteFlags, ESTIMATE_TYPES, SOURCES, PRIORITIES } from './quoteUtils'

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

// The request's header fields. Used by the "new request" modal and the
// detail page's edit mode alike.
export function QuoteDetailsForm({ form, set, isAdmin, customers = [], projects = [], staff = [], mode = 'create' }) {
  const { t } = useTranslation()
  const customer = customers.find((c) => String(c.id) === String(form.customer_id))
  const contacts = customer?.contacts ?? []

  const pickCustomer = (id) => {
    set('customer_id', id)
    set('contact_id', '')
  }
  const pickProject = (pn) => {
    set('project_number', pn)
    const p = projects.find((x) => x.project_number === pn)
    if (p && !form.title) set('title', p.name)
  }
  const setWorkType = (wt) => {
    set('work_type', wt)
    if (wt === 'addon' && form.estimate_type === 'standard') set('estimate_type', 'addon')
    if (wt === 'new' && form.estimate_type === 'addon') set('estimate_type', 'standard')
  }

  return (
    <div className="flex flex-col gap-4">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label={t('quotes.fields.customer')} value={form.customer_id} onChange={pickCustomer}>
          <option value="">{t('quotes.fields.noCustomer')}</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select label={t('quotes.fields.contact')} value={form.contact_id} onChange={(v) => set('contact_id', v)} disabled={!contacts.length}>
          <option value="">{t('quotes.fields.noContact')}</option>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.title ? ` — ${c.title}` : ''}</option>)}
        </Select>
      </div>

      <Input label={t('quotes.fields.facility')} placeholder={t('quotes.fields.facilityPlaceholder')} value={form.facility ?? ''}
        onChange={(e) => set('facility', e.target.value)} />
      <Input label={t('quotes.fields.locationDetail')} value={form.location_detail ?? ''}
        onChange={(e) => set('location_detail', e.target.value)} />

      <TextArea label={t('quotes.fields.description')} placeholder={t('quotes.fields.descriptionPlaceholder')} rows={5}
        value={form.description} onChange={(v) => set('description', v)}
        helperText={!customers.length || !form.customer_id ? t('quotes.fields.customerFreeText') : undefined} />

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
