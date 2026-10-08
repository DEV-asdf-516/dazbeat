import type Phaser from 'phaser';
import type { Judgment } from '../../rhythm/types.js';

export const COLORS = {
  background: 0x0f0f10,
  surface: 0x19191b,
  surfaceRaised: 0x232326,
  border: 0x34343a,
  textPrimary: 0xf2f0eb,
  textSecondary: 0xb4b1aa,
  textMuted: 0x85837d,
  textDisabled: 0x55534f,
  primaryHover: 0xffffff,
  primaryPressed: 0xd9d6cf,
  note: 0xedeae4,
  /** 노트 아래쪽 면·리본 가장자리의 차가운 은빛. 결과 별자리 팔레트의 silver 와 같다. */
  noteShade: 0xc5d4e6,
  /** HOLD 리본 면의 차가운 월광. 결과 별자리 팔레트의 icy blue 와 같다. */
  holdRibbon: 0xacd9f0,
  /** 진행 궤적·꺼진 빛의 차가운 청회색. */
  nightTrace: 0x536f8d,
} as const;

/** 채보 에디터와 공용 확인 팝업이 쓰는 CELESTIAL 팔레트. 공용 COLORS 는 다른 화면이 공유하므로 바꾸지 않는다. */
export const EDITOR_COLORS = {
  background: 0x080f20,
  surface: 0x141f34,
  surfaceHover: 0x253a57,
  border: 0x536f8d,
  textPrimary: 0xf4f6f2,
  textSecondary: 0xc5d4e6,
  selected: 0xacd9f0,
  highlight: 0xe9f2fa,
} as const;

/** 안정·주의·위험 상태색. STARLIGHT 게이지 단계색과 확인 팝업의 위험 강조가 같은 의미로 쓴다. */
export const STATUS_COLORS = { stable: 0x9dcfe3, caution: 0xddbb7c, danger: 0xe57579 } as const;

/**
 * 달밤 팔레트에 맞춰 채도를 낮춘 판정색. 좋은 판정일수록 밝아 색을 구분하기 어려워도 밝기로 순서가 읽힌다.
 * 달빛 금 → 얼음빛 → 새벽 청 → 황혼 보라, MISS 만 STATUS 위험색 계열의 장밋빛이다.
 */
export const JUDGMENT_COLORS: Record<Judgment, number> = {
  perfect: 0xf3e2ae,
  great: 0xa9dceb,
  good: 0x8faedc,
  bad: 0x9b8db5,
  miss: 0xd9787e,
};

/**
 * 모든 글자의 서체. 숫자는 Noto Serif KR 숫자 별칭(style.css), 라틴 글자는 Cormorant Garamond,
 * 일본어는 Noto Serif JP, 한글은 Noto Serif KR 로 그린다.
 * JP 를 KR 보다 앞에 두어 일본어 곡명의 한자·가나가 일본식 자형으로 나온다. JP 에는 한글이 없어 한글은 KR 로 넘어간다.
 */
export const FONT_FAMILY =
  '"Dazbeat Numerals", "Cormorant Garamond", "Noto Serif JP", "Noto Serif KR", serif';
/**
 * 이메일처럼 글자와 숫자가 섞인 사용자 데이터용. FONT_FAMILY 로 그리면 숫자만 다른 서체가 되어
 * 한 단어가 끊겨 보이므로 한 서체로 그린다.
 */
export const DATA_FONT_FAMILY = '"Pretendard Variable", sans-serif';

export type TypeRole =
  | 'display'
  | 'title'
  | 'heading'
  | 'number'
  | 'combo'
  | 'judgment'
  | 'hudScore'
  | 'primary'
  | 'secondary'
  | 'meta';

export const TYPE_SCALE: Record<TypeRole, { sizePx: number; weight: number }> = {
  display: { sizePx: 160, weight: 800 },
  title: { sizePx: 64, weight: 800 },
  heading: { sizePx: 40, weight: 700 },
  number: { sizePx: 88, weight: 700 },
  combo: { sizePx: 80, weight: 800 },
  judgment: { sizePx: 48, weight: 800 },
  hudScore: { sizePx: 40, weight: 700 },
  primary: { sizePx: 30, weight: 600 },
  secondary: { sizePx: 24, weight: 500 },
  meta: { sizePx: 22, weight: 500 },
};

export const DISPLAY_LETTER_SPACING_PX = -3;

export const RADIUS = { smallPx: 4, mediumPx: 8 } as const;

export const INDICATOR = {
  underlineThicknessPx: 3,
  underlineOffsetPx: 8,
} as const;

export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** setColor 는 같은 색이어도 텍스트를 다시 그리므로 바뀔 때만 적용한다. */
export function setTextColor(text: Phaser.GameObjects.Text, color: number): void {
  const css = cssColor(color);
  if (text.style.color !== css) {
    text.setColor(css);
  }
}

export type EditorTypeRole = 'title' | 'control' | 'body' | 'meta';

/** 채보 에디터 전용 서체 역할. 공용 TYPE_SCALE 은 다른 화면이 공유하므로 바꾸지 않는다. */
export const EDITOR_TYPE_SCALE: Record<EditorTypeRole, { sizePx: number; weight: number }> = {
  title: { sizePx: 22, weight: 600 },
  control: { sizePx: 15, weight: 500 },
  body: { sizePx: 15, weight: 400 },
  meta: { sizePx: 13, weight: 400 },
};

/** 크기·굵기 한 쌍으로 TextStyle 을 만든다. textStyle 과 같은 font family·색 표기를 쓴다. */
export function typeStyle(
  type: { sizePx: number; weight: number },
  color: number,
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT_FAMILY,
    fontSize: `${type.sizePx}px`,
    fontStyle: `${type.weight}`,
    color: cssColor(color),
  };
}

export function textStyle(
  role: TypeRole,
  color: number,
  weight?: number,
): Phaser.Types.GameObjects.Text.TextStyle {
  const { sizePx, weight: roleWeight } = TYPE_SCALE[role];
  const style = typeStyle({ sizePx, weight: weight ?? roleWeight }, color);
  return role === 'display' ? { ...style, letterSpacing: DISPLAY_LETTER_SPACING_PX } : style;
}

export const MOTION = { fastMs: 140, mediumMs: 420 } as const;

/** 메뉴형 씬(메인·설정·크레딧·결과)이 공유하는 화면 여백과 머리글·힌트 위치. */
export const SCREEN_LAYOUT = {
  leftXPx: 160,
  rightXPx: 1760,
  headerYPx: 96,
  hintYPx: 960,
} as const;

export const GAMEPLAY_DEPTH = {
  world: 0,
  lanePanel: 1,
  laneDivider: 2,
  lanePulse: 3,
  text: 4,
  judgeLine: 5,
  anchor: 6,
  holdBody: 7,
  note: 8,
  hitFx: 9,
} as const;
