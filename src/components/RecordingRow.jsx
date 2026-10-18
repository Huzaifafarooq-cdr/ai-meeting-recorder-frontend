import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Mic, Trash2, Upload } from 'lucide-react';
import { formatDate, formatDuration } from '../lib/format';
import { StatusBadge } from './StatusBadge';
import { Highlight } from './Highlight';
import { Button } from './ui';

export const RecordingRow = memo(function RecordingRow({ recording: rec, query, onDelete }) {
  const SourceIcon = rec.source === 'live' ? Mic : Upload;
  return (
    <li className="group relative flex items-start gap-4 px-4 py-4 transition-colors hover:bg-slate-50 sm:px-5">
      <div className="mt-0.5 hidden rounded-lg bg-slate-100 p-2 text-slate-500 sm:block">
        <SourceIcon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/recordings/${rec.id}`} className="truncate font-medium text-slate-900 after:absolute after:inset-0 hover:text-brand-700">
            <Highlight text={rec.title} query={query} />
          </Link>
          <StatusBadge recording={rec} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>{formatDate(rec.createdAt)}</span>
          {rec.durationSec > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden /> {formatDuration(rec.durationSec)}
            </span>
          )}
          {rec.stats?.speakerCount > 0 && <span>{rec.stats.speakerCount} speakers</span>}
        </div>
        {rec.match?.snippet && (
          <p className="mt-2 line-clamp-2 text-sm text-slate-600">
            <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium uppercase text-slate-500">{rec.match.field}</span>
            <Highlight text={rec.match.snippet} query={query} />
          </p>
        )}
        {rec.keywords?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {rec.keywords.slice(0, 6).map((k) => (
              <span key={k} className="rounded-md bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                <Highlight text={k} query={query} />
              </span>
            ))}
          </div>
        )}
      </div>
      {onDelete && (
        <Button
          variant="danger-ghost"
          size="icon"
          className="relative z-10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
          onClick={() => onDelete(rec)}
          aria-label={`Delete ${rec.title}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </li>
  );
});
