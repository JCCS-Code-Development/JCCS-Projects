import client from './client'

export const listQuoteRequests = (params = {}) =>
  client.get('/quote-requests/index.php', { params }).then((r) => r.data)

export const createQuoteRequest = (payload) =>
  client.post('/quote-requests/index.php', payload).then((r) => r.data)

export const getQuoteRequest = (id) =>
  client.get(`/quote-requests/item.php?id=${id}`).then((r) => r.data)

export const updateQuoteRequest = (id, payload) =>
  client.patch(`/quote-requests/item.php?id=${id}`, payload).then((r) => r.data)

export const deleteQuoteRequest = (id) =>
  client.delete(`/quote-requests/item.php?id=${id}`).then((r) => r.data)

// action: submit | start_review | request_info | approve | reopen | set_estimate
//         | mark_sent | accept | decline | undo_decision | cancel | restore
export const quoteAction = (id, action, extra = {}) =>
  client.post('/quote-requests/action.php', { id, action, ...extra }).then((r) => r.data)

export const addQuoteComment = (quoteRequestId, body) =>
  client.post('/quote-requests/comments.php', { quote_request_id: quoteRequestId, body }).then((r) => r.data)

export const uploadQuotePhoto = (quoteRequestId, file, meta = {}) => {
  const form = new FormData()
  form.append('quote_request_id', quoteRequestId)
  form.append('file', file)
  Object.entries(meta).forEach(([k, v]) => { if (v !== undefined && v !== null) form.append(k, typeof v === 'object' ? JSON.stringify(v) : v) })
  return client.post('/quote-requests/photos.php', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
}

export const updateQuotePhoto = (photoId, payload) =>
  client.patch(`/quote-requests/photos.php?id=${photoId}`, payload).then((r) => r.data)

export const deleteQuotePhoto = (photoId) =>
  client.delete(`/quote-requests/photos.php?id=${photoId}`).then((r) => r.data)

export const uploadQuoteFile = (quoteRequestId, file, kind = 'other') => {
  const form = new FormData()
  form.append('quote_request_id', quoteRequestId)
  form.append('kind', kind)
  form.append('file', file)
  return client.post('/quote-requests/files.php', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
}

export const deleteQuoteFile = (fileId) =>
  client.delete(`/quote-requests/files.php?id=${fileId}`).then((r) => r.data)

export const getQuoteVersion = (versionId) =>
  client.get(`/quote-requests/versions.php?id=${versionId}`).then((r) => r.data)

export const listQuoteProjects = () =>
  client.get('/quote-requests/pickers.php', { params: { kind: 'projects' } }).then((r) => r.data)

export const listQuoteStaff = () =>
  client.get('/quote-requests/pickers.php', { params: { kind: 'staff' } }).then((r) => r.data)
