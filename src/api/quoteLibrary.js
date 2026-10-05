import client from './client'

export const listLibrary = (params = {}) =>
  client.get('/quote-library/index.php', { params }).then((r) => r.data)

export const createLibraryItem = (payload) =>
  client.post('/quote-library/index.php', payload).then((r) => r.data)

export const updateLibraryItem = (id, payload) =>
  client.patch(`/quote-library/index.php?id=${id}`, payload).then((r) => r.data)

export const removeLibraryItem = (id) =>
  client.delete(`/quote-library/index.php?id=${id}`).then((r) => r.data)
