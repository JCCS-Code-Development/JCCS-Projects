import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import OfflineBanner from '../OfflineBanner'
import PullToRefresh from '../ui/PullToRefresh'
import LangSwitcher from '../ui/LangSwitcher'
import NotificationBell from '../NotificationBell'
import { useAuthStore } from '../../store/authStore'
import { logout as fieldclockLogout } from '../../api/fieldclockAuth'
import { listNotifications, resolveNotification } from '../../api/notifications'

// ── Icons ─────────────────────────────────────────────────────────
const ProjectsIcon = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5A2.5 2.5 0 015.5 5h4l2 2h7A2.5 2.5 0 0121 9.5v7A2.5 2.5 0 0118.5 19h-13A2.5 2.5 0 013 16.5v-9z"/></svg>
const UsersIcon    = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
const LogoutIcon   = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline strokeLinecap="round" strokeLinejoin="round" points="16 17 21 12 16 7"/><line strokeLinecap="round" x1="21" y1="12" x2="9" y2="12"/></svg>

function SidebarItem({ to, icon, label, end }) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors ${
          isActive ? 'bg-brand-500 text-white' : 'text-brand-100/80 hover:bg-brand-700 hover:text-white'
        }`
      }>
      {icon}{label}
    </NavLink>
  )
}

// Deliberately just two destinations — "Projects" is the app's home (the
// outermost layer of the company → project → tabs drill-down), and admins
// get "Users" alongside it. Everything else (Daily Logs, Documents, RFIs,
// Submittals, Punch List) lives one level deeper, inside a selected
// project, so there's no "More" sheet to speak of anymore.
export default function StaffLayout() {
  const { t } = useTranslation()
  const [profileOpen, setProfileOpen] = useState(false)
  const [refreshKey,  setRefreshKey]  = useState(0)
  const navigate = useNavigate()
  const { refreshToken, logout, user } = useAuthStore()
  const role = user?.role
  const isAdmin = role === 'admin'
  const ROLE_LABELS = { admin: t('role.admin'), pm: t('role.pm') }

  const NAV = [
    { to: '/', icon: <ProjectsIcon />, label: t('nav.projects'), end: true },
    ...(isAdmin ? [{ to: '/users', icon: <UsersIcon />, label: t('nav.users') }] : []),
  ]

  const handleLogout = async () => {
    try { await fieldclockLogout(refreshToken) } catch {}
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-svh bg-gray-50 overflow-hidden">

      {/* ── Desktop sidebar ──────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-60 bg-brand-900 text-white shrink-0 fixed top-0 bottom-0 left-0 z-20">
        <div className="px-5 py-5 border-b border-brand-700/60 flex flex-col items-center text-center">
          <img src="/jccs-logo.jpg" alt="JCCS Services" className="h-12 w-auto"
            style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <p className="text-brand-400 text-xs font-bold mt-2 tracking-widest uppercase">{t('nav.appName')}</p>
        </div>
        <div className="px-5 py-2.5 border-b border-brand-700/40">
          <p className="text-brand-100 text-sm font-semibold truncate">{t('home.welcome', { name: user?.name?.split(' ')[0] })}</p>
          <p className="text-brand-400/60 text-xs">{ROLE_LABELS[role] ?? role}</p>
        </div>
        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV.map(item => <SidebarItem key={item.to} {...item} />)}
        </nav>
        <div className="border-t border-brand-700/60">
          <div className="px-5 py-3">
            <LangSwitcher className="text-brand-400/70 hover:text-brand-100" />
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-3 px-5 py-3 text-sm text-brand-100/70 hover:text-white transition-colors w-full border-t border-brand-700/40">
            <LogoutIcon s="w-5 h-5" /> {t('nav.signOut')}
          </button>
        </div>
      </aside>

      {/* Desktop notification bell — pinned to the actual top-right corner
          of the viewport, deliberately outside the narrow sidebar (a
          dropdown anchored inside a 240px-wide column had nowhere to open
          without clipping itself against the edge). */}
      <div className="hidden lg:block fixed top-4 right-6 z-40">
        <NotificationBell listNotifications={listNotifications} resolveNotification={resolveNotification}
          buttonClassName="relative p-2.5 rounded-full bg-white shadow-md border border-gray-100 text-gray-500 hover:bg-gray-50 transition-colors" />
      </div>

      {/* ── Content ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-60 overflow-hidden">
        <OfflineBanner />

        {/* Mobile top bar */}
        <header className="lg:hidden bg-brand-900 text-white flex items-center justify-between px-4 py-3 fixed top-0 inset-x-0 z-30">
          <img src="/jccs-logo.jpg" alt="JCCS" className="h-7 w-auto"
            style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <div className="flex items-center gap-1">
            <NotificationBell listNotifications={listNotifications} resolveNotification={resolveNotification}
              buttonClassName="relative p-2 rounded-lg text-brand-100/80 hover:bg-brand-700 hover:text-white transition-colors" />
            <button onClick={() => setProfileOpen(true)}
              className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm font-bold shrink-0 active:bg-brand-400 transition-colors">
              {user?.name?.charAt(0).toUpperCase()}
            </button>
          </div>
        </header>

        <div className="lg:hidden h-[52px] shrink-0" />

        <PullToRefresh className="flex-1 px-4 pt-4 lg:p-6 w-full"
          style={{ paddingBottom: 'max(96px, calc(64px + env(safe-area-inset-bottom)))' }}
          onRefresh={() => setRefreshKey(k => k + 1)}>
          <div key={refreshKey} className="max-w-6xl mx-auto w-full">
            <Outlet />
            <div className="lg:hidden h-24 shrink-0" />
          </div>
        </PullToRefresh>

        {/* ── Mobile bottom nav ────────────────────────────── */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 flex z-40"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -1px 6px rgba(0,0,0,0.06)' }}>
          {NAV.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[10px] font-semibold transition-colors ${
                  isActive ? 'text-brand-500' : 'text-gray-400'
                }`
              }>
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* ── Profile bottom sheet ─────────────────────────── */}
        {profileOpen && (
          <div className="fixed inset-0 z-[1100] lg:hidden flex flex-col justify-end"
            onClick={() => setProfileOpen(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative bg-white rounded-t-3xl overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
              </div>
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                <div className="w-11 h-11 rounded-full bg-brand-500 flex items-center justify-center text-white text-base font-bold shrink-0">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{user?.name}</p>
                  <p className="text-xs text-gray-400">{ROLE_LABELS[role] ?? role}</p>
                </div>
              </div>
              <div className="px-5 py-4 flex flex-col gap-3">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium text-gray-700">{t('nav.language')}</span>
                  <LangSwitcher className="text-gray-500" />
                </div>
                <button onClick={handleLogout}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-red-50 text-red-500 text-sm font-semibold active:bg-red-100 transition-colors">
                  <LogoutIcon /> {t('nav.signOut')}
                </button>
              </div>
              <div style={{ height: 'max(12px, env(safe-area-inset-bottom))' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
