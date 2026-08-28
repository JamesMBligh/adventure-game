# CLAUDE.md

Guidance for Claude Code sessions working on this repository.

## What this is

A Vue 3 + Vite + TypeScript runtime for **point-and-click adventure games defined entirely by JSON**. The engine is intentionally generic: scene-object types, action types, and condition types are all dispatched through registries so new behaviour can be plugged in without touching the runtime.

The repo ships **one player-facing game** — *The Wren House* (`src/config/main/main.json`), a vertical slice of an in-progress story about an apprentice who walks into other people's dreams. The engine also retains `cabin.json` as a dev-only regression fixture.

The story design lives in a separate repo: `https://github.com/JamesMBligh/adventure-story`. Background, characters, the device, the dreamworld rules, the patient roster, and the season arc all live there. Treat that repo as authoritative when authoring or extending content.

## Stack & commands

- **Vue 3** (script-setup, `<script setup lang="ts">`), **Vite 5**, **TypeScript** (strict).
- `npm run dev` — local dev server (default port 5173).
- `npm run build` — `vue-tsc --noEmit && vite build`. Run after non-trivial changes.
- `npm run typecheck` — `vue-tsc --noEmit` only.
- `npm test` — Vitest, engine-layer tests under `src/engine/*.test.ts`.
- `npm run lint` — ESLint (flat config).
- `npm run format` / `npm run format:check` — Prettier.

## Architecture

### Engine (`src/engine/`)

- `../types.ts` — domain types: `Adventure`, `Scene`, `SceneObject`, `Action`, `Condition`, `GameState`, `NarrationEntry`, `Dialog`, `DialogNode`, `DialogChoice`, `PatientDef`, `PatientRuntimeState`, `PatientStatus`. `Action` and `Condition` are intentionally open-ended: `{ type: string, ...rest }`.
- `registry.ts` — five registries: `actionRegistry`, `conditionRegistry`, `actionValidatorRegistry`, `conditionValidatorRegistry`, `objectComponentRegistry`. `ActionContext` is what handlers receive (`{ engine, object?, trigger? }`).
- `actions.ts` — built-in actions: `narrate`, `goto`, `setFlag`, `addItem`, `removeItem`, `hideObject`, `showObject`, `if`, `sequence`, `wait`, `startDialog`, `endDialog`, `setPatientStatus`, `recordPatientNote`, `enterDream`, `wake`, `speakExitPhrase`. `runActions(actions, ctx)` is the entry point.
- `conditions.ts` — built-in conditions: `flag`, `hasItem`, `scene`, `and`, `or`, `not`, `patientStatus`, `patientHas`, `inDream`, `activePatient`. `evaluateCondition(cond, ctx)` returns boolean.
- `engine.ts` — `GameEngine` class. Holds the reactive `GameState`, exposes `currentScene`, `visibleObjects`, `activeDialog`, `activeDialogNode`, `availableChoices` (all `ComputedRef`s), `pushNarration()`, `enterScene(id)`, `fireTrigger(obj, name)`, `chooseDialogOption(i)`, `start()`, `serialize()`, `restore(snapshot)`. `ensureBuiltInsRegistered()` wires built-ins idempotently.
- `assets.ts` — `isUrlLike` / `resolveAssetUrl` for adventure asset paths under GitHub Pages base.
- `validate.ts` — `validateAdventure(adv)` walks an adventure and returns errors for unknown action/condition types, missing required fields, undefined dialog nodes, missing dream scenes, etc. Run at load-time before constructing the engine.
- `persistence.ts` — `saveGame` / `loadGame` / `hasSave` / `clearSave` / `attachAutosave`. Single autosave key (`adventure-engine.save`). Autosave is wired in via `engine.onPersist`, which is fired after `enterScene`, `fireTrigger`, `chooseDialogOption`, and `start`.
- `layout.ts` — `SCENE_WIDTH = 960`, `SCENE_HEIGHT = 540`. Object rects in adventure JSON are percentages of these, so changing them rescales everything cleanly.
- `index.ts` — public re-exports. Treat this as the engine's surface API.

