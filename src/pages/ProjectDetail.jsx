import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Spinner from '../components/ui/Spinner'
import { getProject, getProjectClients, getProjectContacts } from '../api/projects'
import { listPhases } from '../api/phases'
import TimelineTab from './project-tabs/TimelineTab'
import DailyLogsTab from './project-tabs/DailyLogsTab'
import WeeklyReportsTab from './project-tabs/WeeklyReportsTab'
import DocumentsTab from './project-tabs/DocumentsTab'
import SubmittalsTab from './project-tabs/SubmittalsTab'
import PunchListTab from './project-tabs/PunchListTab'
import ComingSoonTab from './project-tabs/ComingSoonTab'
import PhaseStepperPill from './project-tabs/PhaseStepperPill'
import PhasesManagerModal from './project-tabs/PhasesManagerModal'
import ProjectDirectory from '../components/ProjectDirectory'

const BackIcon        = () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
const OverviewIcon     = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
const LogsIcon         = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
const ReportIcon       = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18"/><path strokeLinecap="round" strokeLinejoin="round" d="M7 15l3.5-4.5 3 3L19 7"/></svg>
const DocsIcon         = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 2h6l5 5v13a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z"/><path strokeLinecap="round" strokeLinejoin="round" d="M14 2v5h5M9 13h6M9 17h6"/></svg>
const RfiIcon          = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M9.5 9.2a2.5 2.5 0 115 .3c0 1.5-2.5 1.8-2.5 3.5"/><circle cx="12" cy="12" r="9"/></svg>
const SubmittalsIcon   = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="6" y="4" width="12" height="17" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 3.5h6a1 1 0 011 1V6H8V4.5a1 1 0 011-1z"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 11l2 2 4-4"/></svg>
const PunchIcon        = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 11l3 3L22 4"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
const DirectoryIcon    = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="4" y="3" width="16" height="18" rx="1.5"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 8h6M9 12h6M9 16h4"/></svg>
const UsersIconSmall   = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>

// The middle layer of the "Russian doll": everything about ONE project
// lives here. Desktop gets a wide two-column layout — a floating (sticky)
// vertical submenu on the left, content on the right — mobile keeps the
// horizontal scrollable tab strip from before.
const TAB_KEYS = ['overview', 'daily-logs', 'weekly-reports', 'documents', 'rfis', 'submittals', 'punch-list', 'directory']

