import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Activity, CloudUpload, Download, Mic, MicOff, Monitor, Pause, Play, Radio, Sparkles, Square, Trash2, User, Wifi, WifiOff } from 'lucide-react';
import { canCaptureTab, getRecorderSupport, useRecorder } from '../hooks/useRecorder';
import { useLiveTranscript } from '../hooks/useLiveTranscript';
import { useAudioDevices, useNetworkStatus } from '../hooks/useMisc';
import { LevelMeter, Waveform } from '../components/AudioVisuals';
import { TranscriptView } from '../components/TranscriptView';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Alert, Badge, Button, Card, inputClass } from '../components/ui';
import { recordingsApi } from '../lib/recordings';
import { formatBytes, formatClock } from '../lib/format';

const MIN_DURATION_S = 1.5;

const CONNECTION_META = {
  idle: { label: 'Not connected', tone: 'slate' },
  connecting: { label: 'Connecting…', tone: 'amber' },
  live: { label: 'Live', tone: 'green' },
  reconnecting: { label: 'Reconnecting…', tone: 'amber' },
  offline: { label: 'Offline — saving locally', tone: 'rose' },
  closed: { label: 'Finished', tone: 'slate' },
};

const AUDIO_WARNINGS = {
  silent: "We can't hear anything. Check that the right microphone is selected and isn't muted.",
  low: 'Your audio is very quiet. Move closer to the microphone or raise its input volume for a better transcript.',
};

function StatusItem({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <div className="truncate text-sm font-medium text-slate-900">{children}</div>
      </div>
    </div>
  );
}

