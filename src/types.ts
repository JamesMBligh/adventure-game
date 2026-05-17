// Core domain types for the adventure engine.
//
// The runtime is intentionally generic: scene objects, actions, and conditions
// are all dispatched through registries keyed by `type`. Anything not handled
// by a built-in type can be plugged in by registering a handler/component.

/** A rectangle in the scene, expressed as percentages of the scene viewport. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Generic, extensible action. The engine looks up `type` in the action registry. */
export interface Action {
  type: string;
  [key: string]: unknown;
}

/** Generic, extensible condition. */
export interface Condition {
  type: string;
  [key: string]: unknown;
}

/** Triggers a scene object can respond to. New triggers can be added freely;
 *  the engine just runs whichever action list matches the event name. */
export type TriggerName = 'onClick' | 'onHover' | string;

export interface SceneObject {
  id: string;
  /** Display name (used as label / aria-label / tooltip). */
  name?: string;
  /** Registered object type. Defaults to "hotspot" if omitted. */
  type?: string;
  /** Position and size as % of scene viewport. */
  rect?: Rect;
  /** Optional sprite/image overlay. */
  image?: string;
  /** Optional CSS color (used by hotspot rendering). */
  color?: string;
  /** Hidden until set visible by an action, or hidden by `if.visible`. */
  initiallyHidden?: boolean;
  /** Condition the engine evaluates to decide if this object renders. */
  visibleIf?: Condition;
  /** Action lists keyed by trigger name. */
  triggers?: Record<TriggerName, Action[]>;
  /** Free-form bag for custom object types. */
  data?: Record<string, unknown>;
}

export interface Scene {
  id?: string;
  name?: string;
  /** `hub` is the legacy point-and-click room kind retained for fixtures
   *  (cabin.json). `dream` runs inside a patient's mind. Mansion-mode
   *  rooms live in `Adventure.sites` / `Adventure.interactions`, not here. */
  kind?: 'hub' | 'dream';
  /** Background image URL or CSS color. */
  background?: string;
  /** Description shown when entering (in addition to onEnter actions). */
  description?: string;
  /** Actions run when the scene is entered. */
  onEnter?: Action[];
  /** Actions run when the scene is left. */
  onExit?: Action[];
  objects?: SceneObject[];
}

/** Declared game-state flag with a default value and authoring description. */
export interface FlagDef {
  default: boolean;
  description?: string;
}

/** Item catalog entry (inventory item). */
export interface ItemDef {
  name: string;
  description?: string;
  image?: string;
}

/** Marker shown at a location. Defaults to "standard" when omitted; the four
 *  directional values render arrow icons useful for transitions. */
export type SiteLocationIcon = 'standard' | 'left' | 'up' | 'down' | 'right';

/** A clickable point on a site's floor plan. Either opens an interaction
 *  (when no `target`) or transitions to another site (when `target` is set).
 *  Coordinates are percentages of the viewport; the location icon is rendered
 *  centered at (x, y). */
export interface SiteLocation {
  name: string;
  x: number;
  y: number;
  /** Marker variant. Defaults to "standard". */
  icon?: SiteLocationIcon;
  /** If set, clicking transitions to this site (no interaction lookup). */
  target?: string;
}

/** A site: a floor plan with named locations. Locations are identified by
 *  the key in `locations`; ids must be globally unique across all sites. */
export interface Site {
  name: string;
  background?: string;
  description?: string;
  locations: Record<string, SiteLocation>;
  onEnter?: Action[];
  onExit?: Action[];
}

/** A self-contained mansion encounter: which location it's bound to, under
 *  what conditions it shows up, plus its own visuals and dialog. */
export interface Interaction {
  id: string;
  /** Location id this interaction belongs to. The site is derived. */
  location: string;
  /** All conditions must hold for the interaction to qualify. Empty / omitted
   *  means "always qualifies" — useful as a default fallback at the end of
   *  the interactions list. */
  conditions?: Condition[];
  background?: string;
  /** Named ambient effects layered over the background, e.g. "lamp-flicker". */
  animations?: string[];
  /** Dialog id auto-started when the interaction begins. */
  dialog?: string;
  onEnter?: Action[];
  onExit?: Action[];
}

export type PatientId = string;

export interface PatientDef {
  name: string;
  /** Short summary shown in the case-files panel. */
  presenting: string;
  /** Longer file text (paragraphs separated by blank lines). */
  file: string;
  /** Scene id of the dream world the player enters from the device. */
  dreamScene: string;
  /** Sessions before the patient leaves the residence. Optional. */
  maxSessions?: number;
}

export type PatientStatus =
  | 'pending'
  | 'inResidence'
  | 'improving'
  | 'healed'
  | 'unhelped'
  | 'departed';

export interface PatientRuntimeState {
  status: PatientStatus;
  sessionsCompleted: number;
  notes: string[];
}

export interface DialogChoice {
  text: string;
  /** Hide this choice unless the condition holds. */
  visibleIf?: Condition;
  actions?: Action[];
  /** Advance to a node in the same dialog after running actions. */
  next?: string;
}

export interface DialogNode {
  text: string;
  speaker?: string;
  choices?: DialogChoice[];
}

