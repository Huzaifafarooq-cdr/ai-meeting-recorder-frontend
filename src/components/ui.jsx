import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';

const BUTTON_VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
  'danger-ghost': 'text-rose-600 hover:bg-rose-50',
};
const BUTTON_SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
  icon: 'h-9 w-9 justify-center',
};

export function Button({ variant = 'primary', size = 'md', loading = false, className, children, disabled, ...props }) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }) {
  return (
    <div className={clsx('rounded-xl border border-slate-200 bg-white shadow-sm', className)} {...props}>
      {children}
    </div>
  );
}

const BADGE_TONES = {
  slate: 'bg-slate-100 text-slate-700',
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-100',
};

export function Badge({ tone = 'slate', className, children }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent', BADGE_TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={clsx('animate-spin text-brand-600', className ?? 'h-5 w-5')} aria-label="Loading" />;
}

export function Skeleton({ className }) {
  return <div className={clsx('animate-pulse rounded-md bg-slate-200/70', className)} aria-hidden />;
}

const ALERT_STYLES = {
  info: { box: 'bg-blue-50 text-blue-900 ring-blue-200', icon: Info, iconClass: 'text-blue-500' },
  warning: { box: 'bg-amber-50 text-amber-900 ring-amber-200', icon: AlertTriangle, iconClass: 'text-amber-500' },
  error: { box: 'bg-rose-50 text-rose-900 ring-rose-200', icon: XCircle, iconClass: 'text-rose-500' },
  success: { box: 'bg-emerald-50 text-emerald-900 ring-emerald-200', icon: CheckCircle2, iconClass: 'text-emerald-500' },
};

export function Alert({ tone = 'info', title, children, action, className }) {
  const s = ALERT_STYLES[tone];
  const Icon = s.icon;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={clsx('flex gap-3 rounded-lg p-3.5 text-sm ring-1 ring-inset', s.box, className)}>
      <Icon className={clsx('mt-0.5 h-5 w-5 shrink-0', s.iconClass)} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={clsx(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && (
        <div className="mb-4 rounded-full bg-brand-50 p-3">
          <Icon className="h-6 w-6 text-brand-600" aria-hidden />
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Field({ label, error, hint, id, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-rose-600" id={`${id}-error`}>
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

export const inputClass =
  'block w-full rounded-lg border-0 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500';
