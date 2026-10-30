import { describe, expect, it } from 'vitest';
import { IDLE_WHEEL, readWheelRows } from '../../../../src/game/ui/state/wheelRows.js';
import type { WheelGesture } from '../../../../src/game/ui/state/wheelRows.js';

function readAll(events: ReadonlyArray<[deltaYPx: number, atMs: number]>, rowPx: number): number[] {
  let gesture: WheelGesture = IDLE_WHEEL;
  return events.map(([deltaYPx, atMs]) => {
    const read = readWheelRows(gesture, deltaYPx, atMs, rowPx);
    gesture = read.gesture;
    return read.rows;
  });
}

describe('readWheelRows', () => {
  it('ignores a slight wheel movement at the start of a gesture', () => {
    expect(readAll([[24, 0]], 100)).toEqual([0]);
    expect(readAll([[-24, 0]], 100)).toEqual([0]);
  });

  it('moves one row once a gesture moves a quarter row', () => {
    expect(readAll([[25, 0]], 100)).toEqual([1]);
    expect(readAll([[-25, 0]], 100)).toEqual([-1]);
  });

  it('accumulates small trackpad deltas before the next row', () => {
    const events = [0, 16, 32, 48, 64, 80, 96, 112].map((atMs): [number, number] => [30, atMs]);
    expect(readAll(events, 100)).toEqual([1, 0, 0, 0, 1, 0, 0, 1]);
  });

  it('moves one row per mouse notch', () => {
    const events = [0, 40, 80, 120].map((atMs): [number, number] => [100, atMs]);
    expect(readAll(events, 100)).toEqual([1, 1, 1, 1]);
  });

  it('moves several rows for a large delta', () => {
    expect(readAll([[144, 0]], 48)).toEqual([3]);
  });

  it('drops the accumulated delta after a pause', () => {
    expect(
      readAll(
        [
          [20, 0],
          [20, 200],
        ],
        100,
      ),
    ).toEqual([0, 0]);
  });

  it('drops the accumulated delta when the direction flips', () => {
    expect(
      readAll(
        [
          [20, 0],
          [-20, 16],
          [-20, 32],
        ],
        100,
      ),
    ).toEqual([0, 0, -1]);
  });

  it('does not move without a delta', () => {
    expect(readAll([[0, 0]], 100)).toEqual([0]);
  });
});
