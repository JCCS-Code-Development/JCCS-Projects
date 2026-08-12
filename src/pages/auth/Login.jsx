import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import LangSwitcher from '../../components/ui/LangSwitcher'
import { login as fieldclockLogin } from '../../api/fieldclockAuth'
import { verify as verifyProjectsAccess } from '../../api/auth'
import { login as clientLogin } from '../../api/clientPortalAuth'
import { useAuthStore } from '../../store/authStore'
import { useClientAuthStore } from '../../store/clientAuthStore'

// One login form for everyone — staff and clients are two entirely separate
// identity systems underneath (FieldClock-issued JWT vs. a local `clients`
// row + our own JWT), but the user shouldn't have to know that or pick the
// right door themselves.
//
// The client-portal check runs FIRST: it's a fast local DB lookup with no
// external round-trip, so a client's password is never sent to FieldClock as
// a guess (which could otherwise trip a real FieldClock account's own
// lockout, if a client's email ever happened to coincide with a staff
// member's). Only when that comes back "not a client" does this fall
// through to the FieldClock/staff flow. A client account that's locked out
// (429) is reported immediately rather than falling through, since a 429
// already confirms the email IS a client account.
export default function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { login: staffLogin, logout: staffLogout } = useAuthStore()
  const { login: portalLogin } = useClientAuthStore()

  // A notification email's quicklink survives the login detour via
  // ClientRoute/ProtectedRoute stashing the intended URL in navigation
  // state (see those files) — reuse it here so login actually lands the
  // user back on the specific update, not a generic home screen. Guarded
  // by which portal it belongs to, since this one form can end up
  // authenticating either track and a mismatched redirect (e.g. a staff
  // login honoring a stray /portal/... target) would just bounce again.
  const from = location.state?.from
  const clientRedirect = from?.pathname?.startsWith('/portal') ? `${from.pathname}${from.search ?? ''}` : '/portal'
  const staffRedirect = from && !from.pathname?.startsWith('/portal') ? `${from.pathname}${from.search ?? ''}` : '/'

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword]     = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!identifier.trim()) { setError(t('auth.enterIdentifier')); return }
    setLoading(true)
    setError('')

    try {
      const clientData = await clientLogin(identifier.trim(), password)
      portalLogin(clientData.client, clientData.token, clientData.refreshToken)
      navigate(clientRedirect, { replace: true })
      return
    } catch (err) {
      if (err?.response?.status === 429) {
        setError(err?.response?.data?.error ?? t('auth.signInFailed'))
        setLoading(false)
        return
      }
      // Not a (recognizable) client — fall through and try it as staff.
    }

    try {
      const data = await fieldclockLogin(identifier.trim(), password)
      if (data.setup_required) {
        setError(t('auth.setupRequired'))
        return
      }
      staffLogin(data.user, data.token, data.refreshToken)
      const access = await verifyProjectsAccess()
      staffLogin({ ...data.user, role: access.role }, data.token, data.refreshToken)
      navigate(staffRedirect, { replace: true })
    } catch (err) {
      staffLogout()
      if (err?.response?.status === 403) {
        setError(t('auth.notProvisioned'))
      } else {
        setError(t('auth.signInFailed'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center bg-brand-900 px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/jccs-logo.jpg" alt="JCCS Services" className="h-14 w-auto mx-auto mb-4"
            style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <h1 className="text-2xl font-bold text-white">{t('auth.appName')}</h1>
          <p className="text-brand-100/70 text-sm mt-1">{t('auth.signInSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-xl flex flex-col gap-4">
          <Input
            label={t('auth.emailOrPhone')}
            type="text"
            inputMode="email"
            placeholder="you@jccs-services.com"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
          />
          <Input
            label={t('auth.password')}
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
            autoComplete="current-password"
          />
          <Button type="submit" fullWidth size="lg" loading={loading}>
            {t('auth.signIn')}
          </Button>
        </form>

        <p className="text-center text-brand-100/50 text-xs mt-6">
          {t('auth.noAccess')}
        </p>

        <div className="flex justify-center mt-4">
          <LangSwitcher className="text-brand-100/40 hover:text-brand-100/80" />
        </div>
      </div>
    </div>
  )
}
