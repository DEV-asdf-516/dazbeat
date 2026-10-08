export type CelestialScreen = 'main' | 'songSelect' | 'gameplay' | 'result' | 'secondary';

/** 화면 좌표는 sprite anchor 위치, scale 은 균일 배율, phase 는 loop 시작 위상(총 시간 대비 비율)이다. */
export interface AmbientPlacement {
  id: string;
  xPx: number;
  yPx: number;
  scale: number;
  phaseFraction: number;
}

export interface CelestialScreenLayers {
  backgroundId: string | null;
  hasGrain: boolean;
  dustOpacity: number;
  ambient: readonly AmbientPlacement[];
}

// ambient 는 design/dazbeat/review/screens/*-placement.json 의 R11·R12·R13·R27 layer 를 파일 순서대로 옮긴 값이다.
export const CELESTIAL_SCREENS: Readonly<Record<CelestialScreen, CelestialScreenLayers>> = {
  main: {
    backgroundId: 'R01',
    hasGrain: true,
    dustOpacity: 0.1,
    ambient: [
      { id: 'R11', xPx: 1008, yPx: 194, scale: 0.0625, phaseFraction: 0 },
      { id: 'R11', xPx: 1142, yPx: 126, scale: 0.0625, phaseFraction: 0.13 },
      { id: 'R11', xPx: 1246, yPx: 304, scale: 0.078125, phaseFraction: 0.3 },
      { id: 'R11', xPx: 1362, yPx: 460, scale: 0.046875, phaseFraction: 0.47 },
      { id: 'R11', xPx: 1565, yPx: 300, scale: 0.078125, phaseFraction: 0.65 },
      { id: 'R11', xPx: 1740, yPx: 400, scale: 0.0625, phaseFraction: 0.89 },
      { id: 'R11', xPx: 1500, yPx: 685, scale: 0.09375, phaseFraction: 0 },
      { id: 'R11', xPx: 1650, yPx: 850, scale: 0.0625, phaseFraction: 0.13 },
      { id: 'R11', xPx: 1800, yPx: 922, scale: 0.046875, phaseFraction: 0.3 },
      { id: 'R11', xPx: 820, yPx: 700, scale: 0.0625, phaseFraction: 0.47 },
      { id: 'R11', xPx: 620, yPx: 850, scale: 0.078125, phaseFraction: 0.65 },
      { id: 'R11', xPx: 420, yPx: 925, scale: 0.0625, phaseFraction: 0.89 },
      { id: 'R11', xPx: 1020, yPx: 890, scale: 0.09375, phaseFraction: 0 },
      { id: 'R11', xPx: 1095, yPx: 665, scale: 0.046875, phaseFraction: 0.13 },
      { id: 'R13', xPx: 1080, yPx: 650, scale: 0.09375, phaseFraction: 0.3 },
      { id: 'R13', xPx: 1220, yPx: 784, scale: 0.09375, phaseFraction: 0.47 },
      { id: 'R13', xPx: 1460, yPx: 905, scale: 0.09375, phaseFraction: 0.65 },
      { id: 'R13', xPx: 1610, yPx: 548, scale: 0.09375, phaseFraction: 0.89 },
      { id: 'R13', xPx: 1690, yPx: 945, scale: 0.09375, phaseFraction: 0 },
      { id: 'R12', xPx: 1500, yPx: 300, scale: 0.1875, phaseFraction: 0.47 },
      { id: 'R12', xPx: 1720, yPx: 685, scale: 0.1875, phaseFraction: 0.65 },
      { id: 'R27', xPx: 1530, yPx: 750, scale: 2.5, phaseFraction: 0.13 },
    ],
  },
  songSelect: {
    backgroundId: 'R02',
    hasGrain: true,
    dustOpacity: 0.08,
    ambient: [
      { id: 'R11', xPx: 840, yPx: 75, scale: 0.0625, phaseFraction: 0 },
      { id: 'R11', xPx: 1250, yPx: 75, scale: 0.0625, phaseFraction: 0.13 },
      { id: 'R11', xPx: 1490, yPx: 510, scale: 0.0625, phaseFraction: 0.3 },
      { id: 'R11', xPx: 1515, yPx: 860, scale: 0.078125, phaseFraction: 0.47 },
      { id: 'R11', xPx: 1690, yPx: 730, scale: 0.046875, phaseFraction: 0.65 },
      { id: 'R11', xPx: 1810, yPx: 940, scale: 0.0625, phaseFraction: 0.89 },
      { id: 'R11', xPx: 1040, yPx: 1030, scale: 0.078125, phaseFraction: 0 },
      { id: 'R11', xPx: 610, yPx: 1030, scale: 0.046875, phaseFraction: 0.13 },
      { id: 'R13', xPx: 1478, yPx: 320, scale: 0.09375, phaseFraction: 0.3 },
      { id: 'R13', xPx: 1790, yPx: 640, scale: 0.09375, phaseFraction: 0.47 },
      { id: 'R13', xPx: 930, yPx: 1018, scale: 0.09375, phaseFraction: 0.65 },
    ],
  },
  gameplay: {
    backgroundId: null,
    hasGrain: false,
    dustOpacity: 0.022,
    ambient: [],
  },
  result: {
    backgroundId: 'R03',
    hasGrain: true,
    dustOpacity: 0.12,
    ambient: [
      { id: 'R11', xPx: 790, yPx: 125, scale: 0.0625, phaseFraction: 0 },
      { id: 'R11', xPx: 1030, yPx: 225, scale: 0.0625, phaseFraction: 0.13 },
      { id: 'R11', xPx: 1190, yPx: 413, scale: 0.046875, phaseFraction: 0.3 },
      { id: 'R11', xPx: 840, yPx: 657, scale: 0.0625, phaseFraction: 0.47 },
      { id: 'R11', xPx: 1180, yPx: 847, scale: 0.078125, phaseFraction: 0.65 },
      { id: 'R11', xPx: 765, yPx: 975, scale: 0.0625, phaseFraction: 0.89 },
      { id: 'R11', xPx: 1420, yPx: 935, scale: 0.046875, phaseFraction: 0 },
      { id: 'R11', xPx: 1710, yPx: 761, scale: 0.0625, phaseFraction: 0.13 },
      { id: 'R11', xPx: 1700, yPx: 639, scale: 0.0625, phaseFraction: 0.3 },
      { id: 'R11', xPx: 1830, yPx: 981, scale: 0.046875, phaseFraction: 0.47 },
      { id: 'R13', xPx: 906, yPx: 890, scale: 0.09375, phaseFraction: 0.3 },
      { id: 'R13', xPx: 1110, yPx: 90, scale: 0.09375, phaseFraction: 0.47 },
      { id: 'R13', xPx: 1180, yPx: 615, scale: 0.09375, phaseFraction: 0.65 },
      { id: 'R13', xPx: 1378, yPx: 907, scale: 0.09375, phaseFraction: 0.89 },
      { id: 'R13', xPx: 1752, yPx: 827, scale: 0.09375, phaseFraction: 0 },
      { id: 'R13', xPx: 790, yPx: 484, scale: 0.09375, phaseFraction: 0.13 },
      { id: 'R12', xPx: 1480, yPx: 635, scale: 0.1875, phaseFraction: 0.47 },
    ],
  },
  // 보드는 Settings 캡처 없이 만든 예시라, 실제 Settings 행·제목과 겹치는 세 좌표만 오른쪽 빈 영역으로 옮겼다.
  secondary: {
    backgroundId: 'R04',
    hasGrain: true,
    dustOpacity: 0.055,
    ambient: [
      { id: 'R11', xPx: 1760, yPx: 300, scale: 0.0625, phaseFraction: 0 },
      { id: 'R11', xPx: 1645, yPx: 744, scale: 0.0625, phaseFraction: 0.13 },
      { id: 'R11', xPx: 1380, yPx: 180, scale: 0.078125, phaseFraction: 0.3 },
      { id: 'R11', xPx: 1510, yPx: 949, scale: 0.046875, phaseFraction: 0.47 },
      { id: 'R13', xPx: 1310, yPx: 886, scale: 0.09375, phaseFraction: 0.3 },
      { id: 'R13', xPx: 1700, yPx: 520, scale: 0.09375, phaseFraction: 0.47 },
    ],
  },
};

