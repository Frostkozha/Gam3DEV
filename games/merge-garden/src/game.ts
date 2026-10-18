import { Application, Container, FederatedPointerEvent, Graphics, Text } from 'pixi.js';
import { CFG, PLANTS } from './config';
import { makePlant } from './plants';
import { easeOutBack, easeOutCubic, Tweens } from './tween';

const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

function label(text: string, size: number, fill = 0xffffff): Text {
  const t = new Text({ text, style: { fontFamily: FONT, fontSize: size, fontWeight: '900', fill, stroke: { color: 0x1a1030, width: 6 } } });
  t.anchor.set(0.5);
  return t;
}

interface Item { lvl: number; view: Container; c: number; r: number }

// Session state: 5x6 board, seed bag, drag-to-merge, idle hints, timer, win/lose.
export class Game {
  private root = new Container();
  private board = new Container();
  private fx = new Container();
  private tweens = new Tweens();
  private grid: (Item | null)[][] = [];
  private drag: { item: Item; dx: number; dy: number } | null = null;
  private bag = new Container();
  private coins = 0;
  private best = 1;
  private time = CFG.time;
  private started = false;
  private over = false;
  private idle = 0;
  private elapsed = 0;
  private merged = false;
  private hintPair: [Item, Item] | null = null;
  private timerTxt = label('', 34);
  private coinTxt = label('', 34, 0xffd04a);
  private goalRow = new Container();
  private hand = new Graphics();

  constructor(private app: Application) {
    app.stage.addChild(this.root);
    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.on('globalpointermove', (e) => this.onMove(e));
    app.stage.on('pointerup', () => this.onUp());
    app.stage.on('pointerupoutside', () => this.onUp());
    this.buildStatic();
    this.root.addChild(this.board, this.fx, this.hand);
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
    this.app.stage.hitArea = this.app.screen;
  }

  private cellPos(c: number, r: number): { x: number; y: number } {
    const x0 = (CFG.W - CFG.cols * CFG.cell) / 2;
    return { x: x0 + (c + 0.5) * CFG.cell, y: CFG.gridY + (r + 0.5) * CFG.cell };
  }

  private cellAt(x: number, y: number): { c: number; r: number } | null {
    const x0 = (CFG.W - CFG.cols * CFG.cell) / 2;
    const c = Math.floor((x - x0) / CFG.cell);
    const r = Math.floor((y - CFG.gridY) / CFG.cell);
    return c >= 0 && c < CFG.cols && r >= 0 && r < CFG.rows ? { c, r } : null;
  }

  // ---------- static scene ----------

