/**
 * The stairwell as a real solid you can orbit.
 *
 * Two honest notes about what this is and is not.
 *
 * It is not a photogrammetric reconstruction. Structure-from-motion needs dozens
 * of overlapping views orbiting the subject, and it hands back a mesh with no
 * units, which cannot tell you your run is 41.5 inches. What you want from a
 * staircase is dimensions, so the geometry here is built from tape measurements
 * and is dimensionally true. The photographs are mapped onto the surfaces, so it
 * looks like the place while measuring like the place.
 *
 * And it decides nothing. Every dimension and the object's pose are handed in
 * from geometry.js, the same numbers the sidebar prints.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const IN = 0.0254;                     // inches to metres, so the camera behaves
let renderer, scene, camera, controls, shaftGroup, objectMesh, raf = 0;

let M = {
  a: 41.5, b: 41.5, headroom: 80,
  rise: 7.5, going: 9.5, treads: 9, winders: 3,
  object: { length: 91, width: 36, height: 48, shape: 'sofa' },
  tilt: 0, upright: false, blocked: true, touching: false,
  pos: { x: 100, y: 20 }, yaw: 0
};

const tex = new THREE.TextureLoader();
function photo(url, repeat = 1) {
  const t = tex.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

let mode = 'orbit';
/**
 * 'orbit' or 'move'. Orbiting and carrying were competing for the same pointer
 * gesture, so a drag near the couch picked it up when you meant to look around.
 */
export function setMode(m) {
  mode = m === 'move' ? 'move' : 'orbit';
  if (controls) controls.enabled = mode === 'orbit';
  if (renderer) renderer.domElement.style.cursor = mode === 'move' ? 'grab' : 'default';
  return mode;
}

/** The 3D clearance verdict for the current pose. The plan view uses this too,
 *  so the two drawings can never disagree about the same position. */
export function isClear() { return !M.touching; }

let onMove = null;
/** Tell the rest of the app when someone drags the object in 3D. */
export function onObjectMove(fn) { onMove = fn; }

export function attach(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, 1, 0.05, 200);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.9;
  controls.maxDistance = 14;                  // cannot wander off into the void
  controls.maxPolarAngle = Math.PI * 0.48;    // never go under the floor
  controls.minPolarAngle = 0.15;              // nor straight down from above
  controls.enablePan = false;                 // the target stays on the turn

  // A stairwell is lit from above and from the doorway. Two sources plus a
  // warm bounce reads as a room rather than as a diagram.
  scene.add(new THREE.HemisphereLight(0xffeedd, 0x2a231c, .85));
  const key = new THREE.DirectionalLight(0xfff3e0, 2.2);
  key.position.set(2.6, 5.2, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = .5; key.shadow.camera.far = 30;
  key.shadow.camera.left = -6; key.shadow.camera.right = 6;
  key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
  key.shadow.bias = -0.0012;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbfd4ff, .35);
  fill.position.set(-3, 2.5, -2);
  scene.add(fill);

  build();
  bindDrag(canvas);
  bindKeys(canvas);
  window.addEventListener('elbowroom:camera', e => {
    const sph = new THREE.Spherical().setFromVector3(
      camera.position.clone().sub(controls.target));
    if (e.detail === 'left')  sph.theta += Math.PI / 8;
    if (e.detail === 'right') sph.theta -= Math.PI / 8;
    if (e.detail === 'in')    sph.radius = Math.max(controls.minDistance, sph.radius * 0.8);
    if (e.detail === 'out')   sph.radius = Math.min(controls.maxDistance, sph.radius * 1.25);
    if (e.detail === 'reset') {
      M.pos = { x: M.b + M.object.length * 0.55 + 6, y: M.a / 2 };
      placeObject();
      if (onMove) onMove({ x: M.pos.x, y: M.pos.y });
      return frameAll();
    }
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
    controls.update();
  });
  resize();
  window.addEventListener('resize', resize);
  loop();
  return { frameAll };
}

