import type { Adventure } from '../types';

/** Metadata + a lazy loader for an adventure. */
export interface AdventureCatalogEntry {
  id: string;
  title: string;
  description: string;
  author?: string;
  /** Hide from the player-facing landing; reveal in dev builds only. */
  devOnly?: boolean;
  /** Loads the full adventure definition. Use dynamic imports for code-splitting. */
  load: () => Promise<Adventure>;
}

/** The single canonical game players land on. */
export const mainAdventure: AdventureCatalogEntry = {
  id: 'wren-house',
  title: 'The Wren House',
  description:
    "A psychiatrist's apprentice, a device that opens dreams, and a first patient who has been close enough to walk for weeks.",
  author: 'Adventure Engine',
  load: async () => (await import('./main.json')).default as Adventure,
};

/** The cabin demo, retained as a dev/test fixture. */
const cabinDevEntry: AdventureCatalogEntry = {
  id: 'cabin',
  title: 'The Cabin in the Clearing',
  description:
    'Engine regression bed. Dev-only: tests hidden-key, conditional reveals, dialog narration.',
  author: 'Sample',
  devOnly: true,
  load: async () => (await import('./cabin.json')).default as Adventure,
};

/** All registered adventures. The dev-only ones are filtered out of production builds. */
export const adventureCatalog: AdventureCatalogEntry[] = [
  mainAdventure,
  ...(import.meta.env.DEV ? [cabinDevEntry] : []),
];

export function findAdventure(id: string): AdventureCatalogEntry | undefined {
  return adventureCatalog.find((a) => a.id === id);
}
