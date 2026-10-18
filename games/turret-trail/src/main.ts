import { Application } from 'pixi.js';
import { Game } from './game';

async function boot(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, background: 0x1b3a2a, antialias: true, resolution: Math.min(2, devicePixelRatio), autoDensity: true });
  document.body.prepend(app.canvas);
  document.getElementById('loading')?.remove();
  (window as unknown as { __game: Game }).__game = new Game(app);
}
boot();
