import type { Action, Adventure, Condition } from '../types';
import {
  actionRegistry,
  actionValidatorRegistry,
  conditionRegistry,
  conditionValidatorRegistry,
} from './registry';

export interface AdventureValidationError {
  path: string;
  message: string;
}

/**
 * Walk an adventure and check that every action and condition has a registered
 * handler and (where the handler exposes a validator) a well-formed payload.
 * Returns the collected error list — empty array means the adventure is valid.
 *
 * Call after `ensureBuiltInsRegistered()` and after any custom registrations,
 * otherwise built-in types will be reported as unknown.
 */
export function validateAdventure(adventure: Adventure): AdventureValidationError[] {
  const errors: AdventureValidationError[] = [];

  if (!adventure.scenes[adventure.startScene]) {
    errors.push({
      path: 'startScene',
      message: `startScene "${adventure.startScene}" is not defined in scenes`,
    });
  }

  for (const [sceneId, scene] of Object.entries(adventure.scenes)) {
    walkActions(scene.onEnter, `scenes.${sceneId}.onEnter`, errors);
    walkActions(scene.onExit, `scenes.${sceneId}.onExit`, errors);
    for (const obj of scene.objects ?? []) {
      const objPath = `scenes.${sceneId}.objects[${obj.id}]`;
      if (obj.visibleIf) walkCondition(obj.visibleIf, `${objPath}.visibleIf`, errors);
      for (const [trigger, actions] of Object.entries(obj.triggers ?? {})) {
        walkActions(actions, `${objPath}.triggers.${trigger}`, errors);
      }
    }
  }

  for (const [dialogId, dialog] of Object.entries(adventure.dialogs ?? {})) {
    if (!dialog.nodes[dialog.start]) {
      errors.push({
        path: `dialogs.${dialogId}.start`,
        message: `start node "${dialog.start}" is not defined`,
      });
    }
    for (const [nodeId, node] of Object.entries(dialog.nodes)) {
      const nodePath = `dialogs.${dialogId}.nodes.${nodeId}`;
      if (typeof node.text !== 'string' || !node.text) {
        errors.push({ path: `${nodePath}.text`, message: 'node text must be a non-empty string' });
      }
      (node.choices ?? []).forEach((choice, i) => {
        const cPath = `${nodePath}.choices[${i}]`;
        if (typeof choice.text !== 'string' || !choice.text) {
          errors.push({ path: `${cPath}.text`, message: 'choice text must be a non-empty string' });
        }
        if (choice.visibleIf) walkCondition(choice.visibleIf, `${cPath}.visibleIf`, errors);
        if (choice.actions) walkActions(choice.actions, `${cPath}.actions`, errors);
        if (choice.next && !dialog.nodes[choice.next]) {
          errors.push({
            path: `${cPath}.next`,
            message: `next node "${choice.next}" is not defined`,
          });
        }
      });
    }
  }

  for (const [patientId, patient] of Object.entries(adventure.patients ?? {})) {
    if (!adventure.scenes[patient.dreamScene]) {
      errors.push({
        path: `patients.${patientId}.dreamScene`,
        message: `dreamScene "${patient.dreamScene}" is not defined in scenes`,
      });
    }
  }

  return errors;
}

function walkActions(
  actions: Action[] | undefined,
  path: string,
  errors: AdventureValidationError[],
): void {
  if (!actions) return;
  if (!Array.isArray(actions)) {
    errors.push({ path, message: 'expected an array of actions' });
    return;
  }
  actions.forEach((action, i) => walkAction(action, `${path}[${i}]`, errors));
}

function walkAction(action: Action, path: string, errors: AdventureValidationError[]): void {
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
    errors.push({ path, message: 'action must be an object with a string "type"' });
    return;
  }
  if (!actionRegistry.has(action.type)) {
    errors.push({ path, message: `unknown action type "${action.type}"` });
    return;
  }
  const validator = actionValidatorRegistry.get(action.type);
  if (validator) {
    for (const msg of validator(action)) errors.push({ path, message: msg });
  }
  // Recurse into known nested action shapes so we catch problems inside if/sequence.
  if (action.type === 'if') {
    if (action.condition) walkCondition(action.condition as Condition, `${path}.condition`, errors);
    if (Array.isArray(action.then)) walkActions(action.then as Action[], `${path}.then`, errors);
    if (Array.isArray(action.else)) walkActions(action.else as Action[], `${path}.else`, errors);
  } else if (action.type === 'sequence' && Array.isArray(action.actions)) {
    walkActions(action.actions as Action[], `${path}.actions`, errors);
  } else if (action.type === 'speakExitPhrase' && Array.isArray(action.onWrong)) {
    walkActions(action.onWrong as Action[], `${path}.onWrong`, errors);
  }
}

function walkCondition(
  condition: Condition,
  path: string,
  errors: AdventureValidationError[],
): void {
  if (!condition || typeof condition !== 'object' || typeof condition.type !== 'string') {
    errors.push({ path, message: 'condition must be an object with a string "type"' });
    return;
  }
  if (!conditionRegistry.has(condition.type)) {
    errors.push({ path, message: `unknown condition type "${condition.type}"` });
    return;
  }
  const validator = conditionValidatorRegistry.get(condition.type);
  if (validator) {
    for (const msg of validator(condition)) errors.push({ path, message: msg });
  }
  if (
    (condition.type === 'and' || condition.type === 'or') &&
    Array.isArray(condition.conditions)
  ) {
    (condition.conditions as Condition[]).forEach((c, i) =>
      walkCondition(c, `${path}.conditions[${i}]`, errors),
    );
  } else if (condition.type === 'not' && condition.condition) {
    walkCondition(condition.condition as Condition, `${path}.condition`, errors);
  }
}

export function formatValidationErrors(errors: AdventureValidationError[]): string {
  return errors.map((e) => `  ${e.path}: ${e.message}`).join('\n');
}
