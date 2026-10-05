import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

// Each role's home: field managers only have Site Walks, so bouncing them to
// "/" (Projects, which they can't open) would loop.
export const homeForRole = (role) => (role === 'field' ? '/quotes' : '/')

export default function RoleRoute({ allowedRoles }) {
  const user = useAuthStore((s) => s.user)
  if (allowedRoles.includes(user?.role)) return <Outlet />
  return <Navigate to={homeForRole(user?.role)} replace />
}
