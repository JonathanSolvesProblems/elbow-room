/**
 * Plan view of the turn, and the thing you are trying to get round it.
 *
 * This is a canvas, deliberately. The point of the project is that a browser
 * agent cannot drive a spatial editor by clicking pixels or reading the DOM,
 * because there is nothing here to read: no elements, no labels, no handles in
 * the accessibility tree. A person drags the sofa. An agent calls a tool. Both
 * end up mutating the same `state` object below and seeing the same result.
 *
 * Geometry of the L, matching geometry.js:
 *   horizontal arm  { 0 <= y <= a,  x >= 0 }
 *   vertical arm    { 0 <= x <= b,  y >= 0 }
 *   outer corner    (0, 0)
 *   reflex corner   (b, a)   <- the one that stops everything
 */

import { cornerMaxLength } from './geometry.js';

const DEG = Math.PI / 180;

export const state = {
  a: 41.5,            // horizontal arm clear width, inches
  b: 41.5,            // vertical arm clear width, inches
  object: { length: 84, depth: 38, label: '3-seat sofa' },
  pos: { x: 60, y: 20 },   // centre of the object, inches
  angle: 0,                 // degrees, 0 = long axis along +x
  dragging: false,
  listeners: []
};

export function onChange(fn) { state.listeners.push(fn); }
function emit() { for (const fn of state.listeners) fn(state); }

/** Mutate and redraw. Every tool and every drag funnels through here. */
export function update(patch) {
  Object.assign(state, patch);
  emit();
  draw();
}

/* ------------------------------------------------------------------ *
 * Collision
 * ------------------------------------------------------------------ */

function inL(x, y, a, b) {
  if (x < 0 || y < 0) return false;
  return y <= a || x <= b;
}

/** The four corners of the object in plan, in inches. */
export function corners(s = state) {
  const { length: L, depth: D } = s.object;
  const t = s.angle * DEG, c = Math.cos(t), sn = Math.sin(t);
  const hx = L / 2, hy = D / 2;
  return [[+hx, +hy], [-hx, +hy], [-hx, -hy], [+hx, -hy]].map(([px, py]) => ({
    x: s.pos.x + px * c - py * sn,
    y: s.pos.y + px * sn + py * c
  }));
}

function pointInRect(px, py, s) {
  const t = -s.angle * DEG, c = Math.cos(t), sn = Math.sin(t);
  const dx = px - s.pos.x, dy = py - s.pos.y;
  const lx = dx * c - dy * sn, ly = dx * sn + dy * c;
  return Math.abs(lx) <= s.object.length / 2 && Math.abs(ly) <= s.object.depth / 2;
}

/**
 * A convex rectangle lies inside an L-shaped region exactly when all four of
 * its corners are inside AND the reflex vertex is not inside the rectangle.
 */
