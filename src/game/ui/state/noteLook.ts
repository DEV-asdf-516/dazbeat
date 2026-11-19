// 플레이 화면 노트와 조작 안내 카드의 노트 그림이 함께 쓰는 생김새 값.

export const PLAYFIELD_JUDGE_LINE_WIDTH_PX = {
  4: 920,
  5: 980,
  6: 1040,
} as const;
export const NOTE_PLATE_WIDTH_RATIO = 0.8;
export const HOLD_RIBBON_WIDTH_RATIO = 0.72;
export const HOLD_RIBBON_EDGE_PX = 1;
export const HOLD_RIBBON_PENDING_ALPHA = 0.9;
export const HOLD_RIBBON_TAIL_ALPHA = 0.45;
export const NOTE_APPROACH_RANGE_PX = 280;
export const NOTE_FAR_ALPHA = 0.86;
export const HOLD_CONTACT = {
  widthRatio: 132 / 120,
  heightPx: 30,
  alpha: 0.55,
} as const;
export const HIT_SQUASH = {
  tapScaleX: 1.4,
  holdScaleX: 1.2,
  scaleY: 0.5,
} as const;
export const HIT_BLOOM = {
  core: {
    widthPx: {
      from: 96,
      to: 40,
    },
    heightPx: {
      from: 96,
      to: 40,
    },
    alpha: 1,
    durationMs: 120,
  },
  streak: {
    widthPx: {
      from: 160,
      to: 560,
    },
    heightPx: {
      from: 10,
      to: 4,
    },
    alpha: 0.9,
    durationMs: 260,
  },
  haze: {
    widthPx: {
      from: 160,
      to: 380,
    },
    heightPx: {
      from: 70,
      to: 150,
    },
    alpha: 0.7,
    durationMs: 420,
  },
} as const;
export type HitBloomLayer = keyof typeof HIT_BLOOM;
