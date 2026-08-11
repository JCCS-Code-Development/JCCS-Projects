import axios from 'axios'
import { useClientAuthStore } from '../store/clientAuthStore'

// Talks to Projects' own API using the SEPARATE client-portal JWT (signed
// with CLIENT_JWT_SECRET, never the FieldClock/staff one). Refresh happens
// against this app's own /auth/client-refresh.php, not FieldClock, since
// Projects is the issuer for client tokens.
const clientPortalClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => (error ? prom.reject(error) : prom.resolve(token)))
  failedQueue = []
}

clientPortalClient.interceptors.request.use((config) => {
  const token = useClientAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

clientPortalClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`
        return clientPortalClient(original)
      })
    }
    original._retry = true
    isRefreshing = true
    const { refreshToken, updateToken, logout } = useClientAuthStore.getState()
    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_BASE_URL}/auth/client-refresh.php`,
        { refreshToken }
      )
      updateToken(data.token, data.refreshToken ?? undefined)
      processQueue(null, data.token)
      original.headers.Authorization = `Bearer ${data.token}`
      return clientPortalClient(original)
    } catch (err) {
      processQueue(err, null)
      logout()
      window.location.replace('/login')
      return Promise.reject(err)
    } finally {
      isRefreshing = false
    }
  }
)

export default clientPortalClient
