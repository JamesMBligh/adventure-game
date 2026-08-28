/**
 * Minimal markdown renderer for case-file documents. Hand-rolled so we don't
 * pull in `marked` or `markdown-it` for what is, in practice, in-repo prose.
 *
 * Supports:
 *   - `#`, `##`, `###` headings
 *   - paragraphs (single newlines become <br>)
 *   - **bold**, *italic* / _italic_, `inline code`
 *   - unordered lists (`-`, `*`, `+`) and ordered lists (`1.`)
 *   - blockquotes (`>` at start of line)
 *   - horizontal rules (`---`, `***`)
 *   - [text](url) links - only http://, https://, mailto:, and `/`-relative
 *     URLs are linked; anything else renders as plain text.
 *   - fenced ``` … ``` blocks → rendered as conversation transcripts (lines
 *     of the form "Speaker: text" get the speaker styled distinctly).
 *
 * Safety: source is HTML-escaped first, then transformed. Inline code spans
 * are pulled out into placeholder tokens before further transforms so `**`
 * inside backticks doesn't get interpreted as bold. The link href is
 * separately allowlisted.
 */

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

const SAFE_HREF_RE = /^(?:https?:\/\/|mailto:|\/)/i;

function isSafeHref(href: string): boolean {
  return SAFE_HREF_RE.test(href.trim());
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}

// Printable sentinel markers for extracted code-span placeholders. `@` isn't
// touched by any inline transform here (no bold/italic/list/link/heading
// marker uses it), so the placeholder can sit flush against neighbouring text
// without needing whitespace padding.
const CODE_OPEN = '@@MDCODE_';
const CODE_CLOSE = '_MDCODE@@';
const CODE_RE = /@@MDCODE_(\d+)_MDCODE@@/g;

// Same trick for fenced ``` … ``` transcripts. They're extracted before the
// block-split so blank lines inside a transcript don't fragment it, and
// re-injected as `<div class="transcript">` after rendering completes.
const FENCE_OPEN = '@@MDFENCE_';
const FENCE_CLOSE = '_MDFENCE@@';
const FENCE_RE = /@@MDFENCE_(\d+)_MDFENCE@@/g;
const FENCE_BLOCK_RE = /^@@MDFENCE_\d+_MDFENCE@@$/;

function inlineTransform(text: string): string {
  // 1. Pull out inline code spans into placeholders so subsequent inline
  //    transforms (bold, italic, link) don't touch their contents.
  const codeSpans: string[] = [];
  let work = text.replace(/`([^`]+)`/g, (_m, body: string) => {
    const idx = codeSpans.length;
    codeSpans.push(body);
    return `${CODE_OPEN}${idx}${CODE_CLOSE}`;
  });

  // 2. Links: [text](href) - keep the link only when href is safe.
  work = work.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, href: string) => {
    const safe = isSafeHref(href);
    return safe
      ? `<a href="${escapeAttr(href.trim())}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : label;
  });

  // 3. Bold + italic. Bold first (greedier marker) so `**x**` doesn't get
  //    consumed by the italic pass.
  work = work.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  work = work.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
  work = work.replace(/(^|[^\w_])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');

  // 4. Re-inject code spans.
  work = work.replace(CODE_RE, (_m, idxStr: string) => {
    const idx = Number(idxStr);
    return `<code>${codeSpans[idx] ?? ''}</code>`;
  });

  return work;
}

/**
 * Pull every fenced ``` … ``` block out of the source, replace each with a
 * placeholder, and return the bodies for later re-injection. The placeholder
 * sits on its own block (surrounded by blank lines) so the standard
 * block-renderer won't try to merge it with neighbouring text.
 *
 * The optional language tag after the opening fence (e.g. ```transcript) is
 * accepted and ignored — every fence renders as a transcript.
 */
function extractFences(src: string): { src: string; blocks: string[] } {
  const blocks: string[] = [];
  const out = src.replace(/```[a-z]*\n?([\s\S]*?)\n?```/g, (_m, body: string) => {
    const idx = blocks.length;
    blocks.push(body);
    return `\n\n${FENCE_OPEN}${idx}${FENCE_CLOSE}\n\n`;
  });
  return { src: out, blocks };
}

