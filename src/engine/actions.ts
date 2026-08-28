import type { Action, Condition, Overlay, PatientStatus } from '../types';
import { evaluateCondition } from './conditions';
import type { GameEngine } from './engine';
import { actionRegistry, actionValidatorRegistry, type ActionContext } from './registry';

/** Validate an Overlay shape and push any structural errors. Shared by the
 *  bulk-set (`overlays[]`) and single-add (`addOverlay`) paths. */
function validateOverlayShape(o: unknown, path: string, errs: string[]): void {
  if (!o || typeof o !== 'object') {
    errs.push(`${path} must be an Overlay object`);
    return;
  }
  const ov = o as Record<string, unknown>;
  if (typeof ov.id !== 'string' || !ov.id) {
    errs.push(`${path}.id must be a non-empty string`);
  }
  if (typeof ov.image !== 'string' || !ov.image) {
    errs.push(`${path}.image must be a non-empty string`);
  }
  if (ov.transition !== undefined && ov.transition !== 'fade') {
    errs.push(`${path}.transition must be "fade" if provided`);
  }
  if (ov.z !== undefined && typeof ov.z !== 'number') {
    errs.push(`${path}.z must be a number if provided`);
  }
  if (ov.rect !== undefined) {
    if (!ov.rect || typeof ov.rect !== 'object') {
      errs.push(`${path}.rect must be an object { x, y, w, h }`);
    } else {
      for (const k of ['x', 'y', 'w', 'h'] as const) {
        if (typeof (ov.rect as Record<string, unknown>)[k] !== 'number') {
          errs.push(`${path}.rect.${k} must be a number`);
        }
      }
    }
  }
  if (ov.place !== undefined) {
    if (!ov.place || typeof ov.place !== 'object') {
      errs.push(`${path}.place must be an object { top, left, scale? }`);
    } else {
      const p = ov.place as Record<string, unknown>;
      if (typeof p.top !== 'number') errs.push(`${path}.place.top must be a number`);
      if (typeof p.left !== 'number') errs.push(`${path}.place.left must be a number`);
      if (p.scale !== undefined && typeof p.scale !== 'number') {
        errs.push(`${path}.place.scale must be a number if provided`);
      }
    }
  }
  if (ov.rect !== undefined && ov.place !== undefined) {
    errs.push(`${path} cannot specify both "rect" and "place" — pick one`);
  }
}

/** The current effective overlay list for the active interaction: the runtime
 *  override if set, otherwise the interaction's authored `overlays`, otherwise
 *  empty. Returns a fresh array so callers can mutate freely. */
function effectiveOverlays(engine: GameEngine): Overlay[] {
  const override = engine.state.interactionOverlaysOverride;
  if (override) return override.map((o) => ({ ...o }));
  const authored = engine.activeInteraction.value?.overlays;
  return authored ? authored.map((o) => ({ ...o })) : [];
}

async function wakeTo(
  engine: GameEngine,
  target: { interaction?: unknown; scene?: unknown },
): Promise<void> {
  if (typeof target.interaction === 'string' && target.interaction) {
    await engine.enterInteraction(target.interaction);
    return;
  }
  if (typeof target.scene === 'string' && target.scene) {
    await engine.enterScene(target.scene);
    return;
  }
  if (engine.adventure.startScene) {
    await engine.enterScene(engine.adventure.startScene);
  } else if (engine.adventure.startSite) {
    await engine.enterSite(engine.adventure.startSite);
  }
}

const VALID_PATIENT_STATUSES: PatientStatus[] = [
  'pending',
  'inResidence',
  'improving',
  'healed',
  'unhelped',
  'departed',
];

/** Run a list of actions sequentially. Each action may be async.
 *  Maintains `engine.actionDepth` as a re-entrant counter so the UI can tell
 *  when the engine is mid-sequence (and therefore not ready to show choices). */
export async function runActions(actions: Action[] | undefined, ctx: ActionContext): Promise<void> {
  if (!actions || actions.length === 0) return;
  ctx.engine.actionDepth.value++;
  try {
    for (const action of actions) {
      const handler = actionRegistry.get(action.type);
      if (!handler) {
        const parts: string[] = [];
        if (ctx.object?.id) parts.push(`object="${ctx.object.id}"`);
        if (ctx.trigger) parts.push(`trigger="${ctx.trigger}"`);
        const where = parts.length ? ` (at ${parts.join(', ')})` : '';
        console.warn(`[adventure-engine] Unknown action type: ${action.type}${where}`);
        continue;
      }
      await handler(action, ctx);
    }
  } finally {
    ctx.engine.actionDepth.value--;
  }
}

