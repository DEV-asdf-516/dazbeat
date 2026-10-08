import { describe, expect, it } from 'vitest';
import { InvalidChartError, parseChart } from '../../../src/data/chartSchema.js';
import type { Song } from '../../../src/data/songs.js';
import {
  addNote,
  completeSave,
  createDraft,
  createEmptyDraft,
  clearNotes,
  deleteSelectedNote,
  findInvalidNote,
  isDraftDirty,
  moveSelectedNote,
  resizeSelectedHold,
  restoreNotes,
  selectNote,
  toChart,
} from '../../../src/game/editor/chartDraft.js';
import type { ChartDraft } from '../../../src/game/editor/chartDraft.js';
import { snapStartTimeMs } from '../../../src/game/editor/editorTimeline.js';
import { LANES } from '../../../src/rhythm/lanes.js';
import type { Chart, Lane, Note } from '../../../src/rhythm/types.js';

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

function makeChart(notes: readonly Note[]): Chart {
  return { songId: 'test-song', difficulty: 'normal', offsetMs: 25, notes };
}

describe('createDraft', () => {
  it('holds the chart notes in time then lane order without changing the chart', () => {
    const notes: Note[] = [
      { type: 'tap', timeMs: 1000, lane: 2 },
      { type: 'tap', timeMs: 1000, lane: 0 },
      { type: 'hold', timeMs: 2000, endTimeMs: 3000, lane: 3 },
      { type: 'tap', timeMs: 2000, lane: 1 },
      { type: 'tap', timeMs: 2500, lane: 0 },
    ];
    const snapshot = structuredClone(notes);
    const chart = makeChart(notes);

    const draft = createDraft(song, chart);

    expect(draft.song).toBe(song);
    expect(draft.difficulty).toBe('normal');
    expect(draft.offsetMs).toBe(25);
    expect(draft.notes).toEqual([
      { type: 'tap', timeMs: 1000, lane: 0 },
      { type: 'tap', timeMs: 1000, lane: 2 },
      { type: 'tap', timeMs: 2000, lane: 1 },
      { type: 'hold', timeMs: 2000, endTimeMs: 3000, lane: 3 },
      { type: 'tap', timeMs: 2500, lane: 0 },
    ]);
    expect(draft.selected).toBeNull();
    expect(isDraftDirty(draft)).toBe(false);
    expect(draft.notes).not.toBe(notes);
    expect(chart.notes).toBe(notes);
    expect(notes).toEqual(snapshot);
  });
});

describe('createEmptyDraft', () => {
  it('starts with no notes, zero offset, no selection and no changes', () => {
    const draft = createEmptyDraft(song, 'hard');

    expect(draft).toEqual({
      song,
      difficulty: 'hard',
      offsetMs: 0,
      notes: [],
      selected: null,
      savedNotes: [],
    });
    expect(isDraftDirty(draft)).toBe(false);
  });
});

describe('toChart', () => {
  it('builds a chart that passes validation and recreates the same draft notes', () => {
    const chart = makeChart([
      { type: 'tap', timeMs: 1500, lane: 1 },
      { type: 'hold', timeMs: 1500, endTimeMs: 2500, lane: 0 },
      { type: 'tap', timeMs: 3000, lane: 3 },
    ]);
    const draft = createDraft(song, chart);

    const built = toChart(draft);
    const parsed = parseChart(built, song, 'normal');

    expect(built).toEqual({
      songId: 'test-song',
      difficulty: 'normal',
      offsetMs: 25,
      notes: draft.notes,
    });
    expect(createDraft(song, parsed).notes).toEqual(draft.notes);
  });
});

function draftWith(notes: readonly Note[]): ChartDraft {
  return createDraft(song, makeChart(notes));
}

function roundTrip(draft: ChartDraft): readonly Note[] {
  return createDraft(song, parseChart(toChart(draft), song, 'normal')).notes;
}

