import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import Button from './ui/Button'
import Input from './ui/Input'
import Modal from './ui/Modal'
import VersionHistoryModal from './VersionHistoryModal'
import DocumentThumbnail from './DocumentThumbnail'
import DocumentPreviewModal from './DocumentPreviewModal'
import { consumeOnce } from '../utils/consumeOnce'

const BlueprintIcon = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="18" height="18" rx="1.5"/><path strokeLinecap="round" strokeLinejoin="round" d="M7 3v18M3 8h4M3 15h4M11 6h7M11 11h7v7h-7z"/></svg>
const ScopeIcon     = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 2h6l5 5v13a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4"/></svg>
const EstimateIcon  = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="5" y="2" width="14" height="20" rx="1.5"/><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0"/></svg>
const ContractIcon  = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 2h6l5 5v13a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z"/><path strokeLinecap="round" strokeLinejoin="round" d="M8 17l2.5-1 2 1.5L15 15"/></svg>
const PermitIcon    = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2l7 3v6c0 5-3 8.5-7 10-4-1.5-7-5-7-10V5z"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4"/></svg>
const HistoryIcon   = ({ s = 'w-3.5 h-3.5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l2.5 1.5"/><circle cx="12" cy="12" r="9"/></svg>
const UploadIcon    = ({ s = 'w-3.5 h-3.5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7 9m5-5l5 5M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/></svg>

// Static, fixed set of divisions — matches the backend ENUM exactly.
// 'estimate' and 'drawing' get pulled into a distinctly-colored PRIORITY row
// up top (they're what people reach for first — the number and the plans);
// the rest sit in the regular grid below. 'estimate' has no upload UI
// anywhere (a reserved placeholder — estimates are meant to eventually
// surface from jccs-inventory's own data), so it renders a fixed
// empty-state card instead of a document list either place.
const PRIORITY_CATEGORIES = [
  { key: 'estimate', icon: EstimateIcon, placeholder: true, colorClass: 'bg-indigo-50 border-indigo-100', headerClass: 'text-indigo-700' },
  { key: 'drawing',  icon: BlueprintIcon, colorClass: 'bg-amber-50 border-amber-100', headerClass: 'text-amber-700' },
]
const STANDARD_CATEGORIES = [
  { key: 'scope',    icon: ScopeIcon },
  { key: 'contract', icon: ContractIcon },
  { key: 'permit',   icon: PermitIcon },
]

function fmtDate(ts) {
  try { return format(ts.includes('T') || ts.includes(' ') ? new Date(ts.replace(' ', 'T')) : parseISO(ts), 'MMM d, yyyy') }
  catch { return ts }
}

function DocumentRow({ doc, canUpload, onPreview, onViewHistory, onAddVersion }) {
  const { t } = useTranslation()
  const v = doc.latest_version
  return (
    <div className="flex items-center gap-2.5 py-2.5">
      <button type="button" onClick={() => v && onPreview(v, doc.title)} className="shrink-0" disabled={!v}>
        <DocumentThumbnail filename={v?.original_filename} url={v?.url} />
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => v && onPreview(v, doc.title)}
          className="text-sm font-semibold text-gray-800 hover:text-brand-600 truncate block text-left w-full">
          {doc.title}
        </button>
        {v && <p className="text-xs text-gray-400 truncate">{v.original_filename} · {fmtDate(v.uploaded_at)}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={onViewHistory} title={t('documents.versionHistory')}
          className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-brand-600 px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors">
          <HistoryIcon /> {doc.version_count}
        </button>
        {canUpload && (
          <button type="button" onClick={onAddVersion} title={t('documents.addVersion')}
            className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-brand-600 px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors">
            <UploadIcon />
          </button>
        )}
      </div>
    </div>
  )
}

function CategoryCard({ category, items, loading, canUpload, onUpload, onPreview, onViewHistory, onAddVersion, colorClass, headerClass }) {
  const { t } = useTranslation()
  const { key, icon: Icon, placeholder } = category
  return (
    <div className={`rounded-2xl border shadow-sm overflow-hidden flex flex-col ${colorClass ?? 'bg-white border-gray-100'}`}>
      <div className="px-4 py-3 border-b border-black/5 flex items-center gap-2">
        <span className={headerClass ?? 'text-brand-500'}><Icon /></span>
        <p className={`text-sm font-bold ${headerClass ?? 'text-gray-900'}`}>{t(`documents.categories.${key}`)}</p>
        {!placeholder && canUpload && (
          <button type="button" onClick={() => onUpload(key)}
            className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700 px-2 py-1 rounded-lg hover:bg-white/60 transition-colors">
            <UploadIcon /> {t('documents.upload')}
          </button>
        )}
      </div>
      <div className="px-4 py-1 flex-1 bg-white/40">
        {placeholder ? (
          <p className="text-xs text-gray-500 py-3">{t('documents.estimatePlaceholder')}</p>
        ) : loading ? (
          <p className="text-sm text-gray-400 py-3">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400 py-3">{t('documents.noDocuments')}</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {items.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} canUpload={canUpload}
                onPreview={onPreview}
                onViewHistory={() => onViewHistory(doc)}
                onAddVersion={() => onAddVersion(doc)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Shared between the staff and client-portal Documents tabs. Staff pass
// createDocument/addDocumentVersion — their presence is what turns on the
// upload affordances; the portal side simply doesn't pass them, so it's
// read-only (plus version history and preview, which both sides get)
// without any other branching.
export default function DocumentsBoard({ projectNumber, fetchDocuments, fetchVersions, createDocument, addDocumentVersion, targetDocId }) {
  const { t } = useTranslation()
  const canUpload = !!createDocument
  const fileRef = useRef(null)

  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadCategory, setUploadCategory] = useState('drawing')
  const [uploadForm, setUploadForm] = useState({ title: '', notes: '' })
  const [uploadFile, setUploadFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [versionModal, setVersionModal] = useState(null) // { docId, title }
  const [versions, setVersions] = useState([])
  const [versionsLoading, setVersionsLoading] = useState(false)

  const [addVersionTarget, setAddVersionTarget] = useState(null) // docId
  const [preview, setPreview] = useState(null) // { version, title }

  const load = useCallback(() => {
    setLoading(true)
    fetchDocuments({ project_number: projectNumber })
      .then((data) => setDocs(data.documents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectNumber, fetchDocuments])

  useEffect(load, [load])

  // Deep-link from a notification (?tab=documents&doc=123) — once the
  // target document shows up, open its version history straight away so
  // the click actually lands somewhere specific, not just "the tab."
  // consumeOnce (sessionStorage-backed) guards this rather than a plain
  // ref, since this component remounts fresh every time the Documents tab
  // is revisited — a ref alone would let it re-fire on every remount.
  useEffect(() => {
    if (!targetDocId || docs.length === 0) return
    const match = docs.find((d) => String(d.id) === String(targetDocId))
    if (!match) return
    if (!consumeOnce(`doc:${targetDocId}`)) return
    openHistory(match)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDocId, docs])

  const byCategory = (key) => docs.filter((d) => d.category === key)

  const openUpload = (category) => {
    setUploadCategory(category); setUploadForm({ title: '', notes: '' }); setUploadFile(null); setError(''); setUploadOpen(true)
  }

  const openHistory = (doc) => {
    setVersionModal({ docId: doc.id, title: doc.title })
    setVersionsLoading(true)
    fetchVersions(doc.id)
      .then((data) => setVersions(data.versions ?? []))
      .catch(() => setVersions([]))
      .finally(() => setVersionsLoading(false))
  }

  const openPreview = (version, title) => setPreview({ version, title })

  const handleUploadSubmit = async (e) => {
    e.preventDefault()
    if (!uploadForm.title.trim()) { setError(t('documents.titleRequired')); return }
    if (!uploadFile) { setError(t('documents.fileRequired')); return }
    setSaving(true); setError('')
    try {
      await createDocument({ project_number: projectNumber, category: uploadCategory, title: uploadForm.title, notes: uploadForm.notes }, uploadFile)
      setUploadOpen(false)
      load()
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally {
      setSaving(false)
    }
  }

  const handleAddVersionFile = async (e) => {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file || !addVersionTarget) return
    try {
      await addDocumentVersion(addVersionTarget, file, '')
      load()
      if (versionModal?.docId === addVersionTarget) openHistory({ id: addVersionTarget, title: versionModal.title })
    } catch {
      // swallow — row stays as-is, staff can retry from the same button
    } finally {
      setAddVersionTarget(null)
    }
  }

  const cardProps = {
    loading, canUpload, onUpload: openUpload, onPreview: openPreview,
    onViewHistory: openHistory,
    onAddVersion: (doc) => { setAddVersionTarget(doc.id); fileRef.current?.click() },
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-gray-500">{t('documents.subtitle')}</p>

      <input ref={fileRef} type="file" className="hidden" onChange={handleAddVersionFile} />

      {/* Priority row — Estimate + Blueprints, visually distinct so they're
          found first without hunting through the full division grid. */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">{t('documents.priorityTitle')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          {PRIORITY_CATEGORIES.map((category) => (
            <CategoryCard key={category.key} category={category} items={category.placeholder ? [] : byCategory(category.key)}
              colorClass={category.colorClass} headerClass={category.headerClass} {...cardProps} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
        {STANDARD_CATEGORIES.map((category) => (
          <CategoryCard key={category.key} category={category} items={byCategory(category.key)} {...cardProps} />
        ))}
      </div>

      <VersionHistoryModal isOpen={!!versionModal} onClose={() => setVersionModal(null)}
        title={versionModal?.title} versions={versions} loading={versionsLoading} />

      <DocumentPreviewModal isOpen={!!preview} onClose={() => setPreview(null)}
        version={preview?.version} title={preview?.title} />

      {canUpload && (
        <Modal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} title={t('documents.uploadTitle', { category: t(`documents.categories.${uploadCategory}`) })}>
          <form onSubmit={handleUploadSubmit} className="flex flex-col gap-4">
            <Input label={t('documents.docTitle')} value={uploadForm.title}
              onChange={(e) => setUploadForm((f) => ({ ...f, title: e.target.value }))} />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{t('documents.notes')} ({t('common.optional')})</label>
              <textarea rows={2}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                value={uploadForm.notes} onChange={(e) => setUploadForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{t('documents.file')}</label>
              <input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                className="text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-brand-100 file:text-brand-700 file:text-sm file:font-semibold hover:file:bg-brand-100/70" />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <Button type="submit" fullWidth loading={saving}>{t('documents.uploadTitle', { category: t(`documents.categories.${uploadCategory}`) })}</Button>
          </form>
        </Modal>
      )}
    </div>
  )
}
