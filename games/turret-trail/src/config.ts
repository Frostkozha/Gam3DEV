// Every tunable in one place. Coordinates are in the 720x1280 design space.
export const CFG = {
  W: 720,
  H: 1280,
  // Road waypoints, spawn first, castle gate last.
  path: [[-40, 250], [560, 250], [560, 520], [160, 520], [160, 800], [560, 800], [560, 1060], [360, 1060], [360, 1170]] as [number, number][],
  roadWidth: 64,
  pads: [[300, 385], [470, 385], [660, 385], [60, 660], [300, 660], [470, 660], [300, 930], [660, 930]] as [number, number][],
  padR: 40,
  baseHp: 10,
  startGold: 140,
  autoStart: 6, // seconds before wave 1 if the player has not built yet
  waveGap: 3, // seconds between the last spawn of a wave and the next wave
  upgradeCost: [60, 100], // to level 2, to level 3
  // Per level above 1: damage x, fire interval x, range +.
  lvlDmg: 1.7,
  lvlRate: 0.85,
  lvlRange: 18,
};

export type TowerKind = 'blaster' | 'cannon';
export interface TowerDef { name: string; cost: number; range: number; rate: number; dmg: number; splash: number; speed: number; color: number }
export const TOWERS: Record<TowerKind, TowerDef> = {
  blaster: { name: 'BLASTER', cost: 50, range: 175, rate: 0.3, dmg: 9, splash: 0, speed: 950, color: 0x3fb4ff },
  cannon: { name: 'CANNON', cost: 80, range: 160, rate: 1.1, dmg: 28, splash: 80, speed: 560, color: 0xffb020 },
};

export type EnemyKind = 'grunt' | 'runner' | 'tank' | 'boss';
export interface EnemyDef { hp: number; speed: number; gold: number; r: number; color: number; dmg: number }
export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  grunt: { hp: 56, speed: 120, gold: 7, r: 18, color: 0x46d27a, dmg: 1 },
  runner: { hp: 36, speed: 190, gold: 6, r: 14, color: 0xff6fb5, dmg: 1 },
  tank: { hp: 240, speed: 80, gold: 15, r: 24, color: 0xb36bff, dmg: 2 },
  boss: { hp: 1600, speed: 75, gold: 80, r: 34, color: 0xff5a6e, dmg: 5 },
};

// Each wave is a list of groups spawned one after another: n enemies, one every `every` seconds.
export const WAVES: { kind: EnemyKind; n: number; every: number }[][] = [
  [{ kind: 'grunt', n: 8, every: 0.8 }],
  [{ kind: 'grunt', n: 5, every: 0.6 }, { kind: 'runner', n: 6, every: 0.45 }],
  [{ kind: 'tank', n: 3, every: 1.2 }, { kind: 'grunt', n: 8, every: 0.5 }],
  [{ kind: 'runner', n: 10, every: 0.35 }, { kind: 'tank', n: 4, every: 0.9 }],
  [{ kind: 'grunt', n: 6, every: 0.4 }, { kind: 'boss', n: 1, every: 1 }, { kind: 'tank', n: 3, every: 0.9 }],
];
