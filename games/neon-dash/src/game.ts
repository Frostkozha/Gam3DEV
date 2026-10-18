import * as THREE from 'three';

const LANES = [-2.2, 0, 2.2];
const TRACK_LENGTH = 720; // distance to the finish gate (~40 s of play)
const START_SPEED = 14;
const MAX_SPEED = 24;
const GRAVITY = 38;
const JUMP_VELOCITY = 12.5;
const MAX_LIVES = 3;
const VIEW_AHEAD = 90;

type Kind = 'coin' | 'low' | 'tall';
interface Thing {
  kind: Kind;
  lane: number;
  at: number; // track distance where it sits
  mesh: THREE.Object3D;
  done: boolean;
}

const $ = (id: string) => document.getElementById(id)!;

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(62, 1, 0.1, 200);
  private player = new THREE.Group();
  private grid: THREE.GridHelper;
  private gate: THREE.Group;
  private things: Thing[] = [];

  private coinGeo = new THREE.TorusGeometry(0.38, 0.12, 8, 20);
  private coinMat = new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0xb07800, emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.3 });
  private lowGeo = new THREE.BoxGeometry(1.9, 0.7, 0.5);
  private lowMat = new THREE.MeshStandardMaterial({ color: 0x47e8ff, emissive: 0x1aa8c8, emissiveIntensity: 1.1 });
  private tallGeo = new THREE.BoxGeometry(1.9, 3.2, 0.9);
  private tallMat = new THREE.MeshStandardMaterial({ color: 0xff3fb4, emissive: 0xb0186e, emissiveIntensity: 1.0 });

  private dist = 0;
  private speed = START_SPEED;
  private lane = 1;
  private x = 0;
  private y = 0;
  private vy = 0;
  private lives = MAX_LIVES;
  private coins = 0;
  private invuln = 0;
  private nextSpawn = 40;
  private started = false;
  private over = false;
  private time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.scene.background = new THREE.Color(0x08031a);
    this.scene.fog = new THREE.Fog(0x08031a, 25, VIEW_AHEAD);

    this.scene.add(new THREE.HemisphereLight(0xb08cff, 0x200830, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(3, 8, 5);
    this.scene.add(sun);

    // Floor: a dark slab with a scrolling neon grid on top.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 400), new THREE.MeshStandardMaterial({ color: 0x120628, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -150;
    this.scene.add(floor);
    this.grid = new THREE.GridHelper(200, 100, 0xff3fb4, 0x5a1a7a);
    this.grid.position.set(0, 0.01, -80);
    this.scene.add(this.grid);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 400), new THREE.MeshBasicMaterial({ color: 0x47e8ff }));
      rail.position.set(side * 3.4, 0.08, -150);
      this.scene.add(rail);
    }
    // Distant sun for the synthwave horizon.
    const disc = new THREE.Mesh(new THREE.CircleGeometry(22, 48), new THREE.MeshBasicMaterial({ color: 0xff6a3c, fog: false }));
    disc.position.set(0, 10, -190);
    this.scene.add(disc);

    this.buildPlayer();
    this.gate = this.buildGate();
    this.scene.add(this.gate);

    this.camera.position.set(0, 4.2, 7.5);
    this.camera.lookAt(0, 1, -8);

    this.bindInput(canvas);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    $('endBtn').addEventListener('click', () => this.reset());
    this.updateHud();
  }

  private buildPlayer(): void {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.45, 0.8, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff3fb4, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.25 }),
    );
    body.position.y = 0.9;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.2), new THREE.MeshBasicMaterial({ color: 0x47e8ff }));
    visor.position.set(0, 1.3, -0.38);
    const glow = new THREE.PointLight(0xff3fb4, 6, 6);
    glow.position.y = 1;
    this.player.add(body, visor, glow);
    this.scene.add(this.player);
  }

  private buildGate(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc93c });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.4), mat);
      post.position.set(side * 3.6, 3, 0);
      g.add(post);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.6, 0.4), mat);
    top.position.y = 6;
    g.add(top);
    return g;
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    let sx = 0;
    let sy = 0;
    let active = false;
    canvas.addEventListener('pointerdown', (e) => {
      sx = e.clientX;
      sy = e.clientY;
      active = true;
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!active) return;
      active = false;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 25) {
        // A tap steers toward the tapped half of the screen.
        this.input(e.clientX < window.innerWidth / 2 ? 'left' : 'right');
      } else if (Math.abs(dx) > Math.abs(dy)) {
        this.input(dx < 0 ? 'left' : 'right');
      } else if (dy < 0) {
        this.input('jump');
      }
    });
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') this.input('left');
      else if (k === 'arrowright' || k === 'd') this.input('right');
      else if (k === 'arrowup' || k === 'w' || k === ' ') this.input('jump');
    });
  }

  private input(action: 'left' | 'right' | 'jump'): void {
    if (this.over) return;
    if (!this.started) {
      this.started = true;
      $('tutorial').classList.add('hidden');
    }
    if (action === 'left') this.lane = Math.max(0, this.lane - 1);
    else if (action === 'right') this.lane = Math.min(2, this.lane + 1);
    else if (this.y <= 0.001) this.vy = JUMP_VELOCITY;
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait phones need a wider vertical FOV to see all three lanes.
    this.camera.fov = w < h ? 78 : 62;
    this.camera.updateProjectionMatrix();
  }

  /** Spawns one row of content: an obstacle pattern plus a coin trail through the free lane. */
  private spawnRow(at: number): void {
    const progress = at / TRACK_LENGTH;
    const free = Math.floor(Math.random() * 3);
    const blocked = progress > 0.35 && Math.random() < 0.5 ? 2 : 1;
    const lanes = [0, 1, 2].filter((l) => l !== free).sort(() => Math.random() - 0.5).slice(0, blocked);
    for (const l of lanes) {
      const kind: Kind = Math.random() < 0.4 ? 'low' : 'tall';
      const mesh = new THREE.Mesh(kind === 'low' ? this.lowGeo : this.tallGeo, kind === 'low' ? this.lowMat : this.tallMat);
      mesh.position.set(LANES[l], kind === 'low' ? 0.35 : 1.6, 0);
      this.add(kind, l, at, mesh);
    }
    for (let i = 0; i < 4; i++) {
      const coin = new THREE.Mesh(this.coinGeo, this.coinMat);
      coin.position.set(LANES[free], 1, 0);
      this.add('coin', free, at - 6 + i * 2.2, coin);
    }
  }

  private add(kind: Kind, lane: number, at: number, mesh: THREE.Object3D): void {
    this.scene.add(mesh);
    this.things.push({ kind, lane, at, mesh, done: false });
  }

  update(dt: number): void {
    this.time += dt;
    if (this.started && !this.over) this.step(dt);

    // Runner animation runs even before start so the scene feels alive.
    this.x += (LANES[this.lane] - this.x) * Math.min(1, dt * 14);
    this.player.position.set(this.x, this.y, 0);
    this.player.rotation.z = (LANES[this.lane] - this.x) * -0.15;
    this.player.children[0].position.y = 0.9 + (this.y === 0 && this.started && !this.over ? Math.abs(Math.sin(this.time * 14)) * 0.12 : 0);
    this.player.visible = this.invuln <= 0 || Math.floor(this.time * 16) % 2 === 0;

    for (const t of this.things) {
      t.mesh.position.z = this.dist - t.at;
      if (t.kind === 'coin') t.mesh.rotation.y += dt * 4;
    }
    this.gate.position.z = this.dist - TRACK_LENGTH;
    this.grid.position.z = -80 + (this.dist % 2);
    this.camera.position.x += (this.x * 0.4 - this.camera.position.x) * Math.min(1, dt * 5);
    this.renderer.render(this.scene, this.camera);
  }

  private step(dt: number): void {
    this.speed = START_SPEED + (MAX_SPEED - START_SPEED) * Math.min(1, this.dist / TRACK_LENGTH);
    this.dist += this.speed * dt;
    this.invuln = Math.max(0, this.invuln - dt);

    if (this.vy !== 0 || this.y > 0) {
      this.vy -= GRAVITY * dt;
      this.y = Math.max(0, this.y + this.vy * dt);
      if (this.y === 0) this.vy = 0;
    }

    while (this.nextSpawn < Math.min(this.dist + VIEW_AHEAD, TRACK_LENGTH - 20)) {
      this.spawnRow(this.nextSpawn);
      // Rows get closer together as the run speeds up.
      this.nextSpawn += 22 - 8 * (this.nextSpawn / TRACK_LENGTH);
    }

    for (const t of this.things) {
      if (t.done) continue;
      const dz = this.dist - t.at;
      if (Math.abs(dz) > 0.7) continue;
      if (Math.abs(this.x - LANES[t.lane]) > 1.1) continue;
      if (t.kind === 'coin') {
        if (this.y > 2) continue;
        t.done = true;
        t.mesh.visible = false;
        this.coins++;
        this.bump('coins');
        this.popup('+1', false);
      } else if (this.invuln <= 0 && !(t.kind === 'low' && this.y > 0.75)) {
        t.done = true;
        this.hit();
      }
    }

    this.things = this.things.filter((t) => {
      if (this.dist - t.at < 12) return true;
      this.scene.remove(t.mesh);
      return false;
    });

    ($('progressFill') as HTMLElement).style.width = `${Math.min(100, (this.dist / TRACK_LENGTH) * 100)}%`;
    if (this.dist >= TRACK_LENGTH) this.end(true);
    this.updateHud();
  }

  private hit(): void {
    this.lives--;
    this.invuln = 1.2;
    this.bump('lives', 'hit');
    this.popup('OUCH!', true);
    const flash = $('flash');
    flash.style.opacity = '0.35';
    setTimeout(() => (flash.style.opacity = '0'), 120);
    if (this.lives <= 0) this.end(false);
  }

  private end(won: boolean): void {
    this.over = true;
    this.updateHud();
    const card = $('endcard');
    card.classList.toggle('lose', !won);
    $('endTitle').textContent = won ? 'YOU MADE IT!' : 'CRASHED!';
    $('endSub').textContent = won ? 'Neon gate cleared. Can you grab every coin?' : `${Math.round((this.dist / TRACK_LENGTH) * 100)}% of the track — so close!`;
    $('endCoins').textContent = String(this.coins);
    setTimeout(() => card.classList.remove('hidden'), won ? 300 : 700);
  }

  private reset(): void {
    for (const t of this.things) this.scene.remove(t.mesh);
    this.things = [];
    this.dist = 0;
    this.speed = START_SPEED;
    this.lane = 1;
    this.y = this.vy = 0;
    this.lives = MAX_LIVES;
    this.coins = 0;
    this.invuln = 0;
    this.nextSpawn = 40;
    this.over = false;
    this.started = false;
    $('endcard').classList.add('hidden');
    $('tutorial').classList.remove('hidden');
    ($('progressFill') as HTMLElement).style.width = '0%';
    this.updateHud();
  }

  private updateHud(): void {
    $('coinTxt').textContent = String(this.coins);
    $('lives').innerHTML = Array.from({ length: MAX_LIVES }, (_, i) => `<span class="${i < this.lives ? '' : 'gone'}">♥</span>`).join('');
  }

  private bump(id: string, cls = 'bump'): void {
    const el = $(id);
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  private popup(text: string, bad: boolean): void {
    const p = this.player.position.clone().add(new THREE.Vector3(0, 2.2, 0)).project(this.camera);
    const el = document.createElement('div');
    el.className = bad ? 'pop bad' : 'pop';
    el.textContent = text;
    el.style.left = `${((p.x + 1) / 2) * window.innerWidth}px`;
    el.style.top = `${((1 - p.y) / 2) * window.innerHeight}px`;
    $('popups').appendChild(el);
    setTimeout(() => el.remove(), 900);
  }
}
