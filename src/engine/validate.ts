import type { Action, Adventure, Condition, Point } from '../types';
import {
  actionRegistry,
  actionValidatorRegistry,
  conditionRegistry,
  conditionValidatorRegistry,
} from './registry';
import { polygonSelfIntersects } from './sceneObjects';

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
      // Anchor coords are required (numbers).
      if (typeof obj.x !== 'number') {
        errors.push({ path: `${objPath}.x`, message: 'x must be a number (anchor in % of scene)' });
      }
      if (typeof obj.y !== 'number') {
        errors.push({ path: `${objPath}.y`, message: 'y must be a number (anchor in % of scene)' });
      }
      // Reject legacy fields outright so unmigrated content surfaces clearly.
      const legacy = obj as unknown as Record<string, unknown>;
      if ('rect' in legacy) {
        errors.push({
          path: `${objPath}.rect`,
          message: 'top-level "rect" is no longer supported — use x/y plus display/hit blocks',
        });
      }
      if ('color' in legacy) {
        errors.push({
          path: `${objPath}.color`,
          message: 'top-level "color" is no longer supported — move it into display.color',
        });
      }
      if ('image' in legacy) {
        errors.push({
          path: `${objPath}.image`,
          message: 'top-level "image" is no longer supported — move it into display.image',
        });
      }
      // Display block: must declare exactly one of `rect` or `place`.
      // Cast through unknown — the static type would otherwise lie about
      // malformed on-the-wire shapes that the validator is here to catch.
      if (obj.display) {
        const d = obj.display as unknown as Record<string, unknown>;
        const hasRect = d.rect !== undefined;
        const hasPlace = d.place !== undefined;
        if (hasRect && hasPlace) {
          errors.push({
            path: `${objPath}.display`,
            message: 'display cannot specify both "rect" and "place" — pick one',
          });
        } else if (!hasRect && !hasPlace) {
          errors.push({
            path: `${objPath}.display`,
            message: 'display must specify either "rect" or "place"',
          });
        }
        if (hasRect) {
          if (typeof d.rect !== 'object' || d.rect === null) {
            errors.push({
              path: `${objPath}.display.rect`,
              message: 'display.rect must be an object with w, h, and optional x, y',
            });
          } else {
            validateRectShape(d.rect as Record<string, unknown>, `${objPath}.display.rect`, errors);
          }
        }
        if (hasPlace) {
          validatePlaceShape(d.place, `${objPath}.display.place`, errors);
          // place positions the image at natural pixel size + scale; it has
          // no meaning without an image to position.
          if (d.image === undefined) {
            errors.push({
              path: `${objPath}.display.image`,
              message: 'display.image is required when display.place is used',
            });
          }
        }
        if (d.color !== undefined && typeof d.color !== 'string') {
          errors.push({ path: `${objPath}.display.color`, message: 'display.color must be a string when provided' });
        }
        if (d.image !== undefined && typeof d.image !== 'string') {
          errors.push({ path: `${objPath}.display.image`, message: 'display.image must be a string when provided' });
        }
      }
      // Hit block: exactly one of rect / path / ellipsis. Highlight is an
      // optional boolean.
      if (obj.hit) {
        const h = obj.hit as unknown as Record<string, unknown>;
        const hasRect = h.rect !== undefined;
        const hasPath = h.path !== undefined;
        const hasEllipsis = h.ellipsis !== undefined;
        const kindCount = (hasRect ? 1 : 0) + (hasPath ? 1 : 0) + (hasEllipsis ? 1 : 0);
        if (kindCount > 1) {
          errors.push({
            path: `${objPath}.hit`,
            message: 'hit must specify exactly one of "rect", "path", or "ellipsis"',
          });
        } else if (kindCount === 0) {
          errors.push({
            path: `${objPath}.hit`,
            message: 'hit must specify one of "rect", "path", or "ellipsis"',
          });
        }
        if (hasRect) {
          if (typeof h.rect !== 'object' || h.rect === null) {
            errors.push({
              path: `${objPath}.hit.rect`,
              message: 'hit.rect must be an object with w, h, and optional x, y',
            });
          } else {
            validateRectShape(h.rect as Record<string, unknown>, `${objPath}.hit.rect`, errors);
          }
        }
        if (hasPath) {
          validatePathShape(h.path, `${objPath}.hit.path`, errors);
        }
        if (hasEllipsis) {
          if (typeof h.ellipsis !== 'object' || h.ellipsis === null) {
            errors.push({
              path: `${objPath}.hit.ellipsis`,
              message: 'hit.ellipsis must be an object with w, h, and optional x, y',
            });
          } else {
            validateRectShape(
              h.ellipsis as Record<string, unknown>,
              `${objPath}.hit.ellipsis`,
              errors,
            );
          }
        }
        if (h.highlight !== undefined && typeof h.highlight !== 'boolean') {
          errors.push({
            path: `${objPath}.hit.highlight`,
            message: 'hit.highlight must be a boolean when provided',
          });
        }
      }
      if (obj.visibleIf) walkCondition(obj.visibleIf, `${objPath}.visibleIf`, errors, adventure);
      for (const [trigger, actions] of Object.entries(obj.triggers ?? {})) {
        walkActions(actions, `${objPath}.triggers.${trigger}`, errors, adventure);
      }
      (obj.menu ?? []).forEach((item, i) => {
        const itemPath = `${objPath}.menu[${i}]`;
        if (typeof item.label !== 'string' || !item.label) {
          errors.push({
            path: `${itemPath}.label`,
            message: 'menu item label must be a non-empty string',
          });
        }
        if (item.visibleIf) walkCondition(item.visibleIf, `${itemPath}.visibleIf`, errors, adventure);
        if (!Array.isArray(item.actions)) {
          errors.push({
            path: `${itemPath}.actions`,
            message: 'menu item actions must be an array',
          });
        } else {
          walkActions(item.actions, `${itemPath}.actions`, errors, adventure);
        }
      });
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
    if (interaction.dialog !== undefined) {
      if (typeof interaction.dialog !== 'object' || interaction.dialog === null) {
        errors.push({
          path: `${path}.dialog`,
          message: 'interaction.dialog must be an inline Dialog object',
        });
      } else if (interaction.dialog.id !== undefined && typeof interaction.dialog.id !== 'string') {
        // `id` is optional — the loader auto-allocates one when omitted —
        // but if it IS provided it must be a non-empty string.
        errors.push({
          path: `${path}.dialog.id`,
          message: 'inline dialog "id" must be a string when provided',
        });
      } else if (typeof interaction.dialog.id === 'string' && interaction.dialog.id.length === 0) {
        errors.push({
          path: `${path}.dialog.id`,
          message: 'inline dialog "id" must be a non-empty string when provided',
        });
      }
      // Structural validation (start node exists, nodes well-formed, choice
      // references valid) is handled by the dialogs map walk below — the loader
      // registers inline interaction dialogs into adventure.dialogs.
    }
    if (interaction.overlays !== undefined) {
      if (!Array.isArray(interaction.overlays)) {
        errors.push({ path: `${path}.overlays`, message: 'overlays must be an array of Overlay' });
      } else {
        const seenIds = new Set<string>();
        interaction.overlays.forEach((o, i) => {
          const oPath = `${path}.overlays[${i}]`;
          if (!o || typeof o !== 'object') {
            errors.push({ path: oPath, message: 'overlay must be an object' });
            return;
          }
          if (typeof o.id !== 'string' || !o.id) {
            errors.push({ path: `${oPath}.id`, message: 'overlay id must be a non-empty string' });
          } else if (seenIds.has(o.id)) {
            errors.push({
              path: `${oPath}.id`,
              message: `duplicate overlay id "${o.id}" within this interaction`,
            });
          } else {
            seenIds.add(o.id);
          }
          if (typeof o.image !== 'string' || !o.image) {
            errors.push({ path: `${oPath}.image`, message: 'overlay image must be a non-empty string' });
          }
          if (o.transition !== undefined && o.transition !== 'fade') {
            errors.push({
              path: `${oPath}.transition`,
              message: 'overlay transition must be "fade" if provided',
            });
          }
          if (o.z !== undefined && typeof o.z !== 'number') {
            errors.push({
              path: `${oPath}.z`,
              message: 'overlay z must be a number if provided',
            });
          }
          if (o.rect !== undefined) {
            if (!o.rect || typeof o.rect !== 'object') {
              errors.push({
                path: `${oPath}.rect`,
                message: 'overlay rect must be an object { x, y, w, h }',
              });
            } else {
              const r = o.rect as unknown as Record<string, unknown>;
              for (const k of ['x', 'y', 'w', 'h'] as const) {
                if (typeof r[k] !== 'number') {
                  errors.push({
                    path: `${oPath}.rect.${k}`,
                    message: 'overlay rect.x/y/w/h must be numbers',
                  });
                }
              }
            }
          }
          if (o.place !== undefined) {
            if (!o.place || typeof o.place !== 'object') {
              errors.push({
                path: `${oPath}.place`,
                message: 'overlay place must be an object { top, left, scale? }',
              });
            } else {
              const p = o.place as unknown as Record<string, unknown>;
              if (typeof p.top !== 'number') {
                errors.push({ path: `${oPath}.place.top`, message: 'place.top must be a number' });
              }
              if (typeof p.left !== 'number') {
                errors.push({ path: `${oPath}.place.left`, message: 'place.left must be a number' });
              }
              if (p.scale !== undefined && typeof p.scale !== 'number') {
                errors.push({
                  path: `${oPath}.place.scale`,
                  message: 'place.scale must be a number if provided',
                });
              }
            }
          }
          if (o.rect !== undefined && o.place !== undefined) {
            errors.push({
              path: oPath,
              message: 'overlay cannot specify both "rect" and "place" — pick one',
            });
          }
        });
      }
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
      if (node.onEnter) walkActions(node.onEnter, `${nodePath}.onEnter`, errors, adventure);

      // A node must define exactly one of `choices` or `nochoice`.
      const hasChoices = Array.isArray(node.choices);
      const hasNochoice = node.nochoice !== undefined && node.nochoice !== null;
      if (hasChoices && hasNochoice) {
        errors.push({
          path: nodePath,
          message: 'node must define either `choices` or `nochoice`, not both',
        });
      } else if (!hasChoices && !hasNochoice) {
        errors.push({
          path: nodePath,
          message: 'node must define exactly one of `choices` or `nochoice`',
        });
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

      if (node.nochoice) {
        const ncPath = `${nodePath}.nochoice`;
        const nc = node.nochoice;
        if (nc.text !== undefined && typeof nc.text !== 'string') {
          errors.push({ path: `${ncPath}.text`, message: 'nochoice.text must be a string when provided' });
        }
        if (nc.visibleIf) {
          errors.push({
            path: `${ncPath}.visibleIf`,
            message: 'nochoice cannot have `visibleIf` — it fires unconditionally',
          });
        }
        if (nc.actions) walkActions(nc.actions, `${ncPath}.actions`, errors, adventure);
        if (nc.next && !dialog.nodes[nc.next]) {
          errors.push({
            path: `${ncPath}.next`,
            message: `next node "${nc.next}" is not defined`,
          });
        }
      }
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

  // Case files: walk every `availableIf` so unknown condition types and
  // bad payloads surface here too. The loader is responsible for case-id
  // uniqueness; we still double-check it for defence in depth.
  const caseFiles = adventure.caseFiles ?? [];
  const seenCaseIds = new Set<string>();
  caseFiles.forEach((c, i) => {
    const cPath = `caseFiles[${i}]`;
    if (seenCaseIds.has(c.id)) {
      errors.push({ path: `${cPath}.id`, message: `duplicate case id "${c.id}"` });
    } else {
      seenCaseIds.add(c.id);
    }
    if (c.availableIf) walkCondition(c.availableIf, `${cPath}.availableIf`, errors, adventure);
    c.documents.forEach((d, di) => {
      const dPath = `${cPath}.documents[${di}]`;
      if (d.availableIf) walkCondition(d.availableIf, `${dPath}.availableIf`, errors, adventure);
    });
  });

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
  } else if (action.type === 'dreamTransition' && Array.isArray(action.actions)) {
    walkActions(action.actions as Action[], `${path}.actions`, errors, adventure);
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

/** Shared rect-shape validator used by display/hit blocks on SceneObject and
 *  anywhere else the engine accepts a Rect on the wire. `w` and `h` must be
 *  numbers; `x` and `y` are optional but must be numbers when present. */
function validateRectShape(
  rect: Record<string, unknown>,
  path: string,
  errors: AdventureValidationError[],
): void {
  if (typeof rect.w !== 'number') {
    errors.push({ path: `${path}.w`, message: 'w must be a number' });
  }
  if (typeof rect.h !== 'number') {
    errors.push({ path: `${path}.h`, message: 'h must be a number' });
  }
  if (rect.x !== undefined && typeof rect.x !== 'number') {
    errors.push({ path: `${path}.x`, message: 'x must be a number when provided' });
  }
  if (rect.y !== undefined && typeof rect.y !== 'number') {
    errors.push({ path: `${path}.y`, message: 'y must be a number when provided' });
  }
}

/**
 * Shape + geometry check for a hit-region polygon path. Requires at least
 * three vertices, all with numeric x and y. The closed polygon (implicit
 * edge from last vertex back to first) must not self-intersect.
 */
function validatePathShape(
  path: unknown,
  pathLabel: string,
  errors: AdventureValidationError[],
): void {
  if (!Array.isArray(path)) {
    errors.push({ path: pathLabel, message: 'hit.path must be an array of points' });
    return;
  }
  if (path.length < 3) {
    errors.push({
      path: pathLabel,
      message: 'hit.path must contain at least 3 points',
    });
    return;
  }
  const pts: Point[] = [];
  let allValid = true;
  path.forEach((p, i) => {
    const point = p as unknown as Record<string, unknown>;
    if (!point || typeof point !== 'object') {
      errors.push({ path: `${pathLabel}[${i}]`, message: 'path point must be an object { x, y }' });
      allValid = false;
      return;
    }
    if (typeof point.x !== 'number') {
      errors.push({ path: `${pathLabel}[${i}].x`, message: 'x must be a number' });
      allValid = false;
    }
    if (typeof point.y !== 'number') {
      errors.push({ path: `${pathLabel}[${i}].y`, message: 'y must be a number' });
      allValid = false;
    }
    if (typeof point.x === 'number' && typeof point.y === 'number') {
      pts.push({ x: point.x, y: point.y });
    }
  });
  if (!allValid) return;
  if (polygonSelfIntersects(pts)) {
    errors.push({
      path: pathLabel,
      message: 'hit.path polygon self-intersects (including the implicit closing edge)',
    });
  }
}

/** Shape check for an `OverlayPlace`: `top` and `left` required numbers,
 *  `scale` optional number (defaults to 100 when omitted). Used by the
 *  scene-object display block validator. */
function validatePlaceShape(
  place: unknown,
  path: string,
  errors: AdventureValidationError[],
): void {
  if (!place || typeof place !== 'object') {
    errors.push({ path, message: 'place must be an object { top, left, scale? }' });
    return;
  }
  const p = place as Record<string, unknown>;
  if (typeof p.top !== 'number') {
    errors.push({ path: `${path}.top`, message: 'place.top must be a number' });
  }
  if (typeof p.left !== 'number') {
    errors.push({ path: `${path}.left`, message: 'place.left must be a number' });
  }
  if (p.scale !== undefined && typeof p.scale !== 'number') {
    errors.push({ path: `${path}.scale`, message: 'place.scale must be a number when provided' });
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
  ['dialogs', 'mansion dialogs are declared inline on the owning interaction (interaction.dialog), not in a top-level dialogs map'],
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

/**
 * Validate a cases config file (src/config/main/cases.json or
 * src/config/adventures/<patientId>.cases.json) for structural shape only.
 * Checks required fields and within-file id uniqueness. Cross-file uniqueness
 * and condition payloads are validated downstream (loader + validateAdventure).
 */
export function validateCasesConfig(config: unknown): AdventureValidationError[] {
  const errors: AdventureValidationError[] = [];
  if (!isPlainObject(config)) {
    errors.push({ path: '', message: 'cases config must be an object' });
    return errors;
  }
  if (!Array.isArray(config.cases) || config.cases.length === 0) {
    errors.push({ path: 'cases', message: 'cases is required (non-empty array)' });
    return errors;
  }

  const seenCaseIds = new Set<string>();
  config.cases.forEach((entry, i) => {
    const cPath = `cases[${i}]`;
    if (!isPlainObject(entry)) {
      errors.push({ path: cPath, message: 'case entry must be an object' });
      return;
    }
    if (typeof entry.id !== 'string' || !entry.id) {
      errors.push({ path: `${cPath}.id`, message: 'id is required (non-empty string)' });
    } else if (seenCaseIds.has(entry.id)) {
      errors.push({ path: `${cPath}.id`, message: `duplicate case id "${entry.id}" in this file` });
    } else {
      seenCaseIds.add(entry.id);
    }
    if (typeof entry.label !== 'string' || !entry.label) {
      errors.push({ path: `${cPath}.label`, message: 'label is required (non-empty string)' });
    }
    if (entry.subtitle !== undefined && typeof entry.subtitle !== 'string') {
      errors.push({ path: `${cPath}.subtitle`, message: 'subtitle must be a string when provided' });
    }
    if (entry.availableIf !== undefined && !isPlainObject(entry.availableIf)) {
      errors.push({ path: `${cPath}.availableIf`, message: 'availableIf must be a Condition object' });
    }
    if (!Array.isArray(entry.documents) || entry.documents.length === 0) {
      errors.push({
        path: `${cPath}.documents`,
        message: 'documents is required (non-empty array)',
      });
      return;
    }
    const seenDocIds = new Set<string>();
    entry.documents.forEach((doc, di) => {
      const dPath = `${cPath}.documents[${di}]`;
      if (!isPlainObject(doc)) {
        errors.push({ path: dPath, message: 'document entry must be an object' });
        return;
      }
      if (typeof doc.id !== 'string' || !doc.id) {
        errors.push({ path: `${dPath}.id`, message: 'id is required (non-empty string)' });
      } else if (seenDocIds.has(doc.id)) {
        errors.push({
          path: `${dPath}.id`,
          message: `duplicate document id "${doc.id}" within case`,
        });
      } else {
        seenDocIds.add(doc.id);
      }
      if (typeof doc.label !== 'string' || !doc.label) {
        errors.push({ path: `${dPath}.label`, message: 'label is required (non-empty string)' });
      }
      if (typeof doc.path !== 'string' || !doc.path) {
        errors.push({ path: `${dPath}.path`, message: 'path is required (non-empty string)' });
      }
      if (doc.availableIf !== undefined && !isPlainObject(doc.availableIf)) {
        errors.push({
          path: `${dPath}.availableIf`,
          message: 'availableIf must be a Condition object',
        });
      }
    });
  });

  return errors;
}