describe('addNote', () => {
  it('inserts a tap at its time then lane position, selects it and marks the draft dirty', () => {
    const draft = draftWith([
      { type: 'tap', timeMs: 1000, lane: 0 },
      { type: 'tap', timeMs: 2000, lane: 0 },
      { type: 'tap', timeMs: 2000, lane: 3 },
    ]);
    const tap: Note = { type: 'tap', timeMs: 2000, lane: 1 };

    const next = addNote(draft, tap);

    expect(next.notes).toEqual([
      { type: 'tap', timeMs: 1000, lane: 0 },
      { type: 'tap', timeMs: 2000, lane: 0 },
      { type: 'tap', timeMs: 2000, lane: 1 },
      { type: 'tap', timeMs: 2000, lane: 3 },
    ]);
    expect(next.selected).toBe(tap);
    expect(isDraftDirty(next)).toBe(true);
    expect(draft.notes).toHaveLength(3);
    expect(isDraftDirty(draft)).toBe(false);
  });

  it('inserts a hold at the end and selects it', () => {
    const draft = draftWith([{ type: 'tap', timeMs: 1000, lane: 0 }]);
    const hold: Note = { type: 'hold', timeMs: 3000, endTimeMs: 4000, lane: 2 };

    const next = addNote(draft, hold);

    expect(next.notes).toEqual([{ type: 'tap', timeMs: 1000, lane: 0 }, hold]);
    expect(next.selected).toBe(hold);
    expect(isDraftDirty(next)).toBe(true);
  });

  it.each([
    ['equals', 3000],
    ['is before', 2999],
  ])('ignores a hold whose end %s its start', (_name, endTimeMs) => {
    const draft = draftWith([{ type: 'tap', timeMs: 1000, lane: 0 }]);

    expect(addNote(draft, { type: 'hold', timeMs: 3000, endTimeMs, lane: 2 })).toBe(draft);
  });

  it('adds a hold whose end is one ms after its start', () => {
    const draft = createEmptyDraft(song, 'normal');

    expect(addNote(draft, { type: 'hold', timeMs: 3000, endTimeMs: 3001, lane: 2 }).notes).toEqual([
      { type: 'hold', timeMs: 3000, endTimeMs: 3001, lane: 2 },
    ]);
  });
});

describe('selectNote', () => {
  it('changes only the selection and keeps the dirty flag', () => {
    const clean = draftWith([
      { type: 'tap', timeMs: 1000, lane: 0 },
      { type: 'tap', timeMs: 2000, lane: 1 },
    ]);
    const dirty = addNote(clean, { type: 'tap', timeMs: 3000, lane: 2 });
    const [first] = dirty.notes;
    if (first === undefined) {
      throw new Error('missing note');
    }

    const selectedClean = selectNote(clean, first);
    const selectedDirty = selectNote(dirty, first);

    expect(selectedClean.selected).toBe(first);
    expect(selectedClean.notes).toBe(clean.notes);
    expect(isDraftDirty(selectedClean)).toBe(false);
    expect(isDraftDirty(selectedDirty)).toBe(true);
    expect(selectNote(selectedClean, null).selected).toBeNull();
  });

  it('returns the same draft for the same selection', () => {
    const draft = draftWith([{ type: 'tap', timeMs: 1000, lane: 0 }]);

    expect(selectNote(draft, null)).toBe(draft);
    const [note] = draft.notes;
    if (note === undefined) {
      throw new Error('missing note');
    }
    const selected = selectNote(draft, note);
    expect(selectNote(selected, note)).toBe(selected);
  });
});