export interface Dialog {
  id: string;
  start: string;
  nodes: Record<string, DialogNode>;
}

export interface Adventure {
  title: string;
  /** Required for dream-only / hub adventures. Optional for mansion adventures
   *  that boot via `startSite` / `startInteraction`. */
  startScene?: string;
  /** Mansion: site to land on at new game. Required for mansion-mode adventures. */
  startSite?: string;
  /** Mansion: optional opening interaction that auto-plays before the player
   *  reaches the floor plan. */
  startInteraction?: string;
  /** Declared flags with defaults and descriptions. Replaces ad-hoc flag use. */
  flags?: Record<string, FlagDef>;
  /** Initial flags / variables. Anything JSON-serialisable.
   *  Flag defaults declared in `flags` are merged in automatically; this is
   *  for inventory or any non-flag initial state. */
  initialState?: {
    flags?: Record<string, unknown>;
    inventory?: string[];
  };
  /** Item catalog: id -> display info. */
  items?: Record<string, ItemDef>;
  /** Dream and legacy hub scenes. Mansion rooms live in `sites`. */
  scenes?: Record<string, Scene>;
  /** Mansion sites (floor plans). */
  sites?: Record<string, Site>;
  /** Mansion interactions. Ordered: first qualifying interaction at a location wins. */
  interactions?: Interaction[];
  /** Patients introduced by this adventure. */
  patients?: Record<PatientId, PatientDef>;
  /** Dialogs available for `startDialog` actions. */
  dialogs?: Record<string, Dialog>;
}

/** Mutable runtime state. */
export interface GameState {
  /** Current scene id when the player is in a dream or legacy hub. Null
   *  while the player is in mansion mode. */
  currentSceneId: string | null;
  /** Current mansion site, or null when not in mansion mode. */
  currentSiteId: string | null;
  /** Currently-playing mansion interaction, or null when on a site's floor plan. */
  activeInteractionId: string | null;
  flags: Record<string, unknown>;
  inventory: string[];
  /** Per-object overrides set at runtime (e.g. hidden, custom data). */
  objectState: Record<string, { hidden?: boolean; data?: Record<string, unknown> }>;
  narration: NarrationEntry[];
  /** Patient ID currently undergoing a session, or null in the hub. */
  activePatientId: PatientId | null;
  /** Per-patient runtime state; populated lazily. */
  patientState: Record<PatientId, PatientRuntimeState>;
  /** Active dialog, or null if no dialog is in progress. */
  dialogState: { dialogId: string; nodeId: string } | null;
}

export interface NarrationEntry {
  id: number;
  kind: 'narration' | 'dialog' | 'system';
  text: string;
  speaker?: string;
}

// ---------------------------------------------------------------------------
// Authoring config types
//
// The engine consumes a single `Adventure` at runtime, but authoring is split
// across files that evolve independently:
//
//   - `main.json` is a `MansionConfig` — the hub: sites, interactions, mansion
//     dialogs, patient registry. Explicitly NO scenes, NO items, NO inventory.
//   - `adventures/<patient>.json` is a `DreamConfig` — the dream world: scenes,
//     dream-only dialogs, optional items and initial inventory. Explicitly no
//     sites/interactions/patients/flags (those are mansion concerns).
//
// `loadMainAdventure()` in `src/config/index.ts` validates and merges these
// into a single `Adventure` the engine can consume. Keeping the file-level
// types separate lets each schema evolve independently and lets the validator
// reject "wrong field in wrong file" mistakes at load time.
// ---------------------------------------------------------------------------

/** Schema for the mansion-side config file (main.json). */
export interface MansionConfig {
  title: string;
  /** Site to land on at new game. Required. */
  startSite: string;
  /** Optional opening interaction that auto-plays before the floor plan shows. */
  startInteraction?: string;
  /** Declared flags with defaults and descriptions. */
  flags?: Record<string, FlagDef>;
  /** Non-inventory initial state (flag overrides). Inventory is a dream-only concept. */
  initialState?: {
    flags?: Record<string, unknown>;
  };
  /** Patients introduced by this adventure. Each patient may have a matching
   *  `adventures/<patientId>.json` dream file. */
  patients?: Record<PatientId, PatientDef>;
  /** Mansion sites (floor plans). */
  sites: Record<string, Site>;
  /** Mansion interactions. Ordered: first qualifying interaction at a location wins. */
  interactions?: Interaction[];
  /** Mansion-side dialogs (started from interactions). Dream-only dialogs live
   *  in the dream files. */
  dialogs?: Record<string, Dialog>;
}

/** Schema for a per-dream config file (`src/config/adventures/<patientId>.json`). */
export interface DreamConfig {
  /** The dream world's rooms. Required. */
  scenes: Record<string, Scene>;
  /** Dream-only dialogs (started from scene objects or scene `onEnter` lists). */
  dialogs?: Record<string, Dialog>;
  /** Items available within this dream. */
  items?: Record<string, ItemDef>;
  /** Inventory the operator starts the session with. Reserved for forthcoming
   *  dream-scoped inventory handling; declaring it is harmless today. */
  initialState?: {
    inventory?: string[];
  };
}
