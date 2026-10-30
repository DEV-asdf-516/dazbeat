import { getProgress, lerp } from '../../../range.js';

// 진행 표시(y 40)를 지나는 동안은 흐리게 둔다.
const NOTE_EMERGE_END_Y_PX = 160;
const NOTE_APPROACH_RANGE_PX = 280;
const NOTE_FAR_ALPHA = 0.86;
const HOLD_RIBBON_TAIL_ALPHA = 0.45;

export interface VerticalSpan {
  topYPx: number;
  bottomYPx: number;
}

export interface FadingSpan extends VerticalSpan {
  topAlpha: number;
  bottomAlpha: number;
}

export interface HoldRibbonSpans {
  body: FadingSpan | null;
  fade: FadingSpan | null;
}

function getNoteEmergence(yPx: number): number {
  return smoothstep(getProgress(yPx, 0, NOTE_EMERGE_END_Y_PX));
}

export function getNoteEmphasis(yPx: number, judgeLineYPx: number): number {
  const approach = getProgress(yPx, judgeLineYPx - NOTE_APPROACH_RANGE_PX, judgeLineYPx);
  return getNoteEmergence(yPx) * lerp(NOTE_FAR_ALPHA, 1, approach);
}

export function getHoldRibbonSpans(headYPx: number, tailYPx: number): HoldRibbonSpans {
  const getAlpha = (yPx: number): number =>
    getNoteEmergence(yPx) * lerp(1, HOLD_RIBBON_TAIL_ALPHA, getProgress(yPx, headYPx, tailYPx));
  const toSpan = (topYPx: number, bottomYPx: number): FadingSpan | null =>
    bottomYPx > topYPx
      ? {
          topYPx,
          bottomYPx,
          topAlpha: getAlpha(topYPx),
          bottomAlpha: getAlpha(bottomYPx),
        }
      : null;
  return {
    body: toSpan(Math.max(tailYPx, NOTE_EMERGE_END_Y_PX), headYPx),
    fade: toSpan(Math.max(tailYPx, 0), Math.min(headYPx, NOTE_EMERGE_END_Y_PX)),
  };
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
