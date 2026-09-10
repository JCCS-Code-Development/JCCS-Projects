import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { setupCheck, setupComplete } from '../../api/clientPortalAuth'
import { useClientAuthStore } from '../../store/clientAuthStore'

// Landing page for the "Set up your account" button in the client invite
// email (/portal/setup/:token). Verifies the token, lets the client pick a
// password, then logs them straight into the portal — no second sign-in.
export default function ClientSetup() {
  const { t } = useTranslation()
  const { token } = useParams()
  const navigate = useNavigate()
  const { login: portalLogin } = useClientAuthStore()

  const [checking, setChecking] = useState(true)
  const [account, setAccount] = useState(null) // { name, email }
  const [tokenError, setTokenError] = useState('')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setupCheck(token)
      .then((data) => { if (!cancelled) setAccount(data) })
      .catch((err) => {
        if (!cancelled) setTokenError(err?.response?.data?.error ?? t('auth.setup.linkInvalid'))
      })
      .finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [token, t])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password.length < 8) { setError(t('auth.setup.tooShort')); return }
    if (password !== confirm) { setError(t('auth.setup.mismatch')); return }
    setSubmitting(true)
    setError('')
    try {
      const data = await setupComplete(token, password)
      portalLogin(data.client, data.token, data.refreshToken)
      navigate('/portal', { replace: true })
    } catch (err) {
      setError(err?.response?.data?.error ?? t('auth.setup.failed'))
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center bg-brand-900 px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img
            src="/jccs-logo.jpg"
            alt="JCCS Services"
            className="h-14 w-auto mx-auto mb-4"
            style={{ filter: 'invert(1)', mixBlendMode: 'screen' }}
          />
          <h1 className="text-2xl font-bold text-white">{t('auth.setup.title')}</h1>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-xl">
          {checking && (
            <div className="flex justify-center py-6"><Spinner /></div>
          )}

          {!checking && tokenError && (
            <div className="text-center">
              <p className="text-sm text-red-600">{tokenError}</p>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="mt-4 text-sm text-brand-700 underline"
              >
                {t('auth.setup.goToSignIn')}
              </button>
            </div>
          )}

          {!checking && account && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <p className="text-sm text-gray-600">
                {t('auth.setup.forAccount')}{' '}
                <span className="font-semibold text-gray-900">{account.email}</span>
              </p>
              <Input
                label={t('auth.setup.newPassword')}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <Input
                label={t('auth.setup.confirmPassword')}
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                error={error}
                autoComplete="new-password"
              />
              <Button type="submit" fullWidth size="lg" loading={submitting}>
                {t('auth.setup.submit')}
              </Button>
              <p className="text-xs text-gray-400 text-center">
                {t('auth.setup.afterHint')}
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
