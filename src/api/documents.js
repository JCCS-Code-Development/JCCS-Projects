import client from './client'

export const DOCUMENT_CATEGORIES = ['drawing', 'scope', 'estimate', 'contract', 'permit']

export const listDocuments = (params = {}) =>
  client.get('/documents/index.php', { params }).then((r) => r.data)

// Creating a document always uploads its first version in the same call.
export const createDocument = (payload, file) => {
  const form = new FormData()
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') form.append(key, value)
  })
  form.append('file', file)
  return client.post('/documents/index.php', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const listDocumentVersions = (documentId) =>
  client.get('/documents/versions.php', { params: { document_id: documentId } }).then((r) => r.data)

export const addDocumentVersion = (documentId, file, notes) => {
  const form = new FormData()
  form.append('document_id', documentId)
  if (notes) form.append('notes', notes)
  form.append('file', file)
  return client.post('/documents/versions.php', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}
