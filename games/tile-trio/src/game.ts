import { Application, Container, Graphics, Text } from 'pixi.js';
import { CFG, TYPES } from './config';
import { drawSymbol, makeTile, Tile } from './tiles';
import { easeInCubic, easeOutBack, easeOutCubic, Tweens } from './tween';

const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function label(text: string, size: number, fill = 0xffffff): Text {
  const t = new Text({ text, style: { fontFamily: FONT, fontSize: size, fontWeight: '900', fill, stroke: { color: 0x1a1030, width: 6 } } });
  t.anchor.set(0.5);
  return t;
}

interface Booster { view: Container; count: Text; left: () => number }

// Session state: deal, free/blocked tiles, 7-slot tray with triple matching, boosters, timer, win/lose.
export class Game {
  private root = new Container();
  private board = new Container();
  private trayLayer = new Container();
  private fx = new Container();
  private tweens = new Tweens();
  private boardTiles: Tile[] = [];
  private tray: Tile[] = [];
  private history: Tile[] = [];
  private coins = 0;
  private time = CFG.time;
  private started = false;
  private over = false;
  private undoLeft = CFG.undoUses;
  private shuffleLeft = CFG.shuffleUses;
  private elapsed = 0;
  private timerTxt = label('', 34);
  private coinTxt = label('', 34, 0xffd04a);
  private trayWarn = new Graphics();
  private hand = new Graphics();
  private boosters: Booster[] = [];

  constructor(app: Application) {
    app.stage.addChild(this.root);
    this.buildStatic();
    this.board.sortableChildren = true;
    this.root.addChild(this.board, this.trayLayer, this.fx, this.hand);
    this.deal();
    window.addEventListener('resize', () => this.fit());
    this.fit();
    app.ticker.add((tk) => this.update(Math.min(0.05, tk.deltaMS / 1000)));
    document.getElementById('endBtn')!.addEventListener('click', () => this.restart());
  }

  debugWin(): void {
    for (const t of this.boardTiles) t.view.destroy();
    this.boardTiles = [];
    this.end(true);
  }

  private fit(): void {
    const s = Math.min(window.innerWidth / CFG.W, window.innerHeight / CFG.H);
    this.root.scale.set(s);
    this.root.position.set((window.innerWidth - CFG.W * s) / 2, (window.innerHeight - CFG.H * s) / 2);
  }

  private buildStatic(): void {
    const bg = new Graphics();
    for (let i = 0; i < 9; i++) bg.circle(Math.random() * CFG.W, Math.random() * CFG.H, 60 + Math.random() * 140).fill({ color: 0x8a5cff, alpha: 0.06 });
    bg.roundRect(20, CFG.boardY - 300, CFG.W - 40, 600, 30).fill({ color: 0x000000, alpha: 0.18 });
    this.root.addChild(bg);

    const title = label('TILE TRIO', 46, 0xffd04a);
    title.position.set(CFG.W / 2, 70);
    const sub = label('Tap free tiles · match 3 · clear the board', 20);
    sub.position.set(CFG.W / 2, 118);
    this.timerTxt.position.set(110, 70);
    this.coinTxt.position.set(CFG.W - 100, 70);
    this.root.addChild(title, sub, this.timerTxt, this.coinTxt);

    // Tray: wooden shelf with 7 slot sockets.
    const tray = new Graphics();
    const tw = CFG.slots * CFG.slotW + 24;
    tray.roundRect((CFG.W - tw) / 2, CFG.trayY - 62, tw, 128, 22).fill(0x5a3a22).stroke({ width: 4, color: 0x2e1a0c });
    for (let i = 0; i < CFG.slots; i++) {
      const p = this.slotPos(i);
      tray.roundRect(p.x - 36, p.y - 42, 72, 84, 10).fill({ color: 0x000000, alpha: 0.28 });
    }
    this.trayWarn.roundRect((CFG.W - tw) / 2, CFG.trayY - 62, tw, 128, 22).stroke({ width: 6, color: 0xff3a50 });
    this.trayWarn.visible = false;
    this.root.addChild(tray, this.trayWarn);

    this.boosters = [
      this.makeBooster('UNDO', CFG.W / 2 - 120, () => this.undo(), () => this.undoLeft),
      this.makeBooster('SHUFFLE', CFG.W / 2 + 120, () => this.reshuffle(), () => this.shuffleLeft),
    ];
  }

