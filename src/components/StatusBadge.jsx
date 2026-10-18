import { Loader2 } from 'lucide-react';
import { STATUS_META, stageLabel } from '../lib/constants';
import { Badge } from './ui';

export function StatusBadge({ recording, showStage = true }) {
  const meta = STATUS_META[recording.status] ?? { label: recording.status, tone: 'slate' };
  const busy = recording.status === 'processing' || recording.status === 'queued';
  return (
    <Badge tone={meta.tone}>
      {busy && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
      {recording.status === 'recording' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" aria-hidden />}
      {meta.label}
      {showStage && recording.status === 'processing' && recording.stage && <span className="font-normal opacity-80">· {stageLabel(recording.stage)}</span>}
    </Badge>
  );
}
