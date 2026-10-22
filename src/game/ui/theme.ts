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
  /** 결과 별자리 팔레트의 silver 와 같다. */
  noteShade: 0xc5d4e6,
  /** 결과 별자리 팔레트의 icy blue 와 같다. */
  holdRibbon: 0xacd9f0,
  nightTrace: 0x536f8d,
} as const;

/** 공용 COLORS 는 다른 화면이 공유하므로 바꾸지 않는다. */
export const CELESTIAL_COLORS = {
  background: 0x080f20,
  surface: 0x141f34,
  surfaceHover: 0x253a57,
  border: 0x536f8d,
  textPrimary: 0xf4f6f2,
  textSecondary: 0xc5d4e6,
  selected: 0xacd9f0,
  highlight: 0xe9f2fa,
} as const;

export const STATUS_COLORS = {
  stable: 0x9dcfe3,
  caution: 0xddbb7c,
  danger: 0xe57579,
} as const;

/** 달밤 팔레트에 맞춰 채도를 낮춘다. 좋은 판정일수록 밝아 색을 구분하기 어려워도 밝기로 순서가 읽힌다. */
export const JUDGMENT_COLORS: Record<Judgment, number> = {
  perfect: 0xf3e2ae,
  great: 0xa9dceb,
  good: 0x8faedc,
  bad: 0x9b8db5,
  miss: 0xd9787e,
};

/** JP 를 KR 보다 앞에 두어 일본어 곡명의 한자·가나가 일본식 자형으로 나온다. JP 에는 한글이 없어 한글은 KR 로 넘어간다. */
export const FONT_FAMILY =
  '"Dazbeat Numerals", "Cormorant Garamond", "Noto Serif JP", "Noto Serif KR", serif';
/**
 * Phaser 는 이 문자열을 그려 글자 높이를 잰다. 기본값은 라틴 글자뿐이라 Cormorant 기준으로 재어,
 * 그보다 높은 Noto Serif KR·JP 의 한글·가나·한자 획(ㅓ·ㅝ 윗머리 등)이 캔버스 위로 잘린다.
 */
const CJK_TEST_STRING = '|MÉqgy쥐넘훨뷁あ漢';
/** FONT_FAMILY 로 그리면 숫자만 다른 서체가 되어 한 단어가 끊겨 보이므로 한 서체로 그린다. */
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
  display: {
    sizePx: 160,
    weight: 800,
  },
  title: {
    sizePx: 64,
    weight: 800,
  },
  heading: {
    sizePx: 40,
    weight: 700,
  },
  number: {
    sizePx: 88,
    weight: 700,
  },
  combo: {
    sizePx: 80,
    weight: 800,
  },
  judgment: {
    sizePx: 48,
    weight: 800,
  },
  hudScore: {
    sizePx: 40,
    weight: 700,
  },
  primary: {
    sizePx: 30,
    weight: 600,
  },
  secondary: {
    sizePx: 24,
    weight: 500,
  },
  meta: {
    sizePx: 22,
    weight: 500,
  },
};

export const DISPLAY_LETTER_SPACING_PX = -3;

export const RADIUS = {
  smallPx: 4,
  mediumPx: 8,
} as const;

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

export function typeStyle(
  type: { sizePx: number; weight: number },
  color: number,
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT_FAMILY,
    fontSize: `${type.sizePx}px`,
    fontStyle: `${type.weight}`,
    color: cssColor(color),
    testString: CJK_TEST_STRING,
  };
}

export function textStyle(
  role: TypeRole,
  color: number,
  weight?: number,
): Phaser.Types.GameObjects.Text.TextStyle {
  const { sizePx, weight: roleWeight } = TYPE_SCALE[role];
  const style = typeStyle(
    {
      sizePx,
      weight: weight ?? roleWeight,
    },
    color,
  );
  return role === 'display'
    ? {
        ...style,
        letterSpacing: DISPLAY_LETTER_SPACING_PX,
      }
    : style;
}

export const MOTION = {
  fastMs: 140,
  mediumMs: 420,
} as const;

export const MODAL = {
  // 플레이 HUD·노트(GAMEPLAY_DEPTH)와 에디터 timeline 위에 그려 팝업 아래 입력을 막는다.
  depth: 100,
  backdropAlpha: 0.6,
  panelColor: 0x10192a,
  panelRadiusPx: 6,
  shadowColor: 0x02050c,
  shadowAlpha: 0.35,
  shadowOffsetXPx: 8,
  shadowOffsetYPx: 12,
} as const;

export const SCREEN_LAYOUT = {
  leftXPx: 160,
  rightXPx: 1760,
  headerYPx: 96,
  hintYPx: 988,
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
