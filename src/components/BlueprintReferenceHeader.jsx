import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import DocumentThumbnail from './DocumentThumbnail'
import DocumentPreviewModal from './DocumentPreviewModal'

// A visual reference strip for the Phases modal — the project's uploaded
// blueprints (Documents → Drawings), right above the phase list, so
// "what phase am I looking at" and "what does that part of the building
// look like" sit in the same view instead of two separate tabs. Shared
// between staff (PhasesManagerModal) and the client portal (PhasesViewModal)
// via the same injected-fetch-function pattern used elsewhere (ProjectDirectory,
// DocumentsBoard) — read-only either side, clicking a thumbnail opens the
// same in-page DocumentPreviewModal used throughout Documents.
export default function BlueprintReferenceHeader({ projectNumber, fetchDocuments }) {
  const { t } = useTranslation()
  const [drawings, setDrawings] = useState([])
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    setLoading(true)
    fetchDocuments({ project_number: projectNumber, category: 'drawing' })
      .then((data) => setDrawings((data.documents ?? []).filter((d) => d.category === 'drawing')))
      .catch(() => setDrawings([]))
      .finally(() => setLoading(false))
  }, [projectNumber, fetchDocuments])

  // Nothing uploaded yet — skip the header entirely rather than show an
  // empty strip; it has nothing to add here (uploading a blueprint happens
  // from the Documents tab, not from this read-mostly view).
  if (loading || drawings.length === 0) return null

  return (
    <div className="mb-4 pb-4 border-b border-gray-100 -mt-2">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('phases.blueprintReference')}</p>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {drawings.map((doc) => (
          <button key={doc.id} type="button" disabled={!doc.latest_version}
            onClick={() => setPreview({ version: doc.latest_version, title: doc.title })}
            className="shrink-0 flex flex-col items-center gap-1 w-20">
            <DocumentThumbnail filename={doc.latest_version?.original_filename} url={doc.latest_version?.url} size="w-20 h-20" />
            <span className="text-[10px] text-gray-500 truncate w-full text-center">{doc.title}</span>
          </button>
        ))}
      </div>

      <DocumentPreviewModal isOpen={!!preview} onClose={() => setPreview(null)}
        version={preview?.version} title={preview?.title} />
    </div>
  )
}
