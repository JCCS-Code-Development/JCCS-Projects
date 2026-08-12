import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import Modal from './ui/Modal'
import BlueprintReferenceHeader from './BlueprintReferenceHeader'
import { listPortalDocuments } from '../api/portal'

const STATUS_STYLES = {
  upcoming:  'bg-gray-100 text-gray-500',
  current:   'bg-brand-100 text-brand-700',
  completed: 'bg-emerald-100 text-emerald-700',
}

function fmtDate(d) {
  if (!d) return null
  try { return format(parseISO(d), 'MMM d, yyyy') } catch { return d }
}

// Read-only phase breakdown for the client portal — same data as
// PhasesManagerModal shows staff, just no inputs: name, timeframe, and the
// scope of work for each phase. Clicking the phase pill opens this instead
// of the editable modal, which never even loads on this side.
export default function PhasesViewModal({ isOpen, onClose, phases, projectNumber }) {
  const { t } = useTranslation()
  const sorted = [...phases].sort((a, b) => a.sequence - b.sequence)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('phases.viewTitle')} size="lg">
      <BlueprintReferenceHeader projectNumber={projectNumber} fetchDocuments={listPortalDocuments} />
      {sorted.length === 0 ? (
        <p className="text-sm text-gray-400 py-3">{t('phases.noneYet')}</p>
      ) : (
        <div className="flex flex-col gap-4 -mt-2">
          {sorted.map((phase) => {
            const start = fmtDate(phase.start_date)
            const end = fmtDate(phase.end_date)
            return (
              <div key={phase.id} className="flex flex-col gap-1.5 py-3 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-400 w-5 shrink-0">{phase.sequence}</span>
                  <p className="text-sm font-semibold text-gray-900 flex-1">{phase.name}</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[phase.status]}`}>
                    {t(`phases.status.${phase.status}`)}
                  </span>
                </div>
                <p className="text-xs text-gray-400 pl-7">
                  {start || end ? t('phases.timeframe', { start: start ?? '—', end: end ?? '—' }) : t('phases.noTimeframe')}
                </p>
                {phase.scope && (
                  <p className="text-sm text-gray-700 pl-7 whitespace-pre-line">{phase.scope}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
