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
  const scenes = adventure.scenes ?? {};
  const sites = adventure.sites ?? {};
  const dialogs = adventure.dialogs ?? {};
  const flags = adventure.flags ?? {};
  const interactions = adventure.interactions ?? [];

  if (!adventure.startScene && !adventure.startSite) {
    errors.push({
      path: 'start',
      message: 'adventure must define either startScene or startSite',
    });
  }
  if (adventure.startScene && !scenes[adventure.startScene]) {
    errors.push({
      path: 'startScene',
      message: `startScene "${adventure.startScene}" is not defined in scenes`,
    });
  }
  if (adventure.startSite && !sites[adventure.startSite]) {
    errors.push({
      path: 'startSite',
      message: `startSite "${adventure.startSite}" is not defined in sites`,
    });
  }
  if (adventure.startInteraction) {
    const found = interactions.find((it) => it.id === adventure.startInteraction);
    if (!found) {
      errors.push({
        path: 'startInteraction',
        message: `startInteraction "${adventure.startInteraction}" is not defined in interactions`,
      });
    }
  }

  for (const [sceneId, scene] of Object.entries(scenes)) {
    walkActions(scene.onEnter, `scenes.${sceneId}.onEnter`, errors, adventure);
    walkActions(scene.onExit, `scenes.${sceneId}.onExit`, errors, adventure);
    for (const obj of scene.objects ?? []) {
      const objPath = `scenes.${sceneId}.objects[${obj.id}]`;
      if (obj.visibleIf) walkCondition(obj.visibleIf, `${objPath}.visibleIf`, errors, adventure);
      for (const [trigger, actions] of Object.entries(obj.triggers ?? {})) {
        walkActions(actions, `${objPath}.triggers.${trigger}`, errors, adventure);
      }
    }
  }

  const locationIds = new Set<string>();
  for (const [siteId, site] of Object.entries(sites)) {
    walkActions(site.onEnter, `sites.${siteId}.onEnter`, errors, adventure);
    walkActions(site.onExit, `sites.${siteId}.onExit`, errors, adventure);
    if (!site.locations || typeof site.locations !== 'object') {
      errors.push({ path: `sites.${siteId}.locations`, message: 'must be an object' });
      continue;
    }
    for (const [locId, loc] of Object.entries(site.locations)) {
      const locPath = `sites.${siteId}.locations.${locId}`;
      if (locationIds.has(locId)) {
        errors.push({ path: locPath, message: `location id "${locId}" is not globally unique` });
      } else {
        locationIds.add(locId);
      }
      if (!loc.name) errors.push({ path: `${locPath}.name`, message: 'name is required' });
      if (typeof loc.x !== 'number' || typeof loc.y !== 'number') {
        errors.push({ path: locPath, message: 'x and y are required (numbers)' });
      }
      if (
        loc.icon !== undefined &&
        !['standard', 'left', 'up', 'down', 'right'].includes(loc.icon)
      ) {
        errors.push({
          path: `${locPath}.icon`,
          message: `icon must be one of "standard", "left", "up", "down", "right" (got "${loc.icon}")`,
        });
      }
      // Missing target sites are not a hard error: the runtime hides locations
      // that point at non-existent or unreachable sites (see computeVisibleLocations
      // in engine.ts). Warn so typos still surface at load-time, but let it load.
      if (loc.target && !sites[loc.target]) {
        console.warn(
          `[adventure-engine] ${locPath}.target: site "${loc.target}" is not defined; ` +
            `the location icon will be hidden at runtime.`,
        );
      }
    }
  }

  const seenInteractionIds = new Set<string>();
  interactions.forEach((interaction, i) => {
    const path = `interactions[${i}]`;
    if (!interaction.id) {
      errors.push({ path: `${path}.id`, message: 'id is required' });
    } else if (seenInteractionIds.has(interaction.id)) {
      errors.push({ path: `${path}.id`, message: `duplicate interaction id "${interaction.id}"` });
    } else {
      seenInteractionIds.add(interaction.id);
    }
    if (!interaction.location) {
      errors.push({ path: `${path}.location`, message: 'location is required' });
    } else if (!locationIds.has(interaction.location)) {
      errors.push({
        path: `${path}.location`,
        message: `location "${interaction.location}" is not defined on any site`,
      });
    }
    if (interaction.dialog && !dialogs[interaction.dialog]) {
      errors.push({
        path: `${path}.dialog`,
        message: `dialog "${interaction.dialog}" is not defined`,
      });
    }
    (interaction.conditions ?? []).forEach((cond, ci) =>
      walkCondition(cond, `${path}.conditions[${ci}]`, errors, adventure),
    );
    walkActions(interaction.onEnter, `${path}.onEnter`, errors, adventure);
    walkActions(interaction.onExit, `${path}.onExit`, errors, adventure);
  });

  for (const [dialogId, dialog] of Object.entries(dialogs)) {
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
        if (choice.visibleIf)
          walkCondition(choice.visibleIf, `${cPath}.visibleIf`, errors, adventure);
        if (choice.actions) walkActions(choice.actions, `${cPath}.actions`, errors, adventure);
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
    if (!scenes[patient.dreamScene]) {
      errors.push({
        path: `patients.${patientId}.dreamScene`,
        message: `dreamScene "${patient.dreamScene}" is not defined in scenes`,
      });
    }
  }

  for (const [flagName, def] of Object.entries(flags)) {
    if (def === null || typeof def !== 'object') {
      errors.push({
        path: `flags.${flagName}`,
        message: 'flag definition must be an object with a "default" field',
      });
      continue;
    }
    if (typeof def.default !== 'boolean') {
      errors.push({
        path: `flags.${flagName}.default`,
        message: 'flag default must be a boolean',
      });
    }
  }

  return errors;
}

