import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { useToast } from '../../components/ToastProvider'
import { updateQuoteRequest } from '../../api/quoteRequests'
import { createCustomer, updateCustomer } from '../../api/customers'
import { CompanyPicker, useClientList, rememberClient, searchClients, clientWhere } from './clients/ClientPicker'

const fold = (s) => (s ?? '').trim().toLowerCase()

// Before the photos: who the visit is for and where. The client is typed and
// picked from the list (a name that isn't on it becomes a new client); once
// picked, their company and location are filled in as suggestions that stay
// editable. Then the exact spot ("2nd floor, ER hallway").
export default function VisitStart({ quote, onCancel, onDone }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { clients } = useClientList()
  const [name, setName] = useState(quote.customer?.name ?? '')
  const [client, setClient] = useState(quote.customer ?? null)
  const [open, setOpen] = useState(false)
  const [company, setCompany] = useState(quote.customer?.company ?? '')
  const [location, setLocation] = useState(quote.facility || quote.customer?.location || '')
  const [detail, setDetail] = useState(quote.location_detail ?? '')
  const [suggested, setSuggested] = useState({}) // which fields came from the client
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const matches = client ? [] : searchClients(clients, name, 6)
  const exact = clients.find((c) => fold(c.name) === fold(name))
  const locations = [...new Set(clients.filter((c) => !company || c.company === company).map((c) => c.location).filter(Boolean))].sort()

  const pick = (c) => {
    setClient(c); setName(c.name); setOpen(false)
    // Their company and location, as editable suggestions.
    // No location of their own → the one place their company is known for.
    const places = [...new Set(clients.filter((o) => c.company && o.company === c.company).map((o) => o.location).filter(Boolean))]
    const place = c.location || (places.length === 1 ? places[0] : '')
    setCompany(c.company ?? '')
    if (place) setLocation(place)
    setSuggested({ company: !!c.company, location: !!place })
  }
  const typeName = (v) => {
    setName(v); setOpen(true)
    if (client && v !== client.name) { setClient(null); setSuggested({}) }
  }

  const next = async () => {
    if (!name.trim()) { setError(t('quotes.start.needClient')); return }
    if (!location.trim()) { setError(t('quotes.start.needLocation')); return }
    setSaving(true); setError('')
    try {
      // Typed a name that's on the list without tapping it → that client.
      let c = client ?? exact ?? null
      if (!c) {
        try {
          c = (await createCustomer({ name: name.trim(), company: company.trim(), location: location.trim() })).client
        } catch (err) {
          c = err?.response?.status === 409 ? err.response.data?.client : null
          if (!c) throw err
        }
      } else if ((company.trim() && company.trim() !== (c.company ?? '')) || (!c.location && location.trim())) {
        // The company belongs to the person, so a fix there updates the client;
        // their location is only filled in when they had none.
        c = (await updateCustomer(c.id, { company: company.trim() || c.company || '', location: c.location || location.trim() })).client
      }
      rememberClient(c)
      await updateQuoteRequest(quote.id, { customer_id: c.id, facility: location.trim(), location_detail: detail.trim() })
      onDone()
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
      toast.error(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setSaving(false) }
  }

  const hint = (key) => (suggested[key] ? <p className="text-xs text-brand-700">{t('quotes.start.suggested', { name: client?.name })}</p> : null)

  return (
    <div className="flex flex-col gap-5 w-full max-w-lg mx-auto">
      <div className="flex items-center justify-between gap-3">
        <button onClick={onCancel} className="text-sm font-semibold text-gray-500 py-2 pr-2">{t('common.cancel')}</button>
        <p className="text-sm font-bold text-gray-900">{t('quotes.start.title')}</p>
        <span className="w-14" />
      </div>

      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); next() }}>
        {/* Client: type-ahead over the list; a new name is added on Continue. */}
        <div className="flex flex-col gap-1 relative">
          <label htmlFor="start-client" className="text-sm font-medium text-gray-700">{t('quotes.clients.label')}</label>
          <input id="start-client" value={name} onChange={(e) => typeName(e.target.value)} autoFocus autoComplete="off"
            onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={t('quotes.start.clientPlaceholder')} enterKeyHint="next"
            onKeyDown={(e) => { if (e.key === 'Enter' && open && matches[0] && !client) { e.preventDefault(); pick(matches[0]) } }}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          {open && !client && name.trim() && (
            <div className="absolute top-full z-30 mt-1 w-full rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden max-h-72 overflow-y-auto">
              {matches.map((c) => (
                <button key={c.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 border-b border-gray-50">
                  <span className="block text-sm font-semibold text-gray-900">{c.name}</span>
                  {clientWhere(c) && <span className="block text-xs text-gray-400 truncate">{clientWhere(c)}</span>}
                </button>
              ))}
              {!exact && (
                <p className="px-4 py-2.5 text-sm text-brand-700 font-semibold">+ {t('quotes.start.willAdd', { name: name.trim() })}</p>
              )}
            </div>
          )}
          {client
            ? <p className="text-xs text-gray-500">{t('quotes.start.onList')}</p>
            : name.trim() && !exact && !open && <p className="text-xs text-gray-500">{t('quotes.start.newClient')}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <CompanyPicker label={t('quotes.clients.company')} value={company} placeholder={t('quotes.clients.companyPlaceholder')}
            onChange={(v) => { setCompany(v); setSuggested((s) => ({ ...s, company: false })) }} />
          {hint('company')}
        </div>

        <div className="flex flex-col gap-1">
          <Input label={t('quotes.start.location')} value={location} placeholder={t('quotes.fields.facilityPlaceholder')}
            onChange={(e) => { setLocation(e.target.value); setSuggested((s) => ({ ...s, location: false })) }}
            autoComplete="off" list="start-locations" />
          <datalist id="start-locations">{locations.map((l) => <option key={l} value={l} />)}</datalist>
          {hint('location')}
        </div>

        <Input label={t('quotes.start.detail')} value={detail} onChange={(e) => setDetail(e.target.value)}
          placeholder={t('quotes.start.detailPlaceholder')} autoComplete="off" />

        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={saving}
          className="w-full rounded-2xl bg-brand-500 py-4 text-lg font-bold text-white shadow-lg active:bg-brand-700 disabled:opacity-60">
          {saving ? <Spinner size="sm" className="text-white inline" /> : `${t('quotes.start.next')} →`}
        </button>
      </form>
    </div>
  )
}
