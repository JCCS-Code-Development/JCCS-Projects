import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Card from '../../components/ui/Card'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { useToast } from '../../components/ToastProvider'
import { useAuthStore } from '../../store/authStore'
import { listQuoteRequests, createQuoteRequest } from '../../api/quoteRequests'
import { useQuotePickers } from './useQuotePickers'
import { StatusPill, FlagPills, QuoteDetailsForm } from './QuoteParts'
import { BOARD_COLUMNS, CLOSED_STATUSES, quoteFlags, fmtDate, EMPTY_QUOTE_FORM, payloadFromForm } from './quoteUtils'

function NewRequestModal({ isOpen, onClose, isAdmin, pickers }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY_QUOTE_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const close = () => { setForm(EMPTY_QUOTE_FORM); setError(''); onClose() }

  const save = async () => {
    if (!form.title.trim()) { setError(t('quotes.titleRequired')); return }
    if (form.work_type === 'addon' && !form.project_number) { setError(t('quotes.projectRequired')); return }
    setSaving(true); setError('')
    try {
      const res = await createQuoteRequest(payloadFromForm(form, isAdmin))
      setForm(EMPTY_QUOTE_FORM)
      navigate(`/quotes/${res.id}`)
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setSaving(false) }
  }

  return (
    <Modal isOpen={isOpen} onClose={close} title={isAdmin ? t('quotes.newRequest') : t('quotes.newSiteWalk')} size="xl">
      <div className="flex flex-col gap-4">
        <QuoteDetailsForm form={form} set={set} isAdmin={isAdmin} {...pickers} />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button size="lg" onClick={save} loading={saving} fullWidth>{isAdmin ? t('quotes.newRequest') : t('quotes.newSiteWalk')}</Button>
      </div>
    </Modal>
  )
}

const NoPhoto = ({ className = '' }) => (
  <div className={`flex items-center justify-center bg-gray-100 text-gray-300 ${className}`}>
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.66-.89l.82-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.66.89l.82 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
  </div>
)

