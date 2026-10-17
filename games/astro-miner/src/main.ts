import { Game } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);

let last = performance.now();
let paused = false;
document.addEventListener('visibilitychange', () => {
  paused = document.hidden;
  last = performance.now();
});

function frame(now: number): void {
  requestAnimationFrame(frame);
  if (paused) return;
  // Clamp dt so a long hitch never teleports the drone past a station.
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
}
requestAnimationFrame(frame);
