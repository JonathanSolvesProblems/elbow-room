/**
 * Does the verdict depend on the one number we could not read off a tape?
 *
 * Headroom over the turn was never successfully measured: three attempts all
 * ran the tape off the edge of the photograph. Rather than quote a lower bound
 * as though it were a reading, this sweeps every value an older basement stair
 * could plausibly have and reports whether anything changes.
 *
 *   node eval/headroom_sensitivity.mjs
 */
import { checkPath } from '../app/geometry.js';
import { ft } from '../app/units.js';

const stair = h => ({
  clearWidth: 41.5,
  turn: { widthA: 41.5, widthB: 41.5, headroom: h },
  doors: [{ name: 'door at the top', width: 32, height: 80, removable: true, leafThickness: 1.75 }]
});

const objects = {
  'the couch':    { length: 91, width: 36, height: 48, feetHeight: 4 },
  'water heater': { length: 59.875, width: 24, height: 24 }
};

const range = [60, 66, 72, 77, 78, 80, 84, 90, 96];
const rows = [];
for (const h of range) {
  const row = { headroom_in: h, headroom: ft(h) };
  for (const [name, o] of Object.entries(objects)) {
    const r = checkPath(o, stair(h));
    row[name] = r.verdict;
    row[name + ' margin'] = ft(r.margin);
  }
  rows.push(row);
}

console.table(rows);

const verdicts = new Set(rows.map(r => r['the couch']));
console.log(
  verdicts.size === 1
    ? `\nThe couch verdict is "${[...verdicts][0]}" at every headroom from ${ft(range[0])} to ` +
      `${ft(range.at(-1))}. It fails on plan length at zero tilt, so headroom never enters it.`
    : `\nThe verdict changes across this range. Headroom must be measured properly.`
);
