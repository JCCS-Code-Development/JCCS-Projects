import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import { useToast } from '../components/ToastProvider'
import { listProjects, resolveProject } from '../api/projects'

const ChevronIcon = () => <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6"/></svg>

const norm = (v) => (v ?? '').toString().toLowerCase()

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

  const groups = useMemo(() => {
    const noCompany = t('projects.noCompany')
    const map = new Map()
    for (const p of filtered) {
      const key = p.client_name?.trim() || noCompany
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(p)
    }
    const entries = [...map.entries()]
    entries.sort(([a], [b]) => {
      if (a === noCompany) return 1
      if (b === noCompany) return -1
      return a.localeCompare(b)
    })
    return entries
  }, [filtered, t])

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

      <Card className="max-w-md lg:max-w-2xl">
        <Input
          label={t('projects.searchLabel')}
          placeholder={t('projects.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </Card>

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
        groups.map(([company, companyProjects]) => (
          <div key={company} className="flex flex-col gap-2">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">{company}</h2>
            <div className="grid grid-cols-1 sm:[grid-template-columns:repeat(auto-fit,minmax(280px,1fr))] gap-3">
              {companyProjects.map((p) => (
                <Link key={p.project_number} to={`/projects/${p.project_number}`}
                  className="flex items-center justify-between gap-3 bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 lg:px-6 lg:py-5 hover:border-brand-300 hover:shadow-md transition-all">
                  <span className="min-w-0">
                    <span className="block text-sm lg:text-base font-semibold text-gray-900 truncate">{p.name}</span>
                    <span className="block text-xs lg:text-sm text-gray-400 mt-0.5">#{p.project_number}</span>
                  </span>
                  <ChevronIcon />
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
