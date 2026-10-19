import { describe, expect, it } from 'vitest';
import { describeSelection, formatEditorTime } from '../../../src/game/editor/selectionInfo.js';

describe('formatEditorTime', () => {
  it('formats minutes, zero-padded seconds and milliseconds', () => {
    expect(formatEditorTime(0)).toBe('0:00.000');
    expect(formatEditorTime(889)).toBe('0:00.889');
    expect(formatEditorTime(59_999)).toBe('0:59.999');
    expect(formatEditorTime(60_000)).toBe('1:00.000');
    expect(formatEditorTime(605_007)).toBe('10:05.007');
    expect(formatEditorTime(-1500)).toBe('-0:01.500');
  });
});

describe('describeSelection', () => {
  it('shows a dash for every row without a selection', () => {
    expect(describeSelection(null)).toEqual([
      {
        label: 'TYPE',
        value: '—',
      },
      {
        label: 'LANE',
        value: '—',
      },
      {
        label: 'TIME',
        value: '—',
      },
    ]);
  });

  it('shows type, lane and start time for a tap', () => {
    expect(
      describeSelection({
        type: 'tap',
        timeMs: 12345,
        lane: 2,
      }),
    ).toEqual([
      {
        label: 'TYPE',
        value: 'TAP',
      },
      {
        label: 'LANE',
        value: '2',
      },
      {
        label: 'TIME',
        value: '0:12.345',
      },
    ]);
  });

  it('joins start and end time with an en dash for a hold', () => {
    expect(
      describeSelection({
        type: 'hold',
        timeMs: 1000,
        endTimeMs: 2500,
        lane: 0,
      }),
    ).toEqual([
      {
        label: 'TYPE',
        value: 'HOLD',
      },
      {
        label: 'LANE',
        value: '0',
      },
      {
        label: 'TIME',
        value: '0:01.000\u20130:02.500',
      },
    ]);
  });
});
