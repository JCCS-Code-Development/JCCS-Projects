// Page title + primary action. On phones and iPads (below the desktop `lg`
// breakpoint) everything is centered and the action button spans the width
// (capped so it doesn't stretch absurdly on an iPad); on desktop the title
// sits left and the action right, as before.
export default function PageHeader({ title, subtitle, action, children }) {
  return (
    <div className="flex flex-col items-center text-center gap-3 lg:flex-row lg:items-start lg:justify-between lg:text-left">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && (
        <div className="w-full max-w-md lg:w-auto lg:max-w-none shrink-0 [&>button]:w-full lg:[&>button]:w-auto">
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
