import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, CheckCircle2, Clock, FileAudio, ListChecks, Loader2, Mic, Upload } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { useUploadDialog } from '../components/uploadContext';
import { RecordingRow } from '../components/RecordingRow';
import { StatusBadge } from '../components/StatusBadge';
import { Alert, Button, Card, EmptyState, Skeleton } from '../components/ui';
import { recordingsApi } from '../lib/recordings';
import { isRealtimeConnected } from '../hooks/useRealtimeEvents';
import { formatHours, relativeTime } from '../lib/format';
import { STAGES, stageLabel } from '../lib/constants';

function StatCard({ icon: Icon, label, value, loading, tone = 'text-brand-600 bg-brand-50' }) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <div className={`rounded-lg p-2.5 ${tone}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {loading ? <Skeleton className="mt-1 h-6 w-12" /> : <p className="text-xl font-semibold text-slate-900">{value}</p>}
      </div>
    </Card>
  );
}

function ProcessingItem({ rec }) {
  const done = rec.stages.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  const pct = Math.round((done / STAGES.length) * 100);
  return (
    <li>
      <Link to={`/recordings/${rec.id}`} className="block rounded-lg px-3 py-3 hover:bg-slate-50">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-slate-900">{rec.title}</p>
          <StatusBadge recording={rec} showStage={false} />
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-brand-500 transition-[width] duration-500" style={{ width: `${Math.max(pct, 4)}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {rec.status === 'queued' ? (rec.retryInfo ? 'Retry scheduled' : 'Waiting in queue') : stageLabel(rec.stage)} · step {Math.min(done + 1, STAGES.length)} of {STAGES.length}
        </p>
      </Link>
    </li>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const openUpload = useUploadDialog();

  const stats = useQuery({ queryKey: ['stats'], queryFn: recordingsApi.stats });
  const recent = useQuery({ queryKey: ['recordings', { limit: 6 }], queryFn: ({ signal }) => recordingsApi.list({ limit: 6 }, signal) });
  const active = useQuery({
    queryKey: ['recordings', { status: 'in_progress' }],
    queryFn: ({ signal }) => recordingsApi.list({ status: 'in_progress', limit: 10 }, signal),
    refetchInterval: (q) => (q.state.data?.items.length ? (isRealtimeConnected() ? 30_000 : 10_000) : false),
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {greeting}, {user?.name?.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Record a meeting or upload audio — we'll handle the notes.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => navigate('/record')}
          className="group flex items-center gap-4 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-left text-white shadow-sm transition hover:shadow-md"
        >
          <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
            <Mic className="h-6 w-6" aria-hidden />
          </span>
          <span className="flex-1">
            <span className="block text-lg font-semibold">New recording</span>
            <span className="block text-sm text-brand-100">Live transcript with speaker detection</span>
          </span>
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden />
        </button>
        <button
          type="button"
          onClick={openUpload}
          className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-brand-300 hover:shadow-md"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Upload className="h-6 w-6" aria-hidden />
          </span>
          <span className="flex-1">
            <span className="block text-lg font-semibold text-slate-900">Upload audio</span>
            <span className="block text-sm text-slate-500">MP3, WAV, M4A, WebM and more</span>
          </span>
          <ArrowRight className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-1" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={FileAudio} label="Meetings" value={stats.data?.total ?? 0} loading={stats.isLoading} />
        <StatCard icon={Clock} label="Recorded" value={formatHours(stats.data?.totalDurationSec)} loading={stats.isLoading} tone="text-sky-600 bg-sky-50" />
        <StatCard icon={ListChecks} label="Action items" value={stats.data?.actionItems ?? 0} loading={stats.isLoading} tone="text-emerald-600 bg-emerald-50" />
        <StatCard
          icon={stats.data?.failed ? AlertCircle : CheckCircle2}
          label={stats.data?.failed ? 'Need attention' : 'Completed'}
          value={stats.data?.failed ? stats.data.failed : (stats.data?.completed ?? 0)}
          loading={stats.isLoading}
          tone={stats.data?.failed ? 'text-rose-600 bg-rose-50' : 'text-violet-600 bg-violet-50'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Recent meetings</h2>
            <Link to="/recordings" className="text-sm font-medium text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          {recent.isError && (
            <Alert tone="error" className="m-4" action={<Button size="sm" variant="secondary" onClick={() => recent.refetch()}>Retry</Button>}>
              {recent.error.message}
            </Alert>
          )}
          {recent.isLoading ? (
            <div className="space-y-4 p-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            </div>
          ) : recent.data?.items.length ? (
            <ul className="divide-y divide-slate-100">
              {recent.data.items.map((rec) => (
                <RecordingRow key={rec.id} recording={rec} />
              ))}
            </ul>
          ) : (
            !recent.isError && (
              <EmptyState
                icon={Mic}
                title="No meetings yet"
                description="Start your first recording or upload an audio file to see AI notes here."
                action={<Button onClick={() => navigate('/record')}>Start recording</Button>}
              />
            )
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <Loader2 className={`h-4 w-4 text-brand-600 ${active.data?.items.length ? 'animate-spin' : ''}`} aria-hidden />
            <h2 className="font-semibold text-slate-900">Processing status</h2>
          </div>
          {active.isLoading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-2 w-full" />
            </div>
          ) : active.data?.items.length ? (
            <ul className="p-2">
              {active.data.items.map((rec) => (
                <ProcessingItem key={rec.id} rec={rec} />
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              Nothing processing right now.
              {stats.data?.completed > 0 && recent.data?.items[0] && <span className="mt-1 block text-xs">Last meeting {relativeTime(recent.data.items[0].createdAt)}.</span>}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
