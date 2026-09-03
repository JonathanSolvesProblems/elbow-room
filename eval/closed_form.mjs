/**
 * The corner solver, checked against a result I did not write.
 *
 * The longest thin rod that can be carried round a right-angle corner between
 * corridors of width a and b is
 *
 *     L = (a^(2/3) + b^(2/3))^(3/2)
 *
 * That is the closed-form solution to the ladder-around-a-corner problem. It is
 * in every calculus textbook, it predates this project by about three hundred
 * years, and I cannot influence it. It is the whole reason this file exists:
 * an app whose central claim is a number needs at least one grader that is not
 * its own author, and here the grader is the mathematics.
 *
 * The app's solver does not use the formula. It minimises
 *
 *     L(t) = a/sin(t) + b/cos(t) - w/(sin(t)·cos(t))
 *
 * numerically over the angle through the turn, because the real problem has a
 * third term: the object has width, and a couch is not a rod. Setting that
 * width to zero collapses the two to the same problem, so the closed form can
 * grade the search. Anywhere they disagree, the search is wrong.
 *
 * Run with: node eval/closed_form.mjs
 */

import { cornerMaxLength } from '../app/geometry.js';

const closedForm = (a, b) => Math.pow(Math.pow(a, 2 / 3) + Math.pow(b, 2 / 3), 3 / 2);

let n = 0, worst = 0, worstAt = null;
const rows = [];

for (let a = 24; a <= 60; a += 3) {
  for (let b = 24; b <= 60; b += 3) {
    const want = closedForm(a, b);
    const got = cornerMaxLength({ widthA: a, widthB: b, objectWidth: 0 }).maxLength;
    const err = Math.abs(got - want);
    n++;
    if (err > worst) { worst = err; worstAt = { a, b, got, want }; }
    if (a === b || (a === 41.5 && b === 41.5)) {
      rows.push({ a, b, got, want, err });
    }
  }
}

console.log('  a      b      solver        closed form   difference');
for (const r of rows) {
  console.log(`  ${String(r.a).padEnd(6)} ${String(r.b).padEnd(6)} ` +
              `${r.got.toFixed(6).padEnd(13)} ${r.want.toFixed(6).padEnd(13)} ` +
              `${r.err.toExponential(2)}`);
}

// The real staircase, whose two spans are both 41.5 inches measured.
const real = cornerMaxLength({ widthA: 41.5, widthB: 41.5, objectWidth: 0 });
const realWant = closedForm(41.5, 41.5);

console.log(`\n  ${n} width pairs from 24 to 60 inches.`);
console.log(`  Worst disagreement: ${worst.toExponential(2)} in, ` +
            `at a=${worstAt.a} b=${worstAt.b}.`);
console.log(`  On the measured staircase, 41.5 by 41.5: solver ${real.maxLength.toFixed(6)} in, ` +
            `closed form ${realWant.toFixed(6)} in.`);

// A symmetric corner pinches at 45 degrees. Another thing the mathematics
// decides rather than the code.
const angleErr = Math.abs(real.pinchAngle - 45);
console.log(`  It pinches at ${real.pinchAngle.toFixed(4)} degrees, ` +
            `against the 45 a symmetric corner requires.`);

// Tolerance chosen to be far tighter than any tape measure, and far looser
// than double precision: this is checking the search converges, not the FPU.
const OK = 1e-4;
const pass = worst < OK && angleErr < 1e-3;
console.log(`\n  ${pass ? 'PASS' : 'FAIL'}: agreement within ${OK} in across all ${n} pairs.`);

if (!pass) process.exit(1);
