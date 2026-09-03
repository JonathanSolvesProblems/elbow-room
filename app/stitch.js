/**
 * One floor, out of many photographs.
 *
 * What this is, exactly, because the word "stitching" carries more than this
 * does. Every frame pinned to the floor carries a homography, which is an exact
 * mapping between that photograph's pixels and real inches on one flat surface.
 * Given several frames pinned to the *same* rectangle, they share one
 * coordinate system, so each one can be warped into that shared floor and the
 * results laid over each other. The result is an orthographic photograph of
 * your floor in real inches: look straight down at it and a foot is a foot
 * anywhere in the picture, which is not true of any of the source frames.
 *
 * What it is not: structure from motion. No new geometry is recovered here and
 * none is claimed. A homography is only exact on the plane it was calibrated
 * against, so anything standing up off the floor (furniture, walls, people)
 * smears, because a warp that is right for the floor is wrong for everything
 * above it. That is why the mosaic is clipped to the traced outline and why
 * only the floor is stitched. The walls in the 3D view are extruded from your
 * clicks, as they always were.
 *
 * The honest summary, and the one the page shows: geometry from your clicks,
 * floor texture from your photographs, both in the same real inches.
 */

/** Where an image point lands on the floor, or null if it is at or past the horizon. */
function onPlane(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  if (!w || Math.abs(w) < 1e-9) return null;
  const p = { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
  return isFinite(p.x) && isFinite(p.y) ? p : null;
}

/** Where a world point lands in a photograph, or null if it is behind the camera. */
function toImage(Hinv, X, Y) {
  const w = Hinv[6] * X + Hinv[7] * Y + Hinv[8];
  if (!w) return null;
  return { x: (Hinv[0] * X + Hinv[1] * Y + Hinv[2]) / w,
           y: (Hinv[3] * X + Hinv[4] * Y + Hinv[5]) / w, w };
}

/** Even-odd point in polygon, on the outline in inches. */
function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) &&
        x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/**
 * Warp every calibrated frame into the floor plane and blend them.
 *
 * frames: [{ img, Hinv }] where Hinv maps world inches to that image's pixels.
 * poly:   the traced outline in inches, which bounds and clips the result.
 *
 * Blending is weighted by how far a sample sits from the edge of its own
 * source frame, so a frame contributes most where it saw the floor best and
 * fades out rather than ending in a hard seam.
 *
 * Yields progress between steps so the page can stay alive under it.
 */
export async function floorMosaic(frames, poly, { maxPx = 1400, onProgress,
                                                  reach = 320 } = {}) {
  if (!frames.length) return null;
  const bounded = poly && poly.length >= 3;

  // Without a traced outline, the floor is bounded by what the photographs
  // actually saw. Walking each frame's own edges back onto the plane gives
  // that, and `reach` caps it, because a pixel just under the horizon lands
  // hundreds of feet away and would stretch the picture to nothing.
  let minX, maxX, minY, maxY;
  if (bounded) {
    const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
    minX = Math.min(...xs); maxX = Math.max(...xs);
    minY = Math.min(...ys); maxY = Math.max(...ys);
  } else {
    const seen = [];
    for (const { img, H } of frames) {
      if (!img || !H) continue;
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      for (let iy = 0; iy <= 8; iy++) {
        for (let ix = 0; ix <= 8; ix++) {
          const q = onPlane(H, w * ix / 8, h * iy / 8);
          if (q && Math.hypot(q.x, q.y) <= reach) seen.push(q);
        }
      }
    }
    if (seen.length < 4) return null;
    minX = Math.min(...seen.map(p => p.x)); maxX = Math.max(...seen.map(p => p.x));
    minY = Math.min(...seen.map(p => p.y)); maxY = Math.max(...seen.map(p => p.y));
  }
  const wIn = maxX - minX, hIn = maxY - minY;
  if (!(wIn > 0 && hIn > 0)) return null;

  // Enough resolution to read a floorboard, capped so the texture stays sane.
  const ppi = Math.min(4, maxPx / Math.max(wIn, hIn));
  const W = Math.max(16, Math.round(wIn * ppi));
  const H = Math.max(16, Math.round(hIn * ppi));

  const acc = new Float32Array(W * H * 3);
  const wsum = new Float32Array(W * H);

  // Which output pixels are floor at all, worked out once. Testing the polygon
  // again for every frame, and then a third time to count coverage, was three
  // passes over two million pixels for an answer that never changes.
  const mask = new Uint8Array(W * H);
  let insideCount = 0;
  for (let py = 0; py < H; py++) {
    const Y = minY + (py + 0.5) / ppi;
    for (let px = 0; px < W; px++) {
      const X = minX + (px + 0.5) / ppi;
      // With an outline, the floor is what you traced. Without one, it is
      // everything within reach of the reference rectangle, and whether a
      // photograph saw it decides the rest.
      if (bounded ? inside(poly, X, Y) : Math.hypot(X, Y) <= reach) {
        mask[py * W + px] = 1; insideCount++;
      }
    }
  }
  let covered = 0;

  for (let f = 0; f < frames.length; f++) {
    const { img, Hinv } = frames[f];
    if (!img || !Hinv) continue;

    // Read the source once. A canvas per frame, not per pixel.
    const sc = document.createElement('canvas');
    sc.width = img.naturalWidth || img.width;
    sc.height = img.naturalHeight || img.height;
    const sctx = sc.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(img, 0, 0);
    let src;
    try { src = sctx.getImageData(0, 0, sc.width, sc.height); }
    catch { continue; }                       // a tainted canvas, nothing to do
    const sd = src.data, sw = sc.width, sh = sc.height;

    for (let py = 0; py < H; py++) {
      const Y = minY + (py + 0.5) / ppi;
      for (let px = 0; px < W; px++) {
        if (!mask[py * W + px]) continue;
        const X = minX + (px + 0.5) / ppi;
        const q = toImage(Hinv, X, Y);
        // A negative w is a point behind the camera: the same algebra, the
        // wrong side of the lens, and it lands somewhere plausible on screen.
        if (!q || q.w <= 0) continue;
        if (q.x < 0 || q.y < 0 || q.x >= sw - 1 || q.y >= sh - 1) continue;

        // Fade towards the frame's own edges, so overlapping frames cross over
        // instead of ending in a line.
        const eu = Math.min(q.x, sw - 1 - q.x) / (sw * 0.5);
        const ev = Math.min(q.y, sh - 1 - q.y) / (sh * 0.5);
        const wgt = Math.max(1e-3, Math.min(1, eu * 3) * Math.min(1, ev * 3));

        const x0 = q.x | 0, y0 = q.y | 0;
        const fx = q.x - x0, fy = q.y - y0;
        const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4;
        const i01 = i00 + sw * 4, i11 = i01 + 4;
        const o = (py * W + px) * 3;
        for (let c = 0; c < 3; c++) {
          const top = sd[i00 + c] + (sd[i10 + c] - sd[i00 + c]) * fx;
          const bot = sd[i01 + c] + (sd[i11 + c] - sd[i01 + c]) * fx;
          acc[o + c] += (top + (bot - top) * fy) * wgt;
        }
        wsum[py * W + px] += wgt;
      }
      if ((py & 31) === 0 && onProgress) {
        onProgress((f + py / H) / frames.length);
        await new Promise(r => setTimeout(r, 0));
      }
    }
  }

  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const octx = out.getContext('2d');
  const dst = octx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const w = wsum[i];
    if (w <= 0) { dst.data[i * 4 + 3] = 0; continue; }
    covered++;
    for (let c = 0; c < 3; c++) dst.data[i * 4 + c] = Math.min(255, acc[i * 3 + c] / w);
    dst.data[i * 4 + 3] = 255;
  }
  octx.putImageData(dst, 0, 0);

  return {
    canvas: out,
    // Where the picture sits, in the same inches as the outline, so the plan
    // and the 3D floor can both put it exactly where it belongs.
    bounds: { minX, minY, maxX, maxY },
    ppi,
    frames: frames.length,
    // What fraction of the traced floor any photograph actually saw. Honest,
    // and usually well short of everything, because a phone panning a room
    // never points at the floor under the sofa.
    coverage: insideCount ? covered / insideCount : 0
  };
}

