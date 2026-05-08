import { reactive, computed, type ComputedRef } from 'vue';
import type {
  Action,
  Adventure,
  Dialog,
  DialogChoice,
  DialogNode,
  GameState,
  NarrationEntry,
  Scene,
  SceneObject,
} from '../types';
import { registerBuiltInActions, runActions } from './actions';
import { evaluateCondition, registerBuiltInConditions } from './conditions';
import type { ActionContext } from './registry';

/**
 * GameEngine ties together adventure data, mutable state, and the registries.
 *
 * NOTE: `state.objectState` is keyed by `SceneObject.id` alone, so object ids
 * must be globally unique across scenes. Reusing an id in two scenes will
 * cause hide/show overrides to leak between them. Dream scenes especially
 * rely on this — re-entering a dream relies on per-object ids being stable
 * across sessions so found/altered things stay found/altered.
 */
export class GameEngine {
  readonly adventure: Adventure;
  readonly state: GameState;
  readonly currentScene: ComputedRef<Scene>;
  readonly visibleObjects: ComputedRef<SceneObject[]>;
  readonly activeDialog: ComputedRef<Dialog | null>;
  readonly activeDialogNode: ComputedRef<DialogNode | null>;
  readonly availableChoices: ComputedRef<DialogChoice[]>;
  /** Optional callback fired after top-level state changes; used for autosave. */
  onPersist: (() => void) | null = null;
  private narrationCounter = 0;

  constructor(adventure: Adventure) {
    this.adventure = adventure;
    const initial = adventure.initialState ?? {};
    this.state = reactive<GameState>({
      currentSceneId: adventure.startScene,
      flags: { ...(initial.flags ?? {}) },
      inventory: [...(initial.inventory ?? [])],
      objectState: {},
      narration: [],
      activePatientId: null,
      patientState: {},
      dialogState: null,
    });

    this.currentScene = computed(() => {
      const scene = adventure.scenes[this.state.currentSceneId];
      if (!scene) {
        throw new Error(`Unknown scene: ${this.state.currentSceneId}`);
      }
      return scene;
    });

    this.visibleObjects = computed(() => {
      const scene = this.currentScene.value;
      const ctx: ActionContext = { engine: this };
      return (scene.objects ?? []).filter((obj) => {
        const override = this.state.objectState[obj.id];
        if (override?.hidden) return false;
        if (override?.hidden !== false && obj.initiallyHidden) return false;
        if (obj.visibleIf && !evaluateCondition(obj.visibleIf, { ...ctx, object: obj })) {
          return false;
        }
        return true;
      });
    });

    this.activeDialog = computed(() => {
      const ds = this.state.dialogState;
      if (!ds) return null;
      return adventure.dialogs?.[ds.dialogId] ?? null;
    });

    this.activeDialogNode = computed(() => {
      const dialog = this.activeDialog.value;
      const ds = this.state.dialogState;
      if (!dialog || !ds) return null;
      return dialog.nodes[ds.nodeId] ?? null;
    });

    this.availableChoices = computed(() => {
      const node = this.activeDialogNode.value;
      if (!node?.choices) return [];
      const ctx: ActionContext = { engine: this };
      return node.choices.filter((c) => !c.visibleIf || evaluateCondition(c.visibleIf, ctx));
    });
  }

  pushNarration(entry: Omit<NarrationEntry, 'id'>): void {
    this.state.narration.push({ ...entry, id: ++this.narrationCounter });
  }

  /** Returns the current patient's runtime state, lazily creating it. */
  ensurePatientState(id: string): GameState['patientState'][string] {
    let entry = this.state.patientState[id];
    if (!entry) {
      entry = { status: 'pending', sessionsCompleted: 0, notes: [] };
      this.state.patientState[id] = entry;
    }
    return entry;
  }

  async enterScene(id: string): Promise<void> {
    const previous = this.adventure.scenes[this.state.currentSceneId];
    if (previous?.onExit) {
      await runActions(previous.onExit, { engine: this });
    }
    const next = this.adventure.scenes[id];
    if (!next) {
      console.warn(`[adventure-engine] Cannot goto unknown scene: ${id}`);
      return;
    }
    this.state.currentSceneId = id;
    if (next.description) {
      this.pushNarration({ kind: 'narration', text: next.description });
    }
    await runActions(next.onEnter, { engine: this });
    this.persist();
  }

