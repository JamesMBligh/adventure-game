/** Heuristic: looks like a URL/path rather than a CSS color or function. */
export function isUrlLike(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('data:')) return true;
  if (v.startsWith('/')) return true;
  if (v.startsWith('./') || v.startsWith('../')) return true;
  // bare paths like "images/foo.png" — must contain a dot before any whitespace/paren
  if (/^[\w-]+(\/[\w./-]+)*\.[a-z0-9]+$/i.test(v)) return true;
  return false;
}

/** Prefix relative URLs with Vite's BASE_URL so assets resolve under project Pages sites. */
export function resolveAssetUrl(value: string): string {
  const v = value.trim();
  if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('data:')) return v;
  const base = import.meta.env.BASE_URL ?? '/';
  const baseTrimmed = base.endsWith('/') ? base.slice(0, -1) : base;
  if (v.startsWith('/')) return `${baseTrimmed}${v}`;
  return `${base}${v.replace(/^\.\//, '')}`;
}
