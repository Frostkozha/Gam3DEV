# Turret Trail — PixiJS playable (portfolio)

A ~70 s hyper-casual tower defense playable built with **PixiJS 8 + TypeScript + Vite**. All art is procedural `Graphics`; there are no asset files.

**Tap a stone pad** to build a turret, **tap a turret** to upgrade it (up to level 3). Hold the road for 5 waves; the last one brings a crowned boss. Enemies that reach the castle cost HP (boss: 5).

- **Blaster** (50 gold): fast homing bolts, single target.
- **Cannon** (80 gold): slow shells that splash everything near the impact point.
- Kills pay gold. Wave 1 starts 1.5 s after your first build, or after 6 s if you do nothing.
- **Win:** every wave cleared. **Fail:** castle HP hits 0.

## Run
```bash
npm i
npm run dev      # http://localhost:5178
npm run build    # dist/index.html — a single self-contained file
```
Console QA: `__game.debugWin()`.

## How it is built
| File | Role |
|---|---|
| `src/game.ts` | Session: road polyline and distance-based movement, pads and build/upgrade menu, targeting (furthest along the road in range), homing vs. splash projectiles, wave spawner, HUD, tutorial hand, endcard |
| `src/config.ts` | Every tunable (road waypoints, pads, tower and enemy stats, wave list, level scaling) |
| `src/tween.ts` | Tiny tween/timer manager on the Pixi ticker (shared with Tile Trio) |

Techniques: enemies store only a distance along the road, so position, facing and "who is in front" are cheap; the next wave starts when the previous one has finished spawning, not when it is cleared, so waves overlap and pressure builds; menus re-render on gold changes so affordability is always current.

Balance was tuned by stepping `update()` headlessly with scripted players: focused upgrading wins without a leak, spreading level-1 turrets lets the boss through, and building nothing loses by wave 3.
