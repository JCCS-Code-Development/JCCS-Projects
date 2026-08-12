import client from './client'

export const PUNCH_STATUSES = ['open', 'ready_for_review', 'closed']

export const listPunchItems = (params = {}) =>
  client.get('/punch-items/index.php', { params }).then((r) => r.data)

// Photos are required at creation — always multipart/form-data.
export const createPunchItem = (payload, photos) => {
  const form = new FormData()
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') form.append(key, value)
  })
  photos.forEach((file) => form.append('photos[]', file))
  return client.post('/punch-items/index.php', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const updatePunchItemStatus = (id, status) =>
  client.patch(`/punch-items/item.php?id=${id}`, { status }).then((r) => r.data)

// Staff-only — adding an 'after' proof photo (or another 'before' angle).
export const addPunchItemPhoto = (punchItemId, file, phase = 'after') => {
  const form = new FormData()
  form.append('punch_item_id', punchItemId)
  form.append('phase', phase)
  form.append('photo', file)
  return client.post('/punch-items/photo.php', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}
