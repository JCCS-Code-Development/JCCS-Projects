import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import Button from './ui/Button'
import Input from './ui/Input'
import Modal from './ui/Modal'
import VersionHistoryModal from './VersionHistoryModal'
import DocumentThumbnail from './DocumentThumbnail'
import DocumentPreviewModal from './DocumentPreviewModal'
import { SUBMITTAL_STATUSES } from '../api/submittals'
import { consumeOnce } from '../utils/consumeOnce'

const HistoryIcon = ({ s = 'w-3.5 h-3.5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l2.5 1.5"/><circle cx="12" cy="12" r="9"/></svg>
const UploadIcon   = ({ s = 'w-3.5 h-3.5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7 9m5-5l5 5M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/></svg>

const STATUS_STYLES = {
  pending:            'bg-gray-100 text-gray-600',
  approved:           'bg-emerald-100 text-emerald-700',
  approved_as_noted:  'bg-teal-100 text-teal-700',
  revise_resubmit:    'bg-amber-100 text-amber-700',
  rejected:           'bg-red-100 text-red-700',
}

function fmtDate(d) {
  if (!d) return null
  try { return format(d.includes?.('T') || d.includes?.(' ') ? new Date(d.replace(' ', 'T')) : parseISO(d), 'MMM d, yyyy') }
  catch { return d }
}

// Shared between the staff and client-portal Submittals tabs. Staff pass
// createSubmittal/updateStatus/addVersion — their presence turns on the
// create/review/resubmit affordances; the portal side only ever passes
// fetch functions, so it renders fully read-only (status badges + version
// history) with zero extra branching.
export default function SubmittalsBoard({ projectNumber, fetchSubmittals, fetchVersions, createSubmittal, updateStatus, addVersion, targetSubmittalId }) {
  const { t } = useTranslation()
  const canManage = !!createSubmittal
  const fileRef = useRef(null)
  const rowRefs = useRef({})

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ title: '', spec_section: '', due_date: '', notes: '' })
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [versionModal, setVersionModal] = useState(null) // { id, title }
  const [versions, setVersions] = useState([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [resubmitTarget, setResubmitTarget] = useState(null)
  const [preview, setPreview] = useState(null) // { version, title }

  const load = useCallback(() => {
    setLoading(true)
    fetchSubmittals({ project_number: projectNumber })
      .then((data) => setRows(data.submittals ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectNumber, fetchSubmittals])

  useEffect(load, [load])

  // consumeOnce guards the scroll (not a plain ref) since this component
  // remounts fresh every time the Submittals tab is revisited.
  useEffect(() => {
    if (!targetSubmittalId || rows.length === 0) return
    const el = rowRefs.current[targetSubmittalId]
    if (!el) return
    if (!consumeOnce(`submittal-scroll:${targetSubmittalId}`)) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [targetSubmittalId, rows])

  const openCreate = () => {
    setForm({ title: '', spec_section: '', due_date: '', notes: '' }); setFile(null); setError(''); setCreateOpen(true)
  }

  const openHistory = (row) => {
    setVersionModal({ id: row.id, title: `#${row.submittal_number} — ${row.title}` })
    setVersionsLoading(true)
    fetchVersions(row.id)
      .then((data) => setVersions(data.versions ?? []))
      .catch(() => setVersions([]))
      .finally(() => setVersionsLoading(false))
  }

  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { setError(t('submittals.titleRequired')); return }
    if (!file) { setError(t('submittals.fileRequired')); return }
    setSaving(true); setError('')
    try {
      await createSubmittal({ project_number: projectNumber, title: form.title, spec_section: form.spec_section, due_date: form.due_date, notes: form.notes }, file)
      setCreateOpen(false)
      load()
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (id, status) => {
    try { await updateStatus(id, status); load() } catch { /* select just reverts on next load */ }
  }

  const handleResubmitFile = async (e) => {
    const f = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!f || !resubmitTarget) return
    try {
      await addVersion(resubmitTarget, f, '')
      load()
      if (versionModal?.id === resubmitTarget) openHistory({ id: resubmitTarget, submittal_number: '', title: versionModal.title })
    } catch {
      // swallow — button stays clickable to retry
    } finally {
      setResubmitTarget(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{t('submittals.subtitle')}</p>
        {canManage && <Button size="sm" onClick={openCreate}>{t('submittals.newSubmittal')}</Button>}
      </div>

      {canManage && <input ref={fileRef} type="file" className="hidden" onChange={handleResubmitFile} />}

      {loading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">{t('submittals.noSubmittals')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.id} ref={(el) => { rowRefs.current[row.id] = el }}
              className={`bg-white rounded-2xl border shadow-sm px-5 py-4 flex flex-col gap-3 transition-shadow ${
                String(row.id) === String(targetSubmittalId) ? 'border-brand-300 ring-2 ring-brand-100' : 'border-gray-100'
              }`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {row.latest_version && (
                    <button type="button" onClick={() => setPreview({ version: row.latest_version, title: `#${row.submittal_number} — ${row.title}` })} className="shrink-0">
                      <DocumentThumbnail filename={row.latest_version.original_filename} url={row.latest_version.url} />
                    </button>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">#{row.submittal_number} — {row.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {row.spec_section && <>{t('submittals.specSection')}: {row.spec_section} · </>}
                      {t('submittals.submittedBy', { name: row.submitted_by_name })}
                      {row.due_date && <> · {t('submittals.due', { date: fmtDate(row.due_date) })}</>}
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${STATUS_STYLES[row.status]}`}>
                  {t(`submittals.status.${row.status}`)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => openHistory(row)}
                  className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-brand-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                  <HistoryIcon /> {t('documents.versionHistory')} ({row.version_count})
                </button>
                {canManage && (
                  <>
                    <button type="button" onClick={() => { setResubmitTarget(row.id); fileRef.current?.click() }}
                      className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-brand-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                      <UploadIcon /> {t('submittals.resubmit')}
                    </button>
                    <select value={row.status} onChange={(e) => handleStatusChange(row.id, e.target.value)}
                      className="ml-auto text-xs font-semibold border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-brand-500 text-gray-700">
                      {SUBMITTAL_STATUSES.map((s) => <option key={s} value={s}>{t(`submittals.status.${s}`)}</option>)}
                    </select>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <VersionHistoryModal isOpen={!!versionModal} onClose={() => setVersionModal(null)}
        title={versionModal?.title} versions={versions} loading={versionsLoading} />

      <DocumentPreviewModal isOpen={!!preview} onClose={() => setPreview(null)}
        version={preview?.version} title={preview?.title} />

      {canManage && (
        <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={t('submittals.newSubmittal')}>
          <form onSubmit={handleCreateSubmit} className="flex flex-col gap-4">
            <Input label={t('submittals.docTitle')} value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <Input label={`${t('submittals.specSection')} (${t('common.optional')})`} value={form.spec_section}
              onChange={(e) => setForm((f) => ({ ...f, spec_section: e.target.value }))} />
            <Input label={`${t('submittals.dueDate')} (${t('common.optional')})`} type="date" value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{t('documents.notes')} ({t('common.optional')})</label>
              <textarea rows={2}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{t('documents.file')}</label>
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-brand-100 file:text-brand-700 file:text-sm file:font-semibold hover:file:bg-brand-100/70" />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <Button type="submit" fullWidth loading={saving}>{t('submittals.newSubmittal')}</Button>
          </form>
        </Modal>
      )}
    </div>
  )
}
