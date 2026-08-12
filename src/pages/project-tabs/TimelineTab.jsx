import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import Button from '../../components/ui/Button'
import { listDailyLogs } from '../../api/dailyLogs'

const LogIcon   = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
const FlagIcon  = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18M5 4h11l-2 4 2 4H5"/></svg>
const EditIcon  = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>

function fmt(ts) {
  try { return format(ts.includes('T') || ts.includes(' ') ? new Date(ts.replace(' ', 'T')) : parseISO(ts), 'MMM d, yyyy · h:mm a') }
  catch { return ts }
}

// "At a glance" activity feed for the project — merges daily logs and phase
// changes into one reverse-chronological timeline. This is the default tab
// when a project is opened. Extends naturally once Documents/RFIs/
// Submittals/Punch List have real data to contribute events of their own.
export default function TimelineTab({ projectNumber, canManagePhases, phases = [], onManagePhases }) {
  const { t } = useTranslation()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    listDailyLogs({ project_number: projectNumber })
      .then((data) => setLogs(data.dailyLogs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectNumber])

  const events = useMemo(() => {
    const logEvents = logs.map((log) => ({
      id: `log-${log.id}`,
      timestamp: log.created_at,
      icon: <LogIcon />,
      title: t('timeline.dailyLogAdded'),
      detail: log.work_performed,
    }))
    const phaseEvents = phases.map((phase) => ({
      id: `phase-${phase.id}`,
      timestamp: phase.updated_at || phase.created_at,
      icon: <FlagIcon />,
      title:
        phase.status === 'current' ? t('timeline.phaseStarted', { name: phase.name }) :
        phase.status === 'completed' ? t('timeline.phaseCompleted', { name: phase.name }) :
        t('timeline.phaseAdded', { name: phase.name }),
      detail: phase.scope || null,
    }))
    return [...logEvents, ...phaseEvents].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  }, [logs, phases, t])

  if (loading) return <p className="text-sm text-gray-400">{t('common.loading')}</p>

  return (
    <div className="flex flex-col gap-4">
      {canManagePhases && (
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={onManagePhases}>
            <EditIcon /> {t('phases.manage')}
          </Button>
        </div>
      )}

      {events.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">{t('timeline.empty')}</p>
      ) : (
        <div className="flex flex-col">
          {events.map((ev, i) => (
            <div key={ev.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                  {ev.icon}
                </div>
                {i < events.length - 1 && <div className="w-px flex-1 bg-gray-200 my-1" />}
              </div>
              <div className="pb-5 min-w-0">
                <p className="text-xs text-gray-400">{fmt(ev.timestamp)}</p>
                <p className="text-sm font-semibold text-gray-900">{ev.title}</p>
                {ev.detail && <p className="text-sm text-gray-600 mt-0.5">{ev.detail}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
