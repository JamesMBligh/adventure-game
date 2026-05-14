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
  /** Story-mode rooms (location, floorplan) render in the mansion view tree;
   *  dream scenes run the point-and-click view. `hub` is retained for legacy
   *  fixtures (cabin.json) that still use the original hotspot layout. */
  kind?: 'hub' | 'dream' | 'location' | 'floorplan';
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
  author?: string;
  startScene: string;
  /** Initial flags / variables. Anything JSON-serialisable. */
  initialState?: {
    flags?: Record<string, unknown>;
    inventory?: string[];
  };
  /** Item catalog: id -> display info. */
  items?: Record<string, { name: string; description?: string; image?: string }>;
  scenes: Record<string, Scene>;
  /** Patients introduced by this adventure. */
  patients?: Record<PatientId, PatientDef>;
  /** Dialogs available for `startDialog` actions. */
  dialogs?: Record<string, Dialog>;
}

/** Mutable runtime state. */
export interface GameState {
  currentSceneId: string;
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
