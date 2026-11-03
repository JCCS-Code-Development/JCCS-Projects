import client from './client'

// The engineer list: who a quote is for, their company and where they work.
export const listEngineers = (params = {}) =>
  client.get('/engineers/index.php', { params }).then((r) => r.data)

export const createEngineer = (payload) =>
  client.post('/engineers/index.php', payload).then((r) => r.data)

export const updateEngineer = (id, payload) =>
  client.patch(`/engineers/index.php?id=${id}`, payload).then((r) => r.data)

export const removeEngineer = (id) =>
  client.delete(`/engineers/index.php?id=${id}`).then((r) => r.data)