export default function ProjectDetail() {
  const { projectNumber } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [project, setProject] = useState(null)
  const [phases, setPhases] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  // Deep-links (e.g. from a notification) arrive as ?tab=daily-logs&log=123 —
  // land on that tab directly instead of always defaulting to overview.
  const requestedTab = searchParams.get('tab')
  const [tab, setTab] = useState(TAB_KEYS.includes(requestedTab) ? requestedTab : 'overview')
  // Captured out of the URL once (the child tab components consume these
  // to jump to/open a specific item — see e.g. DocumentsBoard's targetDocId
  // handling). The URL itself is stripped of them right after, purely for
  // a clean address bar — switching tabs only changes local `tab` state,
  // never the URL, so left alone these would sit in the URL forever. The
  // VALUES here deliberately stay in state though (not nulled): a child's
  // own data fetch is async, and clearing this before that resolves would
  // race it — the actual "don't re-trigger on a later remount" guard lives
  // in each child via utils/consumeOnce (sessionStorage-backed, so it
  // survives the remount that clearing this value here could not solve
  // safely on its own).
  const [targetLogId] = useState(() => searchParams.get('log'))
  const [targetReportId] = useState(() => searchParams.get('report'))
  const [targetDocId] = useState(() => searchParams.get('doc'))
  const [targetSubmittalId] = useState(() => searchParams.get('submittal'))
  const [targetItemId] = useState(() => searchParams.get('item'))
  const [phasesManagerOpen, setPhasesManagerOpen] = useState(false)

  useEffect(() => {
    if (!targetLogId && !targetReportId && !targetDocId && !targetSubmittalId && !targetItemId) return
    const next = new URLSearchParams(searchParams)
    next.delete('log'); next.delete('report'); next.delete('doc'); next.delete('submittal'); next.delete('item')
    setSearchParams(next, { replace: true })
    // Runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadPhases = () => listPhases(projectNumber).then((data) => setPhases(data.phases ?? [])).catch(() => {})

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getProject(projectNumber),
      listPhases(projectNumber).catch(() => ({ phases: [] })),
      getProjectClients(projectNumber).catch(() => ({ clients: [] })),
    ])
      .then(([projectData, phaseData, clientData]) => {
        setProject(projectData.project)
        setPhases(phaseData.phases ?? [])
        setClients(clientData.clients ?? [])
      })
      .catch(() => navigate('/', { replace: true }))
      .finally(() => setLoading(false))
  }, [projectNumber, navigate])

  const TABS = [
    { key: 'overview',    label: t('projectDetail.overview'), icon: <OverviewIcon /> },
    { key: 'daily-logs',  label: t('nav.dailyLogs'), icon: <LogsIcon /> },
    { key: 'weekly-reports', label: t('nav.weeklyReports'), icon: <ReportIcon /> },
    { key: 'documents',   label: t('nav.documents'), icon: <DocsIcon /> },
    { key: 'rfis',        label: t('nav.rfis'),       icon: <RfiIcon /> },
    { key: 'submittals',  label: t('nav.submittals'), icon: <SubmittalsIcon /> },
    { key: 'punch-list',  label: t('nav.punchList'),  icon: <PunchIcon /> },
    { key: 'directory',   label: t('nav.directory'),  icon: <DirectoryIcon /> },
  ]

  if (loading) return <Spinner />
  if (!project) return null

  const tabContent = (
    <>
      {tab === 'overview'    && <TimelineTab projectNumber={projectNumber} canManagePhases phases={phases} onManagePhases={() => setPhasesManagerOpen(true)} />}
      {tab === 'daily-logs'  && <DailyLogsTab projectNumber={projectNumber} location={project.client_address} targetLogId={targetLogId} />}
      {tab === 'weekly-reports' && <WeeklyReportsTab projectNumber={projectNumber} targetReportId={targetReportId} />}
      {tab === 'documents'   && <DocumentsTab projectNumber={projectNumber} targetDocId={targetDocId} />}
      {tab === 'rfis'        && <ComingSoonTab subtitle={t('rfis.subtitle')} />}
      {tab === 'submittals'  && <SubmittalsTab projectNumber={projectNumber} targetSubmittalId={targetSubmittalId} />}
      {tab === 'punch-list'  && <PunchListTab projectNumber={projectNumber} targetItemId={targetItemId} />}
      {tab === 'directory'   && <ProjectDirectory projectNumber={projectNumber} fetchContacts={getProjectContacts} />}
    </>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <Link to="/" className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-600 mb-2 transition-colors">
          <BackIcon /> {t('projects.title')}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          #{project.project_number}
          {project.client_name && <> · {project.client_name}</>}
        </p>

        <div className="flex flex-wrap gap-2 mt-3">
          <PhaseStepperPill phases={phases} onClick={() => setPhasesManagerOpen(true)} />
          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full pl-2.5 pr-3 py-1 text-xs font-medium text-gray-700">
            <UsersIconSmall s="w-3.5 h-3.5 text-brand-500" />
            {clients.length === 0 ? t('projectDetail.noClientsAssigned') : clients.map((c) => c.name).join(', ')}
          </div>
        </div>
      </div>

      <PhasesManagerModal
        isOpen={phasesManagerOpen}
        onClose={() => setPhasesManagerOpen(false)}
        projectNumber={projectNumber}
        phases={phases}
        onChange={loadPhases}
      />

      {/* ── Mobile: horizontal tab strip ──────────────────── */}
      <div className="lg:hidden flex gap-1 overflow-x-auto -mx-4 px-4 border-b border-gray-200">
        {TABS.map((tb) => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
              tab === tb.key ? 'border-brand-500 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {tb.icon}{tb.label}
          </button>
        ))}
      </div>

      {/* Desktop floating submenu (left) + shared content mount (right) —
          tabContent renders exactly ONCE; only the surrounding chrome
          (aside, card styling) is responsive, so switching viewport size
          never double-mounts a tab's data fetches. */}
      <div className="lg:flex lg:gap-6 lg:items-start">
        <aside className="hidden lg:block lg:sticky lg:top-6 w-56 shrink-0">
          <nav className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 flex flex-col gap-0.5">
            {TABS.map((tb) => (
              <button key={tb.key} onClick={() => setTab(tb.key)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-colors ${
                  tab === tb.key ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}>
                {tb.icon}{tb.label}
              </button>
            ))}
          </nav>
        </aside>
        <div className="flex-1 min-w-0 lg:bg-white lg:rounded-2xl lg:shadow-sm lg:border lg:border-gray-100 lg:p-6">
          {tabContent}
        </div>
      </div>
    </div>
  )
}
