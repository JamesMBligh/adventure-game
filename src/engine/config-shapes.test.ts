import { describe, it, expect } from 'vitest';
import { validateMansionConfig, validateDreamConfig, validateCasesConfig } from './validate';

describe('validateMansionConfig', () => {
  it('accepts a minimal valid mansion config', () => {
    const cfg = {
      title: 'T',
      startSite: 'first_floor',
      sites: { first_floor: { name: 'F1', locations: {} } },
    };
    expect(validateMansionConfig(cfg)).toEqual([]);
  });

  it('requires title, startSite, sites', () => {
    const issues = validateMansionConfig({}).map((e) => e.path);
    expect(issues).toEqual(expect.arrayContaining(['title', 'startSite', 'sites']));
  });

  it('rejects dream-only fields', () => {
    const cfg = {
      title: 'T',
      startSite: 'fs',
      sites: { fs: { name: 'F', locations: {} } },
      scenes: { x: {} },
      items: { y: { name: 'thing' } },
      startScene: 'x',
    };
    const paths = validateMansionConfig(cfg).map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(['scenes', 'items', 'startScene']));
  });

  it('rejects a top-level dialogs map (mansion dialogs live inline on interactions)', () => {
    const cfg = {
      title: 'T',
      startSite: 'fs',
      sites: { fs: { name: 'F', locations: {} } },
      dialogs: { x: { id: 'x', start: 'open', nodes: {} } },
    };
    const paths = validateMansionConfig(cfg).map((e) => e.path);
    expect(paths).toContain('dialogs');
  });

  it('rejects initialState.inventory specifically', () => {
    const cfg = {
      title: 'T',
      startSite: 'fs',
      sites: { fs: { name: 'F', locations: {} } },
      initialState: { inventory: [] },
    };
    const paths = validateMansionConfig(cfg).map((e) => e.path);
    expect(paths).toContain('initialState.inventory');
  });

  it('allows initialState.flags', () => {
    const cfg = {
      title: 'T',
      startSite: 'fs',
      sites: { fs: { name: 'F', locations: {} } },
      initialState: { flags: { x: true } },
    };
    expect(validateMansionConfig(cfg)).toEqual([]);
  });
});

describe('validateDreamConfig', () => {
  it('accepts a minimal valid dream config', () => {
    const cfg = { scenes: { entry: { name: 'Entry', kind: 'dream' } } };
    expect(validateDreamConfig('whitfield', cfg)).toEqual([]);
  });

  it('requires scenes', () => {
    const paths = validateDreamConfig('whitfield', {}).map((e) => e.path);
    expect(paths).toContain('dreams.whitfield.scenes');
  });

  it('rejects mansion-only fields and prefixes paths with the dream id', () => {
    const cfg = {
      scenes: { entry: { name: 'Entry' } },
      title: 'wrong',
      startSite: 'wrong',
      sites: {},
      interactions: [],
      patients: {},
      flags: {},
    };
    const paths = validateDreamConfig('whitfield', cfg).map((e) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'dreams.whitfield.title',
        'dreams.whitfield.startSite',
        'dreams.whitfield.sites',
        'dreams.whitfield.interactions',
        'dreams.whitfield.patients',
        'dreams.whitfield.flags',
      ]),
    );
  });

  it('allows items and initialState.inventory', () => {
    const cfg = {
      scenes: { entry: { name: 'Entry' } },
      items: { piano: { name: 'A piano' } },
      initialState: { inventory: ['piano'] },
    };
    expect(validateDreamConfig('whitfield', cfg)).toEqual([]);
  });
});

describe('validateCasesConfig', () => {
  it('accepts a minimal valid cases config', () => {
    const cfg = {
      cases: [
        {
          id: 'whitfield',
          label: 'Whitfield, C.',
          documents: [{ id: 'intake', label: 'Intake', path: 'whitfield/intake.md' }],
        },
      ],
    };
    expect(validateCasesConfig(cfg)).toEqual([]);
  });

  it('rejects when not an object', () => {
    const paths = validateCasesConfig(null).map((e) => e.path);
    expect(paths).toContain('');
  });

  it('requires a non-empty cases array', () => {
    expect(validateCasesConfig({}).map((e) => e.path)).toContain('cases');
    expect(validateCasesConfig({ cases: [] }).map((e) => e.path)).toContain('cases');
  });

  it('requires id, label, documents on each case', () => {
    const issues = validateCasesConfig({ cases: [{}] }).map((e) => e.path);
    expect(issues).toEqual(
      expect.arrayContaining(['cases[0].id', 'cases[0].label', 'cases[0].documents']),
    );
  });

  it('requires id, label, path on each document', () => {
    const cfg = {
      cases: [
        {
          id: 'a',
          label: 'A',
          documents: [{}],
        },
      ],
    };
    const issues = validateCasesConfig(cfg).map((e) => e.path);
    expect(issues).toEqual(
      expect.arrayContaining([
        'cases[0].documents[0].id',
        'cases[0].documents[0].label',
        'cases[0].documents[0].path',
      ]),
    );
  });

  it('rejects duplicate case ids within a file', () => {
    const cfg = {
      cases: [
        { id: 'dup', label: 'A', documents: [{ id: 'd', label: 'D', path: 'x.md' }] },
        { id: 'dup', label: 'B', documents: [{ id: 'd', label: 'D', path: 'y.md' }] },
      ],
    };
    const issues = validateCasesConfig(cfg);
    expect(issues.some((e) => e.message.includes('duplicate case id'))).toBe(true);
  });

  it('rejects duplicate doc ids within a case', () => {
    const cfg = {
      cases: [
        {
          id: 'a',
          label: 'A',
          documents: [
            { id: 'same', label: 'One', path: 'a.md' },
            { id: 'same', label: 'Two', path: 'b.md' },
          ],
        },
      ],
    };
    const issues = validateCasesConfig(cfg);
    expect(issues.some((e) => e.message.includes('duplicate document id'))).toBe(true);
  });

  it('rejects non-object availableIf', () => {
    const cfg = {
      cases: [
        {
          id: 'a',
          label: 'A',
          availableIf: 'nope',
          documents: [{ id: 'd', label: 'D', path: 'x.md' }],
        },
      ],
    };
    const paths = validateCasesConfig(cfg).map((e) => e.path);
    expect(paths).toContain('cases[0].availableIf');
  });
});
