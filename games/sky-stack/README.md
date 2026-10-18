# Sky Stack

Three.js one-tap stacking playable ad (~40 s). A block slides back and forth above the tower; tap (or press space) to drop it. Whatever hangs over the edge is sliced off and tumbles away, so the next block is smaller. Land within a hair of the block below for a **PERFECT** (no cut); three perfects in a row start widening the block again. Reach 20 floors to win; miss the tower completely and it's over.

```bash
npm install
npm run dev     # http://localhost:5180
npm run build   # dist/index.html, single file
```
Console QA: `__game.debugWin()`.

How it is built (`src/game.ts`): an orthographic isometric camera that rises with the tower; the slide axis alternates x/z each floor; the cut is one subtraction on that axis, the kept block is re-meshed and the sliced chunk becomes a debris body with gravity and spin; block colour walks the hue wheel per floor while the sky darkens. Speed ramps with height. Difficulty was checked with simulated players: an aim error up to ±0.35 units always reaches 20 floors.
