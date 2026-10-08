import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

// Each role's home screen. Field Managers start on their Site Walks (they
// also have Projects); everyone else on Projects.
export const homeForRole = (role) => (role === 'field' ? '/quotes' : '/')

export default function RoleRoute({ allowedRoles }) {
  const user = useAuthStore((s) => s.user)
  if (allowedRoles.includes(user?.role)) return <Outlet />
  return <Navigate to={homeForRole(user?.role)} replace />
}