export function RecordPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const support = useMemo(getRecorderSupport, []);
  const online = useNetworkStatus();
  const { devices, refresh: refreshDevices } = useAudioDevices();

  const tabCaptureSupported = useMemo(canCaptureTab, []);
  const [deviceId, setDeviceId] = useState('');
  const [source, setSource] = useState('mic');
  const [title, setTitle] = useState('');
  const [error, setError] = useState(null);
  const [recording, setRecording] = useState(null);
  const [finishing, setFinishing] = useState(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const recordingRef = useRef(null);
  recordingRef.current = recording;

  const live = useLiveTranscript();
  const finishRef = useRef(null);
  const recorder = useRecorder({
    onChunk: live.sendChunk,
    onInterrupted: (result) => {
      toast.warning(result.message, { duration: 8000 });
      finishRef.current?.(result);
    },
  });

  const isActive = recorder.status === 'recording' || recorder.status === 'paused';
  const isBusy = isActive || recorder.status === 'stopping' || recorder.status === 'requesting' || (finishing && finishing.step !== 'error');

  const allowNavRef = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => !allowNavRef.current && Boolean(isActive || finishing) && currentLocation.pathname !== nextLocation.pathname
  );
  useEffect(() => {
    if (!isBusy) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isBusy]);

  const start = async () => {
    setError(null);
    live.reset();
    let mimeType;
    try {
      ({ mimeType } = await recorder.start({ deviceId, mimeType: support.mimeType, captureTab: source === 'tab' }));
    } catch (err) {
      setError(err.message);
      return;
    }
    refreshDevices();
    try {
      const rec = await recordingsApi.createLive({ title: title.trim() || undefined, mimeType });
      setRecording(rec);
      live.connect(rec.id, { getActivity: () => ({ speaking: recorder.speakingRef.current, t: recorder.getElapsed() }) });
    } catch (err) {
      recorder.reset();
      setError(`Could not start the recording session: ${err.message}`);
    }
  };

  const finish = useCallback(
    async ({ blob, durationSec, totalChunks }) => {
      const rec = recordingRef.current;
      if (!rec) return;
      if (durationSec < MIN_DURATION_S) {
        live.disconnect();
        recordingsApi.remove(rec.id).catch(() => {});
        setRecording(null);
        recorder.reset();
        setError('That recording was too short to process. Record at least a few seconds of audio.');
        return;
      }
      const result = { blob, durationSec, totalChunks };
      setFinishing({ step: 'syncing', result });
      const upload = () => {
        setFinishing({ step: 'uploading', progress: 0, result });
        return recordingsApi.replaceAudio(rec.id, blob, { durationSec, onProgress: (p) => setFinishing({ step: 'uploading', progress: p, result }) });
      };
      try {
        const sync = await live.stop(totalChunks);
        if (sync.complete) {
          try {
            await recordingsApi.finalize(rec.id, { durationSec, totalChunks });
          } catch (err) {
            if (err.code !== 'AUDIO_INCOMPLETE') throw err;
            await upload();
          }
        } else {
          await upload();
        }
        queryClient.invalidateQueries({ queryKey: ['recordings'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });
        allowNavRef.current = true;
        navigate(`/recordings/${rec.id}`, { replace: true });
      } catch (err) {
        setFinishing({ step: 'error', message: err.message, result });
      }
    },
    [live, recorder, navigate, queryClient]
  );
  finishRef.current = finish;

  const stop = async () => finish(await recorder.stop());

  const discard = async () => {
    setDiscarding(true);
    recorder.reset();
    live.disconnect();
    if (recording) await recordingsApi.remove(recording.id).catch(() => {});
    setRecording(null);
    setFinishing(null);
    setDiscarding(false);
    setConfirmDiscard(false);
    live.reset();
    if (blocker.state === 'blocked') blocker.proceed();
  };

  const downloadUrl = useMemo(() => (finishing?.step === 'error' ? URL.createObjectURL(finishing.result.blob) : null), [finishing]);
  useEffect(() => () => downloadUrl && URL.revokeObjectURL(downloadUrl), [downloadUrl]);

  const lastSpeaker = live.partial?.speaker ?? live.segments[live.segments.length - 1]?.speaker;
  const conn = CONNECTION_META[live.connection] ?? CONNECTION_META.idle;
  const syncedPct = live.sync.totalBytes ? Math.min(100, Math.round((live.sync.ackedBytes / live.sync.totalBytes) * 100)) : 0;
  const aiStatus = live.sttError
    ? 'Live transcript unavailable'
    : recorder.status === 'paused'
      ? 'Paused'
      : live.connection === 'live'
        ? 'Transcribing live'
        : isActive
          ? 'Waiting for connection'
          : 'Idle';

  if (!support.ok) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Alert tone="error" title="Recording isn't supported here">
          {support.reason} You can still{' '}
          <button className="font-medium underline" onClick={() => navigate('/')}>
            upload an audio file
          </button>{' '}
          instead.
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled meeting — AI will suggest a title"
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight text-slate-900 placeholder:text-slate-300 focus:ring-0 focus:outline-none"
          aria-label="Meeting title"
          disabled={Boolean(recording)}
          maxLength={200}
        />
        {isActive && (
          <Badge tone={recorder.status === 'paused' ? 'amber' : 'red'} className="text-sm">
            <span className={clsx('h-2 w-2 rounded-full', recorder.status === 'paused' ? 'bg-amber-500' : 'animate-pulse bg-red-500')} />
            {recorder.status === 'paused' ? 'Paused' : 'Recording'}
          </Badge>
        )}
      </div>

      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}
      {isActive && recorder.audioWarning && (
        <Alert tone="warning" className="mb-4" title={recorder.audioWarning === 'silent' ? 'No audio detected' : 'Low microphone volume'}>
          {AUDIO_WARNINGS[recorder.audioWarning]}
        </Alert>
      )}
      {isActive && live.sttError && (
        <Alert tone="warning" className="mb-4" title="Live transcript paused">
          {live.sttError}
        </Alert>
      )}
      {isActive && (live.connection === 'offline' || live.connection === 'reconnecting') && (
        <Alert tone="warning" className="mb-4" title="Connection lost">
          Recording continues on this device. Your audio will sync automatically when the connection returns — don't close this tab.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <div className="text-center">
              <p className="font-mono text-5xl font-semibold tabular-nums tracking-tight text-slate-900" aria-live="off" aria-label={`Recording duration ${formatClock(recorder.elapsed)}`}>
                {formatClock(recorder.elapsed)}
              </p>
            </div>
            <div className="mt-5">
              <Waveform analyserRef={recorder.analyserRef} active={isActive} paused={recorder.status === 'paused'} />
            </div>
            <div className="mt-4 flex items-center gap-3">
              {recorder.status === 'paused' ? <MicOff className="h-4 w-4 text-slate-400" aria-hidden /> : <Mic className="h-4 w-4 text-slate-400" aria-hidden />}
              <LevelMeter analyserRef={recorder.analyserRef} active={recorder.status === 'recording'} />
            </div>

            <div className="mt-6 flex items-center justify-center gap-4">
              {!isActive ? (
                <div className="relative">
                  {recorder.status === 'idle' && !finishing && <span className="pulse-ring absolute inset-0 rounded-full bg-red-400" aria-hidden />}
                  <button
                    type="button"
                    onClick={start}
                    disabled={recorder.status !== 'idle' || Boolean(finishing)}
                    className="relative flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition hover:bg-red-600 focus-visible:outline-red-500 disabled:opacity-50"
                    aria-label="Start recording"
                  >
                    <Mic className="h-8 w-8" />
                  </button>
                </div>
              ) : (
                <>
                  <Button variant="ghost" size="icon" className="h-12 w-12 rounded-full" onClick={() => setConfirmDiscard(true)} aria-label="Discard recording">
                    <Trash2 className="h-5 w-5" />
                  </Button>
                  {recorder.status === 'paused' ? (
                    <button type="button" onClick={recorder.resume} className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-white shadow-md hover:bg-brand-700" aria-label="Resume recording">
                      <Play className="h-7 w-7 translate-x-0.5" />
                    </button>
                  ) : (
                    <button type="button" onClick={recorder.pause} className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500 text-white shadow-md hover:bg-amber-600" aria-label="Pause recording">
                      <Pause className="h-7 w-7" />
                    </button>
                  )}
                  <button type="button" onClick={stop} className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 text-white shadow-md hover:bg-slate-800" aria-label="Stop recording and process">
                    <Square className="h-6 w-6 fill-current" />
                  </button>
                </>
              )}
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">
              {recorder.status === 'requesting'
                ? source === 'tab'
                  ? 'Choose the meeting tab and turn on "Also share tab audio"…'
                  : 'Waiting for microphone permission…'
                : isActive
                  ? 'Stop when you are done — AI processing starts automatically.'
                  : finishing
                    ? ''
                    : 'Press the button to start recording.'}
            </p>

            {tabCaptureSupported && (
              <fieldset className="mt-5" disabled={isActive || recorder.status === 'requesting'}>
                <legend className="mb-1.5 block text-xs font-medium text-slate-600">Record from</legend>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                  {[
                    { value: 'mic', label: 'Microphone', icon: Mic },
                    { value: 'tab', label: 'Meeting tab', icon: Monitor },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSource(opt.value)}
                      aria-pressed={source === opt.value}
                      className={clsx(
                        'flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium transition disabled:opacity-50',
                        source === opt.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      )}
                    >
                      <opt.icon className="h-4 w-4" aria-hidden />
                      {opt.label}
                    </button>
                  ))}
                </div>
                {source === 'tab' && (
                  <p className="mt-2 text-xs text-slate-500">
                    For Google Meet, Zoom or Teams in the browser. When you press record, pick the meeting tab and turn on <strong>Also share tab audio</strong>. Your
                    microphone is recorded too, so headphones work fine.
                  </p>
                )}
              </fieldset>
            )}

            <div className="mt-5">
              <label htmlFor="mic" className="mb-1.5 block text-xs font-medium text-slate-600">
                Microphone
              </label>
              <select id="mic" className={inputClass} value={deviceId} onChange={(e) => setDeviceId(e.target.value)} disabled={isActive || recorder.status === 'requesting'}>
                <option value="">System default</option>
                {devices
                  .filter((d) => d.id && d.id !== 'default')
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
              </select>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Session status</h2>
            <div className="grid grid-cols-2 gap-2">
              <StatusItem icon={Radio} label="Live transcript">
                <Badge tone={conn.tone}>{conn.label}</Badge>
              </StatusItem>
              <StatusItem icon={online ? Wifi : WifiOff} label="Network">
                <span className={online ? 'text-emerald-700' : 'text-rose-700'}>{online ? 'Online' : 'Offline'}</span>
              </StatusItem>
              <StatusItem icon={User} label="Active speaker">
                {lastSpeaker ?? '—'}
              </StatusItem>
              <StatusItem icon={Sparkles} label="AI status">
                {aiStatus}
              </StatusItem>
              <StatusItem icon={CloudUpload} label="Audio synced">
                {live.sync.totalBytes ? `${syncedPct}% · ${formatBytes(live.sync.ackedBytes)}` : '—'}
              </StatusItem>
              <StatusItem icon={Activity} label="Segments">
                {live.segments.length}
              </StatusItem>
            </div>
          </Card>
        </div>

        <Card className="flex flex-col lg:col-span-3">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <div>
              <h2 className="font-semibold text-slate-900">Live transcript</h2>
              <p className="text-xs text-slate-500">Draft. Speakers and wording are refined automatically after you stop.</p>
            </div>
            {live.connection === 'live' && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Listening
              </span>
            )}
          </div>
          <div className="px-5">
            <TranscriptView
              segments={live.segments}
              partial={live.partial}
              autoScroll
              className="h-[50vh] lg:h-[calc(100vh-15rem)]"
              emptyText={isActive ? 'Start speaking — words will appear here as you talk.' : 'Your transcript will appear here while you record.'}
            />
          </div>
        </Card>
      </div>

      {finishing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="finishing-title">
          <Card className="w-full max-w-md p-6">
            {finishing.step === 'error' ? (
              <>
                <h2 id="finishing-title" className="text-lg font-semibold text-slate-900">
                  We couldn't submit your recording
                </h2>
                <Alert tone="error" className="mt-3">
                  {finishing.message}
                </Alert>
                <p className="mt-3 text-sm text-slate-600">Your audio is safe in this tab. Retry, or download a copy so nothing is lost.</p>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <a href={downloadUrl} download={`recording-${new Date().toISOString().slice(0, 19)}.webm`} className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
                    <Download className="h-4 w-4" /> Download audio
                  </a>
                  <Button onClick={() => finish(finishing.result)}>Retry</Button>
                </div>
              </>
            ) : (
              <div aria-live="polite">
                <h2 id="finishing-title" className="text-lg font-semibold text-slate-900">
                  Wrapping up your meeting…
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {finishing.step === 'syncing' ? 'Finalising the live transcript and saving audio.' : 'Uploading your full recording to make sure nothing is missing.'}
                </p>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={finishing.step === 'uploading' ? Math.round(finishing.progress * 100) : undefined}>
                  <div
                    className={clsx('h-full rounded-full bg-brand-600 transition-[width]', finishing.step === 'syncing' && 'w-1/3 animate-pulse')}
                    style={finishing.step === 'uploading' ? { width: `${Math.max(4, finishing.progress * 100)}%` } : undefined}
                  />
                </div>
                {finishing.step === 'uploading' && <p className="mt-2 text-right text-xs tabular-nums text-slate-500">{Math.round(finishing.progress * 100)}%</p>}
              </div>
            )}
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirmDiscard || blocker.state === 'blocked'}
        title={blocker.state === 'blocked' ? 'Leave and discard this recording?' : 'Discard this recording?'}
        description="The audio and live transcript will be permanently deleted."
        confirmLabel="Discard recording"
        loading={discarding}
        onConfirm={discard}
        onCancel={() => {
          setConfirmDiscard(false);
          if (blocker.state === 'blocked') blocker.reset();
        }}
      />
    </div>
  );
}
