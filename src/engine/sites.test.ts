import { describe, it, expect, beforeAll } from 'vitest';
import { GameEngine, ensureBuiltInsRegistered, runActions } from './index';
import type { Adventure } from '../types';

beforeAll(() => {
  ensureBuiltInsRegistered();
});

function baseAdventure(): Adventure {
  const studyOpen = {
    id: 'studyOpen',
    start: 'open',
    nodes: {
      open: {
        text: 'You are in the study.',
        choices: [
          {
            text: 'Leave',
            actions: [
              { type: 'setFlag' as const, flag: 'visitedStudy', value: true },
              { type: 'endDialog' as const },
            ],
          },
        ],
      },
    },
  };
  const bedroomOpen = {
    id: 'bedroomOpen',
    start: 'open',
    nodes: {
      open: {
        text: 'A bedroom.',
        choices: [{ text: 'Leave', actions: [{ type: 'endDialog' as const }] }],
      },
    },
  };
  const atticOpen = {
    id: 'atticOpen',
    start: 'open',
    nodes: {
      open: {
        text: 'An attic.',
        choices: [{ text: 'Leave', actions: [{ type: 'endDialog' as const }] }],
      },
    },
  };

  return {
    title: 't',
    startSite: 'first_floor',
    flags: {
      visitedStudy: { default: false },
      offerDone: { default: false },
    },
    sites: {
      first_floor: {
        name: 'First Floor',
        locations: {
          study: { name: 'Study', x: 15, y: 15 },
          bedroom: { name: 'Bedroom', x: 65, y: 15 },
          stairs_up: {
            name: 'Stairs up',
            x: 10,
            y: 90,
            target: 'second_floor',
          },
        },
      },
      second_floor: {
        name: 'Second Floor',
        locations: {
          attic: { name: 'Attic', x: 15, y: 15 },
          stairs_down: {
            name: 'Stairs down',
            x: 10,
            y: 90,
            target: 'first_floor',
          },
        },
      },
    },
    // Mansion dialogs live inline on the interactions. The top-level dialogs
    // map is what the engine's startDialog action looks up by id — the loader
    // normally populates it from inline dialogs; tests construct Adventure
    // directly so they keep both in sync.
    dialogs: { studyOpen, bedroomOpen, atticOpen },
    interactions: [
      {
        id: 'studyVisit',
        location: 'study',
        dialog: studyOpen,
      },
      {
        id: 'bedroomVisit',
        location: 'bedroom',
        conditions: [{ type: 'flag', flag: 'offerDone' }],
        dialog: bedroomOpen,
      },
      {
        id: 'atticVisit',
        location: 'attic',
        conditions: [{ type: 'flag', flag: 'offerDone' }],
        dialog: atticOpen,
      },
    ],
  };
}

