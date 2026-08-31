/**
 * Elbow Room: the geometry that decides whether an object can get up a staircase.
 *
 * Nothing here knows about the DOM, WebMCP, or the UI. It is pure functions over
 * inches and degrees so it can be unit tested and so the agent's tools and the
 * human's drag handles both call exactly the same code.
 *
 * Units: inches and degrees throughout. Angles internally in radians.
 */

import { ft, ftShort } from './units.js';

const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ *
 * 1. The corner
 * ------------------------------------------------------------------ */

/**
 * Longest rigid object of a given width that can be carried around a
 * right-angled turn between corridors of clear width `a` and `b`.
 *
 * This is the rectangle form of the classic ladder-around-a-corner problem.
 * With the object's long axis at angle t to one corridor, the length that
 * just touches the outer walls and the inner corner is
 *
 *     L(t) = a/sin(t) + b/cos(t) - w/(sin(t)cos(t))
 *
 * The object fits if and only if its length is under the *minimum* of that
 * curve, because it has to pass through every angle on the way round. The
 * minimum is the pinch point, and it is nowhere near either extreme, which
 * is precisely why nobody can eyeball this.
 *
 * Returns Infinity when the object is too wide to be in the corridor at all,
 * which the caller should have already rejected.
 */
export function cornerMaxLength({ widthA, widthB, objectWidth }) {
  if (objectWidth >= widthA || objectWidth >= widthB) {
    return { maxLength: 0, pinchAngle: NaN, tooWide: true };
  }

  let best = Infinity;
  let bestAngle = 45;

  // Sweep, then refine. The curve is smooth and unimodal in (0, 90).
  for (let deg = 1; deg <= 89; deg += 1) {
    const L = cornerLengthAtAngle(widthA, widthB, objectWidth, deg * DEG);
    if (L > 0 && L < best) { best = L; bestAngle = deg; }
  }
  for (let deg = bestAngle - 1; deg <= bestAngle + 1; deg += 0.01) {
    if (deg <= 0 || deg >= 90) continue;
    const L = cornerLengthAtAngle(widthA, widthB, objectWidth, deg * DEG);
    if (L > 0 && L < best) { best = L; bestAngle = deg; }
  }

  return { maxLength: best, pinchAngle: bestAngle };
}

function cornerLengthAtAngle(a, b, w, t) {
  const s = Math.sin(t), c = Math.cos(t);
  return a / s + b / c - w / (s * c);
}

/* ------------------------------------------------------------------ *
 * 2. The tilt
 * ------------------------------------------------------------------ */

/**
 * On stairs you do not carry a long object flat. You tilt it, which trades
 * horizontal length for vertical height. An object of length L tilted by
 * angle p presents only L*cos(p) in plan, which is what has to get round the
 * corner, while needing L*sin(p) + thickness*cos(p) of vertical room.
 *
 * The soffit over a winder turn is what caps p, and on this staircase the
 * soffit sits directly over the turn: the one place you need to tilt is the
 * one place the ceiling comes down.
 *
 * Returns the largest tilt the headroom allows, in degrees.
 */