export function collides(s = state) {
  for (const c of corners(s)) if (!inL(c.x, c.y, s.a, s.b)) return true;
  return pointInRect(s.b, s.a, s);
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

let cv, ctx, scale = 4, ox = 40, oy = 40;

export function attach(canvas) {
  cv = canvas;
  ctx = canvas.getContext('2d');
  fit();
  window.addEventListener('resize', () => { fit(); draw(); });
  bindPointer();
  draw();
}

function fit() {
  const dpr = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  cv.width = r.width * dpr;
  cv.height = r.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const span = 150; // inches visible
  scale = Math.min(r.width, r.height) / span;
  ox = r.width * 0.12;
  oy = r.height * 0.88;
}

const px = x => ox + x * scale;
const py = y => oy - y * scale;
const inx = X => (X - ox) / scale;
const iny = Y => (oy - Y) / scale;

function css(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function draw() {
  if (!ctx) return;
  const r = cv.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);

  const { a, b } = state;
  const far = 150;

  // The L, drawn as walls with a floor fill
  ctx.beginPath();
  ctx.moveTo(px(0), py(0));
  ctx.lineTo(px(far), py(0));
  ctx.lineTo(px(far), py(a));
  ctx.lineTo(px(b), py(a));
  ctx.lineTo(px(b), py(far));
  ctx.lineTo(px(0), py(far));
  ctx.closePath();
  ctx.fillStyle = css('--floor', '#efeae1');
  ctx.fill();
  ctx.strokeStyle = css('--wall', '#3a352c');
  ctx.lineWidth = 2;
  ctx.stroke();

  // The reflex corner, which is the whole problem
  ctx.beginPath();
  ctx.arc(px(b), py(a), 5, 0, Math.PI * 2);
  ctx.fillStyle = css('--pinch', '#a3341f');
  ctx.fill();

  // Dimension labels
  ctx.fillStyle = css('--mut', '#6b665e');
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillText(`${a}"`, px(far * 0.62), py(a / 2));
  ctx.save();
  ctx.translate(px(b / 2), py(far * 0.62));
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`${b}"`, 0, 0);
  ctx.restore();

  // The object
  const bad = collides();
  const cs = corners();
  ctx.beginPath();
  ctx.moveTo(px(cs[0].x), py(cs[0].y));
  for (let i = 1; i < 4; i++) ctx.lineTo(px(cs[i].x), py(cs[i].y));
  ctx.closePath();
  ctx.fillStyle = bad ? css('--badfill', 'rgba(163,52,31,.22)') : css('--okfill', 'rgba(28,107,63,.18)');
  ctx.fill();
  ctx.strokeStyle = bad ? css('--pinch', '#a3341f') : css('--ok', '#1c6b3f');
  ctx.lineWidth = 2;
  ctx.stroke();

  // Long axis, so the orientation is readable at a glance
  const t = state.angle * DEG;
  const hx = state.object.length / 2;
  ctx.beginPath();
  ctx.moveTo(px(state.pos.x - hx * Math.cos(t)), py(state.pos.y - hx * Math.sin(t)));
  ctx.lineTo(px(state.pos.x + hx * Math.cos(t)), py(state.pos.y + hx * Math.sin(t)));
  ctx.strokeStyle = bad ? css('--pinch', '#a3341f') : css('--ok', '#1c6b3f');
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

/* ------------------------------------------------------------------ *
 * Direct manipulation
 * ------------------------------------------------------------------ */

function bindPointer() {
  let grab = null;

  cv.addEventListener('pointerdown', e => {
    const x = inx(e.offsetX), y = iny(e.offsetY);
    if (pointInRect(x, y, state)) {
      grab = { dx: state.pos.x - x, dy: state.pos.y - y };
      cv.setPointerCapture(e.pointerId);
      update({ dragging: true });
    }
  });

  cv.addEventListener('pointermove', e => {
    if (!grab) return;
    const x = inx(e.offsetX), y = iny(e.offsetY);
    update({ pos: { x: x + grab.dx, y: y + grab.dy } });
  });

  cv.addEventListener('pointerup', e => {
    grab = null;
    cv.releasePointerCapture(e.pointerId);
    update({ dragging: false });
  });

  cv.addEventListener('wheel', e => {
    e.preventDefault();
    update({ angle: (state.angle + Math.sign(e.deltaY) * 2 + 360) % 360 });
  }, { passive: false });
}

/* ------------------------------------------------------------------ *
 * The carry
 * ------------------------------------------------------------------ */

/**
 * Walk the object round the turn the way a person would: slide in along the
 * horizontal arm, rotate through the corner, slide out up the vertical arm.
 * Reports the worst moment. This is what both the drag handle and the agent's
 * `carry_through_turn` tool are ultimately asking about.
 */
export function attemptCarry({ steps = 90 } = {}) {
  const { a, b } = state;
  const { length: L, depth: D } = state.object;
  const best = cornerMaxLength({ widthA: a, widthB: b, objectWidth: D });
  let worst = null;

  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const angle = k * 90;
    const t = angle * DEG;
    // Keep the object tucked into the outer corner as it swings, which is what
    // anyone carrying furniture actually does.
    const cx = b + (L / 2) * Math.cos(t) - (D / 2) * Math.sin(t);
    const cy = a + (L / 2) * Math.sin(t) + (D / 2) * Math.cos(t);
    const probe = { ...state, angle, pos: { x: cx - L / 2, y: cy - D / 2 } };
    if (collides(probe) && !worst) worst = { angle, pos: probe.pos };
  }

  return {
    goes: !worst && L <= best.maxLength,
    maxLength: best.maxLength,
    pinchAngle: best.pinchAngle,
    stuckAt: worst
  };
}

/** Park the object at the pinch point so the failure is visible, not asserted. */
export function showPinch() {
  const r = attemptCarry();
  const t = r.pinchAngle * DEG;
  const { length: L, depth: D } = state.object;
  update({
    angle: r.pinchAngle,
    pos: {
      x: state.b + (L / 2) * Math.cos(t) - (D / 2) * Math.sin(t) - L / 2,
      y: state.a + (L / 2) * Math.sin(t) + (D / 2) * Math.cos(t) - D / 2
    }
  });
  return r;
}
