import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartRef, Song } from '../../../src/data/songs.js';
import { ChartEditorController } from '../../../src/game/editor/ChartEditorController.js';
import type { ChartCatalog, EditList } from '../../../src/game/editor/ChartEditorController.js';
import { isDraftDirty } from '../../../src/game/editor/chartDraft.js';
import type { ChartDraft } from '../../../src/game/editor/chartDraft.js';
import {
  canClearNotes,
  canDeleteSelected,
  canSave,
  getEditorDecorations,
  getEditorStatus,
  getNotes,
  getPending,
  getSelection,
  getSession,
  getTransport,
  hasUnsavedChanges,
} from '../../../src/game/editor/chartEditorState.js';
import type { ChartEditorState, EditorSession } from '../../../src/game/editor/chartEditorState.js';
import type { Chart, Difficulty, Lane, LaneCount, Note } from '../../../src/rhythm/types.js';

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
  chartIds: { 4: { normal: 'chart_normal' } },
};

const savedSong: Song = {
  ...song,
  chartIds: {
    4: {
      normal: 'chart_normal',
      hard: 'chart_hard',
    },
  },
};

const SAVED_CHART_ID = 'chart_saved';

const otherSong: Song = {
  ...song,
  id: 'other-song',
};

const TIMING = {
  openingLeadMs: 500,
  snapThresholdMs: 20,
  pickToleranceMs: 30,
};

const TAP_AT_2000: Note = {
  type: 'tap',
  timeMs: 2000,
  lane: 0,
};

interface Pending<T> {
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
}

interface Harness {
  readonly editor: ChartEditorController;
  readonly loads: (Pending<Chart> & { readonly ref: ChartRef })[];
  readonly saves: (Pending<string> & { readonly song: Song; readonly chart: Chart })[];
  readonly applied: {
    songId: string;
    laneCount: LaneCount;
    difficulty: Difficulty;
    chartId: string;
  }[];
  readonly changedSongs: Song[];
  readonly leftWith: (string | null)[];
  readonly requestedSec: number[];
  readonly timeSource: { currentTime: number };
  songs: readonly Song[];
  isPlayerReady: boolean;
  pauseCount: number;
  renderCount: number;
}

function createHarness(): Harness {
  const harness: Omit<Harness, 'editor'> = {
    loads: [],
    saves: [],
    applied: [],
    changedSongs: [],
    leftWith: [],
    requestedSec: [],
    timeSource: { currentTime: 0 },
    songs: [song, otherSong],
    isPlayerReady: true,
    pauseCount: 0,
    renderCount: 0,
  };
  const catalog: ChartCatalog = {
    loadChart: (ref) =>
      new Promise((resolve, reject) =>
        harness.loads.push({
          ref,
          resolve,
          reject,
        }),
      ),
    saveChart: (target, chart) =>
      new Promise((resolve, reject) =>
        harness.saves.push({
          song: target,
          chart,
          resolve,
          reject,
        }),
      ),
  };
  const list: EditList = {
    get songs() {
      return harness.songs;
    },
    applySavedChart: (songId, laneCount, difficulty, chartId) => {
      harness.applied.push({
        songId,
        laneCount,
        difficulty,
        chartId,
      });
      return savedSong;
    },
  };
  const editor = new ChartEditorController(
    catalog,
    list,
    {
      play: (fromSec) => {
        if (!harness.isPlayerReady) {
          return null;
        }
        harness.requestedSec.push(fromSec);
        return harness.timeSource;
      },
      pause: () => {
        harness.pauseCount += 1;
      },
    },
    {
      changeSong: (changed) => harness.changedSongs.push(changed),
      leave: (focusedSongId) => harness.leftWith.push(focusedSongId),
      render: (previous, next) => {
        expect(previous).not.toBe(next);
        expect(next).toBe(editor.state);
        harness.renderCount += 1;
      },
    },
    TIMING,
  );
  return Object.assign(harness, { editor });
}

