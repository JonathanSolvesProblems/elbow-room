/**
 * The stairwell in three dimensions.
 *
 * The plan view answers "does it get round the corner" and hides the fact that
 * the floor is climbing. The section view answers "can you tilt it" and hides
 * the corner. Holding both in your head at once is work the drawing should be
 * doing, which is why the plan alone reads as confusing: a water heater goes up
 * standing on end, and a flat overhead rectangle cannot show that.
 *
 * So this draws the shaft as a solid: treads rising, winders fanning through the
 * turn, the soffit that caps it, and the object sitting in that volume at the
 * orientation and tilt the solver actually chose.
 *
 * Nothing here decides anything. Every number is handed in from geometry.js, so
 * the picture cannot disagree with the verdict.
 *
 * Projection is true isometric, 30 degrees:
 *   sx = (x - y)·cos30
 *   sy = (x + y)·sin30 - z
 */

import { ft } from './units.js';

const DEG = Math.PI / 180;
const C30 = Math.cos(30 * DEG);
const S30 = Math.sin(30 * DEG);

let cv, ctx, scale = 2.4, ox = 0, oy = 0;

let M = {
  a: 41.5, b: 41.5, headroom: 80,
  rise: 7.5, going: 9.5, treads: 9, winders: 3,
  object: { length: 91, width: 36, height: 48, shape: 'sofa' },
  tilt: 0, upright: false, blocked: true,
  // Where the plan view has it. The two must show the same state or they are
  // two drawings of two different things.
  pos: { x: 100, y: 20 }, yaw: 0
};

export function attach(canvas) {
  cv = canvas;
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', () => { resize(); draw(); });
  draw();
}

export function set(next) {
  M = { ...M, ...next, object: { ...M.object, ...(next.object || {}) } };
  resize();
  draw();
}

/* ------------------------------------------------------------------ *
 * Projection
 * ------------------------------------------------------------------ */

const P = (x, y, z) => ({ X: (x - y) * C30, Y: (x + y) * S30 - z });
const sx = p => ox + p.X * scale;
const sy = p => oy + p.Y * scale;
const at = (x, y, z) => { const p = P(x, y, z); return [sx(p), sy(p)]; };

function resize() {
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  cv.width = Math.max(1, r.width * dpr);
  cv.height = Math.max(1, r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const run = M.treads * M.going;
  const ext = Math.max(M.a, M.b) + run;
  const rise = M.treads * M.rise + M.headroom;

  const xs = [], ys = [];
  for (const [x, y, z] of [[0,0,0],[ext,0,0],[ext,M.a,0],[0,ext,0],[M.b,ext,0],[0,0,rise],[ext,0,rise],[0,ext,rise]]) {
    const p = P(x, y, z); xs.push(p.X); ys.push(p.Y);
  }
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  scale = Math.min(r.width / (w * 1.12), r.height / (h * 1.12));
  ox = r.width / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * scale;
  oy = r.height / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * scale;
}

function css(n, fb) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return v || fb;
}

