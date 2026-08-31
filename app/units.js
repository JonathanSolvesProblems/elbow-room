/**
 * Inches are the internal unit because the geometry is easier without mixed
 * radices. Feet and inches are the display unit because that is how anyone
 * standing in a stairwell with a tape actually talks.
 *
 * The tape in the reference photographs carries both imperial and metric, which
 * is why the readings could be cross-checked: 91 in against 230 cm, 3F against
 * 90 cm. Both agreed, so the numbers are sound and only the presentation was
 * wrong.
 */

/** 91 -> 7'7"  ·  41.5 -> 3'5½"  ·  6 -> 6" */
export function ft(inches, { precision = 2 } = {}) {
  if (!isFinite(inches)) return '—';
  const neg = inches < 0;
  const v = Math.abs(inches);
  const feet = Math.floor(v / 12);
  let rem = v - feet * 12;

  // Round to the nearest half or quarter inch, the way a tape is read.
  const step = precision === 2 ? 0.5 : 1 / precision;
  rem = Math.round(rem / step) * step;
  let f = feet;
  if (rem >= 12) { f += 1; rem -= 12; }

  const frac = rem % 1;
  const whole = Math.floor(rem);
  const fracStr = frac === 0 ? '' : frac === 0.5 ? '½' : frac === 0.25 ? '¼' : frac === 0.75 ? '¾' : '';
  const inchStr = (whole === 0 && fracStr) ? fracStr : whole + fracStr;

  const sign = neg ? '-' : '';
  if (f === 0) return sign + inchStr + '"';
  if (rem === 0) return sign + f + "'";
  return sign + f + "'" + inchStr + '"';
}

/** For deltas, where "short by 3'9\"" reads better than a signed number. */
export function ftShort(inches) {
  return ft(Math.abs(inches));
}
