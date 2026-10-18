import { Application, Container, Graphics, Text } from 'pixi.js';
import { CFG, ENEMIES, EnemyKind, TOWERS, TowerKind, WAVES } from './config';
import { easeOutBack, easeOutCubic, Tweens } from './tween';

const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

function label(text: string, size: number, fill = 0xffffff): Text {
  const t = new Text({ text, style: { fontFamily: FONT, fontSize: size, fontWeight: '900', fill, stroke: { color: 0x0c1f14, width: 6 } } });
  t.anchor.set(0.5);
  return t;
}

interface Enemy { kind: EnemyKind; view: Container; bar: Graphics; hp: number; max: number; dist: number; flash: number }
interface Tower { kind: TowerKind; level: number; view: Container; barrel: Container; pips: Graphics; cd: number }
interface Shot { view: Graphics; x: number; y: number; tx: number; ty: number; target: Enemy | null; dmg: number; splash: number; speed: number }
interface Seg { x: number; y: number; dx: number; dy: number; len: number }

// Session state: road, build pads, towers with targeting, waves, gold, base HP, win/lose.
export class Game {
  private root = new Container();
  private padLayer = new Container();
  private world = new Container();
  private shotLayer = new Container();
  private fx = new Container();
  private menu = new Container();
  private tweens = new Tweens();
  private segs: Seg[] = [];
  private pathLen = 0;
  private enemies: Enemy[] = [];
  private towers: (Tower | null)[] = [];
  private shots: Shot[] = [];
  private rangeRing = new Graphics();
  private menuPad = -1;
  private gold = CFG.startGold;
  private hp = CFG.baseHp;
  private kills = 0;
  private wave = -1;
  private queue: { kind: EnemyKind; at: number }[] = [];
  private clock = 0;
  private nextWaveIn = CFG.autoStart;
  private over = false;
  private elapsed = 0;
  private shake = 0;
  private built = false;
  private goldTxt = label('', 34, 0xffd04a);
  private hpTxt = label('', 34, 0xff7a8a);
  private waveTxt = label('', 30);
  private hint = label('', 22);
  private castle = new Container();
  private hand = new Graphics();

