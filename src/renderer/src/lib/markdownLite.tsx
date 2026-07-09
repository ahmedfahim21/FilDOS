import { useState, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';

/**
 * A tiny, dependency-free markdown renderer for the Assistant's answers.
 * Local chat models reliably emit simple structure — paragraphs, bullet and
 * numbered lists, short headings, ```fenced code```, **bold** and `inline
 * code` — and rendering that structure makes answers far more readable than
 * raw text. Anything fancier (tables, links, nesting) intentionally falls
 * through as plain text.
 *
 * Parsing is split into pure functions (`parseBlocks` / `parseInline`) so the
 * logic is unit-testable without rendering. Both are safe on partial input:
 * an unclosed **, ` or ``` fence (mid-stream) still renders sensibly.
 */

export type InlineToken =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'code'; text: string };

export type Block =
  | { kind: 'heading'; text: string }
  // `start` is the first item's real number, so a list split across blank lines
  // (the model often does this) still counts up instead of resetting to 1.
  | { kind: 'list'; ordered: boolean; items: string[]; start?: number }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'paragraph'; text: string };

const BULLET_RE = /^\s*[-*•]\s+(.*)$/;
const ORDERED_RE = /^\s*(\d+)[.)]\s+(.*)$/;
const HEADING_RE = /^#{1,4}\s+(.*)$/;
const FENCE_RE = /^\s*```(\w*)\s*$/;

/** Group raw text into headings, lists, code fences and paragraphs. */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[]; start?: number } | null = null;

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

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ```lang … ``` — consume through the closing fence (or to end of input,
    // so a code block still renders correctly while it streams in).
    const fence = FENCE_RE.exec(line);
    if (fence) {
      flushParagraph();
      flushList();
      const lang = fence[1] ?? '';
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i])) body.push(lines[i++]);
      blocks.push({ kind: 'code', lang, text: body.join('\n') });
      continue; // the loop's i++ steps past the closing fence (or end)
    }

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
        list = { ordered: isOrdered, items: [], ...(isOrdered && { start: Number(ordered![1]) }) };
      }
      list.items.push(isOrdered ? ordered![2] : bullet![1]);
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

/**
 * A fenced code block: mono body with a header carrying the language and a
 * copy button. Horizontal scroll keeps long lines from breaking the column.
 */
function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="border-border bg-muted/40 overflow-hidden rounded-lg border">
      <div className="border-border text-muted-foreground flex items-center gap-2 border-b px-3 py-1">
        <span className="font-mono text-3xs tracking-wider uppercase">{lang || 'code'}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(text).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="hover:text-foreground ml-auto flex items-center gap-1 text-3xs"
          title="Copy code"
          aria-label="Copy code"
        >
          <Icon name={copied ? 'check' : 'copy'} size={11} className={copied ? 'text-mint' : ''} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 text-xs leading-relaxed">
        <code className="font-mono">{text}</code>
      </pre>
    </div>
  );
}

/** Render Assistant output. Kept to text-sm rhythm — headings just go semibold. */
export function MarkdownLite({ text }: { text: string }): ReactNode {
  return (
    <div className="space-y-2">
      {parseBlocks(text).map((block, i) => {
        if (block.kind === 'code') {
          return <CodeBlock key={i} lang={block.lang} text={block.text} />;
        }
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
                    {block.ordered ? `${(block.start ?? 1) + j}.` : '·'}
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
