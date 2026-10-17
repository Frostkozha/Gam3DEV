import * as THREE from 'three';

// Procedural low-poly models: everything is built from three.js primitives at boot, no asset files.
// Glowing parts use emissive materials above the bloom threshold.

const std = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6, metalness: 0.25, ...extra });
const glow = (emissive: number, intensity: number, color = 0x000000) =>
  new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, flatShading: true });

export const MAT = {
  hull: std(0xdfe6f2, { metalness: 0.35, roughness: 0.45 }),
  dark: std(0x2a3350, { metalness: 0.4 }),
  panel: std(0x4b5a8a),
  rock: std(0x6b5b52, { roughness: 0.95, metalness: 0.05 }),
  planet: std(0x6b4bd6, { roughness: 0.9, metalness: 0 }),
  cyan: glow(0x3ff2ff, 2.4),
  cyanSoft: glow(0x3ff2ff, 0.7),
  orange: glow(0xff8a2a, 2.2),
  ore: glow(0xff7a1a, 1.7, 0x5a2a00),
  crystal: glow(0x47e8ff, 1.9, 0x0e4a5c),
  gold: new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0xb07800, emissiveIntensity: 0.9, metalness: 0.8, roughness: 0.3 }),
  red: glow(0xff3344, 2.2),
  off: std(0x1b2238),
  shipHulls: [std(0xff9f43), std(0x7bed9f), std(0xa29bfe)],
  shipAngry: glow(0xff2233, 1.4, 0x400008),
};

export const GEO = {
  ore: new THREE.DodecahedronGeometry(0.2, 0),
  crystal: new THREE.OctahedronGeometry(0.22, 0),
  spark: new THREE.OctahedronGeometry(0.09, 0),
};

/** Seeded random in [0, 1) (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Displace a polyhedron's vertices outward by noise. Polyhedron geometries are non-indexed, so the
 * offset is keyed by the rounded position: shared corners move together and faces stay closed.
 */
function lumpy(geo: THREE.BufferGeometry, amount: number, rand: () => number): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const offsets = new Map<string, number>();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let k = offsets.get(key);
    if (k === undefined) {
      k = 1 + (rand() - 0.5) * amount;
      offsets.set(key, k);
    }
    v.multiplyScalar(k);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => new THREE.Mesh(g, m);

export interface DroneModel {
  root: THREE.Group;
  ring: THREE.Mesh;
  drill: THREE.Mesh;
  flames: THREE.Mesh[];
}

/** The mining drone. Nose along +Z (Object3D.lookAt points +Z at the target). */
export function makeDrone(): DroneModel {
  const root = new THREE.Group();
  const body = mesh(new THREE.IcosahedronGeometry(1, 1), MAT.hull);
  body.scale.set(0.7, 0.42, 1.0);
  root.add(body);
  const cockpit = mesh(new THREE.IcosahedronGeometry(0.32, 1), MAT.cyan);
  cockpit.position.set(0, 0.3, 0.35);
  cockpit.scale.set(1, 0.6, 1.3);
  root.add(cockpit);
  const drill = mesh(new THREE.ConeGeometry(0.24, 0.7, 6), MAT.dark);
  drill.rotation.x = Math.PI / 2;
  drill.position.z = 1.15;
  root.add(drill);
  const flames: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const pod = mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.95, 8), MAT.panel);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(side * 0.82, -0.05, -0.15);
    root.add(pod);
    const flame = mesh(new THREE.ConeGeometry(0.2, 0.6, 8), MAT.orange);
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(side * 0.82, -0.05, -0.85);
    root.add(flame);
    flames.push(flame);
  }
  const ring = mesh(new THREE.TorusGeometry(1.05, 0.05, 6, 28), MAT.cyan);
  ring.rotation.x = Math.PI / 2;
  root.add(ring);
  return { root, ring, drill, flames };
}

export interface PodModel {
  root: THREE.Group;
  /** perPod item meshes on the deck; the cargo view shows / hides and re-skins them. */
  slots: THREE.Mesh[];
}

