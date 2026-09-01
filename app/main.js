/**
 * The app controller.
 *
 * One object owns every mutation. The sidebar calls it, the canvas calls it,
 * and the WebMCP tools call it. There is no second path and no agent-only
 * branch, which is the whole point: when the agent moves the couch, the couch
 * moves on your screen, because it is the same couch.
 */

import { STAIRCASE, CATALOGUE, plain, plainObject, provisionalFields, SOURCE } from './model.js';
import { checkPath, cornerMaxLength } from './geometry.js';
import { ft } from './units.js';
import * as view from './view.js';
import * as solid from './scene.js';
import { registerTools } from './tools.js';

export const app = {
  stairModel: STAIRCASE,
  stair: plain(STAIRCASE),
  catalogue: CATALOGUE,
  current: CATALOGUE[0],
  dims: null,
  doorRemoved: false,
  subscribers: [],

  onChange(fn) { this.subscribers.push(fn); },
  emit() { for (const fn of this.subscribers) fn(this); },

  /* ---- reads ---- */

  verdict() {
    return checkPath(
      { ...this.dims, width: this.dims.depth, feetHeight: this.current.feetHeight },
      this.effectiveStair()
    );
  },

  effectiveStair() {
    const s = plain(this.stairModel);
    if (this.doorRemoved) {
      s.doors = s.doors.map(d => d.removable
        ? { ...d, width: d.width + (d.leafThickness || 1.75), name: d.name + ' (leaf removed)' }
        : d);
    }
    return s;
  },

  longestAt(depth) {
    return cornerMaxLength({
      widthA: this.stairModel.turn.widthA.value,
      widthB: this.stairModel.turn.widthB.value,
      objectWidth: depth
    });
  },

  unknowns() { return provisionalFields(this.stairModel); },

  /* ---- writes. every one of these must move something on screen ---- */

  select(id) {
    const item = CATALOGUE.find(c => c.id === id);
    if (!item) return null;
    this.current = item;
    this.dims = {
      length: item.length.value,
      depth: item.depth.value,
      height: item.height.value
    };
    this.sync();
    view.park();
    return item;
  },

  setDims(patch) {
    this.dims = { ...this.dims, ...patch };
    if (patch.label) this.current = { ...this.current, label: patch.label, id: 'custom' };
    this.sync();
  },

  place({ x, y, angle }) {
    view.update({
      pos: { x: x ?? view.state.pos.x, y: y ?? view.state.pos.y },
      angle: angle ?? view.state.angle
    });
    this.emit();
  },

  showPinch() { const r = view.showPinch(); this.emit(); return r; },

  setStairMeasurement(field, inches, note) {
    const target = field.startsWith('turn.')
      ? this.stairModel.turn[field.slice(5)]
      : this.stairModel[field];
    if (!target || typeof target !== 'object') return false;
    target.value = inches;
    target.source = SOURCE.MEASURED;
    target.note = note || 'Entered during this session.';
    this.stair = plain(this.stairModel);
    view.state.a = this.stairModel.turn.widthA.value;
    view.state.b = this.stairModel.turn.widthB.value;
    this.sync();
    return true;
  },

  setDoorRemoved(v) { this.doorRemoved = !!v; this.sync(); },

  reset() {
    this.doorRemoved = false;
    this.select(CATALOGUE[0].id);
  },

  /** Push dimensions into the canvas, redraw, and tell everyone. */
  sync() {
    // Draw what the solver says is actually presented to the floor, not the raw
    // dimensions. These are the same numbers the verdict is computed from, so
    // the picture and the text can never disagree.
    const f = this.verdict().footprint;
    view.update({
      object: {
        length: f.length,
        depth: f.width,
        label: this.current.label,
        shape: this.current.shape || 'box',
        upright: f.upright
      }
    });
    this.emit();
  }
};

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

/**
 * If someone measured their own stairwell on /measure, use it. Stored in this
 * browser only; it never went anywhere else.
 */
