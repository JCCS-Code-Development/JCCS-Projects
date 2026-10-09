import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Card from '../../../components/ui/Card'
import PageHeader from '../../../components/ui/PageHeader'
import Modal from '../../../components/ui/Modal'
import Button from '../../../components/ui/Button'
import Spinner from '../../../components/ui/Spinner'
import { useToast } from '../../../components/ToastProvider'
import { useConfirm } from '../../../components/ConfirmProvider'
import { useAuthStore } from '../../../store/authStore'
import { removeCustomer, importCustomers } from '../../../api/customers'
import { useClientList, reloadClients, searchClients, ClientCard, ClientFormModal } from './ClientPicker'
import { clientsFromCsv } from './csvImport'

// The client list — like InvoiceToGo's Clients. Field managers can look
// clients up and add them; the office can also remove them and import the
// list from an InvoiceToGo export.
export default function ClientList() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirmDialog = useConfirm()
  const isAdmin = useAuthStore((s) => s.user?.role) === 'admin'
  const { clients, loaded } = useClientList()
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null) // {client?} for add/edit
  const [importing, setImporting] = useState(false)
  const shown = q.trim() ? searchClients(clients, q, 200) : clients

  const remove = async (c) => {
    if (!await confirmDialog(t('quotes.clients.removeConfirm', { name: c.name }), { danger: true, confirmLabel: t('quotes.clients.remove') })) return
    try { await removeCustomer(c.id); await reloadClients(); toast.success(t('quotes.clients.removed')) }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }

  return (
    <div className="flex flex-col gap-5">
      <Link to="/quotes" className="text-sm font-semibold text-brand-500 hover:underline w-fit py-1">← {t('nav.quotes')}</Link>
      <PageHeader title={t('quotes.clients.title')} subtitle={t('quotes.clients.subtitle')}
        actionLabel={t('quotes.clients.new')} onAction={() => setModal({})}>
        {isAdmin && (
          <div className="flex justify-center lg:justify-start lg:w-full lg:order-last">
            <button onClick={() => setImporting(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm active:bg-brand-100">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" /></svg>
              {t('quotes.clients.import')}
            </button>
          </div>
        )}
      </PageHeader>

      <div className="relative w-full max-w-2xl mx-auto lg:mx-0 lg:max-w-md">
        <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('quotes.clients.search')}
          className="w-full rounded-full border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-base lg:text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
      </div>

      {!loaded ? <Card><Spinner /></Card> : shown.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 text-center py-4">
            {q.trim() ? t('quotes.clients.noMatches') : t('quotes.clients.empty')}
          </p>
          {!q.trim() && isAdmin && (
            <div className="flex justify-center"><Button variant="secondary" onClick={() => setImporting(true)}>{t('quotes.clients.import')}</Button></div>
          )}
        </Card>
      ) : (
        <>
          <p className="text-xs text-gray-400 -mb-3">{t('quotes.clients.count', { count: shown.length })}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
            {shown.map((c) => (
              <div key={c.id} className="flex flex-col gap-1">
                <ClientCard client={c} onEdit={() => setModal({ client: c })} />
                {isAdmin && (
                  <button onClick={() => remove(c)} className="self-end text-xs font-semibold text-red-500 px-2 py-1 rounded-lg active:bg-red-50 hover:underline">
                    {t('quotes.clients.remove')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {modal && <ClientFormModal client={modal.client} onClose={() => setModal(null)} onSaved={() => setModal(null)} />}
      {importing && <ImportModal existing={clients} onClose={() => setImporting(false)} />}
    </div>
  )
}

// Pick the InvoiceToGo CSV → preview what was found → import.
function ImportModal({ existing, onClose }) {
  const { t } = useTranslation()
  const toast = useToast()
  const fileRef = useRef(null)
  const [parsed, setParsed] = useState(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)

  const known = new Set(existing.map((c) => c.name.trim().toLowerCase()))
  const fresh = parsed?.clients.filter((c) => !known.has(c.name.toLowerCase())).length ?? 0

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setFileName(f.name)
    try { setParsed(clientsFromCsv(await f.text())) }
    catch { setParsed({ clients: [], error: 'unreadable' }) }
  }

  const run = async () => {
    setBusy(true); setProgress(0)
    const totals = { added: 0, updated: 0, unchanged: 0 }
    try {
      const list = parsed.clients
      for (let i = 0; i < list.length; i += 500) {
        const r = await importCustomers(list.slice(i, i + 500))
        totals.added += r.added; totals.updated += r.updated; totals.unchanged += r.unchanged
        setProgress(Math.min(list.length, i + 500))
      }
      await reloadClients()
      toast.success(t('quotes.clients.importDone', totals))
      onClose()
    } catch (err) {
      await reloadClients()
      toast.error(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setBusy(false) }
  }

  const found = parsed?.columns ? ['name', 'email'].filter((k) => parsed.columns[k] !== undefined || (k === 'name' && (parsed.columns.first !== undefined || parsed.columns.last !== undefined))) : []

  return (
    <Modal isOpen onClose={busy ? () => {} : onClose} title={t('quotes.clients.importTitle')} size="lg">
      <div className="flex flex-col gap-4">
        <ol className="text-sm text-gray-600 list-decimal pl-5 flex flex-col gap-1">
          <li>{t('quotes.clients.importStep1')}</li>
          <li>{t('quotes.clients.importStep2')}</li>
          <li>{t('quotes.clients.importStep3')}</li>
        </ol>
        <p className="text-xs text-gray-500">{t('quotes.clients.importHint')}</p>

        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain,.txt" className="hidden" onChange={onFile} />
        <Button variant="secondary" size="lg" fullWidth onClick={() => fileRef.current?.click()} disabled={busy}>
          {fileName ? t('quotes.clients.pickOther') : t('quotes.clients.pickFile')}
        </Button>

        {parsed && (
          parsed.error ? (
            <p className="rounded-xl bg-red-50 text-red-600 text-sm px-4 py-3">
              {t(`quotes.clients.importError.${parsed.error}`, { file: fileName })}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl bg-brand-100/40 px-4 py-3 text-sm text-gray-800">
                <p className="font-semibold">{t('quotes.clients.importFound', { count: parsed.clients.length, file: fileName })}</p>
                <p className="text-gray-600">{t('quotes.clients.importSplit', { fresh, known: parsed.clients.length - fresh })}</p>
                <p className="text-xs text-gray-500 mt-1">{t('quotes.clients.importColumns')}: {found.map((k) => t(`quotes.clients.col.${k}`)).join(', ')}</p>
              </div>
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 max-h-56 overflow-y-auto">
                {parsed.clients.slice(0, 50).map((c) => (
                  <li key={c.name} className="px-3 py-2">
                    <span className="block text-sm font-semibold text-gray-900">
                      {c.name}
                      {known.has(c.name.toLowerCase()) && <span className="ml-1.5 text-[11px] font-semibold text-gray-400">{t('quotes.clients.onList')}</span>}
                    </span>
                    {c.email && <span className="block text-xs text-gray-400 truncate">{c.email}</span>}
                  </li>
                ))}
                {parsed.clients.length > 50 && <li className="px-3 py-2 text-xs text-gray-400">{t('quotes.clients.andMore', { count: parsed.clients.length - 50 })}</li>}
              </ul>
              <p className="text-xs text-gray-500">{t('quotes.clients.importSafe')}</p>
              <Button size="lg" fullWidth onClick={run} loading={busy} disabled={!parsed.clients.length}>
                {busy ? t('quotes.clients.importing', { done: progress, count: parsed.clients.length })
                  : t('quotes.clients.importN', { count: parsed.clients.length })}
              </Button>
            </div>
          )
        )}
      </div>
    </Modal>
  )
}
