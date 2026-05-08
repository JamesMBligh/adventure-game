import { describe, it, expect, beforeAll } from 'vitest';
import { ensureBuiltInsRegistered, validateAdventure } from './index';
import type { Adventure } from '../types';

beforeAll(() => {
  ensureBuiltInsRegistered();
});

describe('validateAdventure', () => {
  it('returns no errors for a well-formed adventure', () => {
    const adventure: Adventure = {
      title: 't',
      startScene: 'a',
      scenes: {
        a: {
          name: 'A',
          onEnter: [{ type: 'narrate', text: 'hi' }],
          objects: [
            {
              id: 'rock',
              triggers: {
                onClick: [
                  {
                    type: 'if',
                    condition: { type: 'hasItem', item: 'key' },
                    then: [{ type: 'goto', scene: 'b' }],
                  },
                ],
              },
            },
          ],
        },
        b: { name: 'B' },
      },
    };
    expect(validateAdventure(adventure)).toEqual([]);
  });

  it('flags missing startScene', () => {
    const adventure: Adventure = { title: 't', startScene: 'missing', scenes: {} };
    const errors = validateAdventure(adventure);
    expect(errors.some((e) => e.path === 'startScene')).toBe(true);
  });

  it('flags unknown action types nested inside if/sequence', () => {
    const adventure: Adventure = {
      title: 't',
      startScene: 'a',
      scenes: {
        a: {
          onEnter: [
            {
              type: 'sequence',
              actions: [
                {
                  type: 'if',
                  condition: { type: 'flag', flag: 'x' },
                  then: [{ type: 'mystery' }],
                },
              ],
            },
          ],
        },
      },
    };
    const errors = validateAdventure(adventure);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('mystery');
  });

  it('flags missing required fields', () => {
    const adventure: Adventure = {
      title: 't',
      startScene: 'a',
      scenes: {
        a: { onEnter: [{ type: 'goto' }] },
      },
    };
    const errors = validateAdventure(adventure);
    expect(errors.some((e) => e.message.includes('"scene"'))).toBe(true);
  });

  it('flags unknown condition types', () => {
    const adventure: Adventure = {
      title: 't',
      startScene: 'a',
      scenes: {
        a: {
          objects: [{ id: 'x', visibleIf: { type: 'mystery' } }],
        },
      },
    };
    const errors = validateAdventure(adventure);
    expect(errors[0].message).toContain('mystery');
  });
});
