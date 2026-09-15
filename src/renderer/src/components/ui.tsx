import React from 'react'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

type ButtonVariant = 'primary' | 'default' | 'ghost' | 'danger' | 'subtle'
type ButtonSize = 'sm' | 'md'

export function Button({
  variant = 'default',
  size = 'md',
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  const base =
    'no-drag inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed select-none active:scale-[0.98]'
  const sizes: Record<ButtonSize, string> = {
    sm: 'h-7 px-2.5 text-[12px]',
    md: 'h-9 px-3.5 text-[13px]'
  }
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-accent text-white hover:brightness-110 shadow-md shadow-accent/25',
    default: 'bg-elevated text-ink border border-border/70 hover:border-faint/50 hover:bg-faint/[0.06]',
    ghost: 'text-muted hover:text-ink hover:bg-faint/10',
    subtle: 'bg-faint/10 text-ink hover:bg-faint/20',
    danger: 'bg-danger/10 text-danger hover:bg-danger/20'
  }
  return (
    <button className={cx(base, sizes[size], variants[variant], className)} {...rest}>
      {children}
    </button>
  )
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cx('rounded-2xl border border-border/70 bg-panel', className)}>{children}</div>
  )
}

export function Badge({
  tone = 'default',
  children,
  className
}: {
  tone?: 'default' | 'ok' | 'warn' | 'danger' | 'accent'
  children: React.ReactNode
  className?: string
}) {
  const tones = {
    default: 'bg-faint/12 text-muted',
    ok: 'bg-ok/12 text-ok',
    warn: 'bg-warn/15 text-warn',
    danger: 'bg-danger/12 text-danger',
    accent: 'bg-accent/12 text-accent'
  } as const
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

export function StatusDot({ tone }: { tone: 'ok' | 'warn' | 'danger' | 'muted' }) {
  const c = {
    ok: 'bg-ok',
    warn: 'bg-warn',
    danger: 'bg-danger',
    muted: 'bg-faint'
  }[tone]
  return <span className={cx('inline-block h-2 w-2 rounded-full', c)} />
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" width="16" height="16">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-ink">{label}</span>
        {hint && <span className="text-[11px] text-faint">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        'no-drag w-full rounded-lg border border-border/70 bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-faint outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/15',
        props.className
      )}
    />
  )
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        'no-drag w-full appearance-none rounded-lg border border-border/70 bg-surface px-3 py-2 text-[13px] text-ink outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/15',
        props.className
      )}
    />
  )
}

export function Modal({
  open,
  onClose,
  children,
  title,
  width = 'max-w-lg'
}: {
  open: boolean
  onClose: () => void
  title?: string
  width?: string
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        className={cx(
          'relative w-full rounded-2xl border border-border/70 bg-panel shadow-2xl animate-fade-in',
          width
        )}
      >
        {title && (
          <div className="border-b border-border/60 px-5 py-3.5 text-[14px] font-semibold">{title}</div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
