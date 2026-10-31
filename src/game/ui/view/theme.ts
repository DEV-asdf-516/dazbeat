import type Phaser from 'phaser';
import type { SongCategory } from '../../../data/songs.js';
import type { Judgment } from '../../../rhythm/types.js';

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
  // textSecondary 는 푸른 은색이라 밝은 목록 유리 위에서 푸르게 떠 보이므로 무채색으로 둔다.
  textNeutral: 0xc8c8cb,
} as const;

/** 글자색이 같으면 분류가 구분되지 않아 달빛 파랑과 금빛으로 나눈다. 판정·상태 색과 겹치지 않게 채도를 맞춘다. */
export const CATEGORY_COLORS: Record<SongCategory, number> = {
  original: 0x8fc4ee,
  cover: 0xe8c98a,
};

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

/** Pretendard 에 일본어 한자·가나가 대부분 없어 일본어는 Noto Sans JP 로 넘긴다. */
export const FONT_FAMILY = '"Pretendard Variable", "Noto Sans JP", sans-serif';
/**
 * Phaser 는 이 문자열을 그려 글자 높이를 잰다. 기본값은 라틴 글자뿐이라
 * 그보다 높은 한글·가나·한자 획(ㅓ·ㅝ 윗머리 등)이 캔버스 위로 잘린다.
 */
const CJK_TEST_STRING = '|MÉqgy쥐넘훨뷁あ漢';

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

// 곡 선택·프로필 목록이 같이 쓴다. 선택 별의 고리(반지름 약 20px)가 행 내용에 닿지 않게 노드를 행 왼쪽 밖에 두고,
// 선택 행은 노드부터 행 끝까지 어두운 판으로 덮어 밝은 목록 유리 위에서 눌린 듯 읽히게 한다.
export const LIST_ROW = {
  nodeOffsetXPx: 36,
  selectedFill: {
    insetYPx: 2,
    color: 0x02040b,
    alpha: 0.55,
  },
} as const;

// 메인 계정 카드와 업적 알림이 같은 판 재료를 쓴다.
export const CARD_PANEL = {
  fillColor: COLORS.background,
  fillAlpha: 0.6,
  borderColor: COLORS.textMuted,
  borderAlpha: 0.35,
  borderPx: 1,
} as const;

export const INDICATOR = {
  underlineThicknessPx: 3,
  underlineOffsetPx: 8,
} as const;

export function addTextUnderline(
  scene: Phaser.Scene,
  text: Phaser.GameObjects.Text,
  color: number,
): Phaser.GameObjects.Rectangle {
  const bottomLeft = text.getBottomLeft();
  return scene.add
    .rectangle(
      bottomLeft.x,
      bottomLeft.y + INDICATOR.underlineOffsetPx,
      text.width,
      INDICATOR.underlineThicknessPx,
      color,
    )
    .setOrigin(0, 0);
}

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

/** setFontStyle 은 같은 굵기여도 텍스트를 다시 그리므로 바뀔 때만 적용한다. */
export function setTextWeight(text: Phaser.GameObjects.Text, weight: number): void {
  const fontStyle = `${weight}`;
  if (text.style.fontStyle !== fontStyle) {
    text.setFontStyle(fontStyle);
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
