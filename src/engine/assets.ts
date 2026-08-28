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

/**
 * Markdown documents authored under `src/config/` (case-file contents).
 * Eager-loaded as raw strings via Vite's `?raw` query so the engine never
 * needs an HTTP fetch — the loader bakes content directly into the runtime
 * `CaseFile` shape. Authored paths in JSON are relative to `src/config/`,
 * matching the image-asset convention.
 */
const configMarkdownModules = import.meta.glob('../config/**/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const configMarkdownMap: Record<string, string> = {};
for (const [key, source] of Object.entries(configMarkdownModules)) {
  const relPath = key.replace(/^\.\.\/config\//, '');
  configMarkdownMap[relPath] = source;
}

/**
 * SVG markup for every authored `.svg` asset, loaded as a raw string. We
 * parse the `viewBox` (or explicit width/height) at load time so the engine
 * can hand a natural-pixel size to `<img>` elements in `display.place` mode
 * — SVGs without explicit width/height attributes otherwise render at the
 * browser's default replaced-element size (~300×150), which is rarely what
 * the author intended.
 */
const configSvgRaw = import.meta.glob('../config/**/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const svgNaturalSizeMap: Record<string, { width: number; height: number }> = {};
for (const [key, raw] of Object.entries(configSvgRaw)) {
  const size = parseSvgNaturalSize(raw);
  if (size) {
    const relPath = key.replace(/^\.\.\/config\//, '');
    svgNaturalSizeMap[relPath] = size;
  }
}

function parseSvgNaturalSize(raw: string): { width: number; height: number } | null {
  // Pull the opening <svg ...> tag.
  const tagMatch = /<svg\b[^>]*>/i.exec(raw);
  if (!tagMatch) return null;
  const tag = tagMatch[0];

  // Prefer explicit width / height attributes when both are simple numbers
  // (we don't try to resolve relative units like `100%` — they have no
  // intrinsic pixel size without a containing block).
  const widthAttr = /\swidth="([^"]+)"/i.exec(tag);
  const heightAttr = /\sheight="([^"]+)"/i.exec(tag);
  const numericW = widthAttr ? parsePixelLength(widthAttr[1]) : null;
  const numericH = heightAttr ? parsePixelLength(heightAttr[1]) : null;
  if (numericW !== null && numericH !== null) {
    return { width: numericW, height: numericH };
  }

  // Fall back to viewBox dimensions (W and H of `min-x min-y W H`).
  const vbMatch = /\sviewBox="([^"]+)"/i.exec(tag);
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      const w = parts[2];
      const h = parts[3];
      if (w > 0 && h > 0) return { width: w, height: h };
    }
  }
  return null;
}

function parsePixelLength(v: string): number | null {
  const trimmed = v.trim();
  if (trimmed.endsWith('%')) return null;
  const num = parseFloat(trimmed);
  return Number.isFinite(num) ? num : null;
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

/**
 * Resolve an authored `.md` path (relative to `src/config/`) to its raw
 * string content. Returns `null` if the path is not in the bundled set —
 * the loader turns that into a load-time validation error so missing
 * references don't ship.
 */
export function resolveMarkdown(value: string): string | null {
  const normalized = value.trim().replace(/^\/+/, '').replace(/^\.\//, '');
  return configMarkdownMap[normalized] ?? null;
}

/**
 * Resolve an authored image path (relative to `src/config/`) to the image's
 * natural pixel dimensions, when we can determine them. Only authored SVGs
 * are pre-parsed at module load — raster images carry their own intrinsic
 * size and don't need this. Used by place-mode rendering so SVGs sized via
 * `viewBox` alone don't fall back to the browser's 300×150 default.
 *
 * Returns `null` for unknown paths, raster paths, or SVGs we couldn't parse.
 */
export function getImageNaturalSize(value: string): { width: number; height: number } | null {
  const normalized = value.trim().replace(/^\/+/, '').replace(/^\.\//, '');
  return svgNaturalSizeMap[normalized] ?? null;
}