// `cover` = CompanyCam-style card with the first photo as a big cover image
// (field managers' list); otherwise a compact card with a square thumbnail.
function QuoteCard({ q, showAssignees, cover = false }) {
  const { t, i18n } = useTranslation()
  const flagged = quoteFlags(q).some((f) => f === 'overdue' || f === 'followUpDue')
  const body = (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-gray-400 tracking-wide truncate">
          {q.request_no}{q.estimate_number ? ` · #${q.estimate_number}` : ''}{q.work_type === 'addon' && q.project_number ? ` · ${t('quotes.addonShort')} #${q.project_number}` : ''}
        </span>
        <StatusPill status={q.status} />
      </div>
      <p className="text-sm font-semibold text-gray-900 mt-1 line-clamp-2">{q.title}</p>
      {(q.customer_name || q.facility) && (
        <p className="text-xs text-gray-500 truncate">{[q.customer_name, q.facility].filter(Boolean).join(' · ')}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <FlagPills quote={q} />
        {q.needed_by && <span className="text-[11px] text-gray-400">{t('quotes.fields.neededBy')}: {fmtDate(q.needed_by, i18n.language)}</span>}
      </div>
      {showAssignees && (q.field_manager_name || q.assigned_to_name) && (
        <p className="text-[11px] text-gray-400 mt-1 truncate">
          {[q.field_manager_name && `${t('quotes.fields.fieldManager')}: ${q.field_manager_name}`, q.assigned_to_name && `${t('quotes.fields.estimator')}: ${q.assigned_to_name}`].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  )
  const photoCount = q.photo_count > 0 && (
    <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">
      {t('quotes.photos', { count: q.photo_count })}
    </span>
  )
  const frame = `block bg-white rounded-2xl shadow-sm border overflow-hidden transition-all hover:shadow-md active:scale-[0.99] ${flagged ? 'border-red-200' : 'border-gray-100 hover:border-brand-400'}`

  if (cover) {
    return (
      <Link to={`/quotes/${q.id}`} className={frame}>
        <div className="relative aspect-[16/9]">
          {q.cover_url ? <img src={q.cover_url} alt="" loading="lazy" className="w-full h-full object-cover" /> : <NoPhoto className="w-full h-full" />}
          {photoCount}
        </div>
        <div className="px-4 py-3">{body}</div>
      </Link>
    )
  }
  return (
    <Link to={`/quotes/${q.id}`} className={`${frame} flex gap-3 p-3`}>
      <div className="relative w-20 h-20 shrink-0 rounded-xl overflow-hidden">
        {q.cover_url ? <img src={q.cover_url} alt="" loading="lazy" className="w-full h-full object-cover" /> : <NoPhoto className="w-full h-full" />}
        {q.photo_count > 1 && <span className="absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 text-[10px] font-bold text-white">{q.photo_count}</span>}
      </div>
      {body}
    </Link>
  )
}

export default function QuotesHome() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const pickers = useQuotePickers(isAdmin)

  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [showClosed, setShowClosed] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [tab, setTab] = useState(null)
  const [starting, setStarting] = useState(false)
  const navigate = useNavigate()

  // Photos first: a site walk starts as a draft with a dated placeholder
  // title, straight into the camera screen. Details come after the photos.
  const startSiteWalk = async () => {
    setStarting(true)
    try {
      const today = new Date().toLocaleDateString(i18n.language === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric' })
      const res = await createQuoteRequest({ title: t('quotes.capture.autoTitle', { date: today }), work_type: 'new' })
      navigate(`/quotes/${res.id}/capture`)
    } catch (err) {
      toast.error(err?.response?.data?.error ?? t('common.couldNotSave'))
      setStarting(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    listQuoteRequests(showClosed ? { include_closed: 1 } : {})
      .then((d) => setQuotes(d.quoteRequests ?? []))
      .catch(() => toast.error(t('common.couldNotSave')))
      .finally(() => setLoading(false))
  }, [showClosed, toast, t])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return quotes.filter((r) => {
      if (filter === 'mine' && r.assigned_to !== user?.id) return false
      if (filter === 'unassigned' && r.assigned_to) return false
      if (!q) return true
      return [r.title, r.facility, r.customer_name, r.estimate_number, r.project_number, r.request_no, r.field_manager_name]
        .some((v) => (v ?? '').toString().toLowerCase().includes(q))
    })
  }, [quotes, query, filter, user?.id])

  const columns = BOARD_COLUMNS
    .filter((c) => showClosed || c.key !== 'closed')
    .map((c) => ({ ...c, items: filtered.filter((q) => c.statuses.includes(q.status)) }))

  // Tabs (below xl): remember the user's pick; until then open the first
  // status that actually has something in it.
  const firstNonEmpty = columns.find((c) => c.items.length)?.key ?? columns[0].key
  const activeTab = tab && columns.some((c) => c.key === tab) ? tab : firstNonEmpty
  const activeItems = columns.find((c) => c.key === activeTab)?.items ?? []

  // Field managers: drafts and anything the office sent back first.
  const fieldOrder = ['needs_info', 'draft', 'submitted', 'in_review', 'approved', 'estimating', 'sent', ...CLOSED_STATUSES]
  const fieldList = [...filtered].sort((a, b) => fieldOrder.indexOf(a.status) - fieldOrder.indexOf(b.status))

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={isAdmin ? t('quotes.title') : t('quotes.fieldTitle')}
        subtitle={isAdmin ? t('quotes.subtitle') : t('quotes.fieldSubtitle')}
        action={
          <Button size="lg" onClick={isAdmin ? () => setShowNew(true) : startSiteWalk} loading={starting} className="shadow-md shadow-brand-500/30">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M12 5v14M5 12h14"/></svg>
            {isAdmin ? t('quotes.newRequest') : t('quotes.newSiteWalk')}
          </Button>
        }>
        {/* Customers / Materials live in the desktop sidebar; on phones and
            iPads they're reached from here instead of the bottom bar. */}
        {isAdmin && (
          <div className="grid grid-cols-2 gap-2 w-full max-w-md lg:hidden">
            <Link to="/customers" className="rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-brand-700 text-center active:bg-gray-50">{t('quotes.manageCustomers')}</Link>
            <Link to="/library" className="rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-brand-700 text-center active:bg-gray-50">{t('quotes.manageLibrary')}</Link>
          </div>
        )}
      </PageHeader>

      <div className="flex flex-col items-stretch w-full max-w-2xl mx-auto lg:max-w-none lg:mx-0 lg:flex-row lg:items-center gap-3">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('quotes.search')}
          className="w-full lg:max-w-md rounded-full border border-gray-200 bg-white px-4 py-3 text-base lg:text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        {isAdmin && (
          <div className="grid grid-cols-3 lg:inline-flex bg-gray-100 rounded-xl p-1 gap-1 w-full lg:w-fit">
            {['all', 'mine', 'unassigned'].map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-2 py-2 rounded-lg text-[13px] sm:text-sm font-semibold whitespace-nowrap transition-colors ${filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {t(`quotes.filters.${f}`)}
              </button>
            ))}
          </div>
        )}
        <label className="flex items-center justify-center lg:justify-start gap-2 py-1 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-brand-500 focus:ring-brand-400" />
          {t('quotes.showClosed')}
        </label>
      </div>

      {loading ? (
        <Card><p className="text-sm text-gray-400">{t('common.loading')}</p></Card>
      ) : quotes.length === 0 ? (
        <Card><p className="text-sm text-gray-400">{isAdmin ? t('quotes.empty') : t('quotes.emptyField')}</p></Card>
      ) : filtered.length === 0 ? (
        <Card><p className="text-sm text-gray-400">{t('quotes.noResults')}</p></Card>
      ) : isAdmin ? (
        <>
          {/* Phones / iPads / small laptops: one status at a time via tabs. */}
          <div className="xl:hidden flex flex-col gap-3">
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 sm:mx-0 sm:px-0 sm:justify-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {columns.map((col) => (
                <button key={col.key} onClick={() => setTab(col.key)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors border ${
                    activeTab === col.key ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-gray-200 text-gray-600'
                  }`}>
                  {t(`quotes.board.${col.key}`)} <span className={activeTab === col.key ? 'text-white/80' : 'text-gray-400'}>{col.items.length}</span>
                </button>
              ))}
            </div>
            {activeItems.length === 0 ? (
              <Card><p className="text-sm text-gray-400 text-center">{t('quotes.noResults')}</p></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeItems.map((q) => <QuoteCard key={q.id} q={q} showAssignees />)}
              </div>
            )}
          </div>

          {/* Wide desktop: the full board. */}
          <div className={`hidden xl:grid gap-4 ${showClosed ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
            {columns.map((col) => (
              <div key={col.key} className="flex flex-col gap-2 min-w-0">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
                  {t(`quotes.board.${col.key}`)} <span className="text-gray-300">({col.items.length})</span>
                </h2>
                {col.items.length === 0
                  ? <div className="rounded-2xl border border-dashed border-gray-200 py-6" />
                  : col.items.map((q) => <QuoteCard key={q.id} q={q} showAssignees />)}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {fieldList.map((q) => <QuoteCard key={q.id} q={q} cover />)}
        </div>
      )}

      <NewRequestModal isOpen={showNew} onClose={() => setShowNew(false)} isAdmin={isAdmin} pickers={pickers} />
    </div>
  )
}
