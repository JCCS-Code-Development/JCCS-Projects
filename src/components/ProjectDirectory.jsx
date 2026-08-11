import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const PersonIcon   = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="8" r="4"/><path strokeLinecap="round" strokeLinejoin="round" d="M4 21c0-3.87 3.58-7 8-7s8 3.13 8 7"/></svg>
const BuildingIcon = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="4" y="3" width="16" height="18" rx="1"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1"/></svg>
const HardHatIcon  = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 18a8 8 0 0116 0"/><path strokeLinecap="round" strokeLinejoin="round" d="M2 18h20M12 6v4"/></svg>
const MailIcon     = ({ s = 'w-3.5 h-3.5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="5" width="18" height="14" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M3 7l9 6 9-6"/></svg>
const PhoneIcon    = ({ s = 'w-3.5 h-3.5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/></svg>

function ContactColumn({ icon, title, contacts, emptyLabel }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <span className="text-brand-500">{icon}</span>
        <p className="text-sm font-bold text-gray-900">{title}</p>
        <span className="ml-auto text-xs font-semibold text-gray-400">{contacts.length}</span>
      </div>
      <div className="p-4 flex flex-col gap-3 flex-1">
        {contacts.length === 0 ? (
          <p className="text-sm text-gray-400">{emptyLabel}</p>
        ) : (
          contacts.map((c, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <p className="text-sm font-semibold text-gray-800">{c.name}</p>
              {c.email && (
                <a href={`mailto:${c.email}`} className="text-xs text-gray-500 hover:text-brand-600 flex items-center gap-1.5 truncate">
                  <MailIcon s="w-3 h-3 shrink-0" /> <span className="truncate">{c.email}</span>
                </a>
              )}
              {c.phone && (
                <a href={`tel:${c.phone}`} className="text-xs text-gray-500 hover:text-brand-600 flex items-center gap-1.5">
                  <PhoneIcon s="w-3 h-3 shrink-0" /> {c.phone}
                </a>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// Shared between the staff and client-portal Directory tabs — read-only
// either side (contact info itself is maintained on the Users admin
// screen). Three columns, matching the three groups anyone on a project
// actually needs to reach: the client-side stakeholders, JCCS office/admin
// (company-wide, hence "administrative" rather than tied to one project),
// and the PMs actually assigned to run this specific job in the field.
export default function ProjectDirectory({ projectNumber, fetchContacts }) {
  const { t } = useTranslation()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchContacts(projectNumber)
      .then(setData)
      .catch(() => setData({ clientContacts: [], administrativeStaff: [], fieldManagers: [] }))
      .finally(() => setLoading(false))
  }, [projectNumber, fetchContacts])

  if (loading) return <p className="text-sm text-gray-400">{t('common.loading')}</p>

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500">{t('directory.subtitle')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
        <ContactColumn icon={<PersonIcon />} title={t('directory.clientContacts')}
          contacts={data?.clientContacts ?? []} emptyLabel={t('directory.noContacts')} />
        <ContactColumn icon={<BuildingIcon />} title={t('directory.administrativeStaff')}
          contacts={data?.administrativeStaff ?? []} emptyLabel={t('directory.noContacts')} />
        <ContactColumn icon={<HardHatIcon />} title={t('directory.fieldManagers')}
          contacts={data?.fieldManagers ?? []} emptyLabel={t('directory.noContacts')} />
      </div>
    </div>
  )
}
