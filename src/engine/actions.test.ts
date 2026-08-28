import { describe, it, expect, beforeAll } from 'vitest';
import { ensureBuiltInsRegistered, GameEngine, runActions, setWordRevealMs } from './index';
import type { Adventure } from '../types';

beforeAll(() => {
  ensureBuiltInsRegistered();
});

function makeEngine(over: Partial<Adventure> = {}): GameEngine {
  const adventure: Adventure = {
    title: 't',
    startScene: 'a',
    initialState: { flags: {}, inventory: [] },
    items: { key: { name: 'Brass Key' } },
    scenes: {
      a: {
        name: 'A',
        objects: [
          { id: 'rock', name: 'Rock', x: 0, y: 0 },
          { id: 'door', name: 'Door', x: 0, y: 0, initiallyHidden: true },
        ],
      },
      b: { name: 'B' },
    },
    ...over,
  };
  return new GameEngine(adventure);
}

describe('runActions', () => {
  it('narrate appends a narration entry with kind narration by default', async () => {
    const engine = makeEngine();
    await runActions([{ type: 'narrate', text: 'hello' }], { engine });
    expect(engine.state.narration).toEqual([
      expect.objectContaining({ kind: 'narration', text: 'hello' }),
    ]);
  });

  it('narrate honors speaker and kind', async () => {
    const engine = makeEngine();
    await runActions([{ type: 'narrate', text: 'hi', speaker: 'Bob', kind: 'dialog' }], { engine });
    expect(engine.state.narration[0]).toMatchObject({
      kind: 'dialog',
      text: 'hi',
      speaker: 'Bob',
    });
  });

  it('setFlag writes to flags', async () => {
    const engine = makeEngine();
    await runActions([{ type: 'setFlag', flag: 'opened' }], { engine });
    expect(engine.state.flags.opened).toBe(true);
    await runActions([{ type: 'setFlag', flag: 'opened', value: false }], { engine });
    expect(engine.state.flags.opened).toBe(false);
  });

  it('addItem is idempotent and records system narration once', async () => {
    const engine = makeEngine();
    await runActions([{ type: 'addItem', item: 'key' }], { engine });
    await runActions([{ type: 'addItem', item: 'key' }], { engine });
    expect(engine.state.inventory).toEqual(['key']);
    const systemEntries = engine.state.narration.filter((n) => n.kind === 'system');
    expect(systemEntries).toHaveLength(1);
    expect(systemEntries[0].text).toContain('Brass Key');
  });

  it('removeItem removes only when present', async () => {
    const engine = makeEngine();
    await runActions([{ type: 'addItem', item: 'key' }], { engine });
    await runActions([{ type: 'removeItem', item: 'key' }], { engine });
    await runActions([{ type: 'removeItem', item: 'key' }], { engine });
    expect(engine.state.inventory).toEqual([]);
  });

  it('hideObject and showObject interact with initiallyHidden and visibleIf', async () => {
    const engine = makeEngine();
    expect(engine.visibleObjects.value.map((o) => o.id)).toEqual(['rock']);

    await runActions([{ type: 'showObject', object: 'door' }], { engine });
    expect(engine.visibleObjects.value.map((o) => o.id)).toEqual(['rock', 'door']);

    await runActions([{ type: 'hideObject', object: 'rock' }], { engine });
    expect(engine.visibleObjects.value.map((o) => o.id)).toEqual(['door']);
  });

  it('hideObject defaults to the triggering object', async () => {
    const engine = makeEngine();
    const rock = engine.adventure.scenes!.a.objects![0];
    await runActions([{ type: 'hideObject' }], { engine, object: rock });
    expect(engine.visibleObjects.value.map((o) => o.id)).toEqual([]);
  });

  it('if/then/else branches on the condition', async () => {
    const engine = makeEngine();
    await runActions(
      [
        {
          type: 'if',
          condition: { type: 'hasItem', item: 'key' },
          then: [{ type: 'narrate', text: 'have key' }],
          else: [{ type: 'narrate', text: 'no key' }],
        },
      ],
      { engine },
    );
    expect(engine.state.narration[0].text).toBe('no key');

    await runActions(
      [
        { type: 'addItem', item: 'key' },
        {
          type: 'if',
          condition: { type: 'hasItem', item: 'key' },
          then: [{ type: 'narrate', text: 'have key' }],
          else: [{ type: 'narrate', text: 'no key' }],
        },
      ],
      { engine },
    );
    const lastNarration = engine.state.narration[engine.state.narration.length - 1];
    expect(lastNarration.text).toBe('have key');
  });

  it('sequence runs nested actions', async () => {
    const engine = makeEngine();
    await runActions(
      [
        {
          type: 'sequence',
          actions: [
            { type: 'narrate', text: 'first' },
            { type: 'narrate', text: 'second' },
          ],
        },
      ],
      { engine },
    );
    expect(engine.state.narration.map((n) => n.text)).toEqual(['first', 'second']);
  });

  it('unknown action type is skipped', async () => {
    const engine = makeEngine();
    await expect(runActions([{ type: 'mystery' }], { engine })).resolves.toBeUndefined();
  });

  it('narration ids reset across engine instances', async () => {
    const a = makeEngine();
    await runActions([{ type: 'narrate', text: 'x' }], { engine: a });
    const b = makeEngine();
    await runActions([{ type: 'narrate', text: 'y' }], { engine: b });
    expect(b.state.narration[0].id).toBe(1);
  });

  it('skipReveal short-circuits the engine wait and bumps revealSkipTick', async () => {
    setWordRevealMs(500); // 500ms per word — long enough that without skip we'd block
    try {
      const engine = makeEngine();
      const tickBefore = engine.revealSkipTick.value;
      const start = Date.now();
      // Run a narrate (3 words → would be 1500ms) but fire skipReveal next tick.
      const promise = runActions([{ type: 'narrate', text: 'one two three' }], { engine });
      setTimeout(() => engine.skipReveal(), 20);
      await promise;
      const elapsed = Date.now() - start;
      // Should have resolved roughly when skip fired (~20ms), not the full 1500ms.
      expect(elapsed).toBeLessThan(500);
      expect(engine.revealSkipTick.value).toBe(tickBefore + 1);
    } finally {
      setWordRevealMs(0);
    }
  });

  it('narrate awaits the per-word reveal duration before the next action', async () => {
    // Pin reveal to a small non-zero value just for this test, then restore.
    setWordRevealMs(20);
    try {
      const engine = makeEngine();
      const start = Date.now();
      await runActions(
        [
          { type: 'narrate', text: 'one two three' }, // 3 words × 20ms = 60ms
          { type: 'narrate', text: 'four' }, //           1 word × 20ms = 20ms
        ],
        { engine },
      );
      const elapsed = Date.now() - start;
      // Total should be at least ~80ms; give generous slack for CI noise.
      expect(elapsed).toBeGreaterThanOrEqual(60);
    } finally {
      setWordRevealMs(0);
    }
  });

  it('pause resolves after the given seconds', async () => {
    const engine = makeEngine();
    const start = Date.now();
    await runActions([{ type: 'pause', seconds: 0.05 }], { engine });
    const elapsed = Date.now() - start;
    // Generous slack — CI clocks are noisy. 40ms+ proves we actually waited.
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it('wait pushes a continue prompt and suspends until continueWait is called', async () => {
    const engine = makeEngine();
    const lengthBefore = engine.state.narration.length;

    let resolved = false;
    const promise = runActions([{ type: 'wait' }], { engine }).then(() => {
      resolved = true;
    });
    // Let the action run far enough to push the prompt entry.
    await new Promise((r) => setTimeout(r, 0));

    expect(engine.state.narration.length).toBe(lengthBefore + 1);
    expect(engine.state.narration[lengthBefore].text).toBe('Click to continue…');
    expect(engine.continueWaitId.value).not.toBeNull();
    expect(resolved).toBe(false);

    engine.continueWait();
    await promise;

    expect(resolved).toBe(true);
    expect(engine.state.narration.length).toBe(lengthBefore);
    expect(engine.continueWaitId.value).toBeNull();
  });
});