  private makeBooster(name: string, x: number, onTap: () => void, left: () => number): Booster {
    const view = new Container();
    const g = new Graphics().roundRect(-95, -36, 190, 72, 36).fill(0x3fb4ff).stroke({ width: 4, color: 0x1a4f8a });
    const t = label(name, 26);
    const badge = new Graphics().circle(88, -30, 20).fill(0xff5a6e);
    const count = label('', 22);
    count.position.set(88, -30);
    view.addChild(g, t, badge, count);
    view.position.set(x, 1170);
    view.eventMode = 'static';
    view.cursor = 'pointer';
    view.on('pointertap', onTap);
    this.root.addChild(view);
    return { view, count, left };
  }

  private slotPos(i: number): { x: number; y: number } {
    return { x: CFG.W / 2 + (i - (CFG.slots - 1) / 2) * CFG.slotW, y: CFG.trayY };
  }

  private deal(): void {
    const spots: { L: number; x: number; y: number }[] = [];
    CFG.layers.forEach(([c, r], L) => {
      for (let j = 0; j < r; j++)
        for (let i = 0; i < c; i++)
          spots.push({ L, x: CFG.W / 2 + (i - (c - 1) / 2) * CFG.tileW, y: CFG.boardY + (j - (r - 1) / 2) * CFG.tileH });
    });
    const types: number[] = [];
    for (let k = 0; k < spots.length / 3; k++) types.push(k % TYPES.length, k % TYPES.length, k % TYPES.length);
    shuffle(types);
    spots.forEach((s, n) => {
      const t = makeTile(types[n], s.L, s.x, s.y);
      t.view.zIndex = s.L * 1000 + s.y;
      t.view.on('pointertap', () => this.pick(t));
      // Deal-in animation: drop from above, staggered by layer.
      t.view.y = s.y - 400;
      t.view.alpha = 0;
      this.tweens.delay(0.02 * n, () => {
        this.tweens.to(t.view, { y: s.y, alpha: 1 }, 0.45, easeOutBack);
      });
      this.board.addChild(t.view);
      this.boardTiles.push(t);
    });
    this.refreshBlocked();
    this.refreshHud();
  }

  private refreshBlocked(): void {
    for (const t of this.boardTiles) {
      t.blocked = this.boardTiles.some(
        (o) => o.layer > t.layer && Math.abs(o.bx - t.bx) < CFG.tileW - 2 && Math.abs(o.by - t.by) < CFG.tileH - 2,
      );
      t.shade.visible = t.blocked;
    }
    const free = this.boardTiles.filter((t) => !t.blocked).sort((a, b) => b.layer - a.layer)[0];
    if (free && !this.started) this.hand.position.set(free.bx, free.by);
  }

