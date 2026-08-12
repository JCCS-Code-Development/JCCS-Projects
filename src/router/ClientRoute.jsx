import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useClientAuthStore } from '../store/clientAuthStore'

// Preserves the originally-requested URL in navigation state on the way to
// /login — this is what lets an email notification's quicklink (e.g.
// /portal/projects/4521?tab=daily-logs&log=4) survive a login detour and
// land the client on the actual update afterward, instead of dumping them
// at the generic portal home. See Login.jsx's use of location.state.from.
export default function ClientRoute() {
  const isAuthenticated = useClientAuthStore((s) => s.isAuthenticated)
  const location = useLocation()
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" state={{ from: location }} replace />
}