### Components (`src/components/`)

- `AdventureGame.vue` — host component. Takes `adventure`, `adventureId`, optional `resumeFrom` snapshot. Owns the `GameEngine`. Wires autosave, restores on resume. Renders different chrome in hub vs dream scenes (header text, narration tint).
- `SceneView.vue` — fixed-size scene canvas. Renders background and absolutely-positioned `SceneObjectView`s.
- `SceneObjectView.vue` — generic clickable region. Looks up its inner renderer in `objectComponentRegistry` keyed by `object.type` (default `hotspot`).
- `HotspotObject.vue` — default object renderer (transparent box, optional image, optional colour overlay).
- `NarrationPanel.vue` — scrollable log; auto-scrolls on new entries. When a dialog is active, renders the active node's choices as buttons after the latest narration line.
- `SidePanel.vue` — inventory panel (player items only). Visible in both mansion and dream views.
- `CaseFilesModal.vue` — full-screen modal opened from the header's Case Files tab. Two-pane layout: cases list on the left → per-case document list (with back link) → markdown content on the right. Esc and backdrop click close.
- `MarkdownView.vue` — drops a hand-rolled `renderMarkdown(src)` result via `v-html` in a scoped, styled wrapper. Used by the case-files modal.
- `StartPage.vue` — single-game title screen. New Game / Continue / About. Lists dev fixtures only when `import.meta.env.DEV` is true.

### App shell

- `src/App.vue` — switches between `StartPage` and `AdventureGame`. A `sessionKey` ref is bumped each launch so re-entering remounts with fresh state. Forwards an optional `SavedGame` snapshot for Continue.
- `src/main.ts` — mounts `App` and imports global `style.css`.

### Config (adventures + assets)

Authored content and its assets live under `src/config/`:

- `src/config/index.ts` — `mainAdventure` is the single canonical game. `adventureCatalog` includes it plus dev-only fixtures (gated behind `import.meta.env.DEV`). Imported as `'../config'` or `'./config'`. The main-adventure loader composes the playable Adventure by **merging dream files into main.json** at load time — see the dreams convention below.
- `src/config/main/` — The mansion (outside-the-dream) half of the main game and its assets.
  - `main.json` — *The Wren House*: title, flags, patients, sites (`mansion_first_floor`, `patient_rooms`), interactions, and mansion-side dialogs. No `scenes`, no `initialState.inventory`, no `items` — inventory is a dream-only concept.
  - `floor1.webp`, `floor2.webp`, `location-icon.png`, `travel-icon-{left,up,down,right}.png` — site backgrounds and location markers.
- `src/config/adventures/` — one file per dream and one per dev fixture, plus optional sibling case files.
  - `whitfield.json` — Catherine Whitfield's dream world: scenes (`whitfield_stage`, `whitfield_wings`, `whitfield_corridor`) and the dream-only dialogs (`whitfieldGreeting`, `whitfieldExit`). Witness, not exorcism. Exit phrase: *the light in the conservatory*.
  - `whitfield.cases.json` — Whitfield's case file metadata. Markdown content lives in `whitfield/*.md`.
  - `whitfield/` — markdown documents referenced by `whitfield.cases.json`.
  - `cabin.json` — engine regression bed: hidden keys, conditional reveals, narration kinds, flag declarations, scene-kind (`hub` `clearing` + `dream` `interior`/`cellar`), and the `dreamTransition` action (moonwell in/out + looking-glass out + vanilla door out — three deliberately different exit paths). Dev-only catalog entry.

**Dreams convention.** Each patient with a dream gets a file whose name matches the patient id. At load time, `loadMainAdventure()` in `src/config/index.ts` enumerates dream files via `import.meta.glob('./adventures/*.json')`, and for every patient id that matches a dream file, merges that file's `scenes`, `dialogs`, and `items` into the composed Adventure. The patient definition's existing `dreamScene` field is what links a patient to a scene in their merged dream. Dreams may also declare `initialState.inventory`; the field is reserved for forthcoming dream-scoped inventory work and is currently ignored.

