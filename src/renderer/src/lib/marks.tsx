/**
 * Search snippets mark the query's words «like this» (main process,
 * `index/search.ts#markedSnippet`). These helpers turn the marks into
 * highlighted spans, and pull the words back out for highlighting elsewhere
 * (a PDF page preview).
 */

export interface MarkedPart {
  text: string;
  marked: boolean;
}

/** Split «marked» runs out of a snippet. Unbalanced marks are kept as plain text. */
export function splitMarks(text: string): MarkedPart[] {
  const parts: MarkedPart[] = [];
  const re = /«([^«»]*)»/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), marked: false });
    parts.push({ text: m[1], marked: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), marked: false });
  return parts;
}

/** The distinct marked words of a snippet, lowercased. */
export function markedWords(text: string): string[] {
  return [...new Set(splitMarks(text).filter((p) => p.marked).map((p) => p.text.toLowerCase()))];
}

/** A snippet with its marked words highlighted (a light wash, not weight). */
export function Marked({ text }: { text: string }) {
  return (
    <>
      {splitMarks(text).map((p, i) =>
        p.marked ? (
          <mark key={i} className="bg-primary/10 text-foreground rounded-[2px] px-px">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** Escape a string for use inside a RegExp. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Split `text` into runs, marking every case-insensitive occurrence of any of
 * `words` (longest first, so "kestrels" wins over "kestrel"). Used to light up
 * the query's words in a whole-file preview.
 */
export function markWords(text: string, words: string[]): MarkedPart[] {
  const terms = [...new Set(words.map((w) => w.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!terms.length || !text) return text ? [{ text, marked: false }] : [];
  const re = new RegExp(terms.map(escapeRe).join('|'), 'giu');
  const parts: MarkedPart[] = [];
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), marked: false });
    parts.push({ text: m[0], marked: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), marked: false });
  return parts;
}
