import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import WeeklyReportCard from '../../../components/WeeklyReportCard'
import { listPortalWeeklyReports } from '../../../api/portal'

// Read-only — scoped to a single project (still constrained server-side to
// client_project_access). No create affordance anywhere on this side.
export default function WeeklyReportsTab({ projectNumber, targetReportId }) {
  const { t } = useTranslation()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const jumpedToTargetRef = useRef(false)
  const reportRefs = useRef({})

  useEffect(() => {
    listPortalWeeklyReports({ project_number: projectNumber })
      .then((data) => setReports(data.weeklyReports ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectNumber])

  useEffect(() => {
    if (!targetReportId || jumpedToTargetRef.current || reports.length === 0) return
    const el = reportRefs.current[targetReportId]
    if (!el) return
    jumpedToTargetRef.current = true
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [targetReportId, reports])

  if (loading) return <p className="text-sm text-gray-400">{t('common.loading')}</p>

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500">{t('weeklyReports.subtitle')}</p>
      {reports.length === 0 ? (
        <p className="text-sm text-gray-400">{t('weeklyReports.noReportsYet')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((report) => (
            <WeeklyReportCard key={report.id} report={report}
              highlighted={String(report.id) === String(targetReportId)}
              innerRef={(el) => { reportRefs.current[report.id] = el }} />
          ))}
        </div>
      )}
    </div>
  )
}