/**
 * STARLIGHT 실패 연출에서만 잠시 띄우는 R11 별이다. 평소 플레이 화면은 별 0개라 CELESTIAL_SCREENS 에 넣지 않는다.
 * 레인 왼쪽·오른쪽을 번갈아 나열하며, 배열 순서가 하나씩 사라지는 순서다.
 */
export const GAMEPLAY_FAILURE_STARS: readonly AmbientPlacement[] = [
  { id: 'R11', xPx: 300, yPx: 220, scale: 0.0625, phaseFraction: 0 },
  { id: 'R11', xPx: 1380, yPx: 260, scale: 0.0625, phaseFraction: 0.89 },
  { id: 'R11', xPx: 560, yPx: 330, scale: 0.046875, phaseFraction: 0.13 },
  { id: 'R11', xPx: 1660, yPx: 380, scale: 0.078125, phaseFraction: 0 },
  { id: 'R11', xPx: 180, yPx: 470, scale: 0.078125, phaseFraction: 0.3 },
  { id: 'R11', xPx: 1450, yPx: 540, scale: 0.046875, phaseFraction: 0.13 },
  { id: 'R11', xPx: 470, yPx: 610, scale: 0.0625, phaseFraction: 0.47 },
  { id: 'R11', xPx: 1760, yPx: 690, scale: 0.0625, phaseFraction: 0.3 },
  { id: 'R11', xPx: 260, yPx: 820, scale: 0.046875, phaseFraction: 0.65 },
  { id: 'R11', xPx: 1540, yPx: 880, scale: 0.078125, phaseFraction: 0.47 },
];
