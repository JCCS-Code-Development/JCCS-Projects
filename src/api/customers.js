import client from './client'

export const listCustomers = (params = {}) =>
  client.get('/customers/index.php', { params }).then((r) => r.data)

export const createCustomer = (payload) =>
  client.post('/customers/index.php', payload).then((r) => r.data)

export const updateCustomer = (id, payload) =>
  client.patch(`/customers/item.php?id=${id}`, payload).then((r) => r.data)

export const deactivateCustomer = (id) =>
  client.delete(`/customers/item.php?id=${id}`).then((r) => r.data)

export const createContact = (customerId, payload) =>
  client.post(`/customers/item.php?id=${customerId}&contact=new`, payload).then((r) => r.data)

export const updateContact = (customerId, contactId, payload) =>
  client.patch(`/customers/item.php?id=${customerId}&contact=${contactId}`, payload).then((r) => r.data)

export const removeContact = (customerId, contactId) =>
  client.delete(`/customers/item.php?id=${customerId}&contact=${contactId}`).then((r) => r.data)
