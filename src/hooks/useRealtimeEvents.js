import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getFreshToken, wsUrl } from '../lib/api';

let connected = false;
export const isRealtimeConnected = () => connected;

export function useRealtimeEvents({ onNavigate } = {}) {
  const queryClient = useQueryClient();
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;

  useEffect(() => {
    let ws = null;
    let closed = false;
    let attempts = 0;
    let timer = null;
    let invalidateTimer = null;
    let everConnected = false;
    const lastStatus = new Map();

    const invalidateLists = () => {
      clearTimeout(invalidateTimer);
      invalidateTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['recordings'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });
      }, 400);
    };

    const patchLists = (rec) => {
      let found = false;
      let statusChanged = false;
      queryClient.setQueriesData({ queryKey: ['recordings'] }, (old) => {
        const i = old?.items?.findIndex((item) => item.id === rec.id) ?? -1;
        if (i === -1) return old;
        found = true;
        if (old.items[i].status !== rec.status) statusChanged = true;
        const items = old.items.slice();
        items[i] = { ...items[i], ...rec };
        return { ...old, items };
      });
      return !found || statusChanged;
    };

    const handle = (msg) => {
      if (msg.type === 'recording.updated') {
        const rec = msg.recording;
        queryClient.setQueryData(['recording', rec.id], (old) => (old ? { ...old, ...rec } : old));
        if (patchLists(rec)) invalidateLists();
        const prev = lastStatus.get(rec.id);
        lastStatus.set(rec.id, rec.status);
        if (prev && prev !== rec.status && (rec.status === 'completed' || rec.status === 'failed')) {
          queryClient.invalidateQueries({ queryKey: ['recording', rec.id] });
          queryClient.invalidateQueries({ queryKey: ['transcript', rec.id] });
          const view = { label: 'View', onClick: () => navigateRef.current?.(`/recordings/${rec.id}`) };
          if (rec.status === 'completed') toast.success(`“${rec.title}” is ready`, { action: view });
          else toast.error(`Processing failed for “${rec.title}”`, { description: rec.error?.message, action: view });
        }
      } else if (msg.type === 'recording.deleted') {
        queryClient.removeQueries({ queryKey: ['recording', msg.id] });
        invalidateLists();
      }
    };

    const connect = async () => {
      if (closed) return;
      let token;
      try {
        token = await getFreshToken();
      } catch {
        return schedule();
      }
      if (closed) return;
      ws = new WebSocket(wsUrl('/ws/events', { token }));
      ws.onopen = () => {
        attempts = 0;
        connected = true;
        if (everConnected) {
          queryClient.invalidateQueries({ queryKey: ['recording'] });
          invalidateLists();
        }
        everConnected = true;
      };
      ws.onmessage = (e) => {
        try {
          handle(JSON.parse(e.data));
        } catch {
          /* ignore malformed */
        }
      };
      ws.onclose = () => {
        ws = null;
        connected = false;
        schedule();
      };
    };

    const schedule = () => {
      if (closed) return;
      clearTimeout(timer);
      timer = setTimeout(connect, Math.min(15_000, 1000 * 2 ** attempts++));
    };

    connect();
    return () => {
      closed = true;
      connected = false;
      clearTimeout(timer);
      clearTimeout(invalidateTimer);
      ws?.close();
    };
  }, [queryClient]);
}