function makeChart(notes: readonly Note[]): Chart {
  return {
    songId: 'test-song',
    difficulty: 'normal',
    laneCount: 4,
    offsetMs: 0,
    notes,
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function lastLoad(harness: Harness): Harness['loads'][number] {
  const load = harness.loads[harness.loads.length - 1];
  if (load === undefined) {
    throw new Error('expected a chart load');
  }
  return load;
}

function lastSave(harness: Harness): Harness['saves'][number] {
  const save = harness.saves[harness.saves.length - 1];
  if (save === undefined) {
    throw new Error('expected a chart save');
  }
  return save;
}

/** normal 은 chart 가 있으므로 로드를 거쳐 편집한다. */
async function openLoaded(notes: readonly Note[] = []): Promise<Harness> {
  const harness = createHarness();
  harness.editor.select(song, 4, 'normal');
  lastLoad(harness).resolve(makeChart(notes));
  await flush();
  return harness;
}

function requireSession(state: ChartEditorState): EditorSession {
  const session = getSession(state);
  if (session === null) {
    throw new Error(`expected editing, got ${state.phase.kind}`);
  }
  return session;
}

function getDraft(harness: Harness): ChartDraft {
  return requireSession(harness.editor.state).draft;
}

function addTap(harness: Harness, timeMs: number, lane: Lane = 3): void {
  harness.editor.pointerDown({
    lane,
    timeMs,
  });
  harness.editor.pointerUp(timeMs);
}

function startPlaying(harness: Harness): void {
  harness.editor.togglePlayback();
  harness.editor.handlePlayerState('playing');
  expect(getTransport(harness.editor.state).kind).toBe('playing');
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('opening a chart', () => {
  it('loads a difficulty with a chart and edits it once loaded', async () => {
    const harness = createHarness();

    harness.editor.select(song, 4, 'normal');

    expect(harness.changedSongs).toEqual([song]);
    expect(lastLoad(harness).ref).toEqual({
      song,
      laneCount: 4,
      difficulty: 'normal',
      chartId: 'chart_normal',
    });
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'loading' });
    expect(getSelection(harness.editor.state)).toEqual({
      song,
      laneCount: 4,
      difficulty: 'normal',
    });
    expect(harness.editor.state.playhead.currentTimeMs).toBe(1000);

    lastLoad(harness).resolve(makeChart([TAP_AT_2000]));
    await flush();

    expect(getDraft(harness).notes).toEqual([TAP_AT_2000]);
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'none' });
  });

  it('opens a loaded chart with the first note the opening lead above the playhead', async () => {
    const withNote = await openLoaded([
      {
        type: 'tap',
        timeMs: 3000,
        lane: 1,
      },
    ]);
    const empty = await openLoaded([]);

    expect(withNote.editor.state.playhead.currentTimeMs).toBe(2500);
    expect(empty.editor.state.playhead.currentTimeMs).toBe(1000);
  });

  it('edits an empty draft for a difficulty without a chart, without a load', () => {
    const harness = createHarness();

    harness.editor.select(song, 4, 'hard');

    expect(harness.loads).toEqual([]);
    expect(harness.changedSongs).toEqual([song]);
    const draft = getDraft(harness);
    expect(draft.difficulty).toBe('hard');
    expect(draft.notes).toEqual([]);
    expect(harness.editor.state.playhead.currentTimeMs).toBe(1000);
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'none' });
  });

  it('ignores load results of a previous selection', async () => {
    const harness = createHarness();
    harness.editor.select(song, 4, 'normal');
    const first = lastLoad(harness);
    harness.editor.select(otherSong, 4, 'normal');
    const loading = harness.editor.state;

    first.resolve(makeChart([TAP_AT_2000]));
    await flush();
    expect(harness.editor.state).toBe(loading);

    harness.editor.select(song, 4, 'normal');
    const second = lastLoad(harness);
    harness.editor.select(otherSong, 4, 'normal');
    second.reject(new Error('network'));
    await flush();
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'loading' });
  });

  it('shows a load failure and loads again when the same chart is selected', async () => {
    const harness = createHarness();
    harness.editor.select(song, 4, 'normal');
    lastLoad(harness).reject(new Error('network'));
    await flush();
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'loadFailed' });

    harness.editor.select(song, 4, 'normal');

    expect(harness.loads).toHaveLength(2);
    expect(harness.changedSongs).toEqual([song]);
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'loading' });
    lastLoad(harness).resolve(makeChart([]));
    await flush();
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'none' });
  });

  it('does nothing when the current chart is selected again', async () => {
    const harness = await openLoaded([TAP_AT_2000]);
    const state = harness.editor.state;
    const harnessLoading = createHarness();
    harnessLoading.editor.select(song, 4, 'normal');
    const loading = harnessLoading.editor.state;

    harness.editor.select(song, 4, 'normal');
    harnessLoading.editor.select(song, 4, 'normal');

    expect(harness.editor.state).toBe(state);
    expect(harness.loads).toHaveLength(1);
    expect(harnessLoading.editor.state).toBe(loading);
    expect(harnessLoading.loads).toHaveLength(1);
  });

  it('keeps the player for another difficulty of the same song only', async () => {
    const harness = await openLoaded();

    harness.editor.select(song, 4, 'hard');
    expect(harness.changedSongs).toEqual([song]);

    harness.editor.select(otherSong, 4, 'normal');
    expect(harness.changedSongs).toEqual([song, otherSong]);
  });

  it('starts another chart of the same song paused where playback was, with a fresh session', async () => {
    const harness = await openLoaded([TAP_AT_2000]);
    const previous = requireSession(harness.editor.state);
    startPlaying(harness);
    harness.timeSource.currentTime = 4;
    harness.editor.advancePlayback();

    harness.editor.select(song, 4, 'hard');

    const session = requireSession(harness.editor.state);
    expect(session.id).not.toBe(previous.id);
    expect(session.gesture).toEqual({ kind: 'none' });
    expect(session.saveResult).toEqual({ kind: 'idle' });
    expect(harness.editor.state.playhead).toEqual({
      currentTimeMs: 4000,
      transport: { kind: 'paused' },
    });
    expect(harness.pauseCount).toBe(1);
  });

  it('keeps the tool across selections', async () => {
    const harness = await openLoaded();
    harness.editor.selectTool('hold');

    harness.editor.select(song, 4, 'hard');

    expect(harness.editor.state.tool).toBe('hold');
  });

  it('discards late load and save results once closed, without rendering', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    void harness.editor.save();
    harness.editor.select(otherSong, 4, 'normal');
    harness.editor.confirmPending();
    harness.editor.close();
    const renderCount = harness.renderCount;

    lastLoad(harness).resolve(makeChart([]));
    lastSave(harness).resolve(SAVED_CHART_ID);
    await flush();

    expect(harness.editor.state.phase).toEqual({ kind: 'empty' });
    expect(harness.renderCount).toBe(renderCount);
  });
});

