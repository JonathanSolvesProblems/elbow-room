/**
 * The WebMCP surface.
 *
 * Design rules taken from Chrome's own best-practices and tool-security guides,
 * because they are not arbitrary and because following them is the difference
 * between a tool an agent uses well and one it fumbles:
 *
 *   - One function per tool. No god-tool with a mode parameter.
 *   - Accept raw input. Never make the model do arithmetic. The whole reason
 *     this app exists is that eyeballing a winder turn does not work, so asking
 *     the model to estimate it would defeat the point. It passes inches; the
 *     page runs the ladder-around-a-corner solve.
 *   - Budgets: names under 30 characters, descriptions under 500, parameter
 *     descriptions under 150, and every output capped at 1.5K so a long reply
 *     cannot blow out the agent's context.
 *   - readOnlyHint on everything that only reads, so the agent knows what is
 *     safe to try and what deserves a confirmation.
 *   - untrustedContentHint on anything echoing text a person typed.
 *   - Every write updates the canvas. When the agent moves the couch you watch
 *     it move, because there is one code path and one couch.
 *   - Tools appear and disappear with the state that makes them meaningful,
 *     rather than sitting in the context window being irrelevant.
 */

import { ft } from './units.js';

const OUTPUT_CAP = 1500;

/**
 * The one origin allowed to ask this staircase anything.
 *
 * Cross-origin tool sharing is dual consent and this is our half of it: the
 * shop is named here explicitly, and it must still ask for us by name through
 * getTools({ fromOrigins }). Only check_fit is shared, it is read-only, and it
 * answers a yes-or-no question. The shop never learns the measurements, never
 * sees the plan, and cannot move anything.
 *
 * This is the part of WebMCP that is actually about the *open* web: two sites
 * that have no API, no SDK and no account with each other, cooperating because
 * both sides said yes.
 */
const PARTNER_ORIGINS = ['https://halliwell-and-co.vercel.app'];

function reply(text) {
  const t = text.length > OUTPUT_CAP ? text.slice(0, OUTPUT_CAP - 1) + '…' : text;
  return { content: [{ type: 'text', text: t }] };
}

/**
 * Check the numbers before doing geometry with them.
 *
 * A model will sometimes omit a required argument, or send "91" as a string,
 * or send a negative depth. Without this the arithmetic still runs and the tool
 * answers confidently in nonsense: "at n/a deep the longest is n/a", or a
 * verdict of "it does not go" computed from undefined. A wrong answer stated
 * plainly is worse than no answer, so say exactly what is missing and let the
 * agent try again.
 *
 * Returns a corrected object of numbers, or a string describing the problem.
 */
function inches(args, names, { min = 0.1, max = 600 } = {}) {
  const out = {};
  const bad = [];
  for (const n of names) {
    const v = typeof args[n] === 'string' ? Number(args[n].trim()) : args[n];
    if (v === undefined || v === null || v === '') bad.push(`${n} is missing`);
    else if (!Number.isFinite(v)) bad.push(`${n} is not a number`);
    else if (v < min) bad.push(`${n} must be at least ${min} in, got ${v}`);
    else if (v > max) bad.push(`${n} of ${v} in is larger than any house, in inches please`);
    else out[n] = v;
  }
  return bad.length ? bad.join('. ') + '. Give every dimension in inches.' : out;
}

/** Tools registered only while the current object fails. */
let remedyController = null;

