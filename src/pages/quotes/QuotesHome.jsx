import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Card from '../../components/ui/Card'
import PageHeader from '../../components/ui/PageHeader'
import { useToast } from '../../components/ToastProvider'
import { useAuthStore } from '../../store/authStore'
import { listQuoteRequests, createQuoteRequest } from '../../api/quoteRequests'
import { StatusPill, FlagPills, QuoteWho } from './QuoteParts'
import { BOARD_COLUMNS, CLOSED_STATUSES, quoteFlags, fmtDate } from './quoteUtils'

const CameraIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.66-.89l.82-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.66.89l.82 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
)

// Up to four photos across the top of the card; "+N" on the last one when
// there are more.
function ThumbStrip({ urls = [], count = 0 }) {
  const { t } = useTranslation()
  if (!urls.length) {
    return (
      <div className="flex items-center justify-center gap-1.5 h-12 bg-gray-50 text-[11px] font-semibold text-gray-300">
        <CameraIcon className="w-4 h-4" />{t('quotes.noPhotosYet')}
      </div>
    )
  }
  const more = count - urls.length
  return (
    <div className="grid grid-cols-4 gap-0.5 bg-gray-100">
      {urls.map((u, i) => (
        <div key={u} className="relative aspect-square">
          <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" />
          {i === urls.length - 1 && more > 0 && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-bold text-white">+{more}</span>
          )}
        </div>
      ))}
      {/* Keep the squares the same size when there are fewer than four. */}
      {Array.from({ length: 4 - urls.length }, (_, i) => <div key={`empty-${i}`} className="aspect-square bg-gray-50" />)}
    </div>
  )
}

function QuoteCard({ q, showFieldManager }) {
  const { t, i18n } = useTranslation()
  const flagged = quoteFlags(q).some((f) => f === 'overdue' || f === 'followUpDue')
  return (
    <Link to={`/quotes/${q.id}`}
      className={`block bg-white rounded-2xl shadow-sm border overflow-hidden transition-all hover:shadow-md active:scale-[0.99] ${flagged ? 'border-red-200' : 'border-gray-100 hover:border-brand-400'}`}>
      <ThumbStrip urls={q.thumb_urls} count={q.photo_count} />
      <div className="px-3.5 py-3 flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-gray-400 tracking-wide truncate">
            {q.request_no ?? t('quotes.unsaved')}{q.estimate_number ? ` · #${q.estimate_number}` : ''}{q.work_type === 'addon' && q.project_number ? ` · ${t('quotes.addonShort')} #${q.project_number}` : ''}
          </span>
          <StatusPill status={q.status} />
        </div>
        <p className="text-sm font-semibold text-gray-900 line-clamp-2">{q.title}</p>
        <QuoteWho
          client={q.customer_name || q.recipients_label}
          company={q.customer_company}
          location={[q.facility || q.customer_location, q.location_detail].filter(Boolean).join(' · ')}
          estimator={q.assigned_to_name} />
        <div className="flex flex-wrap items-center gap-1.5">
          <FlagPills quote={q} />
          {q.needed_by && <span className="text-[11px] text-gray-400">{t('quotes.fields.neededBy')}: {fmtDate(q.needed_by, i18n.language)}</span>}
        </div>
        {showFieldManager && q.field_manager_name && (
          <p className="text-[11px] text-gray-400 truncate">{t('quotes.fields.fieldManager')}: {q.field_manager_name}</p>
        )}
      </div>
    </Link>
  )
}