describe('moving in the song list', () => {
  const first: Song = {
    ...song,
    id: 'first-song',
  };
  const last: Song = {
    ...song,
    id: 'last-song',
  };

  it('moves by delta keeping the difficulty and stops at both ends', async () => {
    const harness = await openLoaded();
    harness.songs = [first, song, last];

    harness.editor.moveSong(-5);
    expect(getSelection(harness.editor.state)).toEqual({
      song: first,
      laneCount: 4,
      difficulty: 'normal',
    });
    const atStart = harness.editor.state;
    harness.editor.moveSong(-1);
    expect(harness.editor.state).toBe(atStart);

    harness.editor.moveSong(5);
    expect(getSelection(harness.editor.state)).toEqual({
      song: last,
      laneCount: 4,
      difficulty: 'normal',
    });
    expect(harness.changedSongs).toEqual([song, first, last]);
  });

  it('selects another difficulty of the current song', async () => {
    const harness = await openLoaded();

    harness.editor.selectDifficulty('hard');

    expect(getSelection(harness.editor.state)).toEqual({
      song,
      laneCount: 4,
      difficulty: 'hard',
    });
    expect(harness.changedSongs).toEqual([song]);
  });

  it('follows the current song by id after the list is replaced', async () => {
    const harness = await openLoaded();
    harness.songs = [savedSong, otherSong];

    harness.editor.moveSong(1);

    expect(getSelection(harness.editor.state)?.song).toBe(otherSong);
  });

  it('clears the selection when the song list is empty, even with unsaved changes', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    startPlaying(harness);
    harness.songs = [];

    harness.editor.moveSong(1);

    expect(harness.editor.state.phase).toEqual({ kind: 'empty' });
    expect(getTransport(harness.editor.state)).toEqual({ kind: 'paused' });
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'noSongs' });
    expect(harness.pauseCount).toBe(1);
  });

  it('does nothing without a selection', () => {
    const harness = createHarness();
    const state = harness.editor.state;

    harness.editor.moveSong(1);
    harness.editor.selectDifficulty('hard');

    expect(harness.editor.state).toBe(state);
  });

  it('asks before moving away from unsaved changes', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);

    harness.editor.moveSong(1);

    expect(getPending(harness.editor.state)).toEqual({
      kind: 'select',
      song: otherSong,
      laneCount: 4,
      difficulty: 'normal',
    });
    expect(harness.changedSongs).toEqual([song]);
  });
});

describe('leaving', () => {
  it('leaves focusing the current song without unsaved changes', async () => {
    const harness = await openLoaded();

    harness.editor.back();

    expect(harness.leftWith).toEqual(['test-song']);
  });

  it('leaves with no focused song without a selection', () => {
    const harness = createHarness();

    harness.editor.back();

    expect(harness.leftWith).toEqual([null]);
  });
});

describe('unsaved changes confirmation', () => {
  it('holds a navigation, keeps the draft on cancel and proceeds on discard', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    const dirtyDraft = getDraft(harness);

    harness.editor.select(otherSong, 4, 'normal');
    expect(getPending(harness.editor.state)).toEqual({
      kind: 'select',
      song: otherSong,
      laneCount: 4,
      difficulty: 'normal',
    });
    expect(harness.loads).toHaveLength(1);

    harness.editor.cancelPending();
    expect(getPending(harness.editor.state)).toBeNull();
    expect(getDraft(harness)).toBe(dirtyDraft);

    harness.editor.select(otherSong, 4, 'normal');
    harness.editor.confirmPending();
    expect(getPending(harness.editor.state)).toBeNull();
    expect(harness.changedSongs).toEqual([song, otherSong]);
    expect(lastLoad(harness).ref.song).toBe(otherSong);
  });

  it('cancels with back and leaves only on discard', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);

    harness.editor.back();
    expect(getPending(harness.editor.state)).toEqual({ kind: 'leave' });
    harness.editor.back();
    expect(getPending(harness.editor.state)).toBeNull();
    expect(harness.leftWith).toEqual([]);

    harness.editor.back();
    harness.editor.confirmPending();
    expect(harness.leftWith).toEqual(['test-song']);
  });

  it('keeps a held navigation against further navigation requests', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    harness.editor.select(song, 4, 'hard');
    const held = harness.editor.state;

    harness.editor.select(otherSong, 4, 'normal');
    harness.editor.moveSong(1);
    harness.editor.selectDifficulty('expert');

    expect(harness.editor.state).toBe(held);
  });

  it('ignores confirm and cancel without a dialog', async () => {
    const harness = await openLoaded([TAP_AT_2000]);
    const state = harness.editor.state;

    harness.editor.confirmPending();
    harness.editor.cancelPending();

    expect(harness.editor.state).toBe(state);
  });
});

