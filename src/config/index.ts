import type {
  Adventure,
  CaseFile,
  CasesConfig,
  Condition,
  Dialog,
  DreamConfig,
  MansionConfig,
  PatientId,
  PatientRuntimeState,
  Scene,
} from '../types';
import {
  formatValidationErrors,
  resolveMarkdown,
  validateCasesConfig,
  validateDreamConfig,
  validateMansionConfig,
  type AdventureValidationError,
} from '../engine';
import debugConfig from './debug.json';

/** Metadata + a lazy loader for an adventure. */
export interface AdventureCatalogEntry {
  id: string;
  title: string;
  description: string;
  /** Hide from the player-facing landing; reveal in dev builds only. */
  devOnly?: boolean;
  /** When true, the AdventureGame host skips `attachAutosave`. Used for
   *  throwaway debug profiles so they don't clobber a real save. */
  noAutosave?: boolean;
  /** Loads the full adventure definition. Use dynamic imports for code-splitting. */
  load: () => Promise<Adventure>;
}

/** A development convenience defined in `debug.json`. Each profile becomes a
 *  dev-only catalog entry that boots the main game with `flags` and patient
 *  runtime state pre-applied and the intro auto-interaction skipped.
 *
 *  Case files don't have any per-player state — they're entirely derived from
 *  the `availableIf` conditions on each case (which read flags and patient
 *  status). So setting `flags` + `patients` to whatever the in-game story
 *  would have set is enough to make the right case files appear in the modal. */
interface DebugProfile {
  id: string;
  label: string;
  description?: string;
  flags?: Record<string, unknown>;
  patients?: Record<PatientId, Partial<PatientRuntimeState>>;
  /** Override where the player lands. When set, the engine boots into this
   *  scene directly — the mansion's `startSite` / `startInteraction` are
   *  cleared. Combine with `activePatient` to drop straight into a dream. */
  startScene?: string;
  /** When set, seeds `state.activePatientId` so the engine treats the boot
   *  as mid-session. Required if `startScene` is a dream scene that depends
   *  on knowing whose dream the player is in. */
  activePatient?: PatientId;
}
interface DebugConfig {
  profiles?: DebugProfile[];
}

interface DreamModule {
  default: DreamConfig;
}

interface CasesModule {
  default: CasesConfig;
}

// `./adventures/*.json` matches both dream files AND `<patient>.cases.json`
// files; the loader filters by suffix so it only treats true dreams as dream
// sources. Cases use their own dedicated glob (below).
const dreamModules = import.meta.glob<DreamModule>('./adventures/*.json');
const mainCasesModules = import.meta.glob<CasesModule>('./main/cases.json');
const dreamCasesModules = import.meta.glob<CasesModule>('./adventures/*.cases.json');

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
    dialogs: {},
    items: {},
    caseFiles: [],
  };

  // Extract inline dialogs from mansion interactions into the runtime dialogs
  // map so `startDialog` lookups (engine + author-authored) resolve uniformly.
  // Inline dialogs may omit `id` — the runtime never needs to cross-reference
  // them, so we auto-allocate `__inline_<interactionId>` here. We also clone
  // the interaction array so a generated id doesn't mutate the imported JSON
  // module graph (which Vite may otherwise share between hot-reloads / tests).
  const rebuiltInteractions = (main.interactions ?? []).map((interaction) => {
    if (!interaction.dialog) return interaction;
    const inline = interaction.dialog;
    const id =
      typeof inline.id === 'string' && inline.id.length > 0
        ? inline.id
        : `__inline_${interaction.id}`;
    const resolvedDialog: Dialog = { ...inline, id };
    if (merged.dialogs![id]) {
      issues.push({
        path: `main.json:interactions[${interaction.id}].dialog.id`,
        message: `dialog id "${id}" collides with another dialog`,
      });
    }
    merged.dialogs![id] = resolvedDialog;
    return { ...interaction, dialog: resolvedDialog };
  });
  merged.interactions = rebuiltInteractions;

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

  // Case files: merge mansion + per-patient case sources. Dream-sourced cases
  // get an implicit patient-availability gate AND-ed onto each case's
  // `availableIf` so authors don't have to repeat it on every entry.
  const resolvedCases: CaseFile[] = [];
  const seenCaseIds = new Set<string>();

  const collectCases = async (
    source: string,
    loader: () => Promise<CasesModule>,
    patientGate: PatientId | null,
  ): Promise<void> => {
    const cfg = (await loader()).default;
    for (const e of validateCasesConfig(cfg)) {
      issues.push({ path: `${source}:${e.path}`, message: e.message });
    }
    if (!cfg || !Array.isArray(cfg.cases)) return;
    cfg.cases.forEach((c, i) => {
      if (!c || typeof c.id !== 'string' || !c.id) return;
      if (seenCaseIds.has(c.id)) {
        issues.push({
          path: `${source}:cases[${i}].id`,
          message: `case id "${c.id}" collides with another cases file`,
        });
        return;
      }
      seenCaseIds.add(c.id);
      const documents = (c.documents ?? []).map((d, di) => {
        const content = typeof d?.path === 'string' ? resolveMarkdown(d.path) : null;
        if (content === null) {
          issues.push({
            path: `${source}:cases[${i}].documents[${di}].path`,
            message: `no markdown asset bundled at "${d?.path}"`,
          });
        }
        return {
          id: d.id,
          label: d.label,
          availableIf: d.availableIf,
          content: content ?? '',
        };
      });
      const availableIf = gateForPatient(c.availableIf, patientGate);
      resolvedCases.push({
        id: c.id,
        label: c.label,
        subtitle: c.subtitle,
        availableIf,
        documents,
      });
    });
  };

  const mainCasesLoader = mainCasesModules['./main/cases.json'];
  if (mainCasesLoader) {
    await collectCases('main/cases.json', mainCasesLoader, null);
  }

  for (const [key, loader] of Object.entries(dreamCasesModules)) {
    const match = /^\.\/adventures\/([^/]+)\.cases\.json$/.exec(key);
    if (!match) continue;
    const patientId = match[1] as PatientId;
    if (!main.patients || !main.patients[patientId]) {
      issues.push({
        path: `adventures/${patientId}.cases.json`,
        message: `cases file references unknown patient "${patientId}"`,
      });
      continue;
    }
    await collectCases(`adventures/${patientId}.cases.json`, loader, patientId);
  }

  merged.caseFiles = resolvedCases;

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

