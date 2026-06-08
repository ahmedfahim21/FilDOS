/** Renderer-side path helpers that respect the OS separator from preload. */

export function sep(): string {
  return window.platform?.sep ?? '/';
}

/** Parent directory of a path, or the path itself if already at a root. */
export function parentOf(p: string): string {
  const s = sep();
  // Strip a single trailing separator (but keep a lone root like "/" or "C:\").
  let cleaned = p.length > 1 && p.endsWith(s) ? p.slice(0, -1) : p;
  const idx = cleaned.lastIndexOf(s);
  if (idx <= 0) {
    // POSIX root.
    if (s === '/') return '/';
    // Windows drive root like "C:".
    return cleaned.slice(0, idx + 1) || cleaned;
  }
  // Preserve POSIX leading slash.
  return s === '/' && idx === 0 ? '/' : cleaned.slice(0, idx);
}

/** Last path component. */
export function baseName(p: string): string {
  const s = sep();
  const cleaned = p.length > 1 && p.endsWith(s) ? p.slice(0, -1) : p;
  const idx = cleaned.lastIndexOf(s);
  return idx === -1 ? cleaned : cleaned.slice(idx + 1);
}

/** Breadcrumb segments: [{ label, path }] from root to the given path. */
export function segments(p: string): { label: string; path: string }[] {
  const s = sep();
  const out: { label: string; path: string }[] = [];

  if (s === '/') {
    out.push({ label: '/', path: '/' });
    const parts = p.split('/').filter(Boolean);
    let acc = '';
    for (const part of parts) {
      acc += `/${part}`;
      out.push({ label: part, path: acc });
    }
    return out;
  }

  // Windows-style.
  const parts = p.split(/\\+/).filter(Boolean);
  let acc = '';
  parts.forEach((part, i) => {
    acc = i === 0 ? `${part}\\` : `${acc}${part}\\`;
    out.push({ label: part, path: i === 0 ? `${part}\\` : acc.replace(/\\$/, '') });
  });
  return out;
}
