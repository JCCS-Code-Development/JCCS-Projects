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

export const listQuoteClients = () =>
  client.get('/quote-requests/pickers.php', { params: { kind: 'clients' } }).then((r) => r.data)

export const listProjectClientIds = (projectNumber) =>
  client.get('/quote-requests/pickers.php', { params: { kind: 'project_clients', project_number: projectNumber } }).then((r) => r.data)

// Site-walk notes (Cornell-style walk sheet)
export const createQuoteNote = (quoteRequestId, payload = {}) =>
  client.post('/quote-requests/notes.php', { quote_request_id: quoteRequestId, ...payload }).then((r) => r.data)

export const updateQuoteNote = (noteId, payload) =>
  client.patch(`/quote-requests/notes.php?id=${noteId}`, payload).then((r) => r.data)

export const deleteQuoteNote = (noteId) =>
  client.delete(`/quote-requests/notes.php?id=${noteId}`).then((r) => r.data)

// Claude reads the walk (notes + photos) and returns draft form answers.
// Can take a minute with many photos.
export const aiDraftEstimate = (quoteRequestId) =>
  client.post('/quote-requests/ai-draft.php', { id: quoteRequestId }, { timeout: 240000 }).then((r) => r.data)

// Voice memos (WhatsApp-style clips) on a request or a walk note.
export const uploadQuoteAudio = (quoteRequestId, blob, { mime, duration, peaks, noteId, clientUid } = {}) => {
  const ext = /mp4|m4a|aac/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm'
  const form = new FormData()
  form.append('quote_request_id', quoteRequestId)
  form.append('file', new File([blob], `memo.${ext}`, { type: mime }))
  if (duration != null) form.append('duration', duration)
  if (peaks?.length) form.append('peaks', peaks.join(','))
  if (noteId) form.append('note_id', noteId)
  if (clientUid) form.append('client_uid', clientUid)
  return client.post('/quote-requests/audio.php', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
}

export const deleteQuoteAudio = (id) =>
  client.delete(`/quote-requests/audio.php?id=${id}`).then((r) => r.data)
