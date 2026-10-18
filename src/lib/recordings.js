import { api, uploadWithProgress } from './api';

export const recordingsApi = {
  list: (query, signal) => api('/api/recordings', { query, signal }),
  stats: () => api('/api/recordings/stats'),
  get: (id) => api(`/api/recordings/${id}`).then((r) => r.recording),
  transcript: (id, kind = 'final') => api(`/api/recordings/${id}/transcript`, { query: { kind } }),
  createLive: (body) => api('/api/recordings', { method: 'POST', body }).then((r) => r.recording),
  finalize: (id, body) => api(`/api/recordings/${id}/finalize`, { method: 'POST', body }).then((r) => r.recording),
  update: (id, body) => api(`/api/recordings/${id}`, { method: 'PATCH', body }).then((r) => r.recording),
  renameSpeakers: (id, speakers) => api(`/api/recordings/${id}/speakers`, { method: 'PATCH', body: { speakers } }).then((r) => r.recording),
  setActionItemDone: (id, index, done) => api(`/api/recordings/${id}/action-items/${index}`, { method: 'PATCH', body: { done } }).then((r) => r.recording),
  retry: (id) => api(`/api/recordings/${id}/retry`, { method: 'POST' }).then((r) => r.recording),
  remove: (id) => api(`/api/recordings/${id}`, { method: 'DELETE' }),
  mediaUrl: (id) => api(`/api/recordings/${id}/media-url`),

  upload(file, { title, durationSec, onProgress, signal }) {
    const form = new FormData();
    if (title) form.append('title', title);
    if (durationSec) form.append('durationSec', String(Math.round(durationSec)));
    form.append('audio', file);
    return uploadWithProgress('/api/recordings/upload', form, { onProgress, signal }).then((r) => r.recording);
  },

  replaceAudio(id, blob, { durationSec, onProgress, signal }) {
    const form = new FormData();
    if (durationSec) form.append('durationSec', String(Math.round(durationSec)));
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    form.append('audio', blob, `recording.${ext}`);
    return uploadWithProgress(`/api/recordings/${id}/audio`, form, { method: 'PUT', onProgress, signal }).then((r) => r.recording);
  },
};

export function readAudioDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (v) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v) ? v : 0);
    };
    const timer = setTimeout(() => done(0), 5000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      done(audio.duration);
    };
    audio.onerror = () => {
      clearTimeout(timer);
      done(0);
    };
    audio.src = url;
  });
}
