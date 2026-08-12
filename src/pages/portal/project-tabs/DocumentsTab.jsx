import DocumentsBoard from '../../../components/DocumentsBoard'
import { listPortalDocuments, getPortalDocumentVersions } from '../../../api/portal'

// Read-only mirror of the staff Documents tab — no createDocument/
// addDocumentVersion passed in, so DocumentsBoard renders without any
// upload affordances, but version history is still fully browsable.
export default function DocumentsTab({ projectNumber, targetDocId }) {
  return (
    <DocumentsBoard projectNumber={projectNumber} targetDocId={targetDocId}
      fetchDocuments={listPortalDocuments} fetchVersions={getPortalDocumentVersions} />
  )
}
