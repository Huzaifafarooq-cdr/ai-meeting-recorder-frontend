import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowRight, CornerDownLeft, FileSearch, Loader2, Mic, Search, Upload } from 'lucide-react';
import { useDebouncedValue } from '../hooks/useMisc';
import { recordingsApi } from '../lib/recordings';
import { formatDate } from '../lib/format';
import { Highlight } from './Highlight';
import { StatusBadge } from './StatusBadge';
import { Skeleton, inputClass } from './ui';

const MIN_CHARS = 2;
const QUICK_LIMIT = 6;
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function GlobalSearch() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const listId = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const term = useDebouncedValue(q.trim(), 300);
  const typing = q.trim() !== term;
  const enabled = open && term.length >= MIN_CHARS;

  const results = useQuery({
    queryKey: ['recordings', { q: term, limit: QUICK_LIMIT, quick: true }],
    queryFn: ({ signal }) => recordingsApi.list({ q: term, limit: QUICK_LIMIT }, signal),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const items = enabled ? (results.data?.items ?? []) : [];
  const total = results.data?.total ?? 0;
  const busy = enabled && (typing || results.isFetching);

  useEffect(() => setActive(-1), [term]);

  useEffect(() => {
    const onKey = (e) => {
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !inField)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const close = () => {
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
  };
  const go = (to) => {
    close();
    setQ('');
    navigate(to);
  };
  const seeAll = () => go(`/recordings${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && items[active]) go(`/recordings/${items[active].id}`);
      else seeAll();
    } else if (e.key === 'Escape') {
      if (open) close();
      else setQ('');
    }
  };

  const showPanel = open && q.trim().length > 0;

  return (
    <div className="relative max-w-lg flex-1" role="search">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder="Search titles, transcripts, summaries, keywords…"
        className={clsx(inputClass, 'pl-9 pr-16')}
        role="combobox"
        aria-label="Search recordings"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
        {busy && <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden />}
        {!q && (
          <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-400 sm:inline-block">
            {isMac ? '⌘K' : 'Ctrl K'}
          </kbd>
        )}
      </span>

      {showPanel && (
        <div
          className="pop-in fixed inset-x-3 top-[4.5rem] z-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5 sm:absolute sm:inset-x-0 sm:top-full sm:mt-2"
          onMouseDown={(e) => e.preventDefault()}
        >
          {q.trim().length < MIN_CHARS ? (
            <p className="px-4 py-3 text-sm text-slate-500">Keep typing — at least {MIN_CHARS} characters.</p>
          ) : results.isError ? (
            <p className="px-4 py-3 text-sm text-red-600">Search failed: {results.error.message}</p>
          ) : !results.data ? (
            <div className="space-y-3 p-4" aria-label="Loading results">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className={clsx('flex flex-col items-center gap-1 px-4 py-6 text-center transition-opacity', busy && 'opacity-60')}>
              <FileSearch className="h-6 w-6 text-slate-300" aria-hidden />
              <p className="text-sm font-medium text-slate-700">No matches for “{term}”</p>
              <p className="text-xs text-slate-500">Try another word — search covers titles, transcripts, summaries and keywords.</p>
            </div>
          ) : (
            <ul id={listId} role="listbox" aria-label="Search results" className={clsx('max-h-[60vh] overflow-y-auto py-1 transition-opacity', busy && 'opacity-60')}>
              {items.map((rec, i) => {
                const SourceIcon = rec.source === 'live' ? Mic : Upload;
                return (
                  <li
                    key={rec.id}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(`/recordings/${rec.id}`)}
                    className={clsx('flex cursor-pointer items-start gap-3 px-4 py-2.5', i === active ? 'bg-brand-50' : 'hover:bg-slate-50')}
                  >
                    <span className="mt-0.5 rounded-md bg-slate-100 p-1.5 text-slate-500">
                      <SourceIcon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">
                          <Highlight text={rec.title} query={term} />
                        </span>
                        <span className="shrink-0">
                          <StatusBadge recording={rec} showStage={false} />
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-400">{formatDate(rec.createdAt)}</span>
                      {rec.match?.snippet && rec.match.field !== 'title' && (
                        <span className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                          <span className="mr-1 font-medium uppercase text-slate-400">{rec.match.field}</span>
                          <Highlight text={rec.match.snippet} query={term} />
                        </span>
                      )}
                    </span>
                    {i === active && <CornerDownLeft className="mt-1 h-3.5 w-3.5 shrink-0 text-brand-500" aria-hidden />}
                  </li>
                );
              })}
            </ul>
          )}

          {q.trim().length >= MIN_CHARS && (
            <button
              type="button"
              onClick={seeAll}
              className="flex w-full items-center justify-between border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-left text-sm font-medium text-brand-700 hover:bg-slate-100"
            >
              <span>{results.data && total > items.length ? `See all ${total} results` : 'Open in Recordings'} for “{q.trim()}”</span>
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          )}
          <div className="hidden items-center gap-3 border-t border-slate-100 px-4 py-1.5 text-[11px] text-slate-400 sm:flex">
            <span>↑↓ navigate</span>
            <span>↵ open</span>
            <span>Esc close</span>
          </div>
        </div>
      )}
    </div>
  );
}
