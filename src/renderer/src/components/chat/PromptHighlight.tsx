import { forwardRef } from 'react';
import type { ChatMention } from '@shared/types';

/**
 * Splits the composer draft into plain and colored runs so `@ file`, `#folder`
 * and a leading `/command` render in their scoop (blueberry / grape / mint,
 * matching brand-guidelines' scoop-per-meaning). Pure + exported so it can be
 * unit-tested; the visual overlay below just paints these segments.
 */
export type HighlightKind = 'command' | 'file' | 'folder';
export interface Segment {
  text: string;
  kind: HighlightKind | null;
}

interface Range {
  start: number;
  end: number;
  kind: HighlightKind;
}

export function highlightSegments(text: string, mentions: ChatMention[]): Segment[] {
  const ranges: Range[] = [];

  // A leading /command colours the whole run.
  const cmd = /^\/(\S+)/.exec(text);
  if (cmd) ranges.push({ start: 0, end: cmd[0].length, kind: 'command' });

  // Confirmed mentions match their literal token (file names may contain spaces).
  for (const m of mentions) {
    const token = (m.kind === 'file' ? '@' : '#') + m.name;
    let from = 0;
    for (let ix = text.indexOf(token, from); ix !== -1; ix = text.indexOf(token, from)) {
      ranges.push({ start: ix, end: ix + token.length, kind: m.kind === 'file' ? 'file' : 'folder' });
      from = ix + token.length;
    }
  }

  // In-progress triggers (a bare @/# being typed) colour the trigger + run.
  const re = /(^|\s)([@#])(\S*)/g;
  for (let match = re.exec(text); match; match = re.exec(text)) {
    const start = match.index + match[1].length;
    const end = start + 1 + match[3].length;
    ranges.push({ start, end, kind: match[2] === '@' ? 'file' : 'folder' });
  }

  // Sort, then keep only non-overlapping ranges (earlier wins).
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const segments: Segment[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start < cursor) continue; // overlaps an already-emitted range
    if (r.start > cursor) segments.push({ text: text.slice(cursor, r.start), kind: null });
    segments.push({ text: text.slice(r.start, r.end), kind: r.kind });
    cursor = r.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), kind: null });
  return segments;
}

const KIND_CLASS: Record<HighlightKind, string> = {
  command: 'text-mint font-medium',
  file: 'text-blueberry font-medium',
  folder: 'text-grape font-medium',
};

/**
 * The colored mirror painted behind a transparent-text textarea. It must share
 * the textarea's exact box metrics (font, padding, wrapping) so the glyphs line
 * up; the Composer syncs its scrollTop. A trailing newline gets a zero-width
 * space so the mirror's height tracks the textarea's.
 */
export const PromptHighlight = forwardRef<
  HTMLDivElement,
  { text: string; mentions: ChatMention[]; className?: string }
>(function PromptHighlight({ text, mentions, className }, ref) {
  const segments = highlightSegments(text, mentions);
  return (
    <div
      ref={ref}
      aria-hidden
      className={className}
    >
      {segments.map((s, i) => (
        <span key={i} className={s.kind ? KIND_CLASS[s.kind] : undefined}>
          {s.text}
        </span>
      ))}
      {/* keep height in sync when the draft ends on a newline */}
      {text.endsWith('\n') && '​'}
    </div>
  );
});
