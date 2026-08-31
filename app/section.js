/**
 * Side elevation of the turn.
 *
 * The plan view shows the corner. It cannot show the other half of the problem:
 * that you tilt a long object to get it round, and the soffit over the turn is
 * what stops you tilting. On this staircase both constraints bite at the same
 * place, which is why the ceiling edge is the part that got gouged rather than
 * the walls.
 *
 * Drawn looking side-on at the turn: the tread you are standing on, the soffit
 * above it, and the object at whatever tilt the headroom allows.
 */

import { maxTilt } from './geometry.js';
import { ft } from './units.js';

const DEG = Math.PI / 180;

let cv, ctx, scale = 3, ox = 0, oy = 0;
let model = { headroom: 78, length: 91, thickness: 36, provisional: true };

export function attach(canvas) {
  cv = canvas;
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', () => { resize(); draw(); });
  draw();
}

export function set(next) {
  model = { ...model, ...next };
  draw();
}

function resize() {
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  cv.width = Math.max(1, r.width * dpr);
  cv.height = Math.max(1, r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const spanY = model.headroom * 1.18;
  const spanX = Math.max(model.length * 1.15, spanY * 1.6);
  scale = Math.min(r.width / spanX, r.height / spanY);
  ox = (r.width - spanX * scale) / 2 + 14;
  oy = r.height - 16;
}

const px = x => ox + x * scale;
const py = y => oy - y * scale;

function css(name, fb) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fb;
}

export function draw() {
  if (!ctx) return;
  const r = cv.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);

  const { headroom, length, thickness } = model;
  const wide = (r.width - ox) / scale;

  // Tread line
  ctx.strokeStyle = css('--wall', '#3a352c');
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(px(0), py(0));
  ctx.lineTo(px(wide), py(0));
  ctx.stroke();

  // Soffit, hatched, because it is the thing in the way
  const sy = py(headroom);
  ctx.save();
  ctx.strokeStyle = model.provisional ? css('--pinch', '#a3341f') : css('--wall', '#3a352c');
  ctx.setLineDash(model.provisional ? [5, 4] : []);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(px(0), sy);
  ctx.lineTo(px(wide), sy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  for (let x = 0; x < wide; x += 7) {
    ctx.beginPath();
    ctx.moveTo(px(x), sy);
    ctx.lineTo(px(x) + 9, sy - 11);
    ctx.stroke();
  }
  ctx.restore();

  // Headroom dimension
  ctx.strokeStyle = css('--mut', '#6b665e');
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px(6), py(0));
  ctx.lineTo(px(6), sy);
  ctx.stroke();
  ctx.fillStyle = model.provisional ? css('--pinch', '#a3341f') : css('--mut', '#6b665e');
  ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.save();
  ctx.translate(px(6) - 6, py(headroom / 2));
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText(ft(headroom) + (model.provisional ? ' (not measured)' : ''), 0, 0);
  ctx.restore();
  ctx.textAlign = 'left';

  // The object, tilted as far as the headroom lets it
  const tilt = maxTilt({ headroom, objectLength: length, objectThickness: thickness });
  const t = tilt * DEG;
  const needs = length * Math.sin(t) + thickness * Math.cos(t);
  const strikes = needs > headroom + 0.01;

  const cx = 34 + (length / 2) * Math.cos(t);
  const cy = (length / 2) * Math.sin(t) + (thickness / 2) * Math.cos(t);
  const hx = length / 2, hy = thickness / 2;
  const pts = [[+hx, +hy], [-hx, +hy], [-hx, -hy], [+hx, -hy]].map(([a, b]) => ({
    x: cx + a * Math.cos(t) - b * Math.sin(t),
    y: cy + a * Math.sin(t) + b * Math.cos(t)
  }));

  ctx.beginPath();
  ctx.moveTo(px(pts[0].x), py(pts[0].y));
  for (let i = 1; i < 4; i++) ctx.lineTo(px(pts[i].x), py(pts[i].y));
  ctx.closePath();
  ctx.fillStyle = strikes ? css('--badfill', 'rgba(163,52,31,.22)') : css('--okfill', 'rgba(28,107,63,.18)');
  ctx.fill();
  ctx.strokeStyle = strikes ? css('--pinch', '#a3341f') : css('--ok', '#1c6b3f');
  ctx.lineWidth = 2;
  ctx.stroke();

  // Caption
  ctx.fillStyle = css('--mut', '#6b665e');
  ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(
    tilt >= 89.5
      ? `Stands upright under the soffit.`
      : `Tilts to ${tilt.toFixed(0)}° before the soffit stops it.`,
    px(0) + 2, py(headroom) - 18
  );
}