**Case files convention.** Case files are authored separately from dream and mansion content. The mansion-wide case file lives at `src/config/main/cases.json` (markdown under `src/config/main/cases/*.md`). Per-patient case files live at `src/config/adventures/<patientId>.cases.json` (markdown under `src/config/adventures/<patientId>/*.md`). The loader resolves each document's `.md` path to its raw string content at load time (via `resolveMarkdown` in `src/engine/assets.ts`) and AND-s an implicit patient-availability gate (`inResidence | improving | healed`) onto every dream-sourced case's `availableIf`, so authors don't have to repeat that condition per entry. The engine exposes `availableCaseFiles` and `isDocumentAvailable(doc)`; the UI is in `CaseFilesModal.vue`.

**Three file types, validated separately.** The mansion config (`main.json`), dream configs (`adventures/<patient>.json`), and cases configs (`main/cases.json`, `adventures/<patient>.cases.json`) are typed independently — `MansionConfig`, `DreamConfig`, `CasesConfig` in [src/types.ts](src/types.ts) — and will evolve independently. Each file gets a per-file structural validator (`validateMansionConfig`, `validateDreamConfig`, `validateCasesConfig` in [src/engine/validate.ts](src/engine/validate.ts)) that runs before the merge, rejects wrong-file fields, and surfaces required-field omissions. Validators emit prefixed paths (e.g. `main.json:scenes`, `adventures/whitfield.json:dreams.whitfield.title`, `adventures/whitfield.cases.json:cases[0].id`) so error attribution is unambiguous. The existing `validateAdventure` continues to validate the merged result for cross-cutting checks (reference resolution, action/condition payloads, condition payloads on case `availableIf`, etc.).

**Asset references in JSON.** Image-path strings in adventure JSON (e.g. `"background": "main/floor1.webp"`) are resolved by `src/engine/assets.ts`: `import.meta.glob` enumerates all images under `src/config/` so Vite bundles and hashes them. The path you write is the path relative to `src/config/`. Anything not found in the registry falls back to a `BASE_URL`-prefixed URL, so `public/` still works for non-config assets. A parallel glob with the `?raw` query handles markdown — `resolveMarkdown(path)` returns the bundled file content as a string, used by the case-files loader.

## Adventure JSON shape (essentials)

```jsonc
{
  "title": "...",
  "author": "...",
  "startScene": "sceneId",
  "initialState": { "flags": {}, "inventory": [] },
  "items": { "key": { "name": "Brass Key", "description": "..." } },
  "patients": {
    "whitfield": {
      "name": "Catherine Whitfield",
      "dreamScene": "dreamSceneId",
      "maxSessions": 6
    }
  },
  "dialogs": {
    "dialogId": {
      "id": "dialogId",
      "start": "nodeId",
      "nodes": {
        "nodeId": {
          "speaker": "Wren",
          "text": "...",
          "choices": [
            { "text": "Reply", "actions": [/* actions */], "next": "anotherNode" },
            { "text": "Hidden until X", "visibleIf": { "type": "flag", "flag": "x" } }
          ]
        }
      }
    }
  },
  "scenes": {
    "sceneId": {
      "name": "Display Name",
      "kind": "hub" | "dream",
      "background": "#hex | rgb(...) | linear-gradient(...) | /url.jpg",
      "description": "Auto-narrated on enter (optional).",
      "onEnter": [/* actions */],
      "onExit":  [/* actions */],
      "objects": [
        {
          "id": "uniqueId",
          "name": "Display name",
          "type": "hotspot",
          "rect": { "x": 0, "y": 0, "w": 100, "h": 100 },
          "color": "rgba(...)",
          "image": "/path.png",
          "initiallyHidden": false,
          "visibleIf": { "type": "flag", "flag": "x" },
          "triggers": {
            "onClick": [/* actions */],
            "onHover": [/* actions */]
          }
        }
      ]
    }
  }
}
```