  constructor(app: Application) {
    app.stage.addChild(this.root);
    for (let i = 0; i < CFG.path.length - 1; i++) {
      const [ax, ay] = CFG.path[i];
      const [bx, by] = CFG.path[i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      this.segs.push({ x: ax, y: ay, dx: (bx - ax) / len, dy: (by - ay) / len, len });
      this.pathLen += len;
    }
    this.buildStatic();
    this.root.addChild(this.padLayer, this.rangeRing, this.world, this.shotLayer, this.fx, this.menu, this.hand);
    this.reset();
    window.addEventListener('resize', () => this.fit());
    this.fit();
    app.ticker.add((tk) => this.update(Math.min(0.05, tk.deltaMS / 1000)));
    document.getElementById('endBtn')!.addEventListener('click', () => this.restart());
  }

  debugWin(): void {
    this.end(true);
  }

  private fit(): void {
    const s = Math.min(window.innerWidth / CFG.W, window.innerHeight / CFG.H);
    this.root.scale.set(s);
    this.root.position.set((window.innerWidth - CFG.W * s) / 2, (window.innerHeight - CFG.H * s) / 2);
  }

  private posAt(d: number): { x: number; y: number; dx: number; dy: number } {
    for (const s of this.segs) {
      if (d <= s.len) return { x: s.x + s.dx * d, y: s.y + s.dy * d, dx: s.dx, dy: s.dy };
      d -= s.len;
    }
    const s = this.segs[this.segs.length - 1];
    return { x: s.x + s.dx * s.len, y: s.y + s.dy * s.len, dx: s.dx, dy: s.dy };
  }

  // ---------- static scene ----------

  private buildStatic(): void {
    const bg = new Graphics().rect(0, 0, CFG.W, CFG.H).fill(0x2f6b45);
    for (let i = 0; i < 70; i++) bg.circle(Math.random() * CFG.W, 200 + Math.random() * (CFG.H - 200), 4 + Math.random() * 10).fill({ color: 0x24573a, alpha: 0.8 });
    bg.rect(0, 0, CFG.W, 175).fill({ color: 0x0c1f14, alpha: 0.55 });
    // Tapping empty ground closes the build menu.
    bg.eventMode = 'static';
    bg.on('pointertap', () => this.closeMenu());
    this.root.addChild(bg);

    // Road: dark edge, sand body, dashed centre line.
    const road = new Graphics();
    const trace = (g: Graphics) => {
      g.moveTo(CFG.path[0][0], CFG.path[0][1]);
      for (const [x, y] of CFG.path.slice(1)) g.lineTo(x, y);
    };
    trace(road);
    road.stroke({ width: CFG.roadWidth + 14, color: 0x5a3f22, cap: 'round', join: 'round' });
    trace(road);
    road.stroke({ width: CFG.roadWidth, color: 0xd9b77a, cap: 'round', join: 'round' });
    for (let d = 20; d < this.pathLen - 40; d += 44) {
      const p = this.posAt(d);
      road.circle(p.x, p.y, 3).fill({ color: 0x8a6a3a, alpha: 0.6 });
    }
    this.root.addChild(road);

    // Trees along the edges, kept off the road and pads.
    const trees = new Graphics();
    for (let i = 0; i < 40; i++) {
      const x = 20 + Math.random() * (CFG.W - 40);
      const y = 210 + Math.random() * (CFG.H - 230);
      if (this.distToRoad(x, y) < CFG.roadWidth / 2 + 30) continue;
      if (CFG.pads.some(([px, py]) => Math.hypot(px - x, py - y) < CFG.padR + 30)) continue;
      if (Math.hypot(x - 360, y - 1170) < 110) continue;
      trees.circle(x + 4, y + 6, 18).fill({ color: 0x000000, alpha: 0.2 });
      trees.circle(x, y, 18).fill(0x1f5a32);
      trees.circle(x - 5, y - 5, 9).fill({ color: 0x46a060, alpha: 0.6 });
    }
    this.root.addChild(trees);

    // Castle at the end of the road.
    const c = new Graphics();
    c.roundRect(-80, -40, 160, 90, 8).fill(0x8a8fa6).stroke({ width: 5, color: 0x3a3e52 });
    for (let i = 0; i < 5; i++) c.rect(-80 + i * 34, -62, 22, 24).fill(0x8a8fa6).stroke({ width: 4, color: 0x3a3e52 });
    c.roundRect(-24, 4, 48, 46, 20).fill(0x3a2412);
    c.rect(-2, -110, 4, 50).fill(0x3a3e52);
    c.poly([2, -110, 42, -98, 2, -86]).fill(0xff5a6e);
    this.castle.addChild(c);
    this.castle.position.set(360, 1200);
    this.root.addChild(this.castle);

    // HUD.
    const title = label('TURRET TRAIL', 44, 0xffd04a);
    title.position.set(CFG.W / 2, 52);
    this.hint.position.set(CFG.W / 2, 140);
    this.goldTxt.position.set(110, 100);
    this.hpTxt.position.set(CFG.W - 100, 100);
    this.waveTxt.position.set(CFG.W / 2, 100);
    this.root.addChild(title, this.hint, this.goldTxt, this.hpTxt, this.waveTxt);

    this.rangeRing.visible = false;
    this.hand.poly([0, 0, 18, 34, 7, 34, 13, 56, 3, 58, -3, 37, -14, 44]).fill(0xffffff).stroke({ width: 3, color: 0x0c1f14 });
    this.hand.eventMode = 'none';
  }

  private distToRoad(x: number, y: number): number {
    let best = Infinity;
    for (const s of this.segs) {
      const t = Math.max(0, Math.min(s.len, (x - s.x) * s.dx + (y - s.y) * s.dy));
      best = Math.min(best, Math.hypot(x - (s.x + s.dx * t), y - (s.y + s.dy * t)));
    }
    return best;
  }

  private buildPads(): void {
    this.padLayer.removeChildren().forEach((c) => c.destroy());
    CFG.pads.forEach(([x, y], i) => {
      const pad = new Graphics();
      pad.circle(0, 4, CFG.padR).fill({ color: 0x000000, alpha: 0.25 });
      pad.circle(0, 0, CFG.padR).fill(0x6b7088).stroke({ width: 4, color: 0x3a3e52 });
      pad.circle(0, 0, CFG.padR - 12).stroke({ width: 3, color: 0x9aa0bb, alpha: 0.6 });
      const plus = label('+', 34, 0xd8dcf0);
      const view = new Container();
      view.addChild(pad, plus);
      view.position.set(x, y);
      view.eventMode = 'static';
      view.cursor = 'pointer';
      view.on('pointertap', () => this.tapPad(i));
      this.padLayer.addChild(view);
    });
  }

  // ---------- build menu ----------

  private tapPad(i: number): void {
    if (this.over) return;
    if (this.menuPad === i) return this.closeMenu();
    this.menuPad = i;
    this.drawMenu(true);
  }

  private closeMenu(): void {
    this.menuPad = -1;
    this.menu.removeChildren().forEach((c) => c.destroy());
    this.rangeRing.visible = false;
  }

  private drawMenu(pop: boolean): void {
    this.menu.removeChildren().forEach((c) => c.destroy());
    const i = this.menuPad;
    if (i < 0) return;
    const [px, py] = CFG.pads[i];
    const tower = this.towers[i];
    const above = py > 320;
    const by = above ? py - 92 : py + 92;
    const buttons: { text: string; sub: string; color: number; cost: number; act: () => void }[] = [];
    if (!tower) {
      for (const kind of ['blaster', 'cannon'] as TowerKind[]) {
        const d = TOWERS[kind];
        buttons.push({ text: d.name, sub: `${d.cost}`, color: d.color, cost: d.cost, act: () => this.build(i, kind) });
      }
    } else if (tower.level < 3) {
      const cost = CFG.upgradeCost[tower.level - 1];
      buttons.push({ text: `UPGRADE L${tower.level + 1}`, sub: `${cost}`, color: 0x46d27a, cost, act: () => this.upgrade(i) });
    } else {
      buttons.push({ text: 'MAX LEVEL', sub: '', color: 0x6b7088, cost: Infinity, act: () => this.closeMenu() });
    }
    if (tower) {
      const r = this.stat(tower).range;
      this.rangeRing.clear().circle(px, py, r).fill({ color: 0xffffff, alpha: 0.08 }).stroke({ width: 3, color: 0xffffff, alpha: 0.5 });
      this.rangeRing.visible = true;
    } else {
      this.rangeRing.visible = false;
    }

    const bw = buttons.length === 1 ? 210 : 160;
    const gap = 12;
    const total = buttons.length * bw + (buttons.length - 1) * gap;
    let x0 = Math.max(12, Math.min(CFG.W - 12 - total, px - total / 2));
    for (const b of buttons) {
      const ok = this.gold >= b.cost || b.cost === Infinity;
      const v = new Container();
      const g = new Graphics()
        .roundRect(0, -36, bw, 72, 18).fill(ok ? b.color : 0x555a6a).stroke({ width: 4, color: 0x0c1f14 });
      const t = label(b.text, 22);
      t.position.set(bw / 2, b.sub ? -12 : 0);
      v.addChild(g, t);
      if (b.sub) {
        const s = label(`● ${b.sub}`, 20, ok ? 0xffe27a : 0xbbbbbb);
        s.position.set(bw / 2, 16);
        v.addChild(s);
      }
      v.position.set(x0 + bw / 2, by);
      v.pivot.set(bw / 2, 0);
      v.eventMode = 'static';
      v.cursor = 'pointer';
      v.on('pointertap', () => {
        if (ok) b.act();
        else this.float(px, py - 50, 'NOT ENOUGH GOLD', 0xff7a8a);
      });
      if (pop) {
        v.scale.set(0.4);
        this.tweens.to(v.scale, { x: 1, y: 1 }, 0.25, easeOutBack);
      }
      this.menu.addChild(v);
      x0 += bw + gap;
    }
  }

  private stat(t: Tower): { range: number; rate: number; dmg: number } {
    const d = TOWERS[t.kind];
    const l = t.level - 1;
    return { range: d.range + CFG.lvlRange * l, rate: d.rate * CFG.lvlRate ** l, dmg: d.dmg * CFG.lvlDmg ** l };
  }

  private build(i: number, kind: TowerKind): void {
    const d = TOWERS[kind];
    this.gold -= d.cost;
    const [x, y] = CFG.pads[i];
    const view = new Container();
    const base = new Graphics();
    base.circle(0, 4, 34).fill({ color: 0x000000, alpha: 0.3 });
    base.roundRect(-30, -30, 60, 60, 14).fill(0x3a3e52).stroke({ width: 4, color: 0x1c1f2c });
    base.circle(0, 0, 22).fill(d.color).stroke({ width: 4, color: 0x1c1f2c });
    const barrel = new Container();
    const bg = new Graphics();
    if (kind === 'blaster') {
      bg.roundRect(0, -10, 38, 7, 3).fill(0xdde6ff).stroke({ width: 2, color: 0x1c1f2c });
      bg.roundRect(0, 3, 38, 7, 3).fill(0xdde6ff).stroke({ width: 2, color: 0x1c1f2c });
    } else {
      bg.roundRect(0, -10, 34, 20, 6).fill(0x2a2a2a).stroke({ width: 3, color: 0x1c1f2c });
    }
    bg.circle(0, 0, 12).fill(0xffffff).stroke({ width: 3, color: 0x1c1f2c });
    barrel.addChild(bg);
    barrel.rotation = -Math.PI / 2;
    const pips = new Graphics();
    view.addChild(base, barrel, pips);
    view.position.set(x, y);
    view.eventMode = 'static';
    view.cursor = 'pointer';
    view.on('pointertap', () => this.tapPad(i));
    this.world.addChild(view);
    const t: Tower = { kind, level: 1, view, barrel, pips, cd: 0 };
    this.towers[i] = t;
    this.drawPips(t);
    view.scale.set(0.3);
    this.tweens.to(view.scale, { x: 1, y: 1 }, 0.35, easeOutBack);
    this.burst(x, y, d.color, 10);
    this.closeMenu();
    this.built = true;
    if (this.wave < 0) this.nextWaveIn = Math.min(this.nextWaveIn, 1.5);
  }

  private upgrade(i: number): void {
    const t = this.towers[i]!;
    this.gold -= CFG.upgradeCost[t.level - 1];
    t.level++;
    this.drawPips(t);
    t.view.scale.set(1.3);
    this.tweens.to(t.view.scale, { x: 1, y: 1 }, 0.3, easeOutBack);
    this.burst(t.view.x, t.view.y, 0x46d27a, 14);
    this.float(t.view.x, t.view.y - 50, `LEVEL ${t.level}!`, 0x9cff9c);
    this.drawMenu(false);
  }

  private drawPips(t: Tower): void {
    t.pips.clear();
    for (let k = 0; k < t.level; k++) t.pips.circle((k - (t.level - 1) / 2) * 14, 40, 5).fill(0xffd04a).stroke({ width: 2, color: 0x0c1f14 });
  }

  // ---------- waves & enemies ----------

  private startWave(): void {
    this.wave++;
    this.clock = 0;
    let at = 0;
    for (const g of WAVES[this.wave]) {
      for (let k = 0; k < g.n; k++) {
        this.queue.push({ kind: g.kind, at });
        at += g.every;
      }
      at += 0.6;
    }
    const last = this.wave === WAVES.length - 1;
    const b = label(last ? 'FINAL WAVE — BOSS!' : `WAVE ${this.wave + 1}`, 52, last ? 0xff7a8a : 0xffffff);
    b.position.set(CFG.W / 2, CFG.H / 2 - 80);
    b.scale.set(0.3);
    this.fx.addChild(b);
    this.tweens.to(b.scale, { x: 1, y: 1 }, 0.4, easeOutBack);
    this.tweens.delay(1.2, () => this.tweens.to(b, { alpha: 0 }, 0.4, easeOutCubic, () => b.destroy()));
  }

  private spawn(kind: EnemyKind): void {
    const d = ENEMIES[kind];
    const view = new Container();
    const body = new Graphics();
    body.ellipse(0, d.r * 0.8, d.r, d.r * 0.4).fill({ color: 0x000000, alpha: 0.25 });
    body.circle(0, 0, d.r).fill(d.color).stroke({ width: 3, color: 0x0c1f14 });
    if (kind === 'boss') body.poly([-20, -26, -12, -46, -4, -30, 4, -46, 12, -30, 20, -46, 22, -26]).fill(0xffd04a).stroke({ width: 3, color: 0x0c1f14 });
    if (kind === 'tank') body.roundRect(-d.r + 4, -6, d.r * 2 - 8, 12, 4).fill({ color: 0x0c1f14, alpha: 0.35 });
    const eyes = new Graphics();
    const e = d.r * 0.35;
    eyes.circle(d.r * 0.35, -e, e * 0.7).fill(0xffffff).circle(d.r * 0.35, e, e * 0.7).fill(0xffffff);
    eyes.circle(d.r * 0.45, -e, e * 0.35).fill(0x0c1f14).circle(d.r * 0.45, e, e * 0.35).fill(0x0c1f14);
    eyes.label = 'eyes';
    const bar = new Graphics();
    view.addChild(body, eyes, bar);
    this.world.addChildAt(view, 0);
    const en: Enemy = { kind, view, bar, hp: d.hp, max: d.hp, dist: 0, flash: 0 };
    this.place(en);
    this.enemies.push(en);
  }

  private place(e: Enemy): void {
    const p = this.posAt(e.dist);
    const r = ENEMIES[e.kind].r;
    e.view.position.set(p.x, p.y + Math.sin(e.dist * 0.12) * 2);
    (e.view.getChildByLabel('eyes') as Graphics).rotation = Math.atan2(p.dy, p.dx);
    e.bar.clear();
    if (e.hp < e.max) {
      e.bar.rect(-r, -r - 14, r * 2, 6).fill(0x0c1f14);
      e.bar.rect(-r, -r - 14, (r * 2 * e.hp) / e.max, 6).fill(e.hp / e.max > 0.4 ? 0x7cff7c : 0xff5a6e);
    }
  }

  private damage(e: Enemy, dmg: number): void {
    if (e.hp <= 0) return;
    e.hp -= dmg;
    e.flash = 0.08;
    if (e.hp > 0) return;
    const d = ENEMIES[e.kind];
    this.gold += d.gold;
    this.kills++;
    this.burst(e.view.x, e.view.y, d.color, e.kind === 'boss' ? 30 : 10);
    this.float(e.view.x, e.view.y - 20, `+${d.gold}`, 0xffd04a);
    if (e.kind === 'boss') this.shake = 0.4;
    e.view.destroy();
    this.enemies.splice(this.enemies.indexOf(e), 1);
    if (this.menuPad >= 0) this.drawMenu(false);
  }

  private leak(e: Enemy): void {
    this.hp = Math.max(0, this.hp - ENEMIES[e.kind].dmg);
    this.shake = 0.3;
    this.float(360, 1110, `-${ENEMIES[e.kind].dmg}`, 0xff5a6e);
    e.view.destroy();
    this.enemies.splice(this.enemies.indexOf(e), 1);
    if (this.hp <= 0) this.end(false);
  }

  // ---------- fx ----------

  private burst(x: number, y: number, color: number, n: number): void {
    for (let k = 0; k < n; k++) {
      const p = new Graphics().circle(0, 0, 3 + Math.random() * 4).fill(color);
      p.position.set(x, y);
      this.fx.addChild(p);
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 40;
      this.tweens.to(p, { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, alpha: 0 }, 0.45, easeOutCubic, () => p.destroy());
    }
  }

  private float(x: number, y: number, text: string, color: number): void {
    const t = label(text, 26, color);
    t.position.set(x, y);
    this.fx.addChild(t);
    this.tweens.to(t, { y: y - 50, alpha: 0 }, 0.9, easeOutCubic, () => t.destroy());
  }

  // ---------- loop ----------

  private update(dt: number): void {
    this.tweens.update(dt);
    this.elapsed += dt;
    this.updateHud();
    if (this.over) return;

    // Wave clock: next wave starts once the previous one has finished spawning.
    if (this.queue.length === 0 && this.wave < WAVES.length - 1) {
      this.nextWaveIn -= dt;
      if (this.nextWaveIn <= 0) {
        this.startWave();
        this.nextWaveIn = CFG.waveGap;
      }
    }
    this.clock += dt;
    while (this.queue.length && this.queue[0].at <= this.clock) this.spawn(this.queue.shift()!.kind);

    for (const e of this.enemies.slice()) {
      e.dist += ENEMIES[e.kind].speed * dt;
      if (e.dist >= this.pathLen) {
        this.leak(e);
        if (this.over) return;
        continue;
      }
      e.flash = Math.max(0, e.flash - dt);
      e.view.tint = e.flash > 0 ? 0xff8080 : 0xffffff;
      this.place(e);
    }

    this.towers.forEach((t) => t && this.updateTower(t, dt));
    this.updateShots(dt);

    if (this.wave === WAVES.length - 1 && this.queue.length === 0 && this.enemies.length === 0) this.end(true);

    if (this.shake > 0) {
      this.shake -= dt;
      this.fit();
      this.root.x += (Math.random() - 0.5) * 14 * this.shake;
      this.root.y += (Math.random() - 0.5) * 14 * this.shake;
      if (this.shake <= 0) this.fit();
    }
  }

  private updateTower(t: Tower, dt: number): void {
    const s = this.stat(t);
    t.cd -= dt;
    let target: Enemy | null = null;
    for (const e of this.enemies) {
      if (Math.hypot(e.view.x - t.view.x, e.view.y - t.view.y) > s.range) continue;
      if (!target || e.dist > target.dist) target = e;
    }
    if (!target) return;
    const want = Math.atan2(target.view.y - t.view.y, target.view.x - t.view.x);
    let diff = want - t.barrel.rotation;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    t.barrel.rotation += diff * Math.min(1, dt * 18);
    if (t.cd > 0) return;
    t.cd = s.rate;
    const d = TOWERS[t.kind];
    const mx = t.view.x + Math.cos(t.barrel.rotation) * 36;
    const my = t.view.y + Math.sin(t.barrel.rotation) * 36;
    const view = new Graphics();
    if (d.splash) view.circle(0, 0, 9).fill(0x2a2a2a).stroke({ width: 3, color: 0xffb020 });
    else view.circle(0, 0, 5).fill(0xbfe8ff).stroke({ width: 2, color: 0x3fb4ff });
    view.position.set(mx, my);
    this.shotLayer.addChild(view);
    // Cannon shells fly to where the target is now; blaster bolts home in.
    this.shots.push({ view, x: mx, y: my, tx: target.view.x, ty: target.view.y, target: d.splash ? null : target, dmg: s.dmg, splash: d.splash, speed: d.speed });
    t.barrel.x = -Math.cos(t.barrel.rotation) * 5;
    t.barrel.y = -Math.sin(t.barrel.rotation) * 5;
    this.tweens.to(t.barrel, { x: 0, y: 0 }, 0.12);
  }

  private updateShots(dt: number): void {
    for (const s of this.shots.slice()) {
      if (s.target && this.enemies.includes(s.target)) {
        s.tx = s.target.view.x;
        s.ty = s.target.view.y;
      }
      const dx = s.tx - s.x;
      const dy = s.ty - s.y;
      const dist = Math.hypot(dx, dy);
      const step = s.speed * dt;
      if (dist > step) {
        s.x += (dx / dist) * step;
        s.y += (dy / dist) * step;
        s.view.position.set(s.x, s.y);
        continue;
      }
      this.shots.splice(this.shots.indexOf(s), 1);
      s.view.destroy();
      if (s.splash) {
        const ring = new Graphics().circle(0, 0, s.splash).fill({ color: 0xffb020, alpha: 0.35 }).stroke({ width: 4, color: 0xffe27a });
        ring.position.set(s.tx, s.ty);
        ring.scale.set(0.3);
        this.fx.addChild(ring);
        this.tweens.to(ring, { alpha: 0 }, 0.3, easeOutCubic, () => ring.destroy());
        this.tweens.to(ring.scale, { x: 1, y: 1 }, 0.2);
        for (const e of this.enemies.slice()) if (Math.hypot(e.view.x - s.tx, e.view.y - s.ty) <= s.splash) this.damage(e, s.dmg);
      } else if (s.target && this.enemies.includes(s.target)) {
        this.damage(s.target, s.dmg);
      }
    }
  }

  private updateHud(): void {
    this.goldTxt.text = `● ${this.gold}`;
    this.hpTxt.text = `♥ ${this.hp}`;
    this.waveTxt.text = this.wave < 0 ? `FIRST WAVE ${Math.ceil(Math.max(0, this.nextWaveIn))}` : `WAVE ${this.wave + 1}/${WAVES.length}`;
    this.hint.text = this.built ? 'Tap a turret to upgrade it' : 'Tap a pad to build a turret';

    // Tutorial hand: pad 1, then the BLASTER button, then gone.
    this.hand.visible = !this.built && !this.over;
    if (this.hand.visible) {
      const [px, py] = CFG.pads[1];
      const [hx, hy] = this.menuPad >= 0 ? [Math.max(12, Math.min(CFG.W - 12 - 332, px - 166)) + 80, py - 92] : [px, py];
      const bob = Math.sin(this.elapsed * 6) * 8;
      this.hand.position.set(hx + 6, hy + 10 + bob);
    }
  }

  // ---------- end ----------

  private end(win: boolean): void {
    if (this.over) return;
    this.over = true;
    this.closeMenu();
    const card = document.getElementById('endcard')!;
    card.classList.toggle('lose', !win);
    document.getElementById('endTitle')!.textContent = win ? 'ROAD DEFENDED!' : 'CASTLE FALLEN';
    document.getElementById('endSub')!.textContent = win
      ? `All ${WAVES.length} waves stopped with ${this.hp}/${CFG.baseHp} castle HP left`
      : `You held until wave ${this.wave + 1} of ${WAVES.length}`;
    document.getElementById('endScore')!.textContent = `${this.kills} enemies defeated`;
    this.tweens.delay(win ? 0.6 : 0.9, () => card.classList.remove('hidden'));
  }

  private reset(): void {
    this.tweens.clear();
    for (const l of [this.world, this.shotLayer, this.fx]) l.removeChildren().forEach((c) => c.destroy());
    this.closeMenu();
    this.buildPads();
    this.enemies = [];
    this.shots = [];
    this.towers = CFG.pads.map(() => null);
    this.queue = [];
    this.gold = CFG.startGold;
    this.hp = CFG.baseHp;
    this.kills = 0;
    this.wave = -1;
    this.clock = 0;
    this.nextWaveIn = CFG.autoStart;
    this.over = false;
    this.elapsed = 0;
    this.built = false;
    this.shake = 0;
    this.fit();
  }

  private restart(): void {
    document.getElementById('endcard')!.classList.add('hidden');
    this.reset();
  }
}
