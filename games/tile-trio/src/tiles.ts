import { Container, Graphics } from 'pixi.js';
import { CFG, TYPES } from './config';

export interface Tile {
  view: Container;
  sym: Graphics;
  shade: Graphics;
  type: number;
  layer: number;
  bx: number;
  by: number;
  blocked: boolean;
  state: 'board' | 'tray' | 'gone';
}

function ring(n: number, r: (i: number) => number, a0: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * Math.PI * 2) / n;
    pts.push(Math.cos(a) * r(i), Math.sin(a) * r(i));
  }
  return pts;
}

export function drawSymbol(g: Graphics, type: number): void {
  const { shape, color } = TYPES[type];
  g.clear();
  switch (shape) {
    case 'circle': g.circle(0, 0, 23); break;
    case 'square': g.roundRect(-21, -21, 42, 42, 7); break;
    case 'triangle': g.poly([0, -25, 25, 19, -25, 19]); break;
    case 'diamond': g.poly([0, -27, 21, 0, 0, 27, -21, 0]); break;
    case 'star': g.poly(ring(10, (i) => (i % 2 ? 11 : 27), -Math.PI / 2)); break;
    case 'hex': g.poly(ring(6, () => 24, 0)); break;
    case 'heart': g.circle(-11, -6, 13).circle(11, -6, 13).poly([-23, 0, 23, 0, 0, 25]); break;
  }
  g.fill(color);
  g.circle(-7, -9, 5).fill({ color: 0xffffff, alpha: 0.55 });
}

export function makeTile(type: number, layer: number, bx: number, by: number): Tile {
  const w = CFG.tileW - 4;
  const h = CFG.tileH - 4;
  const view = new Container();
  const body = new Graphics()
    .roundRect(-w / 2, -h / 2 + 7, w, h, 12).fill(0x8a6a44)
    .roundRect(-w / 2, -h / 2, w, h, 12).fill(0xfff6e4).stroke({ width: 3, color: 0xd9c39a });
  const sym = new Graphics();
  drawSymbol(sym, type);
  const shade = new Graphics().roundRect(-w / 2, -h / 2, w, h + 7, 12).fill({ color: 0x1a1030, alpha: 0.5 });
  view.addChild(body, sym, shade);
  view.position.set(bx, by);
  view.eventMode = 'static';
  view.cursor = 'pointer';
  return { view, sym, shade, type, layer, bx, by, blocked: false, state: 'board' };
}
