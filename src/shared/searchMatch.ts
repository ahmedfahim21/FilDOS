/**
 * Filename-match helpers shared by the main-process name walk (fs/service.ts)
 * and the search overlay's fused ranking (SearchOverlay.tsx), so "does this
 * name match the query, and how strongly" means the same thing everywhere.
 * Pure string logic — no Node imports (this module loads in the renderer).
 */

/**
 * Lowercase and flatten filename-style separators to spaces, so "modern
 * angular" matches "Modern_Angular_…pdf" and "report-final" matches
 * "Report Final.docx". Applied to both the query and each candidate name.
 */
export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[_\-.,()[\]{}+]+/g, ' ').trim();
}

/**
 * How strongly a filename matches a query:
 *   3 = exact (normalized) name
 *   2 = name starts with the query
 *   1 = every query token appears somewhere in the name
 *   0 = no match
 */
export function nameMatchTier(name: string, query: string): 0 | 1 | 2 | 3 {
  const needle = normalizeForMatch(query);
  const tokens = needle.split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;
  const n = normalizeForMatch(name);
  if (n === needle) return 3;
  if (n.startsWith(needle)) return 2;
  return tokens.every((t) => n.includes(t)) ? 1 : 0;
}