/**
 * Apply a debug profile to the composed main Adventure: merge the profile's
 * flags into `initialState.flags` and its `patients` into
 * `initialState.patientState`, and drop `startInteraction` so the engine
 * lands the player at `startSite` instead of auto-entering the intro.
 *
 * When `startScene` is set, the engine boots into that scene instead of the
 * mansion — useful for dream-only debug entries. In that mode the mansion's
 * `startSite` is also cleared (so the engine prefers `startScene`), and
 * `preDreamNarration` is seeded to `[]` so the eventual wake restores to an
 * empty log instead of leaking dream narration back out.
 *
 * Spread-clones the parts we modify; everything else (scenes, sites, dialogs,
 * patients, items) is shared by reference since they're treated as read-only
 * at runtime.
 */
function applyDebugProfile(base: Adventure, profile: DebugProfile): Adventure {
  const isDreamStart = !!profile.startScene;
  return {
    ...base,
    startInteraction: undefined,
    startSite: isDreamStart ? undefined : base.startSite,
    startScene: profile.startScene ?? base.startScene,
    initialState: {
      ...(base.initialState ?? {}),
      flags: {
        ...(base.initialState?.flags ?? {}),
        ...(profile.flags ?? {}),
      },
      patientState: {
        ...(base.initialState?.patientState ?? {}),
        ...(profile.patients ?? {}),
      },
      ...(profile.activePatient ? { activePatientId: profile.activePatient } : {}),
      ...(isDreamStart ? { preDreamNarration: [] } : {}),
    },
  };
}

/** Catalog entries derived from `debug.json` — one per profile, dev-only. */
function debugProfileEntries(): AdventureCatalogEntry[] {
  // The static import is fine to use during dev — Vite ships debug.json
  // alongside everything else but the entries it produces are gated behind
  // `import.meta.env.DEV` below at the catalog-assembly site.
  const config = debugConfig as DebugConfig;
  const profiles = config.profiles ?? [];
  return profiles.map(
    (profile): AdventureCatalogEntry => ({
      id: `debug-${profile.id}`,
      title: `Debug: ${profile.label}`,
      description: profile.description ?? '',
      devOnly: true,
      noAutosave: true,
      load: async () => applyDebugProfile(await loadMainAdventure(), profile),
    }),
  );
}

/** All registered adventures. The dev-only ones are filtered out of production builds. */
export const adventureCatalog: AdventureCatalogEntry[] = [
  mainAdventure,
  ...(import.meta.env.DEV ? [cabinDevEntry, ...debugProfileEntries()] : []),
];

export function findAdventure(id: string): AdventureCatalogEntry | undefined {
  return adventureCatalog.find((a) => a.id === id);
}

/**
 * For a case authored inside a dream's `cases.json`, AND its `availableIf`
 * with an implicit "patient is present" gate (in residence / improving /
 * healed). Mansion cases (patientId === null) pass through unchanged.
 */
function gateForPatient(
  authored: Condition | undefined,
  patientId: PatientId | null,
): Condition | undefined {
  if (!patientId) return authored;
  const patientAvailable: Condition = {
    type: 'or',
    conditions: [
      { type: 'patientStatus', patient: patientId, status: 'inResidence' },
      { type: 'patientStatus', patient: patientId, status: 'improving' },
      { type: 'patientStatus', patient: patientId, status: 'healed' },
    ],
  };
  if (!authored) return patientAvailable;
  return { type: 'and', conditions: [authored, patientAvailable] };
}
