# Next steps — aligning the engine with the story direction

A plan to reshape the existing point-and-click foundation to fit the framing in `story/`. Organized by tier; each item lists the files involved and the story rule that motivates it.

## Relationship to `next.md`

`next.md` is engine maintenance; this plan is engine reshape. They don't conflict, but a few notes:
- Tier 1 of `next.md` (narration counter, dead watch, dead style) should land first — small and orthogonal.
- Tier 3 of `next.md` (action/condition validation) becomes much more valuable once content grows; defer to land alongside the first authored case (Tier 4 below).
- The cabin demo is preserved as a dev/test fixture per CLAUDE.md, but it stops being the user-facing landing experience (Tier 1 below).

---

## Tier 1 — Shell: from catalog to single-game-with-saves

The current app is a multi-adventure catalog. The story is one game with persistent state. Reshape the shell first.

1. **Single-game landing instead of catalog** — [src/components/StartPage.vue](src/components/StartPage.vue), [src/adventures/index.ts](src/adventures/index.ts), [src/App.vue](src/App.vue). Replace the cards-grid with a title screen: title, a brief tagline, **New Game** / **Continue** buttons. Keep the catalog data structure as a registry of one (or two, including cabin as a dev-only entry behind `import.meta.env.DEV`) — the engine's adventure abstraction is still useful, just not surfaced.

2. **localStorage saves** — new `src/engine/persistence.ts`, plus changes to [GameEngine](src/engine/engine.ts). Per [design.md:69–73](story/design.md:69), saves live in `localStorage`. Add `engine.serialize()` / `engine.restore(snapshot)` that round-trip `state` (plus a small schema version field). Single autosave key (`adventure-engine.save`) on every `enterScene` and after every action list. Save-slot UI deferred to Tier 5.

3. **About / credits surface** — [StartPage.vue](src/components/StartPage.vue). Small, not load-bearing — but it's the place to put the gender-neutrality note, the content warning the subject matter probably warrants, and the GitHub Pages base-path-aware credit line.

## Tier 2 — Engine primitives the design needs

The current engine has scenes, objects, actions, conditions. The story design implies three things the engine doesn't yet model: branching dialog, the patient/case concept, and the hub-vs-dream split.

4. **Dialog system** — new `src/engine/dialog.ts`, new dialog action types. Per [design.md:33–34](story/design.md:33) and the texture of [the_offer.md](story/scenes/the_offer.md), conversations with choices are a primary gameplay element. Add a `Dialog` type: `{ id, nodes: Record<NodeId, DialogNode> }`, each node `{ text, speaker?, choices: Array<{ text, visibleIf?, actions: Action[], next?: NodeId }> }`. New actions: `startDialog` (takes over the narration panel), `endDialog`. New game-state field: `dialogState: { dialogId, nodeId } | null`. Choices appear as buttons in the narration panel; selecting one runs its actions and advances. Saving persists the active dialog node.

5. **Patient model** — new `src/engine/patients.ts`, extend `Adventure` and `GameState`. Per [design.md:39–45](story/design.md:39) and [arc.md:21–30](story/arc.md:21). Add to `Adventure`:
   ```ts
   patients?: Record<PatientId, {
     name: string;
     presenting: string;     // short summary for case file
     file: string;           // longer file text or markdown
     dreamScene: string;     // scene id of their dream world
     maxSessions?: number;   // sessions before they leave the residence
   }>;
   ```
   Add to `GameState`:
   ```ts
   patientState: Record<PatientId, {
     status: 'pending' | 'inResidence' | 'improving' | 'healed' | 'unhelped' | 'departed';
     sessionsCompleted: number;
     notes: string[];        // narrative tags set by actions during sessions
   }>;
   ```
   New actions: `setPatientStatus`, `recordPatientNote`, `enterDream(patient)` (a sugar over `goto` that also bumps `sessionsCompleted` and remembers the active patient). New conditions: `patientStatus`, `patientHas(note)`.

6. **Hub vs dream** — extend `Scene` with `kind: 'hub' | 'dream'` (default `'hub'`); add a runtime `state.activePatientId: PatientId | null`. Per [arc.md](story/arc.md) and [dreamworlds.md](story/dreamworlds.md), the two modes have different rules (e.g., the device controls only meaningful in the device room; speaking the exit phrase is only meaningful inside a dream). New action `wake` that exits the active dream back to the device room and clears `activePatientId`. New condition `inDream`. Engine doesn't need to enforce much — it just needs to *know* — so the renderer and authored content can branch on it.

7. **Dream-state persistence is already handled** — verify only. `state.objectState` already persists per object id across re-entries. [dreamworlds.md:62–63](story/dreamworlds.md:62) requires same-dream-persistent-across-sessions; the existing engine model gives you this for free if dream object ids are stable. Document the requirement in CLAUDE.md so authors don't break it.

## Tier 3 — UI shifts

The placeholders are placeholders for a reason; now we know what they're for.

