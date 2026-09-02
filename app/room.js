/**
 * A room traced off one photograph.
 *
 * The measure page already turns a photograph into a plane with a known scale.
 * Clicking round the floor on that plane gives real coordinates in inches, and
 * a closed loop of them is a floor plan. Not a reconstruction: no stitching, no
 * point cloud, no camera poses. One photograph, one known size, and your own
 * eye picking out where the walls meet the floor.
 *
 * Everything here works in inches, in the same plane coordinates the homography
 * produces, with the outline's own bounding box normalised so the origin sits
 * at its top left corner.
 */

/** Twice the signed area. Positive is counter-clockwise in screen coordinates. */
function cross2(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s;
}

export function area(poly) {
  return poly.length < 3 ? 0 : Math.abs(cross2(poly)) / 2;
}

export function perimeter(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return s;
}

/** Always counter-clockwise, so extrusion and normals behave. */
export function normalise(poly) {
  const out = poly.map(p => ({ x: p.x, y: p.y }));
  return cross2(out) < 0 ? out.reverse() : out;
}

/** Shift so the outline's bounding box starts at the origin. */
export function originAtCorner(poly) {
  if (!poly.length) return { poly: [], width: 0, depth: 0 };
  const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  return {
    poly: poly.map(p => ({ x: p.x - minX, y: p.y - minY })),
    width: Math.max(...xs) - minX,
    depth: Math.max(...ys) - minY
  };
}

export function inside(poly, p) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

function segmentsCross(p1, p2, p3, p4) {
  const d = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/** The four corners of a rectangle placed at (x, y), rotated by `angle` degrees. */
export function footprint({ x, y, length, depth, angle }) {
  const t = (angle || 0) * Math.PI / 180;
  const c = Math.cos(t), s = Math.sin(t);
  const hl = length / 2, hd = depth / 2;
  return [
    { x: -hl, y: -hd }, { x: hl, y: -hd }, { x: hl, y: hd }, { x: -hl, y: hd }
  ].map(p => ({ x: x + p.x * c - p.y * s, y: y + p.x * s + p.y * c }));
}

/**
 * Is that rectangle wholly inside the room.
 *
 * Every corner in, and no edge crossing a wall. The second test matters for a
 * concave room, where all four corners can sit inside while the middle of the
 * object cuts straight through a projecting wall.
 */
export function fits(poly, rect) {
  if (poly.length < 3) return true;
  for (const c of rect) if (!inside(poly, c)) return false;
  for (let i = 0; i < rect.length; i++) {
    const a = rect[i], b = rect[(i + 1) % rect.length];
    for (let j = 0; j < poly.length; j++) {
      const p = poly[j], q = poly[(j + 1) % poly.length];
      if (segmentsCross(a, b, p, q)) return false;
    }
  }
  return true;
}

/** Shortest distance from a point to a segment. */
function toSegment(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

/**
 * The narrowest place in the room, wall to wall.
 *
 * Checked between every pair of walls that do not share a corner, which is what
 * decides whether something can be carried through rather than merely stood in
 * the room. Reported with the two walls it happens between so it can be drawn.
 */
export function narrowest(poly) {
  let best = { inches: Infinity, at: null };
  const n = poly.length;
  if (n < 4) return best;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const a1 = poly[i], a2 = poly[(i + 1) % n];
      const b1 = poly[j], b2 = poly[(j + 1) % n];
      const d = Math.min(
        toSegment(a1, b1, b2), toSegment(a2, b1, b2),
        toSegment(b1, a1, a2), toSegment(b2, a1, a2)
      );
      if (d < best.inches) {
        best = { inches: d, at: { a: a1, b: b1 } };
      }
    }
  }
  return best;
}

/** The longest straight line that stays inside, which is what a long object needs. */
export function longestInside(poly, step = 1) {
  let best = { inches: 0, from: null, to: null };
  for (let i = 0; i < poly.length; i++) {
    for (let j = i + 1; j < poly.length; j++) {
      const a = poly[i], b = poly[j];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d <= best.inches) continue;
      // Walk the line and reject it if any of it leaves the room.
      let ok = true;
      const n = Math.max(2, Math.ceil(d / Math.max(step, 1)));
      for (let k = 1; k < n; k++) {
        const t = k / n;
        if (!inside(poly, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) { ok = false; break; }
      }
      if (ok) best = { inches: d, from: a, to: b };
    }
  }
  return best;
}

/** A short, honest description of a traced room. */
export function describe(poly, ceiling) {
  const { width, depth } = originAtCorner(poly);
  return {
    corners: poly.length,
    width,
    depth,
    area: area(poly) / 144,          // square feet
    perimeter: perimeter(poly),
    narrowest: narrowest(poly).inches,
    longest: longestInside(poly).inches,
    ceiling: ceiling || 96
  };
}
