import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import { useToast } from '../components/ToastProvider'
import { listProjects, resolveProject } from '../api/projects'

const ChevronIcon = () => <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6"/></svg>

function ProjectGroups({ groups, basePath, inactiveLabel }) {
  return groups.map(([company, companyProjects]) => (
    <div key={company} className="flex flex-col gap-2">
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">{company}</h2>
      <div className="grid grid-cols-1 sm:[grid-template-columns:repeat(auto-fit,minmax(280px,1fr))] gap-3">
        {companyProjects.map((p) => (
          <Link key={p.project_number} to={`${basePath}/${p.project_number}`}
            className={`flex items-center justify-between gap-3 rounded-2xl shadow-sm border px-5 py-4 lg:px-6 lg:py-5 transition-all ${
              inactiveLabel
                ? 'bg-gray-50 border-gray-100 opacity-70 hover:opacity-100 hover:border-gray-300'
                : 'bg-white border-gray-100 hover:border-brand-300 hover:shadow-md'
            }`}>
            <span className="min-w-0">
              <span className="flex items-center gap-2 min-w-0">
                <span className="block text-sm lg:text-base font-semibold text-gray-900 truncate">{p.name}</span>
                {inactiveLabel && (
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">
                    {inactiveLabel}
                  </span>
                )}
              </span>
              <span className="block text-xs lg:text-sm text-gray-400 mt-0.5">#{p.project_number}</span>
            </span>
            <ChevronIcon />
          </Link>
        ))}
      </div>
    </div>
  ))
}

const norm = (v) => (v ?? '').toString().toLowerCase()
// Inventory tracks both is_active and status ('active'/'completed') —
// treat either signal as enough to call a project inactive, since a
// project could in principle have one flip before the other.
const isActive = (p) => p.is_active !== 0 && p.is_active !== false && p.status !== 'completed'

function groupByCompany(list, noCompanyLabel) {
  const map = new Map()
  for (const p of list) {
    const key = p.client_name?.trim() || noCompanyLabel
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(p)
  }
  const entries = [...map.entries()]
  entries.sort(([a], [b]) => {
    if (a === noCompanyLabel) return 1
    if (b === noCompanyLabel) return -1
    return a.localeCompare(b)
  })
  return entries
}

// The app's home screen — projects grouped by company (client_name). Every
// other section (Daily Logs, Documents, RFIs, Submittals, Punch List) lives
// one level deeper, inside a selected project — this is the outermost
// "Russian doll" layer, not a separate dashboard.
export default function ProjectsHome() {
  const { t } = useTranslation()
  const toast = useToast()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [looking, setLooking] = useState(false)
  // Active/Inactive are now two separate tabs (not one page with a section
  // tacked on below) — inactive here means "marked completed by an admin"
  // in Inventory (status='completed' and/or is_active=0).
  const [view, setView] = useState('active')

  const load = () => {
    setLoading(true)
    listProjects()
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => toast.error(t('common.couldNotSave')))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const trimmedQuery = query.trim()
  const queryIsEstimateNumber = /^\d{4}$/.test(trimmedQuery)

  // Free-text search across every field a user might actually remember a
  // project by — name, estimate #, company, or address — all matched
  // client-side against the already-loaded (and role-scoped) project list.
  const filtered = useMemo(() => {
    if (!trimmedQuery) return projects
    const q = norm(trimmedQuery)
    return projects.filter((p) =>
      norm(p.project_number).includes(q) ||
      norm(p.name).includes(q) ||
      norm(p.client_name).includes(q) ||
      norm(p.client_address).includes(q)
    )
  }, [projects, trimmedQuery])

  const activeProjects = useMemo(() => filtered.filter(isActive), [filtered])
  const inactiveProjects = useMemo(() => filtered.filter((p) => !isActive(p)), [filtered])
  const groups = useMemo(() => groupByCompany(activeProjects, t('projects.noCompany')), [activeProjects, t])
  const inactiveGroups = useMemo(() => groupByCompany(inactiveProjects, t('projects.noCompany')), [inactiveProjects, t])

  // A 4-digit query that doesn't match anything already loaded is the one
  // case where we offer to look it up (and create it if Inventory doesn't
  // have it yet either) rather than just reporting "no results."
  const showCreatePrompt = queryIsEstimateNumber && filtered.length === 0

  const handleCreateLookup = async () => {
    setLooking(true)
    try {
      await resolveProject(trimmedQuery)
      setQuery('')
      load()
    } catch {
      toast.error(t('projects.notFound'))
    } finally {
      setLooking(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{t('projects.title')}</h1>
        <p className="text-sm text-gray-500">{t('projects.subtitle')}</p>
      </div>

      <div className="relative max-w-md lg:max-w-xl">
        <svg className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          aria-label={t('projects.searchLabel')}
          placeholder={t('projects.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-full border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm shadow-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {showCreatePrompt && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 max-w-md lg:max-w-2xl">
          <p className="text-sm text-amber-800">{t('projects.createPrompt', { number: trimmedQuery })}</p>
          <Button size="sm" onClick={handleCreateLookup} loading={looking}>
            {t('projects.createButton', { number: trimmedQuery })}
          </Button>
        </div>
      )}

      {loading ? (
        <Card><p className="text-sm text-gray-400">{t('common.loading')}</p></Card>
      ) : projects.length === 0 ? (
        <Card><p className="text-sm text-gray-400">{t('common.noProjectsYet')}</p></Card>
      ) : filtered.length === 0 ? (
        !showCreatePrompt && <Card><p className="text-sm text-gray-400">{t('projects.noResults', { query: trimmedQuery })}</p></Card>
      ) : (
        <>
          <div className="inline-flex bg-gray-100 rounded-xl p-1 gap-1 w-fit">
            <button onClick={() => setView('active')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                view === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t('projects.activeTab')} <span className="text-gray-400">({activeProjects.length})</span>
            </button>
            <button onClick={() => setView('inactive')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                view === 'inactive' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t('projects.inactiveTab')} <span className="text-gray-400">({inactiveProjects.length})</span>
            </button>
          </div>

          {view === 'active' ? (
            groups.length === 0 ? (
              <Card><p className="text-sm text-gray-400">{trimmedQuery ? t('projects.noResults', { query: trimmedQuery }) : t('projects.noActiveProjects')}</p></Card>
            ) : (
              <ProjectGroups groups={groups} basePath="/projects" />
            )
          ) : (
            inactiveGroups.length === 0 ? (
              <Card><p className="text-sm text-gray-400">{trimmedQuery ? t('projects.noResults', { query: trimmedQuery }) : t('projects.noInactiveProjects')}</p></Card>
            ) : (
              <ProjectGroups groups={inactiveGroups} basePath="/projects" inactiveLabel={t('projects.inactiveBadge')} />
            )
          )}
        </>
      )}
    </div>
  )
}
