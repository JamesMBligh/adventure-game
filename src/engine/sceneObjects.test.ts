import { describe, it, expect } from 'vitest';
import {
  effectiveDisplayPlace,
  effectiveDisplayRect,
  effectiveHit,
  effectiveHitRect,
  pointInEllipse,
  pointInPolygon,
  polygonSelfIntersects,
  boundingBox,
} from './sceneObjects';
import type { SceneObject } from '../types';

function obj(partial: Partial<SceneObject>): SceneObject {
  return { id: 'o', x: 0, y: 0, ...partial };
}

describe('effectiveDisplayRect', () => {
  it('returns null when display is absent', () => {
    expect(effectiveDisplayRect(obj({}))).toBeNull();
  });

  it('adds anchor + rect offsets', () => {
    const o = obj({
      x: 10,
      y: 20,
      display: { rect: { x: 3, y: 4, w: 8, h: 5 } },
    });
    expect(effectiveDisplayRect(o)).toEqual({ x: 13, y: 24, w: 8, h: 5 });
  });

  it('treats omitted rect.x and rect.y as zero', () => {
    const o = obj({
      x: 10,
      y: 20,
      display: { rect: { w: 8, h: 5 } },
    });
    expect(effectiveDisplayRect(o)).toEqual({ x: 10, y: 20, w: 8, h: 5 });
  });

  it('returns null when display uses place (no rectangular form)', () => {
    const o = obj({
      x: 10,
      y: 20,
      display: { place: { top: 5, left: 5 }, image: 'foo.png' },
    });
    expect(effectiveDisplayRect(o)).toBeNull();
  });
});

describe('effectiveDisplayPlace', () => {
  it('returns null when display is absent', () => {
    expect(effectiveDisplayPlace(obj({}))).toBeNull();
  });

  it('returns null when display uses rect', () => {
    const o = obj({ x: 0, y: 0, display: { rect: { w: 10, h: 10 } } });
    expect(effectiveDisplayPlace(o)).toBeNull();
  });

  it('adds anchor offsets and defaults scale to 100', () => {
    const o = obj({
      x: 10,
      y: 20,
      display: { place: { top: 5, left: 8 }, image: 'foo.png' },
    });
    expect(effectiveDisplayPlace(o)).toEqual({ top: 25, left: 18, scale: 100 });
  });

  it('preserves an explicit scale', () => {
    const o = obj({
      x: 0,
      y: 0,
      display: { place: { top: 0, left: 0, scale: 60 }, image: 'foo.png' },
    });
    expect(effectiveDisplayPlace(o)).toEqual({ top: 0, left: 0, scale: 60 });
  });
});

describe('effectiveHitRect', () => {
  it('returns null when both display and hit are absent', () => {
    expect(effectiveHitRect(obj({}))).toBeNull();
  });

  it('falls back to display when hit is absent', () => {
    const o = obj({
      x: 10,
      y: 20,
      display: { rect: { w: 8, h: 5 } as never, color: 'red' },
    });
    expect(effectiveHitRect(o)).toEqual({ x: 10, y: 20, w: 8, h: 5 });
  });

  it('uses hit when both blocks are present (overrides display)', () => {
    const o = obj({
      x: 10,
      y: 20,
      display: { rect: { w: 30, h: 30 } as never },
      hit: { rect: { x: 5, y: 5, w: 8, h: 8 } },
    });
    expect(effectiveHitRect(o)).toEqual({ x: 15, y: 25, w: 8, h: 8 });
  });

  it('returns just-the-hit-rect when display is absent', () => {
    const o = obj({
      x: 10,
      y: 20,
      hit: { rect: { x: 1, y: 2, w: 4, h: 4 } },
    });
    expect(effectiveHitRect(o)).toEqual({ x: 11, y: 22, w: 4, h: 4 });
    expect(effectiveDisplayRect(o)).toBeNull();
  });

  it('place-mode display does NOT contribute a fallback hit rect', () => {
    const o = obj({
      x: 10,
      y: 20,
      display: { place: { top: 5, left: 5 }, image: 'foo.png' },
      // no hit block
    });
    expect(effectiveHitRect(o)).toBeNull();
  });
});

describe('effectiveHit (HitShape)', () => {
  it('returns rect-kind for rect-mode hit', () => {
    const o = obj({ x: 10, y: 20, hit: { rect: { w: 4, h: 4 } } });
    const shape = effectiveHit(o);
    expect(shape?.kind).toBe('rect');
    if (shape?.kind === 'rect') {
      expect(shape.rect).toEqual({ x: 10, y: 20, w: 4, h: 4 });
    }
  });

  it('returns path-kind for path-mode hit with anchor-resolved points + bbox', () => {
    const o = obj({
      x: 10,
      y: 20,
      hit: {
        path: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 5, y: 8 },
        ],
      },
    });
    const shape = effectiveHit(o);
    expect(shape?.kind).toBe('path');
    if (shape?.kind === 'path') {
      expect(shape.points).toEqual([
        { x: 10, y: 20 },
        { x: 20, y: 20 },
        { x: 15, y: 28 },
      ]);
      expect(shape.bbox).toEqual({ x: 10, y: 20, w: 10, h: 8 });
    }
  });

  it('falls back to rect-mode display when hit is absent', () => {
    const o = obj({ x: 0, y: 0, display: { rect: { w: 4, h: 4 } } });
    const shape = effectiveHit(o);
    expect(shape?.kind).toBe('rect');
  });

  it('returns ellipsis-kind for ellipsis-mode hit with anchor-resolved rect', () => {
    const o = obj({
      x: 10,
      y: 20,
      hit: { ellipsis: { x: 2, y: 3, w: 20, h: 10 } },
    });
    const shape = effectiveHit(o);
    expect(shape?.kind).toBe('ellipsis');
    if (shape?.kind === 'ellipsis') {
      expect(shape.rect).toEqual({ x: 12, y: 23, w: 20, h: 10 });
    }
  });

  it('returns null when path has fewer than 3 points', () => {
    const o = obj({
      x: 0,
      y: 0,
      hit: {
        path: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      },
    });
    expect(effectiveHit(o)).toBeNull();
  });
});