export function registerBuiltInActions(): void {
  // { type: "narrate", text: "...", speaker?, kind? }
  actionRegistry.register('narrate', async (action, { engine }) => {
    const text = String(action.text ?? '');
    engine.pushNarration({
      text,
      speaker: action.speaker as string | undefined,
      kind: (action.kind as 'narration' | 'dialog' | 'inner' | 'system') ?? 'narration',
    });
    await engine.awaitTextReveal(text);
  });

  // { type: "goto", scene: "interior" } — navigate to a (dream/legacy hub) scene
  actionRegistry.register('goto', async (action, { engine }) => {
    await engine.enterScene(String(action.scene));
  });

  // { type: "gotoSite", site: "mansion_first_floor" } — switch mansion site
  actionRegistry.register('gotoSite', async (action, { engine }) => {
    await engine.enterSite(String(action.site));
  });

  // { type: "enterInteraction", interaction: "study_offer" } — start a mansion interaction
  actionRegistry.register('enterInteraction', async (action, { engine }) => {
    await engine.enterInteraction(String(action.interaction));
  });

  // { type: "exitInteraction" } — end current mansion interaction
  actionRegistry.register('exitInteraction', async (_action, { engine }) => {
    await engine.exitInteraction();
  });

  // { type: "setFlag", flag: "doorUnlocked", value: true }
  actionRegistry.register('setFlag', (action, { engine }) => {
    engine.state.flags[String(action.flag)] = action.value ?? true;
  });

  // { type: "addItem", item: "key" }
  actionRegistry.register('addItem', async (action, { engine }) => {
    const item = String(action.item);
    if (!engine.state.inventory.includes(item)) {
      engine.state.inventory.push(item);
      const display = engine.adventure.items?.[item]?.name ?? item;
      const text = `Acquired: ${display}.`;
      engine.pushNarration({ kind: 'system', text });
      await engine.awaitTextReveal(text);
    }
  });

  // { type: "removeItem", item: "key" }
  actionRegistry.register('removeItem', (action, { engine }) => {
    const item = String(action.item);
    const idx = engine.state.inventory.indexOf(item);
    if (idx >= 0) engine.state.inventory.splice(idx, 1);
  });

  // { type: "hideObject", object: "rock" } -- defaults to current trigger object
  actionRegistry.register('hideObject', (action, ctx) => {
    const id = (action.object as string) ?? ctx.object?.id;
    if (!id) return;
    const cur = ctx.engine.state.objectState[id] ?? {};
    ctx.engine.state.objectState[id] = { ...cur, hidden: true };
  });

  // { type: "showObject", object: "rock" }
  actionRegistry.register('showObject', (action, ctx) => {
    const id = (action.object as string) ?? ctx.object?.id;
    if (!id) return;
    const cur = ctx.engine.state.objectState[id] ?? {};
    ctx.engine.state.objectState[id] = { ...cur, hidden: false };
  });

  // { type: "if", condition: {...}, then: [...], else?: [...] }
  actionRegistry.register('if', async (action, ctx) => {
    const cond = action.condition as Condition;
    const branch = evaluateCondition(cond, ctx)
      ? (action.then as Action[] | undefined)
      : (action.else as Action[] | undefined);
    await runActions(branch, ctx);
  });

  // { type: "sequence", actions: [...] } -- handy for nesting via `if.then`.
  actionRegistry.register('sequence', async (action, ctx) => {
    await runActions((action.actions as Action[]) ?? [], ctx);
  });

  // { type: "pause", seconds: 1.5 } -- silent delay between actions.
  actionRegistry.register('pause', async (action) => {
    const seconds = Number(action.seconds ?? 0);
    if (seconds > 0) await new Promise((r) => setTimeout(r, seconds * 1000));
  });

  // { type: "wait" } -- pushes a "Click to continue…" prompt to the log and
  // suspends the action sequence until the player clicks or presses a key.
  // The prompt is removed from the log on continue.
  actionRegistry.register('wait', async (_action, { engine }) => {
    await engine.waitForContinue();
  });

  // { type: "startDialog", dialog: "wren_offer", node?: "alt_start" }
  actionRegistry.register('startDialog', async (action, { engine }) => {
    const dialogId = String(action.dialog);
    const dialog = engine.adventure.dialogs?.[dialogId];
    if (!dialog) {
      console.warn(`[adventure-engine] Unknown dialog: ${dialogId}`);
      return;
    }
    const nodeId = (action.node as string | undefined) ?? dialog.start;
    if (!dialog.nodes[nodeId]) {
      console.warn(`[adventure-engine] Dialog "${dialogId}" has no node "${nodeId}"`);
      return;
    }
    engine.state.dialogState = { dialogId, nodeId };
    await engine.emitCurrentDialogNode();
  });

  // { type: "endDialog" }
  actionRegistry.register('endDialog', (_action, { engine }) => {
    engine.state.dialogState = null;
  });

  // { type: "setPatientStatus", patient: "whitfield", status: "improving" }
  actionRegistry.register('setPatientStatus', (action, { engine }) => {
    const id = String(action.patient);
    const status = action.status as PatientStatus;
    if (!VALID_PATIENT_STATUSES.includes(status)) {
      console.warn(`[adventure-engine] setPatientStatus: invalid status "${status}"`);
      return;
    }
    const entry = engine.ensurePatientState(id);
    entry.status = status;
  });

  // { type: "recordPatientNote", patient: "whitfield", note: "walked the corridor" }
  actionRegistry.register('recordPatientNote', (action, { engine }) => {
    const id = String(action.patient);
    const note = String(action.note);
    const entry = engine.ensurePatientState(id);
    if (!entry.notes.includes(note)) entry.notes.push(note);
  });

  // { type: "enterDream", patient: "whitfield" }
  // Sugar over goto: bumps sessionsCompleted, marks the patient active, then
  // navigates to their dreamScene. Patient must exist on the adventure.
  // Wraps the scene change in `runDreamTransition('entering', …)` so the
  // hypnotic-spiral overlay covers the cut.
  actionRegistry.register('enterDream', async (action, { engine }) => {
    const id = String(action.patient);
    const def = engine.adventure.patients?.[id];
    if (!def) {
      console.warn(`[adventure-engine] Unknown patient: ${id}`);
      return;
    }
    const entry = engine.ensurePatientState(id);
    entry.sessionsCompleted += 1;
    engine.state.activePatientId = id;
    await engine.runDreamTransition('entering', async () => {
      // Snapshot the mansion log and clear it so the dream starts with a
      // blank slate. The hold-phase spiral hides the visual change.
      engine.snapshotNarrationForDream();
      await engine.enterScene(def.dreamScene);
    });
  });

  // { type: "dreamTransition", direction: "entering" | "exiting",
  //   actions?: Action[] }
  // Run the hypnotic-spiral overlay around a nested action list. Whatever
  // `actions` does executes during the hold phase (between the fade-in and
  // fade-out), hidden behind the opaque spiral. Without `actions` the
  // sequence is purely visual: a hypnotic pause. Decoupled from `enterDream`
  // so adventures without a patient model can still use the effect (e.g. the
  // cabin dev fixture).
  actionRegistry.register('dreamTransition', async (action, ctx) => {
    const direction = action.direction === 'exiting' ? 'exiting' : 'entering';
    const nested = Array.isArray(action.actions) ? (action.actions as Action[]) : [];
    await ctx.engine.runDreamTransition(direction, async () => {
      if (nested.length > 0) await runActions(nested, ctx);
    });
  });

  // { type: "wake", interaction?: "treatment_debrief", scene?: "deviceRoom" }
  // Exits the current dream: clears activePatientId, navigates to either a
  // mansion interaction (preferred) or a scene (legacy / non-mansion games).
  // The hypnotic-spiral overlay covers the cut on the way out as well.
  actionRegistry.register('wake', async (action, { engine }) => {
    engine.state.activePatientId = null;
    await engine.runDreamTransition('exiting', async () => {
      // Restore the mansion log first so the wake interaction's onEnter
      // narrations append to the original mansion history (not to the dream
      // log we're throwing away).
      engine.restoreNarrationAfterDream();
      await wakeTo(engine, { interaction: action.interaction, scene: action.scene });
    });
  });

  // { type: "setInteractionVisuals",
  //   background?: "..." | null,
  //   animations?: [...] | null,
  //   overlays?: Overlay[] | null,
  //   addOverlay?: Overlay,
  //   removeOverlay?: "overlayId" }
  // Override the active interaction's visuals at runtime.
  // - Providing a value replaces the override; providing null clears it (falls back
  //   to the interaction's authored value); omitting the key leaves the override
  //   unchanged. Overrides are auto-cleared on enter/exit interaction.
  // - `addOverlay` / `removeOverlay` mutate the current effective overlay list
  //   (either the authored list or the existing override) in place, so a
  //   dialog beat can flip a single overlay without restating the full set.
  actionRegistry.register('setInteractionVisuals', (action, { engine }) => {
    if ('background' in action) {
      const bg = action.background;
      if (bg === null) engine.state.interactionBackgroundOverride = null;
      else if (typeof bg === 'string') engine.state.interactionBackgroundOverride = bg;
    }
    if ('animations' in action) {
      const anim = action.animations;
      if (anim === null) engine.state.interactionAnimationsOverride = null;
      else if (Array.isArray(anim)) {
        engine.state.interactionAnimationsOverride = anim.filter(
          (s): s is string => typeof s === 'string',
        );
      }
    }
    if ('overlays' in action) {
      const ov = action.overlays;
      if (ov === null) engine.state.interactionOverlaysOverride = null;
      else if (Array.isArray(ov)) {
        engine.state.interactionOverlaysOverride = (ov as Overlay[]).map((o) => ({
          ...o,
        }));
      }
    }
    if (action.addOverlay && typeof action.addOverlay === 'object') {
      const newOv = action.addOverlay as Overlay;
      if (typeof newOv.id === 'string' && typeof newOv.image === 'string') {
        const current = effectiveOverlays(engine);
        const idx = current.findIndex((o) => o.id === newOv.id);
        const next = idx >= 0
          ? current.map((o, i) => (i === idx ? { ...newOv } : o))
          : [...current, { ...newOv }];
        engine.state.interactionOverlaysOverride = next;
      }
    }
    if (typeof action.removeOverlay === 'string') {
      const id = action.removeOverlay;
      const current = effectiveOverlays(engine);
      engine.state.interactionOverlaysOverride = current.filter((o) => o.id !== id);
    }
  });

  // { type: "speakExitPhrase", phrase: "the light in the conservatory",
  //   expected: "the light in the conservatory",
  //   wakeInteraction?: "treatment_debrief", wakeScene?: "deviceRoom",
  //   onWrong?: [actions] }
  // Speaking the prearranged phrase wakes; anything else runs onWrong.
  actionRegistry.register('speakExitPhrase', async (action, ctx) => {
    const phrase = String(action.phrase ?? '')
      .trim()
      .toLowerCase();
    const expected = String(action.expected ?? '')
      .trim()
      .toLowerCase();
    const echo = `"${String(action.phrase ?? '')}"`;
    ctx.engine.pushNarration({
      kind: 'dialog',
      speaker: 'Ashley',
      text: echo,
    });
    await ctx.engine.awaitTextReveal(echo);
    if (phrase && phrase === expected) {
      ctx.engine.state.activePatientId = null;
      await ctx.engine.runDreamTransition('exiting', async () => {
        ctx.engine.restoreNarrationAfterDream();
        await wakeTo(ctx.engine, {
          interaction: action.wakeInteraction,
          scene: action.wakeScene,
        });
      });
    } else if (action.onWrong) {
      await runActions(action.onWrong as Action[], ctx);
    }
  });

  registerBuiltInActionValidators();
}

