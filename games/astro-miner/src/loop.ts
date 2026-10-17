import * as THREE from 'three';

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/**
 * The closed flight path: a wobbly ellipse in the XZ plane around the planet. Everything on it is
 * addressed by arc length (distance along the loop), like the train spline in Train Miner.
 */
export class Loop {
  readonly curve: THREE.CatmullRomCurve3;
  readonly length: number;

  constructor() {
    const pts: THREE.Vector3[] = [];
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wob = 1 + 0.08 * Math.sin(a * 3 + 0.6);
      pts.push(new THREE.Vector3(Math.cos(a) * 15 * wob, 0, Math.sin(a) * 10 * wob));
    }
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.curve.arcLengthDivisions = 1200;
    this.length = this.curve.getLength();
  }

  wrap(d: number): number {
    const l = this.length;
    return ((d % l) + l) % l;
  }

  pointAt(d: number, out = new THREE.Vector3()): THREE.Vector3 {
    return this.curve.getPointAt(this.wrap(d) / this.length, out);
  }

  tangentAt(d: number, out = new THREE.Vector3()): THREE.Vector3 {
    return this.curve.getTangentAt(this.wrap(d) / this.length, out);
  }

  /** Unit vector in XZ pointing away from the loop's centre. */
  outwardAt(d: number, out = new THREE.Vector3()): THREE.Vector3 {
    const t = this.tangentAt(d, tmpA);
    out.set(t.z, 0, -t.x).normalize();
    if (out.dot(this.pointAt(d, tmpB)) < 0) out.negate();
    return out;
  }

  /** Is `d` inside the (possibly wrapping) interval [start, end]? */
  inRange(d: number, start: number, end: number): boolean {
    return this.wrap(d - start) <= this.wrap(end - start);
  }
}
