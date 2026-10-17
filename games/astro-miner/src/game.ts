import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CFG, type ItemKind, type ZoneId } from './config';
import { Loop } from './loop';
import { Flyers, Sparks } from './fx';
import { UI, type CardView } from './ui';
import {
  MAT, makeAsteroid, makeBeam, makeDock, makeDrone, makePlanet, makePod, makeRefinery, makeShip, makeStarfield, placeBeam,
  type DockModel, type DroneModel, type PodModel, type RefineryModel, type ShipModel,
} from './models';

type State = 'play' | 'finale' | 'won' | 'lost';

interface Zone {
  id: ZoneId;
  start: number;
  end: number;
  center: number;
  marker: THREE.Mesh;
}

interface Ship {
  model: ShipModel;
  filled: number;
  /** Crystals in flight towards it. */
  pending: number;
  leaving: boolean;
  /** Seconds since it started leaving. */
  t: number;
  away: THREE.Vector3;
}

const V = () => new THREE.Vector3();

/**
 * Astro Miner: the whole session. Structure follows the Train Miner reference: one hold-to-move vehicle on
 * a closed path, stations as zones along it that trade with the cargo when the vehicle stops, a production
 * chain (asteroid ore -> refinery crystals -> ships), coin upgrades, three automations that end the round,
 * and an "empty lap" fail counter (FreezeFail there, unserved ships here).
 */