export function registerTools(app) {
  const mc = document.modelContext;
  if (!mc || typeof mc.registerTool !== 'function') {
    document.body.dataset.webmcp = 'absent';
    return { ok: false, reason: 'no document.modelContext in this browser' };
  }
  document.body.dataset.webmcp = 'present';

  const R = { readOnlyHint: true };
  const reg = (cfg, opts) => mc.registerTool(cfg, opts);

  /* ---------------------------------------------------------------- *
   * Reads
   * ---------------------------------------------------------------- */

  reg({
    name: 'describe_staircase',
    description:
      'Report the measured geometry of the staircase: clear width of the run, the two widths at ' +
      'the turn, headroom under the soffit, and the openings. Says which figures were measured ' +
      'and which are still placeholders, so a verdict is never quoted as firmer than its inputs.',
    inputSchema: { type: 'object', properties: {} },
    annotations: R,
    execute: async () => {
      // A traced room is a different place, and saying "a straight run rising
      // into 3 winder treads" about someone's living room would be a lie.
      if (app.room) {
        const { describe } = await import('./room.js');
        const d = describe(app.room, app.ceiling);
        return reply(
          `A room traced from a photograph, not a staircase. ${d.corners} corners, ` +
          `${ft(d.width)} across at its widest and ${ft(d.depth)} deep, ` +
          `${d.area.toFixed(1)} square feet of floor, ${ft(d.ceiling)} to the ceiling.
` +
          `Narrowest gap between walls: ${isFinite(d.narrowest) ? ft(d.narrowest) : 'none'}.
` +
          `Longest straight run that stays inside: ${ft(d.longest)}.
` +
          `The outline came from clicking the floor on one calibrated photograph. ` +
          `Nothing was stitched or reconstructed, so it is only as square as the clicks were.`
        );
      }
      const s = app.stairModel;
      const unknown = app.unknowns().map(u => u.field);
      return reply(
        `${s.label}. A straight run rising into ${s.turn.treads.value} winder treads that turn the ` +
        `flight through 90 degrees, then a doorway at the top. A soffit crosses above the turn.\n` +
        `Clear width of run: ${ft(s.clearWidth.value)} (measured).\n` +
        `Turn: ${ft(s.turn.widthA.value)} by ${ft(s.turn.widthB.value)}, ` +
        `headroom ${ft(s.turn.headroom.value)}.\n` +
        `Door at top: ${ft(s.doors[0].width.value)} by ${ft(s.doors[0].height.value)}.\n` +
        (unknown.length
          ? `Still provisional, not measured: ${unknown.join(', ')}.`
          : 'Every figure has been measured.')
      );
    }
  });

  reg({
    name: 'list_objects',
    description:
      'List the things available to test against this staircase, with their real dimensions in ' +
      'inches. Includes the couch this house actually failed to move, and standard items such as ' +
      'mattresses and sheet goods whose sizes are published rather than guessed.',
    inputSchema: { type: 'object', properties: {} },
    annotations: R,
    execute: async () => reply(
      app.catalogue.map(c =>
        `${c.id}: ${c.label}, ${c.length.value} x ${c.depth.value} x ${c.height.value} in ` +
        `(${ft(c.length.value)} long)`).join('\n')
    )
  });

  reg({
    name: 'get_current_object',
    description:
      'Report what is currently on the canvas: which object, its dimensions, where it sits and at ' +
      'what angle. Use this to see what the person at the keyboard has already set up before ' +
      'changing anything.',
    inputSchema: { type: 'object', properties: {} },
    annotations: R,
    execute: async () => {
      // The description has always promised where it sits and at what angle,
      // and the reply left both out, so an agent asking this got less than it
      // was told to expect and no way to see the effect of place_object.
      const p = app.pose();
      return reply(
        `${app.current.label}: ${app.dims.length} x ${app.dims.depth} x ${app.dims.height} in ` +
        `(${ft(app.dims.length)} long). Door leaf ${app.doorRemoved ? 'removed' : 'in place'}.\n` +
        `Sitting at x ${p.x.toFixed(1)} in, y ${p.y.toFixed(1)} in from the outer corner, ` +
        `turned ${p.angle.toFixed(0)} degrees.`
      );
    }
  });

  reg({
    name: 'check_fit',
    description:
      'Decide whether an object of the given dimensions can physically travel up this staircase. ' +
      'Checks the doorway, the straight run, and the winder turn, choosing the best orientation ' +
      'and tilt for you. Returns which stage fails and by how much. Pass raw inches; all the ' +
      'geometry is done here.',
    inputSchema: {
      type: 'object',
      properties: {
        length_in: { type: 'number', description: 'Longest dimension in inches.' },
        depth_in:  { type: 'number', description: 'Second dimension in inches.' },
        height_in: { type: 'number', description: 'Third dimension in inches.' }
      },
      required: ['length_in', 'depth_in', 'height_in']
    },
    annotations: R,
    execute: async (args) => {
      const v = inches(args, ['length_in', 'depth_in', 'height_in']);
      if (typeof v === 'string') return reply(v);
      const { length_in, depth_in, height_in } = v;
      const { checkPath } = await import('./geometry.js');
      const r = checkPath(
        { length: length_in, width: depth_in, height: height_in },
        app.effectiveStair()
      );
      return reply(
        `${r.verdict === 'goes' ? 'It goes.' : 'It does not go.'}\n` +
        r.reasons.map(x => `${x.pass ? 'OK' : 'FAILS'} at the ${x.stage}. ${x.detail}`).join('\n') +
        (r.advice.length ? '\nWorth trying: ' + r.advice.join(' ') : '')
      );
    }
  }, { exposedTo: PARTNER_ORIGINS });

  reg({
    name: 'longest_that_fits',
    description:
      'For an object of a given depth, report the longest it could be and still get round the ' +
      'turn, and the angle at which the corner pinches. This is the number that decides whether ' +
      'a piece of furniture is worth buying.',
    inputSchema: {
      type: 'object',
      properties: {
        depth_in: { type: 'number', description: 'Depth presented to the corner, in inches.' }
      },
      required: ['depth_in']
    },
    annotations: R,
    execute: async (args) => {
      const v = inches(args, ['depth_in']);
      if (typeof v === 'string') return reply(v);
      const { depth_in } = v;
      const c = app.longestAt(depth_in);
      if (c.tooWide) return reply(
        `Nothing. At ${ft(depth_in)} deep it is wider than the ${ft(app.stair.clearWidth)} run, ` +
        `so it cannot enter the stairwell at any length.`);
      return reply(
        `At ${ft(depth_in)} deep, the longest that gets round is ${ft(c.maxLength)}. ` +
        `The corner pinches at ${c.pinchAngle.toFixed(0)} degrees through the turn.`);
    }
  });

  reg({
    name: 'list_unknowns',
    description:
      'List the measurements that are still placeholders rather than tape readings, and say why ' +
      'each matters. Call this before presenting a verdict as certain.',
    inputSchema: { type: 'object', properties: {} },
    annotations: R,
    execute: async () => {
      const u = app.unknowns();
      if (!u.length) return reply('Every figure has been measured.');
      return reply(u.map(x => `${x.field}: ${x.note}`).join('\n'));
    }
  });

  /* ---------------------------------------------------------------- *
   * Writes. Each one moves something the person can see.
   * ---------------------------------------------------------------- */

  reg({
    name: 'select_object',
    description:
      'Put one of the catalogue objects on the canvas. The drawing updates immediately, so the ' +
      'person watching sees the change as you make it.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Catalogue id from list_objects.',
          enum: app.catalogue.map(c => c.id)
        }
      },
      required: ['id']
    },
    execute: async ({ id }) => {
      const item = app.select(id);
      if (!item) return reply(`No object called ${id}.`);
      const r = app.verdict();
      return reply(`${item.label} is on the canvas, ${ft(app.dims.length)} long. ${r.verdict === 'goes' ? 'It goes.' : 'It does not go.'}`);
    }
  });

  reg({
    name: 'set_dimensions',
    description:
      'Put a custom object on the canvas by its measurements, for something not in the catalogue. ' +
      'Give raw inches straight off the tape.',
    inputSchema: {
      type: 'object',
      properties: {
        length_in: { type: 'number', description: 'Longest dimension in inches.' },
        depth_in:  { type: 'number', description: 'Second dimension in inches.' },
        height_in: { type: 'number', description: 'Third dimension in inches.' },
        label:     { type: 'string', description: 'What to call it on screen. Optional.' }
      },
      required: ['length_in', 'depth_in', 'height_in']
    },
    // The label is free text from a person, so mark the echo as untrusted.
    annotations: { untrustedContentHint: true },
    execute: async (args) => {
      const v = inches(args, ['length_in', 'depth_in', 'height_in']);
      if (typeof v === 'string') return reply(v);
      const { length_in, depth_in, height_in } = v;
      const { label } = args;
      app.setDims({
        length: length_in, depth: depth_in, height: height_in,
        label: label ? String(label).slice(0, 40) : 'Custom object'
      });
      const r = app.verdict();
      return reply(`On the canvas at ${ft(length_in)} by ${ft(depth_in)} by ${ft(height_in)}. ` +
                   `${r.verdict === 'goes' ? 'It goes.' : 'It does not go.'}`);
    }
  });

  reg({
    name: 'show_pinch',
    description:
      'Move the object to the tightest point of the turn and leave it there. For something that ' +
      'does not fit, that is where it jams. For something that does, it is the worst place on the ' +
      'route and shows how little room is left. Use this instead of describing it.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const r = app.showPinch();
      return reply(r.goes
        ? `Parked at the tightest point of the turn. It clears, with ${ft(r.maxLength - app.dims.length)} to spare.`
        : `Parked where it jams, at ${r.pinchAngle.toFixed(0)} degrees through the turn. ` +
          `The corner allows ${ft(r.maxLength)}; this is ${ft(app.dims.length)}.`);
    }
  });

  reg({
    name: 'place_object',
    description:
      'Move or rotate the object on the plan by hand, in inches and degrees from the outer corner. ' +
      'For walking through a specific position rather than jumping to the pinch point.',
    inputSchema: {
      type: 'object',
      properties: {
        x_in:      { type: 'number', description: 'Centre position along the lower arm, inches.' },
        y_in:      { type: 'number', description: 'Centre position up the vertical arm, inches.' },
        angle_deg: { type: 'number', description: 'Rotation in degrees, 0 is along the lower arm.' }
      }
    },
    execute: async (args) => {
      // Every field here is optional, so take the ones that are real numbers
      // and leave the rest alone rather than writing NaN into the plan.
      const move = {};
      for (const [k, f] of [['x_in', 'x'], ['y_in', 'y'], ['angle_deg', 'angle']]) {
        const n = typeof args[k] === 'string' ? Number(args[k].trim()) : args[k];
        if (Number.isFinite(n)) move[f] = n;
      }
      if (!Object.keys(move).length) {
        return reply('Nothing to move by. Give at least one of x_in, y_in or angle_deg as a number.');
      }
      app.place(move);
      return reply('Moved.');
    }
  });

  reg({
    name: 'remove_door_leaf',
    description:
      'Take the door at the top off its hinges, or put it back. Worth about two inches of opening ' +
      'and it clears the swing, which is the first thing any mover tries.',
    inputSchema: {
      type: 'object',
      properties: { removed: { type: 'boolean', description: 'True to take it off, false to rehang.' } },
      required: ['removed']
    },
    execute: async ({ removed }) => {
      if (typeof removed === 'string') removed = !/^(false|no|0)$/i.test(removed.trim());
      if (typeof removed !== 'boolean') return reply('Say removed: true to take it off, false to rehang.');
      app.setDoorRemoved(removed);
      const r = app.verdict();
      return reply(`Door leaf ${removed ? 'removed' : 'rehung'}. ` +
                   `${r.verdict === 'goes' ? 'It goes now.' : 'Still does not go.'}`);
    }
  });

  reg({
    name: 'reset_canvas',
    description: 'Put everything back to the starting state: first catalogue object, door rehung.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => { app.reset(); return reply('Reset.'); }
  });

  /* ---------------------------------------------------------------- *
   * Consequential: changing a measurement changes every verdict, so a
   * person has to agree to it.
   * ---------------------------------------------------------------- */

  reg({
    name: 'record_measurement',
    description:
      'Write a tape reading into the staircase model, replacing a placeholder. This changes every ' +
      'verdict the app gives, so the person at the keyboard is asked to confirm it before it takes ' +
      'effect. Only use it for a figure someone has actually measured.',
    inputSchema: {
      type: 'object',
      properties: {
        field:  {
          type: 'string',
          description: 'Which measurement.',
          enum: ['clearWidth', 'turn.widthA', 'turn.widthB', 'turn.headroom',
                 'run.rise', 'run.going', 'run.treads', 'turn.treads']
        },
        inches: { type: 'number', description: 'The reading, in inches.' }
      },
      required: ['field', 'inches']
    },
    execute: async (args, second) => {
      const field = args.field;
      const v = inches(args, ['inches'], { min: 1, max: 240 });
      if (typeof v === 'string') return reply(v);
      const inchesValue = v.inches;
      if (!['clearWidth', 'turn.widthA', 'turn.widthB', 'turn.headroom',
            'run.rise', 'run.going', 'run.treads', 'turn.treads'].includes(field)) {
        return reply('That is not a measurement this staircase keeps. ' +
                     'Use clearWidth, turn.widthA, turn.widthB, turn.headroom, run.rise, ' +
                     'run.going, run.treads or turn.treads.');
      }
      if (second && typeof second.requestUserInteraction === 'function') {
        try { await second.requestUserInteraction(); } catch { /* fall through to the in-page ask */ }
      }
      const ok = await askHuman(`Record ${field} as ${ft(inchesValue)}? This changes every verdict.`);
      if (!ok) return reply('The person declined. Nothing was changed.');
      app.setStairMeasurement(field, inchesValue, 'Confirmed by the person at the keyboard.');
      return reply(`${field} is now ${ft(inchesValue)} and marked as measured. ` +
                   `${app.unknowns().length} placeholder(s) left.`);
    }
  });

  /* ---------------------------------------------------------------- *
   * Dynamic: remedies exist only while there is something to remedy.
   * ---------------------------------------------------------------- */

  function syncRemedies() {
    const failing = app.verdict().verdict !== 'goes';
    if (failing && !remedyController) {
      remedyController = new AbortController();
      reg({
        name: 'try_without_feet',
        description:
          'Test the same object with its feet taken off, which is the cheapest way to buy width ' +
          'through a turn. Only offered while something is failing.',
        inputSchema: { type: 'object', properties: {} },
        annotations: R,
        execute: async () => {
          const foot = app.current.feetHeight || 4;
          const c = app.longestAt(app.dims.depth - foot);
          const before = app.longestAt(app.dims.depth);
          return reply(`Taking ${ft(foot)} off the depth moves the turn's allowance from ` +
                       `${ft(before.maxLength)} to ${ft(c.maxLength)}. ` +
                       `The object is ${ft(app.dims.length)}.`);
        }
      }, { signal: remedyController.signal });

      reg({
        name: 'how_short_to_fit',
        description:
          'Report how much shorter the object would have to be to get round the turn at its ' +
          'current depth. Only offered while something is failing.',
        inputSchema: { type: 'object', properties: {} },
        annotations: R,
        execute: async () => {
          const c = app.longestAt(app.dims.depth);
          const over = app.dims.length - c.maxLength;
          return reply(over <= 0
            ? 'It already fits.'
            : `It would have to lose ${ft(over)}. The turn allows ${ft(c.maxLength)} at ` +
              `${ft(app.dims.depth)} deep; this is ${ft(app.dims.length)}.`);
        }
      }, { signal: remedyController.signal });

    } else if (!failing && remedyController) {
      remedyController.abort();
      remedyController = null;
    }
  }

  app.onChange(syncRemedies);
  syncRemedies();

  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * The hand-back. Whether or not the browser implements
 * requestUserInteraction, the person still gets the pen.
 * ------------------------------------------------------------------ */

function askHuman(question) {
  return new Promise(resolve => {
    const box = document.createElement('div');
    box.className = 'ask';
    box.innerHTML = `<p>${question}</p>`;
    const yes = document.createElement('button'); yes.textContent = 'Yes, record it';
    const no  = document.createElement('button'); no.textContent  = 'No';
    box.append(yes, no);
    document.body.appendChild(box);
    yes.onclick = () => { box.remove(); resolve(true); };
    no.onclick  = () => { box.remove(); resolve(false); };
  });
}
