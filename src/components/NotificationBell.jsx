import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'

const BellIcon = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9z"/><path strokeLinecap="round" strokeLinejoin="round" d="M10.3 21a1.94 1.94 0 003.4 0"/></svg>

function fmt(ts) {
  try { return format(ts.includes('T') || ts.includes(' ') ? new Date(ts.replace(' ', 'T')) : parseISO(ts), 'MMM d, h:mm a') }
  catch { return ts }
}

// Shared between StaffLayout and ClientLayout — injected with the right
// list/resolve functions for whichever of the two entirely separate auth
// tracks it's rendered under. A notification stays "pending" (shown with a
// dot + tinted row, counted in the badge) until the user either clicks it
// (which resolves it AND navigates to link_path) or it's resolved some
// other way — never auto-dismissed just by opening the panel.
export default function NotificationBell({ listNotifications, resolveNotification, buttonClassName }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  const pendingCount = notifications.filter((n) => n.status === 'pending').length

  const load = () => {
    listNotifications()
      .then((data) => setNotifications(data.notifications ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const handleClick = async (n) => {
    setOpen(false)
    if (n.status === 'pending') {
      try { await resolveNotification(n.id) } catch { /* still navigate even if this fails */ }
    }
    navigate(n.link_path)
    load()
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)}
        className={buttonClassName ?? 'relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors'}>
        <BellIcon />
        {pendingCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white rounded-2xl shadow-xl border border-gray-100 z-50">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-bold text-gray-900">{t('notifications.title')}</p>
          </div>
          {loading ? (
            <p className="text-sm text-gray-400 px-4 py-6 text-center">{t('common.loading')}</p>
          ) : notifications.length === 0 ? (
            <p className="text-sm text-gray-400 px-4 py-6 text-center">{t('notifications.empty')}</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100">
              {notifications.map((n) => (
                <button key={n.id} onClick={() => handleClick(n)}
                  className={`text-left px-4 py-3 hover:bg-gray-50 transition-colors ${n.status === 'pending' ? 'bg-brand-100/40' : ''}`}>
                  <div className="flex items-start gap-2">
                    {n.status === 'pending' && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                      {n.body && <p className="text-xs text-gray-500 truncate">{n.body}</p>}
                      <p className="text-[11px] text-gray-400 mt-0.5">{fmt(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
