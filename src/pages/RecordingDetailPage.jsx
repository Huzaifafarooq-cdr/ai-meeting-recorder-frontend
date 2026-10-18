import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isRealtimeConnected } from '../hooks/useRealtimeEvents';
import { useDebouncedValue } from '../hooks/useMisc';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Gavel,
  Lightbulb,
  ListChecks,
  Mic,
  Pencil,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Tag,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { recordingsApi } from '../lib/recordings';
import { LIMITS, validateTitle } from '../lib/validation';
import { formatDate, formatDuration } from '../lib/format';
import { stageLabel } from '../lib/constants';
import { StatusBadge } from '../components/StatusBadge';
import { ProcessingStepper } from '../components/ProcessingStepper';
import { TranscriptView } from '../components/TranscriptView';
import { AudioPlayer } from '../components/AudioPlayer';
import { SpeakerEditor } from '../components/SpeakerEditor';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Alert, Badge, Button, Card, EmptyState, Skeleton, inputClass } from '../components/ui';

function Section({ icon: Icon, title, children, className }) {
  return (
    <Card className={clsx('p-5', className)}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Icon className="h-4 w-4 text-brand-600" aria-hidden /> {title}
      </h2>
      {children}
    </Card>
  );
}

function TitleEditor({ recording }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(recording.title);
  const [error, setError] = useState(null);
  const mutation = useMutation({
    mutationFn: (title) => recordingsApi.update(recording.id, { title }),
    onSuccess: (rec) => {
      queryClient.setQueryData(['recording', rec.id], rec);
      queryClient.invalidateQueries({ queryKey: ['recordings'] });
      setEditing(false);
    },
    onError: (err) => toast.error(err.message),
  });

  if (!editing) {
    return (
      <div className="group flex min-w-0 items-start gap-2">
        <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight text-slate-900">{recording.title}</h1>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 opacity-60 group-hover:opacity-100"
          onClick={() => {
            setValue(recording.title);
            setError(null);
            setEditing(true);
          }}
          aria-label="Edit title"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    );
  }
  return (
    <form
      className="w-full max-w-xl"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (mutation.isPending) return;
        const invalid = validateTitle(value);
        if (invalid) return setError(invalid);
        const title = value.trim();
        if (title === recording.title) return setEditing(false);
        mutation.mutate(title);
      }}
    >
      <div className="flex gap-2">
        <input
          className={inputClass}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          maxLength={LIMITS.title}
          autoFocus
          aria-label="Meeting title"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'title-error' : undefined}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        />
        <Button type="submit" loading={mutation.isPending} size="md">
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      {error && (
        <p id="title-error" className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      )}
    </form>
  );
}

