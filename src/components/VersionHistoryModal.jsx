import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import Modal from './ui/Modal'
import DocumentThumbnail from './DocumentThumbnail'
import DocumentPreviewModal from './DocumentPreviewModal'

const DownloadIcon = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v13m0 0l-4-4m4 4l4-4M4 19h16"/></svg>
const EyeIcon      = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>

function fmt(ts) {
  try { return format(ts.includes('T') || ts.includes(' ') ? new Date(ts.replace(' ', 'T')) : parseISO(ts), 'MMM d, yyyy · h:mm a') }
  catch { return ts }
}

// Shared between staff and client-portal — "show a history if prompted to":
// this IS that prompt, opened from a "Version history" button/badge next to
// any document. Every version ever uploaded stays listed (append-only), the
// current one flagged, newest first. Preview opens in-page (DocumentPreviewModal,
// stacked on top of this one) — Download uses the `download` attribute so it
// saves the file instead of navigating to it; neither ever opens a new tab.
export default function VersionHistoryModal({ isOpen, onClose, title, versions, loading }) {
  const { t } = useTranslation()
  const [previewVersion, setPreviewVersion] = useState(null)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title ?? t('documents.versionHistory')} size="lg">
      {loading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : versions.length === 0 ? (
        <p className="text-sm text-gray-400">{t('documents.noVersions')}</p>
      ) : (
        <div className="flex flex-col divide-y divide-gray-100 -mx-6">
          {versions.map((v, i) => (
            <div key={v.id} className="px-6 py-3 flex items-center gap-3">
              <button type="button" onClick={() => setPreviewVersion(v)} className="shrink-0">
                <DocumentThumbnail filename={v.original_filename} url={v.url} size="w-12 h-12" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  {t('documents.versionLabel', { number: v.version_number })}
                  {i === 0 && (
                    <span className="text-[10px] font-bold bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                      {t('documents.current')}
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500 truncate">{v.original_filename}</p>
                {v.notes && <p className="text-xs text-gray-500 mt-0.5">{v.notes}</p>}
                <p className="text-[11px] text-gray-400 mt-0.5">{t('documents.uploadedBy', { name: v.uploaded_by_name, date: fmt(v.uploaded_at) })}</p>
              </div>
              <div className="flex flex-col items-stretch gap-1 shrink-0">
                <button type="button" onClick={() => setPreviewVersion(v)}
                  className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 px-2.5 py-1.5 rounded-lg hover:bg-brand-100/50 transition-colors">
                  <EyeIcon s="w-3.5 h-3.5" /> {t('documents.preview')}
                </button>
                <a href={v.url} download={v.original_filename}
                  className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  <DownloadIcon s="w-3.5 h-3.5" /> {t('documents.download')}
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      <DocumentPreviewModal isOpen={!!previewVersion} onClose={() => setPreviewVersion(null)}
        version={previewVersion} title={title} />
    </Modal>
  )
}
