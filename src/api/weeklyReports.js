import client from './client'

export const listWeeklyReports = (params = {}) =>
  client.get('/weekly-reports/index.php', { params }).then((r) => r.data)

export const createWeeklyReport = (payload) =>
  client.post('/weekly-reports/index.php', payload).then((r) => r.data)

export const deleteWeeklyReport = (id) =>
  client.delete(`/weekly-reports/item.php?id=${id}`).then((r) => r.data)
