export const RUN_LOG = {
  patches: 162,
  perPole: 81,
  minutes: 13.4,
  secPerPatch: 4.9,
  machine: 'M1 Pro CPU',
  testPatches: 25,
  testRmse: 0.0277,
  cardRmse: 0.0293,
  testR2: 0.99,
  cardR2: 0.988,
  testMae: 0.0185,
  cardMae: 0.0197,
  peakGb: 5.1,
  poleRmse: { north: 0.0298, south: 0.0236 },
} as const;

export const CAVEATS = [
  'a knowledge-driven model, not measured ice',
  "shouldn't substitute for instrumental measurements or operational decision-making regarding lunar landing sites",
] as const;

export const CREDITS =
  "Models: NASA & IBM (Apache-2.0). Data: SomBench (CC-BY-4.0), NASA PDS LOLA. Moon renders: NASA's Goddard Space " +
  'Flight Center / NASA SVS. Artemis regions: USGS, DOI 10.5066/P1MEQ6UK (CC0).';
