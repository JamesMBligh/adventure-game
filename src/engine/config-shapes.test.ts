import { describe, it, expect } from 'vitest';
import { validateMansionConfig, validateDreamConfig } from './validate';

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
