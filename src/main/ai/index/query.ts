/**
 * What a search query asks for, beyond its embedding: the content words that
 * keyword search should find, whether it's an exact lookup (an order number,
 * an error code), and which kind of file it names ("a screenshot of…", "the
 * PDF about…"). Pure, so ranking rules are unit-testable.
 */
import { isImage } from './extract';
import { isScreenshot } from './ignore';

/** Splits like MiniSearch's default tokenizer, so query terms line up with indexed ones. */
const SPACE_OR_PUNCTUATION = /[\n\r\p{Z}\p{P}]+/u;

/** File kinds a query can name. */
export type FileKind = 'image' | 'screenshot' | 'pdf' | 'doc';

/** Words that say what kind of file to look for, not what's in it. */
const KIND_WORDS: Record<string, FileKind> = {
  photo: 'image', photos: 'image', picture: 'image', pictures: 'image', image: 'image', images: 'image', pic: 'image',
  screenshot: 'screenshot', screenshots: 'screenshot', screengrab: 'screenshot',
  pdf: 'pdf', pdfs: 'pdf', paper: 'pdf', papers: 'pdf',
  document: 'doc', documents: 'doc', doc: 'doc', docs: 'doc', note: 'doc', notes: 'doc',
};

/** Function words and search filler: they say how to look, not what for. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'and', 'or', 'my', 'me', 'i', 'that', 'this',
  'these', 'those', 'from', 'about', 'where', 'what', 'which', 'who', 'when', 'how', 'is', 'was', 'are', 'were',
  'be', 'it', 'its', 'some', 'any', 'find', 'show', 'file', 'files', 'did', 'do', 'does', 'can', 'should', 'there',
  ...Object.keys(KIND_WORDS),
]);

/** The query's content words, lowercased and deduplicated, as keyword search sees them. */
export function queryTerms(query: string): string[] {
  const seen = new Set<string>();
  return query
    .normalize('NFKC')
    .toLowerCase()
    .split(SPACE_OR_PUNCTUATION)
    .filter((t) => [...t].length >= 2 && !STOPWORDS.has(t) && !seen.has(t) && seen.add(t));
}

/**
 * Codes and IDs ("K7Q2LM", "INV-20431", "ERR_K7Q2LM") and long numbers
 * ("48151623") mean nothing to an embedding but everything to keyword search:
 * a query made only of them is a lookup. Judged on whole whitespace-separated
 * tokens, so a hyphenated code stays one code.
 */
export function isLookup(query: string): boolean {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^\p{P}+|\p{P}+$/gu, ''))
    .filter((t) => t && !STOPWORDS.has(t.toLowerCase()));
  return tokens.length > 0 && tokens.every((t) => /\d/.test(t) && (/\p{L}/u.test(t) || t.length >= 4));
}

/** Kinds of file the query names ("…in a screenshot", "photos of…"): a soft boost, not a filter. */
export function kindHints(query: string): Set<FileKind> {
  const out = new Set<FileKind>();
  for (const word of query.toLowerCase().split(SPACE_OR_PUNCTUATION)) {
    const kind = KIND_WORDS[word];
    if (kind) out.add(kind);
  }
  // A screenshot is a picture too.
  if (out.has('screenshot')) out.add('image');
  return out;
}

/** The kinds a file counts as, for matching against `kindHints`. */
export function fileKinds(path: string): Set<FileKind> {
  if (isScreenshot(path)) return new Set(['screenshot', 'image']);
  if (isImage(path)) return new Set(['image']);
  if (/\.pdf$/i.test(path)) return new Set(['pdf', 'doc']);
  return new Set(['doc']);
}
