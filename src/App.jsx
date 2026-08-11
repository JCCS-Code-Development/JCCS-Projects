import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useClientAuthStore } from './store/clientAuthStore'

import ProtectedRoute from './router/ProtectedRoute'
import RoleRoute from './router/RoleRoute'
import ClientRoute from './router/ClientRoute'
import StaffLayout from './components/layout/StaffLayout'
import ClientLayout from './components/layout/ClientLayout'

import Login from './pages/auth/Login'
import ProjectsHome from './pages/ProjectsHome'
import ProjectDetail from './pages/ProjectDetail'
import DailyLogDetail from './pages/DailyLogDetail'
import Users from './pages/Users'

import PortalHome from './pages/portal/PortalHome'
import PortalProjectDetail from './pages/portal/PortalProjectDetail'
import PortalDailyLogDetail from './pages/portal/PortalDailyLogDetail'

function RoleRedirect() {
  const isStaffAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isClientAuthenticated = useClientAuthStore((s) => s.isAuthenticated)
  if (isStaffAuthenticated) return <Navigate to="/" replace />
  if (isClientAuthenticated) return <Navigate to="/portal" replace />
  return <Navigate to="/login" replace />
}

// Route shape mirrors the "Russian doll" IA: Projects (home, grouped by
// company) → a single project (tabs: Daily Logs/Documents/RFIs/Submittals/
// Punch List) → a daily log's own detail page one level deeper still. Same
// pattern on the client-portal side, just read-only.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Staff (Admin / PM-Lead) */}
      <Route element={<ProtectedRoute />}>
        <Route element={<StaffLayout />}>
          <Route path="/" element={<ProjectsHome />} />
          <Route path="/projects/:projectNumber" element={<ProjectDetail />} />
          <Route path="/projects/:projectNumber/daily-logs/:id" element={<DailyLogDetail />} />

          {/* Admin only */}
          <Route element={<RoleRoute allowedRoles={['admin']} />}>
            <Route path="/users" element={<Users />} />
          </Route>
        </Route>
      </Route>

      {/* Client portal — separate auth track entirely */}
      <Route element={<ClientRoute />}>
        <Route element={<ClientLayout />}>
          <Route path="/portal" element={<PortalHome />} />
          <Route path="/portal/projects/:projectNumber" element={<PortalProjectDetail />} />
          <Route path="/portal/projects/:projectNumber/daily-logs/:id" element={<PortalDailyLogDetail />} />
        </Route>
      </Route>

      <Route path="*" element={<RoleRedirect />} />
    </Routes>
  )
}
