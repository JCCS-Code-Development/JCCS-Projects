import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'
import { useToast } from '../components/ToastProvider'
import { useConfirm } from '../components/ConfirmProvider'
import { TextArea } from './quotes/QuoteParts'
import {
  listCustomers, createCustomer, updateCustomer, deactivateCustomer,
  createContact, updateContact, removeContact,
} from '../api/customers'

const EMPTY_CUSTOMER = { name: '', phone: '', email: '', address: '', notes: '' }
const EMPTY_CONTACT  = { name: '', title: '', email: '', phone: '' }
const errMsg = (err, t) => err?.response?.data?.error ?? t('common.couldNotSave')

// Customers the office quotes for (e.g. "Prisma Health") and the people at
// each one — the "For:" contact on an estimate varies job to job.
export default function Customers() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirmDialog = useConfirm()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)   // 'create' | customer
  const [form, setForm] = useState(EMPTY_CUSTOMER)
  const [contactModal, setContactModal] = useState(null) // { customer, contact|null }
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    listCustomers().then((d) => setCustomers(d.customers ?? [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const openCreate = () => { setForm(EMPTY_CUSTOMER); setError(''); setModal('create') }
  const openEdit = (c) => {
    setForm({ name: c.name, phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '', notes: c.notes ?? '' })
    setError(''); setModal(c)
  }
  const save = async () => {
    if (!form.name.trim()) { setError(t('customers.nameRequired')); return }
    setSaving(true); setError('')
    try {
      if (modal === 'create') await createCustomer(form)
      else await updateCustomer(modal.id, form)
      setModal(null); load()
    } catch (err) { setError(errMsg(err, t)) }
    finally { setSaving(false) }
  }
  const remove = async (c) => {
    if (!await confirmDialog(t('customers.removeConfirm', { name: c.name }), { danger: true, confirmLabel: t('customers.remove') })) return
    try { await deactivateCustomer(c.id); load() } catch (err) { toast.error(errMsg(err, t)) }
  }

  const openContact = (customer, contact = null) => {
    setContactForm(contact ? { name: contact.name, title: contact.title ?? '', email: contact.email ?? '', phone: contact.phone ?? '' } : EMPTY_CONTACT)
    setError(''); setContactModal({ customer, contact })
  }
  const saveContact = async () => {
    if (!contactForm.name.trim()) { setError(t('customers.nameRequired')); return }
    setSaving(true); setError('')
    try {
      const { customer, contact } = contactModal
      if (contact) await updateContact(customer.id, contact.id, contactForm)
      else await createContact(customer.id, contactForm)
      setContactModal(null); load()
    } catch (err) { setError(errMsg(err, t)) }
    finally { setSaving(false) }
  }
  const dropContact = async (customer, contact) => {
    if (!await confirmDialog(t('customers.removeConfirm', { name: contact.name }), { danger: true, confirmLabel: t('customers.remove') })) return
    try { await removeContact(customer.id, contact.id); load() } catch (err) { toast.error(errMsg(err, t)) }
  }

  const set = (setter) => (k) => (e) => setter((f) => ({ ...f, [k]: e.target.value }))
  const setC = set(setForm)
  const setK = set(setContactForm)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('customers.title')} subtitle={t('customers.subtitle')}
        actionLabel={t('customers.add')} onAction={openCreate} />

      {loading ? <Card><Spinner /></Card> : customers.length === 0 ? (
        <Card><p className="text-sm text-gray-400">{t('customers.empty')}</p></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {customers.map((c) => (
            <Card key={c.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-500">{[c.phone, c.email, c.address].filter(Boolean).join(' · ') || '—'}</p>
                  {c.notes && <p className="text-xs text-gray-400 mt-1 whitespace-pre-wrap">{c.notes}</p>}
                </div>
                <div className="flex gap-1 shrink-0 -mr-2 -mt-1.5">
                  <button onClick={() => openEdit(c)} className="text-sm font-semibold text-brand-700 px-2 py-1.5 rounded-lg active:bg-brand-100 hover:underline">{t('common.edit')}</button>
                  <button onClick={() => remove(c)} className="text-sm font-semibold text-red-500 px-2 py-1.5 rounded-lg active:bg-red-50 hover:underline">{t('customers.remove')}</button>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('customers.contacts')}</p>
                  <button onClick={() => openContact(c)} className="text-sm font-semibold text-brand-700 px-2 py-1.5 rounded-lg active:bg-brand-100 hover:underline">+ {t('customers.addContact')}</button>
                </div>
                {c.contacts.length === 0 ? <p className="text-xs text-gray-400">{t('customers.noContacts')}</p> : (
                  <ul className="divide-y divide-gray-50">
                    {c.contacts.map((k) => (
                      <li key={k.id} className="flex items-center justify-between gap-2 py-1.5">
                        <span className="min-w-0 text-sm text-gray-800 truncate">
                          {k.name}{k.title ? <span className="text-gray-400"> — {k.title}</span> : null}
                          <span className="block text-xs text-gray-400 truncate">{[k.email, k.phone].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="flex gap-1 shrink-0 -mr-2">
                          <button onClick={() => openContact(c, k)} className="text-sm font-semibold text-brand-700 px-2 py-1.5 rounded-lg active:bg-brand-100 hover:underline">{t('common.edit')}</button>
                          <button onClick={() => dropContact(c, k)} className="text-sm font-semibold text-red-500 px-2 py-1.5 rounded-lg active:bg-red-50 hover:underline">{t('customers.remove')}</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? t('customers.add') : t('customers.edit')}>
        <div className="flex flex-col gap-4">
          <Input label={t('customers.name')} value={form.name} onChange={setC('name')} />
          <Input label={t('customers.phone')} value={form.phone} onChange={setC('phone')} type="tel" />
          <Input label={t('customers.email')} value={form.email} onChange={setC('email')} type="email" />
          <Input label={t('customers.address')} value={form.address} onChange={setC('address')} />
          <TextArea label={t('customers.notes')} value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} rows={3} />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button onClick={save} loading={saving} fullWidth>{t('common.save')}</Button>
        </div>
      </Modal>

      <Modal isOpen={!!contactModal} onClose={() => setContactModal(null)}
        title={contactModal ? `${contactModal.customer.name} — ${contactModal.contact ? t('common.edit') : t('customers.addContact')}` : ''}>
        <div className="flex flex-col gap-4">
          <Input label={t('customers.contactName')} value={contactForm.name} onChange={setK('name')} />
          <Input label={t('customers.contactTitle')} value={contactForm.title} onChange={setK('title')} />
          <Input label={t('customers.email')} value={contactForm.email} onChange={setK('email')} type="email" />
          <Input label={t('customers.phone')} value={contactForm.phone} onChange={setK('phone')} type="tel" />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button onClick={saveContact} loading={saving} fullWidth>{t('common.save')}</Button>
        </div>
      </Modal>
    </div>
  )
}
