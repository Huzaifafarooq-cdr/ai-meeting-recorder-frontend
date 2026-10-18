import { useCallback, useEffect, useRef, useState } from 'react';

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
export const CHUNK_MS = 250;

const SPEAKING_RMS = 0.015;
const SILENT_RMS = 0.004;
const SILENT_WARN_S = 6;
const LOW_WARN_S = 10;

export function getRecorderSupport() {
  if (typeof window === 'undefined') return { ok: false, reason: 'Not running in a browser.' };
  if (!window.isSecureContext) return { ok: false, reason: 'Recording requires a secure connection (HTTPS or localhost).' };
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: 'Your browser does not support microphone access. Please use a recent version of Chrome, Edge, Firefox or Safari.' };
  }
  if (typeof window.MediaRecorder === 'undefined') {
    return { ok: false, reason: 'Your browser does not support audio recording. Please use a recent version of Chrome, Edge, Firefox or Safari.' };
  }
  return { ok: true, mimeType: MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '' };
}

export function micErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return "Microphone access was blocked. Click the microphone icon in your browser's address bar, allow access, then try again.";
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found. Connect a microphone (or pick another one) and try again.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Your microphone is being used by another application or could not be started. Close other apps using it and try again.';
    default:
      return `Could not start the microphone: ${err?.message ?? 'unknown error'}`;
  }
}

export function canCaptureTab() {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia) && !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
}

function tabErrorMessage(err) {
  if (err?.name === 'NotAllowedError') {
    return 'Tab sharing was cancelled. To record a meeting, pick the meeting tab (e.g. Google Meet) and turn on "Also share tab audio".';
  }
  return `Could not capture the meeting tab: ${err?.message ?? 'unknown error'}`;
}

async function captureTabAudio() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      preferCurrentTab: false,
      selfBrowserSurface: 'exclude',
      systemAudio: 'include',
    });
  } catch (err) {
    throw new Error(tabErrorMessage(err));
  }
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('The shared tab has no audio. Share the meeting tab again and turn on "Also share tab audio" in the sharing dialog.');
  }
  return stream;
}

