import * as THREE from 'three';
import { GEO, MAT } from './models';
import type { ItemKind } from './config';

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

interface Flight {
  mesh: THREE.Mesh;
  kind: ItemKind;
  t: number;
  dur: number;
  from: THREE.Vector3;
  to: () => THREE.Vector3;
  height: number;
  onLand: () => void;
}

/**
 * Pooled ore / crystal meshes flying on a quadratic Bezier arc. The end point is re-read every frame
 * (`to()`), so an item aimed at a moving pod or ship still lands on it.
 */
export class Flyers {
  private readonly pools: Record<ItemKind, THREE.Mesh[]> = { ore: [], crystal: [] };
  private readonly live: Flight[] = [];
  private readonly ctrl = new THREE.Vector3();
  private readonly end = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {}

  get count(): number {
    return this.live.length;
  }

  launch(kind: ItemKind, from: THREE.Vector3, to: () => THREE.Vector3, dur: number, height: number, onLand: () => void): void {
    const mesh = this.pools[kind].pop() ?? new THREE.Mesh(kind === 'ore' ? GEO.ore : GEO.crystal, kind === 'ore' ? MAT.ore : MAT.crystal);
    mesh.position.copy(from);
    mesh.visible = true;
    this.scene.add(mesh);
    this.live.push({ mesh, kind, t: 0, dur, from: from.clone(), to, height, onLand });
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const f = this.live[i];
      f.t += dt / f.dur;
      const p = Math.min(f.t, 1);
      const e = easeInOut(p);
      this.end.copy(f.to());
      this.ctrl.addVectors(f.from, this.end).multiplyScalar(0.5);
      this.ctrl.y += f.height;
      const a = (1 - e) * (1 - e);
      const b = 2 * (1 - e) * e;
      const c = e * e;
      f.mesh.position.set(
        a * f.from.x + b * this.ctrl.x + c * this.end.x,
        a * f.from.y + b * this.ctrl.y + c * this.end.y,
        a * f.from.z + b * this.ctrl.z + c * this.end.z,
      );
      f.mesh.rotation.x += dt * 9;
      f.mesh.rotation.y += dt * 7;
      if (p >= 1) {
        this.live.splice(i, 1);
        this.scene.remove(f.mesh);
        this.pools[f.kind].push(f.mesh);
        f.onLand();
      }
    }
  }
}

interface Spark {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  max: number;
}

/** Small pooled burst particles (purchases, ship departures, the finale). */
export class Sparks {
  private readonly pool: THREE.Mesh[] = [];
  private readonly live: Spark[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  burst(at: THREE.Vector3, count: number, mat: THREE.Material, speed = 5, life = 0.8): void {
    for (let i = 0; i < count; i++) {
      const mesh = this.pool.pop() ?? new THREE.Mesh(GEO.spark);
      mesh.material = mat;
      mesh.position.copy(at);
      mesh.scale.setScalar(1);
      this.scene.add(mesh);
      const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      const max = life * (0.6 + Math.random() * 0.6);
      this.live.push({ mesh, vel, life: max, max });
    }
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i];
      s.life -= dt;
      s.vel.multiplyScalar(1 - 2.2 * dt);
      s.vel.y -= 3 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += dt * 8;
      s.mesh.scale.setScalar(Math.max(0.01, s.life / s.max) * 1.6);
      if (s.life <= 0) {
        this.live.splice(i, 1);
        this.scene.remove(s.mesh);
        this.pool.push(s.mesh);
      }
    }
  }
}
