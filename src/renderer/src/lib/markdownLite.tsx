import type { ReactNode } from 'react';

/**
 * A tiny, dependency-free markdown renderer for the Assistant's answers.
 * Local chat models reliably emit simple structure — paragraphs, bullet and
 * numbered lists, short headings, **bold** and `inline code` — and rendering
 * that structure makes answers far more readable than raw text. Anything
 * fancier (tables, links, nesting) intentionally falls through as plain text.
 *
 * Parsing is split into pure functions (`parseBlocks` / `parseInline`) so the
 * logic is unit-testable without rendering. Both are safe on partial input:
 * an unclosed ** or ` (mid-stream) renders as literal characters.
 */

export type InlineToken =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'code'; text: string };

export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'paragraph'; text: string };

const BULLET_RE = /^\s*[-*•]\s+(.*)$/;
const ORDERED_RE = /^\s*\d+[.)]\s+(.*)$/;
const HEADING_RE = /^#{1,4}\s+(.*)$/;

/** Group raw text into headings, lists and paragraphs (blank-line separated). */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ kind: 'list', ...list });
      list = null;
    }
  };

  for (const line of text.split('\n')) {
    const heading = HEADING_RE.exec(line);
    const bullet = BULLET_RE.exec(line);
    const ordered = bullet ? null : ORDERED_RE.exec(line);

    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', text: heading[1] });
    } else if (bullet || ordered) {
      flushParagraph();
      const isOrdered = !!ordered;
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push((bullet ?? ordered)![1]);
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Split a line into text / **bold** / `code` runs. Unclosed markers stay literal. */
export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // `code` wins over ** so bold markers inside code stay literal.
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) tokens.push({ kind: 'text', text: text.slice(last, m.index) });
    const run = m[0];
    if (run.startsWith('`')) tokens.push({ kind: 'code', text: run.slice(1, -1) });
    else tokens.push({ kind: 'bold', text: run.slice(2, -2) });
    last = m.index + run.length;
  }
  if (last < text.length) tokens.push({ kind: 'text', text: text.slice(last) });
  return tokens;
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((t, i) =>
        t.kind === 'bold' ? (
          <strong key={i} className="font-semibold">{t.text}</strong>
        ) : t.kind === 'code' ? (
          <code key={i} className="bg-muted rounded px-1 py-px font-mono text-[0.85em]">{t.text}</code>
        ) : (
          <span key={i}>{t.text}</span>
        ),
      )}
    </>
  );
}

/** Render Assistant output. Kept to text-sm rhythm — headings just go semibold. */
export function MarkdownLite({ text }: { text: string }): ReactNode {
  return (
    <div className="space-y-2">
      {parseBlocks(text).map((block, i) => {
        if (block.kind === 'heading') {
          return (
            <div key={i} className="text-foreground text-sm font-semibold">
              <Inline text={block.text} />
            </div>
          );
        }
        if (block.kind === 'list') {
          return (
            <ul key={i} className="space-y-1">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-2 text-sm leading-relaxed">
                  <span className="text-muted-foreground shrink-0 select-none">
                    {block.ordered ? `${j + 1}.` : '·'}
                  </span>
                  <span className="min-w-0"><Inline text={item} /></span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-sm leading-relaxed whitespace-pre-wrap">
            <Inline text={block.text} />
          </p>
        );
      })}
    </div>
  );
}