function walkActions(
  actions: Action[] | undefined,
  path: string,
  errors: AdventureValidationError[],
  adventure: Adventure,
): void {
  if (!actions) return;
  if (!Array.isArray(actions)) {
    errors.push({ path, message: 'expected an array of actions' });
    return;
  }
  actions.forEach((action, i) => walkAction(action, `${path}[${i}]`, errors, adventure));
}

function walkAction(
  action: Action,
  path: string,
  errors: AdventureValidationError[],
  adventure: Adventure,
): void {
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
  if (action.type === 'setFlag' && typeof action.flag === 'string' && adventure.flags) {
    if (!adventure.flags[action.flag]) {
      errors.push({ path, message: `setFlag references undeclared flag "${action.flag}"` });
    }
  }
  if (action.type === 'if') {
    if (action.condition)
      walkCondition(action.condition as Condition, `${path}.condition`, errors, adventure);
    if (Array.isArray(action.then))
      walkActions(action.then as Action[], `${path}.then`, errors, adventure);
    if (Array.isArray(action.else))
      walkActions(action.else as Action[], `${path}.else`, errors, adventure);
  } else if (action.type === 'sequence' && Array.isArray(action.actions)) {
    walkActions(action.actions as Action[], `${path}.actions`, errors, adventure);
  } else if (action.type === 'speakExitPhrase' && Array.isArray(action.onWrong)) {
    walkActions(action.onWrong as Action[], `${path}.onWrong`, errors, adventure);
  }
}

function walkCondition(
  condition: Condition,
  path: string,
  errors: AdventureValidationError[],
  adventure: Adventure,
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
  if (condition.type === 'flag' && typeof condition.flag === 'string' && adventure.flags) {
    if (!adventure.flags[condition.flag]) {
      errors.push({ path, message: `condition references undeclared flag "${condition.flag}"` });
    }
  }
  if (
    (condition.type === 'and' || condition.type === 'or') &&
    Array.isArray(condition.conditions)
  ) {
    (condition.conditions as Condition[]).forEach((c, i) =>
      walkCondition(c, `${path}.conditions[${i}]`, errors, adventure),
    );
  } else if (condition.type === 'not' && condition.condition) {
    walkCondition(condition.condition as Condition, `${path}.condition`, errors, adventure);
  }
}

