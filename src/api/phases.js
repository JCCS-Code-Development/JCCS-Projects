import client from './client'

export const listPhases = (projectNumber) =>
  client.get('/phases/index.php', { params: { project_number: projectNumber } }).then((r) => r.data)

export const createPhase = (payload) =>
  client.post('/phases/index.php', payload).then((r) => r.data)

export const updatePhase = (id, payload) =>
  client.put(`/phases/item.php?id=${id}`, payload).then((r) => r.data)

export const deletePhase = (id) =>
  client.delete(`/phases/item.php?id=${id}`).then((r) => r.data)
