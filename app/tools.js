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

function reply(text) {
  const t = text.length > OUTPUT_CAP ? text.slice(0, OUTPUT_CAP - 1) + '…' : text;
  return { content: [{ type: 'text', text: t }] };
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
    execute: async () => reply(
      `${app.current.label}: ${app.dims.length} x ${app.dims.depth} x ${app.dims.height} in ` +
      `(${ft(app.dims.length)} long). Door leaf ${app.doorRemoved ? 'removed' : 'in place'}.`
    )
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
    execute: async ({ length_in, depth_in, height_in }) => {
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
  });

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
    execute: async ({ depth_in }) => {
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
    execute: async ({ length_in, depth_in, height_in, label }) => {
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
      'Move the object to the exact point in the turn where it jams, and leave it there. Use this ' +
      'instead of describing the problem: the person can see the collision on the canvas.',
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
    execute: async ({ x_in, y_in, angle_deg }) => {
      app.place({ x: x_in, y: y_in, angle: angle_deg });
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
          enum: ['clearWidth', 'turn.widthA', 'turn.widthB', 'turn.headroom']
        },
        inches: { type: 'number', description: 'The reading, in inches.' }
      },
      required: ['field', 'inches']
    },
    execute: async ({ field, inches }, second) => {
      if (second && typeof second.requestUserInteraction === 'function') {
        try { await second.requestUserInteraction(); } catch { /* fall through to the in-page ask */ }
      }
      const ok = await askHuman(`Record ${field} as ${ft(inches)}? This changes every verdict.`);
      if (!ok) return reply('The person declined. Nothing was changed.');
      app.setStairMeasurement(field, inches, 'Confirmed by the person at the keyboard.');
      return reply(`${field} is now ${ft(inches)} and marked as measured. ` +
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