export default function QuotesHome() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [showClosed, setShowClosed] = useState(false)
  const [tab, setTab] = useState(null)
  const [starting, setStarting] = useState(false)
  const navigate = useNavigate()

  // Photos first: a site walk starts as a draft with a dated placeholder
  // title, straight into the camera screen. Details come after the photos.
  const startSiteWalk = async () => {
    setStarting(true)
    try {
      const today = new Date().toLocaleDateString(i18n.language === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric' })
      // Unsaved until Next/Save/Submit: no Q-number yet, and Cancel discards it.
      const res = await createQuoteRequest({ title: t('quotes.capture.autoTitle', { date: today }), work_type: 'new', unsaved: true })
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
      // Show the server's reason — a missing migration, say — not a generic "save" error.
      .catch((err) => toast.error(`${t('quotes.loadFailed')}${err?.response?.data?.error ? ` (${err.response.data.error})` : ''}`))
      .finally(() => setLoading(false))
  }, [showClosed, toast, t])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return quotes.filter((r) => {
      if (filter === 'mine' && r.assigned_to !== user?.id) return false
      if (filter === 'unassigned' && r.assigned_to) return false
      if (!q) return true
      return [r.title, r.facility, r.location_detail, r.customer_name, r.customer_company, r.recipients_label, r.assigned_to_name, r.estimate_number, r.project_number, r.request_no, r.field_manager_name]
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
  const fieldOrder = ['needs_info', 'scheduled', 'draft', 'pending_review', 'estimate_created', 'sent', 'done', ...CLOSED_STATUSES]
  const fieldList = [...filtered].sort((a, b) => fieldOrder.indexOf(a.status) - fieldOrder.indexOf(b.status))

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={isAdmin ? t('quotes.title') : t('quotes.fieldTitle')}
        subtitle={isAdmin ? t('quotes.subtitle') : t('quotes.fieldSubtitle')}
        actionLabel={t('quotes.newSiteWalk')}
        onAction={startSiteWalk}
        actionLoading={starting}
        actionIcon={CameraIcon}>
        {/* The client list and Materials library live inside Quotes on every screen size. */}
        <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-start lg:w-full lg:order-last">
          <Link to="/quotes/clients"
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm active:bg-brand-100">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-1a4 4 0 00-5.6-3.7M17 20H7m10 0v-1c0-.7-.1-1.3-.4-1.9M7 20H2v-1a4 4 0 015.6-3.7M7 20v-1c0-.7.1-1.3.4-1.9m0 0a5 5 0 019.2 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            {t('quotes.clients.title')}
          </Link>
          {isAdmin && (
            <Link to="/quotes/materials"
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm active:bg-brand-100">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 7a3 3 0 013-3h10v13H7a3 3 0 00-3 3V7zM4 20a3 3 0 013-3h10v3H7"/></svg>
              {t('quotes.manageLibrary')}
            </Link>
          )}
        </div>
      </PageHeader>

      <div className="flex flex-col gap-2.5 w-full max-w-2xl mx-auto lg:max-w-none lg:mx-0 lg:flex-row lg:items-center lg:gap-3">
        <div className="relative w-full lg:max-w-md">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('quotes.searchShort')}
            className="w-full rounded-full border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-base lg:text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        </div>
        {/* Slim chips — filters plus the closed toggle — in one scrollable row. */}
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {isAdmin && ['all', 'mine', 'unassigned'].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors ${
                filter === f ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'
              }`}>
              {t(`quotes.filters.${f}`)}
            </button>
          ))}
          <button onClick={() => setShowClosed((v) => !v)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors ${
              showClosed ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}>
            {t('quotes.showClosed')}
          </button>
        </div>
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
            <div className="flex gap-5 overflow-x-auto -mx-4 px-4 border-b border-gray-200 sm:mx-0 sm:px-0 sm:justify-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {columns.map((col) => (
                <button key={col.key} onClick={() => setTab(col.key)}
                  className={`shrink-0 -mb-px border-b-2 pb-2 pt-1 text-sm font-semibold transition-colors ${
                    activeTab === col.key ? 'border-brand-500 text-gray-900' : 'border-transparent text-gray-400'
                  }`}>
                  {t(`quotes.board.${col.key}`)}
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${activeTab === col.key ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'}`}>{col.items.length}</span>
                </button>
              ))}
            </div>
            {activeItems.length === 0 ? (
              <Card><p className="text-sm text-gray-400 text-center">{t('quotes.noResults')}</p></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeItems.map((q) => <QuoteCard key={q.id} q={q} showFieldManager />)}
              </div>
            )}
          </div>

          {/* Wide desktop: the full board. */}
          <div className="hidden xl:grid gap-4" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
            {columns.map((col) => (
              <div key={col.key} className="flex flex-col gap-2 min-w-0">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
                  {t(`quotes.board.${col.key}`)} <span className="text-gray-300">({col.items.length})</span>
                </h2>
                {col.items.length === 0
                  ? <div className="rounded-2xl border border-dashed border-gray-200 py-6" />
                  : col.items.map((q) => <QuoteCard key={q.id} q={q} showFieldManager />)}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {fieldList.map((q) => <QuoteCard key={q.id} q={q} />)}
        </div>
      )}

    </div>
  )
}
