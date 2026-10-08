import { describe, expect, it } from 'vitest';
import {
  HOLD_RIBBON_TAIL_ALPHA,
  NOTE_APPROACH_RANGE_PX,
  NOTE_EMERGE_END_Y_PX,
  NOTE_FAR_ALPHA,
  getHoldRibbonSpans,
  getNoteEmergence,
  getNoteEmphasis,
} from '../../../src/game/gameplay/noteAppearance.js';

const JUDGE_LINE_Y_PX = 920;

describe('getNoteEmergence', () => {
  it.each([
    [-10, 0],
    [0, 0],
    [NOTE_EMERGE_END_Y_PX / 2, 0.5],
    [NOTE_EMERGE_END_Y_PX, 1],
    [NOTE_EMERGE_END_Y_PX + 1, 1],
  ])('at y %d is %d', (yPx, expected) => {
    expect(getNoteEmergence(yPx)).toBeCloseTo(expected);
  });

  it('rises monotonically through the emerge zone', () => {
    const values = [1, 40, 80, 120, NOTE_EMERGE_END_Y_PX - 1].map(getNoteEmergence);
    values.slice(1).forEach((value, index) => {
      expect(value).toBeGreaterThan(values[index] ?? Infinity);
    });
  });
});

describe('getNoteEmphasis', () => {
  const approachStartYPx = JUDGE_LINE_Y_PX - NOTE_APPROACH_RANGE_PX;

  it('is hidden at the top edge', () => {
    expect(getNoteEmphasis(0, JUDGE_LINE_Y_PX)).toBe(0);
  });

  it('stays at the far alpha between the emerge zone and the approach range', () => {
    expect(getNoteEmphasis(NOTE_EMERGE_END_Y_PX, JUDGE_LINE_Y_PX)).toBeCloseTo(NOTE_FAR_ALPHA);
    expect(getNoteEmphasis(approachStartYPx, JUDGE_LINE_Y_PX)).toBeCloseTo(NOTE_FAR_ALPHA);
  });

  it('brightens inside the approach range and is full on the judge line', () => {
    expect(getNoteEmphasis(approachStartYPx + 1, JUDGE_LINE_Y_PX)).toBeGreaterThan(NOTE_FAR_ALPHA);
    expect(getNoteEmphasis(JUDGE_LINE_Y_PX, JUDGE_LINE_Y_PX)).toBe(1);
  });

  it('stays full past the judge line', () => {
    expect(getNoteEmphasis(JUDGE_LINE_Y_PX + 40, JUDGE_LINE_Y_PX)).toBe(1);
  });
});

describe('getHoldRibbonSpans', () => {
  it('uses only the body, fading from the head toward the tail', () => {
    const { body, fade } = getHoldRibbonSpans(900, 400);
    expect(fade).toBeNull();
    expect(body).toMatchObject({ topYPx: 400, bottomYPx: 900, bottomAlpha: 1 });
    expect(body?.topAlpha).toBeCloseTo(HOLD_RIBBON_TAIL_ALPHA);
  });

  it('keeps the body when the tail is exactly on the emerge boundary', () => {
    const { body, fade } = getHoldRibbonSpans(900, NOTE_EMERGE_END_Y_PX);
    expect(fade).toBeNull();
    expect(body).toMatchObject({ topYPx: NOTE_EMERGE_END_Y_PX, bottomYPx: 900, bottomAlpha: 1 });
    expect(body?.topAlpha).toBeCloseTo(HOLD_RIBBON_TAIL_ALPHA);
  });

  it('splits into a body and a fade piece that meet at the same brightness', () => {
    const { body, fade } = getHoldRibbonSpans(900, 40);
    const boundaryAlpha = 1 - (1 - HOLD_RIBBON_TAIL_ALPHA) * ((900 - NOTE_EMERGE_END_Y_PX) / 860);
    expect(body).toEqual({
      topYPx: NOTE_EMERGE_END_Y_PX,
      bottomYPx: 900,
      topAlpha: boundaryAlpha,
      bottomAlpha: 1,
    });
    expect(fade).toMatchObject({
      topYPx: 40,
      bottomYPx: NOTE_EMERGE_END_Y_PX,
      bottomAlpha: boundaryAlpha,
    });
    expect(fade?.topAlpha).toBeCloseTo(getNoteEmergence(40) * HOLD_RIBBON_TAIL_ALPHA);
  });

  it('clips the part above the screen', () => {
    expect(getHoldRibbonSpans(900, -300).fade).toMatchObject({ topYPx: 0, topAlpha: 0 });
  });

  it('uses only the fade piece while the head is still in the emerge zone', () => {
    expect(getHoldRibbonSpans(100, -50)).toEqual({
      body: null,
      fade: { topYPx: 0, bottomYPx: 100, topAlpha: 0, bottomAlpha: getNoteEmergence(100) },
    });
  });

  it('draws nothing when the ribbon has no length', () => {
    expect(getHoldRibbonSpans(500, 500)).toEqual({ body: null, fade: null });
  });
});