export function maxTilt({ headroom, objectLength, objectThickness }) {
  // Need the smallest p with L*sin(p) + d*cos(p) <= headroom, maximised.
  // Solve by sweep; the expression is monotonic enough over 0..90 for this.
  let best = 0;
  for (let deg = 0; deg <= 90; deg += 0.25) {
    const p = deg * DEG;
    const needed = objectLength * Math.sin(p) + objectThickness * Math.cos(p);
    if (needed <= headroom) best = deg; else break;
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * 3. The verdict
 * ------------------------------------------------------------------ */

/**
 * @param {object} object  { length, width, height } in inches, any orientation
 * @param {object} stair   see model.js for the shape
 * @returns {{ verdict, reasons, margin, advice }}
 */
export function checkPath(object, stair) {
  const reasons = [];
  const dims = [object.length, object.width, object.height].sort((x, y) => y - x);
  const [len, mid, thin] = dims;

  // --- doorways: the object may present its two smallest faces ---
  for (const door of stair.doors) {
    const fits = thin < door.width && mid < door.height ||
                 thin < door.height && mid < door.width;
    if (!fits) {
      reasons.push({
        stage: door.name,
        pass: false,
        detail: `Smallest cross section is ${ft(mid)} by ${ft(thin)}. ` +
                `The opening is ${ft(door.width)} by ${ft(door.height)}.`
      });
    } else {
      reasons.push({ stage: door.name, pass: true,
        detail: `${ft(mid)} by ${ft(thin)} clears a ${ft(door.width)} by ${ft(door.height)} opening.` });
    }
  }

  // --- the straight run: only the cross section has to fit the width ---
  if (thin >= stair.clearWidth) {
    reasons.push({ stage: 'straight run', pass: false,
      detail: `Even on its narrowest face the object is ${ft(thin)} across. ` +
              `The run is ${ft(stair.clearWidth)} wall to stringer.` });
  } else {
    reasons.push({ stage: 'straight run', pass: true,
      detail: `${ft(thin)} across clears the ${ft(stair.clearWidth)} run.` });
  }

  // --- the turn ---
  //
  // Two things are free to choose and both matter, so try both rather than
  // assuming. First, which of the two cross dimensions goes flat in plan and
  // which stands vertical: you turn a mattress on its side so the 12 in edge
  // goes round the corner and the 60 in face goes up. Second, how far to tilt
  // the long axis, which trades plan length for headroom.
  //
  // Tilted by p, the object presents  len*cos(p) + vert*sin(p)  in plan, not
  // len*cos(p). Standing something on end does not make it disappear from the
  // floor; it leaves its own thickness behind.
  const orientations = [
    { planWidth: thin, vert: mid,  name: 'on its side' },
    { planWidth: mid,  vert: thin, name: 'flat' }
  ];

  let best = null;
  for (const o of orientations) {
    if (o.vert > stair.turn.headroom) continue;      // will not stand up at all
    const corner = cornerMaxLength({
      widthA: stair.turn.widthA, widthB: stair.turn.widthB, objectWidth: o.planWidth
    });
    const ceiling = maxTilt({
      headroom: stair.turn.headroom, objectLength: len, objectThickness: o.vert
    });

    // plan(p) = len*cos(p) + vert*sin(p) rises to a maximum at atan(vert/len)
    // and falls after it, so over [0, ceiling] the minimum is always at one end
    // or the other. Tilting a little is worse than not tilting at all, which is
    // exactly the trap that made a queen mattress score worse than a king.
    const plan = p => len * Math.cos(p * DEG) + o.vert * Math.sin(p * DEG);
    const tilt = plan(ceiling) < plan(0) ? ceiling : 0;
    const planLength = plan(tilt);

    const slack = corner.maxLength - planLength;
    if (!best || slack > best.slack) best = { ...o, corner, tilt, planLength, slack };
  }

  if (!best) {
    reasons.push({ stage: 'winder turn', pass: false,
      detail: `Neither cross section fits under the ${ft(stair.turn.headroom)} of headroom over the turn.` });
  } else {
    reasons.push({
      stage: 'winder turn',
      pass: best.slack >= 0,
      detail: best.slack >= 0
        ? `Carried ${best.name} and tilted ${best.tilt.toFixed(0)} degrees it presents ` +
          `${ft(best.planLength)} in plan, inside the ${ft(best.corner.maxLength)} ` +
          `the turn allows at its pinch point (${best.corner.pinchAngle.toFixed(0)} degrees through the corner). ` +
          `${ft(best.slack)} to spare.`
        : `Best case is ${best.name}, tilted ${best.tilt.toFixed(0)} degrees, which still presents ` +
          `${ft(best.planLength)} in plan. The turn allows ${ft(best.corner.maxLength)} ` +
          `at its pinch point. Short by ${ftShort(best.slack)}.`
    });
  }

  // "Goes" and "goes without touching anything" are different answers, and the
  // difference is what costs people their walls. A 279 litre water heater came
  // down this staircase with plenty of room in plan and still gouged the
  // soffit, because nobody carries furniture along the ideal path. Under a foot
  // of margin, say so.
  const TIGHT = 12;
  if (best && best.slack >= 0 && best.slack < TIGHT) {
    reasons.push({
      stage: 'clearance',
      pass: true,
      tight: true,
      detail: `It fits, but only by ${ft(best.slack)}. At that margin it will touch the walls ` +
              `unless they are protected and the carry is slow.`
    });
  }

  const failures = reasons.filter(r => !r.pass);

  return {
    verdict: failures.length === 0
      ? (best && best.slack < TIGHT ? 'goes, tight' : 'goes')
      : 'does not go',
    tight: !!(best && best.slack >= 0 && best.slack < TIGHT),
    reasons,
    margin: best ? best.slack : -Infinity,
    tiltUsed: best ? best.tilt : 0,
    orientation: best ? best.name : null,
    advice: failures.length && best
      ? suggest(object, stair, best.corner, best.tilt, best.planWidth, best.vert, len) : []
  };
}

/**
 * What a mover would actually try next. Each of these is a real intervention
 * with a real number attached, not a platitude.
 */
function suggest(object, stair, flat, tilt, thin, mid, len) {
  const out = [];

  if (object.feetHeight) {
    const without = cornerMaxLength({
      widthA: stair.turn.widthA, widthB: stair.turn.widthB,
      objectWidth: mid - object.feetHeight
    });
    if (without.maxLength > flat.maxLength) {
      out.push(`Taking the feet off drops the width by ${ft(object.feetHeight)} and buys ` +
               `${ft(without.maxLength - flat.maxLength)} through the turn.`);
    }
  }

  const doorLeaf = stair.doors.find(d => d.removable);
  if (doorLeaf) {
    out.push(`Pulling the ${doorLeaf.name} off its hinges widens that opening by about ` +
             `${ft(doorLeaf.leafThickness || 1.75)} and clears the swing entirely.`);
  }

  const needed = len * Math.cos(tilt * DEG) - flat.maxLength;
  if (needed > 0) {
    const headroomNeeded = headroomFor(len, thin, flat.maxLength);
    if (headroomNeeded && headroomNeeded > stair.turn.headroom) {
      out.push(`To tilt it far enough you would need ${ft(headroomNeeded)} of headroom ` +
               `over the turn. There is ${ft(stair.turn.headroom)}.`);
    }
  }

  return out;
}

function headroomFor(len, thin, allowedPlan) {
  const p = Math.acos(Math.min(1, allowedPlan / len));
  return len * Math.sin(p) + thin * Math.cos(p);
}
