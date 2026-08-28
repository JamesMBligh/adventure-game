import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders headings', () => {
    expect(renderMarkdown('# Title')).toBe('<h1>Title</h1>');
    expect(renderMarkdown('## Heading')).toBe('<h2>Heading</h2>');
    expect(renderMarkdown('### Sub')).toBe('<h3>Sub</h3>');
  });

  it('renders paragraphs with inline emphasis', () => {
    expect(renderMarkdown('Hello **world** and *you*.')).toBe(
      '<p>Hello <strong>world</strong> and <em>you</em>.</p>',
    );
  });

  it('renders inline code without interpreting markup inside it', () => {
    const html = renderMarkdown('use `**not bold**` here');
    expect(html).toBe('<p>use <code>**not bold**</code> here</p>');
  });

  it('renders unordered lists', () => {
    const html = renderMarkdown('- one\n- two\n- three');
    expect(html).toBe('<ul><li>one</li><li>two</li><li>three</li></ul>');
  });

  it('renders ordered lists', () => {
    const html = renderMarkdown('1. one\n2. two');
    expect(html).toBe('<ol><li>one</li><li>two</li></ol>');
  });

  it('renders blockquotes', () => {
    const html = renderMarkdown('> a thought');
    expect(html).toBe('<blockquote><p>a thought</p></blockquote>');
  });

  it('renders horizontal rules', () => {
    expect(renderMarkdown('---')).toBe('<hr/>');
    expect(renderMarkdown('***')).toBe('<hr/>');
  });

  it('renders safe links and strips unsafe ones', () => {
    expect(renderMarkdown('See [Anthropic](https://anthropic.com)')).toContain(
      '<a href="https://anthropic.com"',
    );
    const unsafe = renderMarkdown('Click [here](javascript:alert(1))');
    expect(unsafe).not.toContain('<a ');
    expect(unsafe).toContain('here');
  });

  it('escapes raw HTML in the source', () => {
    const html = renderMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('splits blocks on blank lines', () => {
    const html = renderMarkdown('First paragraph.\n\nSecond paragraph.');
    expect(html).toBe('<p>First paragraph.</p>\n<p>Second paragraph.</p>');
  });

  it('converts single newlines inside a paragraph to <br/>', () => {
    const html = renderMarkdown('line one\nline two');
    expect(html).toBe('<p>line one<br/>line two</p>');
  });

  it('underscore italic works', () => {
    expect(renderMarkdown('_foo_ bar')).toBe('<p><em>foo</em> bar</p>');
  });

  it('empty source returns empty string', () => {
    expect(renderMarkdown('')).toBe('');
  });

  describe('fenced transcript blocks', () => {
    it('renders a ``` … ``` block as a transcript div', () => {
      const src = '```\nWren: Take your time.\nCatherine: I cannot.\n```';
      const out = renderMarkdown(src);
      expect(out).toContain('<div class="transcript">');
      expect(out).toContain('<span class="speaker">Wren</span> Take your time.');
      expect(out).toContain('<span class="speaker">Catherine</span> I cannot.');
    });

    it('does not wrap the transcript in a paragraph', () => {
      const src = '```\nWren: Yes.\n```';
      const out = renderMarkdown(src);
      expect(out).not.toMatch(/<p>\s*<div class="transcript"/);
    });

    it('preserves blank lines inside a fence without fragmenting', () => {
      const src = '```\nWren: One.\n\nCatherine: Two.\n```';
      const out = renderMarkdown(src);
      // Only one transcript container, both lines inside.
      expect((out.match(/<div class="transcript">/g) ?? []).length).toBe(1);
      expect(out).toContain('One.');
      expect(out).toContain('Two.');
    });

    it('lines without a speaker label become plain paragraphs', () => {
      const src = '```\nA long silence.\nWren: Take your time.\n```';
      const out = renderMarkdown(src);
      expect(out).toContain('<p>A long silence.</p>');
      expect(out).toContain('<span class="speaker">Wren</span> Take your time.');
    });

    it('inline emphasis still works inside transcript speech', () => {
      const src = '```\nWren: Not the **keyboard**.\n```';
      const out = renderMarkdown(src);
      expect(out).toContain('<strong>keyboard</strong>');
    });

    it('accepts an optional language tag after the opening fence', () => {
      const src = '```transcript\nWren: Hello.\n```';
      const out = renderMarkdown(src);
      expect(out).toContain('<div class="transcript">');
      expect(out).toContain('<span class="speaker">Wren</span> Hello.');
    });

    it('escapes HTML inside a transcript', () => {
      const src = '```\n<script>danger</script>\n```';
      const out = renderMarkdown(src);
      expect(out).not.toContain('<script>');
      expect(out).toContain('&lt;script&gt;');
    });

    it('lines starting with a digit are NOT misread as speakers', () => {
      const src = '```\n9:30 AM: session begins\n```';
      const out = renderMarkdown(src);
      // Should be a plain paragraph, not a speaker span on "9:30 AM".
      expect(out).not.toContain('<span class="speaker">9');
    });

    it('paragraphs flow normally around fenced blocks', () => {
      const src = 'Before.\n\n```\nWren: Mid.\n```\n\nAfter.';
      const out = renderMarkdown(src);
      expect(out).toContain('<p>Before.</p>');
      expect(out).toContain('<div class="transcript">');
      expect(out).toContain('<p>After.</p>');
    });
  });
});
