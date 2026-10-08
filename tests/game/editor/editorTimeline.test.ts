import { describe, expect, it } from 'vitest';
import type { Song } from '../../../src/data/songs.js';
import {
  describeSelection,
  formatEditorTime,
  getGridTimesMs,
  getLaneAtX,
  getOpeningTimeMs,
  getPlayStartMs,
  getTimeAtY,
  pickNote,
  snapStartTimeMs,
  toEditTimeMs,
  toVideoSec,
} from '../../../src/game/editor/editorTimeline.js';
import { getNoteY } from '../../../src/rhythm/notePosition.js';
import type { Note } from '../../../src/rhythm/types.js';

const song: Song = {
  id: 'test-song',
  title: 'Test Song',
  category: 'original',
  youtubeVideoId: 'aaaaaaaaaaa',
  jacketUrl: 'http://pb.test/api/files/songs/s1/jacket.png',
  accentColor: 0xffffff,
  constellation: 'gemini',
  gameStartMs: 1000,
  gameEndMs: 10000,
  chartIds: {},
};

const PLAYHEAD_Y_PX = 760;
const PX_PER_SECOND = 400;
const LANES_LEFT_PX = 720;
const LANE_WIDTH_PX = 120;

describe('getTimeAtY', () => {
  it.each([
    [1000, 1000],
    [2500, 1000],
    [500, 3000],
    [4321.5, 4000],
  ])('inverts getNoteY for note %d at current %d', (noteTimeMs, currentTimeMs) => {
    const yPx = getNoteY(noteTimeMs, currentTimeMs, PLAYHEAD_Y_PX, PX_PER_SECOND);

    expect(getTimeAtY(yPx, currentTimeMs, PLAYHEAD_Y_PX, PX_PER_SECOND)).toBeCloseTo(noteTimeMs);
  });

  it('maps y back to the same y through getNoteY', () => {
    const timeMs = getTimeAtY(300, 2000, PLAYHEAD_Y_PX, PX_PER_SECOND);

    expect(getNoteY(timeMs, 2000, PLAYHEAD_Y_PX, PX_PER_SECOND)).toBeCloseTo(300);
  });

  it('does not round or clamp', () => {
    expect(getTimeAtY(PLAYHEAD_Y_PX - 1, 0, PLAYHEAD_Y_PX, PX_PER_SECOND)).toBe(2.5);
    expect(getTimeAtY(PLAYHEAD_Y_PX + 400, 0, PLAYHEAD_Y_PX, PX_PER_SECOND)).toBe(-1000);
  });
});

describe('toEditTimeMs', () => {
  it.each([
    [2000.4, 2000],
    [2000.5, 2001],
    [2000.6, 2001],
    [2000, 2000],
  ])('rounds %d to %d', (timeMs, expected) => {
    expect(toEditTimeMs(timeMs, song)).toBe(expected);
  });

  it.each([
    [999, 1000],
    [1000, 1000],
    [1001, 1001],
    [9999, 9999],
    [10000, 10000],
    [10001, 10000],
    [999.6, 1000],
    [10000.4, 10000],
  ])('clamps %d to %d within the play range', (timeMs, expected) => {
    expect(toEditTimeMs(timeMs, song)).toBe(expected);
  });
});

describe('getLaneAtX', () => {
  it.each([
    [720, 0],
    [839, 0],
    [840, 1],
    [959, 1],
    [960, 2],
    [1079, 2],
    [1080, 3],
    [1199, 3],
  ])('puts x %d in lane %d', (xPx, lane) => {
    expect(getLaneAtX(xPx, LANES_LEFT_PX, LANE_WIDTH_PX)).toBe(lane);
  });

  it.each([
    [719, 0],
    [0, 0],
    [1200, 3],
    [1920, 3],
  ])('clamps x %d outside the lanes to lane %d', (xPx, lane) => {
    expect(getLaneAtX(xPx, LANES_LEFT_PX, LANE_WIDTH_PX)).toBe(lane);
  });
});

