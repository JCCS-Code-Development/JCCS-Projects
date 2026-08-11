import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'

const CalendarIcon = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="4" width="18" height="17" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M8 2v4M16 2v4M3 9h18"/></svg>
const PhaseIcon    = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18M5 4h11l-2 4 2 4H5"/></svg>
const LogIcon      = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 2h6l5 5v13a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z"/><path strokeLinecap="round" strokeLinejoin="round" d="M14 2v5h5M9 13h6M9 17h6"/></svg>

function fmtDate(d) {
  try { return format(parseISO(d), 'MMM d, yyyy') } catch { return d }
}

function Section({ label, text }) {
  if (!text) return null
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-gray-700 whitespace-pre-line">{text}</p>
    </div>
  )
}

// Shared between the staff and client-portal Weekly Reports tabs — a
// higher-level rollup, deliberately not re-showing what a daily log already
// covers (photos, weather, per-day crew). The daily-log-count badge and
// phase snapshot ARE pulled from that daily-log data though, so the report
// still points back at the underlying evidence without repeating it.
export default function WeeklyReportCard({ report, highlighted = false, innerRef }) {
  const { t } = useTranslation()

  return (
    <div ref={innerRef}
      className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-shadow ${
        highlighted ? 'border-brand-300 ring-2 ring-brand-100' : 'border-gray-100'
      }`}>
      <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <CalendarIcon s="w-3.5 h-3.5 text-brand-500" />
            {t('weeklyReports.weekOf', { start: fmtDate(report.week_start), end: fmtDate(report.week_end) })}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{t('weeklyReports.reportedBy', { name: report.created_by_name })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {report.phase_name && (
            <span className="flex items-center gap-1 bg-brand-100 text-brand-900 text-xs font-medium px-2 py-1 rounded-full">
              <PhaseIcon s="w-3 h-3" /> {t('dailyLogs.phaseLabel', { number: report.phase_sequence, name: report.phase_name })}
            </span>
          )}
          <span className="flex items-center gap-1 bg-gray-100 text-gray-600 text-xs font-medium px-2 py-1 rounded-full">
            <LogIcon s="w-3 h-3" /> {t('weeklyReports.dailyLogCount', { count: report.daily_log_count })}
          </span>
        </div>
      </div>

      <div className="px-5 py-4 flex flex-col gap-4">
        <Section label={t('weeklyReports.summary')} text={report.summary} />
        <Section label={t('weeklyReports.accomplishments')} text={report.accomplishments} />
        <Section label={t('weeklyReports.delaysIssues')} text={report.delays_issues} />
        <Section label={t('weeklyReports.nextWeekPlan')} text={report.next_week_plan} />
      </div>
    </div>
  )
}
