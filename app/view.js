/**
 * Plan view of the turn, and the thing you are trying to get round it.
 *
 * This is a canvas, deliberately. The point of the project is that a browser
 * agent cannot drive a spatial editor by clicking pixels or reading the DOM,
 * because there is nothing here to read: no elements, no labels, no handles in
 * the accessibility tree. A person drags the couch. An agent calls a tool. Both
 * mutate the same `state` and see the same result.
 *
 * Geometry of the L, matching geometry.js:
 *   lower arm    { 0 <= y <= a,  x >= 0 }   runs right
 *   upper arm    { 0 <= x <= b,  y >= 0 }   runs up
 *   outer corner (0, 0)
 *   reflex corner (b, a)   <- the one that stops everything
 */

import { cornerMaxLength } from './geometry.js';
import { ft } from './units.js';

const DEG = Math.PI / 180;

export const state = {
  a: 41.5,
  b: 41.5,
  object: { length: 91, depth: 36, label: 'The couch' },
  pos: { x: 70, y: 20.75 },
  angle: 0,
  listeners: []
};

export function onChange(fn) { state.listeners.push(fn); }
function emit() { for (const fn of state.listeners) fn(state); }

export function update(patch) {
  Object.assign(state, patch);
  if (patch.object) reframe();
  emit();
  draw();
}

/* ------------------------------------------------------------------ *
 * Collision
 * ------------------------------------------------------------------ */

function inL(x, y, a, b) {
  if (x < -0.001 || y < -0.001) return false;
  return y <= a + 0.001 || x <= b + 0.001;
}

export function corners(s = state) {
  const { length: L, depth: D } = s.object;
  const t = s.angle * DEG, c = Math.cos(t), sn = Math.sin(t);
  const hx = L / 2, hy = D / 2;
  return [[+hx, +hy], [-hx, +hy], [-hx, -hy], [+hx, -hy]].map(([px_, py_]) => ({
    x: s.pos.x + px_ * c - py_ * sn,
    y: s.pos.y + px_ * sn + py_ * c
  }));
}

function pointInRect(px_, py_, s) {
  const t = -s.angle * DEG, c = Math.cos(t), sn = Math.sin(t);
  const dx = px_ - s.pos.x, dy = py_ - s.pos.y;
  const lx = dx * c - dy * sn, ly = dx * sn + dy * c;
  return Math.abs(lx) <= s.object.length / 2 && Math.abs(ly) <= s.object.depth / 2;
}

/** Convex rectangle inside an L: all four corners in, reflex vertex out. */
export function collides(s = state) {
  for (const c of corners(s)) if (!inL(c.x, c.y, s.a, s.b)) return true;
  return pointInRect(s.b, s.a, s);
}

/* ------------------------------------------------------------------ *
 * Framing
 * ------------------------------------------------------------------ */

let cv, ctx, scale = 4, ox = 0, oy = 0, armLen = 120;

export function attach(canvas) {
  cv = canvas;
  ctx = canvas.getContext('2d');
  reframe();
  window.addEventListener('resize', () => { reframe(); draw(); });
  bindPointer();
  draw();
}

/**
 * Frame the drawing around what actually matters: the corner, plus enough of
 * each arm to hold the object. A fixed span left the turn in a corner of a
 * mostly empty canvas.
 */
function reframe() {
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  cv.width = Math.max(1, r.width * dpr);
  cv.height = Math.max(1, r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  armLen = Math.max(state.a, state.b) + state.object.length * 0.95;
  const pad = 26;
  const spanX = armLen + pad, spanY = armLen + pad;
  scale = Math.min(r.width / spanX, r.height / spanY);

  // Put the outer corner low-left with the arms running right and up.
  const drawnW = spanX * scale, drawnH = spanY * scale;
  ox = (r.width - drawnW) / 2 + pad * scale * 0.5;
  oy = (r.height + drawnH) / 2 - pad * scale * 0.5;
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
  const far = armLen;

  // Floor of the L
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
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // The reflex corner
  ctx.beginPath();
  ctx.arc(px(b), py(a), 5, 0, Math.PI * 2);
  ctx.fillStyle = css('--pinch', '#a3341f');
  ctx.fill();

  // Width dimensions, in feet, clear of the object
  ctx.fillStyle = css('--mut', '#6b665e');
  ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(ft(a), px(far * 0.86), py(a / 2) + 4);
  ctx.save();
  ctx.translate(px(b / 2), py(far * 0.86));
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(ft(b), 0, 4);
  ctx.restore();
  ctx.textAlign = 'left';

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

  // Label along the object
  ctx.save();
  ctx.translate(px(state.pos.x), py(state.pos.y));
  ctx.rotate(-state.angle * DEG);
  ctx.fillStyle = bad ? css('--pinch', '#a3341f') : css('--ok', '#1c6b3f');
  ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${state.object.label} · ${ft(state.object.length)}`, 0, 4);
  ctx.restore();
  ctx.textAlign = 'left';
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
    }
  });

  cv.addEventListener('pointermove', e => {
    if (!grab) return;
    update({ pos: { x: inx(e.offsetX) + grab.dx, y: iny(e.offsetY) + grab.dy } });
  });

  cv.addEventListener('pointerup', e => {
    grab = null;
    try { cv.releasePointerCapture(e.pointerId); } catch {}
  });

  cv.addEventListener('wheel', e => {
    e.preventDefault();
    update({ angle: (state.angle + Math.sign(e.deltaY) * 2 + 360) % 360 });
  }, { passive: false });
}

/* ------------------------------------------------------------------ *
 * The carry
 * ------------------------------------------------------------------ */

export function attemptCarry() {
  const { a, b } = state;
  const { length: L, depth: D } = state.object;
  const best = cornerMaxLength({ widthA: a, widthB: b, objectWidth: D });
  return { goes: !best.tooWide && L <= best.maxLength, maxLength: best.maxLength, pinchAngle: best.pinchAngle };
}

/**
 * Park the object where the corner is tightest, tucked against the outer walls
 * the way anyone carrying furniture would hold it. The failure becomes something
 * you can see rather than something the app asserts.
 */
export function showPinch() {
  const r = attemptCarry();
  const angle = isFinite(r.pinchAngle) ? r.pinchAngle : 45;
  const t = angle * DEG;
  const { length: L, depth: D } = state.object;
  const cx = (L / 2) * Math.cos(t) + (D / 2) * Math.sin(t);
  const cy = (L / 2) * Math.sin(t) + (D / 2) * Math.cos(t);
  update({ angle, pos: { x: cx, y: cy } });
  return r;
}

/** Sensible resting place: lying in the lower arm, short of the turn. */
export function park() {
  update({
    angle: 0,
    pos: { x: state.b + state.object.length / 2 + 6, y: state.a / 2 }
  });
}
