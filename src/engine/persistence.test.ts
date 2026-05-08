import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureBuiltInsRegistered, GameEngine, runActions } from './index';
import { saveGame, loadGame, hasSave, clearSave, attachAutosave } from './persistence';
import type { Adventure } from '../types';

beforeAll(() => {
  ensureBuiltInsRegistered();
});

function tinyAdventure(): Adventure {
  return {
    title: 't',
    startScene: 'a',
    initialState: { flags: {}, inventory: [] },
    scenes: { a: { name: 'A' }, b: { name: 'B' } },
  };
}

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) {
    return this.store.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, v);
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  clear() {
    this.store.clear();
  }
  get length() {
    return this.store.size;
  }
  key(_i: number) {
    return null;
  }
}

beforeEach(() => {
  // jsdom-free polyfill: install a fresh in-memory localStorage on globalThis.window.
  const win = { localStorage: new MemoryStorage() };
  (globalThis as unknown as { window: typeof win }).window = win;
});

describe('serialize / restore', () => {
  it('round-trips state', async () => {
    const engine = new GameEngine(tinyAdventure());
    await runActions(
      [
        { type: 'setFlag', flag: 'x', value: 7 },
        { type: 'addItem', item: 'apple' },
        { type: 'goto', scene: 'b' },
      ],
      { engine },
    );
    const snapshot = engine.serialize();
    const fresh = new GameEngine(tinyAdventure());
    expect(fresh.restore(snapshot)).toBe(true);
    expect(fresh.state.currentSceneId).toBe('b');
    expect(fresh.state.flags.x).toBe(7);
    expect(fresh.state.inventory).toEqual(['apple']);
  });

  it('rejects mismatched schema', () => {
    const engine = new GameEngine(tinyAdventure());
    const snapshot = engine.serialize();
    const bad = { ...snapshot, schema: 999 };
    expect(engine.restore(bad)).toBe(false);
  });
});

describe('localStorage save/load', () => {
  it('saves and loads under a key', async () => {
    const engine = new GameEngine(tinyAdventure());
    await runActions([{ type: 'addItem', item: 'apple' }], { engine });
    saveGame(engine, 'tiny');
    expect(hasSave()).toBe(true);
    const loaded = loadGame();
    expect(loaded?.adventureId).toBe('tiny');
    expect(loaded?.snapshot.inventory).toEqual(['apple']);
    clearSave();
    expect(hasSave()).toBe(false);
  });

  it('attachAutosave writes through onPersist', async () => {
    const engine = new GameEngine(tinyAdventure());
    attachAutosave(engine, 'tiny');
    await engine.enterScene('b');
    expect(loadGame()?.snapshot.currentSceneId).toBe('b');
  });
});