  private buildStatic(): void {
    const bg = new Graphics();
    for (let i = 0; i < 9; i++) bg.circle(Math.random() * CFG.W, Math.random() * CFG.H, 60 + Math.random() * 140).fill({ color: 0xb36bff, alpha: 0.06 });
    const x0 = (CFG.W - CFG.cols * CFG.cell) / 2;
    bg.roundRect(x0 - 16, CFG.gridY - 16, CFG.cols * CFG.cell + 32, CFG.rows * CFG.cell + 32, 30).fill(0x6a4a2a).stroke({ width: 5, color: 0x2a1a10 });
    for (let r = 0; r < CFG.rows; r++)
      for (let c = 0; c < CFG.cols; c++) {
        const p = this.cellPos(c, r);
        bg.roundRect(p.x - 56, p.y - 56, 112, 112, 22).fill((c + r) % 2 ? 0x7d5a34 : 0x86623a);
      }
    this.root.addChild(bg);

    const title = label('MERGE GARDEN', 46, 0x9cff9c);
    title.position.set(CFG.W / 2, 70);
    const sub = label('Drag 2 matching plants together to grow them', 20);
    sub.position.set(CFG.W / 2, 118);
    this.timerTxt.position.set(110, 70);
    this.coinTxt.position.set(CFG.W - 100, 70);
    this.root.addChild(title, sub, this.timerTxt, this.coinTxt);

    // Goal strip: the whole chain, unlocked levels lit up.
    this.goalRow.position.set(CFG.W / 2, 215);
    this.root.addChild(this.goalRow);

    // Seed bag generator.
    const g = new Graphics();
    g.roundRect(-150, -55, 300, 110, 55).fill(0x46d27a).stroke({ width: 5, color: 0x14502a });
    g.ellipse(-100, 0, 28, 34).fill(0xc8955a).stroke({ width: 4, color: 0x2a1a10 });
    g.ellipse(-100, -30, 18, 8).fill(0xa4743e).stroke({ width: 3, color: 0x2a1a10 });
    const t = label('SEED BAG', 32);
    t.position.set(25, -8);
    const t2 = label('tap to plant', 18, 0xdfffdf);
    t2.position.set(25, 24);
    this.bag.addChild(g, t, t2);
    this.bag.position.set(CFG.W / 2, CFG.bagY);
    this.bag.eventMode = 'static';
    this.bag.cursor = 'pointer';
    this.bag.on('pointertap', () => this.spawn());
    this.root.addChild(this.bag);

    this.hand.poly([0, 0, 18, 34, 7, 34, 13, 56, 3, 58, -3, 37, -14, 44]).fill(0xffffff).stroke({ width: 3, color: 0x1a1030 });
    this.hand.eventMode = 'none';
  }

  private drawGoal(): void {
    this.goalRow.removeChildren().forEach((c) => c.destroy());
    const n = PLANTS.length;
    for (let k = 0; k < n; k++) {
      const v = makePlant(k + 1);
      v.scale.set(k + 1 === CFG.goal ? 0.62 : 0.5);
      v.x = (k - (n - 1) / 2) * 92;
      v.alpha = k + 1 <= this.best ? 1 : 0.3;
      this.goalRow.addChild(v);
      if (k < n - 1) {
        const arrow = label('›', 30, 0xffffff);
        arrow.x = v.x + 46;
        arrow.alpha = 0.5;
        this.goalRow.addChild(arrow);
      }
    }
    const goal = label('GOAL', 18, 0xffd04a);
    goal.position.set(((CFG.goal - 1) - (n - 1) / 2) * 92, -48);
    this.goalRow.addChild(goal);
  }

  // ---------- items ----------

  private emptyCells(): { c: number; r: number }[] {
    const out: { c: number; r: number }[] = [];
    for (let r = 0; r < CFG.rows; r++) for (let c = 0; c < CFG.cols; c++) if (!this.grid[r][c]) out.push({ c, r });
    return out;
  }

  private spawn(): void {
    if (this.over) return;
    this.started = true;
    this.idle = 0;
    const empty = this.emptyCells();
    this.bag.scale.set(0.9);
    this.tweens.to(this.bag.scale, { x: 1, y: 1 }, 0.25, easeOutBack);
    if (!empty.length) {
      this.float(CFG.W / 2, CFG.bagY - 90, 'BOARD FULL — MERGE!', 0xff7a8a);
      return;
    }
    const { c, r } = empty[Math.floor(Math.random() * empty.length)];
    const item = this.addItem(Math.random() < CFG.lvl2Chance ? 2 : 1, c, r);
    const p = this.cellPos(c, r);
    item.view.position.set(CFG.W / 2, CFG.bagY - 30);
    item.view.scale.set(0.3);
    this.tweens.to(item.view, { x: p.x, y: p.y }, 0.3, easeOutCubic);
    this.tweens.delay(0, () => this.tweens.to(item.view.scale, { x: 1, y: 1 }, 0.3, easeOutBack));
    this.checkStuck();
  }

