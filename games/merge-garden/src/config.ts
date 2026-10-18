// Every tunable in one place. Coordinates are in the 720x1280 design space.
export const CFG = {
  W: 720,
  H: 1280,
  cols: 5,
  rows: 6,
  cell: 124,
  gridY: 300,
  bagY: 1130,
  time: 75, // starts on the first tap
  goal: 6, // level that wins
  lvl2Chance: 0.25, // a seed bag tap sometimes drops a sprout
  hintAfter: 4, // idle seconds before a mergeable pair wiggles
};

// Merge chain, level 1 first.
export const PLANTS: { name: string; bg: number }[] = [
  { name: 'Seed', bg: 0xe8c48a },
  { name: 'Sprout', bg: 0x5bbf6a },
  { name: 'Clover', bg: 0x2fa86a },
  { name: 'Tulip', bg: 0xff6f8e },
  { name: 'Sunflower', bg: 0xffb020 },
  { name: 'Golden Tree', bg: 0xffd84a },
];
