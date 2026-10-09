import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../../../components/ui/Modal'
import { useToast } from '../../../components/ToastProvider'
import { updateQuoteRequest } from '../../../api/quoteRequests'
import { ClientPicker, ClientCard, ClientFormModal, useClientList } from './ClientPicker'

// The site-visit screen's client chip: "+ Client" to pick or add one, or the
// client's name — tap for their phone, email and address.
export default function ClientSheet({ quote, onChanged }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { clients } = useClientList()
  const [open, setOpen] = useState(false)
  const [changing, setChanging] = useState(false)
  const [editing, setEditing] = useState(false)
  // The list has the latest edits; the request has it even before the list loads.
  const client = clients.find((c) => c.id === quote.customer_id) ?? quote.customer ?? null

  const setClient = async (id) => {
    try {
      await updateQuoteRequest(quote.id, { customer_id: id })
      await onChanged()
      setChanging(false)
      if (!id) setOpen(false)
    } catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }
  const close = () => { setOpen(false); setChanging(false) }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={`shrink-0 self-center max-w-full inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${
          client ? 'bg-brand-100 text-brand-900' : 'border border-dashed border-gray-300 text-gray-500'}`}>
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
        <span className="truncate">{client ? client.name : t('quotes.clients.addToVisit')}</span>
      </button>

      <Modal isOpen={open} onClose={close} title={t('quotes.clients.label')}>
        <div className="flex flex-col gap-3 min-h-[280px]">
          {client && !changing ? (
            <ClientCard client={client} onEdit={() => setEditing(true)} onChange={() => setChanging(true)} onClear={() => setClient(null)} />
          ) : (
            <ClientPicker value={null} label={false} autoFocus onChange={(id) => id && setClient(id)} />
          )}
          {client && changing && (
            <button type="button" onClick={() => setChanging(false)} className="self-start text-sm font-semibold text-gray-500">← {t('common.cancel')}</button>
          )}
        </div>
      </Modal>
      {editing && client && (
        <ClientFormModal client={client} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged() }} />
      )}
    </>
  )
}