  private refreshHud(): void {
    const s = Math.max(0, Math.ceil(this.time));
    this.timerTxt.text = `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.timerTxt.style.fill = s <= 15 ? 0xff5a6e : 0xffffff;
    this.coinTxt.text = `● ${this.coins}`;
    for (const b of this.boosters) {
      b.count.text = String(b.left());
      b.view.alpha = b.left() > 0 && !this.over ? 1 : 0.4;
    }
    this.trayWarn.visible = this.tray.length >= CFG.slots - 2;
  }

  private pick(t: Tile): void {
    if (this.over || t.state !== 'board') return;
    if (t.blocked || this.tray.length >= CFG.slots) {
      this.tweens.to(t.view, { x: t.bx + 7 }, 0.06, easeOutCubic, () => this.tweens.to(t.view, { x: t.bx }, 0.12, easeOutBack));
      return;
    }
    this.started = true;
    this.hand.visible = false;

    this.boardTiles.splice(this.boardTiles.indexOf(t), 1);
    t.state = 'tray';
    t.view.eventMode = 'none';
    this.trayLayer.addChild(t.view);
    let idx = -1;
    this.tray.forEach((o, i) => { if (o.type === t.type) idx = i; });
    this.tray.splice(idx >= 0 ? idx + 1 : this.tray.length, 0, t);
    this.history.push(t);
    this.refreshBlocked();
    this.layoutTray();

    const same = this.tray.filter((o) => o.type === t.type);
    if (same.length === 3) {
      this.tray = this.tray.filter((o) => o.type !== t.type);
      this.history = this.history.filter((o) => o.type !== t.type);
      for (const o of same) o.state = 'gone';
      this.coins += CFG.matchCoins;
      this.tweens.delay(0.3, () => {
        for (const o of same) this.pop(o);
        this.popup(`+${CFG.matchCoins}`, same[1].view.x, CFG.trayY - 80, 0xffd04a);
        this.layoutTray();
        this.refreshHud();
        if (!this.over && this.boardTiles.length === 0 && this.tray.length === 0) this.end(true);
      });
    } else if (this.tray.length >= CFG.slots) {
      this.over = true;
      this.tweens.delay(0.6, () => this.end(false, 'TRAY FULL'));
    }
    this.refreshHud();
  }

  private layoutTray(): void {
    this.tray.forEach((o, i) => {
      const p = this.slotPos(i);
      this.tweens.to(o.view, { x: p.x, y: p.y }, 0.28, easeOutCubic);
      this.tweens.to(o.view.scale, { x: CFG.trayScale, y: CFG.trayScale }, 0.28, easeOutCubic);
    });
  }

  private pop(o: Tile): void {
    this.sparks(o.view.x, o.view.y, TYPES[o.type].color);
    this.tweens.to(o.view.scale, { x: 1.1, y: 1.1 }, 0.1, easeOutCubic, () =>
      this.tweens.to(o.view.scale, { x: 0, y: 0 }, 0.18, easeInCubic, () => {
        this.tweens.kill(o.view);
        o.view.destroy({ children: true });
      }),
    );
  }

  private sparks(x: number, y: number, color: number): void {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const s = new Graphics().circle(0, 0, 6).fill(color);
      s.position.set(x, y);
      this.fx.addChild(s);
      this.tweens.to(s, { x: x + Math.cos(a) * 70, y: y + Math.sin(a) * 70, alpha: 0 }, 0.5, easeOutCubic, () => s.destroy());
    }
  }

  private popup(text: string, x: number, y: number, fill: number): void {
    const t = label(text, 36, fill);
    t.position.set(x, y);
    this.fx.addChild(t);
    this.tweens.to(t, { y: y - 80, alpha: 0 }, 0.9, easeOutCubic, () => t.destroy());
  }

  private undo(): void {
    const t = this.history.pop();
    if (this.over || this.undoLeft <= 0 || !t) {
      if (t) this.history.push(t);
      return;
    }
    this.undoLeft--;
    this.tray.splice(this.tray.indexOf(t), 1);
    t.state = 'board';
    t.view.eventMode = 'static';
    this.boardTiles.push(t);
    this.board.addChild(t.view);
    this.tweens.to(t.view, { x: t.bx, y: t.by }, 0.3, easeOutCubic);
    this.tweens.to(t.view.scale, { x: 1, y: 1 }, 0.3, easeOutCubic);
    this.refreshBlocked();
    this.layoutTray();
    this.refreshHud();
  }

  private reshuffle(): void {
    if (this.over || this.shuffleLeft <= 0) return;
    this.shuffleLeft--;
    const types = shuffle(this.boardTiles.map((t) => t.type));
    this.boardTiles.forEach((t, i) => {
      t.type = types[i];
      drawSymbol(t.sym, t.type);
      t.view.scale.set(0.6);
      this.tweens.to(t.view.scale, { x: 1, y: 1 }, 0.35, easeOutBack);
    });
    this.refreshHud();
  }

  private update(dt: number): void {
    this.elapsed += dt;
    this.tweens.update(dt);
    if (!this.started && !this.over) {
      this.hand.clear().circle(0, 0, 36 + Math.sin(this.elapsed * 6) * 8).stroke({ width: 6, color: 0xffffff, alpha: 0.9 });
    }
    if (this.started && !this.over) {
      this.time -= dt;
      if (this.time <= 0) this.end(false, "TIME'S UP");
      this.trayWarn.alpha = 0.5 + 0.5 * Math.sin(this.elapsed * 10);
      this.refreshHud();
    }
  }

  private end(win: boolean, reason = ''): void {
    this.over = true;
    this.refreshHud();
    const card = document.getElementById('endcard')!;
    card.classList.toggle('lose', !win);
    document.getElementById('endTitle')!.textContent = win ? 'BOARD CLEARED!' : reason;
    document.getElementById('endSub')!.textContent = win
      ? `With ${Math.ceil(this.time)} s to spare.`
      : `${this.boardTiles.length} tiles left on the board.`;
    document.getElementById('endScore')!.textContent = `● ${this.coins + (win ? Math.ceil(this.time) * 5 : 0)}`;
    card.classList.remove('hidden');
  }

  private restart(): void {
    document.getElementById('endcard')!.classList.add('hidden');
    this.tweens.clear();
    for (const c of [this.board, this.trayLayer, this.fx]) c.removeChildren().forEach((v) => v.destroy({ children: true }));
    this.boardTiles = [];
    this.tray = [];
    this.history = [];
    this.coins = 0;
    this.time = CFG.time;
    this.started = false;
    this.over = false;
    this.undoLeft = CFG.undoUses;
    this.shuffleLeft = CFG.shuffleUses;
    this.hand.visible = true;
    this.deal();
  }
}
