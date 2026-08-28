import { reactive, computed, ref, type ComputedRef, type Ref } from 'vue';
import type {
  Action,
  Adventure,
  CaseFile,
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
  readonly visibleLocations: ComputedRef<
    Array<{ id: string; location: SiteLocation; highlight: boolean }>
  >;
  readonly activeDialog: ComputedRef<Dialog | null>;
  readonly activeDialogNode: ComputedRef<DialogNode | null>;
  readonly availableChoices: ComputedRef<DialogChoice[]>;
  /** Case files currently visible to the player: each entry's `availableIf`
   *  has been evaluated against current state. Dream-sourced cases include
   *  an implicit patient-availability gate (set up at load time). */
  readonly availableCaseFiles: ComputedRef<CaseFile[]>;
  /** Id of the active "click to continue" prompt entry, or null. Reactive so
   *  the UI can render an overlay + listener when set. Not persisted: a save
   *  taken mid-wait would resume the user wherever the action sequence last
   *  checkpointed (typically before the choice that triggered the wait). */
  readonly continueWaitId: Ref<number | null> = ref(null);
  /** Bumped each time the player asks to skip the current text reveal (panel
   *  click or spacebar). NarrationPanel watches this and completes its
   *  word-by-word animation immediately on any change. Not persisted. */
  readonly revealSkipTick: Ref<number> = ref(0);
  /** Re-entrant counter: > 0 whenever any `runActions(...)` call is in flight.
   *  Lets the UI distinguish "engine is mid-action-sequence" (e.g. parked in
   *  a `pause`, between narrates, between setInteractionVisuals calls) from
   *  "engine is settled, awaiting player input". Not persisted. */
  readonly actionDepth: Ref<number> = ref(0);
  /** Drives the hypnotic-spiral overlay shown when crossing the dream
   *  threshold (entering or exiting a dream). `phase` cycles `in → hold → out`
   *  while the engine swaps scenes underneath. `null` when idle. Not persisted —
   *  resuming a save lands the player directly in the relevant scene without
   *  replaying a transition. */
  readonly dreamTransition: Ref<{
    direction: 'entering' | 'exiting';
    phase: 'in' | 'hold' | 'out';
  } | null> = ref(null);
  onPersist: (() => void) | null = null;
  private narrationCounter = 0;
  private continueResolver: (() => void) | null = null;
  private revealSkipResolver: (() => void) | null = null;

  constructor(adventure: Adventure) {
    this.adventure = adventure;
    const initial = adventure.initialState ?? {};
    const flagDefaults: Record<string, unknown> = {};
    for (const [name, def] of Object.entries(adventure.flags ?? {})) {
      flagDefaults[name] = def.default;
    }
    const seededPatientState: GameState['patientState'] = {};
    for (const [id, partial] of Object.entries(initial.patientState ?? {})) {
      seededPatientState[id] = {
        status: partial.status ?? 'pending',
        sessionsCompleted: partial.sessionsCompleted ?? 0,
        notes: [...(partial.notes ?? [])],
      };
    }
    this.state = reactive<GameState>({
      currentSceneId: adventure.startSite ? null : (adventure.startScene ?? null),
      currentSiteId: adventure.startSite ?? null,
      activeInteractionId: adventure.startInteraction ?? null,
      flags: { ...flagDefaults, ...(initial.flags ?? {}) },
      inventory: [...(initial.inventory ?? [])],
      objectState: {},
      narration: [],
      // Debug profiles can boot directly into a dream by seeding the snapshot
      // and the active patient. When `preDreamNarration` is omitted but the
      // profile lands inside a dream scene, the wake restore is a no-op —
      // which is usually what the author wants for a dream-only debug entry.
      preDreamNarration: initial.preDreamNarration
        ? [...initial.preDreamNarration]
        : null,
      activePatientId: initial.activePatientId ?? null,
      patientState: seededPatientState,
      dialogState: null,
      interactionBackgroundOverride: null,
      interactionAnimationsOverride: null,
      interactionOverlaysOverride: null,
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

    this.availableCaseFiles = computed(() => {
      const all = adventure.caseFiles ?? [];
      const ctx: ActionContext = { engine: this };
      return all.filter((c) => evaluateCondition(c.availableIf, ctx));
    });
  }

  /** True when the document's optional `availableIf` is satisfied. */
  isDocumentAvailable(doc: CaseFile['documents'][number]): boolean {
    return evaluateCondition(doc.availableIf, { engine: this });
  }

  pushNarration(entry: Omit<NarrationEntry, 'id'>): void {
    this.state.narration.push({ ...entry, id: ++this.narrationCounter });
  }

  /** Block an action sequence for the duration of a narration entry's
   *  word-by-word reveal. Callers push the entry first, then await this so the
   *  next action doesn't fire before the player has had time to read.
   *  The duration mirrors NarrationPanel's reveal timing: `wordCount * REVEAL_MS`.
   *  The wait is interruptible via `skipReveal()` — when the player asks to
   *  skip, the timer is cleared and the promise resolves immediately. */
  awaitTextReveal(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return Promise.resolve();
    const wordCount = trimmed.split(/\s+/).length;
    const ms = wordCount * wordRevealMs;
    if (ms <= 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      // Defensive: if a prior reveal somehow left a resolver pending, fire
      // it first so it cleans up its own timer.
      this.revealSkipResolver?.();
      const timer = setTimeout(() => {
        this.revealSkipResolver = null;
        resolve();
      }, ms);
      this.revealSkipResolver = () => {
        clearTimeout(timer);
        this.revealSkipResolver = null;
        resolve();
      };
    });
  }

  /** Player-requested skip of the current text reveal. Resolves any pending
   *  `awaitTextReveal` so the action sequence advances, and bumps
   *  `revealSkipTick` so the UI completes its word-by-word animation. */
  skipReveal(): void {
    this.revealSkipResolver?.();
    this.revealSkipTick.value++;
  }

  /** Push a "click to continue" prompt and return a promise that resolves
   *  when `continueWait()` is called (by user click or keypress). The prompt
   *  entry is removed from the narration log on continue. */
  waitForContinue(): Promise<void> {
    // Defensive: clear any prior pending wait (shouldn't happen since action
    // lists are awaited sequentially, but if it does we don't want a dangling
    // promise + orphan prompt).
    this.continueResolver?.();

    this.pushNarration({ kind: 'system', text: 'Click to continue…' });
    const promptId = this.state.narration[this.state.narration.length - 1]!.id;
    this.continueWaitId.value = promptId;

    return new Promise<void>((resolve) => {
      this.continueResolver = () => {
        const idx = this.state.narration.findIndex((e) => e.id === promptId);
        if (idx >= 0) this.state.narration.splice(idx, 1);
        this.continueWaitId.value = null;
        this.continueResolver = null;
        resolve();
      };
    });
  }

  /**
   * Drive the dream-threshold overlay: fade the hypnotic spiral in, do the
   * scene change underneath while it's fully opaque, hold, then fade out.
   * The UI watches `dreamTransition` to render the spiral and key off `phase`
   * for opacity / colour theming.
   *
   * Timing is centralised in `getDreamTransitionFadeMs / HoldMs` so the CSS
   * and the engine stay in lockstep.
   */
  async runDreamTransition(
    direction: 'entering' | 'exiting',
    work: () => Promise<void>,
  ): Promise<void> {
    const fadeMs = getDreamTransitionFadeMs();
    const holdMs = getDreamTransitionHoldMs();
    this.dreamTransition.value = { direction, phase: 'in' };
    await delay(fadeMs);
    this.dreamTransition.value = { direction, phase: 'hold' };
    await work();
    await delay(holdMs);
    this.dreamTransition.value = { direction, phase: 'out' };
    await delay(fadeMs);
    this.dreamTransition.value = null;
  }

  /**
   * Snapshot the current narration log into `state.preDreamNarration` and
   * clear `state.narration`. Called at dream-entry time so the dream starts
   * with an empty log; the mansion log is restored on wake. Defensive: if a
   * snapshot is already present (nested dreams, malformed authoring), the
   * existing snapshot is preserved — only the first entry "wins".
   */
  snapshotNarrationForDream(): void {
    if (this.state.preDreamNarration === null) {
      this.state.preDreamNarration = this.state.narration.slice();
    }
    this.state.narration = [];
  }

  /**
   * Restore the snapshotted pre-dream narration log and clear the snapshot.
   * Called at wake time. No-op if no snapshot exists.
   */
  restoreNarrationAfterDream(): void {
    if (this.state.preDreamNarration === null) return;
    this.state.narration = this.state.preDreamNarration;
    this.state.preDreamNarration = null;
  }

  /** Resume a pending `wait` action. No-op if nothing is waiting. */
  continueWait(): void {
    this.continueResolver?.();
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
      await this.awaitTextReveal(next.description);
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
      await this.awaitTextReveal(next.description);
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
    // Fresh interaction → discard any visual overrides from a previous one.
    this.state.interactionBackgroundOverride = null;
    this.state.interactionAnimationsOverride = null;
    this.state.interactionOverlaysOverride = null;
    if (interaction.onEnter) {
      await runActions(interaction.onEnter, { engine: this });
    }
    // onEnter may have called exitInteraction (or otherwise cleared state).
    // Only auto-start the inline dialog if we're still inside this interaction.
    if (
      interaction.dialog &&
      !this.state.dialogState &&
      this.state.activeInteractionId === id
    ) {
      await runActions(
        [{ type: 'startDialog', dialog: interaction.dialog.id }],
        { engine: this },
      );
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
    // Visual overrides are bound to the interaction's lifetime.
    this.state.interactionBackgroundOverride = null;
    this.state.interactionAnimationsOverride = null;
    this.state.interactionOverlaysOverride = null;
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
    await this.executeChoice(choice);
    this.persist();
  }

  /** Execute a single dialog choice (used both by player picks via
   *  `chooseDialogOption` and by `nochoice` auto-advance inside
   *  `emitCurrentDialogNode`):
   *    - echo the choice as a `> ...` narration line (suppressed when text omitted)
   *    - run the choice's actions
   *    - advance to `next` node, OR end the dialog if no next & no actions
   *    - auto-exit the interaction if the dialog ended */
  private async executeChoice(choice: DialogChoice): Promise<void> {
    if (choice.text) {
      const echo = `> ${choice.text}`;
      this.pushNarration({ kind: 'dialog', text: echo });
      await this.awaitTextReveal(echo);
    }
    if (choice.actions) {
      await runActions(choice.actions, { engine: this });
    }
    if (this.state.dialogState && choice.next) {
      this.state.dialogState = { ...this.state.dialogState, nodeId: choice.next };
      await this.emitCurrentDialogNode();
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
  }

  /** Push the active node's text to the log, then run its `onEnter` actions.
   *  If the node uses `nochoice` (auto-advance), executes that choice as the
   *  final step. Async because every stage may suspend. */
  async emitCurrentDialogNode(): Promise<void> {
    const node = this.activeDialogNode.value;
    if (!node) return;
    this.pushNarration({
      kind: node.kind ?? 'dialog',
      text: node.text,
      speaker: node.speaker,
    });
    await this.awaitTextReveal(node.text);
    if (node.onEnter && node.onEnter.length > 0) {
      await runActions(node.onEnter, { engine: this });
    }
    if (node.nochoice) {
      await this.executeChoice(node.nochoice);
    }
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
      preDreamNarration: this.state.preDreamNarration,
      narrationCounter: this.narrationCounter,
      activePatientId: this.state.activePatientId,
      patientState: this.state.patientState,
      dialogState: this.state.dialogState,
      interactionBackgroundOverride: this.state.interactionBackgroundOverride,
      interactionAnimationsOverride: this.state.interactionAnimationsOverride,
      interactionOverlaysOverride: this.state.interactionOverlaysOverride,
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
    this.state.preDreamNarration = cloned.preDreamNarration ?? null;
    this.narrationCounter = cloned.narrationCounter;
    this.state.activePatientId = cloned.activePatientId;
    this.state.patientState = cloned.patientState;
    this.state.dialogState = cloned.dialogState;
    this.state.interactionBackgroundOverride = cloned.interactionBackgroundOverride ?? null;
    this.state.interactionAnimationsOverride = cloned.interactionAnimationsOverride ?? null;
    this.state.interactionOverlaysOverride = cloned.interactionOverlaysOverride ?? null;
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
): Array<{ id: string; location: SiteLocation; highlight: boolean }> {
  const startSite = adventure.startSite;
  const currentSiteId = state.currentSiteId;
  const seen = new Set<string>();

  // For transition icons (no interaction at the location itself), we still
  // want to surface "important content lives this way" so the player follows
  // the trail. A transition highlights iff any reachable site contains a
  // currently-qualifying interaction with `highlight: true`.
  const reachableHasHighlight = (siteId: string): boolean => {
    if (seen.has(siteId)) return false;
    seen.add(siteId);
    const s = adventure.sites?.[siteId];
    if (!s) return false;
    for (const [locId, loc] of Object.entries(s.locations)) {
      if (loc.target) {
        if (reachableHasHighlight(loc.target)) return true;
      } else {
        const it = pickInteraction(adventure, state, locId);
        if (it?.highlight) return true;
      }
    }
    return false;
  };

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

  const result: Array<{ id: string; location: SiteLocation; highlight: boolean }> = [];
  for (const [id, location] of Object.entries(site.locations)) {
    if (location.target) {
      // Safety net: from any non-start site, a transition home is always shown.
      if (location.target === startSite && currentSiteId !== startSite) {
        seen.clear();
        if (currentSiteId) seen.add(currentSiteId);
        const highlight = reachableHasHighlight(location.target);
        result.push({ id, location, highlight });
        continue;
      }
      // Otherwise the target site must have a currently-qualifying interaction
      // somewhere in its reachable graph. Seeding `seen` with the current site
      // prevents back-links from cycling through it and falsely counting our
      // own interactions toward the target's "has content" verdict.
      seen.clear();
      if (currentSiteId) seen.add(currentSiteId);
      if (hasReachableInteraction(location.target)) {
        seen.clear();
        if (currentSiteId) seen.add(currentSiteId);
        const highlight = reachableHasHighlight(location.target);
        result.push({ id, location, highlight });
      }
    } else {
      const it = pickInteraction(adventure, state, id);
      if (it) {
        result.push({ id, location, highlight: it.highlight === true });
      }
    }
  }
  return result;
}

export const SCHEMA_VERSION = 5;

/**
 * Per-word reveal duration in ms — single source of truth shared between the
 * engine (which awaits this duration after pushing text so subsequent actions
 * don't outrun the player's reading) and NarrationPanel (which advances one
 * word per tick). Defaults to 0 under Vitest so test suites don't slow to a
 * crawl on text-heavy flows; `setWordRevealMs(ms)` lets either side override.
 */
let wordRevealMs = import.meta.env?.MODE === 'test' ? 0 : 100;
export const getWordRevealMs = (): number => wordRevealMs;
export const setWordRevealMs = (ms: number): void => {
  wordRevealMs = Math.max(0, ms);
};

/**
 * Dream-transition timing in ms. The CSS in `DreamTransition.vue` is keyed
 * off these values via the component's own constants — keep them in sync if
 * you tweak the timing. Defaults to 0 under Vitest so tests that fire
 * `enterDream` / `wake` complete instantly.
 */
const _testMode = import.meta.env?.MODE === 'test';
let dreamTransitionFadeMs = _testMode ? 0 : 350;
let dreamTransitionHoldMs = _testMode ? 0 : 600;
export const getDreamTransitionFadeMs = (): number => dreamTransitionFadeMs;
export const getDreamTransitionHoldMs = (): number => dreamTransitionHoldMs;
export const setDreamTransitionTiming = (fadeMs: number, holdMs: number): void => {
  dreamTransitionFadeMs = Math.max(0, fadeMs);
  dreamTransitionHoldMs = Math.max(0, holdMs);
};

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export interface EngineSnapshot {
  schema: number;
  currentSceneId: GameState['currentSceneId'];
  currentSiteId: GameState['currentSiteId'];
  activeInteractionId: GameState['activeInteractionId'];
  flags: Record<string, unknown>;
  inventory: string[];
  objectState: GameState['objectState'];
  narration: NarrationEntry[];
  /** Optional on the wire — saves written before this field landed restore
   *  cleanly with `preDreamNarration` defaulting to null. */
  preDreamNarration?: NarrationEntry[] | null;
  narrationCounter: number;
  activePatientId: GameState['activePatientId'];
  patientState: GameState['patientState'];
  dialogState: GameState['dialogState'];
  interactionBackgroundOverride: GameState['interactionBackgroundOverride'];
  interactionAnimationsOverride: GameState['interactionAnimationsOverride'];
  interactionOverlaysOverride: GameState['interactionOverlaysOverride'];
}

let registriesInitialised = false;

export function ensureBuiltInsRegistered(): void {
  if (registriesInitialised) return;
  registerBuiltInActions();
  registerBuiltInConditions();
  registriesInitialised = true;
}
