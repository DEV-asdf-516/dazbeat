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

export interface VerticalSpan {
  topYPx: number;
  bottomYPx: number;
}

export interface FadingSpan extends VerticalSpan {
  topAlpha: number;
  bottomAlpha: number;
}

export interface HoldRibbonSpans {
  body: FadingSpan;
  fade: FadingSpan;
}

function getNoteEmergence(yPx: number): number {
  return smoothstep(getProgress(yPx, 0, NOTE_EMERGE_END_Y_PX));
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

export function getHoldRibbonSpans(headYPx: number, tailYPx: number): HoldRibbonSpans {
  const getAlpha = (yPx: number): number =>
    getNoteEmergence(yPx) * lerp(1, HOLD_RIBBON_TAIL_ALPHA, getProgress(yPx, headYPx, tailYPx));
  // 비는 구간은 아래 끝으로 접어 높이 0 으로 둔다.
  const toSpan = (topYPx: number, bottomYPx: number): FadingSpan => {
    const clampedTopYPx = Math.min(topYPx, bottomYPx);
    return {
      topYPx: clampedTopYPx,
      bottomYPx,
      topAlpha: getAlpha(clampedTopYPx),
      bottomAlpha: getAlpha(bottomYPx),
    };
  };
  return {
    body: toSpan(Math.max(tailYPx, NOTE_EMERGE_END_Y_PX), headYPx),
    fade: toSpan(Math.max(tailYPx, 0), Math.min(headYPx, NOTE_EMERGE_END_Y_PX)),
  };
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
