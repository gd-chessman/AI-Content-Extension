import type { ButtonHTMLAttributes } from 'react'
import { SiGooglesheets } from 'react-icons/si'

const sizeClass = {
  sm: 'rounded-lg px-3 py-1.5 text-xs',
  md: 'rounded-xl px-3 py-2 text-xs',
}

export default function GgSheetPushButton({
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 border border-green-500/35 bg-green-500/12 font-medium text-green-50 transition hover:border-green-400/45 hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-40 ${sizeClass[size]} ${className}`}
      {...props}
    >
      <SiGooglesheets className="h-3.5 w-3.5 shrink-0 text-green-400" aria-hidden />
      {children}
    </button>
  )
}
