import { useTranslation } from 'react-i18next'

// Shared placeholder for the tabs that don't have endpoints yet (Documents,
// RFIs, Submittals, Punch List) — schema for all four already exists in
// api/schema.sql, ready to follow the exact pattern DailyLogsTab.jsx set.
export default function ComingSoonTab({ subtitle }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      <p className="text-sm text-gray-400 py-6 text-center">{t('common.comingSoon')}</p>
    </div>
  )
}