  private addItem(lvl: number, c: number, r: number): Item {
    const view = makePlant(lvl);
    const p = this.cellPos(c, r);
    view.position.set(p.x, p.y);
    view.eventMode = 'static';
    view.cursor = 'grab';
    const item: Item = { lvl, view, c, r };
    view.on('pointerdown', (e) => this.onDown(item, e));
    this.board.addChild(view);
    this.grid[r][c] = item;
    return item;
  }

  private onDown(item: Item, e: FederatedPointerEvent): void {
    if (this.over || this.drag) return;
    this.started = true;
    const p = this.root.toLocal(e.global);
    this.tweens.kill(item.view);
    this.drag = { item, dx: item.view.x - p.x, dy: item.view.y - p.y };
    this.board.addChild(item.view); // on top
    item.view.scale.set(1.12);
  }

  private onMove(e: FederatedPointerEvent): void {
    if (!this.drag) return;
    const p = this.root.toLocal(e.global);
    this.drag.item.view.position.set(p.x + this.drag.dx, p.y + this.drag.dy);
  }

  private onUp(): void {
    if (!this.drag) return;
    const { item } = this.drag;
    this.drag = null;
    this.idle = 0;
    item.view.scale.set(1);
    const cell = this.cellAt(item.view.x, item.view.y);
    const target = cell ? this.grid[cell.r][cell.c] : null;
    if (cell && target && target !== item && target.lvl === item.lvl && item.lvl < PLANTS.length) {
      this.merge(item, target);
    } else if (cell && !target) {
      this.grid[item.r][item.c] = null;
      item.c = cell.c;
      item.r = cell.r;
      this.grid[cell.r][cell.c] = item;
      this.snap(item);
    } else {
      this.snap(item);
    }
  }

  private snap(item: Item): void {
    const p = this.cellPos(item.c, item.r);
    this.tweens.to(item.view, { x: p.x, y: p.y }, 0.2, easeOutCubic);
  }

  private merge(a: Item, b: Item): void {
    this.grid[a.r][a.c] = null;
    a.view.destroy();
    this.grid[b.r][b.c] = null;
    b.view.destroy();
    const lvl = b.lvl + 1;
    const item = this.addItem(lvl, b.c, b.r);
    item.view.scale.set(0.5);
    this.tweens.to(item.view.scale, { x: 1, y: 1 }, 0.35, easeOutBack);
    const p = this.cellPos(b.c, b.r);
    this.burst(p.x, p.y, PLANTS[lvl - 1].bg, 8 + lvl * 2);
    const gain = 10 * lvl;
    this.coins += gain;
    this.float(p.x, p.y - 50, `+${gain}`, 0xffd04a);
    this.merged = true;
    this.hintPair = null;
    if (lvl > this.best) {
      this.best = lvl;
      this.drawGoal();
      if (lvl < CFG.goal) this.float(p.x, p.y - 90, `NEW: ${PLANTS[lvl - 1].name.toUpperCase()}!`, 0x9cff9c);
    }
    if (lvl >= CFG.goal) this.end(true);
  }

  private findPair(): [Item, Item] | null {
    const seen = new Map<number, Item>();
    for (const row of this.grid)
      for (const it of row) {
        if (!it || it.lvl >= PLANTS.length) continue;
        const o = seen.get(it.lvl);
        if (o) return [o, it];
        seen.set(it.lvl, it);
      }
    return null;
  }

  private checkStuck(): void {
    if (!this.emptyCells().length && !this.findPair()) this.end(false, 'No moves left — the garden is full');
  }

  // ---------- fx ----------

  private burst(x: number, y: number, color: number, n: number): void {
    for (let k = 0; k < n; k++) {
      const p = new Graphics().circle(0, 0, 3 + Math.random() * 5).fill(color);
      p.position.set(x, y);
      this.fx.addChild(p);
      const a = Math.random() * Math.PI * 2;
      const r = 40 + Math.random() * 50;
      this.tweens.to(p, { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, alpha: 0 }, 0.5, easeOutCubic, () => p.destroy());
    }
  }

