import { Navigate, Outlet } from 'react-router-dom'
import { useClientAuthStore } from '../store/clientAuthStore'

export default function ClientRoute() {
  const isAuthenticated = useClientAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}
