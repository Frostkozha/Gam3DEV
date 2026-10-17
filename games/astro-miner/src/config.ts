// Every gameplay tunable in one place (distances in world units, times in seconds, prices in coins).
export const CFG = {
  drone: {
    accel: 9,
    decel: 16,
    baseSpeed: 7,
    speedStep: 2,
    /** Below this speed the drone counts as stopped and stations start transferring. */
    stopSpeed: 0.4,
    hover: 1.1,
    /** Gap from the drone to the first pod, and between pods (arc length). */
    firstGap: 1.9,
    podGap: 1.6,
  },
  cargo: { perPod: 4, startPods: 1, maxPods: 4 },
  transfer: { interval: 0.13, flight: 0.42 },
  refinery: { processSec: 0.5, outputCap: 12 },
  ship: { need: 3, price: 10, queue: 3, maxLost: 5, judgeDelay: 0.8 },
  upgrades: { pod: [15, 30, 50], speed: [20, 40] },
  automation: [
    { title: 'AUTO-MINER', desc: 'Laser feeds ore to the refinery', cost: 40 },
    { title: 'CARGO HAULER', desc: 'Crystals fly to ships by themselves', cost: 80 },
    { title: 'TRADE HUB', desc: 'Complete your space empire', cost: 120 },
  ],
  auto: { minerInterval: 0.45, haulerInterval: 0.4, minerInputCap: 6 },
  /** Zones along the loop as fractions of its length. */
  zones: {
    asteroid: [0.1, 0.2],
    refinery: [0.43, 0.53],
    dock: [0.76, 0.86],
  },
  camera: { height: 18, back: 16, portraitK: 1.5, smooth: 3.2 },
  idleHintSec: 4,
  finaleDelay: 3.6,
} as const;

export type ZoneId = keyof typeof CFG.zones;
export type ItemKind = 'ore' | 'crystal';
