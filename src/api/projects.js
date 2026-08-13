import client from './client'

// These hit Projects' OWN backend, which proxies server-to-server to
// jccs-inventory's /projects/* — never called directly from the browser, so
// inventory's CORS config never needs to know about this app's origin.
export const listProjects = () => client.get('/projects/index.php').then((r) => r.data)

export const getProject = (projectNumber) =>
  client.get('/projects/index.php', { params: { project_number: projectNumber } }).then((r) => r.data)

export const getProjectClients = (projectNumber) =>
  client.get('/projects/clients.php', { params: { project_number: projectNumber } }).then((r) => r.data)

export const resolveProject = (projectNumber) =>
  client.post('/projects/resolve.php', { project_number: projectNumber }).then((r) => r.data)

// Full creation (name + client fields), admin-only — see api/projects/index.php.
export const createProject = (payload) =>
  client.post('/projects/index.php', payload).then((r) => r.data)

export const getProjectContacts = (projectNumber) =>
  client.get('/projects/contacts.php', { params: { project_number: projectNumber } }).then((r) => r.data)