export function useRecorder({ onChunk, onInterrupted } = {}) {
  const [status, setStatus] = useState('idle');
  const [elapsed, setElapsed] = useState(0);
  const [audioWarning, setAudioWarning] = useState(null);
  const analyserRef = useRef(null);
  const speakingRef = useRef(false);
  const callbacks = useRef({ onChunk, onInterrupted });
  callbacks.current = { onChunk, onInterrupted };

  const r = useRef({
    stream: null,
    tabStream: null,
    recorder: null,
    ctx: null,
    chunks: [],
    startedAt: null,
    accumulated: 0,
    timers: [],
    stopResolve: null,
    silentFor: 0,
    quietFor: 0,
  }).current;

  const getElapsed = useCallback(() => r.accumulated + (r.startedAt ? (performance.now() - r.startedAt) / 1000 : 0), [r]);

  const teardown = useCallback(() => {
    r.timers.forEach(clearInterval);
    r.timers = [];
    r.stream?.getTracks().forEach((t) => t.stop());
    r.tabStream?.getTracks().forEach((t) => t.stop());
    r.ctx?.close().catch(() => {});
    r.stream = null;
    r.tabStream = null;
    r.ctx = null;
    analyserRef.current = null;
    speakingRef.current = false;
  }, [r]);

  const monitorLevel = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser || r.recorder?.state !== 'recording') return;
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    const step = 0.2;
    speakingRef.current = rms > SPEAKING_RMS;
    if (rms > SPEAKING_RMS) {
      r.silentFor = 0;
      r.quietFor = 0;
      setAudioWarning(null);
    } else if (rms < SILENT_RMS) {
      r.silentFor += step;
      if (r.silentFor > SILENT_WARN_S) setAudioWarning('silent');
    } else {
      r.quietFor += step;
      r.silentFor = 0;
      if (r.quietFor > LOW_WARN_S) setAudioWarning('low');
    }
  }, [r]);

  const finishRecorder = useCallback(
    () =>
      new Promise((resolve) => {
        const recorder = r.recorder;
        r.accumulated = getElapsed();
        r.startedAt = null;
        if (!recorder || recorder.state === 'inactive') {
          resolve(new Blob(r.chunks, { type: recorder?.mimeType || 'audio/webm' }));
          return;
        }
        r.stopResolve = resolve;
        recorder.stop();
      }),
    [r, getElapsed]
  );

  const handleInterruption = useCallback(
    async (message) => {
      if (!r.recorder || r.recorder.state === 'inactive') return;
      setStatus('stopping');
      const blob = await finishRecorder();
      teardown();
      setStatus('stopped');
      callbacks.current.onInterrupted?.({ blob, durationSec: r.accumulated, totalChunks: r.chunks.length, message });
    },
    [r, finishRecorder, teardown]
  );

  const start = useCallback(
    async ({ deviceId, mimeType, captureTab = false }) => {
      setStatus('requesting');
      let tabStream = null;
      if (captureTab) {
        // ask for the tab first, while the click still counts as a user gesture
        try {
          tabStream = await captureTabAudio();
        } catch (err) {
          setStatus('idle');
          throw err;
        }
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (err) {
        tabStream?.getTracks().forEach((t) => t.stop());
        setStatus('idle');
        throw new Error(micErrorMessage(err));
      }

      const ctx = new AudioContext();
      ctx.resume().catch(() => {});
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.7;

      let recordStream = stream;
      if (tabStream) {
        // mix the meeting tab and the mic into one track
        const mix = ctx.createMediaStreamDestination();
        for (const s of [stream, tabStream]) {
          const src = ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks()));
          src.connect(mix);
          src.connect(analyser);
        }
        recordStream = mix.stream;
      } else {
        ctx.createMediaStreamSource(stream).connect(analyser);
      }

      let recorder;
      try {
        recorder = new MediaRecorder(recordStream, mimeType ? { mimeType, audioBitsPerSecond: 64000 } : undefined);
      } catch {
        recorder = new MediaRecorder(recordStream);
      }
      Object.assign(r, { stream, tabStream, ctx, recorder, chunks: [], accumulated: 0, silentFor: 0, quietFor: 0 });
      analyserRef.current = analyser;

      recorder.ondataavailable = (e) => {
        if (!e.data?.size) return;
        r.chunks.push(e.data);
        callbacks.current.onChunk?.(e.data, r.chunks.length - 1);
      };
      recorder.onstop = () => {
        r.stopResolve?.(new Blob(r.chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }));
        r.stopResolve = null;
      };
      recorder.onerror = (e) => handleInterruption(`Recording stopped unexpectedly (${e.error?.name ?? 'recorder error'}). The audio captured so far has been kept.`);
      stream.getAudioTracks()[0].onended = () => handleInterruption('Your microphone was disconnected. The audio captured so far has been kept.');
      tabStream?.getTracks().forEach((t) => {
        t.onended = () => handleInterruption('Sharing of the meeting tab stopped. The audio captured so far has been kept.');
      });

      recorder.start(CHUNK_MS);
      r.startedAt = performance.now();
      r.timers.push(setInterval(() => setElapsed(getElapsed()), 250), setInterval(monitorLevel, 200));
      setElapsed(0);
      setAudioWarning(null);
      setStatus('recording');
      return { mimeType: recorder.mimeType || mimeType || 'audio/webm' };
    },
    [r, getElapsed, monitorLevel, handleInterruption]
  );

  const pause = useCallback(() => {
    if (r.recorder?.state !== 'recording') return;
    r.recorder.pause();
    r.accumulated = getElapsed();
    r.startedAt = null;
    speakingRef.current = false;
    setAudioWarning(null);
    setStatus('paused');
  }, [r, getElapsed]);

  const resume = useCallback(() => {
    if (r.recorder?.state !== 'paused') return;
    r.recorder.resume();
    r.startedAt = performance.now();
    r.silentFor = 0;
    r.quietFor = 0;
    setStatus('recording');
  }, [r]);

  const stop = useCallback(async () => {
    setStatus('stopping');
    const blob = await finishRecorder();
    teardown();
    setElapsed(r.accumulated);
    setStatus('stopped');
    return { blob, durationSec: r.accumulated, totalChunks: r.chunks.length };
  }, [r, finishRecorder, teardown]);

  const reset = useCallback(() => {
    teardown();
    Object.assign(r, { recorder: null, chunks: [], accumulated: 0, startedAt: null });
    setElapsed(0);
    setAudioWarning(null);
    setStatus('idle');
  }, [r, teardown]);

  useEffect(
    () => () => {
      if (r.recorder && r.recorder.state !== 'inactive') r.recorder.stop();
      teardown();
    },
    [r, teardown]
  );

  return { status, elapsed, audioWarning, analyserRef, speakingRef, getElapsed, start, pause, resume, stop, reset };
}
