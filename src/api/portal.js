import clientPortalClient from './clientPortalClient'

// Client-portal reads — scoped server-side to whatever project_numbers are
// in this client's client_project_access rows. The one write exception is
// daily-log comments (a two-way question/answer thread) and marking a
// notification resolved — everything else here stays read-only.
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