export function set(next) {
  const before = JSON.stringify([M.a, M.b, M.headroom, M.rise, M.going, M.treads, M.winders]);
  M = { ...M, ...next, object: { ...M.object, ...(next.object || {}) } };
  if (JSON.stringify([M.a, M.b, M.headroom, M.rise, M.going, M.treads, M.winders]) !== before) build();
  placeObject();
}

function resize() {
  if (!renderer) return;
  const c = renderer.domElement;
  const w = c.clientWidth || 1, h = c.clientHeight || 1;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function loop() {
  raf = requestAnimationFrame(loop);
  controls.update();
  // A slow pulse while the pose is clear, so a good position announces itself
  // rather than waiting to be read off the sidebar.
  if (objectMesh && !M.touching) {
    const t = performance.now() / 620;
    objectMesh.material.emissiveIntensity = 0.16 + 0.14 * (0.5 + 0.5 * Math.sin(t));
  } else if (objectMesh) {
    objectMesh.material.emissiveIntensity = 0.1;
  }
  renderer.render(scene, camera);
}

export function dispose() { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); }

/**
 * Pick the object up and carry it through the space.
 *
 * Raycast onto a horizontal plane at the object's own base height, so dragging
 * follows the floor rather than the camera. The plan view is told about every
 * move, because the two drawings are one state.
 */
function bindDrag(canvas) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const hit = new THREE.Vector3();
  let dragging = false, grabOffset = new THREE.Vector3();

  const toNdc = e => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };

  canvas.addEventListener('pointerdown', e => {
    if (!objectMesh || mode !== 'move') return;
    toNdc(e);
    ray.setFromCamera(ndc, camera);
    if (!ray.intersectObject(objectMesh, true).length) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), objectMesh.position);
    if (ray.ray.intersectPlane(plane, hit)) grabOffset.copy(objectMesh.position).sub(hit);
  });

  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    toNdc(e);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hit)) return;
    const p = hit.add(grabOffset);
    M.pos = clampToShaft(p.x / IN, p.z / IN);
    placeObject();
    if (onMove) onMove({ x: M.pos.x, y: M.pos.y });
  });

  const stop = e => {
    if (!dragging) return;
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
}

/**
 * Does the object actually fit where it is, in three dimensions?
 *
 * The plan view's collision test only knows about walls seen from above. It has
 * no idea the floor is climbing, so an object lying flat and buried in the
 * treads came back clear. This tests the solid: every corner must be inside the
 * L in plan, above the tread it stands over, and under the soffit.
 *
 * Note that a long object lying flat on a flight genuinely does intersect the
 * steps. That is not a bug in the test, it is why people carry furniture tilted
 * along the pitch, and showing it red is the honest answer.
 */
function poseIsClear() {
  if (!objectMesh) return true;
  const { length: L, width: W, height: H } = M.object;
  const tilt = (M.upright ? 90 : M.tilt) * Math.PI / 180;
  const yaw = -M.yaw * Math.PI / 180;
  const straight = Math.max(1, M.treads - M.winders);
  const ceiling = straight * M.rise + M.headroom;

  const cx = M.pos.x, cy = M.pos.y;
  const cz = floorAtInches(cx, cy) +
    (Math.abs(L * Math.sin(tilt)) + Math.abs(H * Math.cos(tilt))) / 2 + 0.8;

  for (const dx of [-L / 2, 0, L / 2])
    for (const dy of [-W / 2, 0, W / 2])
      for (const dz of [-H / 2, H / 2]) {
        const qx = dx * Math.cos(tilt) - dz * Math.sin(tilt);
        const qz = dx * Math.sin(tilt) + dz * Math.cos(tilt);
        const x = cx + qx * Math.cos(yaw) - dy * Math.sin(yaw);
        const y = cy + qx * Math.sin(yaw) + dy * Math.cos(yaw);
        const z = cz + qz;

        if (x < -0.5 || y < -0.5) return false;                       // outer walls
        if (y > M.a + 0.5 && x > M.b + 0.5) return false;             // past the reflex corner
        if (z < floorAtInches(x, y) - 0.75) return false;             // buried in a tread
        if (z > floorAtInches(x, y) + ceiling) return false;          // through the soffit
      }
  return true;
}

