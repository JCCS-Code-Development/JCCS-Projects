const variants = {
  // Daily log / general "active" state — brand-colored, categorical only.
  active:   'bg-brand-100 text-brand-800',
  inactive: 'bg-gray-100 text-gray-500',

  // RFI status
  open:     'bg-amber-100 text-amber-800',
  answered: 'bg-sky-100 text-sky-800',
  closed:   'bg-gray-100 text-gray-500',

  // Submittal status
  pending:             'bg-amber-100 text-amber-800',
  approved:             'bg-green-100 text-green-800',
  approved_as_noted:    'bg-teal-100 text-teal-800',
  revise_resubmit:      'bg-orange-100 text-orange-800',
  rejected:             'bg-red-100 text-red-800',

  // Punch item status
  ready_for_review: 'bg-sky-100 text-sky-800',
}

export default function Badge({ variant = 'active', children, className = '' }) {
  const style = variants[variant] ?? 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${style} ${className}`}>
      {children}
    </span>
  )
}
