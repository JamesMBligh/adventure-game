import { reactive, computed, type ComputedRef } from 'vue';
import type {
  Action,
  Adventure,
  Dialog,
  DialogChoice,
  DialogNode,
  GameState,
  Interaction,
  NarrationEntry,
  Scene,
  SceneObject,
  Site,
  SiteLocation,
} from '../types';
import { registerBuiltInActions, runActions } from './actions';
import { evaluateCondition, registerBuiltInConditions } from './conditions';
import type { ActionContext } from './registry';

/**
 * GameEngine ties together adventure data, mutable state, and the registries.
 *
 * State has two mutually-exclusive modes:
 *   - Mansion: currentSiteId is set (and optionally activeInteractionId);
 *     currentSceneId is null.
 *   - Scene (dream / legacy hub): currentSceneId is set; mansion fields null.
 *
 * NOTE: `state.objectState` is keyed by `SceneObject.id` alone, so object ids
 * must be globally unique across scenes. Reusing an id in two scenes will
 * cause hide/show overrides to leak between them.
 */
export class GameEngine {
  readonly adventure: Adventure;
  readonly state: GameState;
  readonly currentScene: ComputedRef<Scene | null>;
  readonly currentSite: ComputedRef<Site | null>;
  readonly activeInteraction: ComputedRef<Interaction | null>;
  readonly visibleObjects: ComputedRef<SceneObject[]>;
  readonly visibleLocations: ComputedRef<Array<{ id: string; location: SiteLocation }>>;
  readonly activeDialog: ComputedRef<Dialog | null>;
  readonly activeDialogNode: ComputedRef<DialogNode | null>;
  readonly availableChoices: ComputedRef<DialogChoice[]>;
  onPersist: (() => void) | null = null;
  private narrationCounter = 0;

