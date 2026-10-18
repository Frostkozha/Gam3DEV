# Gam3DEV — web game portfolio

A collection of browser games and playable ads built with **Three.js** and **PixiJS**. Each game is a separate, self-contained project with its own `package.json`, under [`games/`](games/).

| Game | Engine | Genre | Folder |
|---|---|---|---|
| Astro Miner | Three.js 0.170 + Vite + TypeScript | 3D idle / tycoon playable ad-like game | [`games/astro-miner`](games/astro-miner) |
| Tile Trio | PixiJS 8.5 + Vite + TypeScript | 2D tile-match puzzle playable ad | [`games/tile-trio`](games/tile-trio) |
| Neon Dash | Three.js 0.170 + Vite + TypeScript | 3D lane runner playable ad | [`games/neon-dash`](games/neon-dash) |
| Turret Trail | PixiJS 8.5 + Vite + TypeScript | 2D hyper-casual tower defense playable ad | [`games/turret-trail`](games/turret-trail) |
| Merge Garden | PixiJS 8.5 + Vite + TypeScript | 2D merge-2 playable ad | [`games/merge-garden`](games/merge-garden) |

## Running a game
```bash
cd games/<game>
npm install
npm run dev     # local dev server
npm run build   # dist/index.html — a single self-contained file
```

## Branches
- `main` — stable, released games only.
- `develop` — integration branch; finished features are merged here first.
- `feature/<game-or-feature>` — one branch per new game or feature, branched from `develop`.

Workflow: `feature/*` → pull request into `develop` → when stable, `develop` → `main`.

## Adding a new game
1. `git checkout develop && git checkout -b feature/<game-name>`
2. Create `games/<game-name>/` with its own `package.json`, `README.md` and `.gitignore`.
3. Add a row to the table above.
4. Merge into `develop`, then into `main`.
