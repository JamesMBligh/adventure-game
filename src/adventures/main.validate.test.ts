import { describe, it, expect, beforeAll } from 'vitest';
import { ensureBuiltInsRegistered, validateAdventure } from '../engine';
import type { Adventure } from '../types';
import main from './main.json';

beforeAll(() => {
  ensureBuiltInsRegistered();
});

describe('main adventure', () => {
  it('has no validation errors', () => {
    expect(validateAdventure(main as Adventure)).toEqual([]);
  });
});
