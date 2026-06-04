import type { ButtonHTMLAttributes } from 'react'
import { FiPlay } from 'react-icons/fi'

const sizeClass = {
  sm: 'rounded-lg px-3 py-1.5 text-xs',
  md: 'rounded-xl px-3 py-2 text-xs',
}

export default function GrokRunButton({
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 border border-sky-500/35 bg-sky-500/12 font-medium text-sky-50 transition hover:border-sky-400/45 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40 ${sizeClass[size]} ${className}`}
      {...props}
    >
      <FiPlay className="h-3.5 w-3.5 shrink-0 text-sky-400" aria-hidden />
      {children}
    </button>
  )
}
