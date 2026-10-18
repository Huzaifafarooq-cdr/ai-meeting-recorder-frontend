import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download } from 'lucide-react';
import { absoluteApiUrl } from '../lib/api';
import { recordingsApi } from '../lib/recordings';
import { Button, Skeleton } from './ui';

export function AudioPlayer({ recordingId, ref, onTimeUpdate }) {
  const audioRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ['media', recordingId],
    queryFn: () => recordingsApi.mediaUrl(recordingId),
    staleTime: 20 * 60 * 1000,
    retry: 1,
  });

  useImperativeHandle(ref, () => ({
    seek(sec) {
      const el = audioRef.current;
      if (!el) return;
      el.currentTime = sec;
      el.play().catch(() => {});
    },
  }));

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const fix = () => {
      if (el.duration === Infinity) {
        el.currentTime = 1e101;
        el.addEventListener('timeupdate', () => (el.currentTime = 0), { once: true });
      }
    };
    el.addEventListener('loadedmetadata', fix);
    return () => el.removeEventListener('loadedmetadata', fix);
  }, [data?.url]);

  if (isLoading) return <Skeleton className="h-12 w-full rounded-full" />;
  if (error || failed) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
        <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
        <span className="flex-1">{error?.message ?? 'The audio could not be loaded.'}</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setFailed(false);
            refetch();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }
  const src = absoluteApiUrl(data.url);
  return (
    <div className="flex items-center gap-2">
      <audio
        ref={audioRef}
        className="min-w-0 flex-1"
        controls
        preload="metadata"
        src={src}
        onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
        onError={() => setFailed(true)}
      >
        Your browser does not support audio playback.
      </audio>
      <a
        href={`${src}&download=1`}
        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
        aria-label="Download audio"
        title="Download audio"
      >
        <Download className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Download</span>
      </a>
    </div>
  );
}
