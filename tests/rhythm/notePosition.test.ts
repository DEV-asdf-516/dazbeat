import { describe, expect, it } from 'vitest';
import { getNoteTimeAtY, getNoteY } from '../../src/rhythm/notePosition.js';

describe('getNoteY', () => {
  const judgeLineYPx = 600;
  const scrollSpeedPxPerSecond = 400;

  it('places a note on the judge line at its time', () => {
    expect(getNoteY(3_000, 3_000, judgeLineYPx, scrollSpeedPxPerSecond)).toBe(judgeLineYPx);
  });

  it('places a note one second ahead one scroll-speed above the judge line', () => {
    expect(getNoteY(4_000, 3_000, judgeLineYPx, scrollSpeedPxPerSecond)).toBe(
      judgeLineYPx - scrollSpeedPxPerSecond,
    );
  });

  it('places a passed note below the judge line', () => {
    expect(getNoteY(2_500, 3_000, judgeLineYPx, scrollSpeedPxPerSecond)).toBeGreaterThan(
      judgeLineYPx,
    );
  });
});

const PLAYHEAD_Y_PX = 760;
const PX_PER_SECOND = 400;

describe('getNoteTimeAtY', () => {
  it.each([
    [1000, 1000],
    [2500, 1000],
    [500, 3000],
    [4321.5, 4000],
  ])('inverts getNoteY for note %d at current %d', (noteTimeMs, currentTimeMs) => {
    const yPx = getNoteY(noteTimeMs, currentTimeMs, PLAYHEAD_Y_PX, PX_PER_SECOND);

    expect(getNoteTimeAtY(yPx, currentTimeMs, PLAYHEAD_Y_PX, PX_PER_SECOND)).toBeCloseTo(
      noteTimeMs,
    );
  });

  it('maps y back to the same y through getNoteY', () => {
    const timeMs = getNoteTimeAtY(300, 2000, PLAYHEAD_Y_PX, PX_PER_SECOND);

    expect(getNoteY(timeMs, 2000, PLAYHEAD_Y_PX, PX_PER_SECOND)).toBeCloseTo(300);
  });

  it('does not round or clamp', () => {
    expect(getNoteTimeAtY(PLAYHEAD_Y_PX - 1, 0, PLAYHEAD_Y_PX, PX_PER_SECOND)).toBe(2.5);
    expect(getNoteTimeAtY(PLAYHEAD_Y_PX + 400, 0, PLAYHEAD_Y_PX, PX_PER_SECOND)).toBe(-1000);
  });
});
