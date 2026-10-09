import client from './client'

// The client list (who a job is for) — not portal client users.
export const listCustomers = (params = {}) =>
  client.get('/customers/index.php', { params }).then((r) => r.data)

export const createCustomer = (payload) =>
  client.post('/customers/index.php', payload).then((r) => r.data)

export const updateCustomer = (id, payload) =>
  client.patch(`/customers/index.php?id=${id}`, payload).then((r) => r.data)

export const removeCustomer = (id) =>
  client.delete(`/customers/index.php?id=${id}`).then((r) => r.data)

export const importCustomers = (clients) =>
  client.post('/customers/import.php', { clients }).then((r) => r.data)