  constructor(adventure: Adventure) {
    this.adventure = adventure;
    const initial = adventure.initialState ?? {};
    const flagDefaults: Record<string, unknown> = {};
    for (const [name, def] of Object.entries(adventure.flags ?? {})) {
      flagDefaults[name] = def.default;
    }
    this.state = reactive<GameState>({
      currentSceneId: adventure.startSite ? null : (adventure.startScene ?? null),
      currentSiteId: adventure.startSite ?? null,
      activeInteractionId: adventure.startInteraction ?? null,
      flags: { ...flagDefaults, ...(initial.flags ?? {}) },
      inventory: [...(initial.inventory ?? [])],
      objectState: {},
      narration: [],
      activePatientId: null,
      patientState: {},
      dialogState: null,
    });

    this.currentScene = computed(() => {
      const id = this.state.currentSceneId;
      if (!id) return null;
      return adventure.scenes?.[id] ?? null;
    });

    this.currentSite = computed(() => {
      const id = this.state.currentSiteId;
      if (!id) return null;
      return adventure.sites?.[id] ?? null;
    });

    this.activeInteraction = computed(() => {
      const id = this.state.activeInteractionId;
      if (!id) return null;
      return adventure.interactions?.find((it) => it.id === id) ?? null;
    });

    this.visibleObjects = computed(() => {
      const scene = this.currentScene.value;
      if (!scene) return [];
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

    this.visibleLocations = computed(() => {
      const site = this.currentSite.value;
      if (!site) return [];
      return computeVisibleLocations(adventure, this.state, site);
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

  ensurePatientState(id: string): GameState['patientState'][string] {
    let entry = this.state.patientState[id];
    if (!entry) {
      entry = { status: 'pending', sessionsCompleted: 0, notes: [] };
      this.state.patientState[id] = entry;
    }
    return entry;
  }

  async enterScene(id: string): Promise<void> {
    const prevSceneId = this.state.currentSceneId;
    const previous = prevSceneId ? this.adventure.scenes?.[prevSceneId] : null;
    if (previous?.onExit) {
      await runActions(previous.onExit, { engine: this });
    }
    const next = this.adventure.scenes?.[id];
    if (!next) {
      console.warn(`[adventure-engine] Cannot goto unknown scene: ${id}`);
      return;
    }
    this.state.currentSceneId = id;
    this.state.currentSiteId = null;
    this.state.activeInteractionId = null;
    if (next.description) {
      this.pushNarration({ kind: 'narration', text: next.description });
    }
    await runActions(next.onEnter, { engine: this });
    this.persist();
  }

  /** Enter a mansion site. Clears any active interaction and dream scene. */
  async enterSite(id: string): Promise<void> {
    const prevSiteId = this.state.currentSiteId;
    if (this.state.activeInteractionId) {
      await this.exitInteraction({ persist: false });
    }
    const previous = prevSiteId ? this.adventure.sites?.[prevSiteId] : null;
    if (previous && previous !== this.adventure.sites?.[id] && previous.onExit) {
      await runActions(previous.onExit, { engine: this });
    }
    const next = this.adventure.sites?.[id];
    if (!next) {
      console.warn(`[adventure-engine] Cannot enter unknown site: ${id}`);
      return;
    }
    this.state.currentSiteId = id;
    this.state.currentSceneId = null;
    if (next.description) {
      this.pushNarration({ kind: 'narration', text: next.description });
    }
    await runActions(next.onEnter, { engine: this });
    this.persist();
  }

  /** Start a mansion interaction. Sets `currentSiteId` from the interaction's
   *  location if necessary, runs `onEnter`, and auto-starts its dialog. */
  async enterInteraction(id: string): Promise<void> {
    const interaction = this.adventure.interactions?.find((it) => it.id === id);
    if (!interaction) {
      console.warn(`[adventure-engine] Unknown interaction: ${id}`);
      return;
    }
    const siteId = findSiteForLocation(this.adventure, interaction.location);
    if (!siteId) {
      console.warn(
        `[adventure-engine] Interaction "${id}" references location "${interaction.location}" which is not in any site`,
      );
      return;
    }
    this.state.currentSiteId = siteId;
    this.state.currentSceneId = null;
    this.state.activeInteractionId = id;
    if (interaction.onEnter) {
      await runActions(interaction.onEnter, { engine: this });
    }
    if (interaction.dialog && !this.state.dialogState) {
      await runActions([{ type: 'startDialog', dialog: interaction.dialog }], { engine: this });
    }
    this.persist();
  }

  /** End the active interaction; return to the current site's floor plan. */
  async exitInteraction(opts: { persist?: boolean } = {}): Promise<void> {
    const id = this.state.activeInteractionId;
    if (!id) return;
    const interaction = this.adventure.interactions?.find((it) => it.id === id);
    this.state.activeInteractionId = null;
    if (this.state.dialogState) this.state.dialogState = null;
    if (interaction?.onExit) {
      await runActions(interaction.onExit, { engine: this });
    }
    if (opts.persist !== false) this.persist();
  }

  /** Run a trigger (e.g. "onClick") for an object. */
  async fireTrigger(object: SceneObject, trigger: string): Promise<void> {
    const actions: Action[] | undefined = object.triggers?.[trigger];
    if (!actions || actions.length === 0) return;
    await runActions(actions, { engine: this, object, trigger });
    this.persist();
  }

  /** Click a location on a site's floor plan. Transitions if `target` is set,
   *  else starts the first qualifying interaction. */
  async clickLocation(locationId: string): Promise<void> {
    const site = this.currentSite.value;
    if (!site) return;
    const loc = site.locations[locationId];
    if (!loc) return;
    if (loc.target) {
      await this.enterSite(loc.target);
      return;
    }
    const interaction = pickInteraction(this.adventure, this.state, locationId);
    if (!interaction) return;
    await this.enterInteraction(interaction.id);
  }

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
    if (this.state.dialogState === null && this.state.activeInteractionId !== null) {
      await this.exitInteraction({ persist: false });
    }
    this.persist();
  }

  emitCurrentDialogNode(): void {
    const node = this.activeDialogNode.value;
    if (!node) return;
    this.pushNarration({ kind: 'dialog', text: node.text, speaker: node.speaker });
  }

  /** Begin the adventure. Idempotent if state has been preserved by caller. */
  async start(): Promise<void> {
    if (this.state.activeInteractionId) {
      const id = this.state.activeInteractionId;
      this.state.activeInteractionId = null;
      await this.enterInteraction(id);
      return;
    }
    if (this.state.currentSiteId) {
      const id = this.state.currentSiteId;
      this.state.currentSiteId = null;
      await this.enterSite(id);
      return;
    }
    if (this.state.currentSceneId) {
      const id = this.state.currentSceneId;
      this.state.currentSceneId = null;
      await this.enterScene(id);
      return;
    }
  }

  persist(): void {
    this.onPersist?.();
  }

  serialize(): EngineSnapshot {
    return jsonClone({
      schema: SCHEMA_VERSION,
      currentSceneId: this.state.currentSceneId,
      currentSiteId: this.state.currentSiteId,
      activeInteractionId: this.state.activeInteractionId,
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

  restore(snapshot: EngineSnapshot): boolean {
    if (snapshot.schema !== SCHEMA_VERSION) return false;
    const cloned = jsonClone(snapshot);
    this.state.currentSceneId = cloned.currentSceneId;
    this.state.currentSiteId = cloned.currentSiteId;
    this.state.activeInteractionId = cloned.activeInteractionId;
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

function findSiteForLocation(adventure: Adventure, locationId: string): string | null {
  for (const [siteId, site] of Object.entries(adventure.sites ?? {})) {
    if (site.locations[locationId]) return siteId;
  }
  return null;
}

function interactionQualifies(
  adventure: Adventure,
  state: GameState,
  interaction: Interaction,
  engine?: GameEngine,
): boolean {
  if (!interaction.conditions || interaction.conditions.length === 0) return true;
  const ctx: ActionContext = engine
    ? { engine }
    : { engine: { state, adventure } as unknown as GameEngine };
  return interaction.conditions.every((c) => evaluateCondition(c, ctx));
}

function pickInteraction(
  adventure: Adventure,
  state: GameState,
  locationId: string,
): Interaction | null {
  for (const interaction of adventure.interactions ?? []) {
    if (interaction.location !== locationId) continue;
    if (interactionQualifies(adventure, state, interaction)) return interaction;
  }
  return null;
}

/** Walks the site graph to decide which locations on the current site should
 *  render. Hidden when:
 *    - non-transition with no qualifying interaction
 *    - transition whose target site (and everywhere it leads via further
 *      transitions) has no currently-qualifying interaction. Back-links don't
 *      count as "content" — only real interactions do.
 *  Exception: a transition back to `startSite` is always shown when the player
 *  is not already on `startSite`, so the player can never become stranded. */
function computeVisibleLocations(
  adventure: Adventure,
  state: GameState,
  site: Site,
): Array<{ id: string; location: SiteLocation }> {
  const startSite = adventure.startSite;
  const currentSiteId = state.currentSiteId;
  const seen = new Set<string>();

  const hasReachableInteraction = (siteId: string): boolean => {
    if (seen.has(siteId)) return false;
    seen.add(siteId);
    const s = adventure.sites?.[siteId];
    if (!s) return false;
    for (const [locId, loc] of Object.entries(s.locations)) {
      if (loc.target) {
        if (hasReachableInteraction(loc.target)) return true;
      } else {
        if (pickInteraction(adventure, state, locId)) return true;
      }
    }
    return false;
  };

  const result: Array<{ id: string; location: SiteLocation }> = [];
  for (const [id, location] of Object.entries(site.locations)) {
    if (location.target) {
      // Safety net: from any non-start site, a transition home is always shown.
      if (location.target === startSite && currentSiteId !== startSite) {
        result.push({ id, location });
        continue;
      }
      // Otherwise the target site must have a currently-qualifying interaction
      // somewhere in its reachable graph. Seeding `seen` with the current site
      // prevents back-links from cycling through it and falsely counting our
      // own interactions toward the target's "has content" verdict.
      seen.clear();
      if (currentSiteId) seen.add(currentSiteId);
      if (hasReachableInteraction(location.target)) {
        result.push({ id, location });
      }
    } else {
      if (pickInteraction(adventure, state, id)) {
        result.push({ id, location });
      }
    }
  }
  return result;
}

export const SCHEMA_VERSION = 3;

export interface EngineSnapshot {
  schema: number;
  currentSceneId: GameState['currentSceneId'];
  currentSiteId: GameState['currentSiteId'];
  activeInteractionId: GameState['activeInteractionId'];
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

export function ensureBuiltInsRegistered(): void {
  if (registriesInitialised) return;
  registerBuiltInActions();
  registerBuiltInConditions();
  registriesInitialised = true;
}
