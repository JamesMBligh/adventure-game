import type { Condition } from '../types';
import { conditionRegistry, conditionValidatorRegistry, type ActionContext } from './registry';

/** Evaluate a condition by dispatching to the registry. Falsy/missing -> true. */
export function evaluateCondition(condition: Condition | undefined, ctx: ActionContext): boolean {
  if (!condition) return true;
  const handler = conditionRegistry.get(condition.type);
  if (!handler) {
    const where = describeContext(ctx);
    console.warn(`[adventure-engine] Unknown condition type: ${condition.type}${where}`);
    return false;
  }
  return handler(condition, ctx);
}

function describeContext(ctx: ActionContext): string {
  const parts: string[] = [];
  if (ctx.object?.id) parts.push(`object="${ctx.object.id}"`);
  if (ctx.trigger) parts.push(`trigger="${ctx.trigger}"`);
  return parts.length ? ` (at ${parts.join(', ')})` : '';
}

export function registerBuiltInConditions(): void {
  // { type: "flag", flag: "doorUnlocked", equals: true }
  // `equals` defaults to true, so `{ type: "flag", flag: "x" }` is "x is truthy".
  conditionRegistry.register('flag', (cond, { engine }) => {
    const flag = cond.flag as string;
    const expected = 'equals' in cond ? cond.equals : true;
    return engine.state.flags[flag] === expected;
  });

  // { type: "hasItem", item: "key" }
  conditionRegistry.register('hasItem', (cond, { engine }) => {
    return engine.state.inventory.includes(cond.item as string);
  });

  // { type: "scene", scene: "outside" }
  conditionRegistry.register('scene', (cond, { engine }) => {
    return engine.state.currentSceneId === (cond.scene as string);
  });

  // { type: "and", conditions: [...] }
  conditionRegistry.register('and', (cond, ctx) => {
    const list = (cond.conditions as Condition[]) ?? [];
    return list.every((c) => evaluateCondition(c, ctx));
  });

  // { type: "or", conditions: [...] }
  conditionRegistry.register('or', (cond, ctx) => {
    const list = (cond.conditions as Condition[]) ?? [];
    return list.some((c) => evaluateCondition(c, ctx));
  });

  // { type: "not", condition: { ... } }
  conditionRegistry.register('not', (cond, ctx) => {
    return !evaluateCondition(cond.condition as Condition, ctx);
  });

  // { type: "patientStatus", patient: "whitfield", status: "improving" }
  conditionRegistry.register('patientStatus', (cond, { engine }) => {
    const id = cond.patient as string;
    const expected = cond.status as string;
    return engine.state.patientState[id]?.status === expected;
  });

  // { type: "patientHas", patient: "whitfield", note: "walked the corridor" }
  conditionRegistry.register('patientHas', (cond, { engine }) => {
    const id = cond.patient as string;
    const note = cond.note as string;
    return engine.state.patientState[id]?.notes.includes(note) ?? false;
  });

  // { type: "inDream" } -- true when current scene's kind is 'dream'.
  conditionRegistry.register('inDream', (_cond, { engine }) => {
    return engine.currentScene.value.kind === 'dream';
  });

  // { type: "activePatient", patient: "whitfield" }
  conditionRegistry.register('activePatient', (cond, { engine }) => {
    return engine.state.activePatientId === (cond.patient as string);
  });

  registerBuiltInConditionValidators();
}

function requireConditionString(cond: Condition, key: string): string[] {
  return typeof cond[key] === 'string' && (cond[key] as string).length > 0
    ? []
    : [`"${cond.type}" requires string field "${key}"`];
}

function requireConditionArray(cond: Condition, key: string): string[] {
  return Array.isArray(cond[key]) ? [] : [`"${cond.type}" requires array field "${key}"`];
}

function registerBuiltInConditionValidators(): void {
  conditionValidatorRegistry.register('flag', (c) => requireConditionString(c, 'flag'));
  conditionValidatorRegistry.register('hasItem', (c) => requireConditionString(c, 'item'));
  conditionValidatorRegistry.register('scene', (c) => requireConditionString(c, 'scene'));
  conditionValidatorRegistry.register('and', (c) => requireConditionArray(c, 'conditions'));
  conditionValidatorRegistry.register('or', (c) => requireConditionArray(c, 'conditions'));
  conditionValidatorRegistry.register('not', (c) =>
    c.condition && typeof c.condition === 'object'
      ? []
      : [`"not" requires object field "condition"`],
  );
  conditionValidatorRegistry.register('patientStatus', (c) => [
    ...requireConditionString(c, 'patient'),
    ...requireConditionString(c, 'status'),
  ]);
  conditionValidatorRegistry.register('patientHas', (c) => [
    ...requireConditionString(c, 'patient'),
    ...requireConditionString(c, 'note'),
  ]);
  conditionValidatorRegistry.register('inDream', () => []);
  conditionValidatorRegistry.register('activePatient', (c) => requireConditionString(c, 'patient'));
}
