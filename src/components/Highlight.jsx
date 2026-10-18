import { memo } from 'react';

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const Highlight = memo(function Highlight({ text = '', query }) {
  const terms = (query ?? '')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (!terms.length || !text) return text;
  const re = new RegExp(`(${terms.map(escape).join('|')})`, 'gi');
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-yellow-200/80 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      part
    )
  );
});
