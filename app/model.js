/**
 * The staircase, and the things people try to carry up it.
 *
 * Every number carries a `source`. This is not decoration. An app that tells
 * you a couch will not fit had better be able to say where it got the numbers,
 * and the difference between a measurement and an assumption is the difference
 * between a verdict and a guess. The UI renders provenance, and the agent's
 * read tools return it, so neither a person nor a model can quote a provisional
 * figure as though it were measured.
 *
 *   measured    someone put a tape on it
 *   standard    a published dimension (mattress sizes, sheet goods, door leaves)
 *   provisional PLACEHOLDER. Must be replaced before any verdict is published.
 */

export const SOURCE = {
  MEASURED: 'measured',
  STANDARD: 'standard',
  PROVISIONAL: 'provisional'
};

function n(value, source, note) {
  return { value, source, note };
}

/**
 * A 1970s house. Basement staircase.
 * A straight run rising from the basement floor into three winder treads that
 * turn the flight through 90 degrees, then out through a doorway at the top.
 * A soffit crosses diagonally above the turn.
 */
export const STAIRCASE = {
  id: 'ddo-basement',
  label: 'Basement stairs, 1970s house',

  clearWidth: n(41.5, SOURCE.MEASURED,
    'Tape across the tread, finished wall to stringer. Photo 20260830_172820, read at full resolution.'),

  run: {
    treads: n(9, SOURCE.PROVISIONAL, 'Counted from photographs, not verified on site.'),
    rise: n(7.5, SOURCE.PROVISIONAL, 'Typical for a house of this age. Not measured.'),
    going: n(9.5, SOURCE.PROVISIONAL, 'Not measured.')
  },

  turn: {
    kind: 'winder',
    treads: n(3, SOURCE.PROVISIONAL, 'Three pie-shaped treads visible in photos 172641, 172706, 172710.'),
    widthA: n(41.5, SOURCE.PROVISIONAL, 'Assumed equal to the run. The tape ran off the frame in 172846.'),
    widthB: n(41.5, SOURCE.PROVISIONAL, 'Assumed equal to the run. The tape ran off the frame in 172706.'),
    headroom: n(78, SOURCE.PROVISIONAL,
      'NOT MEASURED. The soffit crosses directly above the turn. This is the number most likely to decide the verdict.')
  },

  doors: [
    {
      name: 'door at the top',
      width: n(32, SOURCE.PROVISIONAL, 'Standard leaf assumed. Tape ran off frame in 172936.'),
      height: n(80, SOURCE.PROVISIONAL, 'Standard leaf assumed.'),
      removable: true,
      leafThickness: 1.75
    }
  ],

  /** Objects known to have made this trip, and what happened. Ground truth. */
  history: [
    {
      object: 'couch',
      outcome: 'did not go',
      evidence: 'Owner could not get it up the stairs without damaging the walls.',
      note: 'Measured 2026-08-31 at 91 in arm to arm. The turn allows 45.4 in at that depth, ' +
            'so it was over twice the longest thing that could have gone round.'
    },
    {
      object: 'water heater (Giant 172E-3F8M, 279 L)',
      outcome: 'went, with damage',
      evidence: 'Carried down by installers during the July 2026 warranty replacement, per the ' +
                'owner no wall protection was used. Photographs 20260831_192429 and _192435 show ' +
                'gouging along the soffit edge and the corner bead.',
      note: '24 in diameter by 59⅞ in tall, from Giant\'s own engineering submittal sheet. ' +
            'The solver says it clears in plan with room to spare, and it is right: it did go. ' +
            'The damage is on the soffit, which is the measurement still standing on a placeholder. ' +
            'The gouges mark where the tape needs to go.'
    }
  ]
};

/**
 * Things people carry up stairs. `standard` entries are genuinely published
 * dimensions. Nothing here is invented to make a demo work.
 */
