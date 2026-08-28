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

/** A single entry in a SceneObject's contextual menu. Shown when the object
 *  is clicked and at least one item is active. */
export interface SceneObjectMenuItem {
  /** Display label in the menu. */
  label: string;
  /** Optional gate — when present and evaluating false, the item is hidden
   *  from the menu (same semantics as `SceneObject.visibleIf` /
   *  `DialogChoice.visibleIf`). */
  visibleIf?: Condition;
  /** Actions to run when the player picks this item. */
  actions: Action[];
}

/** A rect whose `x` / `y` are optional on the wire (default to 0). Used by
 *  scene-object display and hit blocks so authors don't have to repeat
 *  `"x": 0, "y": 0` for the common case where the region starts at the
 *  anchor. The full `Rect` interface (with x/y required) remains the
 *  canonical resolved shape used elsewhere in the engine. */
export interface SceneRect {
  x?: number;
  y?: number;
  w: number;
  h: number;
}

/** A 2D point used by polygon paths on scene-object hit regions. Coordinates
 *  are interpreted as offsets from the owning object's anchor `(x, y)`,
 *  same convention as `SceneRect.x`/`y`. */
export interface Point {
  x: number;
  y: number;
}

/** Visual block on a SceneObject. The region is described by exactly one of
 *  `rect` (sized region) or `place` (image rendered at natural size, scaled).
 *  Wrapping in named region fields leaves room for future shape kinds
 *  (e.g. `path`, `ellipse`) to slot in without breaking the schema. */
export interface SceneObjectDisplay {
  /** Sized display region, coordinates relative to the object's anchor.
   *  Mutually exclusive with `place`. */
  rect?: SceneRect;
  /** Place the image at a point (relative to the anchor) and scale it relative
   *  to its natural pixel size. Shape matches the mansion `Overlay`'s `place`.
   *  Mutually exclusive with `rect`. */
  place?: OverlayPlace;
  /** Optional CSS background colour painted on the display. */
  color?: string;
  /** Optional image path, resolved by `resolveAssetUrl`. */
  image?: string;
}

/** Hit block on a SceneObject. The region is described by exactly one of
 *  `rect` (axis-aligned box), `path` (closed polygon), or `ellipsis` (ellipse
 *  inscribed in a bounding rect). Same wrapped shape as `display`. */
export interface SceneObjectHit {
  /** Sized hit region, coordinates relative to the object's anchor.
   *  Mutually exclusive with `path` and `ellipsis`. */
  rect?: SceneRect;
  /** Polygon hit region. At least 3 points; coordinates relative to the
   *  object's anchor. The polygon is closed implicitly — the last vertex
   *  connects to the first. The validator rejects self-intersecting paths
   *  (including the implicit closing edge). Mutually exclusive with `rect`
   *  and `ellipsis`. */
  path?: Point[];
  /** Ellipse hit region, inscribed in the given bounding rect (coordinates
   *  relative to the object's anchor). Centre at `(x + w/2, y + h/2)` with
   *  semi-axes `w/2` and `h/2`. Mutually exclusive with `rect` and `path`. */
  ellipsis?: SceneRect;
  /** When `true`, the hit boundary is rendered visibly (always on, regardless
   *  of mouse position). Useful for narrative emphasis on a particular
   *  hotspot, or for authoring debug. Defaults to `false`. */
  highlight?: boolean;
}

