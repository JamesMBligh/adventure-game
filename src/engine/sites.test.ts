import { describe, it, expect, beforeAll } from 'vitest';
import { GameEngine, ensureBuiltInsRegistered } from './index';
import type { Adventure } from '../types';

beforeAll(() => {
  ensureBuiltInsRegistered();
});

function baseAdventure(): Adventure {
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
    dialogs: {
      studyOpen: {
        id: 'studyOpen',
        start: 'open',
        nodes: {
          open: {
            text: 'You are in the study.',
            choices: [
              {
                text: 'Leave',
                actions: [
                  { type: 'setFlag', flag: 'visitedStudy', value: true },
                  { type: 'endDialog' },
                ],
              },
            ],
          },
        },
      },
      bedroomOpen: {
        id: 'bedroomOpen',
        start: 'open',
        nodes: {
          open: {
            text: 'A bedroom.',
            choices: [{ text: 'Leave', actions: [{ type: 'endDialog' }] }],
          },
        },
      },
      atticOpen: {
        id: 'atticOpen',
        start: 'open',
        nodes: {
          open: {
            text: 'An attic.',
            choices: [{ text: 'Leave', actions: [{ type: 'endDialog' }] }],
          },
        },
      },
    },
    interactions: [
      {
        id: 'studyVisit',
        location: 'study',
        dialog: 'studyOpen',
      },
      {
        id: 'bedroomVisit',
        location: 'bedroom',
        conditions: [{ type: 'flag', flag: 'offerDone' }],
        dialog: 'bedroomOpen',
      },
      {
        id: 'atticVisit',
        location: 'attic',
        conditions: [{ type: 'flag', flag: 'offerDone' }],
        dialog: 'atticOpen',
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

  it('flag defaults are seeded from adventure.flags', async () => {
    const adv = baseAdventure();
    const engine = new GameEngine(adv);
    expect(engine.state.flags.visitedStudy).toBe(false);
    expect(engine.state.flags.offerDone).toBe(false);
  });
});
