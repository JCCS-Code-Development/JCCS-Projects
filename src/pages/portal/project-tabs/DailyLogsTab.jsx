import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  addMonths, subMonths, format, isSameMonth, isToday, parseISO,
} from 'date-fns'
import { listPortalDailyLogs, listPortalDailyLogComments, createPortalDailyLogComment } from '../../../api/portal'
import DailyLogCard from '../../../components/DailyLogCard'
import { consumeOnce } from '../../../utils/consumeOnce'

const ChevronLeft  = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
const ChevronRight = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>

// Read-only — scoped to a single project (via the ?project_number filter,
// still constrained server-side to client_project_access). No create/edit
// affordances on the log content anywhere, by design — the one exception is
// the comment thread inside DailyLogCard, which is genuinely two-way.
export default function DailyLogsTab({ projectNumber, location, targetLogId }) {
  const { t } = useTranslation()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  useEffect(() => {
    listPortalDailyLogs({ project_number: projectNumber })
      .then((data) => setLogs(data.dailyLogs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectNumber])

  // Deep-link from a notification: once the target log shows up in the
  // loaded list, jump the calendar to its date — only once. consumeOnce
  // (not a plain ref) is what makes that "once" hold across remounts too —
  // this component remounts fresh every time the Daily Logs tab is revisited.
  useEffect(() => {
    if (!targetLogId) return
    const match = logs.find((l) => String(l.id) === String(targetLogId))
    if (!match) return
    if (!consumeOnce(`log-jump:${targetLogId}`)) return
    setSelectedDate(match.log_date)
    setViewMonth(startOfMonth(parseISO(match.log_date)))
  }, [targetLogId, logs])

  const logsByDate = useMemo(() => {
    const map = {}
    for (const log of logs) {
      (map[log.log_date] ??= []).push(log)
    }
    return map
  }, [logs])

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(viewMonth)
    const monthEnd = endOfMonth(viewMonth)
    return eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(monthEnd) })
  }, [viewMonth])

  const weekdayLabels = calendarDays.slice(0, 7).map((d) => format(d, 'EEE'))
  const selectedLogs = logsByDate[selectedDate] ?? []

  if (loading) return <p className="text-sm text-gray-400">{t('common.loading')}</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
          <button onClick={() => setViewMonth((m) => subMonths(m, 1))}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors">
            <ChevronLeft />
          </button>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">{format(viewMonth, 'MMMM yyyy')}</p>
            {!isSameMonth(viewMonth, new Date()) && (
              <button onClick={() => setViewMonth(startOfMonth(new Date()))}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                {t('dailyLogs.today')}
              </button>
            )}
          </div>
          <button onClick={() => setViewMonth((m) => addMonths(m, 1))}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors">
            <ChevronRight />
          </button>
        </div>

        <div className="grid grid-cols-7 text-center border-b border-gray-100">
          {weekdayLabels.map((label) => (
            <div key={label} className="py-1.5 text-[11px] font-semibold text-gray-400 uppercase">{label}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {calendarDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd')
            const inMonth = isSameMonth(day, viewMonth)
            const dayLogs = logsByDate[key] ?? []
            const selected = key === selectedDate
            return (
              <button key={key} onClick={() => setSelectedDate(key)}
                className={`relative flex flex-col items-center justify-center gap-1 aspect-square lg:aspect-auto lg:h-16 border-b border-r border-gray-50 last:border-r-0 transition-colors ${
                  selected ? 'bg-brand-500' : inMonth ? 'hover:bg-gray-50' : 'bg-gray-50/50'
                }`}>
                <span className={`text-sm ${
                  selected ? 'text-white font-bold'
                  : !inMonth ? 'text-gray-300'
                  : isToday(day) ? 'text-brand-700 font-bold'
                  : 'text-gray-700'
                }`}>
                  {format(day, 'd')}
                </span>
                {dayLogs.length > 0 && (
                  <span className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-white' : 'bg-brand-500'}`} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-gray-900">{format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}</p>
        {selectedLogs.length === 0 ? (
          <p className="text-sm text-gray-400">{t('dailyLogs.noLogsThisDay')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {selectedLogs.map((log) => (
              <DailyLogCard key={log.id} log={log} location={location}
                listComments={listPortalDailyLogComments} createComment={createPortalDailyLogComment} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
