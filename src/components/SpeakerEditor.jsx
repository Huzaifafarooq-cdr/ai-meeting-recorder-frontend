import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Users } from 'lucide-react';
import { speakerColor } from '../lib/constants';
import { recordingsApi } from '../lib/recordings';
import { LIMITS } from '../lib/validation';
import { Button, inputClass } from './ui';

export function SpeakerEditor({ recording, onDone }) {
  const queryClient = useQueryClient();
  const [names, setNames] = useState(() => Object.fromEntries(recording.speakers.map((s) => [s.label, s.name ?? ''])));

  const changes = recording.speakers
    .map((s) => ({ label: s.label, name: (names[s.label] ?? '').trim() }))
    .filter((s, i) => s.name !== (recording.speakers[i].name ?? '').trim());

  const mutation = useMutation({
    mutationFn: () => recordingsApi.renameSpeakers(recording.id, changes),
    onSuccess: (rec) => {
      queryClient.setQueryData(['recording', rec.id], rec);
      toast.success('Speaker names saved');
      onDone?.();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (mutation.isPending) return;
        if (!changes.length) return onDone?.();
        mutation.mutate();
      }}
      className="rounded-lg border border-slate-200 bg-slate-50/60 p-4"
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Users className="h-4 w-4 text-slate-500" aria-hidden /> Rename speakers
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {recording.speakers.map((s) => (
          <label key={s.label} className="flex items-center gap-2">
            <span className={clsx('w-24 shrink-0 rounded-md px-2 py-1 text-center text-xs font-semibold ring-1 ring-inset', speakerColor(s.label))}>{s.label}</span>
            <input
              className={inputClass}
              placeholder="e.g. John"
              maxLength={LIMITS.speakerName}
              value={names[s.label] ?? ''}
              onChange={(e) => setNames((n) => ({ ...n, [s.label]: e.target.value }))}
              aria-label={`Name for ${s.label}`}
            />
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={mutation.isPending}>
          Save names
        </Button>
      </div>
    </form>
  );
}
