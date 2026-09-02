/**
 * The room geometry, against numbers worked out on paper first.
 *
 * Every expected value here was computed by hand before the code was run, so a
 * passing line means the code agrees with the arithmetic rather than with
 * itself. Run with: node eval/room_geometry.mjs
 */

import * as R from '../app/room.js';

let pass = 0, fail = 0;

function ck(name, got, want, tol = 1e-6) {
  const ok = Math.abs(Number(got) - Number(want)) <= tol;
  ok ? pass++ : fail++;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(46) +
              Number(got).toFixed(3) + ' vs ' + want);
}

/**
 * An L-shaped room in inches. A 140 by 96 rectangle with a 44 by 72 bite taken
 * out of the bottom right, so a concave outline with a real pinch in it.
 *
 * By hand: shoelace sum 40704, so 20352 square inches, so 141.333 square feet.
 * Perimeter 140 + 96 + 44 + 72 + 96 + 168 = 616 inches.
 */
const L = [
  { x: 0, y: 0 }, { x: 140, y: 0 }, { x: 140, y: 96 },
  { x: 96, y: 96 }, { x: 96, y: 168 }, { x: 0, y: 168 }
];

ck('shoelace area, sq ft', R.area(L) / 144, 141.333, 1e-3);
ck('perimeter, inches', R.perimeter(L), 616);
ck('widest across', R.describe(L, 96).width, 140);
ck('deepest', R.describe(L, 96).depth, 168);

// The narrowest wall-to-wall gap is the leg of the L: 140 minus 96.
ck('narrowest gap is the leg of the L', R.describe(L, 96).narrowest, 44);

// The longest line that stays inside runs corner to opposite corner, and the
// bite does not touch it: hypot(140, 168) = 218.687.
ck('longest straight run inside', R.longestInside(L).inches, Math.hypot(140, 168), 1e-3);

// A corner behind furniture. One wall along y = 0, another along x = 140.
// They meet at (140, 0) whether or not the sofa is in the way.
const hidden = R.intersect({ x: 0, y: 0 }, { x: 100, y: 0 },
                           { x: 140, y: -50 }, { x: 140, y: 50 });
ck('hidden corner lands on the wall lines, x', hidden.x, 140);
ck('hidden corner lands on the wall lines, y', hidden.y, 0);

ck('a point in the room is inside', R.inside(L, { x: 10, y: 10 }) ? 1 : 0, 1);
ck('a point in the bite is outside', R.inside(L, { x: 130, y: 150 }) ? 1 : 0, 0);

// A 7 foot sofa standing in the wide half, centred at (70, 20): it spans
// x 28 to 112 and y 2 to 38, all of which is floor.
ck('a 7ft sofa stands in it',
   R.fits(L, R.footprint({ x: 70, y: 20, length: 84, depth: 36, angle: 0 })) ? 1 : 0, 1);
// A 20 foot one is longer than the room is wide, at any angle.
ck('a 20ft one does not',
   R.fits(L, R.footprint({ x: 70, y: 20, length: 240, depth: 36, angle: 0 })) ? 1 : 0, 0);
// And one whose corners are all inside while its middle cuts the projecting
// wall: centred on the bite, spanning both legs.
ck('nothing cuts through a projecting wall',
   R.fits(L, R.footprint({ x: 96, y: 96, length: 120, depth: 120, angle: 45 })) ? 1 : 0, 0);

/**
 * Squaring up. A quad clicked slightly off true: by hand its shoelace sum is
 * 15624, so 7812 square inches, so 54.25 square feet. Snapping the walls onto
 * right angles must keep the area, not invent one.
 */
const wonky = [{ x: 0, y: 0 }, { x: 101, y: 3 }, { x: 99, y: 81 }, { x: 1, y: 79 }];
const sq = R.squareUp(wonky);
// Three, not four. The longest wall defines the grid everything else is pulled
// onto, so it is the one wall that never turns.
ck('squareUp turned the three off walls', sq.snapped, 3);
ck('and kept the area it was given', R.area(sq.poly) / 144, R.area(wonky) / 144, 0.1);
ck('and moved the worst corner less than 3 in', sq.moved < 3 ? 1 : 0, 1);

// Four exact right angles afterwards, which is the whole point of doing it.
const angles = sq.poly.map((p, i) => {
  const a = sq.poly[(i + sq.poly.length - 1) % sq.poly.length], b = sq.poly[(i + 1) % sq.poly.length];
  const u = Math.atan2(a.y - p.y, a.x - p.x), v = Math.atan2(b.y - p.y, b.x - p.x);
  return Math.abs(((u - v) * 180 / Math.PI + 360) % 180);
});
ck('four right angles afterwards',
   angles.filter(a => Math.abs(a - 90) < 0.01).length, 4);

// A shape too far off square is left alone rather than mangled into one.
const skew = [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 200, y: 90 }, { x: 60, y: 90 }];
ck('a deliberately skewed room is left as traced', R.squareUp(skew).snapped, 0);

console.log(`\n  ${pass} of ${pass + fail} geometry checks passed`);
process.exit(fail ? 1 : 0);