Triggers are arbitrary string keys; the engine just runs whichever action list matches the event you fire. New trigger names cost nothing.

## How to extend

### Add a dream

1. Create `src/config/adventures/<patientId>.json` (the file name must match the patient id in `main.json`). Declare its `scenes` (the dream world's rooms) and any dream-only `dialogs`. Optionally declare `items` and `initialState.inventory` (the latter is reserved for forthcoming dream-scoped inventory work).
2. Add a `patients.<patientId>` entry to `main.json` (or update an existing one) with `dreamScene` pointing to the entry scene id you just defined. No catalog edit needed — the loader picks the dream up automatically.

### Add a case file

1. **Mansion-wide cases.** Author `src/config/main/cases.json` with a `cases` array. Each case has `id` (globally unique), `label`, optional `subtitle`, optional `availableIf`, and a `documents` array. Each document has `id` (unique within the case), `label`, `path` (relative to `src/config/`), and optional `availableIf`. Co-locate the `.md` files under `src/config/main/cases/`.
2. **Per-patient cases.** Author `src/config/adventures/<patientId>.cases.json` with the same shape. The loader AND-s in an implicit patient-availability gate so the case only appears once the patient is in residence / improving / healed. Co-locate `.md` files under `src/config/adventures/<patientId>/`.
3. Both the tab in the header and the modal appear automatically when at least one case is available.

### Add a standalone adventure (e.g. another dev fixture)

1. Add the JSON under `src/config/adventures/`. Co-locate its image assets in the same folder; reference them from JSON as paths relative to `src/config/` (e.g. `"main/floor1.webp"`).
2. Append it to `adventureCatalog` in `src/config/index.ts`. Use a dynamic import so it lazy-loads. Set `devOnly: true` for fixtures.

### Add an action / condition / object type

```ts
import { actionRegistry, actionValidatorRegistry } from './engine/registry';
actionRegistry.register('myAction', (action, ctx) => { /* ... */ });
actionValidatorRegistry.register('myAction', (action) => {
  return typeof action.foo === 'string' ? [] : ['"myAction" requires "foo"'];
});
```

Validators are optional but recommended — they catch authoring mistakes at load-time before the player sees them.

Object types: `objectComponentRegistry.register('myType', MyComponent)`. The component receives the `SceneObject` as a prop.

## Conventions & gotchas

- **Object ids must be globally unique across scenes.** `state.objectState` is keyed by `SceneObject.id` alone, so reusing an id leaks hide/show state between scenes. **Critical for dreams**: per-session persistence (a found object stays found across re-entries) relies on stable, scene-unique object ids. Don't rename them once authored.
- **Don't break the percentage-based `rect`s** when changing `SCENE_WIDTH`/`SCENE_HEIGHT` — they're deliberately resolution-independent.
- **`ensureBuiltInsRegistered()`** must be called before any `GameEngine` is constructed. `AdventureGame.vue` and `StartPage.vue` both do this.
- **State is `reactive`**, but `engine` itself is held in a `shallowRef` so swapping adventures replaces the entire instance cleanly.
- **Saves are JSON, schema-versioned.** Bumping `SCHEMA_VERSION` in `engine.ts` invalidates older saves cleanly. Do that whenever the snapshot shape changes.
- **The `wake` and `speakExitPhrase` actions clear `state.activePatientId`** but do not automatically end an active dialog. If you wake from inside a dialog choice, end the dialog explicitly (`endDialog` before/after the wake action).
- **No comments unless they explain non-obvious WHY.** Don't restate code in prose.
- **Don't introduce cross-cutting abstractions** for hypothetical future requirements.

## Deployment

- `.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main`.
- `vite.config.ts` reads `BASE_PATH` (set by `actions/configure-pages`) so asset URLs resolve under `/<repo-name>/` for project Pages sites and `/` for user/org or custom-domain sites.
- One-time setup in the GitHub repo: **Settings → Pages → Source: GitHub Actions**.
