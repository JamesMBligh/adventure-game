import type { OverlayPlace, Point, Rect, SceneObject } from '../types';

/** Resolved hit region for a scene object. One of three kinds:
 *  - `rect` — axis-aligned box.
 *  - `path` — closed polygon, with both the vertices and their bounding box.
 *  - `ellipsis` — ellipse inscribed in a bounding rect (centre at
 *    `(rect.x + rect.w/2, rect.y + rect.h/2)`, semi-axes `rect.w/2` and
 *    `rect.h/2`). The SceneView branches on `kind` for both cursor
 *    hit-testing and component positioning. */
export type HitShape =
  | { kind: 'rect'; rect: Rect }
  | { kind: 'path'; points: Point[]; bbox: Rect }
  | { kind: 'ellipsis'; rect: Rect };

/**
 * Resolve the absolute display rect (in scene-viewport %s) for the rect-mode
 * display path. Returns null when display is absent OR uses `place` instead.
 *
 * `place`-mode display has no rectangular form (the image renders at natural
 * pixel dimensions, scaled), so it doesn't participate in rect-based fallback
 * logic. Authors who want a hit region on a place-mode display must specify
 * `hit` explicitly.
 */
export function effectiveDisplayRect(obj: SceneObject): Rect | null {
  if (!obj.display?.rect) return null;
  const r = obj.display.rect;
  return {
    x: obj.x + (r.x ?? 0),
    y: obj.y + (r.y ?? 0),
    w: r.w,
    h: r.h,
  };
}

/**
 * Resolve the absolute place (top / left / scale) for a place-mode display,
 * or null when display is absent or uses `rect` instead. The top / left are
 * offsets from the object's anchor; scale defaults to 100 (natural size).
 */
export function effectiveDisplayPlace(
  obj: SceneObject,
): { top: number; left: number; scale: number } | null {
  if (!obj.display?.place) return null;
  const p: OverlayPlace = obj.display.place;
  return {
    top: obj.y + p.top,
    left: obj.x + p.left,
    scale: p.scale ?? 100,
  };
}

/**
 * Resolve the absolute hit region (a `HitShape`), or null if the object has
 * no hit region. Falls back to the display rect when `hit` is omitted but a
 * rect-mode display is present — so authors don't have to specify both for
 * the common case where the visual itself is the clickable area. Place-mode
 * display does NOT contribute a fallback (no rectangular form).
 */
export function effectiveHit(obj: SceneObject): HitShape | null {
  if (obj.hit?.rect) {
    const r = obj.hit.rect;
    return {
      kind: 'rect',
      rect: {
        x: obj.x + (r.x ?? 0),
        y: obj.y + (r.y ?? 0),
        w: r.w,
        h: r.h,
      },
    };
  }
  if (obj.hit?.path && obj.hit.path.length >= 3) {
    const points = obj.hit.path.map((p) => ({ x: obj.x + p.x, y: obj.y + p.y }));
    return { kind: 'path', points, bbox: boundingBox(points) };
  }
  if (obj.hit?.ellipsis) {
    const r = obj.hit.ellipsis;
    return {
      kind: 'ellipsis',
      rect: {
        x: obj.x + (r.x ?? 0),
        y: obj.y + (r.y ?? 0),
        w: r.w,
        h: r.h,
      },
    };
  }
  // Fall back to display.rect when no hit block authored.
  const dr = effectiveDisplayRect(obj);
  if (dr) return { kind: 'rect', rect: dr };
  return null;
}

/**
 * Backwards-compatible convenience: the rect-mode hit rect (or bounding box
 * for path-mode). Some call sites only need a positioning rect and don't
 * care about the underlying shape.
 */
export function effectiveHitRect(obj: SceneObject): Rect | null {
  const shape = effectiveHit(obj);
  if (!shape) return null;
  if (shape.kind === 'rect') return shape.rect;
  if (shape.kind === 'path') return shape.bbox;
  return shape.rect; // ellipsis: the bounding rect of the ellipse
}

/** Compute the axis-aligned bounding box of a set of points. */
export function boundingBox(points: Point[]): Rect {
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Point-in-ellipse test for an ellipse inscribed in `rect`. The interior
 * (including the boundary) is `((px - cx)/rx)² + ((py - cy)/ry)² <= 1`,
 * where `(cx, cy)` is the rect centre and `(rx, ry)` are the semi-axes.
 * Returns `false` for degenerate rects (zero width or height).
 */
export function pointInEllipse(p: Point, rect: Rect): boolean {
  if (rect.w <= 0 || rect.h <= 0) return false;
  const rx = rect.w / 2;
  const ry = rect.h / 2;
  const cx = rect.x + rx;
  const cy = rect.y + ry;
  const dx = (p.x - cx) / rx;
  const dy = (p.y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

/**
 * Standard ray-casting point-in-polygon test. The polygon is treated as
 * closed (an implicit edge from the last vertex back to the first), matching
 * the on-the-wire convention for `SceneObjectHit.path`.
 */
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Polygon self-intersection (used by the validator)
// ---------------------------------------------------------------------------

function cross3(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegmentCollinear(p: Point, q: Point, r: Point): boolean {
  // q lies on segment pr, assuming the three are collinear (cross3 == 0).
  return (
    q.x <= Math.max(p.x, r.x) &&
    q.x >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) &&
    q.y >= Math.min(p.y, r.y)
  );
}

/** True iff segments (a1,a2) and (b1,b2) intersect, including endpoint
 *  touches and collinear overlaps. Used by the polygon-self-intersection
 *  check, which excludes adjacent edges that share an endpoint by design. */
export function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1 = cross3(b1, b2, a1);
  const d2 = cross3(b1, b2, a2);
  const d3 = cross3(a1, a2, b1);
  const d4 = cross3(a1, a2, b2);

  // General case — segments properly cross.
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }
  // Collinear / endpoint-touch cases.
  if (d1 === 0 && onSegmentCollinear(b1, a1, b2)) return true;
  if (d2 === 0 && onSegmentCollinear(b1, a2, b2)) return true;
  if (d3 === 0 && onSegmentCollinear(a1, b1, a2)) return true;
  if (d4 === 0 && onSegmentCollinear(a1, b2, a2)) return true;
  return false;
}

/**
 * True iff the closed polygon defined by `points` self-intersects. Adjacent
 * edges (those sharing a vertex, including the implicit closing edge and the
 * first edge) are excluded — they always "touch" by definition.
 *
 * Returns `false` for degenerate input (fewer than 3 points).
 */
export function polygonSelfIntersects(points: Point[]): boolean {
  const n = points.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Adjacent edges share an endpoint by construction.
      if (j === i + 1) continue;
      // Wrap-around adjacency: edge 0 and the closing edge share v[0].
      if (i === 0 && j === n - 1) continue;
      const b1 = points[j];
      const b2 = points[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}
