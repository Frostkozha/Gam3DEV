# Tile Trio — PixiJS playable (portfolio)

A ~2 min tile-matching puzzle playable built with **PixiJS 8 + TypeScript + Vite**. All art is procedural `Graphics`; there are no asset files.

**Tap a free tile** (not covered by a tile on a higher layer) to move it into the 7-slot tray. Three of a kind in the tray pop for +30 coins. Clear all 66 tiles to win.

- **Boosters:** Undo ×1 (returns the last tile to the board), Shuffle ×1 (re-deals the symbols left on the board).
- **Fail:** the tray fills up with 7 unmatched tiles, or the 2:00 timer runs out (it starts on your first tap).

## Run
```bash
npm i
npm run dev      # http://localhost:5176
npm run build    # dist/index.html — a single self-contained file
```
Console QA: `__game.debugWin()`.

## How it is built
| File | Role |
|---|---|
| `src/game.ts` | Session: layered deal, blocked-tile test, tray insertion next to same type, triple matching, boosters, timer, HUD, endcard |
| `src/tiles.ts` | Procedural tile (body, depth edge, blocked shade) and 7 vector symbols |
| `src/tween.ts` | Tiny tween/timer manager on the Pixi ticker |
| `src/config.ts` | Every tunable (layer grid, tray, timer, rewards, symbol palette) |

Techniques: 720×1280 design space letterboxed to any screen; layers offset by half a tile so overlap decides which tiles are free; tray state updates instantly while the animation follows, so fast tapping never desyncs; z-ordering by layer and row for the 3D tile edge.

Contrast with Astro Miner: 2D vs 3D, a discrete puzzle vs a real-time idle loop, PixiJS vs Three.js.
