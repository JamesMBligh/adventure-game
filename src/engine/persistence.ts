import type { GameEngine, EngineSnapshot } from './engine';
import { SCHEMA_VERSION } from './engine';

const DEFAULT_KEY = 'adventure-engine.save';

export interface SavedGame {
  schema: number;
  /** Adventure id; lets multiple adventures coexist in localStorage if added later. */
  adventureId: string;
  savedAt: string;
  snapshot: EngineSnapshot;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Persist the engine's current state under a single autosave key. */
export function saveGame(engine: GameEngine, adventureId: string, key = DEFAULT_KEY): void {
  const ls = storage();
  if (!ls) return;
  const payload: SavedGame = {
    schema: SCHEMA_VERSION,
    adventureId,
    savedAt: new Date().toISOString(),
    snapshot: engine.serialize(),
  };
  try {
    ls.setItem(key, JSON.stringify(payload));
  } catch (err) {
    console.warn('[adventure-engine] Failed to save:', err);
  }
}

/** Load the last save, if any. Returns null if absent or schema mismatch. */
export function loadGame(key = DEFAULT_KEY): SavedGame | null {
  const ls = storage();
  if (!ls) return null;
  const raw = ls.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedGame;
    if (parsed.schema !== SCHEMA_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasSave(key = DEFAULT_KEY): boolean {
  return loadGame(key) !== null;
}

export function clearSave(key = DEFAULT_KEY): void {
  storage()?.removeItem(key);
}

/** Wire up an engine's onPersist hook to autosave under the given adventure id. */
export function attachAutosave(engine: GameEngine, adventureId: string, key = DEFAULT_KEY): void {
  engine.onPersist = () => saveGame(engine, adventureId, key);
}
