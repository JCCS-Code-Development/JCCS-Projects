import { forwardRef } from 'react'

// iOS/iPadOS Safari renders an EMPTY date/time input with no intrinsic size
// (it ignores width/height until a value is picked), so it collapses and
// overlaps its neighbours. Native appearance off + a fixed min height + block
// display makes it size like every other field.
const DATE_TYPES = ['date', 'datetime-local', 'time', 'month']
const DATE_FIX = 'appearance-none block min-h-[50px] bg-white text-left'

const Input = forwardRef(function Input({
  label,
  error,
  helperText,
  className = '',
  inputMode,
  type = 'text',
  ...props
}, ref) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-gray-700">{label}</label>
      )}
      <input
        ref={ref}
        type={type}
        inputMode={inputMode}
        className={`
          ${DATE_TYPES.includes(type) ? DATE_FIX : ''}
          w-full rounded-xl border px-4 py-3 text-base outline-none transition-colors
          ${error
            ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100'
            : 'border-gray-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100'
          }
        `}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {helperText && !error && <p className="text-xs text-gray-500">{helperText}</p>}
    </div>
  )
})

export default Input
