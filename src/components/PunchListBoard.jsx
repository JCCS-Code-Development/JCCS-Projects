import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import Button from './ui/Button'
import Input from './ui/Input'
import Modal from './ui/Modal'
import DocumentThumbnail from './DocumentThumbnail'
import DocumentPreviewModal from './DocumentPreviewModal'
import { consumeOnce } from '../utils/consumeOnce'

const UploadIcon   = ({ s = 'w-3.5 h-3.5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7 9m5-5l5 5M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/></svg>
const LocationIcon = ({ s = 'w-3.5 h-3.5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>

const STATUS_STYLES = {
  open:              'bg-amber-100 text-amber-700',
  ready_for_review:  'bg-blue-100 text-blue-700',
  closed:            'bg-emerald-100 text-emerald-700',
}
const PUNCH_STATUSES = ['open', 'ready_for_review', 'closed']

function fmtDate(d) {
  if (!d) return null
  try { return format(d.includes?.('T') || d.includes?.(' ') ? new Date(d.replace(' ', 'T')) : parseISO(d), 'MMM d, yyyy') }
  catch { return d }
}

function PhotoStrip({ label, photos, onPreview }) {
  if (!photos || photos.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {photos.map((p) => (
          <button key={p.id} type="button" onClick={() => onPreview(p, label)}>
            <DocumentThumbnail filename={`photo-${p.id}.jpg`} url={p.url} size="w-14 h-14" />
          </button>
        ))}
      </div>
    </div>
  )
}

// Shared between the staff and client-portal Punch List tabs. Unlike
// Documents/Submittals, BOTH sides pass createItem — either staff or a
// client can flag a deficiency (a client walking their own site is a
// normal source of one). updateStatus/addPhoto are staff-exclusive though:
// their presence is what turns on the status control and "+ after photo"
// affordance; the portal side never gets a status verb at all.
export default function PunchListBoard({ projectNumber, fetchItems, createItem, updateStatus, addPhoto, targetItemId }) {
  const { t } = useTranslation()
  const isStaff = !!updateStatus
  const fileRef = useRef(null)
  const itemRefs = useRef({})

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', location_note: '', due_date: '' })
  const [photos, setPhotos] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [addPhotoTarget, setAddPhotoTarget] = useState(null)
  const [preview, setPreview] = useState(null) // { version, title }

  const load = useCallback(() => {
    setLoading(true)
    fetchItems({ project_number: projectNumber })
      .then((data) => setItems(data.punchItems ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectNumber, fetchItems])

  useEffect(load, [load])

  // consumeOnce guards this (not a plain ref) since this component remounts
  // fresh every time the Punch List tab is revisited.
  useEffect(() => {
    if (!targetItemId || items.length === 0) return
    const el = itemRefs.current[targetItemId]
    if (!el) return
    if (!consumeOnce(`punch-scroll:${targetItemId}`)) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [targetItemId, items])

  const openCreate = () => {
    setForm({ title: '', description: '', location_note: '', due_date: '' }); setPhotos([]); setError(''); setCreateOpen(true)
  }

  const handleFilesChosen = (e) => {
    setPhotos((prev) => [...prev, ...Array.from(e.target.files ?? [])])
    if (fileRef.current) fileRef.current.value = ''
  }
  const removePhoto = (i) => setPhotos((prev) => prev.filter((_, idx) => idx !== i))

  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { setError(t('punchList.titleRequired')); return }
    if (photos.length === 0) { setError(t('punchList.photosRequired')); return }
    setSaving(true); setError('')
    try {
      const payload = { project_number: projectNumber, title: form.title, description: form.description, location_note: form.location_note }
      if (isStaff && form.due_date) payload.due_date = form.due_date
      await createItem(payload, photos)
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

  const handleAddPhotoFile = async (e) => {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file || !addPhotoTarget) return
    try {
      await addPhoto(addPhotoTarget, file, 'after')
      load()
    } catch {
      // swallow — button stays clickable to retry
    } finally {
      setAddPhotoTarget(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{t('punchList.subtitle')}</p>
        <Button size="sm" onClick={openCreate}>{t('punchList.newItem')}</Button>
      </div>

      {isStaff && <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAddPhotoFile} />}

      {loading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400">{t('punchList.noItems')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <div key={item.id} ref={(el) => { itemRefs.current[item.id] = el }}
              className={`bg-white rounded-2xl border shadow-sm px-5 py-4 flex flex-col gap-3 transition-shadow ${
                String(item.id) === String(targetItemId) ? 'border-brand-300 ring-2 ring-brand-100' : 'border-gray-100'
              }`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900">{item.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5 flex flex-wrap items-center gap-x-1.5">
                    {item.location_note && (
                      <span className="flex items-center gap-1"><LocationIcon s="w-3 h-3" /> {item.location_note}</span>
                    )}
                    <span>{t('punchList.flaggedBy', { name: item.created_by_name })}</span>
                    {item.due_date && <span>· {t('punchList.due', { date: fmtDate(item.due_date) })}</span>}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${STATUS_STYLES[item.status]}`}>
                  {t(`punchList.status.${item.status}`)}
                </span>
              </div>

              {item.description && <p className="text-sm text-gray-700 whitespace-pre-line">{item.description}</p>}

              <div className="flex flex-wrap gap-4">
                <PhotoStrip label={t('punchList.before')} photos={item.before_photos} onPreview={(p, l) => setPreview({ version: { url: p.url, original_filename: `${item.title}.jpg` }, title: `${item.title} — ${l}` })} />
                <PhotoStrip label={t('punchList.after')} photos={item.after_photos} onPreview={(p, l) => setPreview({ version: { url: p.url, original_filename: `${item.title}.jpg` }, title: `${item.title} — ${l}` })} />
              </div>

              {isStaff && (
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-50">
                  <button type="button" onClick={() => { setAddPhotoTarget(item.id); fileRef.current?.click() }}
                    className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-brand-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                    <UploadIcon /> {t('punchList.addAfterPhoto')}
                  </button>
                  <select value={item.status} onChange={(e) => handleStatusChange(item.id, e.target.value)}
                    className="ml-auto text-xs font-semibold border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-brand-500 text-gray-700">
                    {PUNCH_STATUSES.map((s) => <option key={s} value={s}>{t(`punchList.status.${s}`)}</option>)}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <DocumentPreviewModal isOpen={!!preview} onClose={() => setPreview(null)}
        version={preview?.version} title={preview?.title} />

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={t('punchList.newItem')}>
        <form onSubmit={handleCreateSubmit} className="flex flex-col gap-4">
          <Input label={t('punchList.itemTitle')} value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Input label={`${t('punchList.location')} (${t('common.optional')})`} value={form.location_note}
            onChange={(e) => setForm((f) => ({ ...f, location_note: e.target.value }))} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{t('documents.notes')} ({t('common.optional')})</label>
            <textarea rows={3}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          {isStaff && (
            <Input label={`${t('punchList.dueDate')} (${t('common.optional')})`} type="date" value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
          )}

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">{t('dailyLogs.photos')}</label>
            <input type="file" accept="image/*" capture="environment" multiple className="hidden"
              onChange={handleFilesChosen} id="punch-item-photos" />
            <Button type="button" variant="secondary" onClick={() => document.getElementById('punch-item-photos')?.click()}>
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
          <Button type="submit" fullWidth loading={saving}>{t('punchList.newItem')}</Button>
        </form>
      </Modal>
    </div>
  )
}