describe('clearing notes', () => {
  it('asks even without unsaved changes and clears only on confirm', async () => {
    const harness = await openLoaded([TAP_AT_2000]);

    harness.editor.requestClearNotes();
    expect(getPending(harness.editor.state)).toEqual({ kind: 'clearNotes' });
    expect(getNotes(harness.editor.state)).toHaveLength(1);

    harness.editor.confirmPending();
    expect(getPending(harness.editor.state)).toBeNull();
    expect(getNotes(harness.editor.state)).toEqual([]);
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'unsaved' });
  });

  it('keeps the notes on cancel', async () => {
    const harness = await openLoaded([TAP_AT_2000]);
    harness.editor.requestClearNotes();

    harness.editor.cancelPending();

    expect(getPending(harness.editor.state)).toBeNull();
    expect(getNotes(harness.editor.state)).toEqual([TAP_AT_2000]);
  });

  it('does not ask without notes or without a draft', async () => {
    const editing = await openLoaded();
    const loading = createHarness();
    loading.editor.select(song, 4, 'normal');
    const states = [editing.editor.state, loading.editor.state];

    editing.editor.requestClearNotes();
    loading.editor.requestClearNotes();

    expect([editing.editor.state, loading.editor.state]).toEqual(states);
  });

  it('does not ask when the only note is a hold still being created', async () => {
    const harness = await openLoaded();
    harness.editor.selectTool('hold');
    harness.editor.pointerDown({
      lane: 3,
      timeMs: 3000,
    });
    expect(canClearNotes(harness.editor.state)).toBe(true);

    harness.editor.requestClearNotes();

    expect(getPending(harness.editor.state)).toBeNull();
    expect(getNotes(harness.editor.state)).toEqual([]);
  });
});

describe('the open confirm dialog', () => {
  async function heldWhileSaving(): Promise<Harness> {
    const harness = await openLoaded([TAP_AT_2000]);
    addTap(harness, 3000);
    void harness.editor.save();
    startPlaying(harness);
    harness.editor.back();
    expect(getPending(harness.editor.state)).toEqual({ kind: 'leave' });
    return harness;
  }

  it('ignores editing, selection, playback and save input', async () => {
    const harness = await heldWhileSaving();
    const held = harness.editor.state;

    harness.editor.pointerDown({
      lane: 1,
      timeMs: 5000,
    });
    harness.editor.pointerDown({
      lane: 0,
      timeMs: 2000,
    });
    harness.editor.pointerMove({
      lane: 1,
      timeMs: 5000,
    });
    harness.editor.pointerUp(5000);
    harness.editor.seek(5000);
    harness.editor.selectTool('hold');
    harness.editor.deleteSelected();
    harness.editor.togglePlayback();
    harness.editor.requestClearNotes();
    harness.editor.select(otherSong, 4, 'normal');
    harness.editor.moveSong(1);
    void harness.editor.save();

    expect(harness.editor.state).toBe(held);
    expect(harness.saves).toHaveLength(1);
  });

  it('pauses playback when opened and applies the save result', async () => {
    const harness = await heldWhileSaving();
    expect(getTransport(harness.editor.state)).toEqual({ kind: 'paused' });
    expect(harness.pauseCount).toBe(1);

    lastSave(harness).resolve(SAVED_CHART_ID);
    await flush();
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'saved' });
    expect(getPending(harness.editor.state)).toEqual({ kind: 'leave' });
  });

  it('hides the divider glint only while open', async () => {
    const harness = await openLoaded([TAP_AT_2000]);
    expect(getEditorDecorations(harness.editor.state)).toEqual({ isDividerGlintVisible: true });

    harness.editor.requestClearNotes();
    expect(getEditorDecorations(harness.editor.state)).toEqual({ isDividerGlintVisible: false });

    harness.editor.cancelPending();
    expect(getEditorDecorations(harness.editor.state)).toEqual({ isDividerGlintVisible: true });
  });

  it('enables SAVE again after cancel when a save finished while it was open', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    void harness.editor.save();
    addTap(harness, 5000, 1);
    harness.editor.back();

    lastSave(harness).resolve(SAVED_CHART_ID);
    await flush();
    expect(canSave(harness.editor.state)).toBe(false);
    harness.editor.cancelPending();

    expect(canSave(harness.editor.state)).toBe(true);
  });

  it('keeps DELETE and CLEAR as they were', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    harness.editor.back();

    expect(canDeleteSelected(harness.editor.state)).toBe(true);
    expect(canClearNotes(harness.editor.state)).toBe(true);
    expect(canSave(harness.editor.state)).toBe(false);
  });
});