function poly(pts, fill, stroke, width = 1) {
  ctx.beginPath();
  ctx.moveTo(...at(...pts[0]));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(...at(...pts[i]));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

/* ------------------------------------------------------------------ *
 * The shaft
 * ------------------------------------------------------------------ */

/** Where the treads sit. Lower arm runs in along x, winders turn, upper arm runs out along y. */
function treadList() {
  const { a, b, going, rise, treads, winders } = M;
  const straight = Math.max(1, treads - winders);
  const out = [];
  let h = 0;

  // Lower arm, climbing toward the turn.
  for (let i = 0; i < straight; i++) {
    const x0 = b + (straight - i) * going, x1 = x0 - going;
    out.push({ kind: 'run', pts: [[x1, 0, h], [x0, 0, h], [x0, a, h], [x1, a, h]], h });
    h += rise;
  }
  // Winders: pie treads fanning from the inner corner (b, a) out to the two
  // outer walls, each ray clipped where it leaves the turn square. Three of
  // them share the 90 degrees, which is what the photographs show.
  const edge = (deg) => {
    const t = deg * DEG, cx = Math.cos(t), cy = Math.sin(t);
    const hits = [];
    if (cx < -1e-6) hits.push(b / -cx);          // meets x = 0
    if (cy < -1e-6) hits.push(a / -cy);          // meets y = 0
    const k = Math.min(...hits);
    return [b + cx * k, a + cy * k];
  };
  for (let i = 0; i < winders; i++) {
    const d0 = 180 + (i / winders) * 90;
    const d1 = 180 + ((i + 1) / winders) * 90;
    const p0 = edge(d0), p1 = edge(d1);
    out.push({ kind: 'winder', h, pts: [[b, a, h], [p0[0], p0[1], h], [p1[0], p1[1], h]] });
    h += rise;
  }
  // Upper arm, climbing away.
  for (let i = 0; i < straight; i++) {
    const y0 = a + i * going, y1 = y0 + going;
    out.push({ kind: 'run', pts: [[0, y0, h], [b, y0, h], [b, y1, h], [0, y1, h]], h });
    h += rise;
  }
  return out;
}

export function draw() {
  if (!ctx) return;
  const r = cv.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);

  const { a, b, headroom } = M;
  const wall = css('--wall', '#3a352c');
  const floor = css('--floor', '#efeae1');
  const mut = css('--mut', '#6b665e');
  const pinch = css('--pinch', '#a3341f');
  const ok = css('--ok', '#1c6b3f');

  const treads = treadList();

  // Treads, far to near so the near ones overlap correctly.
  treads.forEach((t, i) => {
    const shade = 0.55 + 0.4 * (i / treads.length);
    ctx.globalAlpha = shade;
    poly(t.pts, floor, wall, 1);
    ctx.globalAlpha = 1;
  });

  // The two outer walls, drawn as translucent planes so the shaft reads as a volume.
  const top = treads.length * M.rise + headroom;
  ctx.globalAlpha = 0.12;
  poly([[b + M.treads * M.going, 0, 0], [0, 0, 0], [0, 0, top], [b + M.treads * M.going, 0, top]], wall, null);
  poly([[0, 0, 0], [0, a + M.treads * M.going, 0], [0, a + M.treads * M.going, top], [0, 0, top]], wall, null);
  ctx.globalAlpha = 1;

  // The soffit over the turn: the ceiling that stops you tilting.
  const hTurn = (Math.max(1, M.treads - M.winders)) * M.rise;
  const zs = hTurn + headroom;
  ctx.globalAlpha = 0.5;
  poly([[b, 0, zs], [0, 0, zs], [0, a, zs], [b, a, zs]], pinch, pinch, 1);
  ctx.globalAlpha = 1;
  ctx.fillStyle = mut;
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  const lab = at(b * 0.5, a * 0.5, zs + 4);
  ctx.textAlign = 'center';
  ctx.fillText('soffit · ' + ft(headroom) + ' headroom', lab[0], lab[1]);

  // The object, in the volume, at the tilt the solver chose.
  drawObject(hTurn, M.blocked ? pinch : ok);

  // Inner corner marker: the thing that stops everything.
  const c = at(b, a, hTurn);
  ctx.beginPath();
  ctx.arc(c[0], c[1], 4, 0, Math.PI * 2);
  ctx.fillStyle = pinch;
  ctx.fill();
  ctx.textAlign = 'left';
}

/** Height of the tread under a point, matching treadList(). */
function floorAt(x, y) {
  const straight = Math.max(1, M.treads - M.winders);
  if (y > M.a) {
    const i = Math.min(straight - 1, Math.max(0, Math.floor((y - M.a) / M.going)));
    return (straight + M.winders + i) * M.rise;
  }
  if (x > M.b) {
    const i = Math.min(straight - 1, Math.max(0, Math.floor((x - M.b) / M.going)));
    return (straight - 1 - i) * M.rise;
  }
  return straight * M.rise;   // on the winders
}

/** The object as a solid, tilted along its long axis by the solver's angle. */
function drawObject(baseZ, colour) {
  const { length: L, width: W, height: H } = M.object;
  const tilt = (M.upright ? 90 : M.tilt) * DEG;
  const yaw = M.yaw * DEG;

  // Follow the plan view exactly, and rest on whatever tread is underneath.
  const cx = M.pos.x, cy = M.pos.y;
  const floorHere = floorAt(cx, cy);
  const halfV = (Math.abs(L * Math.sin(tilt)) + Math.abs(H * Math.cos(tilt))) / 2;
  const cz = floorHere + halfV + 0.5;

  const pts = [];
  for (const dx of [-L / 2, L / 2])
    for (const dy of [-W / 2, W / 2])
      for (const dz of [-H / 2, H / 2]) {
        const qx = dx * Math.cos(tilt) - dz * Math.sin(tilt);
        const qz = dx * Math.sin(tilt) + dz * Math.cos(tilt);
        pts.push([
          cx + qx * Math.cos(yaw) - dy * Math.sin(yaw),
          cy + qx * Math.sin(yaw) + dy * Math.cos(yaw),
          cz + qz
        ]);
      }

  // 000 001 010 011 100 101 110 111  ->  faces of the box
  const F = [[0,1,3,2],[4,5,7,6],[0,1,5,4],[2,3,7,6],[0,2,6,4],[1,3,7,5]];
  const fill = colour + '33';
  // Painter's order: back faces first, judged by projected depth.
  const order = F.map((f, i) => ({ f, d: f.reduce((s, k) => s + pts[k][0] + pts[k][1] - pts[k][2] * 0.6, 0) / 4 }))
                 .sort((p, q) => p.d - q.d);
  for (const { f } of order) poly(f.map(k => pts[k]), fill, colour, 1.4);

  const lp = at(cx, cy, cz + H * 0.6);
  ctx.fillStyle = colour;
  ctx.font = '11.5px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    (M.upright ? 'upright' : M.tilt > 3 ? 'tilted ' + M.tilt.toFixed(0) + '°' : 'flat'),
    lp[0], lp[1]
  );
}
