# Adventure Engine — Config Reference

Comprehensive reference for the JSON config that drives the game. The engine itself is generic; everything on screen is described by these files.

For the editorial / narrative direction behind the content, see [story/](story/). For the codebase orientation, see [CLAUDE.md](CLAUDE.md).

---

## How this document is organized

The game is composed at load time from three kinds of file:

| File | Type | Purpose |
|---|---|---|
| `src/config/main/main.json` | `MansionConfig` | The mansion ("hub") — sites, interactions, patient registry, mansion dialogs |
| `src/config/adventures/<patientId>.json` | `DreamConfig` | One file per patient's dream world — scenes, dream-only dialogs, dream items |
| `src/config/main/cases.json` and `src/config/adventures/<patientId>.cases.json` | `CasesConfig` | Case files (metadata) referencing `.md` documents on disk |

The reference below splits everything into four parts:

- **[Part I — Mansion (main.json)](#part-i--mansion-mainjson)**: structures, actions, conditions, and enumerations that **only make sense when authoring mansion content**. The validator rejects them if they appear in a dream file.
- **[Part II — Dream (adventures/&lt;patientId&gt;.json)](#part-ii--dream-adventurespatientidjson)**: same, for dream files.
- **[Part III — Common](#part-iii--common-used-by-both)**: shared structures (Dialog, PatientDef, FlagDef) and the actions/conditions/enums used in both modes.
- **[Part IV — Case files](#part-iv--case-files)**: the case-files config format, markdown convention, and runtime gating rules.

> **Note on enforcement.** The validator enforces *file shape* (you can't put `scenes` in a mansion file or `sites` in a dream file). It does **not** enforce *action context* — nothing stops you authoring `wake` inside a mansion interaction, it just won't do anything useful. The categorisation below reflects *intended use*, not strict prohibition.

The two preliminary sections — [Overview](#overview-loading--file-layout) and [Asset references](#asset-references) — apply equally to both file types.

---

## Overview: loading & file layout

`loadMainAdventure()` in [src/config/index.ts](src/config/index.ts) loads `main.json`, then for each patient id in `main.patients` it tries to load `./adventures/<patientId>.json`. It merges `scenes`, `dialogs`, and `items` from each dream file into a single composed `Adventure` object that the engine consumes. The two file types evolve independently; each has its own structural validator that runs before the merge.

```
src/config/
├── index.ts                           # catalog + loader (loadMainAdventure)
├── debug.json                         # dev-only debug profiles (see below)
├── main/
│   ├── main.json                      # MansionConfig
│   ├── cases.json                     # optional CasesConfig (mansion-wide cases)
│   ├── cases/                         # markdown documents referenced by cases.json
│   ├── floor1.webp                    # mansion_first_floor background
│   ├── floor2.webp                    # patient_rooms background
│   ├── location-icon.png              # "standard" icon
│   └── travel-icon-{left,up,down,right}.png
└── adventures/
    ├── whitfield.json                 # DreamConfig — patients.whitfield
    ├── whitfield.cases.json           # CasesConfig — patient-bound case files
    ├── whitfield/                     # markdown documents for whitfield.cases.json
    │   ├── intake.md
    │   └── session-notes.md
    └── cabin.json                     # standalone dev fixture (own catalog entry)
```

Conventions:

- **Dream file name = patient id**: patient `whitfield` ↔ `adventures/whitfield.json`. The loader picks it up automatically.
- **Mansion assets in `main/`, dream assets co-located with the dream file.**
- **`cabin.json` is a standalone dev-only adventure**, not a dream — it has its own `AdventureCatalogEntry` in `index.ts`.

### `debug.json` — dev-only profile shortcuts

A list of jump-in profiles for iterating on specific game states. Each entry in `profiles[]` becomes a catalog button on the start screen (below the cabin fixture) **in `import.meta.env.DEV` builds only**. Selecting one boots the main game with the profile's `flags` pre-applied and `startInteraction` skipped, so you land at the mansion floor plan in whatever state the flags describe. Debug-profile sessions run with autosave disabled so they never clobber a real save.

```jsonc
// src/config/debug.json
{
  "profiles": [
    {
      "id": "after-intro",
      "label": "After Intro",
      "description": "Land at the mansion floor plan with the intro already completed.",
      "flags": { "introCompleted": true }
    },
    {
      "id": "ready-for-session",
      "label": "Ready for Session",
      "description": "Intro done, offer accepted, file examined.",
      "flags": {
        "introCompleted": true,
        "offerAccepted": true,
        "examinedFile": true
      }
    }
  ]
}
```

- `id` is unique among profiles. The rendered catalog id is `debug-<id>`.
- `flags` is merged into `initialState.flags` so the engine sees them as the starting state. Reference any flag declared in `main.json`'s `flags` map.
- `description` is shown next to the button on the start screen.
- Production builds strip debug entries entirely.

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
  "interactions": [ /* Interaction[] (ordered); each owns its dialog inline */ ]
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
| `dialogs` | mansion dialogs are declared **inline** on the owning interaction via `interaction.dialog` — there is no top-level dialog registry in the mansion config. Dream-only dialogs live in the dream files. |

### Optional

- `startInteraction` — id of an interaction to auto-play before the floor plan shows.
- `flags` — declared flags with defaults; see [§ FlagDef](#iii1c-flagdef) (common).
- `initialState.flags` — runtime overrides of declared flag defaults (rarely needed).
- `patients` — see [§ PatientDef](#iii1b-patientdef) (common).
- `interactions` — see [§ I.2 Interaction](#interaction). Ordered: at each location the **first qualifying** interaction wins.

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
  "highlight": true,                                      // optional: pulsing glow on the location icon
  "background": "linear-gradient(180deg, #2a1d12 0%, #140e0a 100%)",
  "animations": ["lamp-flicker", "vignette-flicker"],     // see § I.5 enums
  "overlays": [                                           // optional; image layers over the background
    { "id": "fog", "image": "main/fog.png", "transition": "fade" }
  ],
  "onEnter": [ /* Action[] */ ],
  "onExit":  [ /* Action[] */ ],
  "dialog": {                                             // optional inline Dialog (auto-starts on entry)
    "id": "wrenOffer",                                    // unique across all dialogs
    "start": "open",
    "nodes": { /* … see § Dialog (common) */ }
  }
}
```

**`highlight`** (optional, defaults to `false`) — when this interaction is the currently-qualifying one at its location, the location icon on the floor plan pulses with a soft amber glow. Transition icons inherit the highlight: a transition lights up if any interaction reachable through it is currently a highlighted-and-qualifying one (back-links to the start site don't count as "content" for this propagation). Use sparingly — the cue means *"go here next."* `prefers-reduced-motion` users see a steady (non-animated) glow instead of the pulse.

**Overlays** are image layers stacked over the interaction's background. Each entry is `{ id, image, rect? | place?, z?, transition? }`:

- `id` — stable identifier (used by `addOverlay` / `removeOverlay`). Must be unique within the interaction.
- `image` — path resolved like `background` (against `src/config/`).
- **Sizing & positioning** — pick **one** of `rect` *or* `place` (specifying both is a validation error):
  - **`rect`**: `{ x, y, w, h }` — all percentages of the viewport. The image fits inside the rect with its aspect ratio preserved (`object-fit: contain`). Omitting both `rect` and `place` defaults to full coverage (`{ x: 0, y: 0, w: 100, h: 100 }`).
  - **`place`**: `{ top, left, scale? }` — `top` and `left` are percentages of viewport height/width respectively, anchoring the **top-left corner** of the image. `scale` is a percentage of the image's **natural pixel size** (default 100; under 100 shrinks, above 100 enlarges). Use `place` when you have a sprite authored at a specific pixel resolution and want it positioned without thinking about percentage bounds.
- `z` — optional stacking depth, number, defaults to `0`. Higher `z` renders **on top**. Overlays with equal `z` paint in the order they appear in the list (so an `addOverlay` call with the default `z = 0` lands above any same-z neighbours already there). Sort happens at render time, so adding / removing overlays doesn't disturb the data order — the player just always sees them in z-order.
- `transition` — optional, currently only `"fade"`. The renderer fades each overlay in on mount and out on removal (500 ms). The schema is open-ended for future transition types.

```jsonc
// Mixed-mode example:
"overlays": [
  // Full-coverage haze, far back.
  { "id": "haze", "image": "main/haze.png", "z": -10 },

  // Tree placed by rect — fits inside a percentage box.
  { "id": "tree",
    "image": "main/tree.png",
    "rect": { "x": 0, "y": 35, "w": 18, "h": 55 } },

  // Wren sprite placed by natural-pixel size, scaled to 80%.
  // Anchored at (55%, 30%) from the top-left of the viewport.
  { "id": "wren",
    "image": "main/wren-standing.png",
    "place": { "top": 30, "left": 55, "scale": 80 },
    "z": 10 }
]
```

**Which to choose?**
- `rect` is best for **layout-relative** content — backgrounds, foreground washes, sprites whose final on-screen size should track the scene canvas (e.g. a sprite that should always cover 20% of the screen, regardless of how big the image file is).
- `place` is best for **sprite-relative** content — characters, props, FX images authored at a specific pixel resolution and intended to render at that size (or a scale of it).

Overlays render between the ambient layers (vignette, glow, lamp) and the rain. They are click-through (`pointer-events: none`). Authored overlays appear when the interaction begins; later they can be replaced, added, or removed mid-dialog via `setInteractionVisuals` — see [§ I.3](#i3-mansion-only-actions).

- **`conditions` omitted or empty** → always qualifies. Useful as a fallback at the end of the interactions list.
- **`dialog`** — an **inline `Dialog` object** (not a string reference). When present, it auto-starts as soon as the interaction begins.
  - The loader extracts each inline dialog into the runtime `Adventure.dialogs` registry, so `startDialog` actions and save-state references continue to work uniformly.
  - **`dialog.id` is optional.** Most inline dialogs are never cross-referenced (they auto-start and never get invoked by name), so the field can be omitted. When omitted, the loader auto-allocates `__inline_<interactionId>` (e.g. interaction `study_offer` → dialog id `__inline_study_offer`). If you do need to invoke this dialog from a `startDialog` action elsewhere, give it an explicit `id`.
  - Explicit ids must be unique across all dialogs in the composed game (mansion inline dialogs + dream-file dialogs). The loader emits a validation issue on collisions.
- **The interaction ends** when the dialog ends (via `endDialog`) or when an explicit `exitInteraction` action fires.

## I.3 Mansion-only actions

Use these inside mansion `interaction.onEnter` / `onExit`, mansion `dialog` choice actions, or `site.onEnter` / `onExit`. They have no useful effect from inside a dream.

| `type` | Required fields | Optional fields | Effect |
|---|---|---|---|
| `gotoSite` | `site: string` | | Switch the player to a mansion site. |
| `enterInteraction` | `interaction: string` | | Begin a specific mansion interaction by id. |
| `exitInteraction` | | | End the current mansion interaction. |
| `enterDream` | `patient: string` | | Sugar: bumps `sessionsCompleted` on the patient, marks them active, then `goto`s their `dreamScene`. The bridge from mansion → dream. |
| `setInteractionVisuals` | *(at least one of `background` / `animations`)* | `background?: string \| null`, `animations?: string[] \| null` | Override the active interaction's visuals mid-dialog. See note below. |

### `setInteractionVisuals` — runtime visual overrides

Override the active interaction's background, animations, and image overlays from inside a dialog (or any action running while an interaction is active). Useful for in-conversation tonal shifts that don't warrant splitting the dialog across multiple interactions.

**Fields** — at least one must be provided. The validator rejects an empty call.

| Field | Type | Behaviour |
|---|---|---|
| `background` | `string \| null` | Replace the background override. `null` clears the override and falls back to the interaction's authored background. |
| `animations` | `string[] \| null` | Replace the animations override. See empty-array caveat below. |
| `overlays` | `Overlay[] \| null` | **Bulk replace** the overlay list. `null` clears the override and falls back to the interaction's authored overlays. |
| `addOverlay` | `Overlay` | **Add one** overlay to the current effective list (or replace by `id` if it's already there). |
| `removeOverlay` | `string` (overlay id) | **Remove one** overlay by id. |

**Field semantics:**

- **Providing a value** replaces the override (e.g. `"background": "#000"`).
- **Providing `null`** clears that override, falling back to the interaction's authored value. **Important**: this falls back to the *authored* value, it does not turn the field "off". If the interaction authors `animations: ["rain"]` and you want to stop the rain mid-scene, pass `"animations": []` — an empty array is an explicit "no animations" override. Passing `null` would restore the rain. The same rule applies to `overlays`.
- **Omitting the key** leaves that override unchanged. This lets you change background, animations, and overlays independently in different action calls.

**Lifecycle:** overrides are bound to the current interaction. The engine automatically clears all three on `enterInteraction` (fresh interaction starts clean) and on `exitInteraction` (overrides never leak across encounters). They are persisted to save state, so reloading mid-dialog preserves the visual state.

```jsonc
// Dim the lamp partway through a conversation:
{
  "type": "setInteractionVisuals",
  "background": "linear-gradient(180deg, #0a0805 0%, #000 100%)",
  "animations": ["dim", "vignette-flicker"]
}

// Restore the authored visuals on a later choice:
{ "type": "setInteractionVisuals", "background": null, "animations": null, "overlays": null }

// Animations-only change:
{ "type": "setInteractionVisuals", "animations": ["glow-pulse"] }

// Replace the whole overlay set:
{
  "type": "setInteractionVisuals",
  "overlays": [
    { "id": "fog",  "image": "main/fog.png" },
    { "id": "tree", "image": "main/tree.png" }
  ]
}

// Add a single overlay mid-dialog (full-coverage, no rect):
{ "type": "setInteractionVisuals", "addOverlay": { "id": "lightning", "image": "main/flash.png" } }

// Add a positioned sprite at a specific depth (above the tree but below rain_mist):
{
  "type": "setInteractionVisuals",
  "addOverlay": {
    "id": "wren_sprite",
    "image": "main/wren-standing.png",
    "rect": { "x": 55, "y": 20, "w": 20, "h": 70 },
    "z": 10
  }
}

// Remove it on the next beat:
{ "type": "setInteractionVisuals", "removeOverlay": "lightning" }
```

**Overlays + transitions.** Authored and override overlays both pass through the renderer's `<TransitionGroup>`, so adding one fades it in (500 ms) and removing one fades it out. To replace an overlay's image without a flash of removal, use `addOverlay` with the same `id` — the renderer keeps the element in place and just swaps its image. To replace it with a fresh entry that re-runs the fade, remove it first, then add a new one (or use bulk `overlays`).

`background` accepts the same string forms as `Interaction.background` (image path, CSS colour/gradient). `animations` accepts the same named values as `Interaction.animations` (see [§ I.5](#interactionanimations)). `Overlay` requires `id` and `image`; `transition` (optional) currently must be `"fade"` if provided.

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

A scene object is anchored at `(x, y)` and carries up to two independent regions: a `display` block (what to paint) and a `hit` block (what's clickable). Either or both may be omitted.

```jsonc
{
  "id": "wf_catherine",
  "name": "A woman, half in shadow",         // shown as a cursor-following tooltip on hover
  "type": "hotspot",                         // optional; default "hotspot"
  "x": 28,                                   // anchor x as % of viewport
  "y": 40,                                   // anchor y as % of viewport
  "display": {                               // optional visual block
    // Exactly one of `rect` or `place`:
    "rect": { "x": 0, "y": 0, "w": 14, "h": 45 },   // sized region, coords relative to (x, y)
    // OR:
    // "place": { "top": 0, "left": 0, "scale": 75 },  // anchor at point + scale natural image
    "color": "rgba(220, 200, 200, 0.08)",   // optional CSS background
    "image": "..."                          // optional sprite/image overlay
  },
  "hit": {                                   // optional hit region (defaults to display.rect when omitted)
    // Exactly one of `rect`, `path`, or `ellipsis`:
    "rect": { "x": 2, "y": 20, "w": 10, "h": 20 },   // smaller / offset / different from display
    // OR:
    // "path": [                              // closed polygon, at least 3 points
    //   { "x": 0, "y": 0 },
    //   { "x": 14, "y": 0 },
    //   { "x": 7, "y": 24 }
    // ],
    // OR:
    // "ellipsis": { "w": 16, "h": 8 },       // ellipse inscribed in this rect
    "highlight": true                       // optional; defaults to false
  },
  "initiallyHidden": false,                  // hidden until showObject
  "visibleIf": { /* Condition */ },          // alternative to hidden flag
  "triggers": {
    "onClick": [ /* Action[] */ ],           // fired ONLY when `menu` is empty / all-hidden
    "onHover": [ /* Action[] */ ]            // still fired in parallel with the cursor tooltip
    // any other trigger name is fine; the engine fires whatever you fire
  },
  "menu": [                                  // optional contextual menu at the cursor
    {
      "label": "Look",
      "actions": [ /* Action[] */ ]
    },
    {
      "label": "Hold the lantern up to it",
      "visibleIf": { "type": "hasItem", "item": "lantern" },   // optional active gate
      "actions": [ /* Action[] */ ]
    }
  ],
  "data": { /* free-form bag for custom object types */ }
}
```

**Anchor + relative coords.** `x` and `y` at the object level position the object inside the scene (as % of the 960×540 viewport). The rects inside `display` and `hit` are interpreted as offsets from that anchor; `rect.x` / `rect.y` default to `0` when omitted, `rect.w` / `rect.h` are required.

**Why `display: { rect, … }` instead of spreading `w`/`h` directly on the block?** It leaves room for other region kinds (e.g. `path`, `ellipse`) to be added as siblings of `rect` later without breaking existing JSON. The first such sibling already exists: `place`.

**`display.place` — alternative to `display.rect`.** Mirrors the mansion `Overlay.place` shape (`{ top, left, scale? }`): the image renders at its **natural pixel size**, anchored at `(left%, top%)` from the object's anchor, then optionally `scale`d (defaults to 100). Use `place` when you've authored a sprite whose pixel dimensions are the source of truth and you want it rendered at that exact size (or a scaled version) rather than stretched to fill a rect. `rect` and `place` are mutually exclusive — the validator rejects a display block that has both. Place-mode requires `display.image` (it's the thing being positioned + scaled — `color`-only place blocks are rejected). Place-mode display does NOT provide a fallback `hit` rect — author an explicit `hit` block if you want one.

**`hit.path` — alternative to `hit.rect`.** A polygon hit region defined by **at least three** `{ x, y }` points, coordinates relative to the object's anchor. The polygon is **closed implicitly** — the last vertex connects to the first. The validator rejects:
- fewer than 3 points,
- non-numeric `x` / `y`,
- self-intersecting polygons (including the implicit closing edge — so a "near-miss" star or bowtie shape is caught).

At runtime, the cursor uses a precise point-in-polygon test (not a bounding-box approximation), and the click button is restricted to the polygon via CSS `clip-path` so a click in a notch outside the polygon doesn't count.

**`hit.ellipsis` — alternative to `hit.rect` / `hit.path`.** An ellipse hit region inscribed in the given bounding rect (coordinates relative to the object's anchor). Centre at `(rect.x + rect.w/2, rect.y + rect.h/2)`, semi-axes `rect.w/2` and `rect.h/2`. Equivalent to SVG's `<ellipse cx="..." cy="..." rx="..." ry="...">`. Use it for round or oval hotspots like puddles, lamps, or planets. Runtime hit-testing uses point-in-ellipse (`((px - cx)/rx)² + ((py - cy)/ry)² ≤ 1`); the click button is restricted to the ellipse via CSS `clip-path: ellipse(50% 50% at 50% 50%)`.

`rect`, `path`, and `ellipsis` are mutually exclusive — the validator rejects a hit block declaring more than one (or none).

**`hit.highlight` — always-on boundary.** Defaults to `false`. When `true`, the hit region is rendered with a visible dashed outline regardless of mouse position — a CSS outline for rect-mode hits, an SVG `<polygon>` stroke for path-mode hits. Useful for narrative emphasis ("the door is glowing — look here next") or for authoring debug (briefly see all hotspots in a scene).

**Three authoring patterns:**

1. **Coloured rectangle (visual = hit)** — the common case. Author `display` only; `hit` defaults to display's rect.
   ```jsonc
   { "id": "...", "x": 75, "y": 60, "display": { "rect": { "w": 22, "h": 35 }, "color": "..." } }
   ```
2. **Image with a custom hit region** — useful when the visual extends beyond what should be clickable (e.g. a tall sprite where only the door panel accepts clicks).
   ```jsonc
   {
     "id": "...", "x": 42, "y": 30,
     "display": { "rect": { "w": 16, "h": 50 }, "image": "..." },
     "hit":     { "rect": { "x": 4, "y": 30, "w": 8, "h": 20 } }
   }
   ```
3. **Pure hit region (no visual)** — when the feature is already painted into the scene background and only needs a clickable overlay. Omit `display`, set `hit`.
   ```jsonc
   { "id": "...", "x": 4, "y": 78, "hit": { "rect": { "w": 14, "h": 14 } } }
   ```

**Legacy fields rejected.** The old top-level `rect`, `color`, and `image` fields are no longer supported — the validator surfaces a clear error pointing each at its new home under `display`.

**Tooltip + menu UX.** Hovering an object shows its `name` as a small cursor-following label (no border or glow on the object itself). Clicking opens a contextual menu at the cursor IF the object has any active menu items (an item is active when it has no `visibleIf`, or its `visibleIf` evaluates true). If the menu is empty — either because `menu` isn't authored, or because every item is currently hidden by `visibleIf` — the click falls through to the legacy `triggers.onClick` flow. This means simple objects can keep using only `triggers.onClick`, and richer objects can use `menu`, and the two can coexist on the same object (with `onClick` acting as a state-dependent fallback when the menu has nothing to offer).

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

Dialogs come from two places:
- **Mansion dialogs** are declared **inline** on the owning interaction (see [§ Interaction](#interaction)). The loader extracts them into the runtime dialog registry keyed by `dialog.id`.
- **Dream dialogs** are declared in a dream file's top-level `dialogs` map, keyed by dialog id.

Both halves merge into a single dialog map at load time; ids must be globally unique across the merged result. Any `startDialog` action references a dialog by id and looks it up in that merged map, regardless of where it originally lived.

```jsonc
{
  "id": "wrenOffer",
  "start": "open",
  "nodes": {
    "open": {
      "speaker": "Wren",                  // optional
      "kind":    "dialog",                // optional; defaults to "dialog". See § III.4.a
      "text":    "Sit a moment. …",
      "onEnter": [ /* Action[] run when this node becomes active */ ],

      // EXACTLY ONE of `choices` or `nochoice` is required.

      "choices": [                        // branching: player picks one
        {
          "text": "Yes. I can.",
          "visibleIf": { /* Condition; choice hidden when false */ },
          "actions":   [ /* Action[] run when chosen */ ],
          "next":      "why"              // optional; advance to another node
        }
      ]

      // OR:
      // "nochoice": {                    // linear: auto-fires after onEnter
      //   "text":    "Move on.",         // optional; omit to suppress the `> ...` echo
      //   "actions": [ /* Action[] */ ],
      //   "next":    "step1"
      // }
    }
  }
}
```

- A choice with no `next` and no `endDialog` in `actions` ends the dialog (no follow-up node).
- `visibleIf` lets you write branching that adapts to game state. (Not meaningful on `nochoice` — it fires unconditionally; the validator rejects it.)
- `kind` overrides the narration kind used when the node's text reaches the log. Default is `"dialog"`. Use `"inner"` for an internal monologue node (Ashley thinking to themselves with no `speaker`), `"narration"` for descriptive prose, or `"system"` for meta beats. See [§ III.4.a Narration kind](#iii4a-narration-kind).
- **`onEnter`** runs when the node becomes active. Sequence: the node's `text` is pushed to the narration log → `onEnter` actions run sequentially → choices appear (or `nochoice` auto-fires). The actions are `await`ed, so `wait`, `pause`, and `setInteractionVisuals` all suspend the choice prompt correctly:
  ```jsonc
  "open": {
    "kind": "inner",
    "text": "What he said about company. Witness, not exorcism.",
    "onEnter": [
      { "type": "pause", "seconds": 1.2 },
      {
        "type": "setInteractionVisuals",
        "background": "main/intro_sequence/front-view-close-day.webp"
      }
    ],
    "choices": [{ "text": "Move on.", "next": "step1" }]
  }
  ```
  Fires on every entry to the node (first emission and re-entry via a `next`).

- **`choices` vs. `nochoice`**: every node must declare **exactly one**. The validator rejects nodes that have both, and nodes that have neither.
  - **`choices`** is for branching beats — the player picks an option from a list of buttons.
  - **`nochoice`** is for linear beats — a single choice object that fires automatically after `onEnter` completes. Useful for monologue sequences and cinematic chains where you don't want a UI button between nodes. Same fields as a `DialogChoice` (`text?`, `actions?`, `next?`), but:
    - `text` is **optional** — when omitted, the `> ...` player-choice echo is suppressed entirely, giving you a clean auto-advance with no narration artefact.
    - `visibleIf` is rejected by the validator (a `nochoice` always fires).
    - Empty `nochoice: {}` is valid and ends the dialog (acts as a terminator).
  ```jsonc
  // Auto-advance with no echo:
  "open": {
    "kind": "inner",
    "text": "First beat of the monologue.",
    "onEnter": [{ "type": "wait" }],
    "nochoice": { "next": "step1" }
  },
  "step1": {
    "kind": "inner",
    "text": "Second beat.",
    "onEnter": [
      { "type": "wait" },
      { "type": "setInteractionVisuals", "background": "main/intro_sequence/entryway.webp" }
    ],
    "nochoice": { "next": "close" }
  },
  "close": {
    "kind": "inner",
    "text": "Final beat.",
    "onEnter": [{ "type": "wait" }],
    "nochoice": {
      "actions": [
        { "type": "setFlag", "flag": "introCompleted", "value": true },
        { "type": "endDialog" },
        { "type": "narrate", "kind": "system", "text": "— You enter the mansion —" }
      ]
    }
  }
  ```

### III.1.b `PatientDef`

Declared in `main.json` under the top-level `patients` map. Bridges to the dream file via `dreamScene`.

```jsonc
{
  "name": "Catherine Whitfield",
  "dreamScene": "whitfield_stage",                            // entry scene id
  "maxSessions": 6                                            // optional
}
```

- The patient id (the key in `patients`) is what links to the matching dream file (`adventures/<patientId>.json`) AND the matching case file (`adventures/<patientId>.cases.json`).
- `dreamScene` must resolve to a scene in the merged Adventure (the validator catches typos).
- The patient's runtime state (`status`, `sessionsCompleted`, `notes`) is mutated by common actions: [`enterDream`](#i3-mansion-only-actions), [`setPatientStatus`](#iii2-common-actions), [`recordPatientNote`](#iii2-common-actions).
- Rich patient content (intake notes, session notes, etc.) lives in case files — see [§ IV Case files](#part-iv--case-files).

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
| `pause` | `seconds: number` (≥ 0) | | Silent delay before the next action. Use this to slow the pace of a long passage. |
| `wait` | | | Push a "Click to continue…" prompt to the log and suspend the action sequence until the player clicks or presses any key. The prompt entry is removed from the log on continue. Use between paragraphs of a long monologue to gate progression on the reader. |
| `startDialog` | `dialog: string` | `node?: string` (defaults to dialog's `start`) | Begin a dialog at the given node. |
| `endDialog` | | | End the current dialog. |
| `setPatientStatus` | `patient: string`, `status: PatientStatus` | | Update a patient's status. See [§ III.4 PatientStatus](#iii4b-patientstatus). Typically called from a mansion debrief dialog. |
| `recordPatientNote` | `patient: string`, `note: string` | | Append a narrative note to a patient's record (no-op if duplicate). |
| `dreamTransition` | `direction: "entering" \| "exiting"` | `actions?: Action[]` | Run the hypnotic-spiral overlay around the nested `actions` (which execute during the hold phase, hidden behind the opaque spiral). `enterDream` and `wake` use the same effect internally; this action lets you stage the transition without the patient-loop semantics. |

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

Used by the [`narrate` action](#iii2-common-actions), by a [`DialogNode`'s optional `kind` field](#iii1a-dialog--dialognode--dialogchoice), and stored on each `NarrationEntry`.

| Value | Visual treatment |
|---|---|
| `"narration"` *(default for `narrate`)* | Default body style; descriptive prose. |
| `"dialog"` *(default for dialog nodes)* | Lightly highlighted; spoken lines (often paired with `speaker`). |
| `"inner"` | Currently styled the same as `"dialog"` — reserved for internal monologue so it can later be styled distinctly without changing any authored config. |
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

# Part IV — Case files

Case files are the in-game chart: a tab in the top-right of the header opens a full-screen modal showing the currently-available cases and their markdown documents. The author writes metadata (case label, optional `availableIf` gate, document list) in JSON and the body of each document in a separate `.md` file referenced by path. The runtime is in [src/components/CaseFilesModal.vue](src/components/CaseFilesModal.vue); availability gating happens via [GameEngine.availableCaseFiles](src/engine/engine.ts).

## IV.1 File shape

`CasesConfig`:

```jsonc
{
  "cases": [
    {
      "id": "whitfield",                                   // globally unique
      "label": "Whitfield, C.",
      "subtitle": "Concert pianist. Recurrent dream …",    // optional
      "availableIf": { "type": "flag", "flag": "x" },      // optional Condition
      "documents": [
        {
          "id": "intake",                                  // unique within the case
          "label": "Intake",
          "path": "adventures/whitfield/intake.md",        // relative to src/config/
          "availableIf": { "type": "flag", "flag": "x" }   // optional Condition
        }
      ]
    }
  ]
}
```

## IV.2 Where files live

- **Mansion-wide cases:** `src/config/main/cases.json` (one file). Markdown documents under `src/config/main/cases/*.md`.
- **Per-patient cases:** `src/config/adventures/<patientId>.cases.json` (one per patient, optional). Markdown documents under `src/config/adventures/<patientId>/*.md`.

The patient id in the filename must match a patient declared in `main.json`. The loader rejects orphan files.

## IV.3 Markdown convention

Document `.md` paths in JSON are written relative to `src/config/`, just like image asset paths. They're resolved by `resolveMarkdown(path)` in [src/engine/assets.ts](src/engine/assets.ts) via a Vite `?raw` glob, so all referenced markdown is bundled at build time. A missing path is a load-time validation error, not a runtime surprise.

The renderer ([src/components/markdown.ts](src/components/markdown.ts)) is hand-rolled to keep the dependency footprint small. Supported subset: `#`/`##`/`###` headings, paragraphs, **bold**, *italic* / _italic_, `inline code`, unordered (`-`/`*`/`+`) and ordered (`1.`) lists, blockquotes (`>`), horizontal rules (`---`/`***`), and `[text](url)` links. Link hrefs are allowlisted to `http://`, `https://`, `mailto:`, and `/`-relative; anything else renders as plain text.

**Fenced ` ``` ` blocks render as conversation transcripts** (not as monospace code — this is a case-file deliberate choice). Lines of the form `Speaker: text` are split so the speaker label gets distinct styling; lines without a speaker render as plain paragraphs inside the transcript container. Inline markdown (bold/italic) works inside speech. The optional language tag after the opening fence (e.g. ` ```transcript `) is accepted and ignored. Example:

````markdown
```
Wren: Take your time. She isn't here yet.
Catherine: I don't belong here.
Wren: You belong here.
```
````

## IV.4 Availability gating

Each case (and each document) may declare an optional `availableIf: Condition` using the same shape as `visibleIf` on scene objects or interaction conditions. The engine's `availableCaseFiles` computed filters cases whose condition evaluates to false; `isDocumentAvailable(doc)` does the same per document. The header tab appears only when at least one case is available.

**Implicit patient-availability gate (dream-sourced cases only).** A case authored inside `adventures/<patientId>.cases.json` is automatically AND-ed with `patient is in residence | improving | healed`. Authors don't write this manually — the loader installs it for every case in that file. This keeps the schema clean and ensures dream cases never show up before the patient has been introduced.

## IV.5 Validation

`validateCasesConfig` runs per file before merge: requires `cases` to be a non-empty array, requires `id`/`label`/`documents` on each case, requires `id`/`label`/`path` on each document, enforces id uniqueness within the file. Cross-file uniqueness (case ids global across mansion + all dream cases files) and missing markdown paths surface as loader-level issues. The post-merge `validateAdventure` walks every `availableIf` to catch unknown condition types and bad payloads.

---

## Validation

Four validators run at load time:

1. **`validateMansionConfig(main)`** — structural check on `main.json` before merge. Rejects forbidden fields (`scenes`, `items`, `initialState.inventory`, `startScene`), requires the three essentials (`title`, `startSite`, `sites`).
2. **`validateDreamConfig(patientId, dream)`** — structural check on each dream file. Requires `scenes`; rejects mansion-only fields. Error paths are prefixed with `dreams.<id>.` so the file source is legible.
3. **`validateCasesConfig(cfg)`** — structural check on each cases file. Requires `cases` to be a non-empty array, validates required fields on each case + document, enforces id uniqueness within the file.
4. **`validateAdventure(composed)`** — cross-cutting check on the merged Adventure. Walks every action and condition (checking type registration and payload shape), verifies start references, dialog node references, patient `dreamScene` references, interaction location references, flag references, and condition payloads on every case's / document's `availableIf`.

If per-file validation fails, the loader throws an error with `err.issues: AdventureValidationError[]`. If the merged validation fails, [StartPage.vue](src/components/StartPage.vue) shows a count on the title screen and logs the full list to the console.

**Non-fatal warnings** surface as `console.warn`:

- A `SiteLocation.target` pointing at a non-existent site (the runtime hides the icon).
- An unknown action or condition type encountered at runtime (skips and continues).
- A `setFlag` or `flag`-condition referencing an undeclared flag (runs as authored).

---

## Worked example

A minimal but complete mansion + dream pair illustrating the most common patterns.

**`src/config/main/main.json`** (uses mansion-only structures + common dialogs/patients/flags + common actions). Note the dialog is inline on the interaction:

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
      "dialog": {
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
                  { "type": "setFlag",    "flag": "metPatient", "value": true },  // common
                  { "type": "endDialog" },                                        // common
                  { "type": "enterDream", "patient": "alex" }                     // mansion-only
                ]
              }
            ]
          }
        }
      }
    }
  ]
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
