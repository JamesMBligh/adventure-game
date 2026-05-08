# Next steps

Plan derived from a review of the engine + Vue host. Grouped by tier so the cut line is easy to pick.

## Tier 1 — Bugs & dead code (small, safe)

1. **Move narration ID counter to instance state** — [src/engine/engine.ts:14](src/engine/engine.ts:14). Replace the module-level `narrationCounter` with a private field on `GameEngine` so IDs reset with each new engine.

2. **Remove the dead `adventure` watch in `AdventureGame.vue`** — [src/components/AdventureGame.vue:23–29](src/components/AdventureGame.vue:23). `App.vue` already remounts via `:key="sessionKey"`, so the watch never fires. Delete it; keep the `:key` approach (simpler, correctly resets all child state).

3. **Drop the `border: 1px dashed transparent` in `HotspotObject.vue`** — [src/components/HotspotObject.vue:24](src/components/HotspotObject.vue:24). Dead style; remove.

## Tier 2 — Robustness

4. **Tighten background-string detection** — [src/components/SceneView.vue:15–26](src/components/SceneView.vue:15). Replace the `startsWith('#'|'rgb'|'hsl')` heuristic with: treat as a URL only if it looks like one (`/`, `.`, or `http`); otherwise pass through as a CSS value. Lets adventures use `oklch(...)`, gradients, `var(--x)`.

5. **Resolve adventure asset paths against `BASE_URL`** — [src/components/SceneView.vue](src/components/SceneView.vue), [src/components/HotspotObject.vue](src/components/HotspotObject.vue). When background/image is a URL-shaped string, prefix with `import.meta.env.BASE_URL` so paths work under GitHub Pages project sites. Single helper, called from both renderers.

6. **Improve unknown-type warnings** — [src/engine/conditions.ts:8](src/engine/conditions.ts:8), [src/engine/actions.ts:14](src/engine/actions.ts:14). Include the object id and trigger name in the warning so authors can locate the bad action/condition without grepping. (Pull `ctx.object?.id` and `ctx.trigger` into the message.)

7. **Document or scope `objectState` keying** — [src/engine/engine.ts:43–58](src/engine/engine.ts:43). Either (a) add a comment that ids must be globally unique across scenes, or (b) key by `${sceneId}/${objId}`. Recommend (a) for now since the cabin assumes it; revisit when authoring multi-scene puzzles that reuse ids.

## Tier 3 — Design improvements

8. **Convert `visibleObjects()` to a `ComputedRef`** — [src/engine/engine.ts:43](src/engine/engine.ts:43). Expose `visibleObjects: ComputedRef<SceneObject[]>` instead of a method. Lets `SceneView` consume it directly and gets Vue's caching.

9. **Validate action & condition payloads at load time** — new helper in `src/engine/`. After `entry.load()` resolves in `StartPage.vue`, walk the adventure and check each action/condition has the fields its registered handler needs. Surface errors before the player sees them. Cheapest version: each registered handler optionally exposes a `validate(action) => string[]` returning error messages; engine collects them.

## Tier 4 — Tooling

10. **Add Vitest with engine-layer tests** — new `tests/` or co-located `*.test.ts`. Cover: `evaluateCondition` for each built-in, `runActions` happy path, `if/then/else` branching, `addItem` idempotence, `hideObject`/`showObject` interplay with `initiallyHidden` and `visibleIf`. Pure functions, no Vue mounting needed.

11. **(Optional) ESLint + Prettier** — keeps style consistent once contributors arrive. Low value while it's just you.
