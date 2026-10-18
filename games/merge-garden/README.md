# Merge Garden — PixiJS playable (portfolio)

A ~60 s merge-2 playable built with **PixiJS 8 + TypeScript + Vite**. All art is procedural `Graphics`; there are no asset files.

**Tap the seed bag** to plant a seed in a random free cell (25% chance of a sprout). **Drag a plant onto an identical one** to merge them into the next level: Seed → Sprout → Clover → Tulip → Sunflower → **Golden Tree**. Drag onto an empty cell to move.

- **Win:** grow a Golden Tree.
- **Fail:** the 75 s timer runs out (it starts on your first tap), or the board is full with no pair left to merge.
- After 4 s idle, a mergeable pair wiggles as a hint. A tutorial hand shows the first merge.

## Run
```bash
npm i
npm run dev      # http://localhost:5179
npm run build    # dist/index.html — a single self-contained file
```
Console QA: `__game.debugWin()`.

## How it is built
| File | Role |
|---|---|
| `src/game.ts` | Session: grid, seed bag spawner, drag and drop with snap-back, merge, goal chain strip, idle hint, tutorial hand, timer, endcard |
| `src/plants.ts` | Procedural plant tile per merge level |
| `src/config.ts` | Every tunable (grid, timer, goal level, spawn odds, chain) |
| `src/tween.ts` | Tiny tween/timer manager on the Pixi ticker (shared with Tile Trio) |

Balance was checked by stepping `update()` headlessly with a bot: even at one action per 1.3 s the Golden Tree is reached with time to spare, which suits an easy ad.
