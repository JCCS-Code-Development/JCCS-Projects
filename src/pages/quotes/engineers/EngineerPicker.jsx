import { useEffect, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../../../components/ui/Modal'
import Input from '../../../components/ui/Input'
import Button from '../../../components/ui/Button'
import { useToast } from '../../../components/ToastProvider'
import { listEngineers, createEngineer, updateEngineer } from '../../../api/engineers'
import { ClientPicker } from '../clients/ClientPicker'

// ── Shared engineer list ───────────────────────────────────────────────────
// Loaded once and shared by every picker on screen, like the client list.
let store = { engineers: [], loaded: false }
const listeners = new Set()
let loading = null
const emit = (next) => { store = next; listeners.forEach((l) => l()) }

export function reloadEngineers() {
  loading = listEngineers()
    .then((d) => emit({ engineers: d.engineers ?? [], loaded: true }))
    .catch(() => emit({ ...store, loaded: true }))
    .finally(() => { loading = null })
  return loading
}
export function rememberEngineer(e) {
  const rest = store.engineers.filter((x) => x.id !== e.id)
  emit({ ...store, engineers: [...rest, e].sort((a, b) => a.name.localeCompare(b.name)) })
}

export function useEngineerList() {
  const snap = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => store)
  useEffect(() => { if (!store.loaded && !loading) reloadEngineers() }, [])
  return snap
}

const fold = (s) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Name first, then company / location — "prisma" finds everyone at Prisma.
export function searchEngineers(engineers, query, limit = 8) {
  const q = fold(query.trim())
  if (!q) return []
  const score = (e) => {
    const name = fold(e.name)
    if (name.startsWith(q)) return 0
    if (name.split(/\s+/).some((w) => w.startsWith(q))) return 1
    if (name.includes(q)) return 2
    if (fold(e.company).includes(q) || fold(e.location).includes(q)) return 3
    if (fold(e.email).includes(q)) return 4
    return -1
  }
  return engineers.map((e) => [score(e), e]).filter(([s]) => s >= 0)
    .sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, limit).map(([, e]) => e)
}

// "Company · Location" under the engineer's name.
export const engineerWhere = (e) => [e?.company, e?.location].filter(Boolean).join(' · ')

// ── Engineer card: name, company · location, email / phone ────────────────
export function EngineerCard({ engineer, onChange, onEdit, onClear }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3.5 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-base font-bold text-gray-900 leading-tight">
          {engineer.name}{engineer.title && <span className="ml-1.5 text-xs font-semibold text-gray-400">{engineer.title}</span>}
        </p>
        <p className={`text-sm truncate ${engineer.company ? 'font-semibold text-gray-700' : 'text-gray-400'}`}>{engineer.company || t('quotes.engineers.noCompany')}</p>
        {engineer.location && <p className="text-sm text-gray-500">{engineer.location}</p>}
        {(engineer.email || engineer.phone) && (
          <p className="flex flex-wrap gap-x-3 text-sm font-medium text-brand-700">
            {engineer.email && <a href={`mailto:${engineer.email}`} className="truncate underline-offset-2 active:underline">{engineer.email}</a>}
            {engineer.phone && <a href={`tel:${engineer.phone}`} className="underline-offset-2 active:underline">{engineer.phone}</a>}
          </p>
        )}
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

// ── Add / edit an engineer ─────────────────────────────────────────────────
// `defaults` pre-fills a new one (e.g. the quote's company and place).
export function EngineerFormModal({ engineer, initialName = '', defaults = {}, onClose, onSaved }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [name, setName] = useState(engineer?.name ?? initialName)
  const [customerId, setCustomerId] = useState(engineer ? engineer.customer_id : (defaults.customer_id ?? null))
  const [location, setLocation] = useState(engineer?.location ?? defaults.location ?? '')
  const [title, setTitle] = useState(engineer?.title ?? '')
  const [email, setEmail] = useState(engineer?.email ?? '')
  const [phone, setPhone] = useState(engineer?.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (!name.trim()) { setError(t('quotes.engineers.nameRequired')); return }
    setSaving(true); setError('')
    try {
      const payload = { name, customer_id: customerId, location, title, email, phone }
      const res = engineer ? await updateEngineer(engineer.id, payload) : await createEngineer(payload)
      rememberEngineer(res.engineer)
      toast.success(engineer ? t('quotes.engineers.saved') : t('quotes.engineers.added'))
      onSaved?.(res.engineer)
    } catch (err) {
      // Already on the list → just use that one.
      const existing = err?.response?.status === 409 ? err.response.data?.engineer : null
      if (existing) { rememberEngineer(existing); toast.success(t('quotes.engineers.alreadyThere')); onSaved?.(existing); return }
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setSaving(false) }
  }

  return (
    <Modal isOpen onClose={onClose} title={engineer ? t('quotes.engineers.editTitle') : t('quotes.engineers.newTitle')}>
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save() }}>
        <Input label={t('quotes.engineers.name')} value={name} onChange={(e) => setName(e.target.value)} autoFocus={!engineer}
          placeholder={t('quotes.engineers.namePlaceholder')} autoComplete="off" />
        <ClientPicker value={customerId} onChange={(id) => setCustomerId(id)} label={t('quotes.engineers.company')} />
        <Input label={t('quotes.engineers.location')} value={location} onChange={(e) => setLocation(e.target.value)}
          placeholder={t('quotes.fields.facilityPlaceholder')} autoComplete="off"
          list="engineer-locations" />
        <datalist id="engineer-locations">
          {[...new Set(store.engineers.filter((e) => !customerId || e.customer_id === customerId).map((e) => e.location).filter(Boolean))]
            .map((l) => <option key={l} value={l} />)}
        </datalist>
        <Input label={t('quotes.engineers.jobTitle')} value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder={t('quotes.engineers.jobTitlePlaceholder')} autoComplete="off" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label={t('quotes.clients.email')} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="off" autoCapitalize="none" />
          <Input label={t('quotes.clients.phone')} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <Button type="submit" size="lg" fullWidth loading={saving}>{t('quotes.actions.save')}</Button>
      </form>
    </Modal>
  )
}