describe('gestures', () => {
  it('adds a tap and moves it while dragging', async () => {
    const harness = await openLoaded();

    harness.editor.pointerDown({
      lane: 1,
      timeMs: 3000,
    });
    harness.editor.pointerMove({
      lane: 2,
      timeMs: 4000,
    });
    harness.editor.pointerUp(4000);

    expect(getNotes(harness.editor.state)).toEqual([
      {
        type: 'tap',
        timeMs: 4000,
        lane: 2,
      },
    ]);
    expect(requireSession(harness.editor.state).gesture).toEqual({ kind: 'none' });
    expect(hasUnsavedChanges(harness.editor.state)).toBe(true);
  });

  it('snaps a new note to the current playhead', async () => {
    const harness = await openLoaded();
    harness.editor.seek(5000);

    addTap(harness, 5015);

    expect(getNotes(harness.editor.state)).toEqual([
      {
        type: 'tap',
        timeMs: 5000,
        lane: 3,
      },
    ]);
  });

  it('creates a hold by dragging past its start', async () => {
    const harness = await openLoaded();
    harness.editor.selectTool('hold');

    harness.editor.pointerDown({
      lane: 0,
      timeMs: 3000,
    });
    harness.editor.pointerMove({
      lane: 0,
      timeMs: 3500,
    });
    harness.editor.pointerUp(3500);

    expect(getNotes(harness.editor.state)).toEqual([
      {
        type: 'hold',
        timeMs: 3000,
        endTimeMs: 3500,
        lane: 0,
      },
    ]);
  });

  it('cancels only a hold released at its start', async () => {
    const harness = await openLoaded([TAP_AT_2000]);
    const notes = getNotes(harness.editor.state);
    harness.editor.selectTool('hold');

    harness.editor.pointerDown({
      lane: 1,
      timeMs: 3000,
    });
    harness.editor.pointerUp(3000);

    expect(getNotes(harness.editor.state)).toBe(notes);
    expect(hasUnsavedChanges(harness.editor.state)).toBe(false);
  });

  it('selects a note without unsaved changes', async () => {
    const harness = await openLoaded([TAP_AT_2000]);

    harness.editor.pointerDown({
      lane: 0,
      timeMs: 2010,
    });
    harness.editor.pointerUp(2010);

    expect(getDraft(harness).selected).toBe(getNotes(harness.editor.state)[0]);
    expect(hasUnsavedChanges(harness.editor.state)).toBe(false);
  });

  it('ignores pointer moves and ups without a gesture', async () => {
    const harness = await openLoaded([TAP_AT_2000]);
    const state = harness.editor.state;

    harness.editor.pointerMove({
      lane: 1,
      timeMs: 3000,
    });
    harness.editor.pointerUp(3000);

    expect(harness.editor.state).toBe(state);
  });

  it('removes the hold being created and proceeds when that was the only change', async () => {
    const harness = await openLoaded([TAP_AT_2000]);
    const notes = getNotes(harness.editor.state);
    harness.editor.selectTool('hold');
    harness.editor.pointerDown({
      lane: 2,
      timeMs: 5000,
    });
    harness.editor.pointerMove({
      lane: 2,
      timeMs: 6000,
    });
    expect(getNotes(harness.editor.state)).toHaveLength(2);

    harness.editor.back();

    expect(harness.leftWith).toEqual(['test-song']);
    expect(getNotes(harness.editor.state)).toBe(notes);
    expect(requireSession(harness.editor.state).gesture).toEqual({ kind: 'none' });
  });

  it('removes the hold before opening the dialog, and later pointer input changes nothing', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    const dirtyNotes = getNotes(harness.editor.state);
    harness.editor.selectTool('hold');
    harness.editor.pointerDown({
      lane: 2,
      timeMs: 5000,
    });

    harness.editor.select(song, 4, 'hard');

    expect(getPending(harness.editor.state)).toEqual({
      kind: 'select',
      song,
      laneCount: 4,
      difficulty: 'hard',
    });
    expect(getNotes(harness.editor.state)).toBe(dirtyNotes);
    const held = harness.editor.state;
    harness.editor.pointerMove({
      lane: 2,
      timeMs: 6000,
    });
    harness.editor.pointerUp(6000);
    expect(harness.editor.state).toBe(held);
    harness.editor.cancelPending();
    expect(getNotes(harness.editor.state)).toBe(dirtyNotes);
  });

  it('deletes the selected note', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    expect(canDeleteSelected(harness.editor.state)).toBe(true);

    harness.editor.deleteSelected();

    expect(getNotes(harness.editor.state)).toEqual([]);
    expect(canDeleteSelected(harness.editor.state)).toBe(false);
  });
});

describe('undo', () => {
  it('undoes added notes one at a time back to the saved chart', async () => {
    const harness = await openLoaded([TAP_AT_2000]);
    const notes = getNotes(harness.editor.state);
    addTap(harness, 3000);
    addTap(harness, 4000);

    harness.editor.undo();
    expect(getNotes(harness.editor.state)).toEqual([
      TAP_AT_2000,
      {
        type: 'tap',
        timeMs: 3000,
        lane: 3,
      },
    ]);

    harness.editor.undo();
    expect(getNotes(harness.editor.state)).toBe(notes);
    expect(hasUnsavedChanges(harness.editor.state)).toBe(false);

    harness.editor.undo();
    expect(getNotes(harness.editor.state)).toBe(notes);
  });

  it('undoes a whole drag at once', async () => {
    const harness = await openLoaded();
    harness.editor.pointerDown({
      lane: 1,
      timeMs: 3000,
    });
    harness.editor.pointerMove({
      lane: 2,
      timeMs: 3500,
    });
    harness.editor.pointerMove({
      lane: 2,
      timeMs: 4000,
    });
    harness.editor.pointerUp(4000);

    harness.editor.undo();

    expect(getNotes(harness.editor.state)).toEqual([]);
  });

  it('undoes a delete and a clear', async () => {
    const harness = await openLoaded([TAP_AT_2000]);
    addTap(harness, 3000);
    harness.editor.deleteSelected();
    harness.editor.requestClearNotes();
    harness.editor.confirmPending();

    harness.editor.undo();
    expect(getNotes(harness.editor.state)).toHaveLength(1);
    harness.editor.undo();
    expect(getNotes(harness.editor.state)).toHaveLength(2);
  });

  it('keeps only the last 20 edits', async () => {
    const harness = await openLoaded();
    for (let index = 0; index < 21; index += 1) {
      addTap(harness, 3000 + index * 1000);
    }

    for (let index = 0; index < 21; index += 1) {
      harness.editor.undo();
    }

    expect(getNotes(harness.editor.state)).toEqual([
      {
        type: 'tap',
        timeMs: 3000,
        lane: 3,
      },
    ]);
  });

  it('does not record selecting a note', async () => {
    const harness = await openLoaded([TAP_AT_2000]);
    addTap(harness, 3000);
    harness.editor.pointerDown({
      lane: 0,
      timeMs: 2000,
    });
    harness.editor.pointerUp(2000);

    harness.editor.undo();

    expect(getNotes(harness.editor.state)).toEqual([TAP_AT_2000]);
  });
});