/**
 * Nudge the object with the keyboard.
 *
 * Dragging is fine for a big move and hopeless for the last inch, which is
 * exactly where a carry is decided. Arrows and WASD step it, shift steps
 * further, and the axes follow the camera so "up" always means away from you.
 */
function bindKeys(canvas) {
  canvas.tabIndex = 0;
  const nudge = (dx, dy) => {
    M.pos = clampToShaft(M.pos.x + dx, M.pos.y + dy);
    placeObject();
    if (onMove) onMove({ x: M.pos.x, y: M.pos.y });
  };
  const handler = e => {
    const k = e.key.toLowerCase();
    const map = { arrowup: [0, 1], w: [0, 1], arrowdown: [0, -1], s: [0, -1],
                  arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
    const v = map[k];
    if (!v) return;
    e.preventDefault();
    const step = e.shiftKey ? 6 : 1.5;
    // Move in the camera's frame, so the keys mean what they look like.
    const f = new THREE.Vector3();
    camera.getWorldDirection(f); f.y = 0; f.normalize();
    const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
    const dx = (f.x * v[1] + r.x * v[0]) * step;
    const dy = (f.z * v[1] + r.z * v[0]) * step;
    nudge(dx / 1, dy / 1);
  };
  canvas.addEventListener('keydown', handler);
  canvas.addEventListener('pointerdown', () => canvas.focus());
}

/**
 * Keep the object in the building.
 *
 * Nothing stopped a drag carrying it out through a wall and off into the void,
 * where it was simply lost with no way back. The L is the union of two arms, so
 * clamp into whichever arm is nearer and let it travel the full length of that
 * arm, plus a little overhang because a long object legitimately sticks out
 * past the bottom of the flight.
 */
function clampToShaft(x, y) {
  const straight = Math.max(1, M.treads - M.winders);
  const run = straight * M.going;
  const overhang = M.object.length * 0.55;
  const maxX = M.b + run + overhang;
  const maxY = M.a + run + overhang;

  x = Math.min(Math.max(x, 0), maxX);
  y = Math.min(Math.max(y, 0), maxY);

  // Outside both arms: push back into the closer one.
  if (x > M.b && y > M.a) {
    if (M.a - y > M.b - x) y = M.a; else x = M.b;
  }
  return { x, y };
}

/* ------------------------------------------------------------------ *
 * The shaft
 * ------------------------------------------------------------------ */

function build() {
  if (shaftGroup) scene.remove(shaftGroup);
  shaftGroup = new THREE.Group();

  const { a, b, rise, going, treads, winders, headroom } = M;
  const straight = Math.max(1, treads - winders);
  const A = a * IN, B = b * IN, R = rise * IN, G = going * IN;

  const woodTop = new THREE.MeshStandardMaterial({ map: photo('/docs/tex-tread.jpg', 1), roughness: .85 });
  const woodSide = new THREE.MeshStandardMaterial({ color: 0xd9cdb8, roughness: .9 });
  // BackSide only: seen from outside the shaft the walls vanish, so you can
  // look in. Standing inside, they are there.
  // Plaster, tiled small and tinted down so it reads as a surface rather than
  // as a photograph. A crop with stairs in it tiled into wallpaper of stairs.
  const wallMat = new THREE.MeshStandardMaterial({
    map: photo('/docs/tex-wall.jpg', 7), color: 0x9c9184, roughness: 1, side: THREE.BackSide
  });

  // A real step is a tread slab, a riser behind it, and a stringer carrying
  // them at each side. Drawing each step as a full-height solid block made a
  // flight read as a wall with a stepped top rather than as a staircase, which
  // is what looked disconnected.
  const TREAD_T = 1.25 * IN;      // slab thickness
  const RISER_T = 0.75 * IN;      // riser board
  const NOSE    = 1.0 * IN;       // overhang past the riser

  /** One step. `along` is the travel axis: 'x' for the lower arm, 'y' for the upper. */
  const step = (along, mid, width, topZ, uphill) => {
    const g = along === 'x'
      ? new THREE.BoxGeometry(G + NOSE, TREAD_T, width)
      : new THREE.BoxGeometry(width, TREAD_T, G + NOSE);
    const t = new THREE.Mesh(g, woodTop);
    t.position.set(along === 'x' ? mid : width / 2, topZ - TREAD_T / 2,
                   along === 'x' ? width / 2 : mid);
    t.castShadow = t.receiveShadow = true;
    shaftGroup.add(t);

    const rg = along === 'x'
      ? new THREE.BoxGeometry(RISER_T, R - TREAD_T, width)
      : new THREE.BoxGeometry(width, R - TREAD_T, RISER_T);
    const r2 = new THREE.Mesh(rg, woodSide);
    // The riser is the back of the step, which is the uphill side. The lower
    // arm climbs as x decreases, the upper as y increases, so they differ.
    const back = mid + uphill * G / 2;
    r2.position.set(along === 'x' ? back : width / 2, topZ - TREAD_T - (R - TREAD_T) / 2,
                    along === 'x' ? width / 2 : back);
    r2.castShadow = r2.receiveShadow = true;
    shaftGroup.add(r2);
  };

  let h = 0;
  for (let i = 0; i < straight; i++) {
    const x = B + (straight - i - 0.5) * G;
    step('x', x, A, h + R, -1);
    h += R;
  }
  // Winders: three pie treads sharing the 90 degrees, each ray clipped where it
  // leaves the turn square so they meet both walls instead of punching through.
  for (let i = 0; i < winders; i++) {
    // The fan sweeps 180 to 270 degrees, so its FIRST wedge lies against the
    // upper arm and its last against the lower. Heights climb from the lower
    // arm, so the order has to be reversed or the turn climbs backwards.
    const t0 = Math.PI + ((winders - 1 - i) / winders) * Math.PI / 2;
    const t1 = Math.PI + ((winders - i) / winders) * Math.PI / 2;
    const edge = (ang) => {
      const cx = Math.cos(ang), cy = Math.sin(ang), k = [];
      if (cx < -1e-6) k.push(B / -cx);
      if (cy < -1e-6) k.push(A / -cy);
      const d = k.length ? Math.min(...k) : Math.hypot(B, A);
      return [B + cx * d, A + cy * d];
    };
    const p0 = edge(t0), p1 = edge(t1);
    const sh = new THREE.Shape();
    sh.moveTo(B, -A);
    sh.lineTo(p0[0], -p0[1]);
    // Two rays on different walls must travel round the outer corner, or the
    // wedge cuts it off and leaves a hole between the flights.
    if (Math.abs(p0[0]) < 1e-4 && Math.abs(p1[1]) < 1e-4) sh.lineTo(0, 0);
    sh.lineTo(p1[0], -p1[1]);
    sh.closePath();

    const g = new THREE.ExtrudeGeometry(sh, { depth: h + R, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, [woodTop, woodSide]);
    m.castShadow = m.receiveShadow = true;
    shaftGroup.add(m);
    h += R;
  }

  // Solid sides carrying each flight. Without them the treads hang in mid air,
  // which is what still read as disconnected.
  const rampMat = new THREE.MeshStandardMaterial({ color: 0xcdbfa8, roughness: .92 });

  // Lower arm: climbs as x decreases, so the triangle is high at the turn.
  const lowShape = new THREE.Shape();
  lowShape.moveTo(B, 0);
  lowShape.lineTo(B + straight * G, 0);
  lowShape.lineTo(B, straight * R);
  lowShape.closePath();
  const lowRamp = new THREE.Mesh(
    new THREE.ExtrudeGeometry(lowShape, { depth: A, bevelEnabled: false }), rampMat);
  lowRamp.castShadow = lowRamp.receiveShadow = true;
  shaftGroup.add(lowRamp);

  // Upper arm: climbs as y increases, starting from the top of the winders.
  const upBase = (straight + winders) * R;
  const upShape = new THREE.Shape();
  upShape.moveTo(-A, 0);
  upShape.lineTo(-(A + straight * G), 0);
  upShape.lineTo(-(A + straight * G), upBase + straight * R);
  upShape.lineTo(-A, upBase);
  upShape.closePath();
  const upGeo = new THREE.ExtrudeGeometry(upShape, { depth: B, bevelEnabled: false });
  upGeo.rotateY(Math.PI / 2);
  const upRamp = new THREE.Mesh(upGeo, rampMat);
  upRamp.castShadow = upRamp.receiveShadow = true;
  shaftGroup.add(upRamp);

  // Upper arm, climbing away from the turn.
  for (let i = 0; i < straight; i++) {
    const y = A + (i + 0.5) * G;
    step('y', y, B, h + R, +1);
    h += R;
  }

  // The shaft is L-shaped, so the walls must be too. Wrapping it in a box put
  // an outer wall where the flights run, and left the box's empty corner walled
  // off around nothing. This extrudes the actual footprint: outer walls down
  // both arms, and the two inner walls that form the reflex corner.
  const spanX = B + straight * G, spanY = A + straight * G;

  const foot = new THREE.Shape();          // y negated: rotateX(-90) maps v to -z
  foot.moveTo(0, 0);
  foot.lineTo(spanX, 0);
  foot.lineTo(spanX, -A);
  foot.lineTo(B, -A);
  foot.lineTo(B, -spanY);
  foot.lineTo(0, -spanY);
  foot.closePath();

  const slabGeo = new THREE.ExtrudeGeometry(foot, { depth: .06, bevelEnabled: false });
  slabGeo.rotateX(-Math.PI / 2);
  const slab = new THREE.Mesh(slabGeo, new THREE.MeshStandardMaterial({ color: 0x6d6055, roughness: .95 }));
  slab.position.y = -.06;
  slab.receiveShadow = true;
  shaftGroup.add(slab);

  const wallGeo = new THREE.ExtrudeGeometry(foot, { depth: top, bevelEnabled: false });
  wallGeo.rotateX(-Math.PI / 2);
  const room = new THREE.Mesh(wallGeo, wallMat);
  room.receiveShadow = true;
  shaftGroup.add(room);

  // The bulkhead over the turn: a solid box down to the soffit line, not a
  // floating plate on a stick.
  const soffitH = straight * R + headroom * IN;
  const bulk = new THREE.Mesh(
    new THREE.BoxGeometry(B, top - soffitH + .4, A),
    new THREE.MeshStandardMaterial({ color: 0xb8ada0, roughness: .95 })
  );
  bulk.position.set(B / 2, soffitH + (top - soffitH + .4) / 2, A / 2);
  bulk.castShadow = bulk.receiveShadow = true;
  shaftGroup.add(bulk);

  // Its underside, marked, because that edge is the thing that gouges.
  const face = new THREE.Mesh(
    new THREE.BoxGeometry(B, .012, A),
    new THREE.MeshStandardMaterial({ color: 0xa3341f, roughness: .8 })
  );
  face.position.set(B / 2, soffitH, A / 2);
  shaftGroup.add(face);

  // Inner corner post.
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(.022, .022, soffitH, 14),
    new THREE.MeshStandardMaterial({ color: 0x8d5a3a, roughness: .7 })
  );
  post.position.set(B, soffitH / 2, A);
  post.castShadow = true;
  shaftGroup.add(post);

  scene.add(shaftGroup);
  placeObject();
  frameAll();
}

/* ------------------------------------------------------------------ *
 * The thing being carried
 * ------------------------------------------------------------------ */

function placeObject() {
  if (!scene) return;
  if (objectMesh) { scene.remove(objectMesh); objectMesh.geometry.dispose(); }

  const { length: L, width: W, height: H, shape } = M.object;
  // Red where the pose actually collides in three dimensions, green where it
  // is genuinely clear. Computed here, because the plan view cannot see the
  // treads rising underneath.
  M.touching = !poseIsClear();
  const colour = M.touching ? 0xe0603f : 0x3fb27f;
  const mat = new THREE.MeshStandardMaterial({
    color: colour, transparent: true, opacity: .55, roughness: .5,
    emissive: colour, emissiveIntensity: .12
  });

  const geo = shape === 'cylinder'
    ? new THREE.CylinderGeometry(W * IN / 2, W * IN / 2, L * IN, 28)
    : new THREE.BoxGeometry(L * IN, H * IN, W * IN);

  objectMesh = new THREE.Mesh(geo, mat);
  objectMesh.castShadow = true;
  objectMesh.add(dimensionLabel(L, W, H));
  objectMesh.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: colour })
  ));

  const tilt = (M.upright ? 90 : M.tilt) * Math.PI / 180;
  if (shape === 'cylinder') {
    // A cylinder's own axis is Y, so upright means leave it alone.
    objectMesh.rotation.z = M.upright ? 0 : Math.PI / 2;
  } else {
    objectMesh.rotation.z = tilt;
  }
  objectMesh.rotation.y = -M.yaw * Math.PI / 180;

  const straight = Math.max(1, M.treads - M.winders);
  const floorH = floorAtInches(M.pos.x, M.pos.y) * IN;
  const halfV = (Math.abs(L * Math.sin(tilt)) + Math.abs(H * Math.cos(tilt))) / 2 * IN;
  objectMesh.position.set(M.pos.x * IN, floorH + halfV + 0.02, M.pos.y * IN);
  scene.add(objectMesh);
}