function requireString(action: Action, key: string): string[] {
  return typeof action[key] === 'string' && (action[key] as string).length > 0
    ? []
    : [`"${action.type}" requires string field "${key}"`];
}

function requireArray(action: Action, key: string): string[] {
  return Array.isArray(action[key]) ? [] : [`"${action.type}" requires array field "${key}"`];
}

function registerBuiltInActionValidators(): void {
  actionValidatorRegistry.register('narrate', (a) => requireString(a, 'text'));
  actionValidatorRegistry.register('goto', (a) => requireString(a, 'scene'));
  actionValidatorRegistry.register('gotoSite', (a) => requireString(a, 'site'));
  actionValidatorRegistry.register('enterInteraction', (a) => requireString(a, 'interaction'));
  actionValidatorRegistry.register('exitInteraction', () => []);
  actionValidatorRegistry.register('setFlag', (a) => requireString(a, 'flag'));
  actionValidatorRegistry.register('addItem', (a) => requireString(a, 'item'));
  actionValidatorRegistry.register('removeItem', (a) => requireString(a, 'item'));
  actionValidatorRegistry.register('hideObject', (a) =>
    a.object === undefined || typeof a.object === 'string'
      ? []
      : [`"hideObject".object must be a string when provided`],
  );
  actionValidatorRegistry.register('showObject', (a) =>
    a.object === undefined || typeof a.object === 'string'
      ? []
      : [`"showObject".object must be a string when provided`],
  );
  actionValidatorRegistry.register('if', (a) => {
    const errs: string[] = [];
    if (!a.condition || typeof a.condition !== 'object') {
      errs.push(`"if" requires object field "condition"`);
    }
    if (a.then !== undefined && !Array.isArray(a.then)) {
      errs.push(`"if".then must be an array of actions`);
    }
    if (a.else !== undefined && !Array.isArray(a.else)) {
      errs.push(`"if".else must be an array of actions`);
    }
    return errs;
  });
  actionValidatorRegistry.register('sequence', (a) => requireArray(a, 'actions'));
  actionValidatorRegistry.register('pause', (a) =>
    typeof a.seconds === 'number' && a.seconds >= 0
      ? []
      : [`"pause".seconds must be a non-negative number`],
  );
  actionValidatorRegistry.register('wait', () => []);
  actionValidatorRegistry.register('startDialog', (a) => requireString(a, 'dialog'));
  actionValidatorRegistry.register('endDialog', () => []);
  actionValidatorRegistry.register('setPatientStatus', (a) => {
    const errs = requireString(a, 'patient');
    if (
      typeof a.status !== 'string' ||
      !VALID_PATIENT_STATUSES.includes(a.status as PatientStatus)
    ) {
      errs.push(`"setPatientStatus".status must be one of: ${VALID_PATIENT_STATUSES.join(', ')}`);
    }
    return errs;
  });
  actionValidatorRegistry.register('recordPatientNote', (a) => [
    ...requireString(a, 'patient'),
    ...requireString(a, 'note'),
  ]);
  actionValidatorRegistry.register('enterDream', (a) => requireString(a, 'patient'));
  actionValidatorRegistry.register('dreamTransition', (a) => {
    const errs: string[] = [];
    if (a.direction !== 'entering' && a.direction !== 'exiting') {
      errs.push(`"dreamTransition" requires direction "entering" or "exiting"`);
    }
    if (a.actions !== undefined && !Array.isArray(a.actions)) {
      errs.push(`"dreamTransition".actions must be an array of actions when provided`);
    }
    return errs;
  });
  actionValidatorRegistry.register('wake', (a) => {
    const errs: string[] = [];
    if (a.scene !== undefined && typeof a.scene !== 'string') {
      errs.push(`"wake".scene must be a string when provided`);
    }
    if (a.interaction !== undefined && typeof a.interaction !== 'string') {
      errs.push(`"wake".interaction must be a string when provided`);
    }
    return errs;
  });
  actionValidatorRegistry.register('setInteractionVisuals', (a) => {
    const errs: string[] = [];
    const fields = ['background', 'animations', 'overlays', 'addOverlay', 'removeOverlay'];
    const present = fields.filter((f) => f in a);
    if (present.length === 0) {
      errs.push(
        `"setInteractionVisuals" requires at least one of: ${fields.join(', ')}`,
      );
    }
    if ('background' in a && a.background !== null && typeof a.background !== 'string') {
      errs.push(`"setInteractionVisuals".background must be a string or null`);
    }
    if ('animations' in a && a.animations !== null && !Array.isArray(a.animations)) {
      errs.push(`"setInteractionVisuals".animations must be an array of strings or null`);
    }
    if ('overlays' in a && a.overlays !== null && !Array.isArray(a.overlays)) {
      errs.push(`"setInteractionVisuals".overlays must be an array of Overlay or null`);
    }
    if (Array.isArray(a.overlays)) {
      (a.overlays as unknown[]).forEach((o, i) =>
        validateOverlayShape(o, `"setInteractionVisuals".overlays[${i}]`, errs),
      );
    }
    if ('addOverlay' in a) {
      validateOverlayShape(a.addOverlay, `"setInteractionVisuals".addOverlay`, errs);
    }
    if ('removeOverlay' in a && typeof a.removeOverlay !== 'string') {
      errs.push(`"setInteractionVisuals".removeOverlay must be an overlay id string`);
    }
    return errs;
  });
  actionValidatorRegistry.register('speakExitPhrase', (a) => {
    const errs: string[] = [];
    if (typeof a.expected !== 'string' || !a.expected) {
      errs.push(`"speakExitPhrase" requires string field "expected"`);
    }
    if (a.phrase !== undefined && typeof a.phrase !== 'string') {
      errs.push(`"speakExitPhrase".phrase must be a string when provided`);
    }
    if (a.wakeScene !== undefined && typeof a.wakeScene !== 'string') {
      errs.push(`"speakExitPhrase".wakeScene must be a string when provided`);
    }
    if (a.wakeInteraction !== undefined && typeof a.wakeInteraction !== 'string') {
      errs.push(`"speakExitPhrase".wakeInteraction must be a string when provided`);
    }
    if (a.onWrong !== undefined && !Array.isArray(a.onWrong)) {
      errs.push(`"speakExitPhrase".onWrong must be an array of actions`);
    }
    return errs;
  });
}