8. **Replace `SidePanel` with a tabbed panel: Inventory + Case Files** — [src/components/SidePanel.vue](src/components/SidePanel.vue). Two tabs. Inventory shows item names/icons from `adventure.items` (existing). Case Files lists patients with `status === 'inResidence' | 'improving' | 'healed'`; clicking opens the file in a modal or in the panel itself. The panel is contextually relevant in hub mode and largely empty/different in dream mode (Tier 3.11 below).

9. **Remove `GroundPanel`** — [src/components/GroundPanel.vue](src/components/GroundPanel.vue), [AdventureGame.vue](src/components/AdventureGame.vue). It's a placeholder for a feature the story doesn't actually call for. Drop it. Its 120px of vertical space goes to a taller scene or narration panel.

10. **Choice prompt UI in `NarrationPanel`** — [src/components/NarrationPanel.vue](src/components/NarrationPanel.vue). When `dialogState` is non-null, render the active node's choices as a list of buttons after the latest narration line. Selecting one runs the choice's actions and clears the prompt (the next node either renders a new prompt or returns control to the scene).

11. **Hub-mode vs dream-mode chrome** — [AdventureGame.vue](src/components/AdventureGame.vue). Subtly different framing for the two contexts. Hub: title shows the location ("The Library"), side panel shows Inventory + Case Files. Dream: title shows the patient's name and session number ("Whitfield — Session 2"), side panel shows only Inventory (case files aren't readable from inside a dream), narration colour shifts slightly. Drives home that the dream is a different mode, supports the [dreamworlds.md](story/dreamworlds.md) "different mind, different feel" register.

## Tier 4 — Vertical slice content

Use the new primitives to build a playable vertical slice. This is also the live test for everything in Tiers 1–3.

12. **The Whitfield tutorial** — new `src/adventures/main.json` (or split into `src/adventures/main/` + scene files). Mirrors [the_offer.md](story/scenes/the_offer.md) and [patients.md:9–13](story/patients.md:9). Includes:
    - **Hub scenes**: Wren's study (the offer), the device room (chairs + monitor), Ashley's room.
    - **One closed-door scene**: the parents' suite door, `visibleIf: { type: 'flag', flag: 'midGameUnlocked' }` set to false at game-start. Visible-but-blocked. Clicking it triggers a "you don't go in there" beat — the seed of the mid-game pivot.
    - **Whitfield's case file** as patient data.
    - **Whitfield's dream**: a stylised concert hall with a stage that won't open, wings that go deeper than they should, and a corridor unlocked by `flag: 'consideredTeacher'`. The intervention is *witness, not exorcism* per [the_offer.md:79](story/scenes/the_offer.md:79) — the puzzle is finding the corridor and walking it with her, not solving the keys.
    - **Exit phrase**: a special action `speakExitPhrase` that takes a string and only triggers `wake` if it matches `'the light in the conservatory'`. Speaking the wrong phrase narrates Wren's voice prompting from the rig.
    - **Post-session debrief**: short dialog with Wren back in the device room, sets `patientStatus` to `'improving'` or `'unhelped'` based on whether the corridor was walked.

13. **Cabin demo demoted to dev-only fixture** — [src/adventures/index.ts](src/adventures/index.ts). Keep `cabin.json` as a regression bed (it exercises hidden-key, conditional reveals, dialog narration). Hide its catalog entry behind `import.meta.env.DEV` so production builds only land on the main game.

## Tier 5 — Decisions that need to be made (or deliberately deferred)

These are not implementation items — they're forks the story material left open and the engine plan needs to know the answer to. Worth deciding before they ossify.

14. **Outside-time pressure: yes or no.** [REVIEW.md](story/REVIEW.md) item 9. If yes, engine needs a clock (`state.timeUnits` or similar) and patient sessions consume budget; weekly-rotation pressure becomes a real game system. If no, scale back the dream-time variability claim in [dreamworlds.md:42](story/dreamworlds.md:42) and don't build the clock. Default proposal: **no clock for the vertical slice**, revisit after the Whitfield case ships and the rhythm is felt.

15. **Hint system shape.** [REVIEW.md](story/REVIEW.md) item 8. If hints route through Wren on dream-exit (option a), the engine needs only a "stuck dialog" set per dream. If scripted hub events are the primary backstory drip (option b), hints become incidental. Default proposal: **hub events are primary; hint dialogs are a bonus**, so the player who never gets stuck still gets the story.

16. **Observer-mode (third chair) as gameplay.** [REVIEW.md](story/REVIEW.md) "smaller things". Distinct enough to carry a beat (Ashley observes Elias and learns something about him from inside) but adds a whole rendering mode (cannot interact). Default proposal: **defer past Tier 4**; revisit after the operator loop is solid.

17. **Save slots vs single autosave.** Single autosave is sufficient for the vertical slice. Slot UI is straightforward to add later if narrative branching demands it.

18. **The validation pass from `next.md` Tier 3** lands here, alongside Whitfield. It's now load-bearing: a typo in a `setPatientStatus` action shouldn't fail mid-session.
