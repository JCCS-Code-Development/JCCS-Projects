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

export function searchClients(clients, query, limit = 8) {
  const q = fold(query.trim())
  if (!q) return []
  const score = (c) => {
    const name = fold(c.name)
    if (name.startsWith(q)) return 0
    if (name.split(/\s+/).some((w) => w.startsWith(q))) return 1
    if (name.includes(q)) return 2
    if (fold(c.email).includes(q)) return 3
    return -1
  }
  return clients.map((c) => [score(c), c]).filter(([s]) => s >= 0)
    .sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, limit).map(([, c]) => c)
}

// ── Client card: name + email (tap to write to them) ──────────────────────
export function ClientCard({ client, onChange, onEdit, onClear }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3.5 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-base font-bold text-gray-900 leading-tight">{client.name}</p>
        {client.email
          ? <a href={`mailto:${client.email}`} className="block truncate text-sm font-medium text-brand-700 underline-offset-2 active:underline">{client.email}</a>
          : <p className="text-sm text-gray-400">{t('quotes.clients.noEmail')}</p>}
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
  )
}

// ── Add / edit a client (the same fields InvoiceToGo keeps) ───────────────
export function ClientFormModal({ client, initialName = '', onClose, onSaved }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [name, setName] = useState(client?.name ?? initialName)
  const [email, setEmail] = useState(client?.email ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (!name.trim()) { setError(t('quotes.clients.nameRequired')); return }
    setSaving(true); setError('')
    try {
      const payload = { name, email }
      const res = client ? await updateCustomer(client.id, payload) : await createCustomer(payload)
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
        <Input label={t('quotes.clients.name')} value={name} onChange={(e) => setName(e.target.value)} autoFocus={!client}
          placeholder={t('quotes.clients.namePlaceholder')} autoComplete="off" />
        <Input label={t('quotes.clients.email')} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)}
          autoComplete="off" autoCapitalize="none" helperText={t('quotes.clients.emailHint')} />
        {error && <p className="text-xs text-red-500">{error}</p>}
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
                  <span className="block text-sm font-semibold text-gray-900">{c.name}</span>
                  {c.email && <span className="block text-xs text-gray-400 truncate">{c.email}</span>}
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
