import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { toast } from 'sonner';
import { FileAudio, UploadCloud, X } from 'lucide-react';
import { api } from '../lib/api';
import { ACCEPTED_AUDIO } from '../lib/constants';
import { formatBytes, formatDuration } from '../lib/format';
import { readAudioDuration, recordingsApi } from '../lib/recordings';
import { Alert, Button, Field, inputClass } from './ui';
import { UploadContext } from './uploadContext';

export function UploadProvider({ children }) {
  const [open, setOpen] = useState(false);
  const openDialog = useCallback(() => setOpen(true), []);
  return (
    <UploadContext.Provider value={openDialog}>
      {children}
      <UploadDialog open={open} onClose={() => setOpen(false)} />
    </UploadContext.Provider>
  );
}

function UploadDialog({ open, onClose }) {
  const ref = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [file, setFile] = useState(null);
  const [duration, setDuration] = useState(0);
  const [title, setTitle] = useState('');
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [dragging, setDragging] = useState(false);

  const { data: health } = useQuery({ queryKey: ['health'], queryFn: () => api('/api/health', { auth: false }), staleTime: Infinity });
  const maxMb = health?.maxUploadMb ?? 200;
  const uploading = progress !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const reset = () => {
    setFile(null);
    setDuration(0);
    setTitle('');
    setError(null);
    setProgress(null);
  };

  const close = () => {
    if (uploading) abortRef.current?.abort();
    reset();
    onClose();
  };

  const pick = async (f) => {
    setError(null);
    if (!f) return;
    const looksAudio = f.type.startsWith('audio/') || /\.(mp3|wav|m4a|mp4|webm|ogg|oga|opus|flac|aac)$/i.test(f.name);
    if (!looksAudio) return setError('That file is not an audio file. Supported formats: MP3, WAV, M4A, WebM, OGG, FLAC, AAC.');
    if (f.size > maxMb * 1024 * 1024) return setError(`This file is ${formatBytes(f.size)}, which exceeds the ${maxMb} MB limit. Try compressing it or splitting the recording.`);
    if (f.size < 1024) return setError('This file appears to be empty.');
    setFile(f);
    setDuration(await readAudioDuration(f));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setProgress(0);
    abortRef.current = new AbortController();
    try {
      const rec = await recordingsApi.upload(file, { title: title.trim(), durationSec: duration, onProgress: setProgress, signal: abortRef.current.signal });
      queryClient.invalidateQueries({ queryKey: ['recordings'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      toast.success('Upload complete — AI processing has started');
      reset();
      onClose();
      navigate(`/recordings/${rec.id}`);
    } catch (err) {
      setProgress(null);
      if (err.name !== 'AbortError') setError(err.message);
    }
  };

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className="m-auto w-[min(94vw,520px)] rounded-xl p-0 shadow-xl"
      aria-labelledby="upload-title"
    >
      <form onSubmit={submit} className="p-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 id="upload-title" className="text-lg font-semibold text-slate-900">
              Upload audio
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">We'll transcribe it and generate a summary, action items and insights.</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={close} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {!file ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={clsx(
              'flex w-full flex-col items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
              dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'
            )}
          >
            <UploadCloud className="h-10 w-10 text-brand-500" aria-hidden />
            <span className="mt-3 text-sm font-medium text-slate-800">Drop an audio file here, or click to browse</span>
            <span className="mt-1 text-xs text-slate-500">MP3, WAV, M4A, WebM, OGG, FLAC, AAC · up to {maxMb} MB</span>
          </button>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
            <div className="rounded-lg bg-brand-50 p-2">
              <FileAudio className="h-6 w-6 text-brand-600" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
              <p className="text-xs text-slate-500">
                {formatBytes(file.size)}
                {duration > 0 && ` · ${formatDuration(duration)}`}
              </p>
            </div>
            {!uploading && (
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                Change
              </Button>
            )}
          </div>
        )}
        <input ref={inputRef} type="file" accept={ACCEPTED_AUDIO} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

        <div className="mt-4">
          <Field label="Title (optional)" id="upload-title-input" hint="Leave empty and AI will suggest a title.">
            <input id="upload-title-input" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={uploading} />
          </Field>
        </div>

        {error && (
          <Alert tone="error" className="mt-4">
            {error}
          </Alert>
        )}

        {uploading && (
          <div className="mt-4" aria-live="polite">
            <div className="mb-1 flex justify-between text-xs text-slate-600">
              <span>{progress < 1 ? 'Uploading…' : 'Finalising…'}</span>
              <span className="tabular-nums">{Math.round(progress * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-brand-600 transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close}>
            {uploading ? 'Cancel upload' : 'Cancel'}
          </Button>
          <Button type="submit" disabled={!file} loading={uploading}>
            Upload & process
          </Button>
        </div>
      </form>
    </dialog>
  );
}