function loadMine() {
  if (!new URLSearchParams(location.search).has('mine')) return false;
  let raw = null;
  try { raw = localStorage.getItem('elbowroom.staircase'); } catch { return false; }
  if (!raw) return false;
  let mine; try { mine = JSON.parse(raw); } catch { return false; }
  let n = 0;
  for (const [field, inches] of Object.entries(mine)) {
    if (typeof inches !== 'number' || !isFinite(inches) || inches <= 0) continue;
    if (app.setStairMeasurement(field, inches, 'Measured from your own photograph on /measure.')) n++;
  }
  if (n) {
    STAIRCASE.label = 'Your staircase, measured from a photograph';
    app.stair = plain(STAIRCASE);
  }
  return n > 0;
}

export function boot() {
  view.state.a = STAIRCASE.turn.widthA.value;
  view.state.b = STAIRCASE.turn.widthB.value;
  view.attach(document.getElementById('cv'));
  solid.attach(document.getElementById('solid'));

  const pick = document.getElementById('pick');
  for (const item of CATALOGUE) {
    const o = document.createElement('option');
    o.value = item.id; o.textContent = item.label;
    pick.appendChild(o);
  }

  const len = document.getElementById('len'),
        dep = document.getElementById('dep'),
        hgt = document.getElementById('hgt');

  app.onChange(() => {
    pick.value = app.current.id;
    len.value = app.dims.length;
    dep.value = app.dims.depth;
    hgt.value = app.dims.height;
    document.getElementById('dimsFt').textContent =
      `${ft(app.dims.length)} by ${ft(app.dims.depth)} by ${ft(app.dims.height)}`;

    const r = app.verdict();
    const el = document.getElementById('verdict');
    el.className = 'verdict ' + (r.verdict === 'goes' ? 'yes' : 'no');
    el.innerHTML = '<b>' + (r.verdict === 'goes' ? 'It goes' : 'It does not go') + '</b>' +
      r.reasons.map(x => `<p>${x.pass ? '' : '<strong>'}${x.stage}. ${x.detail}${x.pass ? '' : '</strong>'}</p>`).join('') +
      r.advice.map(a => `<p>&rarr; ${a}</p>`).join('');

    // The isometric view carries what the plan cannot: that the floor is
    // climbing, and that a water heater goes up standing on end. Every number
    // it draws comes from the same verdict, so the two views cannot disagree.
    const st = app.stairModel;
    solid.set({
      a: st.turn.widthA.value, b: st.turn.widthB.value,
      headroom: st.turn.headroom.value,
      rise: st.run.rise.value, going: st.run.going.value,
      treads: st.run.treads.value, winders: st.turn.treads.value,
      object: { length: app.dims.length, width: app.dims.depth, height: app.dims.height,
                shape: app.current.shape || 'box' },
      tilt: r.footprint.tilt, upright: r.footprint.upright,
      // Colour by the verdict, not by whether it happens to be touching a wall
      // where it is parked. Green while the sidebar says it does not go was the
      // picture contradicting the words again.
      blocked: r.verdict !== 'goes',
      pos: { ...view.state.pos }, yaw: view.state.angle
    });

    const prov = document.getElementById('prov');
    prov.innerHTML =
      `<li><strong>${ft(STAIRCASE.clearWidth.value)}</strong> clear width. ${STAIRCASE.clearWidth.note}</li>` +
      app.unknowns().map(f => `<li class="warn"><strong>${f.field}</strong> is provisional. ${f.note}</li>`).join('');
  });

  pick.onchange = () => app.select(pick.value);
  for (const el of [len, dep, hgt]) {
    el.oninput = () => app.setDims({
      length: +len.value, depth: +dep.value, height: +hgt.value
    });
  }
  document.getElementById('pinch').onclick = () => app.showPinch();

  view.onChange(() => app.emit());

  app.select(CATALOGUE[0].id);
  if (loadMine()) app.sync();
  registerTools(app);
}
