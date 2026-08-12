import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { fileKind } from '../utils/fileKind'

const CloseIcon    = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
const DownloadIcon = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v13m0 0l-4-4m4 4l4-4M4 19h16"/></svg>
const FileIcon     = ({ s = 'w-10 h-10' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 2h6l5 5v13a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z"/><path strokeLinecap="round" strokeLinejoin="round" d="M14 2v5h5"/></svg>

// The in-page "exitable pop up" viewer for any document/submittal file —
// images, PDFs, and video render right here (img/iframe/video), nothing
// ever opens a new tab. Word/Excel/CAD files have no browser-native inline
// renderer, so they fall back to a clear "no preview — download to view"
// state instead of pretending to show something. The Download button
// always sits above the preview area, and uses the `download` attribute
// (not target="_blank") so it saves the file rather than navigating anywhere.
export default function DocumentPreviewModal({ isOpen, onClose, version, title }) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen || !version) return null

  const kind = fileKind(version.original_filename)

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6" onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-full flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{title}</p>
            <p className="text-xs text-gray-400 truncate">{version.original_filename}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href={version.url} download={version.original_filename}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 px-3 py-2 rounded-xl transition-colors">
              <DownloadIcon /> {t('documents.download')}
            </a>
            <button type="button" onClick={onClose} aria-label="Close"
              className="text-gray-400 hover:text-gray-600 p-2 rounded-lg transition-colors">
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-gray-100 flex items-center justify-center overflow-auto">
          {kind === 'image' && (
            <img src={version.url} alt={version.original_filename} className="max-w-full max-h-[80vh] object-contain" />
          )}
          {kind === 'video' && (
            <video src={version.url} controls autoPlay className="max-w-full max-h-[80vh]" />
          )}
          {kind === 'pdf' && (
            <iframe src={version.url} title={version.original_filename} className="w-full h-[80vh] bg-white border-0" />
          )}
          {kind !== 'image' && kind !== 'video' && kind !== 'pdf' && (
            <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
              <FileIcon />
              <p className="text-sm">{t('documents.noPreview')}</p>
              <a href={version.url} download={version.original_filename}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                {t('documents.downloadToView')}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
