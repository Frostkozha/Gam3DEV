import { Container, Graphics } from 'pixi.js';
import { PLANTS } from './config';

const INK = 0x2a1a10;

// Procedural plant tile for a merge level (1-based), centred on 0,0, about 104px wide.
export function makePlant(lvl: number): Container {
  const view = new Container();
  const g = new Graphics();
  g.roundRect(-52, -48, 104, 104, 26).fill({ color: 0x000000, alpha: 0.25 });
  g.roundRect(-52, -52, 104, 104, 26).fill(PLANTS[lvl - 1].bg).stroke({ width: 4, color: INK });
  g.roundRect(-44, -46, 88, 30, 14).fill({ color: 0xffffff, alpha: 0.18 });
  const stem = (h: number) => g.roundRect(-4, 30 - h, 8, h, 4).fill(0x2f7a3a).stroke({ width: 2, color: INK });
  switch (lvl) {
    case 1:
      g.ellipse(0, 10, 16, 20).fill(0x5a3a1e).stroke({ width: 3, color: INK });
      g.ellipse(-5, 2, 4, 7).fill({ color: 0xffffff, alpha: 0.35 });
      break;
    case 2:
      g.ellipse(0, 30, 26, 8).fill(0x6a4a2a);
      stem(34);
      leafAt(g, -14, -4, -0.5);
      leafAt(g, 14, -8, 0.5);
      break;
    case 3:
      g.ellipse(0, 30, 28, 8).fill(0x6a4a2a);
      stem(30);
      for (const [x, y] of [[-12, -8], [12, -8], [0, -26]]) g.circle(x, y, 14).fill(0x46d27a).stroke({ width: 3, color: INK });
      break;
    case 4:
      g.ellipse(0, 30, 28, 8).fill(0x6a4a2a);
      stem(40);
      leafAt(g, -14, 12, -0.6);
      g.poly([-18, -30, -9, -14, 0, -32, 9, -14, 18, -30, 16, -2, -16, -2]).fill(0xff3a5e).stroke({ width: 3, color: INK });
      break;
    case 5:
      stem(36);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        g.ellipse(Math.cos(a) * 20, -12 + Math.sin(a) * 20, 9, 9).fill(0xffe04a).stroke({ width: 2, color: INK });
      }
      g.circle(0, -12, 14).fill(0x6a3a14).stroke({ width: 3, color: INK });
      break;
    default:
      g.roundRect(-7, 0, 14, 34, 4).fill(0x8a5a2a).stroke({ width: 3, color: INK });
      for (const [x, y, r] of [[-18, -6, 18], [18, -6, 18], [0, -26, 22]]) g.circle(x, y, r).fill(0xffc21a).stroke({ width: 3, color: INK });
      g.star(24, -36, 4, 8, 3).fill(0xffffff);
      g.star(-26, -30, 4, 6, 2).fill(0xffffff);
  }
  // Level badge.
  g.circle(36, 36, 13).fill(0xffffff).stroke({ width: 3, color: INK });
  view.addChild(g);
  const pips = new Graphics();
  for (let k = 0; k < lvl; k++) {
    const a = -Math.PI / 2 + (k / lvl) * Math.PI * 2;
    pips.circle(36 + Math.cos(a) * 6, 36 + Math.sin(a) * 6, lvl === 1 ? 4 : 2.6).fill(INK);
  }
  view.addChild(pips);
  return view;
}

function leafAt(g: Graphics, x: number, y: number, rot: number): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const pts: number[] = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const lx = Math.cos(a) * 15;
    const ly = Math.sin(a) * 7;
    pts.push(x + lx * c - ly * s, y + lx * s + ly * c);
  }
  g.poly(pts).fill(0x7be07a).stroke({ width: 2, color: INK });
}
