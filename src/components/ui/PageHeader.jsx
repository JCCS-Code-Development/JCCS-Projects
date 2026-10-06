import Button from './Button'

const PlusIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
)

// Page title + primary action.
//  - Desktop (lg+): title/subtitle left, a normal button right.
//  - Phones / iPads: just a small centered title (no subtitle, no big
//    blocks), and the action becomes a round floating button bottom-right
//    above the tab bar — CompanyCam style.
// Pass `actionLabel` + `onAction` (and optionally `actionIcon`, a component
// taking className) for the primary action; `children` render under the
// title on every screen size.
export default function PageHeader({ title, subtitle, actionLabel, onAction, actionLoading = false, actionIcon: Icon = PlusIcon, children }) {
  const hasAction = !!(actionLabel && onAction)
  return (
    <>
      <div className="flex flex-col items-center text-center gap-2 lg:flex-row lg:flex-wrap lg:items-start lg:justify-between lg:text-left lg:gap-3">
        <div className="min-w-0">
          <h1 className="text-lg lg:text-xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="hidden lg:block text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {hasAction && (
          // Wrapped: Button's own `inline-flex` would override a `hidden` on it.
          <div className="hidden lg:block shrink-0">
            <Button size="lg" onClick={onAction} loading={actionLoading} className="shadow-md shadow-brand-500/30">
              <Icon className="w-5 h-5" />{actionLabel}
            </Button>
          </div>
        )}
        {children}
      </div>

      {hasAction && (
        <button type="button" onClick={onAction} disabled={actionLoading} aria-label={actionLabel} title={actionLabel}
          className="lg:hidden fixed right-5 z-40 w-14 h-14 rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/40 flex items-center justify-center active:scale-95 active:bg-brand-700 transition-transform disabled:opacity-60"
          style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }}>
          {actionLoading
            ? <span className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            : <Icon className="w-7 h-7" />}
        </button>
      )}
    </>
  )
}
