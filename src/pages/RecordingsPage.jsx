import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, FileSearch, Loader2, Mic, Search, X } from 'lucide-react';
import { RecordingRow } from '../components/RecordingRow';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Alert, Button, Card, EmptyState, Skeleton, inputClass } from '../components/ui';
import { useUploadDialog } from '../components/uploadContext';
import { useDebouncedValue } from '../hooks/useMisc';
import { recordingsApi } from '../lib/recordings';

const PAGE_SIZE = 12;

const startOfDay = (d) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);
const endOfDay = (d) => (d ? new Date(`${d}T23:59:59.999`).toISOString() : undefined);

export function RecordingsPage() {
  const queryClient = useQueryClient();
  const openUpload = useUploadDialog();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const debouncedQ = useDebouncedValue(q.trim(), 350);
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const status = params.get('status') ?? '';
  const page = Number(params.get('page') ?? 1);
  const [toDelete, setToDelete] = useState(null);

  const setParam = (key, value) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.delete('page');
        return next;
      },
      { replace: true }
    );

  useEffect(() => {
    if ((params.get('q') ?? '') !== debouncedQ) setParam('q', debouncedQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  useEffect(() => {
    const urlQ = params.get('q') ?? '';
    if (urlQ !== debouncedQ) setQ(urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('q')]);

  const query = { q: params.get('q') ?? '', from: startOfDay(from), to: endOfDay(to), status, page, limit: PAGE_SIZE };
  const list = useQuery({
    queryKey: ['recordings', query],
    queryFn: ({ signal }) => recordingsApi.list(query, signal),
    placeholderData: keepPreviousData,
  });

  const del = useMutation({
    mutationFn: (rec) => recordingsApi.remove(rec.id),
    onSuccess: () => {
      toast.success('Recording deleted');
      queryClient.invalidateQueries({ queryKey: ['recordings'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setToDelete(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE_SIZE));
  const hasFilters = Boolean(query.q || from || to || status);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Recordings</h1>
          <p className="mt-1 text-sm text-slate-500">Search across titles, transcripts, summaries and keywords.</p>
        </div>
        <Button variant="secondary" onClick={openUpload}>
          Upload audio
        </Button>
      </div>

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input type="search" className={`${inputClass} pl-9 pr-9`} placeholder="e.g. authentication, Redis, deployment…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search recordings" />
            {(q.trim() !== debouncedQ || list.isFetching) && (
              <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" aria-label="Searching" />
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span className="shrink-0">From</span>
            <input type="date" className={inputClass} value={from} max={to || undefined} onChange={(e) => setParam('from', e.target.value)} aria-label="From date" />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span className="shrink-0">To</span>
            <input type="date" className={inputClass} value={to} min={from || undefined} onChange={(e) => setParam('to', e.target.value)} aria-label="To date" />
          </label>
          <select className={inputClass} value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="in_progress">Processing</option>
            <option value="failed">Failed</option>
            <option value="recording">Recording</option>
          </select>
        </div>
        {hasFilters && (
          <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
            <span aria-live="polite">{list.data ? `${list.data.total} result${list.data.total === 1 ? '' : 's'}` : 'Searching…'}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQ('');
                setParams({}, { replace: true });
              }}
            >
              <X className="h-3.5 w-3.5" /> Clear filters
            </Button>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        {list.isError && (
          <Alert tone="error" className="m-4" action={<Button size="sm" variant="secondary" onClick={() => list.refetch()}>Retry</Button>}>
            {list.error.message}
          </Alert>
        )}
        {list.isLoading ? (
          <ul className="divide-y divide-slate-100">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="space-y-2 px-5 py-4">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/4" />
                <Skeleton className="h-3 w-3/4" />
              </li>
            ))}
          </ul>
        ) : list.data?.items.length ? (
          <ul className={`divide-y divide-slate-100 transition-opacity ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
            {list.data.items.map((rec) => (
              <RecordingRow key={rec.id} recording={rec} query={query.q} onDelete={setToDelete} />
            ))}
          </ul>
        ) : (
          !list.isError &&
          (hasFilters ? (
            <EmptyState icon={FileSearch} title="No matching recordings" description="Try different keywords or widen the date range." />
          ) : (
            <EmptyState icon={Mic} title="No recordings yet" description="Your recorded and uploaded meetings will appear here." />
          ))
        )}
      </Card>

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between" aria-label="Pagination">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setParam('page', String(page + 1))}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </nav>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete recording?"
        description={toDelete ? `“${toDelete.title}”, its audio, transcript and AI notes will be permanently deleted.` : ''}
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() => del.mutate(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
