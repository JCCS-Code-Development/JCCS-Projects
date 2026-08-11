import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { startOfWeek, format } from 'date-fns'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import WeeklyReportCard from '../../components/WeeklyReportCard'
import { listWeeklyReports, createWeeklyReport } from '../../api/weeklyReports'

const defaultWeekStart = () => format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
const emptyForm = { week_start: defaultWeekStart(), summary: '', accomplishments: '', delays_issues: '', next_week_plan: '' }

// Scoped to a single project (no project picker — we're already inside
// one). Unlike Daily Logs, this isn't calendar-first — reports are
// infrequent (one per week at most) so a simple newest-first list is enough.
export default function WeeklyReportsTab({ projectNumber, targetReportId }) {
  const { t } = useTranslation()

  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const jumpedToTargetRef = useRef(false)
  const reportRefs = useRef({})

  const load = useCallback(() => {
    setLoading(true)
    listWeeklyReports({ project_number: projectNumber })
      .then((data) => setReports(data.weeklyReports ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectNumber])

  useEffect(load, [load])

  useEffect(() => {
    if (!targetReportId || jumpedToTargetRef.current || reports.length === 0) return
    const el = reportRefs.current[targetReportId]
    if (!el) return
    jumpedToTargetRef.current = true
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [targetReportId, reports])

  const openModal = () => {
    setForm({ ...emptyForm, week_start: defaultWeekStart() }); setError(''); setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.summary.trim()) { setError(t('weeklyReports.summaryRequired')); return }
    setSaving(true)
    setError('')
    try {
      await createWeeklyReport({ ...form, project_number: projectNumber })
      setModalOpen(false)
      load()
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{t('weeklyReports.subtitle')}</p>
        <Button size="sm" onClick={openModal}>{t('weeklyReports.newReport')}</Button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : reports.length === 0 ? (
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

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={t('weeklyReports.newReport')}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label={t('weeklyReports.weekStart')} type="date" value={form.week_start}
            onChange={(e) => setForm((f) => ({ ...f, week_start: e.target.value }))} />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{t('weeklyReports.summary')}</label>
            <textarea rows={3} placeholder={t('weeklyReports.summaryPlaceholder')}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{t('weeklyReports.accomplishments')} ({t('common.optional')})</label>
            <textarea rows={2} placeholder={t('weeklyReports.accomplishmentsPlaceholder')}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              value={form.accomplishments}
              onChange={(e) => setForm((f) => ({ ...f, accomplishments: e.target.value }))} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{t('weeklyReports.delaysIssues')} ({t('common.optional')})</label>
            <textarea rows={2} placeholder={t('weeklyReports.delaysIssuesPlaceholder')}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              value={form.delays_issues}
              onChange={(e) => setForm((f) => ({ ...f, delays_issues: e.target.value }))} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{t('weeklyReports.nextWeekPlan')} ({t('common.optional')})</label>
            <textarea rows={2} placeholder={t('weeklyReports.nextWeekPlanPlaceholder')}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              value={form.next_week_plan}
              onChange={(e) => setForm((f) => ({ ...f, next_week_plan: e.target.value }))} />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button type="submit" fullWidth loading={saving}>{t('weeklyReports.saveReport')}</Button>
        </form>
      </Modal>
    </div>
  )
}
