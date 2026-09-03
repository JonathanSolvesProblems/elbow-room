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
import * as Room from './room.js';

export const app = {
  stairModel: STAIRCASE,
  stair: plain(STAIRCASE),
  catalogue: CATALOGUE,
  current: CATALOGUE[0],
  dims: null,
  doorRemoved: false,
  // What the last Show me where it jams found, shown on the 3D label until
  // anything moves the object again.
  pinchNote: null,
  // A room traced off a photograph, if one is loaded. When it is, the verdict
  // is about fitting inside four walls rather than travelling up a flight.
  room: null,
  // The stitched photograph of that floor, and whether an outline was traced
  // round it. A stitch with no outline is a floor and no walls.
  floor: null,
  walls: true,
  ceiling: 96,
  subscribers: [],

  onChange(fn) { this.subscribers.push(fn); },
  emit() { for (const fn of this.subscribers) fn(this); },

  /* ---- reads ---- */

  verdict() {
    if (this.room) return this.roomVerdict();
    return checkPath(
      { ...this.dims, width: this.dims.depth, feetHeight: this.current.feetHeight },
      this.effectiveStair()
    );
  },

  /**
   * Does it fit in the room, and can it be got through it.
   *
   * Two separate questions, and a room answers both differently from a
   * staircase: whether the thing physically stands inside the outline at all,
   * and whether the narrowest wall-to-wall gap will let it past.
   */
  roomVerdict(dims) {
    const d = Room.describe(this.room, this.ceiling);
    const it = dims || this.dims;
    const L = it.length, W = it.depth, H = it.height;
    const reasons = [];

    // A stitched floor with nothing traced round it has no walls, so there is
    // no ceiling to clear and no gap to squeeze through. Saying otherwise would
    // be measuring against a rectangle the stitch drew, not one anybody found.
    if (this.walls === false) {
      const standsOn = d.longest >= L;
      reasons.push({
        stage: 'photographed floor', pass: standsOn,
        detail: standsOn
          ? `${ft(L)} fits within the floor that was photographed, which runs ${ft(d.longest)} ` +
            `at its longest.`
          : `${ft(L)} is longer than the ${ft(d.longest)} of floor that was photographed.`
      });
      reasons.push({
        stage: 'walls', pass: true,
        detail: 'No walls were traced here, so nothing has been checked against one. This is a ' +
                'photograph of your floor in real inches, not a survey of the room. Trace the ' +
                'outline on the measure page to get a real verdict.'
      });
      return {
        verdict: standsOn ? 'goes' : 'blocked',
        reasons,
        advice: standsOn
          ? ['Trace the walls on the measure page and this becomes a real answer.']
          : ['Photograph more of the floor, or trace the walls, and ask again.'],
        footprint: { length: L, width: W, upright: false, tilt: 0 },
        room: d
      };
    }

    const standsFlat = d.longest >= Math.hypot(L, W) * 0.999 || d.longest >= L;
    reasons.push({
      stage: 'floor', pass: standsFlat,
      detail: standsFlat
        ? `${ft(L)} fits inside the outline. The longest straight run in this room is ${ft(d.longest)}.`
        : `${ft(L)} is longer than the longest straight run in this room, ${ft(d.longest)}.`
    });

    const underCeiling = H <= d.ceiling;
    reasons.push({
      stage: 'ceiling', pass: underCeiling,
      detail: underCeiling
        ? `${ft(H)} tall clears the ${ft(d.ceiling)} ceiling.`
        : `${ft(H)} tall does not clear the ${ft(d.ceiling)} ceiling.`
    });

    const gap = isFinite(d.narrowest) ? d.narrowest : Infinity;
    const throughGap = Math.min(W, H) <= gap;
    reasons.push({
      stage: 'narrowest gap', pass: throughGap,
      detail: isFinite(gap)
        ? (throughGap
            ? `Its smallest cross section is ${ft(Math.min(W, H))}, and the narrowest gap here is ${ft(gap)}.`
            : `The narrowest gap here is ${ft(gap)} and its smallest cross section is ${ft(Math.min(W, H))}.`)
        : 'This outline has no interior pinch to squeeze through.'
    });

    const ok = reasons.every(r => r.pass);
    return {
      verdict: ok ? 'goes' : 'blocked',
      reasons,
      advice: ok ? [] : [
        'Try it on its side, or measure the doorway on its own and check that instead.'
      ],
      footprint: { length: L, width: W, upright: false, tilt: 0 },
      room: d
    };
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

  /** Where the object is standing, in inches and degrees from the outer corner. */
  pose() {
    return { x: view.state.pos.x, y: view.state.pos.y, angle: view.state.angle };
  },

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
    this.pinchNote = null;
    view.update({
      pos: { x: x ?? view.state.pos.x, y: y ?? view.state.pos.y },
      angle: angle ?? view.state.angle
    });
    this.emit();
  },

  /**
   * Park the object at the worst point on the route.
   *
   * For something that does not fit that point is where it jams. For something
   * that does fit it is still the tightest place it will ever be, which is the
   * more reassuring answer and the one the button used to hide by calling it a
   * jam and then showing a clear spot.
   */
  showPinch() {
    const r = view.showPinch();
    // Against the length actually presented to the corner, not the raw longest
    // dimension. A water heater tilted on its side shows 2 feet to the turn,
    // not 5, and measuring the slack against 5 put "9 and a half inches to
    // spare" on the 3D label beside "3 foot 9 and a half" in the sidebar.
    const slack = r.maxLength - view.state.object.length;
    this.pinchNote = r.goes
      ? `tightest point, ${ft(slack)} to spare`
      : `jams here, short by ${ft(-slack)}`;
    this.emit();
    return r;
  },

  setStairMeasurement(field, inches, note) {
    // A dotted path, so the run's tread count and going are reachable too, not
    // just the four figures the turn happens to expose. Every one of these is
    // an input to the 3D shaft, so being able to set them is the difference
    // between a generic staircase and yours.
    let target = this.stairModel;
    for (const key of field.split('.')) {
      if (!target || typeof target !== 'object') return false;
      target = target[key];
    }
    if (!target || typeof target !== 'object' || !('value' in target)) return false;
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

  /**
   * Put the object back where it starts, facing the way it starts.
   *
   * Reset used to restore the position and leave the angle alone, so after
   * Show me the tightest point the couch went home still turned 45 degrees
   * through the corner and did not look reset at all.
   */
  resetPose() {
    this.pinchNote = null;
    view.park();
    this.emit();
  },

  reset() {
    this.doorRemoved = false;
    this.select(CATALOGUE[0].id);
  },

  /** Push dimensions into the canvas, redraw, and tell everyone. */
  sync() {
    this.pinchNote = null;
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
    const counted = /treads$/.test(field);
    if (app.setStairMeasurement(field, counted ? Math.round(inches) : inches,
        counted ? 'Counted on your own staircase.'
                : 'Measured from your own photograph on /measure.')) n++;
  }
  // The shaft is rebuilt from whatever came across, so a different tread count
  // or going gives a different staircase rather than the same one relabelled.
  view.state.a = app.stairModel.turn.widthA.value;
  view.state.b = app.stairModel.turn.widthB.value;
  if (n) {
    STAIRCASE.label = 'Your staircase, measured from a photograph';
    app.stair = plain(STAIRCASE);
    // Say it at the top. The provenance list at the foot of the sidebar already
    // carried the proof, but someone who has just measured their own stairwell
    // arrives to a page that looks exactly like the one they left.
    const el = document.getElementById('mine');
    if (el) {
      el.hidden = false;
      el.innerHTML = `<strong>This is your staircase.</strong> ${n} reading` +
        `${n > 1 ? 's' : ''} from your own photograph, kept in this browser. ` +
        `Everything below is computed from ${n > 1 ? 'them' : 'it'}. ` +
        `<a href="/">Use the demo staircase instead</a>.`;
    }
    const tag = document.getElementById('tag');
    if (tag) tag.textContent = 'Before you buy the couch, find out whether it can get up the stairs.';

    // And put your own photograph on the walls, so the shaft you orbit looks
    // like the one you photographed rather than like mine.
    try {
      const skin = localStorage.getItem('elbowroom.photo');
      if (skin) solid.setSkin(skin);
    } catch { /* private mode, keep the default surfaces */ }
  }
  return n > 0;
}

/**
 * And whatever you measured about the thing you are carrying.
 *
 * The same four clicks that size a stairwell size a couch in a shop, so a
 * photograph taken next to the price tag arrives here as the object on the
 * canvas. Returns its label if anything came across.
 */
function loadObject() {
  // Behind the same switch as the staircase. Without this, anyone who had ever
  // measured a wardrobe got their wardrobe on the demo page for ever, and the
  // "use the demo staircase instead" link led back to a page that was still
  // half theirs.
  if (!new URLSearchParams(location.search).has('mine')) return null;
  let raw = null;
  try { raw = localStorage.getItem('elbowroom.object'); } catch { return null; }
  if (!raw) return null;
  let o; try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const num = v => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);
  const L = num(o.length), D = num(o.depth), H = num(o.height);
  if (!L && !D && !H) return null;
  const base = app.dims || { length: 60, depth: 24, height: 24 };
  app.setDims({
    length: L || base.length,
    depth: D || base.depth,
    height: H || base.height,
    label: String(o.label || 'Measured from a photograph').slice(0, 40)
  });
  return { label: app.current.label, L, D, H };
}

