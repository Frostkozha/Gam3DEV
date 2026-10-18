import * as THREE from 'three';

// Tunables.
const H = 0.5; // block height
const START = 3; // base block width and depth
const GOAL = 20; // floors to win
const RANGE = 4.2; // how far the sliding block travels from the centre
const PERFECT = 0.12; // offset under which a drop snaps perfectly
const SPEED0 = 3.0;
const SPEEDUP = 0.11; // per floor
const SPEEDMAX = 5.2;
const GROW = 0.15; // perfect streaks of 3+ widen the block again, up to START

type Axis = 'x' | 'z';
interface Block { mesh: THREE.Mesh; x: number; z: number; w: number; d: number }
interface Debris { mesh: THREE.Mesh; vy: number; vx: number; vz: number; spin: THREE.Vector3; life: number }

const hue = (i: number) => new THREE.Color().setHSL((0.56 + i * 0.037) % 1, 0.62, 0.6);

// Session state: the stack, the sliding block, overhang cutting, debris physics, camera follow, win/lose.
export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private stack: Block[] = [];
  private moving: Block | null = null;
  private axis: Axis = 'x';
  private dir = 1;
  private debris: Debris[] = [];
  private rings: THREE.Mesh[] = [];
  private camY = 0;
  private over = false;
  private combo = 0;
  private perfects = 0;
  private bgFrom = new THREE.Color(0x1c2440);
  private ui = {
    floor: document.getElementById('floor')!,
    bar: document.getElementById('barFill')!,
    perfect: document.getElementById('perfect')!,
    hint: document.getElementById('hint')!,
  };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 10, 6);
    this.scene.add(sun);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    window.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('#endcard')) return;
      this.drop();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') this.drop();
    });
    document.getElementById('endBtn')!.addEventListener('click', () => this.restart());
    this.reset();
  }

  debugWin(): void {
    this.end(true);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    // Keep enough width for the sliding range on phones, enough height on desktop.
    let halfW = 5.2;
    let halfH = halfW / aspect;
    if (halfH < 6.5) {
      halfH = 6.5;
      halfW = halfH * aspect;
    }
    Object.assign(this.camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    this.camera.updateProjectionMatrix();
  }

  private makeBlock(x: number, z: number, w: number, d: number, level: number): Block {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), new THREE.MeshLambertMaterial({ color: hue(level) }));
    mesh.position.set(x, level * H, z);
    this.scene.add(mesh);
    return { mesh, x, z, w, d };
  }

  private spawnNext(): void {
    const top = this.stack[this.stack.length - 1];
    const level = this.stack.length;
    this.axis = level % 2 ? 'x' : 'z';
    this.dir = 1;
    const b = this.makeBlock(top.x, top.z, top.w, top.d, level);
    b[this.axis] = -RANGE;
    b.mesh.position[this.axis] = -RANGE;
    this.moving = b;
  }

  private drop(): void {
    if (this.over || !this.moving) return;
    this.ui.hint.classList.add('hidden');
    const m = this.moving;
    const top = this.stack[this.stack.length - 1];
    const a = this.axis;
    const size = a === 'x' ? m.w : m.d;
    const delta = m[a] - top[a];
    const overlap = size - Math.abs(delta);
    this.moving = null;

    if (overlap <= 0) {
      // Missed the tower completely: the whole block falls.
      this.scene.remove(m.mesh);
      this.addDebris(m.mesh, a, Math.sign(delta));
      this.end(false);
      return;
    }

    if (Math.abs(delta) < PERFECT) {
      m[a] = top[a];
      this.combo++;
      this.perfects++;
      if (this.combo >= 3) {
        // Reward streaks by widening the block back toward full size.
        if (a === 'x') m.w = Math.min(START, m.w + GROW);
        else m.d = Math.min(START, m.d + GROW);
      }
      this.reshape(m);
      this.ring(m);
      this.ui.perfect.textContent = this.combo >= 3 ? `PERFECT ×${this.combo}` : 'PERFECT!';
      this.ui.perfect.classList.remove('show');
      void this.ui.perfect.offsetWidth; // restart the CSS animation
      this.ui.perfect.classList.add('show');
    } else {
      this.combo = 0;
      const sign = Math.sign(delta);
      const keepCentre = top[a] + delta / 2;
      const cut = Math.abs(delta);
      const cutCentre = keepCentre + sign * (overlap / 2 + cut / 2);
      // The falling chunk.
      const cw = a === 'x' ? cut : m.w;
      const cd = a === 'z' ? cut : m.d;
      const chunk = new THREE.Mesh(new THREE.BoxGeometry(cw, H, cd), (m.mesh.material as THREE.Material).clone());
      chunk.position.copy(m.mesh.position);
      chunk.position[a] = cutCentre;
      this.scene.add(chunk);
      this.addDebris(chunk, a, sign);
      // The part that stays.
      m[a] = keepCentre;
      if (a === 'x') m.w = overlap;
      else m.d = overlap;
      this.reshape(m);
    }

    this.stack.push(m);
    const floors = this.stack.length - 1;
    this.ui.floor.textContent = `${floors}`;
    this.ui.bar.style.width = `${Math.min(100, (floors / GOAL) * 100)}%`;
    if (floors >= GOAL) this.end(true);
    else this.spawnNext();
  }

  private reshape(b: Block): void {
    b.mesh.geometry.dispose();
    b.mesh.geometry = new THREE.BoxGeometry(b.w, H, b.d);
    b.mesh.position.x = b.x;
    b.mesh.position.z = b.z;
  }

  private addDebris(mesh: THREE.Mesh, a: Axis, sign: number): void {
    const push = sign * 1.5;
    this.debris.push({
      mesh,
      vy: 0,
      vx: a === 'x' ? push : 0,
      vz: a === 'z' ? push : 0,
      spin: new THREE.Vector3(a === 'z' ? sign * 2.5 : 0, 0, a === 'x' ? -sign * 2.5 : 0),
      life: 2.5,
    });
  }

  private ring(b: Block): void {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(b.w + 0.1, 0.02, b.d + 0.1));
    const ring = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true }));
    ring.position.set(b.x, b.mesh.position.y - H / 2, b.z);
    this.scene.add(ring);
    this.rings.push(ring as unknown as THREE.Mesh);
  }

  update(dt: number): void {
    if (this.moving) {
      const m = this.moving;
      const speed = Math.min(SPEEDMAX, SPEED0 + SPEEDUP * this.stack.length);
      m[this.axis] += this.dir * speed * dt;
      if (Math.abs(m[this.axis]) > RANGE) {
        m[this.axis] = Math.sign(m[this.axis]) * RANGE;
        this.dir *= -1;
      }
      m.mesh.position[this.axis] = m[this.axis];
    }

    for (const d of this.debris.slice()) {
      d.vy -= 18 * dt;
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt;
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      d.life -= dt;
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        this.debris.splice(this.debris.indexOf(d), 1);
      }
    }

    for (const r of this.rings.slice()) {
      const mat = r.material as THREE.LineBasicMaterial;
      r.scale.x += dt * 1.6;
      r.scale.z += dt * 1.6;
      mat.opacity -= dt * 2;
      if (mat.opacity <= 0) {
        this.scene.remove(r);
        r.geometry.dispose();
        this.rings.splice(this.rings.indexOf(r), 1);
      }
    }

    // Camera rises with the tower; the sky darkens toward night as it grows.
    const target = Math.max(0, (this.stack.length - 4) * H);
    this.camY += (target - this.camY) * Math.min(1, dt * 4);
    this.camera.position.set(8, this.camY + 8, 8);
    this.camera.lookAt(0, this.camY, 0);
    const t = Math.min(1, this.stack.length / GOAL);
    (this.scene.background as THREE.Color).copy(this.bgFrom).lerp(new THREE.Color(0x0b0b24), t * 0.7).offsetHSL(0, 0, 0.1 - t * 0.1);

    this.renderer.render(this.scene, this.camera);
  }

  private end(win: boolean): void {
    if (this.over) return;
    this.over = true;
    this.moving = null;
    const floors = this.stack.length - 1;
    const card = document.getElementById('endcard')!;
    card.classList.toggle('lose', !win);
    document.getElementById('endTitle')!.textContent = win ? 'SKY HIGH!' : 'TOWER TOPPLED';
    document.getElementById('endSub')!.textContent = win ? `You stacked all ${GOAL} floors` : `You stacked ${floors} of ${GOAL} floors`;
    document.getElementById('endScore')!.textContent = `${this.perfects} perfect drops`;
    setTimeout(() => card.classList.remove('hidden'), win ? 700 : 1100);
  }

  private reset(): void {
    for (const b of this.stack) this.scene.remove(b.mesh);
    if (this.moving) this.scene.remove(this.moving.mesh);
    for (const d of this.debris) this.scene.remove(d.mesh);
    for (const r of this.rings) this.scene.remove(r);
    this.stack = [];
    this.debris = [];
    this.rings = [];
    this.over = false;
    this.combo = 0;
    this.perfects = 0;
    this.camY = 0;
    this.scene.background = this.bgFrom.clone();
    // A tall plinth so the tower stands on something.
    const base = this.makeBlock(0, 0, START, START, 0);
    base.mesh.scale.y = 8;
    base.mesh.position.y = -H * 3.5;
    this.stack.push(base);
    this.ui.floor.textContent = '0';
    this.ui.bar.style.width = '0%';
    this.ui.hint.classList.remove('hidden');
    this.spawnNext();
  }

  private restart(): void {
    document.getElementById('endcard')!.classList.add('hidden');
    this.reset();
  }
}
