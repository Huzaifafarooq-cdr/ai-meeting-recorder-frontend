export const STAGES = [
  { key: 'upload', label: 'Audio upload', description: 'Verifying the recorded audio' },
  { key: 'transcription', label: 'Speech-to-text', description: 'Converting speech into text' },
  { key: 'diarization', label: 'Speaker separation', description: 'Identifying who said what' },
  { key: 'transcript', label: 'Transcript generation', description: 'Cleaning filler words and punctuation' },
  { key: 'summary', label: 'AI summary', description: 'Summarising the discussion' },
  { key: 'action_items', label: 'Action items', description: 'Extracting tasks and decisions' },
  { key: 'insights', label: 'Insights', description: 'Keywords and meeting title' },
];

export const stageLabel = (key) => STAGES.find((s) => s.key === key)?.label ?? key;

export const STATUS_META = {
  recording: { label: 'Recording', tone: 'red' },
  queued: { label: 'Queued', tone: 'amber' },
  processing: { label: 'Processing', tone: 'blue' },
  completed: { label: 'Completed', tone: 'green' },
  failed: { label: 'Failed', tone: 'rose' },
};

const SPEAKER_COLORS = [
  'bg-indigo-100 text-indigo-700 ring-indigo-200',
  'bg-emerald-100 text-emerald-700 ring-emerald-200',
  'bg-amber-100 text-amber-800 ring-amber-200',
  'bg-sky-100 text-sky-700 ring-sky-200',
  'bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-200',
  'bg-rose-100 text-rose-700 ring-rose-200',
  'bg-teal-100 text-teal-700 ring-teal-200',
];

export function speakerColor(label = '') {
  const m = label.match(/Speaker ([A-Z])$/);
  const idx = m ? m[1].charCodeAt(0) - 65 : [...label].reduce((a, c) => a + c.charCodeAt(0), 0);
  return SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
}

export const ACCEPTED_AUDIO = 'audio/*,.mp3,.wav,.m4a,.mp4,.webm,.ogg,.oga,.opus,.flac,.aac';