/**
 * Render a fenced-block body as a transcript. Each non-blank line becomes a
 * `<p>`. When a line starts with a speaker label (alphabetic, ending in `:`
 * followed by whitespace), the speaker is wrapped in `<span class="speaker">`
 * so the stylesheet can give the name its own treatment. Inline markdown
 * (bold/italic/code/links) is honoured inside each line.
 */
function renderTranscript(body: string): string {
  const lines = body.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return '<div class="transcript"></div>';
  const parts = lines.map((line) => {
    const m = /^([A-Za-z][^:]*):\s+(.+)$/.exec(line);
    if (m) {
      const speaker = inlineTransform(m[1].trim());
      const speech = inlineTransform(m[2]);
      return `<p><span class="speaker">${speaker}</span> ${speech}</p>`;
    }
    return `<p>${inlineTransform(line)}</p>`;
  });
  return `<div class="transcript">${parts.join('')}</div>`;
}

function renderBlock(block: string): string {
  const trimmed = block.replace(/\n+$/, '');
  if (!trimmed) return '';

  // Fence placeholders pass through unwrapped — the re-injection step swaps
  // them for transcript divs and we don't want a wrapping <p> nested around
  // a block-level <div>.
  if (FENCE_BLOCK_RE.test(trimmed)) return trimmed;

  // Headings (line-level, single-line block).
  const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
  if (heading && !trimmed.includes('\n')) {
    const level = heading[1].length;
    return `<h${level}>${inlineTransform(heading[2])}</h${level}>`;
  }

  // Horizontal rule.
  if (/^(?:-{3,}|\*{3,})$/.test(trimmed) && !trimmed.includes('\n')) {
    return '<hr/>';
  }

  const lines = trimmed.split('\n');

  // Blockquote - every non-blank line starts with `>` (escaped to `&gt;`
  // before this point by escapeHtml).
  if (lines.every((l) => /^&gt;\s?/.test(l))) {
    const stripped = lines.map((l) => l.replace(/^&gt;\s?/, '')).join('\n');
    return `<blockquote>${renderBlock(stripped) || `<p>${inlineTransform(stripped)}</p>`}</blockquote>`;
  }

  // Unordered list - every line matches `-`, `*`, or `+` bullet.
  if (lines.every((l) => /^\s*[-*+]\s+/.test(l))) {
    const items = lines
      .map((l) => l.replace(/^\s*[-*+]\s+/, ''))
      .map((body) => `<li>${inlineTransform(body)}</li>`)
      .join('');
    return `<ul>${items}</ul>`;
  }

  // Ordered list - every line matches `1.`, `2.`, etc.
  if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
    const items = lines
      .map((l) => l.replace(/^\s*\d+\.\s+/, ''))
      .map((body) => `<li>${inlineTransform(body)}</li>`)
      .join('');
    return `<ol>${items}</ol>`;
  }

  // Paragraph. Single newlines become <br/>.
  const html = inlineTransform(trimmed).replace(/\n/g, '<br/>');
  return `<p>${html}</p>`;
}

/** Render an authored markdown string to HTML. Safe to drop into `v-html`. */
export function renderMarkdown(source: string): string {
  if (!source) return '';
  const escaped = escapeHtml(source);
  // Normalise line endings, then pull fenced transcript blocks out of the
  // stream so blank lines inside a transcript don't fragment it.
  const normalised = escaped.replace(/\r\n?/g, '\n');
  const { src: withoutFences, blocks: fenceBlocks } = extractFences(normalised);
  const rendered = withoutFences.split(/\n{2,}/).map(renderBlock).filter(Boolean).join('\n');
  // Re-inject transcripts in place of their placeholders.
  return rendered.replace(FENCE_RE, (_m, idxStr: string) => {
    const idx = Number(idxStr);
    return renderTranscript(fenceBlocks[idx] ?? '');
  });
}