describe('mansion sites & interactions', () => {
  it('starts the player at startSite when no startInteraction', async () => {
    const adv = baseAdventure();
    const engine = new GameEngine(adv);
    await engine.start();
    expect(engine.state.currentSiteId).toBe('first_floor');
    expect(engine.state.activeInteractionId).toBeNull();
  });

  it('auto-runs startInteraction on start()', async () => {
    const adv = baseAdventure();
    adv.startInteraction = 'studyVisit';
    const engine = new GameEngine(adv);
    await engine.start();
    expect(engine.state.activeInteractionId).toBe('studyVisit');
    expect(engine.state.dialogState?.dialogId).toBe('studyOpen');
  });

  it('clickLocation picks the first qualifying interaction', async () => {
    const adv = baseAdventure();
    const engine = new GameEngine(adv);
    await engine.start();
    await engine.clickLocation('study');
    expect(engine.state.activeInteractionId).toBe('studyVisit');
    await engine.clickLocation('bedroom');
    // bedroomVisit requires offerDone, which is false → click is no-op
    // (we're still in studyVisit since the no-match click did nothing).
    expect(engine.state.activeInteractionId).toBe('studyVisit');
  });

  it('exits interaction automatically when the dialog ends', async () => {
    const adv = baseAdventure();
    const engine = new GameEngine(adv);
    await engine.start();
    await engine.clickLocation('study');
    expect(engine.state.activeInteractionId).toBe('studyVisit');
    await engine.chooseDialogOption(0);
    expect(engine.state.dialogState).toBeNull();
    expect(engine.state.activeInteractionId).toBeNull();
    expect(engine.state.currentSiteId).toBe('first_floor');
    expect(engine.state.flags.visitedStudy).toBe(true);
  });

  it('hides non-transition locations with no qualifying interaction', async () => {
    const adv = baseAdventure();
    const engine = new GameEngine(adv);
    await engine.start();
    const ids = engine.visibleLocations.value.map((e) => e.id);
    expect(ids).toContain('study');
    expect(ids).not.toContain('bedroom');
  });

  it('hides transition locations whose target site has no qualifying interaction', async () => {
    const adv = baseAdventure();
    const engine = new GameEngine(adv);
    await engine.start();
    // second_floor: attic is gated on offerDone (not set), stairs_down is just
    // a back-link to first_floor. Back-links do not count as "content", so
    // from first_floor the second_floor entrance must be hidden — there is
    // nothing to do over there yet.
    expect(engine.visibleLocations.value.map((e) => e.id)).not.toContain('stairs_up');
  });

  it('shows a transition once the target site has a qualifying interaction', async () => {
    const adv = baseAdventure();
    const engine = new GameEngine(adv);
    await engine.start();
    // Flip the gate so atticVisit qualifies; now second_floor has real content
    // and the stairs_up entrance from first_floor should appear.
    engine.state.flags.offerDone = true;
    expect(engine.visibleLocations.value.map((e) => e.id)).toContain('stairs_up');
  });

  it('transition to startSite is always shown', async () => {
    const adv = baseAdventure();
    const engine = new GameEngine(adv);
    await engine.start();
    await engine.enterSite('second_floor');
    const ids = engine.visibleLocations.value.map((e) => e.id);
    // stairs_down targets start site → always visible
    expect(ids).toContain('stairs_down');
    // attic is gated and not visible
    expect(ids).not.toContain('attic');
  });

  describe('highlight', () => {
    it('a non-transition location is highlighted when its qualifying interaction sets highlight: true', async () => {
      const adv = baseAdventure();
      adv.interactions![0].highlight = true; // studyVisit
      const engine = new GameEngine(adv);
      await engine.start();
      const study = engine.visibleLocations.value.find((e) => e.id === 'study');
      expect(study?.highlight).toBe(true);
    });

    it('a location is NOT highlighted when its interaction has highlight unset or false', async () => {
      const adv = baseAdventure();
      const engine = new GameEngine(adv);
      await engine.start();
      const study = engine.visibleLocations.value.find((e) => e.id === 'study');
      expect(study?.highlight).toBe(false);
    });

    it('a transition icon highlights when a reachable site has a highlighted qualifying interaction', async () => {
      const adv = baseAdventure();
      adv.interactions![2].highlight = true; // atticVisit
      const engine = new GameEngine(adv);
      await engine.start();
      // attic is gated; without offerDone the highlight cannot propagate
      // because there's no qualifying interaction at all.
      engine.state.flags.offerDone = true;
      const stairs = engine.visibleLocations.value.find((e) => e.id === 'stairs_up');
      expect(stairs?.highlight).toBe(true);
    });

    it('a transition icon does NOT highlight when reachable interactions have no highlight flag', async () => {
      const adv = baseAdventure();
      const engine = new GameEngine(adv);
      await engine.start();
      engine.state.flags.offerDone = true;
      const stairs = engine.visibleLocations.value.find((e) => e.id === 'stairs_up');
      expect(stairs?.highlight).toBe(false);
    });
  });

  describe('interaction visual overrides', () => {
    it('sets and clears background and animations via setInteractionVisuals', async () => {
      const adv = baseAdventure();
      const engine = new GameEngine(adv);
      await engine.start();
      await engine.clickLocation('study');
      expect(engine.state.interactionBackgroundOverride).toBeNull();
      expect(engine.state.interactionAnimationsOverride).toBeNull();

      await runActions(
        [{ type: 'setInteractionVisuals', background: '#000', animations: ['dim'] }],
        { engine },
      );
      expect(engine.state.interactionBackgroundOverride).toBe('#000');
      expect(engine.state.interactionAnimationsOverride).toEqual(['dim']);

      // Null clears one without touching the other.
      await runActions(
        [{ type: 'setInteractionVisuals', background: null }],
        { engine },
      );
      expect(engine.state.interactionBackgroundOverride).toBeNull();
      expect(engine.state.interactionAnimationsOverride).toEqual(['dim']);
    });

    it('clears overrides on exitInteraction', async () => {
      const adv = baseAdventure();
      const engine = new GameEngine(adv);
      await engine.start();
      await engine.clickLocation('study');
      await runActions(
        [{ type: 'setInteractionVisuals', background: '#000', animations: ['dim'] }],
        { engine },
      );
      await engine.exitInteraction();
      expect(engine.state.interactionBackgroundOverride).toBeNull();
      expect(engine.state.interactionAnimationsOverride).toBeNull();
    });

    it('setInteractionVisuals.overlays replaces and clears the overlay override', async () => {
      const adv = baseAdventure();
      const engine = new GameEngine(adv);
      await engine.start();
      await engine.clickLocation('study');
      expect(engine.state.interactionOverlaysOverride).toBeNull();

      await runActions(
        [
          {
            type: 'setInteractionVisuals',
            overlays: [{ id: 'fog', image: 'main/fog.png' }],
          },
        ],
        { engine },
      );
      expect(engine.state.interactionOverlaysOverride).toEqual([
        { id: 'fog', image: 'main/fog.png' },
      ]);

      await runActions(
        [{ type: 'setInteractionVisuals', overlays: null }],
        { engine },
      );
      expect(engine.state.interactionOverlaysOverride).toBeNull();
    });

    it('setInteractionVisuals.addOverlay appends or replaces by id', async () => {
      const adv = baseAdventure();
      const engine = new GameEngine(adv);
      await engine.start();
      await engine.clickLocation('study');

      await runActions(
        [{ type: 'setInteractionVisuals', addOverlay: { id: 'fog', image: 'a.png' } }],
        { engine },
      );
      expect(engine.state.interactionOverlaysOverride).toEqual([
        { id: 'fog', image: 'a.png' },
      ]);

      await runActions(
        [{ type: 'setInteractionVisuals', addOverlay: { id: 'tree', image: 'b.png' } }],
        { engine },
      );
      expect(engine.state.interactionOverlaysOverride).toEqual([
        { id: 'fog', image: 'a.png' },
        { id: 'tree', image: 'b.png' },
      ]);

      // Adding with an existing id replaces in place rather than appending.
      await runActions(
        [{ type: 'setInteractionVisuals', addOverlay: { id: 'fog', image: 'a2.png' } }],
        { engine },
      );
      expect(engine.state.interactionOverlaysOverride).toEqual([
        { id: 'fog', image: 'a2.png' },
        { id: 'tree', image: 'b.png' },
      ]);
    });

    it('overlay place is preserved through addOverlay and bulk overlays', async () => {
      const adv = baseAdventure();
      const engine = new GameEngine(adv);
      await engine.start();
      await engine.clickLocation('study');

      await runActions(
        [
          {
            type: 'setInteractionVisuals',
            addOverlay: {
              id: 'wren',
              image: 'main/wren.png',
              place: { top: 30, left: 55, scale: 80 },
            },
          },
        ],
        { engine },
      );
      expect(engine.state.interactionOverlaysOverride).toEqual([
        { id: 'wren', image: 'main/wren.png', place: { top: 30, left: 55, scale: 80 } },
      ]);
    });

    it('overlay z is preserved (data order is insertion; render order is z-sorted)', async () => {
      const adv = baseAdventure();
      const engine = new GameEngine(adv);
      await engine.start();
      await engine.clickLocation('study');

      // Add three overlays out of z order. The data array should keep the
      // order they were added (so addOverlay stays predictable).
      await runActions(
        [
          { type: 'setInteractionVisuals', addOverlay: { id: 'mid',  image: 'm.png', z: 5  } },
          { type: 'setInteractionVisuals', addOverlay: { id: 'back', image: 'b.png', z: 0  } },
          { type: 'setInteractionVisuals', addOverlay: { id: 'top',  image: 't.png', z: 10 } },
        ],
        { engine },
      );
      expect(engine.state.interactionOverlaysOverride?.map((o) => o.id)).toEqual([
        'mid',
        'back',
        'top',
      ]);
      // (The render-time sort by z happens in InteractionView's computed —
      // tested implicitly via the visual behaviour; engine state stays insertion-ordered.)
    });

    it('overlay rect is preserved through addOverlay and overlays paths', async () => {
      const adv = baseAdventure();
      const engine = new GameEngine(adv);
      await engine.start();
      await engine.clickLocation('study');

      await runActions(
        [
          {
            type: 'setInteractionVisuals',
            addOverlay: {
              id: 'tree',
              image: 'main/tree.png',
              rect: { x: 10, y: 20, w: 30, h: 40 },
            },
          },
        ],
        { engine },
      );
      expect(engine.state.interactionOverlaysOverride).toEqual([
        { id: 'tree', image: 'main/tree.png', rect: { x: 10, y: 20, w: 30, h: 40 } },
      ]);

      await runActions(
        [
          {
            type: 'setInteractionVisuals',
            overlays: [
              { id: 'sky', image: 'main/sky.png' }, // no rect = full coverage
              {
                id: 'sun',
                image: 'main/sun.png',
                rect: { x: 70, y: 5, w: 15, h: 15 },
              },
            ],
          },
        ],
        { engine },
      );
      const ovs = engine.state.interactionOverlaysOverride;
      expect(ovs?.length).toBe(2);
      expect(ovs?.[0]).toEqual({ id: 'sky', image: 'main/sky.png' });
      expect(ovs?.[1]).toEqual({
        id: 'sun',
        image: 'main/sun.png',
        rect: { x: 70, y: 5, w: 15, h: 15 },
      });
    });

    it('setInteractionVisuals.removeOverlay removes by id', async () => {
      const adv = baseAdventure();
      const engine = new GameEngine(adv);
      await engine.start();
      await engine.clickLocation('study');

      await runActions(
        [
          {
            type: 'setInteractionVisuals',
            overlays: [
              { id: 'fog', image: 'a.png' },
              { id: 'tree', image: 'b.png' },
            ],
          },
        ],
        { engine },
      );
      await runActions(
        [{ type: 'setInteractionVisuals', removeOverlay: 'fog' }],
        { engine },
      );
      expect(engine.state.interactionOverlaysOverride).toEqual([
        { id: 'tree', image: 'b.png' },
      ]);
    });

    it('clears overrides on enterInteraction (fresh interaction starts clean)', async () => {
      const adv = baseAdventure();
      const engine = new GameEngine(adv);
      await engine.start();
      await engine.clickLocation('study');
      await runActions(
        [{ type: 'setInteractionVisuals', background: '#000' }],
        { engine },
      );
      // Force-enter another interaction directly without exiting first.
      await engine.enterInteraction('studyVisit');
      expect(engine.state.interactionBackgroundOverride).toBeNull();
    });
  });

  it('flag defaults are seeded from adventure.flags', async () => {
    const adv = baseAdventure();
    const engine = new GameEngine(adv);
    expect(engine.state.flags.visitedStudy).toBe(false);
    expect(engine.state.flags.offerDone).toBe(false);
  });
});
