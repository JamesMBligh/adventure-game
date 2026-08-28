import { describe, it, expect, beforeAll } from 'vitest';
import { ensureBuiltInsRegistered, GameEngine, runActions } from './index';
import type { Adventure } from '../types';

beforeAll(() => {
  ensureBuiltInsRegistered();
});

function makeAdventure(): Adventure {
  return {
    title: 't',
    startScene: 'a',
    initialState: { flags: {}, inventory: [] },
    scenes: { a: { name: 'A' } },
    dialogs: {
      simple: {
        id: 'simple',
        start: 'open',
        nodes: {
          open: {
            speaker: 'NPC',
            text: 'Pick a thing.',
            choices: [
              { text: 'Greet', actions: [{ type: 'setFlag', flag: 'greeted' }], next: 'after' },
              {
                text: 'Leave',
                actions: [{ type: 'endDialog' }],
              },
              { text: 'Hidden', visibleIf: { type: 'flag', flag: 'never' } },
            ],
          },
          after: {
            text: 'Thanks for greeting.',
            choices: [{ text: 'Bye', actions: [{ type: 'endDialog' }] }],
          },
        },
      },
    },
  };
}

describe('dialog system', () => {
  it('startDialog emits the node text and lists visible choices', async () => {
    const engine = new GameEngine(makeAdventure());
    await runActions([{ type: 'startDialog', dialog: 'simple' }], { engine });
    expect(engine.state.dialogState).toEqual({ dialogId: 'simple', nodeId: 'open' });
    expect(engine.activeDialogNode.value?.text).toBe('Pick a thing.');
    // Hidden choice filtered out.
    expect(engine.availableChoices.value.map((c) => c.text)).toEqual(['Greet', 'Leave']);
    // First narration entry is the node text with speaker set.
    const dialogLines = engine.state.narration.filter((n) => n.kind === 'dialog');
    expect(dialogLines[0]).toMatchObject({ text: 'Pick a thing.', speaker: 'NPC' });
  });

  it('chooseDialogOption runs choice actions and advances via next', async () => {
    const engine = new GameEngine(makeAdventure());
    await runActions([{ type: 'startDialog', dialog: 'simple' }], { engine });
    await engine.chooseDialogOption(0); // Greet -> next: after
    expect(engine.state.flags.greeted).toBe(true);
    expect(engine.state.dialogState?.nodeId).toBe('after');
  });

  it('endDialog action clears dialogState', async () => {
    const engine = new GameEngine(makeAdventure());
    await runActions([{ type: 'startDialog', dialog: 'simple' }], { engine });
    await engine.chooseDialogOption(1); // Leave -> endDialog
    expect(engine.state.dialogState).toBeNull();
  });

  it('startDialog with unknown dialog id is a no-op (warned)', async () => {
    const engine = new GameEngine(makeAdventure());
    await runActions([{ type: 'startDialog', dialog: 'missing' }], { engine });
    expect(engine.state.dialogState).toBeNull();
  });

  it('node ids are scoped per dialog — same-name nodes in different dialogs do not cross-contaminate', async () => {
    const adv: Adventure = {
      title: 't',
      startScene: 'a',
      flags: { firstHit: { default: false }, secondHit: { default: false } },
      scenes: { a: { name: 'A' } },
      dialogs: {
        // Both dialogs share node names "open" and "follow". The engine
        // should look up nodes by (dialogId, nodeId), not by nodeId alone.
        first: {
          id: 'first',
          start: 'open',
          nodes: {
            open: {
              text: 'first.open',
              onEnter: [{ type: 'setFlag', flag: 'firstHit', value: true }],
              choices: [{ text: 'go', next: 'follow' }],
            },
            follow: {
              text: 'first.follow',
              choices: [{ text: 'end', actions: [{ type: 'endDialog' }] }],
            },
          },
        },
        second: {
          id: 'second',
          start: 'open',
          nodes: {
            open: {
              text: 'second.open',
              onEnter: [{ type: 'setFlag', flag: 'secondHit', value: true }],
              choices: [{ text: 'go', next: 'follow' }],
            },
            follow: {
              text: 'second.follow',
              choices: [{ text: 'end', actions: [{ type: 'endDialog' }] }],
            },
          },
        },
      },
    };
    const engine = new GameEngine(adv);

    // Start the first dialog — only firstHit should set.
    await runActions([{ type: 'startDialog', dialog: 'first' }], { engine });
    expect(engine.state.flags.firstHit).toBe(true);
    expect(engine.state.flags.secondHit).toBe(false);
    expect(engine.state.dialogState?.dialogId).toBe('first');
    expect(engine.state.dialogState?.nodeId).toBe('open');

    // Advancing 'first' via "go" should land in first.follow, not second.follow.
    await engine.chooseDialogOption(0);
    expect(engine.state.dialogState?.dialogId).toBe('first');
    expect(engine.state.dialogState?.nodeId).toBe('follow');
    const lastFromFirst = engine.state.narration[engine.state.narration.length - 1].text;
    expect(lastFromFirst).toBe('first.follow');

    // End first dialog.
    await engine.chooseDialogOption(0);
    expect(engine.state.dialogState).toBeNull();

    // Now start the SECOND dialog. Only secondHit's onEnter should run this time.
    engine.state.flags.firstHit = false; // reset for clarity
    await runActions([{ type: 'startDialog', dialog: 'second' }], { engine });
    expect(engine.state.flags.firstHit).toBe(false);
    expect(engine.state.flags.secondHit).toBe(true);
    expect(engine.state.dialogState?.dialogId).toBe('second');
    expect(engine.state.dialogState?.nodeId).toBe('open');

    await engine.chooseDialogOption(0);
    expect(engine.state.dialogState?.dialogId).toBe('second');
    expect(engine.state.dialogState?.nodeId).toBe('follow');
    const lastFromSecond = engine.state.narration[engine.state.narration.length - 1].text;
    expect(lastFromSecond).toBe('second.follow');
  });

  it('runs a node’s onEnter actions after pushing its text', async () => {
    const adv: Adventure = {
      title: 't',
      startScene: 'a',
      flags: { stepReached: { default: false } },
      scenes: { a: { name: 'A' } },
      dialogs: {
        flow: {
          id: 'flow',
          start: 'open',
          nodes: {
            open: {
              text: 'Opening line.',
              onEnter: [{ type: 'setFlag', flag: 'stepReached', value: true }],
              choices: [{ text: 'Ok', actions: [{ type: 'endDialog' }] }],
            },
          },
        },
      },
    };
    const engine = new GameEngine(adv);
    expect(engine.state.flags.stepReached).toBe(false);
    await runActions([{ type: 'startDialog', dialog: 'flow' }], { engine });
    // Text was pushed AND onEnter ran.
    expect(engine.state.narration.map((e) => e.text)).toContain('Opening line.');
    expect(engine.state.flags.stepReached).toBe(true);
  });

  it('nochoice auto-advances to the next node without showing a button', async () => {
    const adv: Adventure = {
      title: 't',
      startScene: 'a',
      flags: { reachedSecond: { default: false } },
      scenes: { a: { name: 'A' } },
      dialogs: {
        flow: {
          id: 'flow',
          start: 'open',
          nodes: {
            open: {
              text: 'A.',
              nochoice: { next: 'second' },
            },
            second: {
              text: 'B.',
              onEnter: [{ type: 'setFlag', flag: 'reachedSecond', value: true }],
              choices: [{ text: 'Ok', actions: [{ type: 'endDialog' }] }],
            },
          },
        },
      },
    };
    const engine = new GameEngine(adv);
    await runActions([{ type: 'startDialog', dialog: 'flow' }], { engine });
    // Both nodes' texts pushed; auto-advance reached second; choice waits.
    const texts = engine.state.narration.map((e) => e.text);
    expect(texts).toContain('A.');
    expect(texts).toContain('B.');
    expect(engine.state.flags.reachedSecond).toBe(true);
    expect(engine.state.dialogState?.nodeId).toBe('second');
  });

  it('nochoice without text suppresses the player-choice echo', async () => {
    const adv: Adventure = {
      title: 't',
      startScene: 'a',
      scenes: { a: { name: 'A' } },
      dialogs: {
        flow: {
          id: 'flow',
          start: 'open',
          nodes: {
            open: {
              text: 'A.',
              nochoice: { next: 'second' }, // no text → no echo
            },
            second: {
              text: 'B.',
              choices: [{ text: 'Ok', actions: [{ type: 'endDialog' }] }],
            },
          },
        },
      },
    };
    const engine = new GameEngine(adv);
    await runActions([{ type: 'startDialog', dialog: 'flow' }], { engine });
    const echoLines = engine.state.narration.filter((e) => e.text.startsWith('> '));
    expect(echoLines).toHaveLength(0);
  });

  it('nochoice with text emits a player-choice echo', async () => {
    const adv: Adventure = {
      title: 't',
      startScene: 'a',
      scenes: { a: { name: 'A' } },
      dialogs: {
        flow: {
          id: 'flow',
          start: 'open',
          nodes: {
            open: {
              text: 'A.',
              nochoice: { text: 'Move on.', next: 'second' },
            },
            second: {
              text: 'B.',
              choices: [{ text: 'Ok', actions: [{ type: 'endDialog' }] }],
            },
          },
        },
      },
    };
    const engine = new GameEngine(adv);
    await runActions([{ type: 'startDialog', dialog: 'flow' }], { engine });
    const echoLines = engine.state.narration.filter((e) => e.text.startsWith('> '));
    expect(echoLines.map((e) => e.text)).toContain('> Move on.');
  });

  it('empty nochoice ends the dialog', async () => {
    const adv: Adventure = {
      title: 't',
      startScene: 'a',
      scenes: { a: { name: 'A' } },
      dialogs: {
        flow: {
          id: 'flow',
          start: 'open',
          nodes: {
            open: { text: 'A.', nochoice: {} },
          },
        },
      },
    };
    const engine = new GameEngine(adv);
    await runActions([{ type: 'startDialog', dialog: 'flow' }], { engine });
    expect(engine.state.dialogState).toBeNull();
  });

  it('onEnter on the next node fires when advanced to via a choice', async () => {
    const adv: Adventure = {
      title: 't',
      startScene: 'a',
      flags: { firstReached: { default: false }, secondReached: { default: false } },
      scenes: { a: { name: 'A' } },
      dialogs: {
        flow: {
          id: 'flow',
          start: 'open',
          nodes: {
            open: {
              text: 'A.',
              onEnter: [{ type: 'setFlag', flag: 'firstReached', value: true }],
              choices: [{ text: 'go', next: 'second' }],
            },
            second: {
              text: 'B.',
              onEnter: [{ type: 'setFlag', flag: 'secondReached', value: true }],
              choices: [{ text: 'Ok', actions: [{ type: 'endDialog' }] }],
            },
          },
        },
      },
    };
    const engine = new GameEngine(adv);
    await runActions([{ type: 'startDialog', dialog: 'flow' }], { engine });
    expect(engine.state.flags.firstReached).toBe(true);
    expect(engine.state.flags.secondReached).toBe(false);
    await engine.chooseDialogOption(0);
    expect(engine.state.flags.secondReached).toBe(true);
  });
});
