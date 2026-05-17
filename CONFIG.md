# Adventure Engine — Config Reference

Comprehensive reference for the JSON config that drives the game. The engine itself is generic; everything on screen is described by these files.

For the editorial / narrative direction behind the content, see [story/](story/). For the codebase orientation, see [CLAUDE.md](CLAUDE.md).

---

## How this document is organized

The game is composed at load time from two kinds of file:

| File | Type | Purpose |
|---|---|---|
| `src/config/main/main.json` | `MansionConfig` | The mansion ("hub") — sites, interactions, patient registry, mansion dialogs |
| `src/config/adventures/<patientId>.json` | `DreamConfig` | One file per patient's dream world — scenes, dream-only dialogs, dream items |

The reference below splits everything into three parts:

- **[Part I — Mansion (main.json)](#part-i--mansion-mainjson)**: structures, actions, conditions, and enumerations that **only make sense when authoring mansion content**. The validator rejects them if they appear in a dream file.
- **[Part II — Dream (adventures/&lt;patientId&gt;.json)](#part-ii--dream-adventurespatientidjson)**: same, for dream files.
- **[Part III — Common](#part-iii--common-used-by-both)**: shared structures (Dialog, PatientDef, FlagDef) and the actions/conditions/enums used in both modes.

> **Note on enforcement.** The validator enforces *file shape* (you can't put `scenes` in a mansion file or `sites` in a dream file). It does **not** enforce *action context* — nothing stops you authoring `wake` inside a mansion interaction, it just won't do anything useful. The categorisation below reflects *intended use*, not strict prohibition.

The two preliminary sections — [Overview](#overview-loading--file-layout) and [Asset references](#asset-references) — apply equally to both file types.

---

## Overview: loading & file layout

`loadMainAdventure()` in [src/config/index.ts](src/config/index.ts) loads `main.json`, then for each patient id in `main.patients` it tries to load `./adventures/<patientId>.json`. It merges `scenes`, `dialogs`, and `items` from each dream file into a single composed `Adventure` object that the engine consumes. The two file types evolve independently; each has its own structural validator that runs before the merge.

```
src/config/
├── index.ts                           # catalog + loader (loadMainAdventure)
├── main/
│   ├── main.json                      # MansionConfig
│   ├── floor1.webp                    # mansion_first_floor background
│   ├── floor2.webp                    # patient_rooms background
│   ├── location-icon.png              # "standard" icon
│   └── travel-icon-{left,up,down,right}.png
└── adventures/
    ├── whitfield.json                 # DreamConfig — patients.whitfield
    └── cabin.json                     # standalone dev fixture (own catalog entry)
```

Conventions:

- **Dream file name = patient id**: patient `whitfield` ↔ `adventures/whitfield.json`. The loader picks it up automatically.
- **Mansion assets in `main/`, dream assets co-located with the dream file.**
- **`cabin.json` is a standalone dev-only adventure**, not a dream — it has its own `AdventureCatalogEntry` in `index.ts`.

**TypeScript types** live in [src/types.ts](src/types.ts) (`MansionConfig`, `DreamConfig`, `Adventure`, `Scene`, `SceneObject`, `Site`, `SiteLocation`, `Interaction`, `Dialog`, `DialogNode`, `DialogChoice`, `PatientDef`, `PatientStatus`, `FlagDef`, `ItemDef`, `SiteLocationIcon`).

---

## Asset references

Image paths inside JSON (e.g. `"background"` on a site, `"image"` on a scene object) are resolved by [src/engine/assets.ts](src/engine/assets.ts). The path is written **relative to `src/config/`** with no leading slash:

```jsonc
"background": "main/floor1.webp"
```

What `resolveAssetUrl` does, in order:

1. Returns `http(s)://` and `data:` URLs unchanged.
2. Looks the path up in a registry built from `import.meta.glob('../config/**/*.{png,jpg,jpeg,webp,gif,svg,avif}')` — if found, returns the Vite-hashed bundled URL.
3. Falls back to `${BASE_URL}<path>` for files that live in `public/`.

The same field also accepts **non-image values** — CSS colors, gradients, `var()`, `oklch()` — anything that doesn't look like a URL or path is passed through as a CSS background value. The URL-vs-CSS distinction is made by `isUrlLike` (looks for `http`, `data:`, leading `/`, `./`, `../`, or a path-with-extension shape).

---

# Part I — Mansion (main.json)

## I.1 File shape

```jsonc
{
  "title": "The Wren House",
  "startSite": "mansion_first_floor",
  "startInteraction": "study_offer",        // optional — auto-plays before the floor plan
  "flags":        { /* common: FlagDef map */ },
  "initialState": { "flags": { /* runtime flag overrides */ } },
  "patients":     { /* common: PatientId → PatientDef */ },
  "sites":        { /* siteId    → Site */ },
  "interactions": [ /* Interaction[] (ordered) */ ],
  "dialogs":      { /* common: dialogId → Dialog */ }
}
```

### Required

- `title` — string, shown on the title screen and in-game header.
- `startSite` — string, the site the player lands on at new game.
- `sites` — non-empty map.

### Forbidden (validator rejects)

| Field | Why |
|---|---|
| `scenes` | scenes belong in dream files |
| `items` | items belong in dream files; the mansion has no inventory |
| `startScene` | use `startSite` instead |
| `initialState.inventory` | inventory is a dream-only concept |

### Optional

- `startInteraction` — id of an interaction to auto-play before the floor plan shows.
- `flags` — declared flags with defaults; see [§ FlagDef](#iii1c-flagdef) (common).
- `initialState.flags` — runtime overrides of declared flag defaults (rarely needed).
- `patients` — see [§ PatientDef](#iii1b-patientdef) (common).
- `interactions` — see [§ I.2 Interaction](#i2-interaction). Ordered: at each location the **first qualifying** interaction wins.
- `dialogs` — mansion-side dialogs (started from interactions). See [§ Dialog](#iii1a-dialog--dialognode--dialogchoice) (common). Dream-only dialogs live in the dream files.

## I.2 Mansion-only structures

### `Site`

```jsonc
{
  "name": "First Floor — The Wren House",
  "background": "main/floor1.webp",       // image path | CSS color | gradient
  "description": "...",                    // optional, currently unused at render
  "locations": { /* locId → SiteLocation */ },
  "onEnter": [ /* Action[] */ ],
  "onExit":  [ /* Action[] */ ]
}
```

### `SiteLocation`

A clickable **point** on a site's floorplan. The location icon is rendered centered at `(x%, y%)`.

```jsonc
{
  "name": "Wren's Study",
  "x": 49,                     // % of viewport width
  "y": 17,                     // % of viewport height
  "icon": "standard",          // optional; default "standard". See § I.4 enums
  "target": "patient_rooms"    // optional; if set, clicking transitions to the named site
}
```

- **Without `target`**: clicking runs the first qualifying interaction at this location.
- **With `target`**: clicking transitions to the named site (with a 300 ms fade-to-black). No interaction lookup.
- **Location id must be globally unique across all sites** (validator enforces).
- **Visibility rules** (handled at runtime by `computeVisibleLocations`):
  - A non-transition location is hidden if no qualifying interaction exists.
  - A transition is hidden if the target site has no currently-qualifying interaction anywhere reachable. Back-links don't count as content.
  - A transition back to `startSite` is always shown from non-start sites — escape hatch so the player can never become stranded.
  - A `target` that points to a non-existent site is **warned** in the console at load (not a hard error) and hidden at runtime.

### `Interaction`

A self-contained encounter at a mansion location. Interactions are stored in an **ordered array**; the first one whose `conditions` all hold is the one that fires when the player clicks that location.

```jsonc
{
  "id": "study_offer",
  "location": "study",                                    // must match a SiteLocation id
  "conditions": [ /* Condition[]; all must hold */ ],
  "background": "linear-gradient(180deg, #2a1d12 0%, #140e0a 100%)",
  "animations": ["lamp-flicker", "vignette-flicker"],     // see § I.4 enums
  "onEnter": [ /* Action[] */ ],
  "onExit":  [ /* Action[] */ ],
  "dialog":  "wrenOffer"                                  // optional; auto-starts on entry
}
```

- **`conditions` omitted or empty** → always qualifies. Useful as a fallback at the end of the interactions list.
- **`dialog`** — when present, the named dialog auto-starts as soon as the interaction begins.
- **The interaction ends** when the dialog ends (via `endDialog`) or when an explicit `exitInteraction` action fires.

## I.3 Mansion-only actions

Use these inside mansion `interaction.onEnter` / `onExit`, mansion `dialog` choice actions, or `site.onEnter` / `onExit`. They have no useful effect from inside a dream.

| `type` | Required fields | Optional fields | Effect |
|---|---|---|---|
| `gotoSite` | `site: string` | | Switch the player to a mansion site. |
| `enterInteraction` | `interaction: string` | | Begin a specific mansion interaction by id. |
| `exitInteraction` | | | End the current mansion interaction. |
| `enterDream` | `patient: string` | | Sugar: bumps `sessionsCompleted` on the patient, marks them active, then `goto`s their `dreamScene`. The bridge from mansion → dream. |

## I.4 Mansion-only conditions

| `type` | Required fields | Returns true when |
|---|---|---|
| `atSite` | `site: string` | The player's current site id matches. Always false from inside a dream. |

## I.5 Mansion-only enumerations

### `SiteLocation.icon` (`SiteLocationIcon`)

The marker drawn at the location's `(x, y)` point. All five icons are scaled to a uniform 56×56 box on the floorplan; hover/focus reveals the location name as a tooltip above the icon.

| Value | File | Typical use |
|---|---|---|
| `"standard"` *(default if omitted)* | `main/location-icon.png` | A room or named place |
| `"left"` | `main/travel-icon-left.png` | Travel arrow pointing left |
| `"up"` | `main/travel-icon-up.png` | Travel arrow pointing up |
| `"down"` | `main/travel-icon-down.png` | Travel arrow pointing down |
| `"right"` | `main/travel-icon-right.png` | Travel arrow pointing right |

### `Interaction.animations`

The `animations` field on an `Interaction` is a list of named ambient effects, each rendered as an absolutely-positioned layer over the interaction's background. Class application is mechanical: every name becomes a CSS class `anim-<name>`. To add a new animation, add the keyframes + `.image.anim-<name> .layer.<which> { … }` rule in [src/components/mansion/InteractionView.vue](src/components/mansion/InteractionView.vue).

| Value | Effect | Layer used |
|---|---|---|
| `"glow-pulse"` | Warm golden glow that pulses across 6 seconds. | `.glow` |
| `"vignette-flicker"` | A vignette that fades up and back on an irregular flicker. | `.vignette` |
| `"dim"` | Static heavy vignette — gives "dim lamp" gravity to a scene. | `.vignette` |
| `"lamp-flicker"` | A warm point of light that flickers as a guttering lamp would. | `.lamp` |
| `"rain"` | Diagonal repeating-gradient sheets, scrolling. | `.rain` |

Animations stack — passing multiple names overlays the effects. Typical pairs: `["lamp-flicker", "vignette-flicker"]` for a warm interior at night; `["glow-pulse", "vignette-flicker"]` for the treatment room rig.

---

# Part II — Dream (adventures/&lt;patientId&gt;.json)

## II.1 File shape

```jsonc
{
  "scenes":  { /* sceneId  → Scene */ },
  "dialogs": { /* common: dialogId → Dialog (dream-only ones) */ },
  "items":   { /* itemId   → ItemDef */ },
  "initialState": { "inventory": [ /* string[] */ ] }
}
```

### Required

- `scenes` — non-empty map. The dream world's rooms.

### Forbidden (validator rejects)

| Field | Why |
|---|---|
| `title`, `startSite`, `startScene`, `startInteraction` | belong in main.json |
| `sites`, `interactions`, `patients`, `flags` | mansion concerns |

### Optional

- `dialogs` — dream-only dialogs (started by scene objects or scene `onEnter` lists). See [§ Dialog](#iii1a-dialog--dialognode--dialogchoice) (common). Merged into the composed Adventure's dialog map alongside mansion dialogs.
- `items` — see [§ II.2 ItemDef](#itemdef). Merged into the composed Adventure's items map.
- `initialState.inventory` — *reserved*. The shape is allowed by the validator, but the engine does not currently apply per-dream initial inventory on `enterDream` / clear it on `wake`. Declaring it today is harmless; the feature will be wired up when needed.

## II.2 Dream-only structures

### `Scene`

```jsonc
{
  "name": "Concert Hall — Wings",
  "kind": "dream",                          // see § II.4 enums (default "hub")
  "background": "...",                      // image path or CSS background
  "description": "The wings. …",            // narrated on first enter
  "onEnter": [ /* Action[] */ ],
  "onExit":  [ /* Action[] */ ],
  "objects": [ /* SceneObject[] */ ]
}
```

### `SceneObject`

A clickable rectangle inside a scene.

```jsonc
{
  "id": "wf_catherine",
  "name": "A woman, half in shadow",
  "type": "hotspot",                              // optional; default "hotspot"
  "rect": { "x": 28, "y": 40, "w": 14, "h": 45 }, // % of viewport
  "color": "rgba(220, 200, 200, 0.08)",           // optional CSS background
  "image": "...",                                 // optional sprite/image overlay
  "initiallyHidden": false,                       // hidden until showObject
  "visibleIf": { /* Condition */ },               // alternative to hidden flag
  "triggers": {
    "onClick": [ /* Action[] */ ],
    "onHover": [ /* Action[] */ ]
    // any other trigger name is fine; the engine fires whatever you fire
  },
  "data": { /* free-form bag for custom object types */ }
}
```

> **Critical**: object ids must be globally unique across all scenes — per-object state (`hidden`, `data`) is keyed by id alone, so collisions leak state between scenes.

### `ItemDef`

```jsonc
{ "name": "Brass key", "description": "Tarnished.", "image": "..." }
```

Items live in **dream files only** (the mansion has no inventory by design). Reserved for forthcoming dream-scoped inventory work.

## II.3 Dream-only actions

Use these inside scene `onEnter` / `onExit`, scene object triggers, or dialog choices that fire while inside a dream.

| `type` | Required fields | Optional fields | Effect |
|---|---|---|---|
| `goto` | `scene: string` | | Enter a (dream) scene. Runs the previous scene's `onExit` and the new scene's `onEnter`. |
| `hideObject` | | `object?: string` (defaults to current trigger object) | Mark a scene object hidden. State persists across scene re-entries. |
| `showObject` | | `object?: string` (defaults to current trigger object) | Mark a scene object visible (overrides `initiallyHidden`). |
| `addItem` | `item: string` | | Add an item to inventory. No-op if already held; pushes a `system` narration line. |
| `removeItem` | `item: string` | | Remove an item from inventory. |
| `wake` | | `interaction?: string`, `scene?: string` | Clear `activePatientId` and return to the mansion. If neither target is given, falls back to `startScene` then `startSite`. The bridge from dream → mansion. |
| `speakExitPhrase` | `expected: string` | `phrase?: string`, `wakeInteraction?: string`, `wakeScene?: string`, `onWrong?: Action[]` | Echo `phrase` as Ashley dialogue; if it matches `expected` (case- and whitespace-insensitive), wake; else run `onWrong`. |

## II.4 Dream-only conditions

| `type` | Required fields | Returns true when |
|---|---|---|
| `scene` | `scene: string` | The current scene id matches. Always false outside a dream (no current scene). |
| `hasItem` | `item: string` | The item is in inventory. Since inventory is dream-scoped, always false in mansion mode. |

## II.5 Dream-only enumerations

### `Scene.kind`

| Value | Meaning |
|---|---|
| `"hub"` *(default)* | Legacy point-and-click room. Used by the cabin dev fixture; not used in dream files. |
| `"dream"` | A scene inside a patient's mind. The [`inDream`](#iii3-common-conditions) condition returns true when the current scene's `kind` is `"dream"`. |

Inside a dream file, every scene should be `kind: "dream"`.

### Triggers (`SceneObject.triggers`)

Triggers are arbitrary string keys mapped to action lists. The engine fires whichever trigger name the UI fires; new trigger names cost nothing.

| Trigger | Fired by |
|---|---|
| `"onClick"` | `SceneObjectView` on click. |
| `"onHover"` | `SceneObjectView` on `mouseenter` / `focus`. |
| *(any other)* | Only fires when something explicitly calls `engine.fireTrigger(obj, "<name>")`. |

---

# Part III — Common (used by both)

## III.1 Shared structures

### III.1.a `Dialog` / `DialogNode` / `DialogChoice`

Dialogs are declared in either `main.json` (mansion dialogs, started from interactions) or in dream files (dream-only dialogs, started from scene objects or scene `onEnter`). Both halves merge into a single dialog map at load time; ids must be globally unique.

```jsonc
{
  "id": "wrenOffer",
  "start": "open",
  "nodes": {
    "open": {
      "speaker": "Wren",                  // optional
      "text":    "Sit a moment. …",
      "choices": [
        {
          "text": "Yes. I can.",
          "visibleIf": { /* Condition; choice hidden when false */ },
          "actions":   [ /* Action[] run when chosen */ ],
          "next":      "why"              // optional; advance to another node
        }
      ]
    }
  }
}
```

- A node with no `choices` ends the dialog after its `text` is shown.
- A choice with no `next` and no `endDialog` in `actions` also ends the dialog (no follow-up node).
- `visibleIf` lets you write branching that adapts to game state.

### III.1.b `PatientDef`

Declared in `main.json` under the top-level `patients` map. Bridges to the dream file via `dreamScene`.

```jsonc
{
  "name": "Catherine Whitfield",
  "presenting": "Concert pianist, mid-40s. Stage fright …",  // short summary
  "file":       "Five sessions in. Three with Wren operating …",  // longer text
  "dreamScene": "whitfield_stage",                            // entry scene id
  "maxSessions": 6                                            // optional
}
```

- The patient id (the key in `patients`) is what links to the matching dream file (`adventures/<patientId>.json`).
- `dreamScene` must resolve to a scene in the merged Adventure (the validator catches typos).
- The patient's runtime state (`status`, `sessionsCompleted`, `notes`) is mutated by common actions: [`enterDream`](#i3-mansion-only-actions), [`setPatientStatus`](#iii2-common-actions), [`recordPatientNote`](#iii2-common-actions).

### III.1.c `FlagDef`

Declared in `main.json` under the top-level `flags` map. Flag values are read/written from any context.

```jsonc
{ "default": false, "description": "Optional authoring note." }
```

- The `default` value seeds `state.flags[<name>]` at game start.
- `initialState.flags` in main.json can override defaults (rarely needed).
- Action [`setFlag`](#iii2-common-actions) and condition [`flag`](#iii3-common-conditions) reference flags by name; the validator warns if a flag isn't declared.

## III.2 Common actions

Available in any context — mansion `interaction`/`dialog`, dream `scene`/`object`/`dialog`.

| `type` | Required fields | Optional fields | Effect |
|---|---|---|---|
| `narrate` | `text: string` | `speaker?: string`, `kind?: "narration" \| "dialog" \| "system"` | Push a line to the narration log. `kind` defaults to `"narration"`. See [§ III.4 Narration kind](#iii4a-narration-kind). |
| `setFlag` | `flag: string` | `value?: any` (defaults to `true`) | Set a game flag. Validator warns if flag isn't declared. |
| `if` | `condition: Condition` | `then?: Action[]`, `else?: Action[]` | Branch on a condition. |
| `sequence` | `actions: Action[]` | | Run a nested action list (useful inside `if.then`). |
| `wait` | `ms: number` (≥ 0) | | Pause before the next action. |
| `startDialog` | `dialog: string` | `node?: string` (defaults to dialog's `start`) | Begin a dialog at the given node. |
| `endDialog` | | | End the current dialog. |
| `setPatientStatus` | `patient: string`, `status: PatientStatus` | | Update a patient's status. See [§ III.4 PatientStatus](#iii4b-patientstatus). Typically called from a mansion debrief dialog. |
| `recordPatientNote` | `patient: string`, `note: string` | | Append a narrative note to a patient's record (no-op if duplicate). |

## III.3 Common conditions

Available in any context. Conditions evaluate to a boolean. Missing/undefined conditions are treated as `true`. Unknown condition types log a console warning and evaluate to `false`.

| `type` | Required fields | Optional fields | Returns true when |
|---|---|---|---|
| `flag` | `flag: string` | `equals?: any` (defaults to `true`) | The named flag's value strictly equals `equals`. |
| `inDream` | | | The current scene's `kind` is `"dream"`. |
| `inMansion` | | | The player is on a mansion site or in an interaction (not in a dream). |
| `activePatient` | `patient: string` | | The given patient is the active session. |
| `patientStatus` | `patient: string`, `status: string` | | Patient's status matches (see PatientStatus values). |
| `patientHas` | `patient: string`, `note: string` | | The patient's notes list contains the given note. |
| `and` | `conditions: Condition[]` | | All sub-conditions are true. Empty array → `true`. |
| `or` | `conditions: Condition[]` | | At least one sub-condition is true. Empty array → `false`. |
| `not` | `condition: Condition` | | The sub-condition is false. |

## III.4 Common enumerations

### III.4.a Narration `kind`

Used by the [`narrate` action](#iii2-common-actions) and stored on each `NarrationEntry`.

| Value | Visual treatment |
|---|---|
| `"narration"` *(default)* | Default body style; descriptive prose. |
| `"dialog"` | Lightly highlighted; spoken lines (often paired with `speaker`). |
| `"system"` | Italic, accented colour; meta beats (e.g. `"Acquired: Brass key."`, scene transitions). |

### III.4.b `PatientStatus`

Used by `PatientDef`'s runtime state, the [`setPatientStatus`](#iii2-common-actions) action, and the [`patientStatus`](#iii3-common-conditions) condition.

| Value | Meaning |
|---|---|
| `"pending"` | Patient is on the books but not yet in residence. |
| `"inResidence"` | Currently staying at the house. |
| `"improving"` | Treatment is working; sessions are netting positive. |
| `"healed"` | Treatment complete; patient discharged successfully. |
| `"unhelped"` | Sessions didn't deliver; patient is leaving without resolution. |
| `"departed"` | No longer in residence (after `healed` or `unhelped`). |

### III.4.c Background string convention

Anywhere a `background` field appears — on a [Site](#site), [Interaction](#interaction), or [Scene](#scene) — the string can be:

- An **image path** like `"main/floor1.webp"` — resolved against the `src/config/` asset registry, rendered as `background-size: cover; background-position: center`.
- A **CSS color/gradient/value** like `"#1a1822"`, `"rgba(0,0,0,0.5)"`, `"linear-gradient(...)"`, `"oklch(...)"`, `"var(--panel)"` — passed through unchanged.

The distinction is heuristic: anything starting with `http(s)://`, `data:`, `/`, `./`, `../`, or matching a path-with-extension pattern is treated as a URL. Everything else is treated as CSS.

---

## Validation

Three validators run at load time:

1. **`validateMansionConfig(main)`** — structural check on `main.json` before merge. Rejects forbidden fields (`scenes`, `items`, `initialState.inventory`, `startScene`), requires the three essentials (`title`, `startSite`, `sites`).
2. **`validateDreamConfig(patientId, dream)`** — structural check on each dream file. Requires `scenes`; rejects mansion-only fields. Error paths are prefixed with `dreams.<id>.` so the file source is legible.
3. **`validateAdventure(composed)`** — cross-cutting check on the merged Adventure. Walks every action and condition (checking type registration and payload shape), verifies start references, dialog node references, patient `dreamScene` references, interaction location references, and flag references.

If per-file validation fails, the loader throws an error with `err.issues: AdventureValidationError[]`. If the merged validation fails, [StartPage.vue](src/components/StartPage.vue) shows a count on the title screen and logs the full list to the console.

**Non-fatal warnings** surface as `console.warn`:

- A `SiteLocation.target` pointing at a non-existent site (the runtime hides the icon).
- An unknown action or condition type encountered at runtime (skips and continues).
- A `setFlag` or `flag`-condition referencing an undeclared flag (runs as authored).

---

## Worked example

A minimal but complete mansion + dream pair illustrating the most common patterns.

**`src/config/main/main.json`** (uses mansion-only structures + common dialogs/patients/flags + common actions):

```jsonc
{
  "title": "Demo House",
  "startSite": "ground_floor",
  "flags": {
    "metPatient": { "default": false, "description": "Player has seen the intro dialog." }
  },
  "patients": {
    "alex": {
      "name": "Alex",
      "presenting": "Recurring nightmare about being late.",
      "file": "Three sessions in. Dream is always the same hallway.",
      "dreamScene": "alex_hallway"
    }
  },
  "sites": {
    "ground_floor": {
      "name": "Ground Floor",
      "background": "main/floor.webp",
      "locations": {
        "treatment": { "name": "Treatment Room", "x": 50, "y": 50 }
      }
    }
  },
  "interactions": [
    {
      "id": "treatment_session",
      "location": "treatment",
      "dialog": "go"
    }
  ],
  "dialogs": {
    "go": {
      "id": "go",
      "start": "open",
      "nodes": {
        "open": {
          "speaker": "Wren",
          "text": "Alex is on the chair. Ready?",
          "choices": [
            {
              "text": "Ready.",
              "actions": [
                { "type": "setFlag",   "flag": "metPatient", "value": true },  // common
                { "type": "endDialog" },                                       // common
                { "type": "enterDream", "patient": "alex" }                    // mansion-only
              ]
            }
          ]
        }
      }
    }
  }
}
```

**`src/config/adventures/alex.json`** (uses dream-only structures + dream-only actions):

```jsonc
{
  "scenes": {
    "alex_hallway": {
      "name": "Hallway",
      "kind": "dream",
      "background": "linear-gradient(180deg, #1a1822, #0a080d)",
      "description": "A hallway that never quite ends.",
      "objects": [
        {
          "id": "alex_door",
          "name": "A door",
          "rect": { "x": 40, "y": 40, "w": 20, "h": 40 },
          "color": "rgba(120, 100, 80, 0.2)",
          "triggers": {
            "onClick": [
              { "type": "narrate", "text": "The door opens onto another hallway." },  // common
              {
                "type": "speakExitPhrase",                                              // dream-only
                "phrase":   "the light in the conservatory",
                "expected": "the light in the conservatory"
              }
            ]
          }
        }
      ]
    }
  }
}
```

The composed Adventure that reaches the engine will have `scenes.alex_hallway` merged in alongside `main.json`'s sites, interactions, and `go` dialog.
