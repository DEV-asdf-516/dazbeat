import { clamp, getProgress, lerp } from '../../../range.js';
import type { GameplayFrame } from './gameplayHud.js';
import {
  HOLD_RIBBON_TAIL_ALPHA,
  NOTE_APPROACH_RANGE_PX,
  NOTE_FAR_ALPHA,
} from '../../ui/state/noteLook.js';

// 진행 표시(y 40)를 지나는 동안은 흐리게 둔다.
const NOTE_EMERGE_END_Y_PX = 160;
const NOTE_TRAIL_MAX_MS = 40;

export type HoldRibbonSpan = 'body' | 'fade';

function getNoteEmergence(yPx: number): number {
  const t = getProgress(yPx, 0, NOTE_EMERGE_END_Y_PX);
  return t * t * (3 - 2 * t);
}

export function getNoteEmphasis(yPx: number, judgeLineYPx: number): number {
  const approach = getProgress(yPx, judgeLineYPx - NOTE_APPROACH_RANGE_PX, judgeLineYPx);
  return getNoteEmergence(yPx) * lerp(NOTE_FAR_ALPHA, 1, approach);
}

export function getNoteTrailMs(previous: GameplayFrame | null, next: GameplayFrame): number {
  if (previous === null) {
    return 0;
  }
  return clamp(next.songTimeMs - previous.songTimeMs, 0, NOTE_TRAIL_MAX_MS);
}

// 리본은 흐려지며 떠오르는 fade 구간과 그 아래 body 구간으로 나뉜다.
// 홀드마다 매 프레임 부르므로 구간 객체 대신 끝 y 와 alpha 를 숫자로 따로 돌려준다.
export function getHoldRibbonSpanBottomYPx(span: HoldRibbonSpan, headYPx: number): number {
  return span === 'body' ? headYPx : Math.min(headYPx, NOTE_EMERGE_END_Y_PX);
}

// 비는 구간은 아래 끝으로 접어 높이 0 으로 둔다.
export function getHoldRibbonSpanTopYPx(
  span: HoldRibbonSpan,
  headYPx: number,
  tailYPx: number,
): number {
  const topYPx = Math.max(tailYPx, span === 'body' ? NOTE_EMERGE_END_Y_PX : 0);
  return Math.min(topYPx, getHoldRibbonSpanBottomYPx(span, headYPx));
}

export function getHoldRibbonAlpha(yPx: number, headYPx: number, tailYPx: number): number {
  return (
    getNoteEmergence(yPx) * lerp(1, HOLD_RIBBON_TAIL_ALPHA, getProgress(yPx, headYPx, tailYPx))
  );
}
