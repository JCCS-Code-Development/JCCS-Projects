import clientPortalClient from './clientPortalClient'

// Client-portal reads — scoped server-side to whatever project_numbers are
// in this client's client_project_access rows. Write exceptions: daily-log
// comments (a two-way question/answer thread), marking a notification
// resolved, and creating a punch list item (clients can flag a deficiency
// themselves, but never change its status — see portal/punch-items.php).
// Everything else here stays read-only.
export const listPortalProjects = () =>
  clientPortalClient.get('/portal/projects.php').then((r) => r.data)

export const getPortalProject = (projectNumber) =>
  clientPortalClient.get('/portal/projects.php', { params: { project_number: projectNumber } }).then((r) => r.data)

export const listPortalDailyLogs = (params = {}) =>
  clientPortalClient.get('/portal/daily-logs.php', { params }).then((r) => r.data)

export const getPortalDailyLog = (id) =>
  clientPortalClient.get('/portal/daily-logs.php', { params: { id } }).then((r) => r.data)

export const listPortalPhases = (projectNumber) =>
  clientPortalClient.get('/portal/phases.php', { params: { project_number: projectNumber } }).then((r) => r.data)

export const listPortalDailyLogComments = (dailyLogId) =>
  clientPortalClient.get('/portal/daily-log-comments.php', { params: { daily_log_id: dailyLogId } }).then((r) => r.data)

export const createPortalDailyLogComment = (dailyLogId, message) =>
  clientPortalClient.post('/portal/daily-log-comments.php', { daily_log_id: dailyLogId, message }).then((r) => r.data)

export const listPortalNotifications = (status) =>
  clientPortalClient.get('/portal/notifications.php', { params: status ? { status } : {} }).then((r) => r.data)

export const resolvePortalNotification = (id) =>
  clientPortalClient.patch(`/portal/notifications.php?id=${id}`).then((r) => r.data)

export const listPortalWeeklyReports = (params = {}) =>
  clientPortalClient.get('/portal/weekly-reports.php', { params }).then((r) => r.data)

export const getPortalContacts = (projectNumber) =>
  clientPortalClient.get('/portal/contacts.php', { params: { project_number: projectNumber } }).then((r) => r.data)

export const listPortalDocuments = (params = {}) =>
  clientPortalClient.get('/portal/documents.php', { params }).then((r) => r.data)

export const getPortalDocumentVersions = (documentId) =>
  clientPortalClient.get('/portal/documents.php', { params: { id: documentId } }).then((r) => r.data)

export const listPortalSubmittals = (params = {}) =>
  clientPortalClient.get('/portal/submittals.php', { params }).then((r) => r.data)

export const getPortalSubmittalVersions = (submittalId) =>
  clientPortalClient.get('/portal/submittals.php', { params: { id: submittalId } }).then((r) => r.data)

export const listPortalPunchItems = (params = {}) =>
  clientPortalClient.get('/portal/punch-items.php', { params }).then((r) => r.data)

// Photos are required at creation — always multipart/form-data. No
// due_date field — that's a staff scheduling decision, not client-settable.
export const createPortalPunchItem = (payload, photos) => {
  const form = new FormData()
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') form.append(key, value)
  })
  photos.forEach((file) => form.append('photos[]', file))
  return clientPortalClient.post('/portal/punch-items.php', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}
