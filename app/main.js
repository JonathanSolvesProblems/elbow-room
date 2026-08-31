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
    view.update({
      object: { length: this.dims.length, depth: this.dims.depth, label: this.current.label }
    });
    this.emit();
  }
};

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

export function boot() {
  view.state.a = STAIRCASE.turn.widthA.value;
  view.state.b = STAIRCASE.turn.widthB.value;
  view.attach(document.getElementById('cv'));

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
  registerTools(app);
}
