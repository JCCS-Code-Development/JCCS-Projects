import axios from 'axios'

const base = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

export const login = (email, password) =>
  base.post('/auth/client-login.php', { email, password }).then((r) => r.data)

// Account-setup invite flow — check() greets the client by name, complete()
// sets their password and returns a live session (same shape as login()).
export const setupCheck = (token) =>
  base.get('/auth/client-setup-check.php', { params: { token } }).then((r) => r.data)

export const setupComplete = (token, password) =>
  base.post('/auth/client-setup.php', { token, password }).then((r) => r.data)

export const refresh = (refreshToken) =>
  base.post('/auth/client-refresh.php', { refreshToken }).then((r) => r.data)

export const logout = (refreshToken) =>
  base.post('/auth/client-logout.php', { refreshToken }).then((r) => r.data)
