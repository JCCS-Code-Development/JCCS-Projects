import { useTranslation } from 'react-i18next'
import Card from '../components/ui/Card'

// Admin-only placeholder — will manage projects_staff_roles (provision by
// FieldClock user ID, same UX as Inventory's Users page) and the client
// portal accounts (clients + client_project_access) in one screen.
export default function Users() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{t('users.title')}</h1>
        <p className="text-sm text-gray-500">{t('users.subtitle')}</p>
      </div>
      <Card><p className="text-sm text-gray-400">{t('common.comingSoon')}</p></Card>
    </div>
  )
}
