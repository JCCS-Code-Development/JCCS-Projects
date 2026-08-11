import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  addMonths, subMonths, format, isSameMonth, isToday, parseISO,
} from 'date-fns'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import DailyLogCard from '../../components/DailyLogCard'
import { useToast } from '../../components/ToastProvider'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { listDailyLogs, createDailyLog, listDailyLogComments, createDailyLogComment } from '../../api/dailyLogs'
import { enqueueDailyLog, getQueuedCount, flushDailyLogQueue } from '../../utils/offlineQueue'

const ChevronLeft  = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
const ChevronRight = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>

const todayStr = () => format(new Date(), 'yyyy-MM-dd')
const emptyForm = { log_date: todayStr(), crew_count: '', work_performed: '', delays: '', notes: '' }

// Scoped to a single project (no project picker — we're already inside one).
// A month calendar is the primary view — each day with a log gets a dot,
// clicking a day shows that day's full log card(s) below (see
// components/DailyLogCard.jsx) and pre-fills the date when adding a new one.
export default function DailyLogsTab({ projectNumber, location, targetLogId }) {
  const { t } = useTranslation()
  const toast = useToast()
  const isOnline = useOnlineStatus()
  const fileRef = useRef(null)

  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [photos, setPhotos] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const jumpedToTargetRef = useRef(false)

  const load = useCallback(() => {
    setLoading(true)
    listDailyLogs({ project_number: projectNumber })
      .then((data) => setLogs(data.dailyLogs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectNumber])

  useEffect(load, [load])
  useEffect(() => { getQueuedCount().then(setPendingCount) }, [])

  // Deep-link from a notification: once the target log shows up in the
  // loaded list, jump the calendar to its date — only once, so a manual
  // date click afterward (or a reload triggered by creating a new log)
  // doesn't yank the user back.
  useEffect(() => {
    if (!targetLogId || jumpedToTargetRef.current) return
    const match = logs.find((l) => String(l.id) === String(targetLogId))
    if (!match) return
    jumpedToTargetRef.current = true
    setSelectedDate(match.log_date)
    setViewMonth(startOfMonth(parseISO(match.log_date)))
  }, [targetLogId, logs])

  useEffect(() => {
    if (!isOnline) return
    flushDailyLogQueue().then((synced) => {
      getQueuedCount().then(setPendingCount)
      if (synced > 0) {
        toast.success(t('dailyLogs.syncedSuccess', { count: synced }))
        load()
      }
    })
  }, [isOnline, load, t, toast])

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

  const openModal = (date = selectedDate) => {
    setForm({ ...emptyForm, log_date: date }); setPhotos([]); setError(''); setModalOpen(true)
  }

  const handleFilesChosen = (e) => {
    setPhotos((prev) => [...prev, ...Array.from(e.target.files ?? [])])
    if (fileRef.current) fileRef.current.value = ''
  }

  const removePhoto = (i) => setPhotos((prev) => prev.filter((_, idx) => idx !== i))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.work_performed.trim()) { setError(t('dailyLogs.workRequired')); return }
    if (photos.length === 0) { setError(t('dailyLogs.photosRequired')); return }

    const payload = { ...form, project_number: projectNumber, crew_count: form.crew_count ? Number(form.crew_count) : null }
    setSaving(true)
    setError('')
    try {
      if (!navigator.onLine) throw new Error('offline')
      await createDailyLog(payload, photos)
      setModalOpen(false)
      load()
    } catch (err) {
      if (!navigator.onLine || err?.message === 'offline' || !err?.response) {
        await enqueueDailyLog(payload, photos)
        getQueuedCount().then(setPendingCount)
        toast.info(t('dailyLogs.queuedOffline'))
        setModalOpen(false)
      } else {
        setError(err?.response?.data?.error ?? t('common.couldNotSave'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{t('dailyLogs.subtitle')}</p>
        <Button size="sm" onClick={() => openModal()}>{t('dailyLogs.newLog')}</Button>
      </div>

      {pendingCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium rounded-xl px-4 py-2.5">
          {t('dailyLogs.pendingSync', { count: pendingCount })}
        </div>
      )}

      {/* ── Month calendar ──────────────────────────────── */}
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

      {/* ── Selected day panel ──────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">{format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}</p>
          <button onClick={() => openModal(selectedDate)} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
            {t('dailyLogs.addForDay')}
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">{t('common.loading')}</p>
        ) : selectedLogs.length === 0 ? (
          <p className="text-sm text-gray-400">{t('dailyLogs.noLogsThisDay')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {selectedLogs.map((log) => (
              <DailyLogCard key={log.id} log={log} location={location}
                listComments={listDailyLogComments} createComment={createDailyLogComment} />
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={t('dailyLogs.newLog')}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label={t('dailyLogs.logDate')} type="date" value={form.log_date}
            onChange={(e) => setForm((f) => ({ ...f, log_date: e.target.value }))} />
          <Input label={t('dailyLogs.crewCount')} type="number" inputMode="numeric" value={form.crew_count}
            onChange={(e) => setForm((f) => ({ ...f, crew_count: e.target.value }))} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{t('dailyLogs.workPerformed')}</label>
            <textarea rows={4}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              value={form.work_performed}
              onChange={(e) => setForm((f) => ({ ...f, work_performed: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{t('dailyLogs.delays')} ({t('common.optional')})</label>
            <textarea rows={2}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              value={form.delays}
              onChange={(e) => setForm((f) => ({ ...f, delays: e.target.value }))} />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">{t('dailyLogs.photos')}</label>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleFilesChosen} />
            <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
              {t('dailyLogs.addPhotos')}
            </Button>
            {photos.length > 0 && (
              <>
                <p className="text-xs text-gray-500">{t('dailyLogs.photosSelected', { count: photos.length })}</p>
                <div className="grid grid-cols-4 gap-2">
                  {photos.map((file, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                      <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removePhoto(i)}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button type="submit" fullWidth loading={saving}>{t('dailyLogs.saveLog')}</Button>
        </form>
      </Modal>
    </div>
  )
}