export function makePod(perPod: number): PodModel {
  const root = new THREE.Group();
  const deck = mesh(new THREE.BoxGeometry(1.15, 0.32, 1.25), MAT.hull);
  root.add(deck);
  const keel = mesh(new THREE.BoxGeometry(0.8, 0.22, 1.0), MAT.dark);
  keel.position.y = -0.25;
  root.add(keel);
  const light = mesh(new THREE.BoxGeometry(1.2, 0.05, 0.08), MAT.cyanSoft);
  light.position.set(0, 0.0, 0.64);
  root.add(light);
  const slots: THREE.Mesh[] = [];
  for (let i = 0; i < perPod; i++) {
    const s = mesh(GEO.ore, MAT.ore);
    const col = i % 2;
    const row = Math.floor(i / 2);
    s.position.set(col ? 0.26 : -0.26, 0.38, row ? -0.28 : 0.28);
    s.visible = false;
    root.add(s);
    slots.push(s);
  }
  return { root, slots };
}

export function makeAsteroid(radius: number, seed: number): THREE.Group {
  const rand = rng(seed);
  const g = new THREE.Group();
  const rock = mesh(lumpy(new THREE.IcosahedronGeometry(radius, 1), 0.45, rand), MAT.rock);
  g.add(rock);
  const veins = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < veins; i++) {
    const dir = new THREE.Vector3(rand() - 0.5, rand() - 0.2, rand() - 0.5).normalize();
    const c = mesh(new THREE.OctahedronGeometry(radius * (0.22 + rand() * 0.12), 0), MAT.ore);
    c.position.copy(dir.multiplyScalar(radius * 0.9));
    c.lookAt(0, 0, 0);
    g.add(c);
  }
  return g;
}

export interface RefineryModel {
  root: THREE.Group;
  ring: THREE.Mesh;
  core: THREE.Mesh;
  /** Where unloaded ore lands (local space of root). */
  hopper: THREE.Object3D;
  /** Output crystal stack, shown up to the output count. */
  stack: THREE.Mesh[];
}

/** Refinery; its local +Z faces the loop. */
export function makeRefinery(outputCap: number): RefineryModel {
  const root = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(2.3, 2.7, 0.6, 8), MAT.dark);
  root.add(base);
  const tower = mesh(new THREE.CylinderGeometry(0.9, 1.25, 2.8, 8), MAT.hull);
  tower.position.y = 1.7;
  root.add(tower);
  const core = mesh(new THREE.IcosahedronGeometry(0.75, 0), MAT.crystal);
  core.position.y = 3.6;
  root.add(core);
  const ring = mesh(new THREE.TorusGeometry(1.8, 0.12, 6, 28), MAT.cyan);
  ring.position.y = 2.4;
  ring.rotation.x = Math.PI / 2;
  root.add(ring);
  for (const a of [0, 2, 4]) {
    const fin = mesh(new THREE.BoxGeometry(0.18, 2.0, 1.1), MAT.panel);
    fin.position.set(Math.cos(a) * 1.2, 1.4, Math.sin(a) * 1.2);
    fin.rotation.y = -a;
    root.add(fin);
  }
  const hopperMat = MAT.panel.clone();
  hopperMat.side = THREE.DoubleSide;
  const hopperMesh = mesh(new THREE.CylinderGeometry(0.75, 0.45, 0.8, 6, 1, true), hopperMat);
  hopperMesh.position.set(-1.6, 0.9, 1.6);
  root.add(hopperMesh);
  const hopper = new THREE.Object3D();
  hopper.position.set(-1.6, 1.0, 1.6);
  root.add(hopper);
  const pad = mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.15, 8), MAT.cyanSoft);
  pad.position.set(1.6, 0.35, 1.6);
  root.add(pad);
  const stack: THREE.Mesh[] = [];
  for (let i = 0; i < outputCap; i++) {
    const c = mesh(GEO.crystal, MAT.crystal);
    const layer = Math.floor(i / 4);
    const k = i % 4;
    c.position.set(1.6 + (k % 2 ? 0.25 : -0.25), 0.62 + layer * 0.4, 1.6 + (k > 1 ? 0.25 : -0.25));
    c.visible = false;
    root.add(c);
    stack.push(c);
  }
  return { root, ring, core, hopper, stack };
}

