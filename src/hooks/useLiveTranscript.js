import { useCallback, useEffect, useRef, useState } from 'react';
import { getFreshToken, wsUrl } from '../lib/api';

const MAX_BACKOFF_MS = 10_000;
const STOP_TIMEOUT_MS = 8000;
const FATAL_CLOSE_CODES = new Set([4404, 4409, 4410]);

function frame(seq, payload, replay = false) {
  const out = new Uint8Array(5 + payload.byteLength);
  out[0] = replay ? 1 : 0;
  new DataView(out.buffer).setUint32(1, seq);
  out.set(new Uint8Array(payload), 5);
  return out;
}

export function useLiveTranscript() {
  const [connection, setConnection] = useState('idle');
  const [segments, setSegments] = useState([]);
  const [partial, setPartial] = useState(null);
  const [sttError, setSttError] = useState(null);
  const [sync, setSync] = useState({ sentChunks: 0, ackedBytes: 0, totalBytes: 0 });

  const r = useRef({
    ws: null,
    recordingId: null,
    chunks: [],
    sentUpTo: -1,
    ready: false,
    everConnected: false,
    closedByUs: false,
    attempts: 0,
    reconnectTimer: null,
    activityTimer: null,
    sendChain: Promise.resolve(),
    stopWaiter: null,
    getActivity: () => ({ speaking: false, t: 0 }),
    pendingFinals: [],
    flushRaf: null,
    totalBytes: 0,
  }).current;

  const queueFinal = useCallback(
    (seg) => {
      r.pendingFinals.push(seg);
      if (r.flushRaf) return;
      r.flushRaf = requestAnimationFrame(() => {
        r.flushRaf = null;
        const batch = r.pendingFinals.splice(0);
        setSegments((prev) => prev.concat(batch));
      });
    },
    [r]
  );

  const sendPending = useCallback(() => {
    r.sendChain = r.sendChain.then(async () => {
      while (r.ready && r.ws?.readyState === WebSocket.OPEN && r.sentUpTo < r.chunks.length - 1) {
        const seq = r.sentUpTo + 1;
        const buf = await r.chunks[seq].arrayBuffer();
        if (!r.ready || r.ws?.readyState !== WebSocket.OPEN) return;
        r.ws.send(frame(seq, buf));
        r.sentUpTo = seq;
      }
      setSync((s) => ({ ...s, sentChunks: r.sentUpTo + 1, totalBytes: r.totalBytes }));
    });
    return r.sendChain;
  }, [r]);

  const scheduleReconnect = useCallback(() => {
    clearTimeout(r.reconnectTimer);
    const delay = Math.min(MAX_BACKOFF_MS, 800 * 2 ** r.attempts);
    r.attempts += 1;
    r.reconnectTimer = setTimeout(() => r.open?.(), delay);
  }, [r]);

  const open = useCallback(async () => {
    if (r.closedByUs || !r.recordingId) return;
    setConnection(r.everConnected ? 'reconnecting' : 'connecting');
    let token;
    try {
      token = await getFreshToken();
    } catch {
      setConnection(navigator.onLine ? 'reconnecting' : 'offline');
      return scheduleReconnect();
    }
    const ws = new WebSocket(wsUrl('/ws/live', { recordingId: r.recordingId, token, t: r.getActivity().t.toFixed(2) }));
    ws.binaryType = 'arraybuffer';
    r.ws = ws;
    r.ready = false;

    ws.onmessage = async (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case 'ready': {
          const isReconnect = r.everConnected;
          r.everConnected = true;
          r.attempts = 0;
          r.sentUpTo = Math.min(r.chunks.length, msg.resumeFromSeq) - 1;
          if (isReconnect && r.chunks[0]) {
            ws.send(frame(0, await r.chunks[0].arrayBuffer(), true));
          }
          r.ready = true;
          setConnection('live');
          sendPending();
          break;
        }
        case 'transcript':
          if (msg.segment.isFinal) {
            setPartial(null);
            queueFinal(msg.segment);
          } else {
            setPartial(msg.segment);
          }
          break;
        case 'live_reset': {
          // the server re-checked speakers on the audio so far and sent the corrected lines;
          // keep any newer lines that arrived while it was working
          const pending = r.pendingFinals.splice(0);
          if (r.flushRaf) cancelAnimationFrame(r.flushRaf);
          r.flushRaf = null;
          const ids = new Set(msg.segments.map((s) => s.id));
          setSegments((prev) =>
            msg.segments.concat(prev.concat(pending).filter((s) => !ids.has(s.id))).sort((a, b) => a.start - b.start)
          );
          break;
        }
        case 'ack':
          setSync((s) => ({ ...s, ackedBytes: msg.bytes }));
          break;
        case 'stt_error':
          setSttError(msg.message);
          break;
        case 'stopped':
          r.stopWaiter?.(msg);
          break;
        default:
      }
    };

    ws.onclose = (event) => {
      r.ready = false;
      if (r.ws === ws) r.ws = null;
      if (r.closedByUs) return;
      if (FATAL_CLOSE_CODES.has(event.code)) {
        setConnection('closed');
        return;
      }
      setConnection(navigator.onLine ? 'reconnecting' : 'offline');
      scheduleReconnect();
    };
  }, [r, scheduleReconnect, sendPending, queueFinal]);
  r.open = open;

  const reset = useCallback(() => {
    Object.assign(r, { recordingId: null, chunks: [], sentUpTo: -1, totalBytes: 0, everConnected: false, attempts: 0 });
    setSegments([]);
    setPartial(null);
    setSttError(null);
    setSync({ sentChunks: 0, ackedBytes: 0, totalBytes: 0 });
    setConnection('idle');
  }, [r]);

  const connect = useCallback(
    (recordingId, { getActivity }) => {
      Object.assign(r, { recordingId, getActivity, closedByUs: false, everConnected: false, attempts: 0 });
      clearInterval(r.activityTimer);
      r.activityTimer = setInterval(() => {
        if (r.ready && r.ws?.readyState === WebSocket.OPEN) r.ws.send(JSON.stringify({ type: 'activity', ...r.getActivity() }));
      }, 300);
      open();
    },
    [r, open]
  );

  const sendChunk = useCallback(
    (blob, seq) => {
      r.chunks[seq] = blob;
      r.totalBytes += blob.size;
      sendPending();
    },
    [r, sendPending]
  );

  const stop = useCallback(
    async (totalChunks) => {
      clearInterval(r.activityTimer);
      clearTimeout(r.reconnectTimer);
      await sendPending();
      const ws = r.ws;
      if (!r.ready || ws?.readyState !== WebSocket.OPEN) {
        r.closedByUs = true;
        ws?.close();
        setConnection('closed');
        return { complete: false };
      }
      const result = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ complete: false }), STOP_TIMEOUT_MS);
        r.stopWaiter = (msg) => {
          clearTimeout(timer);
          resolve(msg);
        };
        ws.send(JSON.stringify({ type: 'stop', totalChunks }));
      });
      r.closedByUs = true;
      r.stopWaiter = null;
      ws.close();
      setConnection('closed');
      setPartial(null);
      return result;
    },
    [r, sendPending]
  );

  const disconnect = useCallback(() => {
    r.closedByUs = true;
    clearInterval(r.activityTimer);
    clearTimeout(r.reconnectTimer);
    r.ws?.close();
    setConnection('idle');
  }, [r]);

  useEffect(() => {
    const onOnline = () => {
      if (!r.closedByUs && r.recordingId && !r.ws) {
        clearTimeout(r.reconnectTimer);
        r.attempts = 0;
        open();
      }
    };
    const onOffline = () => !r.closedByUs && r.recordingId && setConnection('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [r, open]);

  useEffect(() => disconnect, [disconnect]);

  return { connection, segments, partial, sttError, sync, reset, connect, sendChunk, stop, disconnect };
}