export const CATALOGUE = [
  {
    id: 'the-couch',
    label: 'The couch',
    length: n(91, SOURCE.MEASURED,
      'Arm to arm. Photo 20260831_182518, tape reading just past 90 at the outer arm edge.'),
    depth:  n(36, SOURCE.MEASURED,
      'Photo 20260831_182537, tape body held at the 3F mark. Which of the two cross readings is depth ' +
      'and which is height is not settled, but every combination fails by 33 in or more.'),
    height: n(48, SOURCE.MEASURED,
      'Photo 20260831_182548. See the note on depth.'),
    feetHeight: 4,
    note: 'The couch this project exists because of.'
  },
  {
    id: 'sofa-3seat',
    label: 'Typical 3-seat sofa',
    length: n(84, SOURCE.PROVISIONAL, 'Industry-typical, for comparison against the measured one.'),
    depth:  n(38, SOURCE.PROVISIONAL, 'Typical.'),
    height: n(34, SOURCE.PROVISIONAL, 'Typical.'),
    feetHeight: 4
  },
  {
    id: 'water-tank',
    label: 'Water heater, 279 L',
    length: n(59.875, SOURCE.STANDARD,
      'Giant 172E-3F8M Super Cascade, height from the manufacturer engineering submittal sheet.'),
    depth:  n(24, SOURCE.STANDARD, 'Giant 172E-3F8M, diameter from the manufacturer sheet.'),
    height: n(24, SOURCE.STANDARD, 'Cylinder, so the second cross dimension equals the diameter.'),
    note: 'Carried down these stairs in July 2026 during a warranty replacement. It went, and it ' +
          'marked the soffit on the way.'
  },
  {
    id: 'mattress-queen',
    label: 'Queen mattress',
    length: n(80, SOURCE.STANDARD, 'North American queen, 60 x 80 in.'),
    depth:  n(60, SOURCE.STANDARD, 'North American queen.'),
    height: n(12, SOURCE.STANDARD, 'Typical modern depth.'),
    flexible: true,
    note: 'A mattress bends. The rigid-body verdict is a lower bound on what is possible.'
  },
  {
    id: 'mattress-king',
    label: 'King mattress',
    length: n(80, SOURCE.STANDARD, 'North American king, 76 x 80 in.'),
    depth:  n(76, SOURCE.STANDARD, 'North American king.'),
    height: n(12, SOURCE.STANDARD, 'Typical modern depth.'),
    flexible: true
  },
  {
    id: 'plywood-sheet',
    label: 'Sheet of plywood',
    length: n(96, SOURCE.STANDARD, 'Standard 4 x 8 ft sheet.'),
    depth:  n(48, SOURCE.STANDARD, 'Standard 4 x 8 ft sheet.'),
    height: n(0.5, SOURCE.STANDARD, 'Half inch.'),
    note: 'The classic test. Rigid, thin, and completely unforgiving.'
  },
  {
    id: 'door-leaf',
    label: 'Interior door leaf',
    length: n(80, SOURCE.STANDARD, 'Standard North American leaf.'),
    depth:  n(32, SOURCE.STANDARD, 'Standard 32 in leaf.'),
    height: n(1.75, SOURCE.STANDARD, 'Standard thickness.')
  },
  {
    id: 'fridge',
    label: 'Fridge',
    length: n(70, SOURCE.PROVISIONAL, 'Typical full-height fridge.'),
    depth:  n(36, SOURCE.PROVISIONAL, 'Typical.'),
    height: n(30, SOURCE.PROVISIONAL, 'Typical.')
  }
];

/* ------------------------------------------------------------------ *
 * Flattening for the solver
 * ------------------------------------------------------------------ */

/** Strip provenance so geometry.js sees plain inches. */
export function plain(stair = STAIRCASE) {
  return {
    clearWidth: stair.clearWidth.value,
    turn: {
      widthA: stair.turn.widthA.value,
      widthB: stair.turn.widthB.value,
      headroom: stair.turn.headroom.value
    },
    doors: stair.doors.map(d => ({
      name: d.name,
      width: d.width.value,
      height: d.height.value,
      removable: d.removable,
      leafThickness: d.leafThickness
    }))
  };
}

export function plainObject(item) {
  return {
    length: item.length.value,
    width: item.depth.value,
    height: item.height.value,
    feetHeight: item.feetHeight
  };
}

/** Every number still standing on a placeholder. The UI must not hide these. */
export function provisionalFields(stair = STAIRCASE) {
  const out = [];
  const walk = (obj, path) => {
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object' && 'source' in v) {
        if (v.source === SOURCE.PROVISIONAL) out.push({ field: [...path, k].join('.'), note: v.note });
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        walk(v, [...path, k]);
      }
    }
  };
  walk({ clearWidth: stair.clearWidth, run: stair.run, turn: stair.turn }, []);
  for (const d of stair.doors) {
    for (const k of ['width', 'height']) {
      if (d[k].source === SOURCE.PROVISIONAL) out.push({ field: `${d.name}.${k}`, note: d[k].note });
    }
  }
  return out;
}