/**
 * The staircase exactly as it shipped.
 *
 * Switching between staircases has to be able to go back, and every reading
 * written into the model overwrites the value, the source and the note. Taken
 * once, before anything can touch it, so restoring is exact rather than
 * approximate.
 */
const BASE_LABEL = STAIRCASE.label;
const BASE = (() => {
  const out = {};
  const walk = (node, path) => {
    for (const [k, v] of Object.entries(node)) {
      if (!v || typeof v !== 'object') continue;
      if ('value' in v) out[[...path, k].join('.')] = { value: v.value, source: v.source, note: v.note };
      else if (!Array.isArray(v)) walk(v, [...path, k]);
    }
  };
  walk({ clearWidth: STAIRCASE.clearWidth, run: STAIRCASE.run, turn: STAIRCASE.turn }, []);
  return out;
})();

export function boot() {
  view.state.a = STAIRCASE.turn.widthA.value;
  view.state.b = STAIRCASE.turn.widthB.value;
  view.attach(document.getElementById('cv'));
  solid.attach(document.getElementById('solid'));
  // Dragging in 3D moves the same couch the plan view is drawing.
  solid.onObjectMove(p => { view.update({ pos: { x: p.x, y: p.y } }); });
  window.addEventListener('elbowroom:mode', e => solid.setMode(e.detail));
  // Registered after the scene's own handler, so the camera reframes first and
  // the pose is then restored through the one code path that owns it.
  window.addEventListener('elbowroom:camera', e => {
    if (e.detail === 'reset') app.resetPose();
  });

  /* ------------------------------------------------------------------ *
   * What you had on the canvas.
   *
   * Picking an object, typing its size and carrying it to the tight spot is
   * work, and a click on "Measure yours" used to throw all of it away. Kept
   * here in the browser and put back on return, so the two pages behave like
   * one app rather than two.
   * ------------------------------------------------------------------ */
  const BENCH = 'elbowroom.bench';
  let benching = false;

  const rememberBench = () => {
    if (benching) return;
    try {
      const p = app.pose();
      localStorage.setItem(BENCH, JSON.stringify({
        id: app.current.id,
        label: app.current.label,
        dims: app.dims,
        door: app.doorRemoved,
        pos: { x: p.x, y: p.y },
        angle: p.angle
      }));
    } catch { /* private mode, nothing is kept */ }
  };

  // Read once, at the top, before anything on this page has had a chance to
  // write over it. Booting selects the first catalogue object, which fired a
  // change, which saved the couch over the mattress you actually left there.
  let benchOnArrival = null;
  try { benchOnArrival = JSON.parse(localStorage.getItem(BENCH) || 'null'); } catch { /* none */ }

  const restoreBench = () => {
    const b = benchOnArrival;
    if (!b || !b.dims) return false;
    const n = v => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);
    if (!n(b.dims.length) || !n(b.dims.depth) || !n(b.dims.height)) return false;
    benching = true;
    try {
      if (b.id && CATALOGUE.some(c => c.id === b.id)) app.select(b.id);
      else app.setDims({ ...b.dims, label: String(b.label || 'Custom object').slice(0, 40) });
      app.setDims(b.dims);
      if (b.door) app.setDoorRemoved(true);
      if (b.pos && typeof b.pos.x === 'number') {
        app.place({ x: b.pos.x, y: b.pos.y, angle: b.angle || 0 });
      }
    } finally { benching = false; }
    return true;
  };

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
    // A custom object, measured from a photograph or typed by the agent, is not
    // in the catalogue, so the dropdown had nothing to select and went blank.
    // Give it a row of its own and keep the name visible.
    if (!CATALOGUE.some(c => c.id === app.current.id)) {
      let o = pick.querySelector('option[value="custom"]');
      if (!o) {
        o = document.createElement('option');
        o.value = 'custom';
        pick.appendChild(o);
      }
      o.textContent = app.current.label;
      pick.value = 'custom';
    } else {
      pick.value = app.current.id;
    }
    len.value = app.dims.length;
    dep.value = app.dims.depth;
    hgt.value = app.dims.height;
    document.getElementById('dimsFt').textContent =
      `${ft(app.dims.length)} by ${ft(app.dims.depth)} by ${ft(app.dims.height)}`;

    const r = app.verdict();
    const el = document.getElementById('verdict');
    el.className = 'verdict ' + (r.verdict === 'goes' ? 'yes' : 'no');
    // The button promised a jam and then parked a water heater that fits in a
    // clear spot. Say which of the two things it is about to show.
    document.getElementById('pinch').textContent =
      r.verdict === 'goes' ? 'Show me the tightest point' : 'Show me where it jams';

    el.innerHTML = '<b>' + (r.verdict === 'goes' ? 'It goes' : 'It does not go') + '</b>' +
      r.reasons.map(x => `<p>${x.pass ? '' : '<strong>'}${x.stage}. ${x.detail}${x.pass ? '' : '</strong>'}</p>`).join('') +
      r.advice.map(a => `<p>&rarr; ${a}</p>`).join('');

    // The isometric view carries what the plan cannot: that the floor is
    // climbing, and that a water heater goes up standing on end. Every number
    // it draws comes from the same verdict, so the two views cannot disagree.
    const st = app.stairModel;
    // Set, do not update. view.update emits, and view.onChange calls back into
    // app.emit, so calling it from inside this handler is an infinite loop.
    view.state.room = app.room;
    view.state.floor = app.floor;
    solid.set({
      room: app.room, ceiling: app.ceiling, floor: app.floor, walls: app.walls,
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
      note: app.pinchNote,
      pos: { ...view.state.pos }, yaw: view.state.angle
    });
    // One clearance test drives both drawings.
    view.setClear(solid.isClear());

    rememberBench();

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
  /* ------------------------------------------------------------------ *
   * Which staircase.
   *
   * One demo house, whatever you measured last, and every staircase you named
   * and kept. All in one list, one click each, with the demo permanent and the
   * imports removable. This replaces a URL flag that only ever toggled between
   * two of them and could not name any.
   * ------------------------------------------------------------------ */
  const ACTIVE = 'elbowroom.active';

  const readJson = (k, fallback) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  };

  /** Everything the picker can offer, demo first. */
  const staircases = () => {
    const list = [{ id: '', name: 'The demo staircase', note: 'the one this app was built for',
                    fixed: true }];
    const working = readJson('elbowroom.staircase', null);
    if (working && Object.keys(working).length) {
      // Counted the same way a saved staircase is, so the honest warning about
      // one or two readings leaving my shape underneath fires here too. It did
      // not, and this is the entry someone lands on straight after measuring.
      const measured = Object.keys(working).filter(k => !/treads$/.test(k)).length;
      list.push({ id: '__working', name: 'What you just measured', measured,
                  note: measured
                    ? `${measured} reading${measured === 1 ? '' : 's'} of the 7 that shape it`
                    : 'no measurements, only step counts',
                  readings: working });
    }
    const room = readJson('elbowroom.room', null);
    if (room && Array.isArray(room.poly) && room.poly.length >= 3) {
      const d = Room.describe(room.poly, room.ceiling);
      const stitched = room.floor && room.floor.url;
      // A stitched floor with nothing traced round it is still somewhere: a
      // photograph of your own floor, in inches, with no walls claimed.
      list.push({ id: '__room', room: room.poly, ceiling: room.ceiling,
                  floor: room.floor || null, walls: room.walls !== false,
                  name: room.walls === false ? 'The floor you stitched' : 'The room you traced',
                  note: room.walls === false
                    ? `${d.area.toFixed(0)} sq ft photographed from ` +
                      `${room.floor.frames} frame${room.floor.frames === 1 ? '' : 's'}`
                    : `${d.corners} corners, ${d.area.toFixed(0)} sq ft, ` +
                      `${ft(d.ceiling)} ceiling` + (stitched ? ', photographed floor' : '') });
    }
    for (const x of readJson('elbowroom.sessions', []) || []) {
      if (!x || !x.name) continue;
      // A session that carries a traced floor is a room, not a staircase with
      // nothing in it. Reading it as a staircase is what put the demo shaft on
      // screen after someone saved and reopened their living room.
      if (x.room && Array.isArray(x.room.poly) && x.room.poly.length >= 3) {
        const d = Room.describe(x.room.poly, x.room.ceiling);
        const stitched = x.room.floor && x.room.floor.url;
        list.push({ id: 'saved:' + x.name, name: x.name, room: x.room.poly,
                    ceiling: x.room.ceiling, photo: x.photo,
                    floor: x.room.floor || null, walls: x.room.walls !== false,
                    note: x.room.walls === false
                      ? `stitched floor, ${d.area.toFixed(0)} sq ft from ` +
                        `${x.room.floor.frames} frame${x.room.floor.frames === 1 ? '' : 's'}`
                      : `${d.corners} corners, ${d.area.toFixed(0)} sq ft, ` +
                        `${ft(d.ceiling)} ceiling` +
                        (stitched ? ', photographed floor' : '') +
                        (x.frames ? `, ${x.frames} frames` : '') });
        continue;
      }
      // Count only real measurements. Step counts alone cannot size a staircase.
      const measured = Object.keys(x.readings || {}).filter(k => !/treads$/.test(k)).length;
      list.push({ id: 'saved:' + x.name, name: x.name, measured,
                  note: measured
                    ? `${measured} reading${measured === 1 ? '' : 's'}` +
                      (x.frames ? `, ${x.frames} frames` : '')
                    : `no measurements yet` + (x.frames ? `, ${x.frames} frames` : ''),
                  readings: x.readings, counts: x.counts, photo: x.photo });
    }
    return list;
  };

  /**
   * Say that something is being put together.
   *
   * Switching places rebuilds both drawings, and until now that happened in the
   * gap between two frames with nothing on screen to say so. Coming back from
   * the measure page is worse, because a whole page load sits in front of it.
   */
  const showBuilding = what => {
    const room = what === 'your room';
    for (const [id, text, show] of [
      ['planbuild', `Laying out ${what} in plan`, room],
      ['solidbuild', `Building ${what} in three dimensions`, true]
    ]) {
      const el = document.getElementById(id);
      if (!el) continue;
      // Only the room walks its outline on, so only the room's plan has a wait
      // worth naming. A staircase plan is four lines and is there already.
      const span = el.querySelector('span');
      if (span && show) span.textContent = text;
      el.hidden = !show;
    }
  };
  // Each drawing puts its own notice away as it finishes, so neither waits on
  // the other and neither is guessed at with a timer.
  solid.onBuilt(() => { const e = document.getElementById('solidbuild'); if (e) e.hidden = true; });
  view.onLaidOut(() => { const e = document.getElementById('planbuild'); if (e) e.hidden = true; });

  /** Put a staircase on the page: its numbers, its shape, its photograph. */
  function useStaircase(entry) {
    showBuilding(entry.room ? 'your room' : 'the staircase');
    // A traced room is a different kind of place, not a differently sized
    // staircase, so it replaces the model rather than editing it.
    app.room = entry.room || null;
    app.floor = entry.floor || null;
    app.walls = entry.walls !== false;
    app.ceiling = entry.ceiling || 96;
    if (app.room) {
      STAIRCASE.label = entry.name;
      solid.setSkin(null);
      // A saved room brings its own photograph. Falling straight through to the
      // loose one dressed every saved room in whichever frame was measured last.
      if (entry.photo) solid.setSkin(entry.photo);
      else try {
        const sk = localStorage.getItem('elbowroom.photo');
        if (sk) solid.setSkin(sk);
      } catch { /* no skin kept */ }
      try { localStorage.setItem(ACTIVE, entry.id); } catch { /* private mode */ }
      // Stand it in the middle of the room to begin with.
      const xs = app.room.map(p => p.x), ys = app.room.map(p => p.y);
      view.update({ pos: { x: (Math.min(...xs) + Math.max(...xs)) / 2,
                           y: (Math.min(...ys) + Math.max(...ys)) / 2 }, angle: 0 });
      app.sync();
      renderPicker();
      return 1;
    }

    // Back to the model as shipped, then apply whatever this one overrides, so
    // switching never leaves a previous staircase's numbers behind.
    for (const [path, spec] of Object.entries(BASE)) {
      let t = app.stairModel;
      const keys = path.split('.');
      for (const k of keys.slice(0, -1)) t = t[k];
      Object.assign(t[keys[keys.length - 1]], spec);
    }
    STAIRCASE.label = BASE_LABEL;
    solid.setSkin(null);

    let n = 0;
    const readings = { ...(entry.readings || {}), ...(entry.counts || {}) };
    for (const [field, inches] of Object.entries(readings)) {
      if (typeof inches !== 'number' || !isFinite(inches) || inches <= 0) continue;
      const counted = /treads$/.test(field);
      if (app.setStairMeasurement(field, counted ? Math.round(inches) : inches,
          counted ? 'Counted on your own staircase.'
                  : 'Measured from your own photograph on /measure.')) n++;
    }
    if (n) STAIRCASE.label = entry.name;
    app.stair = plain(STAIRCASE);
    view.state.a = app.stairModel.turn.widthA.value;
    view.state.b = app.stairModel.turn.widthB.value;

    if (entry.photo) solid.setSkin(entry.photo);
    else if (entry.id === '__working') {
      try { const sk = localStorage.getItem('elbowroom.photo'); if (sk) solid.setSkin(sk); }
      catch { /* no skin kept */ }
    }
    try { localStorage.setItem(ACTIVE, entry.id); } catch { /* private mode */ }
    app.sync();
    renderPicker();
    return n;
  }

  function renderPicker() {
    const el = document.getElementById('picker');
    if (!el) return;
    const active = (() => { try { return localStorage.getItem(ACTIVE) || ''; } catch { return ''; } })();
    const list = staircases();
    el.innerHTML = '';
    for (const x of list) {
      const row = document.createElement('div');
      row.className = 'row';
      const b = document.createElement('button');
      b.className = 'pick';
      b.type = 'button';
      b.setAttribute('aria-current', String(x.id === active));
      b.innerHTML = `${x.name.replace(/</g, '&lt;')}<small>${x.note}</small>`;
      b.onclick = () => useStaircase(x);
      row.appendChild(b);
      if (!x.fixed) {
        const d = document.createElement('button');
        d.className = 'drop';
        d.type = 'button';
        d.textContent = 'remove';
        d.title = `Forget ${x.name}`;
        d.onclick = () => {
          // Three kinds of thing live in this list and each is thrown away
          // differently. The loose room and the loose readings used to have no
          // remove button at all, so a stitched floor from a mis-set reference
          // sat at the top of the picker with no way to be rid of it.
          try {
            if (x.id === '__room') {
              localStorage.removeItem('elbowroom.room');
              localStorage.removeItem('elbowroom.photo');
            } else if (x.id === '__working') {
              localStorage.removeItem('elbowroom.staircase');
              localStorage.removeItem('elbowroom.object');
              localStorage.removeItem('elbowroom.photo');
            } else {
              const rest = (readJson('elbowroom.sessions', []) || []).filter(s => s.name !== x.name);
              localStorage.setItem('elbowroom.sessions', JSON.stringify(rest));
              indexedDB.open('elbowroom', 1).onsuccess = e => {
                const db = e.target.result;
                if (db.objectStoreNames.contains('frames')) {
                  db.transaction('frames', 'readwrite').objectStore('frames').delete(x.name);
                }
              };
            }
          } catch { /* private mode, nothing was kept to remove */ }
          if (active === x.id) {
            // Back to the demo staircase, and clear what the removed one was
            // wearing, or its photograph stayed on the walls of mine.
            try { localStorage.setItem(ACTIVE, ''); } catch { /* none */ }
            solid.setSkin(null);
            const el = document.getElementById('mine');
            if (el) el.hidden = true;
            useStaircase(staircases()[0]);
          } else renderPicker();
        };
        row.appendChild(d);
      }
      el.appendChild(row);
    }
    // A room is not a staircase, and the page said "turn", "shaft" and "which
    // staircase" over the top of somebody's living room in three places at once.
    const isRoom = !!(list.find(x => x.id === active) || list[0]).room;
    const say = (id, text) => { const e = document.getElementById(id); if (e) e.textContent = text; };
    say('planlabel', isRoom ? 'Plan · looking down on the floor'
                            : 'Plan · looking down on the turn');
    const noWalls = isRoom && (list.find(x => x.id === active) || list[0]).walls === false;
    say('solidlabel', !isRoom ? 'The shaft · drag to orbit, scroll to zoom'
                     : noWalls ? 'Your floor · drag to orbit, scroll to zoom'
                     : 'The room · drag to orbit, scroll to zoom');
    say('placeshead', isRoom ? 'Which place' : 'Which staircase');
    const cur = list.find(x => x.id === active) || list[0];
    const tagEl = document.getElementById('tag');
    if (tagEl) {
      if (tagEl.dataset.stairs === undefined) tagEl.dataset.stairs = tagEl.textContent;
      tagEl.textContent = !isRoom ? tagEl.dataset.stairs
        : cur.walls === false
          ? 'Your own floor, stitched out of your video frames and laid out in real inches.'
          : 'Before you buy it, find out whether it fits. A room traced from your own photograph.';
    }
    // The "this is your staircase" banner belongs to a staircase. Left up over
    // a stitched floor it announced readings that have nothing to do with what
    // is on screen.
    const mineEl = document.getElementById('mine');
    if (mineEl && isRoom) mineEl.hidden = true;

    const sw = document.getElementById('switch');
    if (sw) {
      const on = list.find(x => x.id === active) || list[0];
      sw.style.color = '';
      if (!on.id) {
        sw.textContent = 'The staircase this app was built for. Measure your own to add it here.';
      } else if (on.room && on.walls === false) {
        sw.textContent = 'Your own floor, warped out of ' +
          `${on.floor ? on.floor.frames : 'several'} video frames into one picture taken from ` +
          'straight above, in real inches. There are no walls here because none were traced: ' +
          'only the floor can be stitched from photographs of a floor. Trace the outline on ' +
          'the measure page to put walls round it.';
      } else if (on.room) {
        sw.textContent = 'A room traced from your own photograph' +
          (on.floor ? ', with its floor stitched from your video frames' : '') +
          '. The verdict below is about fitting inside it, not carrying something up a flight.';
      } else if (on.measured === 0) {
        sw.style.color = 'var(--pinch)';
        sw.textContent = `${on.name} has no measurements in it, so this is the default shape ` +
          `wearing your photograph. Go back to Measure yours, take a reading, press Save this ` +
          `reading, then save the staircase again.`;
      } else if (on.measured > 0 && on.measured < 3) {
        // One or two readings leave most of the shaft at my numbers, and the
        // page said "everything below is computed from this one" anyway, which
        // is how a hallway video ended up looking like my basement.
        sw.style.color = 'var(--pinch)';
        sw.textContent = `${on.name} has ${on.measured} reading` +
          `${on.measured === 1 ? '' : 's'} in it out of the seven that decide a staircase's ` +
          `shape, so what you are looking at is still mostly the demo staircase wearing your ` +
          `number. Measure the clear width, both spans of the turn, the headroom, the rise and ` +
          `the going to make it yours. If what you filmed was a room rather than a staircase, ` +
          `trace its floor on the measure page instead.`;
      } else {
        sw.textContent = 'Everything below is computed from this one. Kept in this browser only.';
      }
    }
  }

  showBuilding('the staircase');

  const onMine = new URLSearchParams(location.search).has('mine');
  const mine = loadMine();
  const carried = loadObject();
  if (mine || carried) app.sync();
  if (onMine) {
    // Send to planner names the one it means, and that beats guessing. Without
    // this, arriving from a named session landed on the loose working copy and
    // the row you clicked was not the row that opened.
    let asked = '';
    try { asked = localStorage.getItem(ACTIVE) || ''; } catch { asked = ''; }
    const named = asked.startsWith('saved:') && staircases().find(x => x.id === asked);
    if (named) {
      useStaircase(named);
    } else {
      // A traced room is the more specific thing you just made, so it wins over
      // loose readings when both arrive together.
      const hasRoom = staircases().some(x => x.id === '__room');
      try { localStorage.setItem(ACTIVE, hasRoom ? '__room' : '__working'); } catch { /* none */ }
      const pickThis = staircases().find(x => x.id === (hasRoom ? '__room' : '__working'));
      if (pickThis && pickThis.room) useStaircase(pickThis);
    }
  }
  else {
    // Whatever was chosen last, so the planner opens where you left it.
    let want = '';
    try { want = localStorage.getItem(ACTIVE) || ''; } catch { want = ''; }
    const found = staircases().find(x => x.id === want);
    if (found && found.id) useStaircase(found);
  }
  renderPicker();
  // A newly arrived object has to be parked for its own size. Without this it
  // sat where the previous object had been parked, so Reset, which parks
  // correctly, appeared to move it somewhere new.
  if (carried) view.park();
  // Only when nothing arrived from the measure page, which is a deliberate act
  // and should win over whatever was last on the canvas.
  if (!carried) restoreBench();
  if (carried) {
    const el = document.getElementById('mine');
    if (el) {
      el.hidden = false;
      const parts = [];
      if (carried.L) parts.push(`${ft(carried.L)} long`);
      if (carried.D) parts.push(`${ft(carried.D)} deep`);
      if (carried.H) parts.push(`${ft(carried.H)} high`);
      el.innerHTML = (mine ? el.innerHTML + '<br><br>' : '') +
        `<strong>${carried.label}</strong> was measured from your photograph too, ` +
        `${parts.join(', ')}. It is on the canvas now.`;
    }
  }
  registerTools(app);
}
