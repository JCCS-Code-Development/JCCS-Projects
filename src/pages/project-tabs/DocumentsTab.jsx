import DocumentsBoard from '../../components/DocumentsBoard'
import { listDocuments, listDocumentVersions, createDocument, addDocumentVersion } from '../../api/documents'

// Scoped to a single project — the five static divisions (Drawings, Scope,
// Estimate placeholder, Contracts, Permits) live in DocumentsBoard, shared
// with the read-only client-portal version below.
export default function DocumentsTab({ projectNumber, targetDocId }) {
  return (
    <DocumentsBoard projectNumber={projectNumber} targetDocId={targetDocId}
      fetchDocuments={listDocuments} fetchVersions={listDocumentVersions}
      createDocument={createDocument} addDocumentVersion={addDocumentVersion} />
  )
}