describe('snapStartTimeMs', () => {
  const THRESHOLD_MS = 20;
  const PLAYHEAD_MS = 1000;
  const notes: Note[] = [
    { type: 'tap', timeMs: 3000, lane: 0 },
    { type: 'hold', timeMs: 5000, endTimeMs: 6000, lane: 1 },
  ];

  function snap(timeMs: number, lane: 0 | 1 | 2 | 3, movingNote: Note | null = null): number {
    return snapStartTimeMs(timeMs, lane, {
      notes,
      movingNote,
      playheadTimeMs: PLAYHEAD_MS,
      thresholdMs: THRESHOLD_MS,
    });
  }

  it.each([
    [3000, 3000],
    [2980, 3000],
    [3020, 3000],
    [2979, 2979],
    [3021, 3021],
    [5013, 5000],
  ])('snaps %d in another lane to %d', (timeMs, expected) => {
    expect(snap(timeMs, 2)).toBe(expected);
  });

  it('does not use notes in the target lane', () => {
    expect(snap(3010, 0)).toBe(3010);
    expect(snap(5010, 1)).toBe(5010);
  });

  it('does not use the moving note', () => {
    expect(snap(3010, 2, notes[0] ?? null)).toBe(3010);
  });

  it('does not use hold ends', () => {
    expect(snap(6005, 2)).toBe(6005);
  });

  it.each([
    [1020, 1000],
    [980, 1000],
    [1021, 1021],
  ])('snaps %d to the playhead as %d', (timeMs, expected) => {
    expect(snap(timeMs, 0)).toBe(expected);
  });

  it('uses the closest candidate and the earlier one on a tie', () => {
    const closeNotes: Note[] = [
      { type: 'tap', timeMs: 4000, lane: 0 },
      { type: 'tap', timeMs: 4020, lane: 1 },
      { type: 'tap', timeMs: 4030, lane: 2 },
    ];
    const options = {
      notes: closeNotes,
      movingNote: null,
      playheadTimeMs: PLAYHEAD_MS,
      thresholdMs: THRESHOLD_MS,
    };

    expect(snapStartTimeMs(4010, 3, options)).toBe(4000);
    expect(snapStartTimeMs(4026, 3, options)).toBe(4030);
    expect(snapStartTimeMs(4025, 3, options)).toBe(4020);
  });
});

describe('pickNote', () => {
  const TOLERANCE_MS = 30;
  const hold: Note = { type: 'hold', timeMs: 2000, endTimeMs: 2050, lane: 1 };
  const tap: Note = { type: 'tap', timeMs: 4000, lane: 1 };
  const otherLane: Note = { type: 'tap', timeMs: 4000, lane: 2 };
  const notes: Note[] = [hold, tap, otherLane];

  it('prefers the hold end over the head when both are in range', () => {
    expect(pickNote(notes, 1, 2030, TOLERANCE_MS)).toEqual({ note: hold, part: 'end' });
  });

  it('picks the head when only the head is in range', () => {
    expect(pickNote(notes, 1, 1990, TOLERANCE_MS)).toEqual({ note: hold, part: 'head' });
  });

  it('picks the hold body as the head', () => {
    const longHold: Note = { type: 'hold', timeMs: 6000, endTimeMs: 8000, lane: 3 };

    expect(pickNote([longHold], 3, 7000, TOLERANCE_MS)).toEqual({ note: longHold, part: 'head' });
  });

  it.each([
    [3970, true],
    [4030, true],
    [3969, false],
    [4031, false],
  ])('includes the exact tolerance for a head at %d: %s', (timeMs, isHit) => {
    expect(pickNote(notes, 1, timeMs, TOLERANCE_MS)).toEqual(
      isHit ? { note: tap, part: 'head' } : null,
    );
  });

  it.each([
    [2080, true],
    [2081, false],
  ])('includes the exact tolerance for a hold end at %d: %s', (timeMs, isHit) => {
    expect(pickNote(notes, 1, timeMs, TOLERANCE_MS)).toEqual(
      isHit ? { note: hold, part: 'end' } : null,
    );
  });

  it('ignores notes in other lanes', () => {
    expect(pickNote(notes, 2, 2000, TOLERANCE_MS)).toBeNull();
    expect(pickNote(notes, 0, 4000, TOLERANCE_MS)).toBeNull();
  });

  it('returns null without a note in range', () => {
    expect(pickNote(notes, 1, 3000, TOLERANCE_MS)).toBeNull();
    expect(pickNote([], 1, 3000, TOLERANCE_MS)).toBeNull();
  });

  it('picks the closest head', () => {
    const near: Note = { type: 'tap', timeMs: 4020, lane: 1 };

    expect(pickNote([tap, near], 1, 4015, TOLERANCE_MS)).toEqual({ note: near, part: 'head' });
  });
});