/** A little sprite carrying the object's real size, always facing the camera. */
function dimensionLabel(L, W, H) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.62)';
  g.roundRect(0, 0, 512, 128, 18); g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 46px ui-monospace, monospace';
  g.textAlign = 'center';
  g.fillText(`${ftLocal(L)} × ${ftLocal(W)} × ${ftLocal(H)}`, 256, 82);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  sp.scale.set(1.0, 0.25, 1);
  sp.position.y = H * IN * 0.5 + 0.22;
  return sp;
}

function ftLocal(inches) {
  const f = Math.floor(inches / 12), r = Math.round((inches - f * 12) * 2) / 2;
  if (f === 0) return r + '"';
  return r === 0 ? f + "'" : f + "'" + r + '"';
}

function floorAtInches(x, y) {
  const straight = Math.max(1, M.treads - M.winders);
  if (y > M.a) {
    const i = Math.min(straight - 1, Math.max(0, Math.floor((y - M.a) / M.going)));
    return (straight + M.winders + i) * M.rise;
  }
  if (x > M.b) {
    const i = Math.min(straight - 1, Math.max(0, Math.floor((x - M.b) / M.going)));
    return (straight - 1 - i) * M.rise;
  }
  return straight * M.rise;
}

/** Point the camera at the whole shaft, from the angle that reads best. */
export function frameAll() {
  if (!shaftGroup || !camera) return;
  // Look at the turn from outside and above. Framing on the whole group puts
  // the camera inside two tall walls, which is what it was doing.
  const straight = Math.max(1, M.treads - M.winders);
  const reach = (Math.max(M.a, M.b) + straight * M.going) * IN;
  const t = new THREE.Vector3(M.b * IN * 0.5, straight * M.rise * IN * 0.7, M.a * IN * 0.5);
  const d = reach * 2.35;                       // stand well back
  camera.position.set(t.x + d * 0.72, t.y + d * 0.55, t.z + d * 0.86);
  controls.target.copy(t);
  controls.update();
}