export interface SceneObject {
  id: string;
  /** Display name. Shown as a custom cursor-following tooltip on hover. */
  name?: string;
  /** Registered object type. Defaults to "hotspot" if omitted. */
  type?: string;
  /** Anchor x as % of scene viewport. The object's display and hit blocks
   *  carry their own `rect`s whose coordinates are interpreted as offsets
   *  from this anchor. */
  x: number;
  /** Anchor y as % of scene viewport. */
  y: number;
  /** Optional visual block. When omitted, the object paints nothing
   *  (transparent over the scene background — useful when the bg image
   *  already shows the feature). */
  display?: SceneObjectDisplay;
  /** Optional hit block. When omitted, the hit region falls back to
   *  `display`'s rect — so the common "visual = clickable" case stays terse.
   *  When both blocks are omitted, the object has no hit region. */
  hit?: SceneObjectHit;
  /** Hidden until set visible by an action, or hidden by `if.visible`. */
  initiallyHidden?: boolean;
  /** Condition the engine evaluates to decide if this object renders. */
  visibleIf?: Condition;
  /** Action lists keyed by trigger name. Still fired for `onHover` and as a
   *  fallback on `onClick` when the object has no active menu items. */
  triggers?: Record<TriggerName, Action[]>;
  /** Contextual menu shown at the cursor when the object is clicked. If any
   *  item's `visibleIf` evaluates true (or has no `visibleIf`), the menu
   *  opens with the active items and the `onClick` trigger does NOT fire.
   *  Empty / all-hidden menus fall through to the existing `onClick` flow. */
  menu?: SceneObjectMenuItem[];
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

/** Place an overlay at a specific point and scale relative to its natural
 *  image dimensions. Alternative to `rect`; pick one. */
export interface OverlayPlace {
  /** Top edge of the image as a percentage of viewport height. */
  top: number;
  /** Left edge of the image as a percentage of viewport width. */
  left: number;
  /** Scale as a percentage of the image's natural pixel size. Defaults to 100
   *  (= render at natural size). Under 100 shrinks; above 100 enlarges. */
  scale?: number;
}

/** An image layered over the interaction's background. Keyed by `id` so it
 *  can be referenced by `addOverlay` / `removeOverlay`.
 *
 *  Sizing/positioning — pick one of:
 *    - `rect` (percentages of viewport): the image fits inside the rect with
 *      its aspect ratio preserved (`object-fit: contain`). Default when both
 *      are omitted: full coverage `{ x: 0, y: 0, w: 100, h: 100 }`.
 *    - `place` (top/left percentages + scale percentage of natural size): the
 *      image renders at `scale%` of its natural pixel dimensions, anchored at
 *      `(left%, top%)` from the top-left of the viewport.
 *
 *  `transition` controls how the overlay enters and leaves; only `'fade'` is
 *  wired up today, the field is open-ended so other types can be added later. */
export interface Overlay {
  id: string;
  image: string;
  rect?: Rect;
  place?: OverlayPlace;
  /** Stacking depth. Higher renders on top. Defaults to `0`. Overlays with
   *  equal `z` paint in the order they appear in the list (so `addOverlay`
   *  with no `z` lands above same-z neighbours added before it). */
  z?: number;
  transition?: 'fade';
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
  /** When true, the location icon for this interaction is emphasised with a
   *  pulsing glow while this interaction is the currently-qualifying one at
   *  its location. Use sparingly — it signals "the story is here now". */
  highlight?: boolean;
  background?: string;
  /** Named ambient effects layered over the background, e.g. "lamp-flicker". */
  animations?: string[];
  /** Initial image overlays layered over the background. Each may be replaced,
   *  removed, or augmented at runtime via `setInteractionVisuals`. */
  overlays?: Overlay[];
  /** Inline dialog auto-started when the interaction begins. The dialog's `id`
   *  is used for runtime state (and made discoverable to `startDialog` lookups
   *  via the loader's extraction step). */
  dialog?: Dialog;
  onEnter?: Action[];
  onExit?: Action[];
}

export type PatientId = string;

export interface PatientDef {
  name: string;
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
  /** Button label for `choices`; optional for `nochoice` (when omitted the
   *  player-choice echo `> ...` is suppressed). The validator enforces a
   *  non-empty string for any entry in a `choices` array. */
  text?: string;
  /** Hide this choice unless the condition holds. (Not meaningful on `nochoice`.) */
  visibleIf?: Condition;
  actions?: Action[];
  /** Advance to a node in the same dialog after running actions. */
  next?: string;
}

export interface DialogNode {
  text: string;
  speaker?: string;
  /** Override the narration kind used when this node's text is pushed to the
   *  log. Defaults to `"dialog"`. Use `"inner"` for internal monologue, etc. */
  kind?: NarrationKind;
  /** Actions to run when this node becomes active. They fire AFTER the node's
   *  text is pushed to the narration log and BEFORE the player sees the
   *  choices — so they can pause for reading (`wait`), shift visuals
   *  (`setInteractionVisuals`), set flags, or interleave further narration
   *  before the player is asked to pick. */
  onEnter?: Action[];
  /** Choices the player can pick from. Mutually exclusive with `nochoice`. */
  choices?: DialogChoice[];
  /** A single choice that fires automatically after `onEnter` completes — used
   *  for linear monologue beats where you don't want a button. If `text` is
   *  omitted, the `> ...` player-choice echo is suppressed entirely.
   *  Mutually exclusive with `choices`; the validator requires exactly one. */
  nochoice?: DialogChoice;
}

export interface Dialog {
  /** Globally unique dialog id. Optional for inline dialogs declared on a
   *  mansion interaction (`interaction.dialog`) — when omitted, the loader
   *  auto-allocates `__inline_<interactionId>`. Required for top-level
   *  dialogs (in dream files) since those are looked up by id via
   *  `startDialog`. */
  id?: string;
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
   *  for inventory or any non-flag initial state. Patient runtime state can
   *  be pre-seeded here too — primarily used by debug profiles to land the
   *  player past a patient's introduction with that patient already in
   *  residence. */
  initialState?: {
    flags?: Record<string, unknown>;
    inventory?: string[];
    patientState?: Record<PatientId, Partial<PatientRuntimeState>>;
    /** Seed the engine's `activePatientId` — primarily used by debug profiles
     *  that boot the player directly into a dream scene without going through
     *  the `enterDream` action. */
    activePatientId?: PatientId;
    /** Seed the engine's `preDreamNarration` snapshot — used in tandem with
     *  `activePatientId` so the eventual wake restores cleanly to the
     *  authored mansion log (or an empty log for dream-only debug profiles). */
    preDreamNarration?: NarrationEntry[];
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
  /** Case files: composed from `src/config/main/cases.json` and per-patient
   *  `src/config/adventures/<patientId>.cases.json`. Markdown content is
   *  pre-resolved into `documents[].content` at load time. */
  caseFiles?: CaseFile[];
}

// ---------------------------------------------------------------------------
// Case files
//
// Authored as separate JSON files (one mansion-wide, one per dream patient).
// Each case file declares metadata + a list of markdown documents referenced
// by path. The loader resolves each path against `src/config/**/*.md` and
// bakes the string content into the runtime `CaseFile` so the engine never
// touches paths after load. Availability is decided per-case AND per-document
// by an optional `Condition` (same shape as `visibleIf`).
// ---------------------------------------------------------------------------

/** A single markdown document inside a case file. Authored shape. */
export interface CaseDocumentDef {
  /** Unique within the owning case. */
  id: string;
  label: string;
  /** Path to a `.md` file relative to `src/config/`. */
  path: string;
  /** Hide unless the condition holds. */
  availableIf?: Condition;
}

/** A case file. Authored shape (metadata only; document content lives in .md). */
export interface CaseFileDef {
  /** Globally unique across mansion + all dream case files. */
  id: string;
  label: string;
  subtitle?: string;
  /** Hide unless the condition holds. Dream-sourced cases get an implicit
   *  patient-availability gate AND-ed in at load time. */
  availableIf?: Condition;
  documents: CaseDocumentDef[];
}

/** Schema for `src/config/main/cases.json` and per-patient
 *  `src/config/adventures/<patientId>.cases.json`. */
export interface CasesConfig {
  cases: CaseFileDef[];
}

/** Runtime case file consumed by the engine — markdown content is already
 *  resolved. The Vue UI iterates this shape directly. */
export interface CaseFile {
  id: string;
  label: string;
  subtitle?: string;
  availableIf?: Condition;
  documents: Array<{
    id: string;
    label: string;
    availableIf?: Condition;
    content: string;
  }>;
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
  /** Snapshot of the narration log taken at the moment of `enterDream`. The
   *  log is cleared on dream entry and restored from this snapshot on wake,
   *  so the dream's own narration doesn't bleed back into the mansion log.
   *  `null` outside a dream session. */
  preDreamNarration: NarrationEntry[] | null;
  /** Patient ID currently undergoing a session, or null in the hub. */
  activePatientId: PatientId | null;
  /** Per-patient runtime state; populated lazily. */
  patientState: Record<PatientId, PatientRuntimeState>;
  /** Active dialog, or null if no dialog is in progress. */
  dialogState: { dialogId: string; nodeId: string } | null;
  /** Runtime override for the active interaction's background. Null means
   *  "use the interaction's authored background". Cleared automatically on
   *  enter/exit interaction so it never leaks. */
  interactionBackgroundOverride: string | null;
  /** Runtime override for the active interaction's animation list. Null means
   *  "use the interaction's authored animations". Cleared automatically on
   *  enter/exit interaction. */
  interactionAnimationsOverride: string[] | null;
  /** Runtime override for the active interaction's overlay images. Null means
   *  "use the interaction's authored overlays". Cleared on enter/exit
   *  interaction. */
  interactionOverlaysOverride: Overlay[] | null;
}

/** Visual treatment for a narration line. The renderer keys off this to colour
 *  / style the entry. Authors set it on a `narrate` action via its `kind`
 *  field, or on a dialog node via its `kind` field. */
export type NarrationKind = 'narration' | 'dialog' | 'inner' | 'system';

export interface NarrationEntry {
  id: number;
  kind: NarrationKind;
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
  /** Mansion interactions. Ordered: first qualifying interaction at a location wins.
   *  Mansion dialogs are declared **inline** on the owning interaction via
   *  `interaction.dialog` — there is no top-level dialog registry in the mansion
   *  config. Dream-only dialogs live in the dream files. */
  interactions?: Interaction[];
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