export function formatValidationErrors(errors: AdventureValidationError[]): string {
  return errors.map((e) => `  ${e.path}: ${e.message}`).join('\n');
}

// ---------------------------------------------------------------------------
// Per-file structural validators.
//
// These run BEFORE the loader merges files into one Adventure. They check the
// SHAPE of each file — what's required, what's forbidden — so authors get a
// clear, file-specific error when the wrong kind of content ends up in the
// wrong file. Cross-cutting checks (reference resolution, action/condition
// payloads, etc.) still happen against the merged result via
// `validateAdventure`.
// ---------------------------------------------------------------------------

const MANSION_FORBIDDEN: ReadonlyArray<readonly [string, string]> = [
  ['scenes', 'scenes belong in dream files (src/config/adventures/<patient>.json)'],
  ['items', 'items belong in dream files; the mansion has no inventory'],
  ['startScene', 'startScene is not used in mansion configs (use startSite)'],
];

const DREAM_FORBIDDEN: ReadonlyArray<readonly [string, string]> = [
  ['title', 'title belongs in main.json'],
  ['startSite', 'startSite belongs in main.json'],
  ['startScene', 'startScene belongs in main.json'],
  ['startInteraction', 'startInteraction belongs in main.json'],
  ['sites', 'sites belong in main.json'],
  ['interactions', 'interactions belong in main.json'],
  ['patients', 'patients belong in main.json'],
  ['flags', 'flags belong in main.json'],
];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Validate a mansion config (main.json) for structural shape only. Rejects
 * fields that belong in a dream file, surfaces missing required fields.
 * Does not walk actions / conditions — that happens against the merged
 * Adventure in `validateAdventure`.
 */
export function validateMansionConfig(config: unknown): AdventureValidationError[] {
  const errors: AdventureValidationError[] = [];
  if (!isPlainObject(config)) {
    errors.push({ path: '', message: 'mansion config must be an object' });
    return errors;
  }
  if (typeof config.title !== 'string' || !config.title) {
    errors.push({ path: 'title', message: 'title is required (string)' });
  }
  if (typeof config.startSite !== 'string' || !config.startSite) {
    errors.push({ path: 'startSite', message: 'startSite is required (string)' });
  }
  if (!isPlainObject(config.sites) || Object.keys(config.sites).length === 0) {
    errors.push({ path: 'sites', message: 'sites is required (non-empty object)' });
  }
  for (const [field, reason] of MANSION_FORBIDDEN) {
    if (field in config) errors.push({ path: field, message: reason });
  }
  if (isPlainObject(config.initialState) && 'inventory' in config.initialState) {
    errors.push({
      path: 'initialState.inventory',
      message: 'inventory belongs in dream files; the mansion has no inventory',
    });
  }
  return errors;
}

/**
 * Validate a dream config (src/config/adventures/<patientId>.json) for
 * structural shape only. Requires scenes; rejects fields that belong in
 * main.json. Errors are prefixed with the dream id so the file source is
 * legible in the merged error list.
 */
export function validateDreamConfig(
  dreamId: string,
  config: unknown,
): AdventureValidationError[] {
  const errors: AdventureValidationError[] = [];
  const prefix = `dreams.${dreamId}`;
  if (!isPlainObject(config)) {
    errors.push({ path: prefix, message: 'dream config must be an object' });
    return errors;
  }
  if (!isPlainObject(config.scenes) || Object.keys(config.scenes).length === 0) {
    errors.push({
      path: `${prefix}.scenes`,
      message: 'scenes is required (non-empty object)',
    });
  }
  for (const [field, reason] of DREAM_FORBIDDEN) {
    if (field in config) errors.push({ path: `${prefix}.${field}`, message: reason });
  }
  return errors;
}
