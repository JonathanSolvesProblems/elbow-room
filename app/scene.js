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

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, 1, 0.05, 200);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.8;
  controls.maxDistance = 30;
  controls.maxPolarAngle = Math.PI * 0.495;   // never go under the floor

  scene.add(new THREE.HemisphereLight(0xfff4e2, 0x30281f, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(3, 6, 2.5);
  scene.add(key);

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
  const wallMat = new THREE.MeshStandardMaterial({ map: photo('/docs/tex-wall.jpg', 4), roughness: 1,
                                                   side: THREE.BackSide });

  const tread = (w, d, h, x, y, z) => {
    const g = new THREE.BoxGeometry(w, R, d);
    const m = new THREE.Mesh(g, [woodSide, woodSide, woodTop, woodSide, woodSide, woodSide]);
    m.position.set(x, z, y);
    shaftGroup.add(m);
  };

  let h = 0;
  // lower arm, climbing toward the turn
  for (let i = 0; i < straight; i++) {
    const x = B + (straight - i - 0.5) * G;
    tread(G, A, R, x, A / 2, h + R / 2);
    h += R;
  }
  // winders: wedges about the inner corner
  for (let i = 0; i < winders; i++) {
    const t0 = Math.PI + (i / winders) * Math.PI / 2;
    const t1 = Math.PI + ((i + 1) / winders) * Math.PI / 2;
    const s = new THREE.Shape();
    s.moveTo(B, A);
    const rad = Math.hypot(B, A) * 1.02;
    s.lineTo(B + Math.cos(t0) * rad, A + Math.sin(t0) * rad);
    s.lineTo(B + Math.cos(t1) * rad, A + Math.sin(t1) * rad);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: R, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, woodTop);
    m.position.y = h + R;
    shaftGroup.add(m);
    h += R;
  }
  // upper arm, climbing away
  for (let i = 0; i < straight; i++) {
    const y = A + (i + 0.5) * G;
    tread(B, G, R, B / 2, y, h + R / 2);
    h += R;
  }

  // Outer walls
  const ext = Math.max(A, B) + straight * G;
  const top = h + headroom * IN;
  const w1 = new THREE.Mesh(new THREE.PlaneGeometry(ext + B, top), wallMat);
  w1.position.set((ext + B) / 2 - B, top / 2, 0);
  shaftGroup.add(w1);
  const w2 = new THREE.Mesh(new THREE.PlaneGeometry(ext + A, top), wallMat);
  w2.rotation.y = Math.PI / 2;
  w2.position.set(0, top / 2, (ext + A) / 2 - A);
  shaftGroup.add(w2);

  // The soffit over the turn: the ceiling that stops you tilting
  const soffitH = straight * R + headroom * IN;
  const sof = new THREE.Mesh(
    new THREE.BoxGeometry(B, 0.03, A),
    new THREE.MeshStandardMaterial({ color: 0xa3341f, transparent: true, opacity: .45, roughness: .9 })
  );
  sof.position.set(B / 2, soffitH, A / 2);
  shaftGroup.add(sof);

  // Inner corner: the thing that stops everything
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, soffitH, 12),
    new THREE.MeshStandardMaterial({ color: 0xa3341f })
  );
  post.position.set(B, soffitH / 2, A);
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
  const d = reach * 1.55;
  camera.position.set(t.x + d * 0.85, t.y + d * 0.72, t.z + d * 0.95);
  controls.target.copy(t);
  controls.update();
}
