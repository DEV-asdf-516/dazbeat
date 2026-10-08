import { describe, expect, it } from 'vitest';
import { getNoteY } from '../../src/rhythm/notePosition.js';

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
