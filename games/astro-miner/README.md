# Astro Miner — Three.js playable (portfolio)

A ~60 s idle/tycoon playable ad built with **Three.js 0.170 + TypeScript + Vite**. All models are procedural low-poly; there are no asset files.

**Hold to fly** the mining drone around the orbit lane and **release to stop** at a station:

1. **Asteroid field** — ore flies into your cargo pods.
2. **Refinery** — unload ore; it is refined into crystals that load back into your pods.
3. **Trade dock** — deliver crystals to the waiting cargo ships (+10 coins each). A full ship leaves happy.

Spend coins on cards: **+Cargo Pod**, **Engine Boost**, then three automations: **Auto-Miner** (laser feeds the refinery) → **Cargo Hauler** (crystals fly to ships by themselves) → **Trade Hub** (you win).

**Fail:** after your first sale, every pass through the dock without a delivery sends a ship away unserved. Five lost ships = game over.

## Run
```bash
npm i
npm run dev      # http://localhost:5175
npm run build    # dist/index.html — a single self-contained file
```
Desktop: hold the mouse button or **Space**. Console QA: `__game.debugCoins(200)`.

## How it is built
| File | Role |
|---|---|
| `src/game.ts` | Session state machine: drone movement, station trades, refinery, ship queue, fail rule, upgrades, guidance, camera |
| `src/loop.ts` | Closed Catmull-Rom path addressed by arc length (`pointAt`, `outwardAt`, `inRange`) |
| `src/models.ts` | Procedural drone, pods, asteroids (noise-displaced icosahedra), refinery, dock, ships, planet, starfield |
| `src/fx.ts` | Pooled items flying on Bezier arcs toward moving targets; pooled spark bursts |
| `src/ui.ts` | DOM HUD, upgrade cards, popups, flying coins, endcard |
| `src/config.ts` | Every tunable (speeds, prices, zone positions, timings) |

Techniques: arc-length spline movement with trailing pods; stations as arc-length zones that trade only while the drone is stopped; slot reservation so items in flight never collide; an `UnrealBloomPass` post-process with emissive materials; ACES tone mapping; an exponential-smoothing follow camera with focus shots and a finale pull-back; portrait/landscape camera scaling.

The design was inspired by a teardown of two Playbox playables (Train Miner — Three.js, Solitaire — PixiJS): a hold-to-move loop, a station production chain, three automations as the win condition, and an "empty lap" fail counter.