export interface DockModel {
  root: THREE.Group;
  beacon: THREE.Mesh;
}

/** Trading dock; its local +Z faces the loop, ships queue along local -Z. */
export function makeDock(): DockModel {
  const root = new THREE.Group();
  const deck = mesh(new THREE.CylinderGeometry(2.0, 2.2, 0.35, 10), MAT.dark);
  root.add(deck);
  const mast = mesh(new THREE.CylinderGeometry(0.15, 0.2, 3.2, 6), MAT.hull);
  // The mast stands at the rim: ship 0 parks over the deck centre.
  mast.position.set(1.7, 1.6, 0.9);
  root.add(mast);
  const beacon = mesh(new THREE.IcosahedronGeometry(0.35, 0), MAT.gold);
  beacon.position.set(1.7, 3.4, 0.9);
  root.add(beacon);
  const rim = mesh(new THREE.TorusGeometry(2.05, 0.07, 6, 32), MAT.cyan);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.2;
  root.add(rim);
  const arm = mesh(new THREE.BoxGeometry(0.4, 0.2, 2.6), MAT.panel);
  arm.position.set(0, 0.3, -2.2);
  root.add(arm);
  return { root, beacon };
}

export interface ShipModel {
  root: THREE.Group;
  hull: THREE.Mesh;
  lights: THREE.Mesh[];
  flame: THREE.Mesh;
}

/** Cargo ship. Nose along +Z. */
export function makeShip(variant: number, need: number): ShipModel {
  const root = new THREE.Group();
  const hullMat = MAT.shipHulls[variant % MAT.shipHulls.length];
  const hull = mesh(new THREE.ConeGeometry(0.75, 2.6, 6), hullMat);
  hull.rotation.x = Math.PI / 2;
  root.add(hull);
  const wings = mesh(new THREE.BoxGeometry(2.6, 0.12, 0.9), MAT.dark);
  wings.position.z = -0.5;
  root.add(wings);
  const fin = mesh(new THREE.BoxGeometry(0.1, 0.7, 0.8), MAT.dark);
  fin.position.set(0, 0.45, -0.8);
  root.add(fin);
  const flame = mesh(new THREE.ConeGeometry(0.35, 0.9, 8), MAT.orange);
  flame.rotation.x = -Math.PI / 2;
  flame.position.z = -1.65;
  root.add(flame);
  const lights: THREE.Mesh[] = [];
  for (let i = 0; i < need; i++) {
    const l = mesh(GEO.crystal, MAT.off);
    l.position.set((i - (need - 1) / 2) * 0.55, 0.55, -0.1);
    root.add(l);
    lights.push(l);
  }
  return { root, hull, lights, flame };
}

export function makePlanet(): THREE.Group {
  const g = new THREE.Group();
  const ball = mesh(lumpy(new THREE.IcosahedronGeometry(5.2, 3), 0.06, rng(7)), MAT.planet);
  g.add(ball);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xb79cff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(6.4, 8.4, 64), ringMat);
  ring.rotation.x = -Math.PI / 2 + 0.35;
  g.add(ring);
  return g;
}

export function makeStarfield(count: number): THREE.Points {
  const rand = rng(99);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const r = 140 + rand() * 60;
    const s = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * s * r, u * r, Math.sin(a) * s * r], i * 3);
    const tint = 0.6 + rand() * 0.4;
    col.set([tint, tint * (0.85 + rand() * 0.15), 1], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.9, vertexColors: true, sizeAttenuation: true, depthWrite: false }));
}

/** A glowing beam between two points (unit cylinder stretched along Y). */
export function makeBeam(color: number): THREE.Mesh {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  return new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6, 1, true), m);
}

const UP = new THREE.Vector3(0, 1, 0);
export function placeBeam(beam: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  beam.position.copy(a).addScaledVector(dir, 0.5);
  beam.scale.set(1, len, 1);
  beam.quaternion.setFromUnitVectors(UP, dir.normalize());
}
