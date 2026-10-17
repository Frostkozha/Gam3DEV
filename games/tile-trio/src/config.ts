// Every tunable in one place. Coordinates are in the 720x1280 design space.
export const CFG = {
  W: 720,
  H: 1280,
  tileW: 84,
  tileH: 96,
  boardY: 520,
  // [cols, rows] per layer, bottom first; centring offsets alternate layers by half a tile.
  layers: [[6, 5], [5, 4], [4, 3], [2, 2]] as [number, number][], // 66 tiles = 22 triples
  slots: 7,
  slotW: 92,
  trayY: 1010,
  trayScale: 0.82,
  time: 120,
  matchCoins: 30,
  undoUses: 1,
  shuffleUses: 1,
};

export type Shape = 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'hex' | 'heart';
export const TYPES: { shape: Shape; color: number }[] = [
  { shape: 'circle', color: 0xff5a6e },
  { shape: 'square', color: 0x3fb4ff },
  { shape: 'triangle', color: 0x46d27a },
  { shape: 'diamond', color: 0xffb020 },
  { shape: 'star', color: 0xb36bff },
  { shape: 'hex', color: 0x20c3b2 },
  { shape: 'heart', color: 0xff6fb5 },
];
