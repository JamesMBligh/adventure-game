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
});
