/**
 * Measuring from a 360 frame.
 *
 * A phone panorama, shot by spinning on the spot, contains no depth at all:
 * with no translation between frames every pair is related by a homography, so
 * there is nothing to triangulate. That is a fact about the maths, not a
 * limitation of the implementation, and it is why panorama apps stitch a sphere
 * and stop.
 *
 * But a 360 frame does carry something exact. Every pixel of an equirectangular
 * image is a known *direction* from the camera. So if you say how high the
 * camera was above the floor, any point you click on the floor has exactly one
 * solution: the ray through that pixel meets the floor plane in one place. Two
 * clicks give a real distance, and it needs no parallax, no reconstruction and
 * no GPU.
 *
 * Which is the useful half. Nobody needs a mesh of their stairwell. They need
 * to know whether the couch fits.
 *
 *   equirectangular pixel (u, v), u and v in [0, 1]
 *     longitude  th = (u - 0.5) * 2pi
 *     latitude   ph = (0.5 - v) * pi
 *     direction  ( cos(ph)sin(th), sin(ph), cos(ph)cos(th) )
 *
 *   floor at y = -h, so the ray meets it at t = -h / dir.y, needing dir.y < 0
 *   (that is, you must be clicking below the horizon, at the floor).
 */

/** Direction unit vector for a pixel in an equirectangular image. */
export function directionFor(u, v) {
  const th = (u - 0.5) * 2 * Math.PI;
  const ph = (0.5 - v) * Math.PI;
  const cp = Math.cos(ph);
  return { x: cp * Math.sin(th), y: Math.sin(ph), z: cp * Math.cos(th) };
}

/**
 * Where a clicked pixel lands on the floor, in the same units as `height`.
 * Returns null above the horizon, where the ray never meets the floor.
 */
export function floorPoint(u, v, height) {
  const d = directionFor(u, v);
  if (d.y >= -1e-6) return null;
  const t = -height / d.y;
  return { x: d.x * t, z: d.z * t, t };
}

/** Real distance between two floor points, or null if either is above the horizon. */
export function floorDistance(a, b, height) {
  const p = floorPoint(a.u, a.v, height);
  const q = floorPoint(b.u, b.v, height);
  if (!p || !q) return null;
  return Math.hypot(p.x - q.x, p.z - q.z);
}

/**
 * Equirectangular images are 2:1. Anything close to that ratio is worth
 * offering the 360 flow for, and everything else falls back to the flat
 * homography path.
 */
export function looksEquirectangular(w, h) {
  return h > 0 && Math.abs(w / h - 2) < 0.12;
}

/**
 * How far off a reading will be if the stated camera height is wrong.
 *
 * Floor distance scales linearly with height, so a 5 percent error in the
 * height is a 5 percent error in every measurement. Worth saying out loud
 * rather than presenting a number as though it were exact.
 */
export function heightSensitivity(distance, height, errorIn = 1) {
  return distance * (errorIn / height);
}