describe('saving', () => {
  it('marks an invalid chart, selects the invalid note and seeks to it paused', async () => {
    const duplicate: Note = {
      type: 'tap',
      timeMs: 3000,
      lane: 2,
    };
    const harness = await openLoaded([duplicate, { ...duplicate }]);
    startPlaying(harness);

    await harness.editor.save();

    expect(harness.saves).toEqual([]);
    expect(getEditorStatus(harness.editor.state)).toMatchObject({ kind: 'invalid' });
    expect(getDraft(harness).selected).toBe(getNotes(harness.editor.state)[1]);
    expect(harness.editor.state.playhead).toEqual({
      currentTimeMs: 3000,
      transport: { kind: 'paused' },
    });
    expect(harness.pauseCount).toBe(1);
  });

  it('marks an empty chart invalid', async () => {
    const harness = await openLoaded();

    await harness.editor.save();

    expect(getEditorStatus(harness.editor.state)).toEqual({
      kind: 'invalid',
      reason: 'Invalid chart: chart.notes must not be empty',
    });
  });

  it('saves a snapshot of the chart once while saving', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    const notes = getNotes(harness.editor.state);

    void harness.editor.save();
    void harness.editor.save();

    expect(harness.saves).toHaveLength(1);
    expect(lastSave(harness).song).toBe(song);
    expect(lastSave(harness).chart).toEqual({
      songId: 'test-song',
      difficulty: 'normal',
      laneCount: 4,
      offsetMs: 0,
      notes,
    });
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'saving' });
    expect(canSave(harness.editor.state)).toBe(false);
  });

  it('clears unsaved changes when nothing was edited during the save', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    void harness.editor.save();

    lastSave(harness).resolve(SAVED_CHART_ID);
    await flush();

    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'saved' });
    expect(harness.applied).toEqual([
      {
        songId: song.id,
        laneCount: 4,
        difficulty: 'normal',
        chartId: SAVED_CHART_ID,
      },
    ]);
    expect(getDraft(harness).song).toBe(savedSong);
    expect(hasUnsavedChanges(harness.editor.state)).toBe(false);
    expect(canSave(harness.editor.state)).toBe(false);
  });

  it('keeps edits made during the save as unsaved', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    void harness.editor.save();
    addTap(harness, 5000);
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'saving' });
    const edited = getNotes(harness.editor.state);

    lastSave(harness).resolve(SAVED_CHART_ID);
    await flush();

    expect(getNotes(harness.editor.state)).toBe(edited);
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'saved' });
    expect(hasUnsavedChanges(harness.editor.state)).toBe(true);
    expect(canSave(harness.editor.state)).toBe(true);
  });

  it('keeps the saved notes when a hold started during the save is cancelled after it', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    void harness.editor.save();
    const savedNotes = getNotes(harness.editor.state);
    harness.editor.selectTool('hold');
    harness.editor.pointerDown({
      lane: 2,
      timeMs: 6000,
    });

    lastSave(harness).resolve(SAVED_CHART_ID);
    await flush();
    expect(hasUnsavedChanges(harness.editor.state)).toBe(true);
    harness.editor.pointerUp(6000);

    const draft = getDraft(harness);
    expect(draft.notes).toBe(savedNotes);
    expect(draft.song).toBe(savedSong);
    expect(isDraftDirty(draft)).toBe(false);
  });

  it('ignores save results of a previous session', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    void harness.editor.save();
    const first = lastSave(harness);
    harness.editor.select(song, 4, 'hard');
    harness.editor.confirmPending();
    const reselected = harness.editor.state;
    expect(getSelection(reselected)).toEqual({
      song,
      laneCount: 4,
      difficulty: 'hard',
    });

    first.resolve(SAVED_CHART_ID);
    await flush();
    expect(harness.editor.state).toBe(reselected);

    addTap(harness, 3000);
    void harness.editor.save();
    const second = lastSave(harness);
    harness.editor.select(song, 4, 'normal');
    harness.editor.confirmPending();
    const loading = harness.editor.state;
    second.reject(new Error('network'));
    await flush();
    expect(harness.editor.state).toBe(loading);
  });

  it('marks a failed save and allows saving again', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    void harness.editor.save();

    lastSave(harness).reject(new Error('network'));
    await flush();

    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'saveFailed' });
    expect(canSave(harness.editor.state)).toBe(true);
  });

  it('returns saved, failed and invalid results to the unsaved status on a notes edit', async () => {
    const saved = await openLoaded();
    addTap(saved, 3000);
    void saved.editor.save();
    lastSave(saved).resolve(SAVED_CHART_ID);
    const failed = await openLoaded();
    addTap(failed, 3000);
    void failed.editor.save();
    lastSave(failed).reject(new Error('network'));
    const invalid = await openLoaded();
    await invalid.editor.save();
    await flush();

    for (const harness of [saved, failed, invalid]) {
      expect(getEditorStatus(harness.editor.state).kind).not.toBe('unsaved');
      addTap(harness, 5000, 1);
      expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'unsaved' });
    }
  });
});

