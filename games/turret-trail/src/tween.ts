export type Ease = (t: number) => number;
export const easeOutCubic: Ease = (t) => 1 - (1 - t) ** 3;
export const easeInCubic: Ease = (t) => t * t * t;
export const easeOutBack: Ease = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

type Target = Record<string, any>;
interface Tw { target: Target; to: Record<string, number>; from: Record<string, number> | null; dur: number; t: number; ease: Ease; done?: () => void }

// Minimal tween + timer manager driven by the Pixi ticker. A new tween on a target replaces the old one.
export class Tweens {
  private list: Tw[] = [];
  private timers: { t: number; fn: () => void }[] = [];

  to(target: Target, to: Record<string, number>, dur: number, ease: Ease = easeOutCubic, done?: () => void): void {
    this.kill(target);
    this.list.push({ target, to, from: null, dur, t: 0, ease, done });
  }

  delay(t: number, fn: () => void): void {
    this.timers.push({ t, fn });
  }

  kill(target: Target): void {
    this.list = this.list.filter((w) => w.target !== target);
  }

  clear(): void {
    this.list = [];
    this.timers = [];
  }

  update(dt: number): void {
    for (const tm of this.timers.slice()) {
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(this.timers.indexOf(tm), 1);
        tm.fn();
      }
    }
    for (const w of this.list.slice()) {
      if (!this.list.includes(w)) continue;
      if (!w.from) {
        w.from = {};
        for (const k in w.to) w.from[k] = w.target[k];
      }
      w.t += dt;
      const p = Math.min(1, w.t / w.dur);
      const e = w.ease(p);
      for (const k in w.to) w.target[k] = w.from[k] + (w.to[k] - w.from[k]) * e;
      if (p >= 1) {
        this.list.splice(this.list.indexOf(w), 1);
        w.done?.();
      }
    }
  }
}
