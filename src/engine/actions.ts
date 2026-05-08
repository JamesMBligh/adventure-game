import type { Action, Condition, PatientStatus } from '../types';
import { evaluateCondition } from './conditions';
import { actionRegistry, actionValidatorRegistry, type ActionContext } from './registry';

const VALID_PATIENT_STATUSES: PatientStatus[] = [
  'pending',
  'inResidence',
  'improving',
  'healed',
  'unhelped',
  'departed',
];

/** Run a list of actions sequentially. Each action may be async. */
export async function runActions(actions: Action[] | undefined, ctx: ActionContext): Promise<void> {
  if (!actions) return;
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
}

export function registerBuiltInActions(): void {
  // { type: "narrate", text: "...", speaker?, kind? }
  actionRegistry.register('narrate', (action, { engine }) => {
    engine.pushNarration({
      text: String(action.text ?? ''),
      speaker: action.speaker as string | undefined,
      kind: (action.kind as 'narration' | 'dialog' | 'system') ?? 'narration',
    });
  });

  // { type: "goto", scene: "interior" }
  actionRegistry.register('goto', async (action, { engine }) => {
    await engine.enterScene(String(action.scene));
  });

  // { type: "setFlag", flag: "doorUnlocked", value: true }
  actionRegistry.register('setFlag', (action, { engine }) => {
    engine.state.flags[String(action.flag)] = action.value ?? true;
  });

  // { type: "addItem", item: "key" }
  actionRegistry.register('addItem', (action, { engine }) => {
    const item = String(action.item);
    if (!engine.state.inventory.includes(item)) {
      engine.state.inventory.push(item);
      const display = engine.adventure.items?.[item]?.name ?? item;
      engine.pushNarration({ kind: 'system', text: `Acquired: ${display}.` });
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

  // { type: "wait", ms: 500 } -- pause between narration lines.
  actionRegistry.register('wait', async (action) => {
    const ms = Number(action.ms ?? 0);
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  });

  // { type: "startDialog", dialog: "wren_offer", node?: "alt_start" }
  actionRegistry.register('startDialog', (action, { engine }) => {
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
    engine.emitCurrentDialogNode();
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
    await engine.enterScene(def.dreamScene);
  });

  // { type: "wake", scene: "deviceRoom" }
  // Exits the current dream: clears activePatientId, navigates to the wake scene.
  actionRegistry.register('wake', async (action, { engine }) => {
    engine.state.activePatientId = null;
    const target = (action.scene as string | undefined) ?? engine.adventure.startScene;
    await engine.enterScene(target);
  });

  // { type: "speakExitPhrase", phrase: "the light in the conservatory",
  //   expected: "the light in the conservatory", wakeScene: "deviceRoom",
  //   onWrong?: [actions] }
  // Speaking the prearranged phrase wakes; anything else runs onWrong.
  actionRegistry.register('speakExitPhrase', async (action, ctx) => {
    const phrase = String(action.phrase ?? '')
      .trim()
      .toLowerCase();
    const expected = String(action.expected ?? '')
      .trim()
      .toLowerCase();
    ctx.engine.pushNarration({
      kind: 'dialog',
      speaker: 'Ashley',
      text: `"${String(action.phrase ?? '')}"`,
    });
    if (phrase && phrase === expected) {
      ctx.engine.state.activePatientId = null;
      const target = (action.wakeScene as string | undefined) ?? ctx.engine.adventure.startScene;
      await ctx.engine.enterScene(target);
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
  actionValidatorRegistry.register('wait', (a) =>
    typeof a.ms === 'number' && a.ms >= 0 ? [] : [`"wait".ms must be a non-negative number`],
  );
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
  actionValidatorRegistry.register('wake', (a) =>
    a.scene === undefined || typeof a.scene === 'string'
      ? []
      : [`"wake".scene must be a string when provided`],
  );
  actionValidatorRegistry.register('speakExitPhrase', (a) => {
    const errs: string[] = [];
    if (typeof a.expected !== 'string' || !a.expected) {
      errs.push(`"speakExitPhrase" requires string field "expected"`);
    }
    if (a.phrase !== undefined && typeof a.phrase !== 'string') {
      errs.push(`"speakExitPhrase".phrase must be a string when provided`);
    }
    if (a.onWrong !== undefined && !Array.isArray(a.onWrong)) {
      errs.push(`"speakExitPhrase".onWrong must be an array of actions`);
    }
    return errs;
  });
}