describe('lane counts', () => {
  const laneSong: Song = {
    ...song,
    chartIds: {
      4: { normal: 'chart_normal' },
      5: { normal: 'chart_5k_normal' },
    },
  };

  async function openLaneSong(notes: readonly Note[] = []): Promise<Harness> {
    const harness = createHarness();
    harness.songs = [laneSong, otherSong];
    harness.editor.select(laneSong, 4, 'normal');
    lastLoad(harness).resolve(makeChart(notes));
    await flush();
    return harness;
  }

  it('loads the chart of the selected lane count keeping the song and difficulty', async () => {
    const harness = await openLaneSong();

    harness.editor.selectLaneCount(5);

    expect(lastLoad(harness).ref).toEqual({
      song: laneSong,
      laneCount: 5,
      difficulty: 'normal',
      chartId: 'chart_5k_normal',
    });
    expect(getSelection(harness.editor.state)).toEqual({
      song: laneSong,
      laneCount: 5,
      difficulty: 'normal',
    });
    expect(harness.changedSongs).toEqual([laneSong]);

    lastLoad(harness).resolve({
      ...makeChart([
        {
          type: 'tap',
          timeMs: 2000,
          lane: 4,
        },
      ]),
      laneCount: 5,
    });
    await flush();
    expect(getDraft(harness).laneCount).toBe(5);
    expect(getNotes(harness.editor.state)).toEqual([
      {
        type: 'tap',
        timeMs: 2000,
        lane: 4,
      },
    ]);
  });

  it('opens another lane count paused where playback was', async () => {
    const harness = await openLaneSong();
    startPlaying(harness);
    harness.timeSource.currentTime = 4;
    harness.editor.advancePlayback();

    harness.editor.selectLaneCount(5);
    expect(harness.editor.state.playhead).toEqual({
      currentTimeMs: 4000,
      transport: { kind: 'paused' },
    });
    lastLoad(harness).resolve({
      ...makeChart([]),
      laneCount: 5,
    });
    await flush();

    expect(harness.editor.state.playhead).toEqual({
      currentTimeMs: 4000,
      transport: { kind: 'paused' },
    });
    expect(harness.pauseCount).toBe(1);
  });

  it('edits an empty draft for a lane count without a chart, without a load', async () => {
    const harness = await openLaneSong();

    harness.editor.selectLaneCount(6);

    expect(harness.loads).toHaveLength(1);
    const draft = getDraft(harness);
    expect(draft.laneCount).toBe(6);
    expect(draft.difficulty).toBe('normal');
    expect(draft.notes).toEqual([]);
  });

  it('does nothing when the current lane count is selected again', async () => {
    const harness = await openLaneSong();
    const state = harness.editor.state;

    harness.editor.selectLaneCount(4);

    expect(harness.editor.state).toBe(state);
  });

  it('asks before switching away from unsaved changes and does not carry the notes', async () => {
    const harness = await openLaneSong();
    addTap(harness, 3000);
    const edited = getNotes(harness.editor.state);

    harness.editor.selectLaneCount(6);
    expect(getPending(harness.editor.state)).toEqual({
      kind: 'select',
      song: laneSong,
      laneCount: 6,
      difficulty: 'normal',
    });
    harness.editor.cancelPending();
    expect(getSelection(harness.editor.state)?.laneCount).toBe(4);
    expect(getNotes(harness.editor.state)).toBe(edited);

    harness.editor.selectLaneCount(6);
    harness.editor.confirmPending();
    expect(getDraft(harness).laneCount).toBe(6);
    expect(getNotes(harness.editor.state)).toEqual([]);
  });

  it('saves a note on the last 6K lane as a 6K chart', async () => {
    const harness = await openLaneSong();
    harness.editor.selectLaneCount(6);

    addTap(harness, 3000, 5);
    void harness.editor.save();
    expect(lastSave(harness).chart).toEqual({
      songId: 'test-song',
      difficulty: 'normal',
      laneCount: 6,
      offsetMs: 0,
      notes: [
        {
          type: 'tap',
          timeMs: 3000,
          lane: 5,
        },
      ],
    });
    lastSave(harness).resolve(SAVED_CHART_ID);
    await flush();

    expect(harness.applied).toEqual([
      {
        songId: laneSong.id,
        laneCount: 6,
        difficulty: 'normal',
        chartId: SAVED_CHART_ID,
      },
    ]);
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'saved' });
  });

  it('marks a 4K chart with a note on lane 4 invalid', async () => {
    const harness = await openLaneSong();
    addTap(harness, 3000, 4);

    await harness.editor.save();

    expect(harness.saves).toEqual([]);
    expect(getEditorStatus(harness.editor.state)).toMatchObject({ kind: 'invalid' });
  });

  it('keeps a late save away from the draft of another lane count but lists it as saved', async () => {
    const harness = await openLaneSong();
    addTap(harness, 3000);
    void harness.editor.save();
    harness.editor.selectLaneCount(6);
    harness.editor.confirmPending();
    const switched = harness.editor.state;

    lastSave(harness).resolve(SAVED_CHART_ID);
    await flush();

    expect(harness.editor.state).toBe(switched);
    expect(harness.applied).toEqual([
      {
        songId: laneSong.id,
        laneCount: 4,
        difficulty: 'normal',
        chartId: SAVED_CHART_ID,
      },
    ]);
  });

  it('ignores a late load once another lane count is selected', async () => {
    const harness = createHarness();
    harness.songs = [laneSong, otherSong];
    harness.editor.select(laneSong, 4, 'normal');
    const first = lastLoad(harness);
    harness.editor.selectLaneCount(6);
    const switched = harness.editor.state;

    first.resolve(makeChart([TAP_AT_2000]));
    await flush();

    expect(harness.editor.state).toBe(switched);
    expect(getDraft(harness).laneCount).toBe(6);
  });
});

