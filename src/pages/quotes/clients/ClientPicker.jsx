import { useEffect, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../../../components/ui/Modal'
import Input from '../../../components/ui/Input'
import Button from '../../../components/ui/Button'
import { useToast } from '../../../components/ToastProvider'
import { listCustomers, createCustomer, updateCustomer } from '../../../api/customers'

// ── Shared client list ─────────────────────────────────────────────────────
// Loaded once and shared by every picker on screen, so a client added from a
// site visit shows up everywhere right away.
let store = { clients: [], loaded: false }
const listeners = new Set()
let loading = null
const emit = (next) => { store = next; listeners.forEach((l) => l()) }

export function reloadClients() {
  loading = listCustomers()
    .then((d) => emit({ clients: d.clients ?? [], loaded: true }))
    .catch(() => emit({ ...store, loaded: true }))
    .finally(() => { loading = null })
  return loading
}
export function rememberClient(c) {
  const rest = store.clients.filter((x) => x.id !== c.id)
  emit({ ...store, clients: [...rest, c].sort((a, b) => a.name.localeCompare(b.name)) })
}

export function useClientList() {
  const snap = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => store)
  useEffect(() => { if (!store.loaded && !loading) reloadClients() }, [])
  return snap
}

const fold = (s) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const digits = (s) => (s ?? '').replace(/\D/g, '')

export function searchClients(clients, query, limit = 8) {
  const q = fold(query.trim())
  if (!q) return []
  const qd = digits(q)
  const score = (c) => {
    const name = fold(c.name)
    if (name.startsWith(q)) return 0
    if (name.split(/\s+/).some((w) => w.startsWith(q))) return 1
    if (name.includes(q) || fold(c.contact_name).includes(q)) return 2
    if (fold(c.email).includes(q) || fold(c.address).includes(q)) return 3
    if (qd.length >= 3 && (digits(c.phone).includes(qd) || digits(c.mobile).includes(qd))) return 3
    return -1
  }
  return clients.map((c) => [score(c), c]).filter(([s]) => s >= 0)
    .sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, limit).map(([, c]) => c)
}

// ── Client card: everything you need on site, one tap to call/email/map ──
const mapsUrl = (address) => `https://maps.apple.com/?q=${encodeURIComponent(address.replace(/\n/g, ', '))}`

export function ClientCard({ client, onChange, onEdit, onClear, compact = false }) {
  const { t } = useTranslation()
  const link = 'text-brand-700 font-medium underline-offset-2 active:underline'
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3.5 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-bold text-gray-900 leading-tight">{client.name}</p>
          {client.contact_name && <p className="text-sm text-gray-500">{client.contact_name}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          {onEdit && <button type="button" onClick={onEdit} className="rounded-full px-3 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 active:bg-gray-200">{t('quotes.clients.edit')}</button>}
          {onChange && <button type="button" onClick={onChange} className="rounded-full px-3 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 active:bg-gray-200">{t('quotes.clients.change')}</button>}
          {onClear && (
            <button type="button" onClick={onClear} aria-label={t('common.delete')}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100">×</button>
          )}
        </div>
      </div>
      {!compact && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          {client.phone && (<><dt className="text-gray-400">{t('quotes.clients.phone')}</dt><dd><a className={link} href={`tel:${client.phone}`}>{client.phone}</a></dd></>)}
          {client.mobile && (<><dt className="text-gray-400">{t('quotes.clients.mobile')}</dt><dd><a className={link} href={`tel:${client.mobile}`}>{client.mobile}</a></dd></>)}
          {client.email && (<><dt className="text-gray-400">{t('quotes.clients.email')}</dt><dd className="truncate"><a className={link} href={`mailto:${client.email}`}>{client.email}</a></dd></>)}
          {client.address && (<><dt className="text-gray-400">{t('quotes.clients.address')}</dt>
            <dd><a className={`${link} whitespace-pre-line`} href={mapsUrl(client.address)} target="_blank" rel="noreferrer">{client.address}</a></dd></>)}
          {client.ship_address && (<><dt className="text-gray-400">{t('quotes.clients.shipAddress')}</dt>
            <dd><a className={`${link} whitespace-pre-line`} href={mapsUrl(client.ship_address)} target="_blank" rel="noreferrer">{client.ship_address}</a></dd></>)}
          {client.notes && (<><dt className="text-gray-400">{t('quotes.clients.notes')}</dt><dd className="text-gray-700 whitespace-pre-line">{client.notes}</dd></>)}
        </dl>
      )}
    </div>
  )
}

function TextArea({ label, value, onChange, rows }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <textarea value={value ?? ''} onChange={onChange} rows={rows}
        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
    </div>
  )
}

// ── Add / edit a client (the same fields InvoiceToGo keeps) ───────────────
const EMPTY = { name: '', contact_name: '', email: '', phone: '', mobile: '', address: '', ship_address: '', notes: '' }

