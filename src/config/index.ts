import type {
  Adventure,
  Dialog,
  DreamConfig,
  MansionConfig,
  PatientId,
  Scene,
} from '../types';
import {
  formatValidationErrors,
  validateDreamConfig,
  validateMansionConfig,
  type AdventureValidationError,
} from '../engine';

/** Metadata + a lazy loader for an adventure. */
export interface AdventureCatalogEntry {
  id: string;
  title: string;
  description: string;
  /** Hide from the player-facing landing; reveal in dev builds only. */
  devOnly?: boolean;
  /** Loads the full adventure definition. Use dynamic imports for code-splitting. */
  load: () => Promise<Adventure>;
}

interface DreamModule {
  default: DreamConfig;
}

const dreamModules = import.meta.glob<DreamModule>('./adventures/*.json');

/**
 * Compose the runtime `Adventure` by loading `main.json` (a `MansionConfig`)
 * and merging in each patient's dream file (`./adventures/<patientId>.json`,
 * a `DreamConfig`). Each file is validated structurally before merge; missing
 * required fields or wrong-file content surface as a single error list via
 * the thrown `Error.issues`.
 */
async function loadMainAdventure(): Promise<Adventure> {
  const main = (await import('./main/main.json')).default as unknown as MansionConfig;

  const issues: AdventureValidationError[] = [];
  for (const e of validateMansionConfig(main)) {
    issues.push({ path: `main.json:${e.path}`, message: e.message });
  }

  // Cast to the runtime Adventure type for merging. MansionConfig is a stricter
  // subset, so the assignment is always safe.
  const merged: Adventure = {
    ...(main as unknown as Adventure),
    scenes: {},
    dialogs: { ...(main.dialogs ?? {}) },
    items: {},
  };

  const patientIds = Object.keys(main.patients ?? {}) as PatientId[];
  for (const id of patientIds) {
    const loader = dreamModules[`./adventures/${id}.json`];
    if (!loader) continue;
    const dream = (await loader()).default;
    for (const e of validateDreamConfig(id, dream)) {
      issues.push({ path: `adventures/${id}.json:${e.path}`, message: e.message });
    }
    merged.scenes = { ...merged.scenes, ...(dream.scenes as Record<string, Scene>) };
    if (dream.dialogs) {
      merged.dialogs = { ...merged.dialogs, ...(dream.dialogs as Record<string, Dialog>) };
    }
    if (dream.items) {
      merged.items = { ...merged.items, ...dream.items };
    }
  }

  if (issues.length > 0) {
    const err = new Error(
      `Pre-merge config validation failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):\n` +
        formatValidationErrors(issues),
    ) as Error & { issues: AdventureValidationError[] };
    err.issues = issues;
    throw err;
  }

  return merged;
}

/** The single canonical game players land on. */
export const mainAdventure: AdventureCatalogEntry = {
  id: 'wren-house',
  title: 'The Wren House',
  description:
    "A psychiatrist's apprentice, a device that opens dreams, and a first patient who has been close enough to walk for weeks.",
  load: loadMainAdventure,
};

/** The cabin demo, retained as a dev/test fixture. */
const cabinDevEntry: AdventureCatalogEntry = {
  id: 'cabin',
  title: 'The Cabin in the Clearing',
  description:
    'Engine regression bed. Dev-only: tests hidden-key, conditional reveals, dialog narration.',
  devOnly: true,
  load: async () => (await import('./adventures/cabin.json')).default as Adventure,
};

/** All registered adventures. The dev-only ones are filtered out of production builds. */
export const adventureCatalog: AdventureCatalogEntry[] = [
  mainAdventure,
  ...(import.meta.env.DEV ? [cabinDevEntry] : []),
];

export function findAdventure(id: string): AdventureCatalogEntry | undefined {
  return adventureCatalog.find((a) => a.id === id);
}
