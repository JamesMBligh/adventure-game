import { describe, it, expect, beforeAll } from 'vitest';
import { ensureBuiltInsRegistered, GameEngine, evaluateCondition } from './index';
import type { Adventure, Condition } from '../types';

beforeAll(() => {
  ensureBuiltInsRegistered();
});

function makeEngine(over: Partial<Adventure> = {}): GameEngine {
  const adventure: Adventure = {
    title: 't',
    startScene: 's',
    initialState: { flags: { lit: true, dark: false }, inventory: ['key'] },
    scenes: { s: { name: 'S' }, other: { name: 'O' } },
    ...over,
  };
  return new GameEngine(adventure);
}

describe('built-in conditions', () => {
  it('flag returns true when flag is truthy and equals defaults to true', () => {
    const engine = makeEngine();
    expect(evaluateCondition({ type: 'flag', flag: 'lit' }, { engine })).toBe(true);
    expect(evaluateCondition({ type: 'flag', flag: 'dark' }, { engine })).toBe(false);
    expect(evaluateCondition({ type: 'flag', flag: 'missing' }, { engine })).toBe(false);
  });

  it('flag honors explicit equals value', () => {
    const engine = makeEngine();
    expect(evaluateCondition({ type: 'flag', flag: 'dark', equals: false }, { engine })).toBe(true);
  });

  it('hasItem checks inventory', () => {
    const engine = makeEngine();
    expect(evaluateCondition({ type: 'hasItem', item: 'key' }, { engine })).toBe(true);
    expect(evaluateCondition({ type: 'hasItem', item: 'sword' }, { engine })).toBe(false);
  });

  it('scene matches the current scene id', () => {
    const engine = makeEngine();
    expect(evaluateCondition({ type: 'scene', scene: 's' }, { engine })).toBe(true);
    expect(evaluateCondition({ type: 'scene', scene: 'other' }, { engine })).toBe(false);
  });

  it('and/or/not compose correctly', () => {
    const engine = makeEngine();
    const lit: Condition = { type: 'flag', flag: 'lit' };
    const hasKey: Condition = { type: 'hasItem', item: 'key' };
    const hasSword: Condition = { type: 'hasItem', item: 'sword' };
    expect(evaluateCondition({ type: 'and', conditions: [lit, hasKey] }, { engine })).toBe(true);
    expect(evaluateCondition({ type: 'and', conditions: [lit, hasSword] }, { engine })).toBe(false);
    expect(evaluateCondition({ type: 'or', conditions: [hasSword, hasKey] }, { engine })).toBe(
      true,
    );
    expect(evaluateCondition({ type: 'or', conditions: [hasSword] }, { engine })).toBe(false);
    expect(evaluateCondition({ type: 'not', condition: hasSword }, { engine })).toBe(true);
  });

  it('missing condition is treated as true', () => {
    const engine = makeEngine();
    expect(evaluateCondition(undefined, { engine })).toBe(true);
  });

  it('unknown condition type returns false', () => {
    const engine = makeEngine();
    expect(evaluateCondition({ type: 'nope' }, { engine })).toBe(false);
  });
});
