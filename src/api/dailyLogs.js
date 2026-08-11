import client from './client'

export const listDailyLogs = (params = {}) =>
  client.get('/daily-logs/index.php', { params }).then((r) => r.data)

export const getDailyLog = (id) =>
  client.get(`/daily-logs/item.php?id=${id}`).then((r) => r.data)

// Photos are required at creation — this always posts multipart/form-data,
// never JSON. `photos` is an array of File objects (>=1, enforced both here
// via the caller and server-side).
export const createDailyLog = (payload, photos) => {
  const form = new FormData()
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') form.append(key, value)
  })
  photos.forEach((file) => form.append('photos[]', file))
  return client.post('/daily-logs/index.php', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

// Still available for adding MORE photos after creation (the create step
// itself already required at least one).
export const uploadDailyLogPhoto = (dailyLogId, file) => {
  const form = new FormData()
  form.append('daily_log_id', dailyLogId)
  form.append('file', file)
  return client.post('/daily-logs/photo.php', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const listDailyLogComments = (dailyLogId) =>
  client.get('/daily-logs/comments.php', { params: { daily_log_id: dailyLogId } }).then((r) => r.data)

export const createDailyLogComment = (dailyLogId, message) =>
  client.post('/daily-logs/comments.php', { daily_log_id: dailyLogId, message }).then((r) => r.data)
