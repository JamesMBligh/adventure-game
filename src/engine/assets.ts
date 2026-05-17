/**
 * All image assets authored under `src/config/`, eager-loaded as URLs so Vite
 * bundles and hashes them. JSON authors reference these by their path relative
 * to `src/config/` (e.g. `"main/floor1.png"`).
 *
 * The glob key shape is `'../config/main/floor1.png'` (relative to this file).
 */
const configAssetModules = import.meta.glob(
  '../config/**/*.{png,jpg,jpeg,webp,gif,svg,avif}',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>;

const configAssetMap: Record<string, string> = {};
for (const [key, url] of Object.entries(configAssetModules)) {
  const relPath = key.replace(/^\.\.\/config\//, '');
  configAssetMap[relPath] = url;
}

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

/**
 * Resolve an asset path declared in adventure JSON.
 *
 * - `http(s)://`, `data:` URLs return as-is.
 * - Paths matching an authored asset under `src/config/` return the Vite-bundled
 *   URL. Both `"main/floor1.png"` and `"/main/floor1.png"` resolve to the same file.
 * - Anything else falls back to a `BASE_URL`-prefixed URL, so files in `public/`
 *   continue to work for any non-config assets.
 */
export function resolveAssetUrl(value: string): string {
  const v = value.trim();
  if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('data:')) return v;

  const normalized = v.replace(/^\/+/, '').replace(/^\.\//, '');
  const registered = configAssetMap[normalized];
  if (registered) return registered;

  const base = import.meta.env.BASE_URL ?? '/';
  const baseTrimmed = base.endsWith('/') ? base.slice(0, -1) : base;
  if (v.startsWith('/')) return `${baseTrimmed}${v}`;
  return `${base}${v.replace(/^\.\//, '')}`;
}