describe('playback', () => {
  it('starts from the playhead and follows the clock once the player plays', async () => {
    const harness = await openLoaded();
    harness.editor.seek(3000);

    harness.editor.togglePlayback();
    expect(harness.requestedSec).toEqual([3]);
    expect(getTransport(harness.editor.state).kind).toBe('starting');
    harness.timeSource.currentTime = 4;
    harness.editor.advancePlayback();
    expect(harness.editor.state.playhead.currentTimeMs).toBe(3000);

    harness.editor.handlePlayerState('playing');
    harness.editor.advancePlayback();
    expect(harness.editor.state.playhead.currentTimeMs).toBe(4000);
  });

  it('rewinds to gameStartMs when starting at gameEndMs', async () => {
    const harness = await openLoaded();
    harness.editor.seek(10000);

    harness.editor.togglePlayback();

    expect(harness.requestedSec).toEqual([1]);
    expect(harness.editor.state.playhead.currentTimeMs).toBe(1000);
  });

  it('pauses at gameEndMs and pauses the player', async () => {
    const harness = await openLoaded();
    startPlaying(harness);

    harness.timeSource.currentTime = 9.999;
    harness.editor.advancePlayback();
    expect(getTransport(harness.editor.state).kind).toBe('playing');

    harness.timeSource.currentTime = 10;
    harness.editor.advancePlayback();
    expect(harness.editor.state.playhead).toEqual({
      currentTimeMs: 10000,
      transport: { kind: 'paused' },
    });
    expect(harness.pauseCount).toBe(1);
  });

  it('pauses the player on toggle and on seek', async () => {
    const harness = await openLoaded();
    startPlaying(harness);

    harness.editor.togglePlayback();
    expect(getTransport(harness.editor.state)).toEqual({ kind: 'paused' });
    startPlaying(harness);
    harness.editor.seek(5000);

    expect(harness.editor.state.playhead).toEqual({
      currentTimeMs: 5000,
      transport: { kind: 'paused' },
    });
    expect(harness.pauseCount).toBe(2);
  });

  it('follows a pause or end reported by the player', async () => {
    const harness = await openLoaded();
    startPlaying(harness);
    harness.editor.handlePlayerState('buffering');
    expect(getTransport(harness.editor.state).kind).toBe('playing');

    harness.editor.handlePlayerState('ended');

    expect(getTransport(harness.editor.state)).toEqual({ kind: 'paused' });
  });

  it('does not start before the player is ready or without a draft', async () => {
    const harness = await openLoaded();
    harness.isPlayerReady = false;
    const state = harness.editor.state;
    const loading = createHarness();
    loading.editor.select(song, 4, 'normal');
    const loadingState = loading.editor.state;

    harness.editor.togglePlayback();
    loading.editor.togglePlayback();

    expect(harness.editor.state).toBe(state);
    expect(loading.editor.state).toBe(loadingState);
  });

  it('ignores a late playing report after another chart is opened', async () => {
    const harness = await openLoaded();
    harness.editor.togglePlayback();
    expect(getTransport(harness.editor.state).kind).toBe('starting');

    harness.editor.select(song, 4, 'hard');
    const reopened = harness.editor.state;
    harness.editor.handlePlayerState('playing');
    harness.timeSource.currentTime = 5;
    harness.editor.advancePlayback();

    expect(harness.editor.state).toBe(reopened);
    // 새 채보를 열 때 한 번, 늦은 playing 에 다시 한 번 멈춘다.
    expect(harness.pauseCount).toBe(2);
  });

  it('pauses the player again when it starts playing after a pause', async () => {
    const harness = await openLoaded();
    harness.editor.togglePlayback();
    harness.editor.togglePlayback();
    expect(harness.pauseCount).toBe(1);

    harness.editor.handlePlayerState('playing');

    expect(getTransport(harness.editor.state)).toEqual({ kind: 'paused' });
    expect(harness.pauseCount).toBe(2);
    harness.editor.handlePlayerState('paused');
    expect(harness.pauseCount).toBe(2);
  });

  it('seeks while loading but not without a selection', () => {
    const harness = createHarness();
    const empty = harness.editor.state;
    harness.editor.seek(5000);
    expect(harness.editor.state).toBe(empty);

    harness.editor.select(song, 4, 'normal');
    harness.editor.seek(5000);

    expect(harness.editor.state.playhead.currentTimeMs).toBe(5000);
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'loading' });
  });
});
