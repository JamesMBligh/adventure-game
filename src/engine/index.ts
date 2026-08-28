export {
  GameEngine,
  ensureBuiltInsRegistered,
  SCHEMA_VERSION,
  getWordRevealMs,
  setWordRevealMs,
  getDreamTransitionFadeMs,
  getDreamTransitionHoldMs,
  setDreamTransitionTiming,
} from './engine';
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
  validateCasesConfig,
  formatValidationErrors,
  type AdventureValidationError,
} from './validate';
export { isUrlLike, resolveAssetUrl, resolveMarkdown, getImageNaturalSize } from './assets';
export {
  effectiveDisplayRect,
  effectiveDisplayPlace,
  effectiveHit,
  effectiveHitRect,
  pointInEllipse,
  pointInPolygon,
  polygonSelfIntersects,
  type HitShape,
} from './sceneObjects';
export {
  saveGame,
  loadGame,
  hasSave,
  clearSave,
  attachAutosave,
  type SavedGame,
} from './persistence';