export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly ui = new UI();
  private readonly loop = new Loop();
  private readonly flyers: Flyers;
  private readonly sparks: Sparks;

  private state: State = 'play';
  private time = 0;
  private timers: { at: number; fn: () => void }[] = [];

  // Drone and cargo
  private readonly drone: DroneModel;
  private readonly pods: PodModel[] = [];
  private dist = 0;
  private speed = 0;
  private holding = false;
  private speedLevel = 0;
  private cargo: ItemKind[] = [];
  private incoming = 0;
  private transferTimer = 0;
  private lastTransferAt = -10;
  private lastInputAt = 0;
  private everMoved = false;

  // Stations
  private readonly zones: Zone[] = [];
  private readonly asteroids: THREE.Group[] = [];
  private readonly refinery: RefineryModel;
  private readonly dock: DockModel;
  private refInput = 0;
  private refOutput = 0;
  private refTimer = 0;
  private ships: Ship[] = [];
  private leavingShips: Ship[] = [];
  private shipVariant = 0;

  // Economy and progression
  private coins = 0;
  private lost = 0;
  private autoLevel = 0;
  private firstSale = false;
  private inDockVisit = false;
  private deliveredThisVisit = false;
  private prevZone: ZoneId | null = null;
  private autoMinerTimer = 0;
  private autoHaulerTimer = 0;
  private readonly minerBeam = makeBeam(0xff8a2a);
  private readonly haulerBeam = makeBeam(0x47e8ff);
  private readonly targetMarker: THREE.Mesh;

  // Camera
  private readonly camPos = V();
  private readonly camLook = V();
  private focus: { target: THREE.Vector3; until: number } | null = null;

  private readonly tmp = V();
  private readonly tmp2 = V();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.background = new THREE.Color(0x070815);
    this.scene.fog = new THREE.FogExp2(0x070815, 0.006);
    this.scene.add(new THREE.HemisphereLight(0x9fbcff, 0x1a0f2e, 1.1));
    const sun = new THREE.DirectionalLight(0xfff1dd, 2.4);
    sun.position.set(12, 22, 9);
    this.scene.add(sun);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.flyers = new Flyers(this.scene);
    this.sparks = new Sparks(this.scene);

    this.buildWorld();
    this.drone = makeDrone();
    this.scene.add(this.drone.root);
    for (let i = 0; i < CFG.cargo.startPods; i++) this.addPod();

    const r = makeRefinery(CFG.refinery.outputCap);
    this.refinery = r;
    this.placeStation(r.root, 'refinery', 4.6);
    const d = makeDock();
    this.dock = d;
    this.placeStation(d.root, 'dock', 4.2);
    for (let k = 0; k < CFG.ship.queue; k++) this.spawnShip(true);

    this.minerBeam.visible = false;
    this.haulerBeam.visible = false;
    this.scene.add(this.minerBeam, this.haulerBeam);

    this.targetMarker = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 4), MAT.gold);
    this.targetMarker.rotation.x = Math.PI;
    this.scene.add(this.targetMarker);

    // Start a few units before the asteroid field: the first stop comes within seconds.
    this.dist = this.zones[0].start - 5;
    this.placeTrain(0);
    this.updateCamera(1, true);

    this.ui.onCard = (id) => this.buy(id);
    this.ui.setCoins(0);
    this.ui.setLost(0, CFG.ship.maxLost, false);
    this.ui.showTutorial(true);
    this.bindInput(canvas);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    (window as unknown as { __game: Game }).__game = this;
  }

  // ───────────────────────────── world ─────────────────────────────

  private buildWorld(): void {
    this.scene.add(makeStarfield(2200));
    const planet = makePlanet();
    planet.position.set(0, -1.5, 0);
    planet.name = 'planet';
    this.scene.add(planet);

    // The flight lane: a thin glowing tube plus beacon dots every 2.5 units.
    const lane = new THREE.Mesh(new THREE.TubeGeometry(this.loop.curve, 500, 0.06, 6, true), MAT.cyanSoft);
    this.scene.add(lane);
    const dotGeo = new THREE.SphereGeometry(0.1, 6, 4);
    for (let d = 0; d < this.loop.length; d += 2.5) {
      const dot = new THREE.Mesh(dotGeo, MAT.cyan);
      dot.position.copy(this.loop.pointAt(d));
      this.scene.add(dot);
    }

    const markerGeo = new THREE.TorusGeometry(1.7, 0.08, 6, 36);
    const colors: Record<ZoneId, number> = { asteroid: 0xff8a2a, refinery: 0x47e8ff, dock: 0xffc93c };
    for (const id of Object.keys(CFG.zones) as ZoneId[]) {
      const [a, b] = CFG.zones[id];
      const start = a * this.loop.length;
      const end = b * this.loop.length;
      const center = (start + end) / 2;
      const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: colors[id], emissiveIntensity: 1.2 });
      const marker = new THREE.Mesh(markerGeo, mat);
      marker.position.copy(this.loop.pointAt(center));
      marker.rotation.x = Math.PI / 2;
      this.scene.add(marker);
      this.zones.push({ id, start, end, center, marker });
    }

    // The asteroid field outside the loop, beside its zone.
    const z = this.zone('asteroid');
    for (let i = 0; i < 7; i++) {
      const along = z.start + ((i + 0.5) / 7) * (z.end - z.start);
      const out = this.loop.outwardAt(along);
      const rock = makeAsteroid(0.7 + (i % 3) * 0.35, 11 + i);
      rock.position.copy(this.loop.pointAt(along)).addScaledVector(out, 3.2 + (i % 2) * 1.8);
      rock.position.y = 0.6 + Math.sin(i * 1.7) * 0.8;
      rock.userData.spin = new THREE.Vector3(Math.random() * 0.6, Math.random() * 0.8, Math.random() * 0.5);
      this.scene.add(rock);
      this.asteroids.push(rock);
    }
  }

  private zone(id: ZoneId): Zone {
    return this.zones.find((z) => z.id === id)!;
  }

  /** Put a station outside the loop at its zone centre, its local +Z facing the lane. */
  private placeStation(root: THREE.Object3D, id: ZoneId, offset: number): void {
    const c = this.zone(id).center;
    const p = this.loop.pointAt(c);
    root.position.copy(p).addScaledVector(this.loop.outwardAt(c), offset);
    root.position.y = -0.4;
    root.lookAt(p.x, root.position.y, p.z);
    this.scene.add(root);
    root.updateMatrixWorld(true);
  }

  // ───────────────────────────── input ─────────────────────────────

  private bindInput(canvas: HTMLCanvasElement): void {
    const down = () => {
      this.holding = true;
      this.lastInputAt = this.time;
      if (!this.everMoved) {
        this.everMoved = true;
      }
      this.ui.showTutorial(false);
    };
    const up = () => {
      this.holding = false;
      this.lastInputAt = this.time;
    };
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) down();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') up();
    });
  }

  // ───────────────────────────── frame ─────────────────────────────

  update(dt: number): void {
    this.time += dt;
    this.runTimers();

    const canDrive = this.state === 'play';
    const max = CFG.drone.baseSpeed + this.speedLevel * CFG.drone.speedStep;
    if (canDrive && this.holding) this.speed = Math.min(max, this.speed + CFG.drone.accel * dt);
    else this.speed = Math.max(0, this.speed - CFG.drone.decel * dt);
    this.dist = this.loop.wrap(this.dist + this.speed * dt);
    this.placeTrain(dt);

    const zone = this.zones.find((z) => this.loop.inRange(this.dist, z.start, z.end)) ?? null;
    this.trackDockVisits(zone?.id ?? null);

    const stopped = this.speed < CFG.drone.stopSpeed;
    if (canDrive && zone && stopped) {
      this.transferTimer -= dt;
      while (this.transferTimer <= 0) {
        this.transferTimer += CFG.transfer.interval;
        if (this.transfer(zone.id)) this.lastTransferAt = this.time;
        else break;
      }
    } else {
      this.transferTimer = 0;
    }

    this.updateRefinery(dt);
    this.updateAutomation(dt);
    this.updateShips(dt);
    this.flyers.update(dt);
    this.sparks.update(dt);
    this.animateWorld(dt);
    this.updateGuidance(zone, stopped);
    this.updateCamera(dt, false);
    this.composer.render(dt);
  }

  private after(sec: number, fn: () => void): void {
    this.timers.push({ at: this.time + sec, fn });
  }

  private runTimers(): void {
    const due = this.timers.filter((t) => t.at <= this.time);
    if (!due.length) return;
    this.timers = this.timers.filter((t) => t.at > this.time);
    for (const t of due) t.fn();
  }

  // ───────────────────────────── drone and cargo ─────────────────────────────

  private get capacity(): number {
    return this.pods.length * CFG.cargo.perPod;
  }

  private get free(): number {
    return this.capacity - this.cargo.length - this.incoming;
  }

  private addPod(): void {
    const pod = makePod(CFG.cargo.perPod);
    this.pods.push(pod);
    this.scene.add(pod.root);
  }

  private placeTrain(dt: number): void {
    const bob = Math.sin(this.time * 3) * 0.08;
    this.placeOnLoop(this.drone.root, this.dist, CFG.drone.hover + bob);
    let d = this.dist - CFG.drone.firstGap;
    this.pods.forEach((pod, i) => {
      this.placeOnLoop(pod.root, d, CFG.drone.hover - 0.15 + Math.sin(this.time * 3 - (i + 1) * 0.7) * 0.08);
      d -= CFG.drone.podGap;
    });
    const thrust = 0.5 + (this.speed / (CFG.drone.baseSpeed + 4)) * 1.4;
    for (const f of this.drone.flames) f.scale.set(1, thrust, 1);
    this.drone.ring.rotation.z += dt * (1 + this.speed * 0.8);
  }

  private placeOnLoop(obj: THREE.Object3D, d: number, y: number): void {
    this.loop.pointAt(d, obj.position);
    obj.position.y = y;
    this.loop.pointAt(d + 0.6, this.tmp);
    this.tmp.y = y;
    obj.lookAt(this.tmp);
  }

  /** World position of cargo slot `index` (pods fill front to back). */
  private slotWorld(index: number, out: THREE.Vector3): THREE.Vector3 {
    const pod = this.pods[Math.min(this.pods.length - 1, Math.floor(index / CFG.cargo.perPod))];
    const slot = pod.slots[index % CFG.cargo.perPod];
    return slot.getWorldPosition(out);
  }

  private refreshCargo(): void {
    let i = 0;
    for (const pod of this.pods) {
      for (const slot of pod.slots) {
        const kind = this.cargo[i++];
        slot.visible = !!kind;
        if (kind) slot.material = kind === 'ore' ? MAT.ore : MAT.crystal;
      }
    }
  }

  private removeCargo(kind: ItemKind): boolean {
    const i = this.cargo.lastIndexOf(kind);
    if (i < 0) return false;
    this.cargo.splice(i, 1);
    this.refreshCargo();
    return true;
  }

  /** Send one item into the cargo: the slot is reserved now, filled on landing. */
  private loadInto(kind: ItemKind, from: THREE.Vector3): void {
    const index = this.cargo.length + this.incoming;
    this.incoming++;
    const target = V();
    this.flyers.launch(kind, from, () => this.slotWorld(index, target), CFG.transfer.flight, 1.4, () => {
      this.incoming--;
      this.cargo.push(kind);
      this.refreshCargo();
    });
  }

  // ───────────────────────────── stations ─────────────────────────────

  /** One trade with the station the stopped drone is at. False when there is nothing to do. */
  private transfer(id: ZoneId): boolean {
    if (id === 'asteroid') {
      if (this.free <= 0) return false;
      const rock = this.asteroids[Math.floor(Math.random() * this.asteroids.length)];
      this.loadInto('ore', rock.getWorldPosition(this.tmp));
      this.drone.drill.rotation.z += 1.3;
      return true;
    }
    if (id === 'refinery') {
      // Unload all ore first (only with nothing landing, so slot indices stay valid), then load crystals.
      if (this.incoming === 0 && this.removeCargo('ore')) {
        const from = this.slotWorld(this.cargo.length, V());
        this.flyers.launch('ore', from, () => this.refinery.hopper.getWorldPosition(this.tmp2), CFG.transfer.flight, 1.5, () => this.refInput++);
        return true;
      }
      if (this.free > 0 && this.refOutput > 0) {
        this.refOutput--;
        this.refreshStack();
        this.loadInto('crystal', this.refinery.stack[this.refOutput].getWorldPosition(this.tmp));
        return true;
      }
      return false;
    }
    // dock
    const ship = this.shipWithRoom();
    if (!ship || this.incoming > 0 || !this.cargo.includes('crystal')) return false;
    this.removeCargo('crystal');
    const from = this.slotWorld(this.cargo.length, V());
    this.deliverTo(ship, from, CFG.transfer.flight, 1.6);
    this.deliveredThisVisit = true;
    return true;
  }

  private updateRefinery(dt: number): void {
    const working = this.refInput > 0 && this.refOutput < CFG.refinery.outputCap;
    if (working) {
      this.refTimer += dt;
      if (this.refTimer >= CFG.refinery.processSec) {
        this.refTimer = 0;
        this.refInput--;
        this.refOutput++;
        this.refreshStack();
        this.sparks.burst(this.refinery.core.getWorldPosition(this.tmp), 4, MAT.crystal, 3, 0.5);
      }
    }
    this.refinery.ring.rotation.z += dt * (working ? 5 : 0.6);
    this.refinery.core.rotation.y += dt * (working ? 3 : 0.5);
  }

  private refreshStack(): void {
    this.refinery.stack.forEach((c, i) => (c.visible = i < this.refOutput));
  }

  // ───────────────────────────── ships ─────────────────────────────

  private slotPos(k: number, out: THREE.Vector3): THREE.Vector3 {
    out.set(0, 1.3 + k * 0.35, -3.4 * k);
    return this.dock.root.localToWorld(out);
  }

  private spawnShip(instant: boolean): void {
    const model = makeShip(this.shipVariant++, CFG.ship.need);
    const k = this.ships.length;
    const ship: Ship = { model, filled: 0, pending: 0, leaving: false, t: 0, away: V() };
    this.slotPos(instant ? k : k + 3, model.root.position);
    if (!instant) model.root.position.y += 6;
    this.scene.add(model.root);
    this.ships.push(ship);
  }

  private shipWithRoom(): Ship | null {
    return this.ships.find((s) => s.filled + s.pending < CFG.ship.need) ?? null;
  }

  private deliverTo(ship: Ship, from: THREE.Vector3, dur: number, height: number): void {
    ship.pending++;
    const target = V();
    this.flyers.launch('crystal', from, () => ship.model.root.getWorldPosition(target), dur, height, () => {
      ship.pending--;
      ship.filled++;
      ship.model.lights[ship.filled - 1].material = MAT.crystal;
      this.earn(CFG.ship.price, ship.model.root.position);
      if (ship.filled >= CFG.ship.need) this.shipLeaves(ship, false);
    });
    this.firstSale = true;
  }

  private shipLeaves(ship: Ship, angry: boolean): void {
    const i = this.ships.indexOf(ship);
    if (i < 0) return;
    this.ships.splice(i, 1);
    ship.leaving = true;
    ship.t = 0;
    const p = ship.model.root.position;
    this.tmp.subVectors(p, this.dock.root.position).setY(0).normalize();
    ship.away.copy(this.tmp).multiplyScalar(1).setY(0.45).normalize();
    ship.model.root.lookAt(this.tmp2.copy(p).addScaledVector(ship.away, 10));
    if (angry) {
      ship.model.hull.material = MAT.shipAngry;
      this.popupAt(p, 'SHIP LEFT!', 'bad');
    } else {
      this.sparks.burst(p, 14, MAT.gold, 6, 0.9);
      this.popupAt(p, 'SERVED!', 'info');
    }
    this.leavingShips.push(ship);
    this.spawnShip(false);
  }

  private updateShips(dt: number): void {
    const k = 1 - Math.exp(-3 * dt);
    this.ships.forEach((s, i) => {
      this.slotPos(i, this.tmp);
      s.model.root.position.lerp(this.tmp, k);
      this.tmp2.copy(this.dock.root.position).setY(s.model.root.position.y);
      s.model.root.lookAt(this.tmp2);
      s.model.flame.scale.setScalar(0.6 + Math.sin(this.time * 12 + i) * 0.1);
    });
    for (let i = this.leavingShips.length - 1; i >= 0; i--) {
      const s = this.leavingShips[i];
      s.t += dt;
      s.model.root.position.addScaledVector(s.away, dt * (2 + s.t * s.t * 14));
      s.model.flame.scale.setScalar(1.2 + s.t);
      if (s.t > 3) {
        this.scene.remove(s.model.root);
        this.leavingShips.splice(i, 1);
      }
    }
  }

  /**
   * Fail rule (like Train Miner's FreezeFail): once the first sale happened, every pass through the
   * dock zone without a delivery sends the front ship away unserved. maxLost lost ships = game over.
   * The cargo hauler automation makes the dock independent of the drone, so it stops counting.
   */
  private trackDockVisits(zone: ZoneId | null): void {
    if (zone === this.prevZone) return;
    if (zone === 'dock') {
      this.inDockVisit = true;
      this.deliveredThisVisit = false;
    } else if (this.prevZone === 'dock' && this.inDockVisit) {
      this.inDockVisit = false;
      this.after(CFG.ship.judgeDelay, () => this.judgeVisit());
    }
    this.prevZone = zone;
  }

  private judgeVisit(): void {
    if (this.state !== 'play' || !this.firstSale || this.deliveredThisVisit || this.autoLevel >= 2) return;
    const front = this.ships.find((s) => s.pending === 0);
    if (!front) return;
    this.shipLeaves(front, true);
    this.lost++;
    this.ui.setLost(this.lost, CFG.ship.maxLost, true);
    if (this.lost >= CFG.ship.maxLost) this.lose();
  }

  // ───────────────────────────── economy ─────────────────────────────

  private earn(amount: number, at: THREE.Vector3): void {
    this.coins += amount;
    const s = this.toScreen(at);
    this.ui.popup(s.x, s.y - 20, `+${amount}`);
    this.ui.coinFly(s.x, s.y, 0, () => this.ui.setCoins(this.coins));
  }

  private podCost(): number | null {
    return CFG.upgrades.pod[this.pods.length - CFG.cargo.startPods] ?? null;
  }

  private speedCost(): number | null {
    return CFG.upgrades.speed[this.speedLevel] ?? null;
  }

  private cardViews(): CardView[] {
    if (!this.firstSale || this.state !== 'play') return [];
    const card = (id: string, title: string, desc: string, cost: number | null, auto = false): CardView => ({
      id, title, desc, cost, auto, affordable: cost !== null && this.coins >= cost,
    });
    const list = [
      card('pod', '+CARGO POD', `Carry ${CFG.cargo.perPod} more`, this.podCost()),
      card('speed', 'ENGINE BOOST', 'Fly faster', this.speedCost()),
    ];
    const next = CFG.automation[this.autoLevel];
    if (next) list.push(card('auto', next.title, next.desc, next.cost, true));
    return list;
  }

  private buy(id: string): void {
    if (this.state !== 'play') return;
    const pay = (cost: number | null): boolean => {
      if (cost === null || this.coins < cost) return false;
      this.coins -= cost;
      this.ui.setCoins(this.coins);
      return true;
    };
    if (id === 'pod' && this.pods.length < CFG.cargo.maxPods && pay(this.podCost())) {
      this.addPod();
      this.placeTrain(0);
      this.refreshCargo();
      this.sparks.burst(this.pods[this.pods.length - 1].root.position, 16, MAT.cyan, 5);
    } else if (id === 'speed' && pay(this.speedCost())) {
      this.speedLevel++;
      this.sparks.burst(this.drone.root.position, 16, MAT.orange, 5);
    } else if (id === 'auto' && pay(CFG.automation[this.autoLevel]?.cost ?? null)) {
      this.autoLevel++;
      this.onAutomation();
    }
  }

  private onAutomation(): void {
    if (this.autoLevel === 1) {
      this.minerBeam.visible = true;
      this.focusOn(this.refinery.root.position, 2.2);
      this.popupAt(this.refinery.root.position, 'AUTO-MINER ONLINE', 'info');
    } else if (this.autoLevel === 2) {
      this.haulerBeam.visible = true;
      this.focusOn(this.dock.root.position, 2.2);
      this.popupAt(this.dock.root.position, 'HAULER ONLINE', 'info');
    } else {
      // Trade hub: the network runs itself; pull back, celebrate, then the endcard.
      this.state = 'finale';
      this.holding = false;
      this.ui.showTutorial(false);
      for (let i = 0; i < 6; i++) {
        this.after(i * 0.45, () => {
          const z = this.zones[i % 3];
          this.sparks.burst(this.loop.pointAt(z.center, V()).setY(3), 26, i % 2 ? MAT.gold : MAT.crystal, 8, 1.2);
        });
      }
      this.after(CFG.finaleDelay, () => {
        this.state = 'won';
        this.ui.showEnd(true, this.coins);
      });
    }
  }

  private updateAutomation(dt: number): void {
    if (this.state === 'lost') return;
    if (this.autoLevel >= 1) {
      this.autoMinerTimer -= dt;
      if (this.autoMinerTimer <= 0 && this.refInput < CFG.auto.minerInputCap) {
        this.autoMinerTimer = CFG.auto.minerInterval;
        const rock = this.asteroids[Math.floor(Math.random() * this.asteroids.length)];
        this.flyers.launch('ore', rock.getWorldPosition(V()), () => this.refinery.hopper.getWorldPosition(this.tmp2), 1.1, 4, () => this.refInput++);
      }
      placeBeam(this.minerBeam, this.asteroids[3].position, this.refinery.hopper.getWorldPosition(this.tmp));
      (this.minerBeam.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(this.time * 10) * 0.15;
    }
    if (this.autoLevel >= 2) {
      this.autoHaulerTimer -= dt;
      const ship = this.shipWithRoom();
      if (this.autoHaulerTimer <= 0 && ship && this.refOutput > 0) {
        this.autoHaulerTimer = CFG.auto.haulerInterval;
        this.refOutput--;
        this.refreshStack();
        this.deliverTo(ship, this.refinery.stack[this.refOutput].getWorldPosition(V()), 1.2, 5);
      }
      placeBeam(this.haulerBeam, this.refinery.core.getWorldPosition(this.tmp), this.dock.beacon.getWorldPosition(this.tmp2));
      (this.haulerBeam.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(this.time * 8 + 1) * 0.15;
    }
  }

  private lose(): void {
    this.state = 'lost';
    this.holding = false;
    this.ui.showTutorial(false);
    this.focusOn(this.dock.root.position, 99);
    this.after(1.6, () => this.ui.showEnd(false, this.coins));
  }

  // ───────────────────────────── guidance ─────────────────────────────

  /** The station the player should stop at next (the bouncing marker). */
  private targetZone(): ZoneId | null {
    if (this.autoLevel >= 2 || this.state !== 'play') return null;
    const hasCrystal = this.cargo.includes('crystal');
    if (hasCrystal && (this.free <= 0 || this.refOutput === 0)) return 'dock';
    if (this.cargo.includes('ore')) return 'refinery';
    if (this.autoLevel >= 1 || (this.refOutput > 0 && this.free > 0)) return this.free > 0 ? 'refinery' : 'dock';
    return this.free > 0 ? 'asteroid' : 'dock';
  }

  private updateGuidance(zone: Zone | null, stopped: boolean): void {
    const target = this.targetZone();
    this.targetMarker.visible = !!target;
    if (target) {
      const z = this.zone(target);
      this.loop.pointAt(z.center, this.targetMarker.position);
      this.targetMarker.position.y = 3.2 + Math.sin(this.time * 4) * 0.35;
      this.targetMarker.rotation.y += 0.04;
    }
    for (const z of this.zones) {
      const m = z.marker.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = z.id === target ? 1.6 + Math.sin(this.time * 6) * 0.8 : 0.6;
    }

    let hint: string | null = null;
    if (this.state === 'play') {
      const busy = this.time - this.lastTransferAt < 0.5 || this.flyers.count > 0;
      if (zone && zone.id === target && !stopped && this.holding) hint = 'RELEASE TO STOP HERE';
      else if (zone && stopped && busy) hint = zone.id === 'asteroid' ? 'MINING ORE…' : zone.id === 'refinery' ? 'REFINING…' : 'SELLING CRYSTALS…';
      else if (zone?.id === 'asteroid' && this.free <= 0) hint = 'CARGO FULL! FLY TO THE REFINERY';
      else if (zone?.id === 'dock' && stopped && !this.cargo.includes('crystal') && this.firstSale) hint = 'NO CRYSTALS! REFINE SOME ORE';
      else if (this.autoLevel >= 2) hint = 'SHIPS ARE SERVED AUTOMATICALLY';

      const idle = !this.holding && this.speed === 0 && this.time - this.lastInputAt > CFG.idleHintSec && !busy;
      if (idle && (!zone || zone.id !== target)) this.ui.showTutorial(true, this.everMoved ? 'KEEP FLYING!' : 'HOLD TO FLY');
    } else if (this.state === 'finale') {
      hint = 'TRADE HUB COMPLETE!';
    }
    this.ui.setHint(hint);
    this.ui.setCards(this.cardViews());
  }

  // ───────────────────────────── camera and view ─────────────────────────────

  private focusOn(target: THREE.Vector3, seconds: number): void {
    this.focus = { target: target.clone(), until: this.time + seconds };
  }

  private updateCamera(dt: number, snap: boolean): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const k = h > w ? CFG.camera.portraitK : 1;
    const look = this.tmp;
    const want = this.tmp2;
    if (this.state === 'finale' || this.state === 'won') {
      look.set(0, 0, 0);
      want.set(0, 30 * k, 26 * k);
    } else {
      if (this.focus && this.time > this.focus.until) this.focus = null;
      look.copy(this.focus ? this.focus.target : this.drone.root.position);
      want.copy(look).add(new THREE.Vector3(0, CFG.camera.height * k, CFG.camera.back * k));
    }
    const s = snap ? 1 : 1 - Math.exp(-CFG.camera.smooth * dt);
    this.camPos.lerp(want, s);
    this.camLook.lerp(look, s);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  private animateWorld(dt: number): void {
    for (const a of this.asteroids) {
      const s = a.userData.spin as THREE.Vector3;
      a.rotation.x += s.x * dt;
      a.rotation.y += s.y * dt;
      a.rotation.z += s.z * dt;
    }
    const planet = this.scene.getObjectByName('planet');
    if (planet) planet.rotation.y += dt * 0.05;
    this.dock.beacon.rotation.y += dt * 2;
  }

  private toScreen(p: THREE.Vector3): { x: number; y: number } {
    const v = this.tmp.copy(p).project(this.camera);
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
  }

  private popupAt(p: THREE.Vector3, text: string, kind: 'gold' | 'bad' | 'info'): void {
    const s = this.toScreen(p);
    this.ui.popup(s.x, s.y - 30, text, kind);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.fov = h > w ? 58 : 46;
    this.camera.updateProjectionMatrix();
  }

  /** QA helper from the console: `__game.debugCoins(100)`. */
  debugCoins(n: number): void {
    this.coins += n;
    this.firstSale = true;
    this.ui.setCoins(this.coins);
  }
}
