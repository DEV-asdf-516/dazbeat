import { clamp } from '../range.js';

/** 화면 맨 위에서 노트가 어둠 속에서 떠오르는 구간. 진행 표시(y 40)를 지나는 동안은 흐리게 둔다. */
export const NOTE_EMERGE_END_Y_PX = 160;
/** 판정선에서 이 거리 안으로 들어오면 명도가 조금씩 올라 타이밍을 예고한다. */
export const NOTE_APPROACH_RANGE_PX = 280;
export const NOTE_FAR_ALPHA = 0.86;
/** HOLD 리본은 head 에서 tail 쪽으로 갈수록 지속음처럼 잦아든다. tail 쪽 끝의 밝기 배율이다. */
export const HOLD_RIBBON_TAIL_ALPHA = 0.45;

export interface VerticalSpan {
  topYPx: number;
  bottomYPx: number;
}

/** 위·아래 끝의 밝기 배율이 다른 세로 구간. 그 사이는 선형으로 이어진다. */
export interface FadingSpan extends VerticalSpan {
  topAlpha: number;
  bottomAlpha: number;
}

/** HOLD 리본을 진입 구간 아래의 본체와, 화면 위 진입 구간에서 떠오르는 페이드 조각으로 나눈 것. */
export interface HoldRibbonSpans {
  body: FadingSpan | null;
  fade: FadingSpan | null;
}

/** 화면 위에서 떠오르는 진입 페이드 배율(0~1). */
export function getNoteEmergence(yPx: number): number {
  return smoothstep(clamp(yPx / NOTE_EMERGE_END_Y_PX, 0, 1));
}

/**
 * 아직 판정되지 않은 노트의 y 위치별 밝기 배율(0~1).
 * 위에서 떠오르는 진입 페이드와, 판정선 가까이에서의 미세한 명도 상승을 곱한다.
 */
export function getNoteEmphasis(yPx: number, judgeLineYPx: number): number {
  const approach = clamp(1 - (judgeLineYPx - yPx) / NOTE_APPROACH_RANGE_PX, 0, 1);
  return getNoteEmergence(yPx) * (NOTE_FAR_ALPHA + (1 - NOTE_FAR_ALPHA) * approach);
}

/**
 * head(아래)에서 tail(위)까지의 리본을 나눈다. 진입 구간 아래는 본체, 진입 구간 안은 head 와 같은
 * 진입 페이드를 따르는 조각이다. 두 조각 모두 head 에서 tail 쪽으로 잦아드는 밝기를 함께 곱한다.
 * 화면 위로 벗어난 부분은 그리지 않는다.
 */
export function getHoldRibbonSpans(headYPx: number, tailYPx: number): HoldRibbonSpans {
  const lengthPx = headYPx - tailYPx;
  const getAlpha = (yPx: number): number =>
    getNoteEmergence(yPx) *
    (1 - (1 - HOLD_RIBBON_TAIL_ALPHA) * clamp((headYPx - yPx) / lengthPx, 0, 1));
  const toSpan = (topYPx: number, bottomYPx: number): FadingSpan | null =>
    bottomYPx > topYPx
      ? { topYPx, bottomYPx, topAlpha: getAlpha(topYPx), bottomAlpha: getAlpha(bottomYPx) }
      : null;
  return {
    body: toSpan(Math.max(tailYPx, NOTE_EMERGE_END_Y_PX), headYPx),
    fade: toSpan(Math.max(tailYPx, 0), Math.min(headYPx, NOTE_EMERGE_END_Y_PX)),
  };
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
