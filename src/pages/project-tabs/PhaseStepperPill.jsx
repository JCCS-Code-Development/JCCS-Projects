import { useTranslation } from 'react-i18next'

const PhaseIcon = ({ s = 'w-3.5 h-3.5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18M5 4h11l-2 4 2 4H5"/></svg>

// A horizontal dot-and-line stepper — one dot per phase, in sequence order
// — encapsulated in a pill. Filled/brand dots for completed and current
// phases (line between them filled too), hollow gray dots for upcoming
// ones. Click opens the full phase breakdown (PhasesManagerModal, lifted to
// ProjectDetail so both this pill and the Overview tab's "Manage Phases"
// button share the same modal instance) — staff only. The client portal
// renders this same pill with readOnly, which drops the click handler and
// hover affordance entirely (clients can see progress, never edit it; the
// editable modal is never even loaded on that side).
export default function PhaseStepperPill({ phases, onClick, readOnly = false }) {
  const { t } = useTranslation()
  const sorted = [...phases].sort((a, b) => a.sequence - b.sequence)
  const currentIndex = sorted.findIndex((p) => p.status === 'current')
  const current = currentIndex >= 0 ? sorted[currentIndex] : null
  const Tag = readOnly ? 'div' : 'button'
  const interactiveClass = readOnly ? '' : 'hover:border-brand-300 hover:bg-brand-100/30 transition-colors'

  if (sorted.length === 0) {
    return (
      <Tag onClick={readOnly ? undefined : onClick}
        className={`flex items-center gap-1.5 bg-white border border-gray-200 rounded-full pl-2.5 pr-3 py-1 text-xs font-medium text-gray-700 ${interactiveClass}`}>
        <PhaseIcon s="w-3.5 h-3.5 text-brand-500" />
        {t('phases.noneYet')}
      </Tag>
    )
  }

  return (
    <Tag onClick={readOnly ? undefined : onClick} title={sorted.map((p) => p.name).join(' → ')}
      className={`flex items-center gap-2.5 bg-white border border-gray-200 rounded-full pl-2.5 pr-3 py-1.5 text-xs font-medium text-gray-700 ${interactiveClass}`}>
      <PhaseIcon s="w-3.5 h-3.5 text-brand-500" />
      <span className="whitespace-nowrap">
        {current
          ? t('phases.summary', { name: current.name, position: currentIndex + 1, total: sorted.length })
          : t('phases.noActive', { total: sorted.length })}
      </span>
      <span className="flex items-center">
        {sorted.map((phase, i) => {
          const isDone = phase.status === 'completed' || (currentIndex >= 0 && i < currentIndex)
          const isCurrent = phase.status === 'current'
          return (
            <span key={phase.id} className="flex items-center">
              <span
                title={phase.name}
                className={`shrink-0 rounded-full transition-colors ${
                  isCurrent ? 'w-2.5 h-2.5 bg-brand-500 ring-2 ring-brand-200'
                  : isDone   ? 'w-2 h-2 bg-brand-500'
                  :            'w-2 h-2 bg-gray-200 border border-gray-300'
                }`}
              />
              {i < sorted.length - 1 && (
                <span className={`w-3 h-px ${isDone || isCurrent ? 'bg-brand-400' : 'bg-gray-200'}`} />
              )}
            </span>
          )
        })}
      </span>
    </Tag>
  )
}
