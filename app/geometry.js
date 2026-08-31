/**
 * Elbow Room: the geometry that decides whether an object can get up a staircase.
 *
 * Nothing here knows about the DOM, WebMCP, or the UI. It is pure functions over
 * inches and degrees so it can be unit tested and so the agent's tools and the
 * human's drag handles both call exactly the same code.
 *
 * Units: inches and degrees throughout. Angles internally in radians.
 */

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
        detail: `Smallest cross section is ${mid.toFixed(1)} by ${thin.toFixed(1)} in. ` +
                `The opening is ${door.width} by ${door.height} in.`
      });
    } else {
      reasons.push({ stage: door.name, pass: true,
        detail: `${mid.toFixed(1)} by ${thin.toFixed(1)} in clears a ${door.width} by ${door.height} in opening.` });
    }
  }

  // --- the straight run: only the cross section has to fit the width ---
  if (thin >= stair.clearWidth) {
    reasons.push({ stage: 'straight run', pass: false,
      detail: `Even on its narrowest face the object is ${thin.toFixed(1)} in across. ` +
              `The run is ${stair.clearWidth} in wall to stringer.` });
  } else {
    reasons.push({ stage: 'straight run', pass: true,
      detail: `${thin.toFixed(1)} in across clears the ${stair.clearWidth} in run.` });
  }

  // --- the turn, flat ---
  const flat = cornerMaxLength({
    widthA: stair.turn.widthA, widthB: stair.turn.widthB, objectWidth: mid
  });

  // --- the turn, tilted as far as the soffit allows ---
  const tilt = maxTilt({
    headroom: stair.turn.headroom, objectLength: len, objectThickness: thin
  });
  const planLength = len * Math.cos(tilt * DEG);

  const passesTurn = planLength <= flat.maxLength;
  reasons.push({
    stage: 'winder turn',
    pass: passesTurn,
    detail: passesTurn
      ? `Tilted ${tilt.toFixed(0)} degrees it presents ${planLength.toFixed(1)} in in plan, ` +
        `under the ${flat.maxLength.toFixed(1)} in the turn allows at its pinch point ` +
        `(${flat.pinchAngle.toFixed(0)} degrees through the corner).`
      : `The turn allows ${flat.maxLength.toFixed(1)} in at its pinch point. ` +
        `Tilted as far as the ${stair.turn.headroom} in of headroom permits (${tilt.toFixed(0)} degrees) ` +
        `it still presents ${planLength.toFixed(1)} in. Short by ${(planLength - flat.maxLength).toFixed(1)} in.`
  });

  const failures = reasons.filter(r => !r.pass);
  const margin = flat.maxLength - planLength;

  return {
    verdict: failures.length === 0 ? 'goes' : 'does not go',
    reasons,
    margin,
    tiltUsed: tilt,
    advice: failures.length ? suggest(object, stair, flat, tilt, thin, mid, len) : []
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
      out.push(`Taking the feet off drops the width by ${object.feetHeight} in and buys ` +
               `${(without.maxLength - flat.maxLength).toFixed(1)} in through the turn.`);
    }
  }

  const doorLeaf = stair.doors.find(d => d.removable);
  if (doorLeaf) {
    out.push(`Pulling the ${doorLeaf.name} off its hinges widens that opening by about ` +
             `${doorLeaf.leafThickness || 1.75} in and clears the swing entirely.`);
  }

  const needed = len * Math.cos(tilt * DEG) - flat.maxLength;
  if (needed > 0) {
    const headroomNeeded = headroomFor(len, thin, flat.maxLength);
    if (headroomNeeded && headroomNeeded > stair.turn.headroom) {
      out.push(`To tilt it far enough you would need ${headroomNeeded.toFixed(0)} in of headroom ` +
               `over the turn. There is ${stair.turn.headroom} in.`);
    }
  }

  return out;
}

function headroomFor(len, thin, allowedPlan) {
  const p = Math.acos(Math.min(1, allowedPlan / len));
  return len * Math.sin(p) + thin * Math.cos(p);
}