describe('moveSelectedNote', () => {
  const notes: Note[] = [
    { type: 'tap', timeMs: 1000, lane: 0 },
    { type: 'hold', timeMs: 2000, endTimeMs: 2600, lane: 1 },
    { type: 'tap', timeMs: 3000, lane: 2 },
  ];

  function selectAt(draft: ChartDraft, index: number): ChartDraft {
    const note = draft.notes[index];
    if (note === undefined) {
      throw new Error(`missing note ${index}`);
    }
    return selectNote(draft, note);
  }

  it('moves a tap to a new time and lane, re-sorts and keeps it selected', () => {
    const draft = selectAt(draftWith(notes), 0);

    const next = moveSelectedNote(draft, 3000, 1);

    expect(next.notes).toEqual([
      { type: 'hold', timeMs: 2000, endTimeMs: 2600, lane: 1 },
      { type: 'tap', timeMs: 3000, lane: 1 },
      { type: 'tap', timeMs: 3000, lane: 2 },
    ]);
    expect(next.selected).toBe(next.notes[1]);
    expect(isDraftDirty(next)).toBe(true);
    expect(draft.notes).toEqual(notes);
    expect(draft.selected).toEqual({ type: 'tap', timeMs: 1000, lane: 0 });
  });

  it('keeps the hold length when moving a hold', () => {
    const draft = selectAt(draftWith(notes), 1);

    const next = moveSelectedNote(draft, 1500, 3);

    expect(next.notes[1]).toEqual({ type: 'hold', timeMs: 1500, endTimeMs: 2100, lane: 3 });
    expect(next.selected).toBe(next.notes[1]);
  });

  it('returns the same draft when the time and lane are unchanged', () => {
    const draft = selectAt(draftWith(notes), 1);

    expect(moveSelectedNote(draft, 2000, 1)).toBe(draft);
  });

  it('returns the same draft without a selection', () => {
    const draft = draftWith(notes);

    expect(moveSelectedNote(draft, 4000, 3)).toBe(draft);
  });

  it('is reflected in the chart round trip', () => {
    const draft = moveSelectedNote(selectAt(draftWith(notes), 1), 4000, 0);

    expect(roundTrip(draft)).toEqual([
      { type: 'tap', timeMs: 1000, lane: 0 },
      { type: 'tap', timeMs: 3000, lane: 2 },
      { type: 'hold', timeMs: 4000, endTimeMs: 4600, lane: 0 },
    ]);
  });
});

describe('resizeSelectedHold', () => {
  const hold: Note = { type: 'hold', timeMs: 2000, endTimeMs: 2600, lane: 1 };

  function selectedHoldDraft(): ChartDraft {
    const draft = draftWith([{ type: 'tap', timeMs: 1000, lane: 0 }, hold]);
    return selectNote(draft, draft.notes[1] ?? null);
  }

  it('changes the end time, keeps the selection and marks the draft dirty', () => {
    const draft = selectedHoldDraft();

    const next = resizeSelectedHold(draft, 3200);

    expect(next.notes[1]).toEqual({ type: 'hold', timeMs: 2000, endTimeMs: 3200, lane: 1 });
    expect(next.selected).toBe(next.notes[1]);
    expect(isDraftDirty(next)).toBe(true);
    expect(draft.notes[1]).toEqual(hold);
  });

  it.each([
    [2001, 2001],
    [2000, 2001],
    [1500, 2001],
  ])('keeps the end after the start for request %d', (endTimeMs, expected) => {
    const next = resizeSelectedHold(selectedHoldDraft(), endTimeMs);

    expect(next.selected).toEqual({ type: 'hold', timeMs: 2000, endTimeMs: expected, lane: 1 });
  });

  it('returns the same draft when the end is unchanged', () => {
    const draft = selectedHoldDraft();

    expect(resizeSelectedHold(draft, 2600)).toBe(draft);
  });

  it('returns the same draft when a tap or nothing is selected', () => {
    const draft = draftWith([{ type: 'tap', timeMs: 1000, lane: 0 }, hold]);
    const tapSelected = selectNote(draft, draft.notes[0] ?? null);

    expect(resizeSelectedHold(tapSelected, 3000)).toBe(tapSelected);
    expect(resizeSelectedHold(draft, 3000)).toBe(draft);
  });
});

describe('deleteSelectedNote', () => {
  it('removes the selected note, clears the selection and marks the draft dirty', () => {
    const draft = draftWith([
      { type: 'tap', timeMs: 1000, lane: 0 },
      { type: 'tap', timeMs: 2000, lane: 1 },
    ]);
    const selected = selectNote(draft, draft.notes[0] ?? null);

    const next = deleteSelectedNote(selected);

    expect(next.notes).toEqual([{ type: 'tap', timeMs: 2000, lane: 1 }]);
    expect(next.selected).toBeNull();
    expect(isDraftDirty(next)).toBe(true);
    expect(selected.notes).toHaveLength(2);
    expect(roundTrip(next)).toEqual([{ type: 'tap', timeMs: 2000, lane: 1 }]);
  });

  it('returns the same draft without a selection', () => {
    const draft = draftWith([{ type: 'tap', timeMs: 1000, lane: 0 }]);

    expect(deleteSelectedNote(draft)).toBe(draft);
  });
});