describe('getPlayStartMs', () => {
  it.each([
    [1000, 1000],
    [5000, 5000],
    [9999, 9999],
  ])('plays from the playhead %d before gameEndMs', (currentTimeMs, expectedMs) => {
    expect(getPlayStartMs(currentTimeMs, song)).toBe(expectedMs);
  });

  it.each([10000, 10001])(
    'plays from gameStartMs when the playhead %d reached gameEndMs',
    (currentTimeMs) => {
      expect(getPlayStartMs(currentTimeMs, song)).toBe(1000);
    },
  );
});

describe('toVideoSec', () => {
  it.each([
    [5000, 0, 5],
    [5000, 200, 4.8],
    [5000, -300, 5.3],
    [200, 200, 0],
    [100, 200, 0],
  ])('converts %d ms with offset %d ms to %d s', (timeMs, offsetMs, expectedSec) => {
    expect(toVideoSec(timeMs, offsetMs)).toBeCloseTo(expectedSec);
  });
});

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
      { label: 'TYPE', value: '—' },
      { label: 'LANE', value: '—' },
      { label: 'TIME', value: '—' },
    ]);
  });

  it('shows type, lane and start time for a tap', () => {
    expect(describeSelection({ type: 'tap', timeMs: 12345, lane: 2 })).toEqual([
      { label: 'TYPE', value: 'TAP' },
      { label: 'LANE', value: '2' },
      { label: 'TIME', value: '0:12.345' },
    ]);
  });

  it('joins start and end time with an en dash for a hold', () => {
    expect(describeSelection({ type: 'hold', timeMs: 1000, endTimeMs: 2500, lane: 0 })).toEqual([
      { label: 'TYPE', value: 'HOLD' },
      { label: 'LANE', value: '0' },
      { label: 'TIME', value: '0:01.000\u20130:02.500' },
    ]);
  });
});

describe('getGridTimesMs', () => {
  it('returns step multiples inside the range, including both ends', () => {
    expect(getGridTimesMs(1000, 2000, 250)).toEqual([1000, 1250, 1500, 1750, 2000]);
    expect(getGridTimesMs(1001, 1999, 250)).toEqual([1250, 1500, 1750]);
    expect(getGridTimesMs(-300, 300, 250)).toEqual([-250, 0, 250]);
  });

  it('returns nothing when no multiple falls inside the range', () => {
    expect(getGridTimesMs(1001, 1249, 250)).toEqual([]);
  });
});

describe('getOpeningTimeMs', () => {
  it('places the first note leadMs above the playhead', () => {
    const notes: Note[] = [
      { type: 'tap', timeMs: 3000, lane: 0 },
      { type: 'tap', timeMs: 4000, lane: 1 },
    ];
    expect(getOpeningTimeMs(notes, 500, song)).toBe(2500);
  });

  it('does not go before the song start and opens at the start without notes', () => {
    expect(getOpeningTimeMs([{ type: 'tap', timeMs: 1200, lane: 0 }], 500, song)).toBe(1000);
    expect(getOpeningTimeMs([], 500, song)).toBe(1000);
  });
});
