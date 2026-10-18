import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowDown } from 'lucide-react';
import { speakerColor } from '../lib/constants';
import { timestamp } from '../lib/format';
import { Highlight } from './Highlight';

function groupBySpeaker(segments) {
  const blocks = [];
  for (const seg of segments) {
    const last = blocks[blocks.length - 1];
    if (last && last.speaker === seg.speaker) last.items.push(seg);
    else blocks.push({ key: seg.id ?? `${seg.speaker}-${seg.start}`, speaker: seg.speaker, start: seg.start, items: [seg] });
  }
  return blocks;
}

const Block = memo(function Block({ block, name, onSeek, activeTime, highlight }) {
  return (
    <div className="cv-auto flex gap-3 py-3">
      <div className="w-24 shrink-0 pt-0.5 sm:w-32">
        <span className={clsx('inline-block max-w-full truncate rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', speakerColor(block.speaker))} title={name}>
          {name}
        </span>
        {onSeek ? (
          <button type="button" onClick={() => onSeek(block.start)} className="mt-1 block text-xs tabular-nums text-slate-400 hover:text-brand-600" aria-label={`Play from ${timestamp(block.start)}`}>
            {timestamp(block.start)}
          </button>
        ) : (
          <span className="mt-1 block text-xs tabular-nums text-slate-400">{timestamp(block.start)}</span>
        )}
      </div>
      <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-slate-800">
        {block.items.map((seg, i) => {
          const isActive = activeTime != null && activeTime >= seg.start && activeTime < seg.end;
          return (
            <span key={seg.id ?? i} className={clsx(isActive && 'rounded bg-brand-100/80')}>
              {i > 0 && ' '}
              <Highlight text={seg.text} query={highlight} />
            </span>
          );
        })}
      </p>
    </div>
  );
});

export function TranscriptView({ segments, partial, speakerName = (l) => l, autoScroll = false, onSeek, activeTime, highlight, className, emptyText }) {
  const containerRef = useRef(null);
  const [atBottom, setAtBottom] = useState(true);
  const blocks = useMemo(() => groupBySpeaker(segments), [segments]);

  useLayoutEffect(() => {
    if (!autoScroll || !atBottom) return;
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [autoScroll, atBottom, blocks, partial]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !autoScroll) return;
    const onScroll = () => setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [autoScroll]);

  const empty = !blocks.length && !partial?.text;

  return (
    <div className="relative min-h-0">
      <div ref={containerRef} className={clsx('overflow-y-auto overscroll-contain', className)} aria-live={autoScroll ? 'polite' : undefined} aria-relevant="additions">
        {empty && <p className="py-10 text-center text-sm text-slate-400">{emptyText ?? 'No transcript yet.'}</p>}
        <div className="divide-y divide-slate-100">
          {blocks.map((block) => (
            <Block
              key={block.key}
              block={block}
              name={speakerName(block.speaker)}
              onSeek={onSeek}
              activeTime={activeTime != null && activeTime >= block.start && activeTime < block.items[block.items.length - 1].end ? activeTime : null}
              highlight={highlight}
            />
          ))}
        </div>
        {partial?.text && (
          <div className="flex gap-3 py-3" aria-hidden>
            <div className="w-24 shrink-0 sm:w-32">
              <span className={clsx('inline-block rounded-md px-2 py-0.5 text-xs font-semibold opacity-70 ring-1 ring-inset', speakerColor(partial.speaker))}>
                {speakerName(partial.speaker)}
              </span>
            </div>
            <p className="caret min-w-0 flex-1 text-[15px] italic leading-relaxed text-slate-500">{partial.text}</p>
          </div>
        )}
      </div>
      {autoScroll && !atBottom && (
        <button
          type="button"
          onClick={() => {
            const el = containerRef.current;
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
          }}
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-slate-900/85 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-slate-900"
        >
          <ArrowDown className="h-3.5 w-3.5" /> Jump to latest
        </button>
      )}
    </div>
  );
}