describe('clearNotes', () => {
  it('removes every note, clears the selection and marks the draft dirty', () => {
    const draft = draftWith([
      { type: 'tap', timeMs: 1000, lane: 0 },
      { type: 'hold', timeMs: 2000, endTimeMs: 3000, lane: 1 },
    ]);
    const selected = selectNote(draft, draft.notes[1] ?? null);

    const next = clearNotes(selected);

    expect(next.notes).toEqual([]);
    expect(next.selected).toBeNull();
    expect(isDraftDirty(next)).toBe(true);
    expect(selected.notes).toHaveLength(2);
  });

  it('returns the same draft without notes', () => {
    const draft = draftWith([]);

    expect(clearNotes(draft)).toBe(draft);
  });
});

describe('editing round trip', () => {
  it('keeps lane, timeMs and endTimeMs of added taps and holds through the chart', () => {
    let draft = createEmptyDraft(song, 'normal');
    draft = addNote(draft, { type: 'hold', timeMs: 2500, endTimeMs: 4000, lane: 3 });
    draft = addNote(draft, { type: 'tap', timeMs: 1200, lane: 1 });

    expect(roundTrip(draft)).toEqual([
      { type: 'tap', timeMs: 1200, lane: 1 },
      { type: 'hold', timeMs: 2500, endTimeMs: 4000, lane: 3 },
    ]);
  });
});

describe('simultaneous notes', () => {
  const PLAYHEAD_MS = 1000;
  const THRESHOLD_MS = 20;

  function addSnapped(
    draft: ChartDraft,
    timeMs: number,
    lane: Lane,
    type: Note['type'],
  ): ChartDraft {
    const startMs = snapStartTimeMs(timeMs, lane, {
      notes: draft.notes,
      movingNote: null,
      playheadTimeMs: PLAYHEAD_MS,
      thresholdMs: THRESHOLD_MS,
    });
    return addNote(
      draft,
      type === 'tap'
        ? { type: 'tap', timeMs: startMs, lane }
        : { type: 'hold', timeMs: startMs, endTimeMs: startMs + 500, lane },
    );
  }

  it.each<[string, Note['type'][]]>([
    ['tap + tap', ['tap', 'tap']],
    ['tap + hold', ['tap', 'hold']],
    ['hold + hold', ['hold', 'hold']],
    ['3 lanes', ['tap', 'hold', 'tap']],
    ['4 lanes', ['hold', 'tap', 'hold', 'tap']],
  ])('snaps %s to the same timeMs and passes validation', (_name, types) => {
    // 첫 노트 뒤로는 스냅 임계(20ms) 안에서 어긋난 pointer 시각이다.
    const pointerTimesMs: Record<Lane, number> = { 0: 3000, 1: 3012, 2: 2985, 3: 3020 };
    let draft = createEmptyDraft(song, 'normal');
    types.forEach((type, index) => {
      const lane = LANES[index];
      if (lane === undefined) {
        throw new Error(`missing lane ${index}`);
      }
      draft = addSnapped(draft, pointerTimesMs[lane], lane, type);
    });

    expect(draft.notes.map((note) => note.timeMs)).toEqual(types.map(() => 3000));
    expect(draft.notes.map((note) => note.lane)).toEqual(types.map((_type, lane) => lane));
    expect(parseChart(toChart(draft), song, 'normal').notes).toEqual(draft.notes);
  });

  it('fails validation at the second note for two taps in the same lane and time', () => {
    let draft = createEmptyDraft(song, 'normal');
    draft = addNote(draft, { type: 'tap', timeMs: 3000, lane: 2 });
    draft = addNote(draft, { type: 'tap', timeMs: 3000, lane: 2 });

    expect(() => parseChart(toChart(draft), song, 'normal')).toThrow('chart.notes[1]');
  });
});