  /** Run a trigger (e.g. "onClick") for an object. */
  async fireTrigger(object: SceneObject, trigger: string): Promise<void> {
    const actions: Action[] | undefined = object.triggers?.[trigger];
    if (!actions || actions.length === 0) return;
    await runActions(actions, { engine: this, object, trigger });
    this.persist();
  }

  /** Player picked a dialog choice. Runs its actions and advances or ends. */
  async chooseDialogOption(index: number): Promise<void> {
    const node = this.activeDialogNode.value;
    const choices = this.availableChoices.value;
    const choice = choices[index];
    if (!node || !choice) return;
    this.pushNarration({ kind: 'dialog', text: `> ${choice.text}` });
    if (choice.actions) {
      await runActions(choice.actions, { engine: this });
    }
    if (this.state.dialogState && choice.next) {
      this.state.dialogState = { ...this.state.dialogState, nodeId: choice.next };
      this.emitCurrentDialogNode();
    } else if (
      this.state.dialogState &&
      !choice.next &&
      (!choice.actions || choice.actions.length === 0)
    ) {
      this.state.dialogState = null;
    }
    this.persist();
  }

  /** Push the active dialog node's text into the narration log. */
  emitCurrentDialogNode(): void {
    const node = this.activeDialogNode.value;
    if (!node) return;
    this.pushNarration({ kind: 'dialog', text: node.text, speaker: node.speaker });
  }

  /** Begin the adventure. Idempotent if state has been preserved by caller. */
  async start(): Promise<void> {
    const scene = this.currentScene.value;
    if (scene.description) {
      this.pushNarration({ kind: 'narration', text: scene.description });
    }
    await runActions(scene.onEnter, { engine: this });
    this.persist();
  }

  /** Notify the persistence layer that state changed. */
  persist(): void {
    this.onPersist?.();
  }

  /** Snapshot of all mutable state for saving. Schema-versioned, JSON-safe. */
  serialize(): EngineSnapshot {
    return jsonClone({
      schema: SCHEMA_VERSION,
      currentSceneId: this.state.currentSceneId,
      flags: this.state.flags,
      inventory: this.state.inventory,
      objectState: this.state.objectState,
      narration: this.state.narration,
      narrationCounter: this.narrationCounter,
      activePatientId: this.state.activePatientId,
      patientState: this.state.patientState,
      dialogState: this.state.dialogState,
    });
  }

  /** Restore state from a snapshot. Mismatched schema versions are rejected. */
  restore(snapshot: EngineSnapshot): boolean {
    if (snapshot.schema !== SCHEMA_VERSION) return false;
    const cloned = jsonClone(snapshot);
    this.state.currentSceneId = cloned.currentSceneId;
    this.state.flags = cloned.flags;
    this.state.inventory = cloned.inventory;
    this.state.objectState = cloned.objectState;
    this.state.narration = cloned.narration;
    this.narrationCounter = cloned.narrationCounter;
    this.state.activePatientId = cloned.activePatientId;
    this.state.patientState = cloned.patientState;
    this.state.dialogState = cloned.dialogState;
    return true;
  }
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const SCHEMA_VERSION = 1;

export interface EngineSnapshot {
  schema: number;
  currentSceneId: string;
  flags: Record<string, unknown>;
  inventory: string[];
  objectState: GameState['objectState'];
  narration: NarrationEntry[];
  narrationCounter: number;
  activePatientId: GameState['activePatientId'];
  patientState: GameState['patientState'];
  dialogState: GameState['dialogState'];
}

let registriesInitialised = false;

/** Initialise built-in action and condition handlers. Safe to call repeatedly. */
export function ensureBuiltInsRegistered(): void {
  if (registriesInitialised) return;
  registerBuiltInActions();
  registerBuiltInConditions();
  registriesInitialised = true;
}