/**
 * Where the photograph was taken from, in floor inches.
 *
 * A homography between a plane and an image is K[r1 r2 t] up to scale, so with
 * a guess at the focal length the rotation and translation come straight back
 * out of it, and the camera centre is -R'.t. The focal length is a guess unless
 * the phone told us, which it does not here, so treat the height as indicative
 * and the ground position as good. It is drawn as a marker, never measured
 * against, and nothing in the verdict depends on it.
 */
export function cameraFrom(Hinv, imgW, imgH) {
  // H maps world (X, Y, 1) to image. Hinv here is exactly that.
  const f = 1.1 * Math.max(imgW, imgH);      // a typical phone, roughly 65 degrees
  const cx = imgW / 2, cy = imgH / 2;
  const Kinv = [1 / f, 0, -cx / f, 0, 1 / f, -cy / f, 0, 0, 1];
  const m = (A, B) => [
    A[0] * B[0] + A[1] * B[3] + A[2] * B[6], A[0] * B[1] + A[1] * B[4] + A[2] * B[7],
    A[0] * B[2] + A[1] * B[5] + A[2] * B[8],
    A[3] * B[0] + A[4] * B[3] + A[5] * B[6], A[3] * B[1] + A[4] * B[4] + A[5] * B[7],
    A[3] * B[2] + A[4] * B[5] + A[5] * B[8],
    A[6] * B[0] + A[7] * B[3] + A[8] * B[6], A[6] * B[1] + A[7] * B[4] + A[8] * B[7],
    A[6] * B[2] + A[7] * B[5] + A[8] * B[8]
  ];
  const M = m(Kinv, Hinv);
  const c1 = [M[0], M[3], M[6]], c2 = [M[1], M[4], M[7]], c3 = [M[2], M[5], M[8]];
  const n1 = Math.hypot(...c1), n2 = Math.hypot(...c2);
  const lambda = (n1 + n2) / 2;
  if (!isFinite(lambda) || lambda <= 0) return null;
  const r1 = c1.map(v => v / lambda), r2 = c2.map(v => v / lambda);
  const t = c3.map(v => v / lambda);
  const r3 = [r1[1] * r2[2] - r1[2] * r2[1],
              r1[2] * r2[0] - r1[0] * r2[2],
              r1[0] * r2[1] - r1[1] * r2[0]];
  // Camera centre C = -R' t, with R' the transpose of [r1 r2 r3].
  const C = [
    -(r1[0] * t[0] + r1[1] * t[1] + r1[2] * t[2]),
    -(r2[0] * t[0] + r2[1] * t[1] + r2[2] * t[2]),
    -(r3[0] * t[0] + r3[1] * t[1] + r3[2] * t[2])
  ];
  if (!C.every(isFinite)) return null;
  // Looking direction on the floor: the camera's own +Z, put into world axes.
  const look = { x: r3[0], y: r3[1] };
  const len = Math.hypot(look.x, look.y) || 1;
  return { x: C[0], y: C[1], height: Math.abs(C[2]),
           look: { x: look.x / len, y: look.y / len } };
}
