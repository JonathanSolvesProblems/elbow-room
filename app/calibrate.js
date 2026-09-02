/**
 * Your staircase, from your photograph.
 *
 * Full photogrammetry reconstructs a scene from many views and gives you a mesh
 * with no units. That is the wrong tool for this: nobody needs a mesh of their
 * stairwell, they need four numbers in inches, and the unitless mesh cannot give
 * them without a known reference anyway.
 *
 * So this does the part that actually answers the question, and it does it from
 * a single photograph in the browser with no GPU and no upload.
 *
 * Single-image metric rectification. Photograph the floor of the turn. Click the
 * four corners of something whose real size you know (a tread, a tile, a sheet
 * of paper) and give its dimensions. That is four point correspondences between
 * the image and a plane, which determines a homography. Every click after that
 * lands in real inches.
 *
 * The photo is read with FileReader and never leaves the page.
 */

/**
 * Solve H mapping four image points to four plane points, by Gaussian
 * elimination on the standard 8x8 DLT system. Returns a 3x3 row-major matrix.
 */
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  if (!h) return null;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function solve(A, b) {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  // After full Gauss-Jordan the diagonal holds the pivots and column n the
  // right-hand side, so each unknown is simply RHS over pivot.
  return M.map((row, i) => row[n] / row[i]);
}

/** Apply a homography to an image point, giving plane coordinates in inches. */
export function project(H, p) {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w
  };
}

/** Real distance in inches between two image points, once calibrated. */
export function distance(H, p, q) {
  const a = project(H, p), b = project(H, q);
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The calibration session: a photo, a reference rectangle, then measurements.
 * Kept as plain state so the agent's tools and the click handlers drive the
 * same object, exactly like the rest of this app.
 */
export function createSession() {
  return {
    image: null,          // HTMLImageElement
    refPoints: [],        // up to 4 clicked image points
    refWidth: 41.5,       // inches, the real width of the reference
    refHeight: 41.5,      // inches, the real depth of the reference
    H: null,
    Hinv: null,
    marks: [],            // named measurements the user has taken
    listeners: [],

    onChange(fn) { this.listeners.push(fn); },
    emit() { for (const f of this.listeners) f(this); },

    addPoint(p) {
      if (this.refPoints.length >= 4) return false;
      this.refPoints.push(p);
      if (this.refPoints.length === 4) this.compute();
      this.emit();
      return true;
    },

    setReference(w, h) { this.refWidth = w; this.refHeight = h; this.compute(); this.emit(); },

    compute() {
      if (this.refPoints.length !== 4) { this.H = null; this.Hinv = null; return; }
      // Clicked clockwise from the near-left corner.
      const dst = [
        { x: 0, y: 0 },
        { x: this.refWidth, y: 0 },
        { x: this.refWidth, y: this.refHeight },
        { x: 0, y: this.refHeight }
      ];
      this.H = homography(this.refPoints, dst);
      // And the way back. Real coordinates have to be drawable on whichever
      // frame is on screen, which is what lets one room be traced across
      // several frames of a walk through: calibrate each frame on the same
      // physical rectangle and they all share one coordinate system.
      this.Hinv = homography(dst, this.refPoints);
    },

    measure(p, q, label) {
      if (!this.H) return null;
      const inches = distance(this.H, p, q);
      const m = { p, q, inches, label: label || 'measurement' };
      this.marks.push(m);
      this.emit();
      return m;
    },

    reset() { this.refPoints = []; this.H = null; this.marks = []; this.emit(); }
  };
}