// ── Type-ahead picker ──────────────────────────────────────────────────────
// Start typing → matching engineers (by name, company or location); nothing
// matches → add them right there. Once picked, shows the engineer's card.
export function EngineerPicker({ value, onChange, label, autoFocus = false, defaults }) {
  const { t } = useTranslation()
  const { engineers, loaded } = useEngineerList()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(null) // initial name for the new-engineer form
  const [editing, setEditing] = useState(false)
  const selected = value ? engineers.find((e) => e.id === value) : null
  const matches = searchEngineers(engineers, q)
  const pick = (e) => { onChange(e.id, e); setQ('') }

  return (
    <div className="flex flex-col gap-1.5">
      {label !== false && <label className="text-sm font-medium text-gray-700">{label ?? t('quotes.engineers.label')}</label>}
      {selected ? (
        <EngineerCard engineer={selected} onEdit={() => setEditing(true)} onClear={() => onChange(null, null)} />
      ) : value && !loaded ? (
        <div className="h-14 rounded-2xl bg-gray-100 animate-pulse" />
      ) : (
        <div className="relative">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} autoComplete="off"
            placeholder={t('quotes.engineers.search')} enterKeyHint="search"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (matches[0]) pick(matches[0]); else if (q.trim()) setAdding(q.trim()) } }}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          {q.trim() && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden">
              {matches.map((e) => (
                <button key={e.id} type="button" onClick={() => pick(e)}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 border-b border-gray-50">
                  <span className="block text-sm font-semibold text-gray-900">{e.name}</span>
                  {engineerWhere(e) && <span className="block text-xs text-gray-500 truncate">{engineerWhere(e)}</span>}
                </button>
              ))}
              <button type="button" onClick={() => setAdding(q.trim())}
                className="w-full text-left px-4 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-100/40 active:bg-brand-100">
                + {t('quotes.engineers.addNamed', { name: q.trim() })}
              </button>
            </div>
          )}
          {!q.trim() && (
            <button type="button" onClick={() => setAdding('')} className="mt-1.5 text-sm font-semibold text-brand-700">
              + {t('quotes.engineers.new')}
            </button>
          )}
        </div>
      )}
      {adding !== null && (
        <EngineerFormModal initialName={adding} defaults={defaults} onClose={() => setAdding(null)}
          onSaved={(e) => { setAdding(null); pick(e) }} />
      )}
      {editing && selected && (
        <EngineerFormModal engineer={selected} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
      )}
    </div>
  )
}