  private float(x: number, y: number, text: string, color: number): void {
    const t = label(text, 28, color);
    t.position.set(x, y);
    this.fx.addChild(t);
    this.tweens.to(t, { y: y - 50, alpha: 0 }, 0.9, easeOutCubic, () => t.destroy());
  }

  // ---------- loop ----------

  private update(dt: number): void {
    this.tweens.update(dt);
    this.elapsed += dt;
    if (!this.over && this.started) {
      this.time -= dt;
      if (this.time <= 0) {
        this.time = 0;
        this.end(false, `Time's up — you grew a ${PLANTS[this.best - 1].name}`);
      }
    }
    this.timerTxt.text = `⏱ ${Math.ceil(this.time)}`;
    this.timerTxt.style.fill = this.time < 15 ? 0xff7a8a : 0xffffff;
    this.coinTxt.text = `● ${this.coins}`;

    // Idle hint: wiggle one mergeable pair.
    if (!this.drag && !this.over) this.idle += dt;
    if (this.idle > CFG.hintAfter && !this.hintPair) this.hintPair = this.findPair();
    if (this.hintPair && (this.hintPair[0].view.destroyed || this.hintPair[1].view.destroyed || this.idle < CFG.hintAfter)) {
      for (const it of this.hintPair) if (!it.view.destroyed) it.view.rotation = 0;
      this.hintPair = null;
    }
    if (this.hintPair) for (const it of this.hintPair) it.view.rotation = Math.sin(this.elapsed * 18) * 0.08;

    this.updateHand();
  }

  // Tutorial hand: tap the bag, then drag the first pair together, then gone.
  private updateHand(): void {
    this.hand.visible = !this.merged && !this.over && !this.drag;
    if (!this.hand.visible) return;
    const pair = this.findPair();
    if (!pair) {
      this.hand.position.set(CFG.W / 2 + 40, CFG.bagY + 10 + Math.sin(this.elapsed * 6) * 8);
      return;
    }
    const t = (this.elapsed % 1.4) / 1.4;
    const e = easeOutCubic(Math.min(1, t * 1.4));
    const a = pair[0].view;
    const b = pair[1].view;
    this.hand.position.set(a.x + (b.x - a.x) * e + 10, a.y + (b.y - a.y) * e + 10);
  }

  // ---------- end ----------

  private end(win: boolean, why = ''): void {
    if (this.over) return;
    this.over = true;
    this.drag = null;
    const card = document.getElementById('endcard')!;
    card.classList.toggle('lose', !win);
    document.getElementById('endTitle')!.textContent = win ? 'GARDEN COMPLETE!' : 'OUT OF ROOM';
    if (!win && this.time <= 0) document.getElementById('endTitle')!.textContent = "TIME'S UP";
    document.getElementById('endSub')!.textContent = win ? `You grew a Golden Tree with ${Math.ceil(this.time)} s to spare` : why;
    document.getElementById('endScore')!.textContent = `● ${this.coins} coins`;
    this.tweens.delay(win ? 0.8 : 0.6, () => card.classList.remove('hidden'));
  }

  private reset(): void {
    this.tweens.clear();
    for (const l of [this.board, this.fx]) l.removeChildren().forEach((c) => c.destroy());
    this.grid = Array.from({ length: CFG.rows }, () => Array<Item | null>(CFG.cols).fill(null));
    this.coins = 0;
    this.best = 1;
    this.time = CFG.time;
    this.started = false;
    this.over = false;
    this.idle = 0;
    this.elapsed = 0;
    this.merged = false;
    this.hintPair = null;
    this.drag = null;
    // Starter board: one pair ready to merge so the first move is obvious.
    this.addItem(1, 1, 2);
    this.addItem(1, 3, 2);
    this.addItem(2, 2, 4);
    this.drawGoal();
  }

  private restart(): void {
    document.getElementById('endcard')!.classList.add('hidden');
    this.reset();
  }
}
