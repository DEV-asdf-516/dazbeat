import { describe, expect, it } from 'vitest';
import { InvalidChartError, parseChart } from '../../src/data/chartSchema.js';
import type { Song } from '../../src/data/songs.js';

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
  chartIds: { normal: 'chart_normal' },
};

function makeInput(notes: unknown): Record<string, unknown> {
  return { songId: 'test-song', difficulty: 'normal', offsetMs: 0, notes };
}

describe('parseChart', () => {
  it('returns a new chart with tap, hold and simultaneous notes, dropping unknown fields', () => {
    const notes = [
      { type: 'tap', timeMs: 1000, lane: 0, extra: true },
      { type: 'tap', timeMs: 1000, lane: 1 },
      { type: 'hold', timeMs: 2000, endTimeMs: 3000, lane: 2, color: 'red' },
      { type: 'tap', timeMs: 2500, lane: 0 },
    ];
    const input = { ...makeInput(notes), offsetMs: 25, title: 'ignored' };

    const chart = parseChart(input, song, 'normal');

    expect(chart).toEqual({
      songId: 'test-song',
      difficulty: 'normal',
      offsetMs: 25,
      notes: [
        { type: 'tap', timeMs: 1000, lane: 0 },
        { type: 'tap', timeMs: 1000, lane: 1 },
        { type: 'hold', timeMs: 2000, endTimeMs: 3000, lane: 2 },
        { type: 'tap', timeMs: 2500, lane: 0 },
      ],
    });
    expect(chart).not.toBe(input);
    expect(chart.notes).not.toBe(notes);
    chart.notes.forEach((note, index) => expect(note).not.toBe(notes[index]));
    expect(notes[0]).toEqual({ type: 'tap', timeMs: 1000, lane: 0, extra: true });
  });

  it.each([
    [
      'tap + hold',
      [
        { type: 'tap', timeMs: 2000, lane: 0 },
        { type: 'hold', timeMs: 2000, endTimeMs: 3000, lane: 1 },
      ],
    ],
    [
      'hold + hold',
      [
        { type: 'hold', timeMs: 2000, endTimeMs: 2500, lane: 1 },
        { type: 'hold', timeMs: 2000, endTimeMs: 3000, lane: 3 },
      ],
    ],
    [
      '3 lanes',
      [
        { type: 'tap', timeMs: 2000, lane: 0 },
        { type: 'hold', timeMs: 2000, endTimeMs: 3000, lane: 2 },
        { type: 'tap', timeMs: 2000, lane: 3 },
      ],
    ],
    [
      '4 lanes',
      [
        { type: 'hold', timeMs: 2000, endTimeMs: 3000, lane: 0 },
        { type: 'tap', timeMs: 2000, lane: 1 },
        { type: 'hold', timeMs: 2000, endTimeMs: 2500, lane: 2 },
        { type: 'tap', timeMs: 2000, lane: 3 },
      ],
    ],
  ])('accepts notes starting at the same timeMs in different lanes: %s', (_name, notes) => {
    expect(parseChart(makeInput(notes), song, 'normal').notes).toEqual(notes);
  });

  it.each([
    ['top level is not an object', 'chart'],
    ['top level is null', null],
    [
      'songId does not match',
      { ...makeInput([{ type: 'tap', timeMs: 1000, lane: 0 }]), songId: 'other' },
    ],
    [
      'difficulty does not match',
      { ...makeInput([{ type: 'tap', timeMs: 1000, lane: 0 }]), difficulty: 'hard' },
    ],
    [
      'offsetMs is not a finite number',
      { ...makeInput([{ type: 'tap', timeMs: 1000, lane: 0 }]), offsetMs: Number.NaN },
    ],
    ['notes is not an array', makeInput({})],
    ['notes is empty', makeInput([])],
  ])('throws when %s', (_name, input) => {
    expect(() => parseChart(input, song, 'normal')).toThrow(InvalidChartError);
  });

  it.each([
    ['note is not an object', [{ type: 'tap', timeMs: 1000, lane: 0 }, 5]],
    ['type is unknown', [{ type: 'slide', timeMs: 1000, lane: 0 }]],
    ['lane is 4', [{ type: 'tap', timeMs: 1000, lane: 4 }]],
    ['lane is -1', [{ type: 'tap', timeMs: 1000, lane: -1 }]],
    ['lane is not an integer', [{ type: 'tap', timeMs: 1000, lane: 1.5 }]],
    ['timeMs is not a finite number', [{ type: 'tap', timeMs: Number.POSITIVE_INFINITY, lane: 0 }]],
    ['hold endTimeMs is missing', [{ type: 'hold', timeMs: 1000, lane: 0 }]],
    ['hold endTimeMs equals timeMs', [{ type: 'hold', timeMs: 1000, endTimeMs: 1000, lane: 0 }]],
    ['hold endTimeMs is before timeMs', [{ type: 'hold', timeMs: 2000, endTimeMs: 1500, lane: 0 }]],
    ['timeMs is before gameStartMs', [{ type: 'tap', timeMs: 999, lane: 0 }]],
    ['tap ends after gameEndMs', [{ type: 'tap', timeMs: 10001, lane: 0 }]],
    ['hold ends after gameEndMs', [{ type: 'hold', timeMs: 9000, endTimeMs: 10001, lane: 0 }]],
    [
      'timeMs is not ascending',
      [
        { type: 'tap', timeMs: 2000, lane: 0 },
        { type: 'tap', timeMs: 1500, lane: 1 },
      ],
    ],
    [
      'a note starts before the previous hold in the same lane ends',
      [
        { type: 'hold', timeMs: 2000, endTimeMs: 3000, lane: 1 },
        { type: 'tap', timeMs: 3000, lane: 1 },
      ],
    ],
    [
      'two taps share a lane and time',
      [
        { type: 'tap', timeMs: 2000, lane: 3 },
        { type: 'tap', timeMs: 2000, lane: 3 },
      ],
    ],
  ])('throws with the note index when %s', (_name, notes) => {
    const index = notes.length - 1;
    expect(() => parseChart(makeInput(notes), song, 'normal')).toThrow(`chart.notes[${index}]`);
  });
});