export function ClientFormModal({ client, initialName = '', onClose, onSaved }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [form, setForm] = useState(() => client
    ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, client[k] ?? '']))
    : { ...EMPTY, name: initialName })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showShip, setShowShip] = useState(!!client?.ship_address)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }))

  const save = async () => {
    if (!form.name.trim()) { setError(t('quotes.clients.nameRequired')); return }
    setSaving(true); setError('')
    try {
      const res = client ? await updateCustomer(client.id, form) : await createCustomer(form)
      rememberClient(res.client)
      toast.success(client ? t('quotes.clients.saved') : t('quotes.clients.added'))
      onSaved?.(res.client)
    } catch (err) {
      // Already on the list → just use that one.
      const existing = err?.response?.status === 409 ? err.response.data?.client : null
      if (existing) { rememberClient(existing); toast.success(t('quotes.clients.alreadyThere')); onSaved?.(existing); return }
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setSaving(false) }
  }

  return (
    <Modal isOpen onClose={onClose} title={client ? t('quotes.clients.editTitle') : t('quotes.clients.newTitle')}>
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save() }}>
        <Input label={t('quotes.clients.name')} value={form.name} onChange={set('name')} autoFocus={!client}
          placeholder={t('quotes.clients.namePlaceholder')} error={error || undefined} autoComplete="off" />
        <Input label={t('quotes.clients.contact')} value={form.contact_name} onChange={set('contact_name')} autoComplete="off" />
        <Input label={t('quotes.clients.email')} type="email" inputMode="email" value={form.email} onChange={set('email')} autoComplete="off" />
        <div className="grid grid-cols-2 gap-3">
          <Input label={t('quotes.clients.phone')} type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} autoComplete="off" />
          <Input label={t('quotes.clients.mobile')} type="tel" inputMode="tel" value={form.mobile} onChange={set('mobile')} autoComplete="off" />
        </div>
        <TextArea label={t('quotes.clients.billingAddress')} rows={3} value={form.address} onChange={set('address')} />
        {showShip ? (
          <TextArea label={t('quotes.clients.shipAddress')} rows={3} value={form.ship_address} onChange={set('ship_address')} />
        ) : (
          <button type="button" onClick={() => setShowShip(true)} className="self-start text-sm font-semibold text-brand-700">
            + {t('quotes.clients.addShipAddress')}
          </button>
        )}
        <TextArea label={t('quotes.clients.notes')} rows={2} value={form.notes} onChange={set('notes')} />
        <Button type="submit" size="lg" fullWidth loading={saving}>{t('quotes.actions.save')}</Button>
      </form>
    </Modal>
  )
}

// ── Type-ahead picker ──────────────────────────────────────────────────────
// Start typing → matching clients; nothing matches → add it as a new client
// right there. Once picked, shows the client's card.
export function ClientPicker({ value, onChange, label, autoFocus = false }) {
  const { t } = useTranslation()
  const { clients, loaded } = useClientList()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(null) // initial name for the new-client form
  const [editing, setEditing] = useState(false)
  const selected = value ? clients.find((c) => c.id === value) : null
  const matches = searchClients(clients, q)
  const pick = (c) => { onChange(c.id, c); setQ('') }

  return (
    <div className="flex flex-col gap-1.5">
      {label !== false && <label className="text-sm font-medium text-gray-700">{label ?? t('quotes.clients.label')}</label>}
      {selected ? (
        <ClientCard client={selected} onEdit={() => setEditing(true)} onClear={() => onChange(null, null)} />
      ) : value && !loaded ? (
        <div className="h-14 rounded-2xl bg-gray-100 animate-pulse" />
      ) : (
        <div className="relative">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} autoComplete="off"
            placeholder={t('quotes.clients.search')} enterKeyHint="search"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (matches[0]) pick(matches[0]); else if (q.trim()) setAdding(q.trim()) } }}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          {q.trim() && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden">
              {matches.map((c) => (
                <button key={c.id} type="button" onClick={() => pick(c)}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 border-b border-gray-50">
                  <span className="block text-sm font-semibold text-gray-900">{c.name}{c.contact_name ? <span className="font-normal text-gray-500"> · {c.contact_name}</span> : null}</span>
                  <span className="block text-xs text-gray-400 truncate">{[c.phone || c.mobile, c.email, c.address?.split('\n')[0]].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
              <button type="button" onClick={() => setAdding(q.trim())}
                className="w-full text-left px-4 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-100/40 active:bg-brand-100">
                + {t('quotes.clients.addNamed', { name: q.trim() })}
              </button>
            </div>
          )}
          {!q.trim() && (
            <button type="button" onClick={() => setAdding('')} className="mt-1.5 text-sm font-semibold text-brand-700">
              + {t('quotes.clients.new')}
            </button>
          )}
        </div>
      )}
      {adding !== null && (
        <ClientFormModal initialName={adding} onClose={() => setAdding(null)}
          onSaved={(c) => { setAdding(null); pick(c) }} />
      )}
      {editing && selected && (
        <ClientFormModal client={selected} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
      )}
    </div>
  )
}
