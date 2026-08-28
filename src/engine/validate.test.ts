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
              x: 10,
              y: 10,
              display: { rect: { w: 5, h: 5 } as never },
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
          objects: [{ id: 'x', x: 0, y: 0, visibleIf: { type: 'mystery' } }],
        },
      },
    };
    const errors = validateAdventure(adventure);
    expect(errors.some((e) => e.message.includes('mystery'))).toBe(true);
  });

  describe('scene object x/y + display/hit blocks', () => {
    it('accepts the new shape', () => {
      const adventure: Adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              {
                id: 'door',
                name: 'Door',
                x: 42,
                y: 30,
                display: { rect: { x: 0, y: 0, w: 16, h: 50 }, image: 'door.svg' },
                hit: { rect: { x: 4, y: 10, w: 8, h: 30 } },
              },
            ],
          },
        },
      };
      expect(validateAdventure(adventure)).toEqual([]);
    });

    it('accepts hit-only (pure clickable region, no visual)', () => {
      const adventure: Adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              { id: 'spot', x: 50, y: 50, hit: { rect: { w: 10, h: 10 } } },
            ],
          },
        },
      };
      expect(validateAdventure(adventure)).toEqual([]);
    });

    it('rejects legacy rect / color / image at the object level', () => {
      const adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              {
                id: 'old',
                x: 0,
                y: 0,
                rect: { x: 0, y: 0, w: 10, h: 10 },
                color: 'red',
                image: 'foo.png',
              },
            ],
          },
        },
      } as unknown as Adventure;
      const errors = validateAdventure(adventure);
      const paths = errors.map((e) => e.path);
      expect(paths).toEqual(
        expect.arrayContaining([
          'scenes.a.objects[old].rect',
          'scenes.a.objects[old].color',
          'scenes.a.objects[old].image',
        ]),
      );
    });

    it('rejects an obj.display whose rect is missing w / h', () => {
      const adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              { id: 'd', x: 0, y: 0, display: { rect: { x: 0, y: 0 } } },
            ],
          },
        },
      } as unknown as Adventure;
      const errors = validateAdventure(adventure);
      const paths = errors.map((e) => e.path);
      expect(paths).toEqual(
        expect.arrayContaining([
          'scenes.a.objects[d].display.rect.w',
          'scenes.a.objects[d].display.rect.h',
        ]),
      );
    });

    it('accepts a place-mode display', () => {
      const adventure: Adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              {
                id: 'sprite',
                x: 20,
                y: 30,
                display: {
                  place: { top: 5, left: 5, scale: 75 },
                  image: 'sprite.png',
                },
              },
            ],
          },
        },
      };
      expect(validateAdventure(adventure)).toEqual([]);
    });

    it('rejects a display that specifies both rect and place', () => {
      const adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              {
                id: 'both',
                x: 0,
                y: 0,
                display: {
                  rect: { w: 10, h: 10 },
                  place: { top: 0, left: 0 },
                },
              },
            ],
          },
        },
      } as unknown as Adventure;
      const errors = validateAdventure(adventure);
      expect(errors.some((e) => e.message.includes('both "rect" and "place"'))).toBe(true);
    });

    it('rejects a display with neither rect nor place', () => {
      const adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              { id: 'neither', x: 0, y: 0, display: { color: 'red' } },
            ],
          },
        },
      } as unknown as Adventure;
      const errors = validateAdventure(adventure);
      expect(errors.some((e) => e.message.includes('either "rect" or "place"'))).toBe(true);
    });

    it('rejects a place-mode display without an image', () => {
      const adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              {
                id: 'sprite',
                x: 20,
                y: 30,
                display: { place: { top: 5, left: 5, scale: 50 } },
              },
            ],
          },
        },
      } as unknown as Adventure;
      const errors = validateAdventure(adventure);
      expect(errors.some((e) => e.path === 'scenes.a.objects[sprite].display.image')).toBe(true);
    });

    it('accepts a hit block with a closed polygon path of three points', () => {
      const adventure: Adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              {
                id: 'tri',
                x: 0,
                y: 0,
                hit: {
                  path: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                    { x: 5, y: 10 },
                  ],
                },
              },
            ],
          },
        },
      };
      expect(validateAdventure(adventure)).toEqual([]);
    });

    it('rejects a hit block that specifies both rect and path', () => {
      const adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              {
                id: 'both',
                x: 0,
                y: 0,
                hit: {
                  rect: { w: 10, h: 10 },
                  path: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                    { x: 5, y: 10 },
                  ],
                },
              },
            ],
          },
        },
      } as unknown as Adventure;
      const errors = validateAdventure(adventure);
      expect(
        errors.some((e) => e.message.includes('exactly one of "rect", "path", or "ellipsis"')),
      ).toBe(true);
    });

    it('rejects a hit path with fewer than three points', () => {
      const adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              {
                id: 'thin',
                x: 0,
                y: 0,
                hit: { path: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
              },
            ],
          },
        },
      } as unknown as Adventure;
      const errors = validateAdventure(adventure);
      expect(errors.some((e) => e.message.includes('at least 3 points'))).toBe(true);
    });

    it('accepts a hit block with an ellipsis bounding rect', () => {
      const adventure: Adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              {
                id: 'puddle',
                x: 20,
                y: 60,
                hit: { ellipsis: { w: 16, h: 8 } },
              },
            ],
          },
        },
      };
      expect(validateAdventure(adventure)).toEqual([]);
    });

    it('rejects a hit block that mixes rect and ellipsis', () => {
      const adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              {
                id: 'both',
                x: 0,
                y: 0,
                hit: {
                  rect: { w: 10, h: 10 },
                  ellipsis: { w: 10, h: 10 },
                },
              },
            ],
          },
        },
      } as unknown as Adventure;
      const errors = validateAdventure(adventure);
      expect(
        errors.some((e) => e.message.includes('exactly one of "rect", "path", or "ellipsis"')),
      ).toBe(true);
    });

    it('rejects an ellipsis missing w / h', () => {
      const adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              { id: 'oops', x: 0, y: 0, hit: { ellipsis: { x: 0, y: 0 } } },
            ],
          },
        },
      } as unknown as Adventure;
      const errors = validateAdventure(adventure);
      const paths = errors.map((e) => e.path);
      expect(paths).toEqual(
        expect.arrayContaining([
          'scenes.a.objects[oops].hit.ellipsis.w',
          'scenes.a.objects[oops].hit.ellipsis.h',
        ]),
      );
    });

    it('rejects a self-intersecting hit path (bowtie)', () => {
      const adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              {
                id: 'bowtie',
                x: 0,
                y: 0,
                hit: {
                  path: [
                    { x: 0, y: 0 },
                    { x: 10, y: 10 },
                    { x: 10, y: 0 },
                    { x: 0, y: 10 },
                  ],
                },
              },
            ],
          },
        },
      } as unknown as Adventure;
      const errors = validateAdventure(adventure);
      expect(errors.some((e) => e.message.includes('self-intersects'))).toBe(true);
    });

    it('rejects a path where only the implicit closing edge causes self-intersection', () => {
      // Last vertex → first vertex line crosses an earlier edge.
      const adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              {
                id: 'closer',
                x: 0,
                y: 0,
                hit: {
                  path: [
                    { x: 0, y: 0 },
                    { x: 10, y: 5 },
                    { x: 0, y: 10 },
                    { x: 8, y: 8 },
                    { x: 8, y: 2 },
                  ],
                },
              },
            ],
          },
        },
      } as unknown as Adventure;
      const errors = validateAdventure(adventure);
      expect(errors.some((e) => e.message.includes('self-intersects'))).toBe(true);
    });

    it('accepts a hit block with highlight: true', () => {
      const adventure: Adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              {
                id: 'path',
                x: 75,
                y: 60,
                hit: { rect: { w: 22, h: 35 }, highlight: true },
              },
            ],
          },
        },
      };
      expect(validateAdventure(adventure)).toEqual([]);
    });

    it('rejects a non-boolean hit.highlight', () => {
      const adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              {
                id: 'bad',
                x: 0,
                y: 0,
                hit: { rect: { w: 5, h: 5 }, highlight: 'yes' },
              },
            ],
          },
        },
      } as unknown as Adventure;
      const errors = validateAdventure(adventure);
      expect(errors.some((e) => e.path === 'scenes.a.objects[bad].hit.highlight')).toBe(true);
    });

    it('requires numeric x and y at the object level', () => {
      const adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              { id: 'oops', display: { rect: { w: 5, h: 5 } } },
            ],
          },
        },
      } as unknown as Adventure;
      const errors = validateAdventure(adventure);
      const paths = errors.map((e) => e.path);
      expect(paths).toEqual(
        expect.arrayContaining([
          'scenes.a.objects[oops].x',
          'scenes.a.objects[oops].y',
        ]),
      );
    });
  });

  describe('scene object menu', () => {
    it('walks each menu item\'s visibleIf and actions', () => {
      const adventure: Adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              {
                id: 'door',
                name: 'Door',
                x: 0,
                y: 0,
                menu: [
                  {
                    label: 'Open it',
                    actions: [{ type: 'goto', scene: 'b' }],
                  },
                ],
              },
            ],
          },
          b: { name: 'B' },
        },
      };
      expect(validateAdventure(adventure)).toEqual([]);
    });

    it('flags unknown action types nested inside a menu item', () => {
      const adventure: Adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              {
                id: 'door',
                x: 0,
                y: 0,
                menu: [{ label: 'Try it', actions: [{ type: 'mystery' }] }],
              },
            ],
          },
        },
      };
      const errors = validateAdventure(adventure);
      expect(errors.some((e) => e.message.includes('mystery'))).toBe(true);
    });

    it('flags missing label and non-array actions', () => {
      const adventure: Adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              {
                id: 'door',
                x: 0,
                y: 0,
                // @ts-expect-error: testing the validator's runtime checks
                menu: [{ actions: 'not an array' }],
              },
            ],
          },
        },
      };
      const errors = validateAdventure(adventure);
      const paths = errors.map((e) => e.path);
      expect(paths.some((p) => p.endsWith('.menu[0].label'))).toBe(true);
      expect(paths.some((p) => p.endsWith('.menu[0].actions'))).toBe(true);
    });

    it('walks visibleIf on menu items', () => {
      const adventure: Adventure = {
        title: 't',
        startScene: 'a',
        scenes: {
          a: {
            objects: [
              {
                id: 'door',
                x: 0,
                y: 0,
                menu: [
                  {
                    label: 'Open it',
                    visibleIf: { type: 'mystery' },
                    actions: [],
                  },
                ],
              },
            ],
          },
        },
      };
      const errors = validateAdventure(adventure);
      expect(errors.some((e) => e.message.includes('mystery'))).toBe(true);
    });
  });

  describe('inline interaction dialog id', () => {
    function siteFixture() {
      return {
        sites: {
          fs: {
            name: 'F',
            locations: { door: { name: 'Door', x: 0, y: 0 } },
          },
        },
      } satisfies Pick<Adventure, 'sites'>;
    }

    it('accepts an inline dialog without an id', () => {
      const adventure: Adventure = {
        title: 't',
        startSite: 'fs',
        ...siteFixture(),
        interactions: [
          {
            id: 'study',
            location: 'door',
            dialog: {
              start: 'open',
              nodes: { open: { text: 'hi', nochoice: {} } },
            },
          },
        ],
      };
      const errors = validateAdventure(adventure);
      expect(errors).toEqual([]);
    });

    it('accepts an inline dialog with an explicit string id', () => {
      const adventure: Adventure = {
        title: 't',
        startSite: 'fs',
        ...siteFixture(),
        interactions: [
          {
            id: 'study',
            location: 'door',
            dialog: {
              id: 'studyOpen',
              start: 'open',
              nodes: { open: { text: 'hi', nochoice: {} } },
            },
          },
        ],
      };
      expect(validateAdventure(adventure)).toEqual([]);
    });

    it('rejects an explicit empty-string id', () => {
      const adventure: Adventure = {
        title: 't',
        startSite: 'fs',
        ...siteFixture(),
        interactions: [
          {
            id: 'study',
            location: 'door',
            dialog: {
              id: '',
              start: 'open',
              nodes: { open: { text: 'hi', nochoice: {} } },
            },
          },
        ],
      };
      const errors = validateAdventure(adventure);
      expect(errors.some((e) => e.path === 'interactions[0].dialog.id')).toBe(true);
    });

    it('rejects a non-string id', () => {
      const adventure: Adventure = {
        title: 't',
        startSite: 'fs',
        ...siteFixture(),
        interactions: [
          {
            id: 'study',
            location: 'door',
            dialog: {
              id: 123 as unknown as string,
              start: 'open',
              nodes: { open: { text: 'hi', nochoice: {} } },
            },
          },
        ],
      };
      const errors = validateAdventure(adventure);
      expect(errors.some((e) => e.path === 'interactions[0].dialog.id')).toBe(true);
    });
  });
});