describe('boundingBox', () => {
  it('finds the min/max envelope of a set of points', () => {
    expect(
      boundingBox([
        { x: 1, y: 2 },
        { x: 5, y: 3 },
        { x: -1, y: 8 },
      ]),
    ).toEqual({ x: -1, y: 2, w: 6, h: 6 });
  });
});

describe('pointInPolygon', () => {
  const triangle = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 5, y: 10 },
  ];

  it('returns true for a point inside', () => {
    expect(pointInPolygon({ x: 5, y: 3 }, triangle)).toBe(true);
  });

  it('returns false for a point outside', () => {
    expect(pointInPolygon({ x: 0, y: 9 }, triangle)).toBe(false);
    expect(pointInPolygon({ x: -1, y: 0 }, triangle)).toBe(false);
    expect(pointInPolygon({ x: 11, y: 5 }, triangle)).toBe(false);
  });

  it('returns false for polygons with fewer than 3 points', () => {
    expect(pointInPolygon({ x: 1, y: 1 }, [{ x: 0, y: 0 }, { x: 10, y: 10 }])).toBe(false);
  });

  it('handles a concave polygon (C shape)', () => {
    const c = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 7 },
      { x: 10, y: 7 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon({ x: 1, y: 5 }, c)).toBe(true); // left bar
    expect(pointInPolygon({ x: 5, y: 5 }, c)).toBe(false); // cavity
  });
});

describe('pointInEllipse', () => {
  // Circle of radius 5 centred at (5, 5), inscribed in {x:0, y:0, w:10, h:10}.
  const circle = { x: 0, y: 0, w: 10, h: 10 };

  it('returns true for the centre', () => {
    expect(pointInEllipse({ x: 5, y: 5 }, circle)).toBe(true);
  });

  it('returns true for a point just inside the boundary', () => {
    expect(pointInEllipse({ x: 8, y: 5 }, circle)).toBe(true);
  });

  it('returns false for a point in a corner of the bounding box', () => {
    // (0, 0) is the bounding corner — outside the inscribed circle.
    expect(pointInEllipse({ x: 0, y: 0 }, circle)).toBe(false);
    expect(pointInEllipse({ x: 10, y: 10 }, circle)).toBe(false);
  });

  it('handles a non-square (true ellipse) rect', () => {
    // Ellipse rx=10, ry=2 centred at (10, 12).
    const ell = { x: 0, y: 10, w: 20, h: 4 };
    expect(pointInEllipse({ x: 10, y: 12 }, ell)).toBe(true); // centre
    expect(pointInEllipse({ x: 19, y: 12 }, ell)).toBe(true); // along major axis
    expect(pointInEllipse({ x: 10, y: 11 }, ell)).toBe(true); // along minor axis (inside)
    expect(pointInEllipse({ x: 10, y: 15 }, ell)).toBe(false); // beyond minor axis
  });

  it('returns false for degenerate (zero-area) rects', () => {
    expect(pointInEllipse({ x: 0, y: 0 }, { x: 0, y: 0, w: 0, h: 5 })).toBe(false);
    expect(pointInEllipse({ x: 0, y: 0 }, { x: 0, y: 0, w: 5, h: 0 })).toBe(false);
  });
});

describe('polygonSelfIntersects', () => {
  it('returns false for a simple triangle', () => {
    expect(
      polygonSelfIntersects([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ]),
    ).toBe(false);
  });

  it('returns false for a simple convex polygon', () => {
    expect(
      polygonSelfIntersects([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]),
    ).toBe(false);
  });

  it('returns true for a bowtie (figure-eight)', () => {
    // Classic self-intersecting quadrilateral.
    expect(
      polygonSelfIntersects([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      ]),
    ).toBe(true);
  });

  it('returns true when the closing edge crosses an earlier edge', () => {
    // Pentagon-like path where the last → first vertex line slashes through
    // the interior, crossing an earlier edge.
    expect(
      polygonSelfIntersects([
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 0, y: 10 },
        { x: 8, y: 8 },
        { x: 8, y: 2 },
      ]),
    ).toBe(true);
  });

  it('returns false for fewer than 3 points (degenerate)', () => {
    expect(polygonSelfIntersects([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
  });
});
