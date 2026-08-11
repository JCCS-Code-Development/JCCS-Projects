import client from './client'

export const listNotifications = (status) =>
  client.get('/notifications/index.php', { params: status ? { status } : {} }).then((r) => r.data)

export const resolveNotification = (id) =>
  client.patch(`/notifications/item.php?id=${id}`).then((r) => r.data)