function ActionItems({ recordingId, items }) {
  const queryClient = useQueryClient();
  const key = ['recording', recordingId];
  const toggle = useMutation({
    mutationFn: ({ index, done }) => recordingsApi.setActionItemDone(recordingId, index, done),
    onMutate: async ({ index, done }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old) => old && { ...old, actionItems: old.actionItems.map((a, i) => (i === index ? { ...a, done } : a)) });
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      queryClient.setQueryData(key, ctx?.previous);
      toast.error('Could not update the action item', { description: err.message });
    },
    onSuccess: (rec) => queryClient.setQueryData(key, rec),
  });

  if (!items.length) return <p className="text-sm text-slate-500">No action items were identified.</p>;
  return (
    <ul className="space-y-2">
      {items.map((item, i) => {
        const checked = Boolean(item.done);
        const saving = toggle.isPending && toggle.variables?.index === i;
        return (
          <li key={i}>
            <button
              type="button"
              onClick={() => !saving && toggle.mutate({ index: i, done: !checked })}
              className="flex w-full items-start gap-3 rounded-lg p-2 text-left hover:bg-slate-50"
              aria-pressed={checked}
              aria-busy={saving}
            >
              {checked ? <CheckSquare className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden /> : <Square className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" aria-hidden />}
              <span className="min-w-0 flex-1">
                <span className={clsx('block text-sm text-slate-800', checked && 'text-slate-400 line-through')}>{item.text}</span>
                {(item.owner || item.due) && (
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {item.owner && (
                      <Badge tone="brand">
                        <Users className="h-3 w-3" /> {item.owner}
                      </Badge>
                    )}
                    {item.due && (
                      <Badge tone="amber">
                        <CalendarDays className="h-3 w-3" /> {item.due}
                      </Badge>
                    )}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function buildNotes(rec, speakerName, segments) {
  const lines = [`# ${rec.title}`, '', `${formatDate(rec.createdAt)} · ${formatDuration(rec.durationSec)}`, ''];
  if (rec.summary) {
    lines.push('## Summary', rec.summary.overview, '');
    if (rec.summary.outcome) lines.push(`**Outcome:** ${rec.summary.outcome}`, '');
  }
  if (rec.keyDecisions?.length) lines.push('## Key decisions', ...rec.keyDecisions.map((d) => `- ${d}`), '');
  if (rec.actionItems?.length) lines.push('## Action items', ...rec.actionItems.map((a) => `- [${a.done ? 'x' : ' '}] ${a.text}${a.owner ? ` (@${a.owner})` : ''}${a.due ? ` — due ${a.due}` : ''}`), '');
  if (rec.keywords?.length) lines.push(`**Keywords:** ${rec.keywords.join(', ')}`, '');
  if (segments?.length) lines.push('## Transcript', ...segments.map((s) => `**${speakerName(s.speaker)}:** ${s.cleanText ?? s.text}`));
  return lines.join('\n');
}

export function RecordingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const playerRef = useRef(null);
  const [tab, setTab] = useState('overview');
  const [view, setView] = useState('clean');
  const [find, setFind] = useState('');
  const [editingSpeakers, setEditingSpeakers] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [playTime, setPlayTime] = useState(null);

  const recQuery = useQuery({
    queryKey: ['recording', id],
    queryFn: () => recordingsApi.get(id),
    refetchInterval: (q) => (['queued', 'processing'].includes(q.state.data?.status) ? (isRealtimeConnected() ? 30_000 : 8000) : false),
    retry: (count, err) => err.status !== 404 && count < 2,
  });
  const rec = recQuery.data;
  const isProcessing = rec && ['queued', 'processing', 'recording'].includes(rec.status);
  const transcriptReady = rec?.stages?.find((s) => s.key === 'transcript')?.status === 'done';

  const finalTranscript = useQuery({
    queryKey: ['transcript', id, 'final'],
    queryFn: () => recordingsApi.transcript(id, 'final'),
    enabled: Boolean(transcriptReady),
  });
  const liveTranscript = useQuery({
    queryKey: ['transcript', id, 'live'],
    queryFn: () => recordingsApi.transcript(id, 'live'),
    enabled: Boolean(rec && rec.source === 'live' && !transcriptReady),
  });

  const speakerName = useCallback(
    (label) => {
      const s = rec?.speakers?.find((sp) => sp.label === label);
      return s?.name?.trim() || label;
    },
    [rec?.speakers]
  );

  const segments = useMemo(() => {
    const source = transcriptReady ? finalTranscript.data?.segments : liveTranscript.data?.segments;
    return (source ?? []).map((s) => ({
      id: `${s.idx}`,
      speaker: s.speaker,
      start: s.start,
      end: s.end,
      text: view === 'clean' && s.cleanText ? s.cleanText : s.text,
      cleanText: s.cleanText,
    }));
  }, [transcriptReady, finalTranscript.data, liveTranscript.data, view]);

  const findTerm = useDebouncedValue(find.trim(), 200);
  const transcriptRef = useRef(null);
  const [matches, setMatches] = useState({ total: 0, index: 0 });

  useEffect(() => {
    const marks = transcriptRef.current?.querySelectorAll('mark') ?? [];
    setMatches({ total: marks.length, index: 0 });
  }, [findTerm, segments, tab]);

  useEffect(() => {
    const marks = transcriptRef.current?.querySelectorAll('mark');
    if (!marks?.length) return;
    marks.forEach((m) => m.classList.remove('current-match'));
    const current = marks[matches.index];
    current?.classList.add('current-match');
    current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [matches]);

  const stepMatch = (delta) => setMatches((m) => (m.total ? { ...m, index: (m.index + delta + m.total) % m.total } : m));

  const retry = useMutation({
    mutationFn: () => recordingsApi.retry(id),
    onSuccess: (r) => {
      queryClient.setQueryData(['recording', id], r);
      toast.success('Processing restarted');
    },
    onError: (err) => toast.error(err.message),
  });
  const del = useMutation({
    mutationFn: () => recordingsApi.remove(id),
    onSuccess: () => {
      toast.success('Recording deleted');
      queryClient.invalidateQueries({ queryKey: ['recordings'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      navigate('/recordings', { replace: true });
    },
    onError: (err) => toast.error(err.message),
  });

  const copyNotes = async () => {
    try {
      await navigator.clipboard.writeText(buildNotes(rec, speakerName, finalTranscript.data?.segments));
      toast.success('Meeting notes copied as Markdown');
    } catch {
      toast.error('Could not access the clipboard.');
    }
  };

  if (recQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-12 w-full rounded-full" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }
  if (recQuery.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        {recQuery.error.status === 404 ? (
          <EmptyState icon={Search} title="Recording not found" description="It may have been deleted, or the link is incorrect." action={<Button onClick={() => navigate('/recordings')}>Back to recordings</Button>} />
        ) : (
          <Alert tone="error" action={<Button size="sm" variant="secondary" onClick={() => recQuery.refetch()}>Retry</Button>}>
            {recQuery.error.message}
          </Alert>
        )}
      </div>
    );
  }

  const showResults = rec.status === 'completed' || (rec.status === 'failed' && transcriptReady);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <Link to="/recordings" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Recordings
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <TitleEditor key={rec.title} recording={rec} />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
            <StatusBadge recording={rec} />
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-4 w-4" aria-hidden /> {formatDate(rec.createdAt)}
            </span>
            {rec.durationSec > 0 && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-4 w-4" aria-hidden /> {formatDuration(rec.durationSec)}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              {rec.source === 'live' ? <Mic className="h-4 w-4" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
              {rec.source === 'live' ? 'Recorded live' : 'Uploaded'}
            </span>
            {rec.speakers?.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-4 w-4" aria-hidden /> {rec.speakers.length} speaker{rec.speakers.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {rec.status === 'completed' && (
            <Button variant="secondary" onClick={copyNotes}>
              <Copy className="h-4 w-4" /> Copy notes
            </Button>
          )}
          {rec.status === 'failed' && rec.error?.retryable !== false && (
            <Button onClick={() => retry.mutate()} loading={retry.isPending}>
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
          )}
          <Button variant="danger-ghost" size="icon" onClick={() => setConfirmDelete(true)} aria-label="Delete recording">
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="mb-5 space-y-3">
        {rec.status === 'failed' && rec.error && (
          <Alert tone="error" title={`Processing failed at “${stageLabel(rec.error.stage)}”`}>
            {rec.error.message}
            {transcriptReady && ' Your transcript is still available below.'}
          </Alert>
        )}
        {rec.status === 'recording' && (
          <Alert tone="info" title="This recording is still in progress">
            If the recording was interrupted, whatever audio reached the server will be processed automatically within about 30 minutes.
          </Alert>
        )}
        {rec.warnings?.map((w) => (
          <Alert key={w.code} tone="warning">
            {w.message}
          </Alert>
        ))}
      </div>

      {rec.hasAudio && rec.status !== 'recording' && (
        <Card className="mb-5 p-3">
          <AudioPlayer recordingId={rec.id} ref={playerRef} onTimeUpdate={setPlayTime} />
        </Card>
      )}

      {(isProcessing || (rec.status === 'failed' && !transcriptReady)) && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Section icon={Sparkles} title="AI processing">
            <ProcessingStepper recording={rec} />
          </Section>
          <Card className="flex flex-col lg:col-span-2">
            <div className="border-b border-slate-100 px-5 py-3.5">
              <h2 className="font-semibold text-slate-900">{rec.source === 'live' ? 'Live transcript (draft)' : 'Transcript'}</h2>
              <p className="text-xs text-slate-500">
                {rec.source === 'live' ? 'Captured during recording. The final, cleaned transcript replaces this when processing finishes.' : 'The transcript will appear here once speech-to-text completes.'}
              </p>
            </div>
            <div className="px-5">
              {liveTranscript.isLoading ? (
                <div className="space-y-3 py-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              ) : (
                <TranscriptView segments={segments} speakerName={speakerName} className="max-h-[60vh]" emptyText="No transcript yet — it will appear as soon as it's ready." />
              )}
            </div>
          </Card>
        </div>
      )}

      {showResults && (
        <>
          <div className="mb-5 flex gap-1 border-b border-slate-200" role="tablist" aria-label="Meeting sections">
            {[
              { key: 'overview', label: 'Summary & actions' },
              { key: 'transcript', label: 'Transcript' },
              ...(rec.status === 'failed' ? [{ key: 'progress', label: 'Processing' }] : []),
            ].map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={clsx('-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors', tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800')}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="grid gap-5 lg:grid-cols-3">
              <div className="space-y-5 lg:col-span-2">
                <Section icon={Sparkles} title="Meeting summary">
                  {rec.summary ? (
                    <div className="space-y-4 text-sm leading-relaxed text-slate-700">
                      <p>{rec.summary.overview}</p>
                      {rec.summary.topics?.length > 0 && (
                        <div>
                          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Important topics</h3>
                          <ul className="list-disc space-y-1 pl-5">
                            {rec.summary.topics.map((t, i) => (
                              <li key={i}>{t}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {rec.summary.decisions?.length > 0 && (
                        <div>
                          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Decisions made</h3>
                          <ul className="list-disc space-y-1 pl-5">
                            {rec.summary.decisions.map((d, i) => (
                              <li key={i}>{d}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {rec.summary.outcome && (
                        <div className="rounded-lg bg-brand-50 p-3 text-brand-900">
                          <span className="font-semibold">Final outcome: </span>
                          {rec.summary.outcome}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">{rec.status === 'failed' ? 'The summary could not be generated. Use Retry to try again.' : 'No summary available.'}</p>
                  )}
                </Section>
                <Section icon={ListChecks} title={`Action items${rec.actionItems?.length ? ` (${rec.actionItems.length})` : ''}`}>
                  <ActionItems recordingId={rec.id} items={rec.actionItems ?? []} />
                </Section>
              </div>
              <div className="space-y-5">
                <Section icon={Gavel} title="Key decisions">
                  {rec.keyDecisions?.length ? (
                    <ul className="space-y-2">
                      {rec.keyDecisions.map((d, i) => (
                        <li key={i} className="flex gap-2 text-sm text-slate-700">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> {d}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">No explicit decisions detected.</p>
                  )}
                </Section>
                <Section icon={Tag} title="Keywords">
                  {rec.keywords?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {rec.keywords.map((k) => (
                        <Link key={k} to={`/recordings?q=${encodeURIComponent(k)}`} className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100">
                          {k}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No keywords.</p>
                  )}
                </Section>
                <Section icon={Lightbulb} title="Insights">
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      ['Speakers', rec.stats?.speakerCount ?? rec.speakers?.length ?? 0],
                      ['Words', rec.stats?.wordCount?.toLocaleString() ?? '—'],
                      ['Speaker turns', rec.stats?.segmentCount ?? '—'],
                      ['Confidence', rec.stats?.avgConfidence ? `${Math.round(rec.stats.avgConfidence * 100)}%` : '—'],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-slate-50 p-2.5">
                        <dt className="text-xs text-slate-500">{k}</dt>
                        <dd className="font-semibold text-slate-900">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </Section>
              </div>
            </div>
          )}

          {tab === 'transcript' && (
            <Card>
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm" role="group" aria-label="Transcript version">
                  {[
                    ['clean', 'Clean'],
                    ['raw', 'Original'],
                  ].map(([k, label]) => (
                    <button key={k} onClick={() => setView(k)} aria-pressed={view === k} className={clsx('rounded-md px-3 py-1 font-medium', view === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="relative min-w-40 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                  <input
                    type="search"
                    className={`${inputClass} py-2 pl-9`}
                    placeholder="Find in transcript"
                    value={find}
                    onChange={(e) => setFind(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        stepMatch(e.shiftKey ? -1 : 1);
                      } else if (e.key === 'Escape') setFind('');
                    }}
                    aria-label="Find in transcript"
                  />
                </div>
                {findTerm.length >= 2 && (
                  <div className="flex items-center gap-0.5 text-xs text-slate-500">
                    <span className="min-w-16 tabular-nums" aria-live="polite">
                      {matches.total ? `${matches.index + 1} of ${matches.total}` : 'No matches'}
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => stepMatch(-1)} disabled={!matches.total} aria-label="Previous match (Shift+Enter)">
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => stepMatch(1)} disabled={!matches.total} aria-label="Next match (Enter)">
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                {rec.speakers?.length > 0 && (
                  <Button variant="secondary" size="sm" onClick={() => setEditingSpeakers((v) => !v)}>
                    <Users className="h-4 w-4" /> Rename speakers
                  </Button>
                )}
              </div>
              {editingSpeakers && (
                <div className="border-b border-slate-100 p-4">
                  <SpeakerEditor recording={rec} onDone={() => setEditingSpeakers(false)} />
                </div>
              )}
              <div className="px-5" ref={transcriptRef}>
                {finalTranscript.isLoading ? (
                  <div className="space-y-4 py-5">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : finalTranscript.isError ? (
                  <Alert tone="error" className="my-4" action={<Button size="sm" variant="secondary" onClick={() => finalTranscript.refetch()}>Retry</Button>}>
                    {finalTranscript.error.message}
                  </Alert>
                ) : (
                  <TranscriptView
                    segments={segments}
                    speakerName={speakerName}
                    onSeek={rec.hasAudio ? (t) => playerRef.current?.seek(t) : undefined}
                    activeTime={playTime}
                    highlight={findTerm}
                    emptyText="No speech was detected in this recording."
                  />
                )}
              </div>
            </Card>
          )}

          {tab === 'progress' && (
            <Section icon={Sparkles} title="AI processing" className="max-w-md">
              <ProcessingStepper recording={rec} />
            </Section>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this recording?"
        description="The audio, transcript and all AI notes will be permanently deleted. This cannot be undone."
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() => del.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