describe('completeSave', () => {
  const savedSong: Song = { ...song, chartIds: { ...song.chartIds, hard: 'chart_hard' } };

  it('clears dirty and takes the saved song when notes did not change during the save', () => {
    const draft = addNote(createEmptyDraft(song, 'hard'), { type: 'tap', timeMs: 2000, lane: 1 });

    const completed = completeSave(draft, draft.notes, savedSong);

    expect(isDraftDirty(completed)).toBe(false);
    expect(completed.song).toBe(savedSong);
    expect(completed.notes).toBe(draft.notes);
  });

  it('keeps dirty and takes the saved song when notes were edited during the save', () => {
    const atSave = addNote(createEmptyDraft(song, 'hard'), { type: 'tap', timeMs: 2000, lane: 1 });
    const edited = addNote(atSave, { type: 'tap', timeMs: 3000, lane: 2 });

    const completed = completeSave(edited, atSave.notes, savedSong);

    expect(isDraftDirty(completed)).toBe(true);
    expect(completed.song).toBe(savedSong);
    expect(completed.notes).toBe(edited.notes);
  });
});

describe('restoreNotes', () => {
  const savedSong: Song = { ...song, chartIds: { ...song.chartIds, hard: 'chart_hard' } };

  it('restores notes and selection but keeps the song and save point of the current draft', () => {
    const before = addNote(createEmptyDraft(song, 'hard'), { type: 'tap', timeMs: 2000, lane: 1 });
    const withHold = addNote(before, { type: 'hold', timeMs: 3000, endTimeMs: 3001, lane: 2 });
    const saved = completeSave(withHold, before.notes, savedSong);

    const restored = restoreNotes(saved, before);

    expect(restored.notes).toBe(before.notes);
    expect(restored.selected).toBe(before.selected);
    expect(restored.song).toBe(savedSong);
    expect(restored.savedNotes).toBe(before.notes);
    expect(isDraftDirty(restored)).toBe(false);
  });

  it('stays dirty when the restored notes are not the save point', () => {
    const loaded = draftWith([{ type: 'tap', timeMs: 1000, lane: 0 }]);
    const before = addNote(loaded, { type: 'tap', timeMs: 2000, lane: 1 });
    const withHold = addNote(before, { type: 'hold', timeMs: 3000, endTimeMs: 3001, lane: 2 });

    const restored = restoreNotes(withHold, before);

    expect(restored.notes).toBe(before.notes);
    expect(isDraftDirty(restored)).toBe(true);
  });

  it('returns the same draft when notes and selection are already the same', () => {
    const draft = addNote(createEmptyDraft(song, 'hard'), { type: 'tap', timeMs: 2000, lane: 1 });

    expect(restoreNotes(draft, draft)).toBe(draft);
  });
});

describe('findInvalidNote', () => {
  function getChartError(draft: ChartDraft): InvalidChartError {
    try {
      parseChart(toChart(draft), song, 'normal');
    } catch (error) {
      if (error instanceof InvalidChartError) {
        return error;
      }
      throw error;
    }
    throw new Error('expected an invalid chart');
  }

  it('finds the second tap of a duplicate in the same lane and time', () => {
    let draft = createEmptyDraft(song, 'normal');
    draft = addNote(draft, { type: 'tap', timeMs: 3000, lane: 2 });
    draft = addNote(draft, { type: 'tap', timeMs: 3000, lane: 2 });

    expect(findInvalidNote(draft, getChartError(draft))).toBe(draft.notes[1]);
  });

  it('finds the note of an endTimeMs error', () => {
    const draft = createDraft(
      song,
      makeChart([
        { type: 'tap', timeMs: 1500, lane: 0 },
        { type: 'hold', timeMs: 2000, endTimeMs: 2000, lane: 1 },
      ]),
    );
    const error = getChartError(draft);

    expect(error.path).toBe('chart.notes[1].endTimeMs');
    expect(findInvalidNote(draft, error)).toBe(draft.notes[1]);
  });

  it('finds no note when the notes are empty', () => {
    const draft = createEmptyDraft(song, 'normal');
    const error = getChartError(draft);

    expect(error.path).toBe('chart.notes');
    expect(findInvalidNote(draft, error)).toBeNull();
  });
});
