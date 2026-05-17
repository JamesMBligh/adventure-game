import { describe, it, expect, beforeAll } from 'vitest';
import { ensureBuiltInsRegistered, validateAdventure } from '../../engine';
import { mainAdventure } from '../index';

beforeAll(() => {
  ensureBuiltInsRegistered();
});

describe('main adventure', () => {
  it('has no validation errors (after dream files are merged in)', async () => {
    const composed = await mainAdventure.load();
    expect(validateAdventure(composed)).toEqual([]);
  });
});
