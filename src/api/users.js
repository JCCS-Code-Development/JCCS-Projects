import client from './client'

// Staff
export const listUsers = () => client.get('/users/index.php').then((r) => r.data)
export const createUser = (payload) => client.post('/users/index.php', payload).then((r) => r.data)
export const updateUser = (id, payload) => client.put(`/users/item.php?id=${id}`, payload).then((r) => r.data)
export const deactivateUser = (id) => client.delete(`/users/item.php?id=${id}`).then((r) => r.data)

// Clients — the "local search or create" side.
export const listClientAccounts = () => client.get('/users/clients.php').then((r) => r.data)
export const createClientAccount = (payload) => client.post('/users/clients.php', payload).then((r) => r.data)
export const updateClientAccount = (id, payload) => client.put(`/users/client-item.php?id=${id}`, payload).then((r) => r.data)
export const deactivateClientAccount = (id) => client.delete(`/users/client-item.php?id=${id}`).then((r) => r.data)
