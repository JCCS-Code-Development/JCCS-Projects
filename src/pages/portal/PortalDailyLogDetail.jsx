import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Spinner from '../../components/ui/Spinner'
import DailyLogCard from '../../components/DailyLogCard'
import { getPortalDailyLog, getPortalProject, listPortalDailyLogComments, createPortalDailyLogComment } from '../../api/portal'

const BackIcon = () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>

// Standalone deep-link target for a single daily log — what a notification
// about a new log or a staff reply points a client at.
export default function PortalDailyLogDetail() {
  const { projectNumber, id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [log, setLog] = useState(null)
  const [location, setLocation] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getPortalDailyLog(id),
      getPortalProject(projectNumber).catch(() => ({ project: null })),
    ])
      .then(([logData, projectData]) => {
        setLog(logData.dailyLog)
        setLocation(projectData.project?.client_address ?? null)
      })
      .catch(() => navigate(`/portal/projects/${projectNumber}`, { replace: true }))
      .finally(() => setLoading(false))
  }, [id, projectNumber, navigate])

  if (loading) return <Spinner />
  if (!log) return null

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <Link to={`/portal/projects/${projectNumber}`} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors">
        <BackIcon /> {t('common.project')} #{log.project_number}
      </Link>
      <DailyLogCard log={log} location={location}
        listComments={listPortalDailyLogComments} createComment={createPortalDailyLogComment} />
    </div>
  )
}
