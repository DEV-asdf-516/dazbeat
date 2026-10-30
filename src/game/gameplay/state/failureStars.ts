import type { AmbientPlacement } from '../../celestial/state/celestialPlacements.js';

// 평소 플레이 화면은 별 0개라 CELESTIAL_SCREENS 에 넣지 않는다. 배열 순서가 하나씩 사라지는 순서다.
export const GAMEPLAY_FAILURE_STARS: readonly AmbientPlacement[] = [
  {
    id: 'R11',
    xPx: 300,
    yPx: 220,
    scale: 0.0625,
    phaseFraction: 0,
  },
  {
    id: 'R11',
    xPx: 1380,
    yPx: 260,
    scale: 0.0625,
    phaseFraction: 0.89,
  },
  {
    id: 'R11',
    xPx: 560,
    yPx: 330,
    scale: 0.046875,
    phaseFraction: 0.13,
  },
  {
    id: 'R11',
    xPx: 1660,
    yPx: 380,
    scale: 0.078125,
    phaseFraction: 0,
  },
  {
    id: 'R11',
    xPx: 180,
    yPx: 470,
    scale: 0.078125,
    phaseFraction: 0.3,
  },
  {
    id: 'R11',
    xPx: 1450,
    yPx: 540,
    scale: 0.046875,
    phaseFraction: 0.13,
  },
  {
    id: 'R11',
    xPx: 470,
    yPx: 610,
    scale: 0.0625,
    phaseFraction: 0.47,
  },
  {
    id: 'R11',
    xPx: 1760,
    yPx: 690,
    scale: 0.0625,
    phaseFraction: 0.3,
  },
  {
    id: 'R11',
    xPx: 260,
    yPx: 820,
    scale: 0.046875,
    phaseFraction: 0.65,
  },
  {
    id: 'R11',
    xPx: 1540,
    yPx: 880,
    scale: 0.078125,
    phaseFraction: 0.47,
  },
];
