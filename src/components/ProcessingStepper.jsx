import clsx from 'clsx';
import { Check, Circle, Loader2, Minus, PartyPopper, X } from 'lucide-react';
import { STAGES } from '../lib/constants';
import { relativeTime } from '../lib/format';

const ICONS = {
  done: { Icon: Check, className: 'bg-emerald-500 text-white' },
  running: { Icon: Loader2, className: 'bg-brand-600 text-white', spin: true },
  failed: { Icon: X, className: 'bg-rose-500 text-white' },
  skipped: { Icon: Minus, className: 'bg-slate-200 text-slate-500' },
  pending: { Icon: Circle, className: 'bg-white text-slate-300 ring-1 ring-slate-200' },
};

export function ProcessingStepper({ recording }) {
  const byKey = Object.fromEntries((recording.stages ?? []).map((s) => [s.key, s]));
  const queued = recording.status === 'queued';
  const completed = recording.status === 'completed';

  return (
    <div>
      {queued && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {recording.retryInfo
            ? `Retrying (attempt ${recording.retryInfo.attempt} of ${recording.retryInfo.maxAttempts}) ${relativeTime(recording.retryInfo.nextRunAt)} — ${recording.retryInfo.message}`
            : 'Waiting for an available AI worker…'}
        </p>
      )}
      <ol className="space-y-0" aria-label="Processing progress">
        {STAGES.map((stage, i) => {
          const s = byKey[stage.key] ?? { status: 'pending' };
          const { Icon, className, spin } = ICONS[s.status] ?? ICONS.pending;
          const isLast = i === STAGES.length - 1;
          return (
            <li key={stage.key} className="relative flex gap-3 pb-4">
              {!isLast && <span className={clsx('absolute left-[13px] top-7 h-[calc(100%-20px)] w-0.5', s.status === 'done' ? 'bg-emerald-300' : 'bg-slate-200')} aria-hidden />}
              <span className={clsx('relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', className)}>
                <Icon className={clsx('h-4 w-4', spin && 'animate-spin')} aria-hidden />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className={clsx('text-sm font-medium', s.status === 'pending' ? 'text-slate-400' : 'text-slate-900')}>
                  {stage.label}
                  <span className="sr-only"> — {s.status}</span>
                </p>
                <p className={clsx('text-xs', s.status === 'failed' ? 'text-rose-600' : 'text-slate-500')}>
                  {s.status === 'failed' ? s.error : s.status === 'skipped' ? 'Skipped — no speech to analyse' : stage.description}
                </p>
              </div>
            </li>
          );
        })}
        <li className="flex gap-3">
          <span className={clsx('flex h-7 w-7 items-center justify-center rounded-full', completed ? 'bg-emerald-500 text-white' : 'bg-white text-slate-300 ring-1 ring-slate-200')}>
            <PartyPopper className="h-4 w-4" aria-hidden />
          </span>
          <p className={clsx('pt-1 text-sm font-medium', completed ? 'text-slate-900' : 'text-slate-400')}>Completed</p>
        </li>
      </ol>
    </div>
  );
}
