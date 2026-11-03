import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Card from '../../../components/ui/Card'
import PageHeader from '../../../components/ui/PageHeader'
import Spinner from '../../../components/ui/Spinner'
import { useToast } from '../../../components/ToastProvider'
import { useConfirm } from '../../../components/ConfirmProvider'
import { useAuthStore } from '../../../store/authStore'
import { removeEngineer } from '../../../api/engineers'
import { useEngineerList, reloadEngineers, searchEngineers, EngineerCard, EngineerFormModal } from './EngineerPicker'

// The engineer list — everyone quotes are for, grouped by the company they
// work for, with the location they work at. Field managers can look them up
// and add them; the office can also remove them.
export default function EngineerList() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirmDialog = useConfirm()
  const isAdmin = useAuthStore((s) => s.user?.role) === 'admin'
  const { engineers, loaded } = useEngineerList()
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null) // {engineer?} for add/edit
  const shown = q.trim() ? searchEngineers(engineers, q, 500) : engineers

  // Companies A→Z, engineers without one last.
  const groups = Object.entries(shown.reduce((acc, e) => {
    const key = e.company ?? ''
    ;(acc[key] ??= []).push(e)
    return acc
  }, {})).sort(([a], [b]) => (a === '') - (b === '') || a.localeCompare(b))

  const remove = async (e) => {
    if (!await confirmDialog(t('quotes.engineers.removeConfirm', { name: e.name }), { danger: true, confirmLabel: t('quotes.clients.remove') })) return
    try { await removeEngineer(e.id); await reloadEngineers(); toast.success(t('quotes.engineers.removed')) }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }

  return (
    <div className="flex flex-col gap-5">
      <Link to="/quotes" className="text-sm font-semibold text-brand-500 hover:underline w-fit py-1">← {t('nav.quotes')}</Link>
      <PageHeader title={t('quotes.engineers.title')} subtitle={t('quotes.engineers.subtitle')}
        actionLabel={t('quotes.engineers.new')} onAction={() => setModal({})} />

      <div className="relative w-full max-w-2xl mx-auto lg:mx-0 lg:max-w-md">
        <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('quotes.engineers.search')}
          className="w-full rounded-full border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-base lg:text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
      </div>

      {!loaded ? <Card><Spinner /></Card> : shown.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 text-center py-4">
            {q.trim() ? t('quotes.engineers.noMatches') : t('quotes.engineers.empty')}
          </p>
        </Card>
      ) : (
        <>
          <p className="text-xs text-gray-400 -mb-3">{t('quotes.engineers.count', { count: shown.length })}</p>
          {groups.map(([company, list]) => (
            <section key={company || '—'} className="flex flex-col gap-2">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
                {company || t('quotes.engineers.noCompany')} <span className="text-gray-300">({list.length})</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
                {list.map((e) => (
                  <div key={e.id} className="flex flex-col gap-1">
                    <EngineerCard engineer={e} onEdit={() => setModal({ engineer: e })} />
                    {isAdmin && (
                      <button onClick={() => remove(e)} className="self-end text-xs font-semibold text-red-500 px-2 py-1 rounded-lg active:bg-red-50 hover:underline">
                        {t('quotes.clients.remove')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {modal && <EngineerFormModal engineer={modal.engineer} onClose={() => setModal(null)} onSaved={() => setModal(null)} />}
    </div>
  )
}
