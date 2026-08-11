import { useState } from 'react'
import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import OfflineBanner from '../OfflineBanner'
import LangSwitcher from '../ui/LangSwitcher'
import NotificationBell from '../NotificationBell'
import { useClientAuthStore } from '../../store/clientAuthStore'
import { logout as clientLogoutAPI } from '../../api/clientPortalAuth'
import { listPortalNotifications, resolvePortalNotification } from '../../api/portal'

const ProjectsIcon = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5A2.5 2.5 0 015.5 5h4l2 2h7A2.5 2.5 0 0121 9.5v7A2.5 2.5 0 0118.5 19h-13A2.5 2.5 0 013 16.5v-9z"/></svg>
const LogoutIcon    = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline strokeLinecap="round" strokeLinejoin="round" points="16 17 21 12 16 7"/><line strokeLinecap="round" x1="21" y1="12" x2="9" y2="12"/></svg>

// Just one top-level destination now — the company → project drill-down at
// /portal IS the home screen (same Russian-doll pattern as StaffLayout).
// Documents/RFIs/Submittals/Punch List no longer exist as nav items at
// all; they're tabs one level inside a selected project. A single-item
// bottom tab bar would be pointless, so mobile just gets a tappable header
// logo + back-links inside project detail instead of a persistent nav bar.
export default function ClientLayout() {
  const { t } = useTranslation()
  const [profileOpen, setProfileOpen] = useState(false)
  const navigate = useNavigate()
  const { refreshToken, logout, client } = useClientAuthStore()

  const handleLogout = async () => {
    try { await clientLogoutAPI(refreshToken) } catch {}
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-svh bg-gray-50 overflow-hidden">
      <aside className="hidden lg:flex flex-col w-60 bg-brand-900 text-white shrink-0 fixed top-0 bottom-0 left-0 z-20">
        <div className="px-5 py-5 border-b border-brand-700/60 flex flex-col items-center text-center">
          <img src="/jccs-logo.jpg" alt="JCCS Services" className="h-12 w-auto"
            style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <p className="text-brand-400 text-xs font-bold mt-2 tracking-widest uppercase">{t('projects.title')}</p>
        </div>
        <div className="px-5 py-2.5 border-b border-brand-700/40">
          <p className="text-brand-100 text-sm font-semibold truncate">{t('portal.welcome', { name: client?.name?.split(' ')[0] })}</p>
        </div>
        <nav className="flex-1 py-3 overflow-y-auto">
          <NavLink to="/portal" end
            className={({ isActive }) =>
              `flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-brand-500 text-white' : 'text-brand-100/80 hover:bg-brand-700 hover:text-white'
              }`
            }>
            <ProjectsIcon />{t('projects.title')}
          </NavLink>
        </nav>
        <div className="border-t border-brand-700/60">
          <div className="px-5 py-3">
            <LangSwitcher className="text-brand-400/70 hover:text-brand-100" />
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-3 px-5 py-3 text-sm text-brand-100/70 hover:text-white transition-colors w-full border-t border-brand-700/40">
            <LogoutIcon s="w-5 h-5" /> {t('portal.signOut')}
          </button>
        </div>
      </aside>

      {/* Desktop notification bell — pinned to the actual top-right corner
          of the viewport, deliberately outside the narrow sidebar (a
          dropdown anchored inside a 240px-wide column had nowhere to open
          without clipping itself against the edge). */}
      <div className="hidden lg:block fixed top-4 right-6 z-40">
        <NotificationBell listNotifications={listPortalNotifications} resolveNotification={resolvePortalNotification}
          buttonClassName="relative p-2.5 rounded-full bg-white shadow-md border border-gray-100 text-gray-500 hover:bg-gray-50 transition-colors" />
      </div>

      <div className="flex-1 flex flex-col min-w-0 lg:ml-60 overflow-hidden">
        <OfflineBanner />

        <header className="lg:hidden bg-brand-900 text-white flex items-center justify-between px-4 py-3 fixed top-0 inset-x-0 z-30">
          <Link to="/portal">
            <img src="/jccs-logo.jpg" alt="JCCS" className="h-7 w-auto"
              style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
          </Link>
          <div className="flex items-center gap-1">
            <NotificationBell listNotifications={listPortalNotifications} resolveNotification={resolvePortalNotification}
              buttonClassName="relative p-2 rounded-lg text-brand-100/80 hover:bg-brand-700 hover:text-white transition-colors" />
            <button onClick={() => setProfileOpen(true)}
              className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm font-bold shrink-0 active:bg-brand-400 transition-colors">
              {client?.name?.charAt(0).toUpperCase()}
            </button>
          </div>
        </header>

        <div className="lg:hidden h-[52px] shrink-0" />

        <div className="flex-1 overflow-y-auto px-4 py-4 lg:p-6 w-full">
          <div className="max-w-6xl mx-auto w-full">
            <Outlet />
          </div>
        </div>

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
                  {client?.name?.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{client?.name}</p>
                  <p className="text-xs text-gray-400">{client?.email}</p>
                </div>
              </div>
              <div className="px-5 py-4 flex flex-col gap-3">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium text-gray-700">{t('nav.language')}</span>
                  <LangSwitcher className="text-gray-500" />
                </div>
                <button onClick={handleLogout}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-red-50 text-red-500 text-sm font-semibold active:bg-red-100 transition-colors">
                  <LogoutIcon /> {t('portal.signOut')}
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
