import client from './client'

export const SUBMITTAL_STATUSES = ['pending', 'approved', 'approved_as_noted', 'revise_resubmit', 'rejected']

export const listSubmittals = (params = {}) =>
  client.get('/submittals/index.php', { params }).then((r) => r.data)

// Creating a submittal always uploads its first version in the same call.
export const createSubmittal = (payload, file) => {
  const form = new FormData()
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') form.append(key, value)
  })
  form.append('file', file)
  return client.post('/submittals/index.php', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const updateSubmittalStatus = (id, status) =>
  client.patch(`/submittals/item.php?id=${id}`, { status }).then((r) => r.data)

export const listSubmittalVersions = (submittalId) =>
  client.get('/submittals/versions.php', { params: { submittal_id: submittalId } }).then((r) => r.data)

export const addSubmittalVersion = (submittalId, file, notes) => {
  const form = new FormData()
  form.append('submittal_id', submittalId)
  if (notes) form.append('notes', notes)
  form.append('file', file)
  return client.post('/submittals/versions.php', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}
