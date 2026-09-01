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
  tilt: 0, upright: false, blocked: true,
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
  controls.minDistance = 0.8;
  controls.maxDistance = 30;
  controls.maxPolarAngle = Math.PI * 0.495;   // never go under the floor

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
  renderer.render(scene, camera);
}

export function dispose() { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); }

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

  // Treads run down to the floor rather than floating, which is what a flight
  // actually looks like from the side and what was missing before.
  const tread = (w, d, topZ, x, y) => {
    const g = new THREE.BoxGeometry(w, topZ, d);
    const m = new THREE.Mesh(g, [woodSide, woodSide, woodTop, woodSide, woodSide, woodSide]);
    m.position.set(x, topZ / 2, y);
    m.castShadow = m.receiveShadow = true;
    shaftGroup.add(m);
  };

  let h = 0;
  for (let i = 0; i < straight; i++) {
    const x = B + (straight - i - 0.5) * G;
    tread(G, A, h + R, x, A / 2);
    h += R;
  }
  for (let i = 0; i < winders; i++) {
    const t0 = Math.PI + (i / winders) * Math.PI / 2;
    const t1 = Math.PI + ((i + 1) / winders) * Math.PI / 2;
    const sh = new THREE.Shape();
    sh.moveTo(B, A);
    const rad = Math.hypot(B, A) * 1.02;
    sh.lineTo(B + Math.cos(t0) * rad, A + Math.sin(t0) * rad);
    sh.lineTo(B + Math.cos(t1) * rad, A + Math.sin(t1) * rad);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: h + R, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, [woodTop, woodSide]);
    m.position.y = h + R;
    m.castShadow = m.receiveShadow = true;
    shaftGroup.add(m);
    h += R;
  }
  for (let i = 0; i < straight; i++) {
    const y = A + (i + 0.5) * G;
    tread(B, G, h + R, B / 2, y);
    h += R;
  }

  const ext = Math.max(A, B) + straight * G;
  const top = h + headroom * IN;

  // Floor slab at the bottom of the flight.
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(ext + B + .6, .06, ext + A + .6),
    new THREE.MeshStandardMaterial({ color: 0x6d6055, roughness: .95 })
  );
  slab.position.set((ext + B) / 2 - B, -.03, (ext + A) / 2 - A);
  slab.receiveShadow = true;
  shaftGroup.add(slab);

  // The room, as an inside-out box. Back faces only, so from outside you see
  // straight in and from within you are surrounded.
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(ext + B + .6, top + .4, ext + A + .6),
    wallMat
  );
  room.position.set((ext + B) / 2 - B, (top + .4) / 2 - .05, (ext + A) / 2 - A);
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
  const colour = M.blocked ? 0xe0603f : 0x3fb27f;
  const mat = new THREE.MeshStandardMaterial({
    color: colour, transparent: true, opacity: .55, roughness: .5,
    emissive: colour, emissiveIntensity: .12
  });

  const geo = shape === 'cylinder'
    ? new THREE.CylinderGeometry(W * IN / 2, W * IN / 2, L * IN, 28)
    : new THREE.BoxGeometry(L * IN, H * IN, W * IN);

  objectMesh = new THREE.Mesh(geo, mat);
  objectMesh.castShadow = true;
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
