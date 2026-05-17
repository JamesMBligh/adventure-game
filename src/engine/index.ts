export { GameEngine, ensureBuiltInsRegistered, SCHEMA_VERSION } from './engine';
export type { EngineSnapshot } from './engine';
export {
  actionRegistry,
  conditionRegistry,
  actionValidatorRegistry,
  conditionValidatorRegistry,
  objectComponentRegistry,
  Registry,
  type ActionHandler,
  type ConditionHandler,
  type ActionValidator,
  type ConditionValidator,
  type ActionContext,
} from './registry';
export { runActions } from './actions';
export { evaluateCondition } from './conditions';
export {
  validateAdventure,
  validateMansionConfig,
  validateDreamConfig,
  formatValidationErrors,
  type AdventureValidationError,
} from './validate';
export { isUrlLike, resolveAssetUrl } from './assets';
export {
  saveGame,
  loadGame,
  hasSave,
  clearSave,
  attachAutosave,
  type SavedGame,
} from './persistence';
