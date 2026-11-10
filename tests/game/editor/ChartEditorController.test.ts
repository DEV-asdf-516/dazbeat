import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  YouTubePlayerHandlers,
  YouTubePlayerState,
} from '../../../src/audio/YouTubePlayer.js';
import type { ChartRef, Song } from '../../../src/data/songs.js';
import { ChartEditorController } from '../../../src/game/editor/ChartEditorController.js';
import type {
  ChartCatalog,
  ChartSaveOutcome,
  EditList,
} from '../../../src/game/editor/ChartEditorController.js';
import { isDraftDirty } from '../../../src/game/editor/state/chartDraft.js';
import type { ChartDraft } from '../../../src/game/editor/state/chartDraft.js';
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
} from '../../../src/game/editor/state/chartEditorState.js';
import type {
  ChartEditorState,
  EditorSession,
} from '../../../src/game/editor/state/chartEditorState.js';
import type { Chart, Difficulty, Lane, LaneCount, Note } from '../../../src/rhythm/types.js';
import { requireDefined } from '../../../src/invariant.js';

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
const LOADED_REVISION = 'revision-loaded';
const SAVED: ChartSaveOutcome = {
  kind: 'saved',
  chartId: SAVED_CHART_ID,
  revision: 'revision-saved',
};

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

interface FakePlayer {
  readonly videoId: string;
  readonly handlers: YouTubePlayerHandlers;
  readonly volumes: number[];
  isDestroyed: boolean;
}

const VOLUME = 0.5;

interface Harness {
  readonly editor: ChartEditorController;
  readonly apiLoads: Pending<void>[];
  readonly players: FakePlayer[];
  readonly loads: (Pending<Chart> & { readonly ref: ChartRef })[];
  readonly saves: (Pending<ChartSaveOutcome> & {
    readonly song: Song;
    readonly chart: Chart;
    readonly baseRevision: string | null;
  })[];
  readonly applied: {
    songId: string;
    laneCount: LaneCount;
    difficulty: Difficulty;
    chartId: string;
  }[];
  readonly leftWith: (string | null)[];
  readonly testPlays: ChartRef[];
  readonly testPlayStartsMs: number[];
  readonly requestedSec: number[];
  songs: readonly Song[];
  // 다음으로 끝나는 채보 로드가 돌려줄 revision.
  loadRevision: string;
  isCreateThrowing: boolean;
  nowMs: number;
  // 화면에 보일 프레임 시각이 벽시계보다 이른 만큼.
  frameLagMs: number;
  // 영상이 재생을 알린 때의 영상 위치와 벽시계 시각.
  flowStart: { readonly sec: number; readonly atMs: number };
  pauseCount: number;
  renderCount: number;
}

function createHarness(
  firstSong: Song = song,
  laneCount: LaneCount = 4,
  difficulty: Difficulty = 'normal',
  resumeTimeMs: number | null = null,
): Harness {
  const harness: Omit<Harness, 'editor'> = {
    loads: [],
    saves: [],
    applied: [],
    apiLoads: [],
    players: [],
    leftWith: [],
    testPlays: [],
    testPlayStartsMs: [],
    requestedSec: [],
    songs: [song, otherSong],
    loadRevision: LOADED_REVISION,
    isCreateThrowing: false,
    nowMs: 0,
    frameLagMs: 0,
    flowStart: {
      sec: 0,
      atMs: 0,
    },
    pauseCount: 0,
    renderCount: 0,
  };
  const catalog: ChartCatalog = {
    loadChart: (ref) =>
      new Promise<Chart>((resolve, reject) =>
        harness.loads.push({
          ref,
          resolve,
          reject,
        }),
      ).then((chart) => ({
        chart,
        revision: harness.loadRevision,
      })),
    saveChart: (target, chart, baseRevision) =>
      new Promise((resolve, reject) =>
        harness.saves.push({
          song: target,
          chart,
          baseRevision,
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
      players: {
        loadApi: () =>
          new Promise((resolve, reject) =>
            harness.apiLoads.push({
              resolve,
              reject,
            }),
          ),
        create: (videoId, handlers) => {
          if (harness.isCreateThrowing) {
            throw new Error('create failed');
          }
          const player: FakePlayer = {
            videoId,
            handlers,
            volumes: [],
            isDestroyed: false,
          };
          harness.players.push(player);
          return {
            requestPlay: (fromSec) => harness.requestedSec.push(fromSec),
            pause: () => {
              harness.pauseCount += 1;
            },
            setVolume: (volume) => player.volumes.push(volume),
            destroy: () => {
              player.isDestroyed = true;
            },
          };
        },
      },
      now: () => harness.nowMs,
      frameNow: () => harness.nowMs - harness.frameLagMs,
      volume: VOLUME,
    },
    {
      leave: (focusedSongId) => harness.leftWith.push(focusedSongId),
      startTestPlay: (chart, startTimeMs) => {
        harness.testPlays.push(chart);
        harness.testPlayStartsMs.push(startTimeMs);
      },
      render: (previous, next) => {
        expect(previous).not.toBe(next);
        expect(next).toBe(editor.state);
        harness.renderCount += 1;
      },
    },
    TIMING,
    {
      song: firstSong,
      laneCount,
      difficulty,
    },
    resumeTimeMs,
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
  return requireDefined(harness.loads.at(-1), 'expected a chart load');
}

function lastSave(harness: Harness): Harness['saves'][number] {
  return requireDefined(harness.saves.at(-1), 'expected a chart save');
}

function lastPlayer(harness: Harness): FakePlayer {
  return requireDefined(harness.players.at(-1), 'expected a video player');
}

async function readyPlayer(harness: Harness): Promise<void> {
  requireDefined(harness.apiLoads.at(-1), 'expected an API load').resolve();
  await flush();
  lastPlayer(harness).handlers.onReady();
}

function reportPlayerState(harness: Harness, state: YouTubePlayerState): void {
  if (state === 'playing') {
    harness.flowStart = {
      sec: harness.requestedSec.at(-1) ?? 0,
      atMs: harness.nowMs,
    };
  }
  lastPlayer(harness).handlers.onStateChange(state);
}

function moveVideoTo(harness: Harness, sec: number): void {
  harness.nowMs = harness.flowStart.atMs + (sec - harness.flowStart.sec) * 1000;
}

/** normal 은 chart 가 있으므로 로드를 거쳐 편집한다. */
async function openLoaded(notes: readonly Note[] = []): Promise<Harness> {
  const harness = createHarness();
  harness.editor.start();
  lastLoad(harness).resolve(makeChart(notes));
  await flush();
  await readyPlayer(harness);
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
  reportPlayerState(harness, 'playing');
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

    harness.editor.start();

    expect(harness.apiLoads).toHaveLength(1);
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
    const harness = createHarness(song, 4, 'hard');

    harness.editor.start();

    expect(harness.loads).toEqual([]);
    expect(harness.apiLoads).toHaveLength(1);
    const draft = getDraft(harness);
    expect(draft.difficulty).toBe('hard');
    expect(draft.notes).toEqual([]);
    expect(harness.editor.state.playhead.currentTimeMs).toBe(1000);
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'none' });
  });

  it('ignores load results of a previous selection', async () => {
    const harness = createHarness();
    harness.editor.start();
    const first = lastLoad(harness);
    harness.editor.moveSong(1);
    const loading = harness.editor.state;

    first.resolve(makeChart([TAP_AT_2000]));
    await flush();
    expect(harness.editor.state).toBe(loading);

    harness.editor.moveSong(-1);
    const second = lastLoad(harness);
    harness.editor.moveSong(1);
    second.reject(new Error('network'));
    await flush();
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'loading' });
  });

  it('shows a load failure and loads again when the same chart is selected', async () => {
    const harness = createHarness();
    harness.editor.start();
    lastLoad(harness).reject(new Error('network'));
    await flush();
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'loadFailed' });

    harness.editor.selectDifficulty('normal');

    expect(harness.loads).toHaveLength(2);
    expect(harness.apiLoads).toHaveLength(1);
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'loading' });
    lastLoad(harness).resolve(makeChart([]));
    await flush();
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'none' });
  });

  it('does nothing when the current chart is selected again', async () => {
    const harness = await openLoaded([TAP_AT_2000]);
    const state = harness.editor.state;
    const harnessLoading = createHarness();
    harnessLoading.editor.start();
    const loading = harnessLoading.editor.state;

    harness.editor.selectDifficulty('normal');
    harnessLoading.editor.selectDifficulty('normal');

    expect(harness.editor.state).toBe(state);
    expect(harness.loads).toHaveLength(1);
    expect(harnessLoading.editor.state).toBe(loading);
    expect(harnessLoading.loads).toHaveLength(1);
  });

  it('keeps the player for another difficulty of the same song only', async () => {
    const harness = await openLoaded();

    harness.editor.selectDifficulty('hard');
    expect(harness.apiLoads).toHaveLength(1);

    harness.editor.moveSong(1);
    expect(harness.apiLoads).toHaveLength(2);
  });

  it('starts another chart of the same song paused where playback was, with a fresh session', async () => {
    const harness = await openLoaded([TAP_AT_2000]);
    const previous = requireSession(harness.editor.state);
    startPlaying(harness);
    moveVideoTo(harness, 4);
    harness.editor.advancePlayback();

    harness.editor.selectDifficulty('hard');

    const session = requireSession(harness.editor.state);
    expect(session.id).not.toBe(previous.id);
    expect(session.gesture).toEqual({ kind: 'none' });
    expect(session.saveProgress).toEqual({ kind: 'idle' });
    expect(harness.editor.state.playhead).toEqual({
      currentTimeMs: 4000,
      transport: { kind: 'paused' },
    });
    expect(harness.pauseCount).toBe(1);
  });

  it('keeps the tool across selections', async () => {
    const harness = await openLoaded();
    harness.editor.selectTool('hold');

    harness.editor.selectDifficulty('hard');

    expect(harness.editor.state.tool).toBe('hold');
  });

  it('discards late load and save results once closed, without rendering', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    void harness.editor.save();
    harness.editor.moveSong(1);
    harness.editor.confirmPending();
    harness.editor.close();
    const renderCount = harness.renderCount;

    lastLoad(harness).resolve(makeChart([]));
    lastSave(harness).resolve(SAVED);
    await flush();

    expect(harness.renderCount).toBe(renderCount);
  });
});

describe('input after close', () => {
  it('ignores hover, button, tool and navigation input without rendering', async () => {
    const harness = await openLoaded();
    harness.editor.close();
    const renderCount = harness.renderCount;
    const leaves = harness.leftWith.length;

    harness.editor.hoverSegment({
      kind: 'tool',
      tool: 'hold',
    });
    harness.editor.pointerOverButton('back');
    harness.editor.pointerDownButton('back');
    harness.editor.pointerUpButton('back');
    harness.editor.selectTool('hold');
    harness.editor.back();

    expect(harness.renderCount).toBe(renderCount);
    expect(harness.leftWith).toHaveLength(leaves);
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
    expect(harness.apiLoads).toHaveLength(3);
  });

  it('selects another difficulty of the current song', async () => {
    const harness = await openLoaded();

    harness.editor.selectDifficulty('hard');

    expect(getSelection(harness.editor.state)).toEqual({
      song,
      laneCount: 4,
      difficulty: 'hard',
    });
    expect(harness.apiLoads).toHaveLength(1);
  });

  it('follows the current song by id after the list is replaced', async () => {
    const harness = await openLoaded();
    harness.songs = [savedSong, otherSong];

    harness.editor.moveSong(1);

    expect(getSelection(harness.editor.state)?.song).toBe(otherSong);
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
    expect(harness.apiLoads).toHaveLength(1);
  });
});

describe('leaving', () => {
  it('leaves focusing the current song without unsaved changes', async () => {
    const harness = await openLoaded();

    harness.editor.back();

    expect(harness.leftWith).toEqual(['test-song']);
  });
});

describe('unsaved changes confirmation', () => {
  it('holds a navigation, keeps the draft on cancel and proceeds on discard', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    const dirtyDraft = getDraft(harness);

    harness.editor.moveSong(1);
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

    harness.editor.moveSong(1);
    harness.editor.confirmPending();
    expect(getPending(harness.editor.state)).toBeNull();
    expect(harness.apiLoads).toHaveLength(2);
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
    harness.editor.selectDifficulty('hard');
    const held = harness.editor.state;

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
    loading.editor.start();
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
    harness.editor.deleteSelected();
    harness.editor.togglePlayback();
    harness.editor.requestClearNotes();
    harness.editor.moveSong(1);
    void harness.editor.save();

    expect(harness.editor.state).toBe(held);
    expect(harness.saves).toHaveLength(1);
  });

  it('pauses playback when opened and applies the save result', async () => {
    const harness = await heldWhileSaving();
    expect(getTransport(harness.editor.state)).toEqual({ kind: 'paused' });
    expect(harness.pauseCount).toBe(1);

    lastSave(harness).resolve(SAVED);
    await flush();
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'none' });
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

    lastSave(harness).resolve(SAVED);
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

    harness.editor.selectDifficulty('hard');

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
    expect(getPending(harness.editor.state)).toMatchObject({ kind: 'invalidChart' });
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

    expect(getPending(harness.editor.state)).toEqual({
      kind: 'invalidChart',
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
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'unsaved' });
    expect(canSave(harness.editor.state)).toBe(false);
  });

  it('clears unsaved changes when nothing was edited during the save', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    void harness.editor.save();

    lastSave(harness).resolve(SAVED);
    await flush();

    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'none' });
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
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'unsaved' });
    const edited = getNotes(harness.editor.state);

    lastSave(harness).resolve(SAVED);
    await flush();

    expect(getNotes(harness.editor.state)).toBe(edited);
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'unsaved' });
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

    lastSave(harness).resolve(SAVED);
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
    harness.editor.selectDifficulty('hard');
    harness.editor.confirmPending();
    const reselected = harness.editor.state;
    expect(getSelection(reselected)).toEqual({
      song,
      laneCount: 4,
      difficulty: 'hard',
    });

    first.resolve(SAVED);
    await flush();
    expect(harness.editor.state).toBe(reselected);

    addTap(harness, 3000);
    void harness.editor.save();
    const second = lastSave(harness);
    harness.editor.selectDifficulty('normal');
    harness.editor.confirmPending();
    const loading = harness.editor.state;
    second.reject(new Error('network'));
    await flush();
    expect(harness.editor.state).toBe(loading);
  });

  it('opens a failure notice and allows saving again once it closes', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    void harness.editor.save();

    lastSave(harness).reject(new Error('network'));
    await flush();

    expect(getPending(harness.editor.state)).toEqual({ kind: 'saveFailed' });
    expect(canSave(harness.editor.state)).toBe(false);
    harness.editor.confirmPending();
    expect(getPending(harness.editor.state)).toBeNull();
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'unsaved' });
    expect(canSave(harness.editor.state)).toBe(true);
  });

  it('closes a save notice with back without leaving', async () => {
    const harness = await openLoaded();
    await harness.editor.save();

    harness.editor.back();

    expect(getPending(harness.editor.state)).toBeNull();
    expect(harness.leftWith).toEqual([]);
  });

  it('replaces an open confirm dialog with the failure notice', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    void harness.editor.save();
    harness.editor.back();
    expect(getPending(harness.editor.state)).toEqual({ kind: 'leave' });

    lastSave(harness).reject(new Error('network'));
    await flush();

    expect(getPending(harness.editor.state)).toEqual({ kind: 'saveFailed' });
  });

  it('saves a loaded chart against its revision and the next save against the saved revision', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    void harness.editor.save();
    expect(lastSave(harness).baseRevision).toBe(LOADED_REVISION);

    lastSave(harness).resolve(SAVED);
    await flush();
    addTap(harness, 5000);
    void harness.editor.save();

    expect(harness.saves).toHaveLength(2);
    expect(lastSave(harness).baseRevision).toBe(SAVED.revision);
  });

  it('saves a new chart without a revision and the next save against the created revision', async () => {
    const harness = createHarness(song, 4, 'hard');
    harness.editor.start();
    await readyPlayer(harness);
    addTap(harness, 3000);
    void harness.editor.save();
    expect(lastSave(harness).baseRevision).toBeNull();

    lastSave(harness).resolve(SAVED);
    await flush();
    addTap(harness, 5000);
    void harness.editor.save();

    expect(lastSave(harness).song).toBe(savedSong);
    expect(lastSave(harness).baseRevision).toBe(SAVED.revision);
  });

  it('keeps the draft and its revision on a conflict and saves against the same revision again', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    void harness.editor.save();
    const before = getDraft(harness);

    lastSave(harness).resolve({ kind: 'conflict' });
    await flush();

    expect(getPending(harness.editor.state)).toEqual({ kind: 'saveConflict' });
    harness.editor.confirmPending();
    const draft = getDraft(harness);
    expect(draft.notes).toBe(before.notes);
    expect(draft.savedNotes).toBe(before.savedNotes);
    expect(draft.baseRevision).toBe(LOADED_REVISION);
    expect(harness.applied).toEqual([]);
    expect(canSave(harness.editor.state)).toBe(true);

    addTap(harness, 5000, 1);
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'unsaved' });
    void harness.editor.save();
    expect(harness.saves).toHaveLength(2);
    expect(lastSave(harness).baseRevision).toBe(LOADED_REVISION);
  });

  it('saves against the reloaded revision after a conflict and reopening the chart', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    void harness.editor.save();
    lastSave(harness).resolve({ kind: 'conflict' });
    await flush();
    harness.editor.confirmPending();

    harness.editor.selectDifficulty('hard');
    harness.editor.confirmPending();
    harness.editor.selectDifficulty('normal');
    harness.loadRevision = 'revision-latest';
    lastLoad(harness).resolve(makeChart([TAP_AT_2000]));
    await flush();
    expect(getNotes(harness.editor.state)).toEqual([TAP_AT_2000]);
    addTap(harness, 5000);
    void harness.editor.save();

    expect(lastSave(harness).baseRevision).toBe('revision-latest');
  });

  it('shows no status after a save and unsaved after the next edit', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    void harness.editor.save();
    lastSave(harness).resolve(SAVED);
    await flush();

    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'none' });
    addTap(harness, 5000, 1);
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'unsaved' });
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
    const harness = createHarness(laneSong, 4, 'normal');
    harness.songs = [laneSong, otherSong];
    harness.editor.start();
    lastLoad(harness).resolve(makeChart(notes));
    await flush();
    await readyPlayer(harness);
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
    expect(harness.apiLoads).toHaveLength(1);

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
    moveVideoTo(harness, 4);
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
    lastSave(harness).resolve(SAVED);
    await flush();

    expect(harness.applied).toEqual([
      {
        songId: laneSong.id,
        laneCount: 6,
        difficulty: 'normal',
        chartId: SAVED_CHART_ID,
      },
    ]);
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'none' });
  });

  it('marks a 4K chart with a note on lane 4 invalid', async () => {
    const harness = await openLaneSong();
    addTap(harness, 3000, 4);

    await harness.editor.save();

    expect(harness.saves).toEqual([]);
    expect(getPending(harness.editor.state)).toMatchObject({ kind: 'invalidChart' });
  });

  it('keeps a late save away from the draft of another lane count but lists it as saved', async () => {
    const harness = await openLaneSong();
    addTap(harness, 3000);
    void harness.editor.save();
    harness.editor.selectLaneCount(6);
    harness.editor.confirmPending();
    const switched = harness.editor.state;

    lastSave(harness).resolve(SAVED);
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
    const harness = createHarness(laneSong, 4, 'normal');
    harness.songs = [laneSong, otherSong];
    harness.editor.start();
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
    harness.nowMs += 1000;
    harness.editor.advancePlayback();
    expect(harness.editor.state.playhead.currentTimeMs).toBe(3000);

    reportPlayerState(harness, 'playing');
    moveVideoTo(harness, 4);
    harness.editor.advancePlayback();
    expect(harness.editor.state.playhead.currentTimeMs).toBe(4000);
  });

  it('follows the frame time rather than the wall clock', async () => {
    const harness = await openLoaded();
    harness.editor.seek(3000);
    harness.editor.togglePlayback();
    reportPlayerState(harness, 'playing');
    moveVideoTo(harness, 4);
    harness.frameLagMs = 16;

    harness.editor.advancePlayback();

    expect(harness.editor.state.playhead.currentTimeMs).toBe(3984);
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

    moveVideoTo(harness, 9.999);
    harness.editor.advancePlayback();
    expect(getTransport(harness.editor.state).kind).toBe('playing');

    moveVideoTo(harness, 10);
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
    reportPlayerState(harness, 'buffering');
    expect(getTransport(harness.editor.state).kind).toBe('playing');

    reportPlayerState(harness, 'ended');

    expect(getTransport(harness.editor.state)).toEqual({ kind: 'paused' });
  });

  it('does not start before the player is ready or without a draft', async () => {
    const harness = createHarness();
    harness.editor.start();
    lastLoad(harness).resolve(makeChart([]));
    await flush();
    const state = harness.editor.state;
    const loading = createHarness();
    loading.editor.start();
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

    harness.editor.selectDifficulty('hard');
    const reopened = harness.editor.state;
    reportPlayerState(harness, 'playing');
    moveVideoTo(harness, 5);
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

    reportPlayerState(harness, 'playing');

    expect(getTransport(harness.editor.state)).toEqual({ kind: 'paused' });
    expect(harness.pauseCount).toBe(2);
    reportPlayerState(harness, 'paused');
    expect(harness.pauseCount).toBe(2);
  });

  it('seeks while loading', () => {
    const harness = createHarness();
    harness.editor.start();
    harness.editor.seek(5000);

    expect(harness.editor.state.playhead.currentTimeMs).toBe(5000);
    expect(getEditorStatus(harness.editor.state)).toEqual({ kind: 'loading' });
  });
});

describe('video player', () => {
  it('creates a player per song and keeps it for another lane count or difficulty', async () => {
    const harness = await openLoaded();
    const first = lastPlayer(harness);
    expect(first.volumes).toEqual([VOLUME]);
    expect(harness.editor.state.player).toEqual({ kind: 'ready' });

    harness.editor.selectDifficulty('hard');
    harness.editor.selectLaneCount(5);
    expect(harness.apiLoads).toHaveLength(1);

    harness.editor.moveSong(1);
    expect(first.isDestroyed).toBe(true);
    expect(harness.editor.state.player).toEqual({ kind: 'loading' });
    await readyPlayer(harness);
    expect(harness.players).toHaveLength(2);
  });

  it('fails when the API does not load', async () => {
    const harness = createHarness();
    harness.editor.start();

    requireDefined(harness.apiLoads[0], 'expected an API load').reject(new Error('blocked'));
    await flush();

    expect(harness.editor.state.player).toEqual({
      kind: 'failed',
      failure: { kind: 'loadFailed' },
    });
  });

  it('fails when the player cannot be created', async () => {
    const harness = createHarness();
    harness.isCreateThrowing = true;
    harness.editor.start();

    requireDefined(harness.apiLoads[0], 'expected an API load').resolve();
    await flush();

    expect(harness.editor.state.player).toEqual({
      kind: 'failed',
      failure: { kind: 'loadFailed' },
    });
  });

  it('destroys the player and stops playback on a video error', async () => {
    const harness = await openLoaded();
    startPlaying(harness);

    lastPlayer(harness).handlers.onError('embeddingNotAllowed', 150);

    expect(lastPlayer(harness).isDestroyed).toBe(true);
    expect(harness.editor.state.player).toEqual({
      kind: 'failed',
      failure: {
        kind: 'videoError',
        errorKind: 'embeddingNotAllowed',
        code: 150,
      },
    });
    expect(getTransport(harness.editor.state)).toEqual({ kind: 'paused' });
  });

  it('ignores a late load and late events of the previous song', async () => {
    const harness = await openLoaded();
    const first = lastPlayer(harness);
    harness.editor.moveSong(1);
    const pendingLoad = requireDefined(harness.apiLoads.at(-1), 'expected an API load');
    const switched = harness.editor.state;

    first.handlers.onReady();
    first.handlers.onError('videoNotFound', 100);

    expect(harness.editor.state).toBe(switched);
    harness.editor.moveSong(-1);
    pendingLoad.resolve();
    await flush();
    expect(harness.players).toHaveLength(1);
  });

  it('destroys the player on close', async () => {
    const harness = await openLoaded();

    harness.editor.close();

    expect(lastPlayer(harness).isDestroyed).toBe(true);
  });
});

describe('segment hover', () => {
  it('keeps the hovered segment in the state and does not render the same hover again', async () => {
    const harness = await openLoaded();

    harness.editor.hoverSegment({
      kind: 'laneCount',
      laneCount: 5,
    });
    expect(harness.editor.state.hover).toEqual({
      kind: 'laneCount',
      laneCount: 5,
    });
    const renderCount = harness.renderCount;
    harness.editor.hoverSegment({
      kind: 'laneCount',
      laneCount: 5,
    });
    harness.editor.unhoverSegment({
      kind: 'tool',
      tool: 'hold',
    });
    expect(harness.renderCount).toBe(renderCount);

    harness.editor.unhoverSegment({
      kind: 'laneCount',
      laneCount: 5,
    });
    expect(harness.editor.state.hover).toBeNull();
  });
});

describe('restart button', () => {
  it('moves the playhead to the song start and pauses', async () => {
    const harness = await openLoaded([TAP_AT_2000]);
    harness.editor.seek(song.gameStartMs + 3000);
    harness.editor.togglePlayback();

    harness.editor.pointerDownButton('restart');
    harness.editor.pointerUpButton('restart');

    expect(harness.editor.state.playhead).toMatchObject({
      currentTimeMs: song.gameStartMs,
      transport: { kind: 'paused' },
    });
  });
});

describe('TEST PLAY', () => {
  function pressTestPlay(harness: Harness): void {
    harness.editor.pointerDownButton('testPlay');
    harness.editor.pointerUpButton('testPlay');
  }

  it('starts from the playhead', async () => {
    const harness = await openLoaded([TAP_AT_2000]);

    harness.editor.seek(3000);
    pressTestPlay(harness);

    expect(harness.testPlayStartsMs).toEqual([3000]);
  });

  it('opens at the time the test play stopped and starts again from there', async () => {
    const harness = createHarness(song, 4, 'normal', 3000);
    harness.editor.start();
    lastLoad(harness).resolve(makeChart([TAP_AT_2000]));
    await flush();
    await readyPlayer(harness);

    expect(harness.editor.state.playhead.currentTimeMs).toBe(3000);
    pressTestPlay(harness);
    expect(harness.testPlayStartsMs).toEqual([3000]);
  });

  it('starts the saved chart once', async () => {
    const harness = await openLoaded([TAP_AT_2000]);

    pressTestPlay(harness);
    harness.editor.pointerUpButton('testPlay');

    expect(harness.testPlays).toEqual([
      {
        song,
        laneCount: 4,
        difficulty: 'normal',
        chartId: 'chart_normal',
      },
    ]);
    expect(harness.saves).toEqual([]);
  });

  it('tells there is no saved chart and does not save or start', async () => {
    const harness = createHarness(song, 4, 'hard');
    harness.editor.start();
    await flush();

    pressTestPlay(harness);

    expect(getPending(harness.editor.state)).toEqual({ kind: 'testPlayNoChart' });
    expect(harness.testPlays).toEqual([]);
    expect(harness.saves).toEqual([]);
  });

  it('tells about unsaved changes and keeps them after OK', async () => {
    const harness = await openLoaded([TAP_AT_2000]);
    addTap(harness, 3000);
    const { notes } = getDraft(harness);

    pressTestPlay(harness);

    expect(getPending(harness.editor.state)).toEqual({ kind: 'testPlayUnsaved' });
    expect(harness.testPlays).toEqual([]);
    expect(harness.saves).toEqual([]);
    expect(getDraft(harness).notes).toBe(notes);

    harness.editor.confirmPending();

    expect(harness.editor.state.phase.kind).toBe('editing');
    expect(getDraft(harness).notes).toBe(notes);
    expect(harness.testPlays).toEqual([]);
  });

  it('pauses the playing video behind the notice', async () => {
    const harness = await openLoaded([TAP_AT_2000]);
    addTap(harness, 3000);
    startPlaying(harness);

    pressTestPlay(harness);

    expect(getTransport(harness.editor.state).kind).toBe('paused');
  });

  it('does nothing while loading or saving', async () => {
    const loading = createHarness();
    loading.editor.start();
    pressTestPlay(loading);
    expect(getPending(loading.editor.state)).toBeNull();
    expect(loading.testPlays).toEqual([]);

    const saving = await openLoaded([TAP_AT_2000]);
    addTap(saving, 3000);
    void saving.editor.save();
    pressTestPlay(saving);
    expect(getPending(saving.editor.state)).toBeNull();
    expect(saving.testPlays).toEqual([]);
  });

  it('releases a press when a save starts before the up', async () => {
    const harness = await openLoaded([TAP_AT_2000]);
    addTap(harness, 3000);
    harness.editor.pointerDownButton('testPlay');

    void harness.editor.save();
    harness.editor.pointerUpButton('testPlay');

    expect(getPending(harness.editor.state)).toBeNull();
    expect(harness.testPlays).toEqual([]);
  });

  it.each([
    ['fails', (harness: Harness) => lastSave(harness).reject(new Error('network'))],
    ['conflicts', (harness: Harness) => lastSave(harness).resolve({ kind: 'conflict' })],
  ])('tells about unsaved changes after a save %s', async (_case, settleSave) => {
    const harness = await openLoaded([TAP_AT_2000]);
    addTap(harness, 3000);
    void harness.editor.save();
    settleSave(harness);
    await flush();
    harness.editor.confirmPending();

    pressTestPlay(harness);

    expect(getPending(harness.editor.state)).toEqual({ kind: 'testPlayUnsaved' });
    expect(harness.testPlays).toEqual([]);
  });

  it('starts with the new chart id after a save', async () => {
    const harness = createHarness(song, 4, 'hard');
    harness.editor.start();
    await flush();
    await readyPlayer(harness);
    addTap(harness, 3000);
    void harness.editor.save();
    lastSave(harness).resolve(SAVED);
    await flush();

    pressTestPlay(harness);

    expect(harness.testPlays).toEqual([
      {
        song: savedSong,
        laneCount: 4,
        difficulty: 'hard',
        chartId: 'chart_hard',
      },
    ]);
    expect(harness.saves).toHaveLength(1);
  });

  it('leaves the PLAY button to the video alone', async () => {
    const harness = await openLoaded([TAP_AT_2000]);

    harness.editor.pointerDownButton('play');
    harness.editor.pointerUpButton('play');

    expect(harness.requestedSec).toHaveLength(1);
    expect(harness.testPlays).toEqual([]);
  });
});

describe('button pointer', () => {
  it('runs the button once for over, down and up on it', async () => {
    const harness = await openLoaded();

    harness.editor.pointerOverButton('back');
    harness.editor.pointerDownButton('back');
    harness.editor.pointerUpButton('back');
    harness.editor.pointerUpButton('back');

    expect(harness.leftWith).toEqual(['test-song']);
  });

  it('does not run the button for an up that was pressed elsewhere', async () => {
    const harness = await openLoaded();

    harness.editor.pointerOverButton('back');
    harness.editor.pointerUpButton('back');

    expect(harness.leftWith).toEqual([]);
  });

  it('releases the press when the pointer leaves the button', async () => {
    const harness = await openLoaded();

    harness.editor.pointerOverButton('back');
    harness.editor.pointerDownButton('back');
    harness.editor.pointerOutButton('back');
    harness.editor.pointerOverButton('back');
    harness.editor.pointerUpButton('back');

    expect(harness.leftWith).toEqual([]);
    expect(harness.editor.state.hover).toEqual({
      kind: 'button',
      button: 'back',
      isPressed: false,
    });
  });

  it('ignores a press on a disabled button', async () => {
    const harness = await openLoaded();
    const state = harness.editor.state;

    harness.editor.pointerDownButton('save');
    harness.editor.pointerUpButton('save');

    expect(harness.editor.state).toBe(state);
    expect(harness.saves).toHaveLength(0);
  });

  it('releases the press of a button that becomes disabled', async () => {
    const harness = await openLoaded();
    addTap(harness, 3000);
    harness.editor.pointerOverButton('delete');
    harness.editor.pointerDownButton('delete');
    expect(harness.editor.state.hover).toEqual({
      kind: 'button',
      button: 'delete',
      isPressed: true,
    });

    harness.editor.undo();
    harness.editor.pointerUpButton('delete');

    expect(harness.editor.state.hover).toEqual({
      kind: 'button',
      button: 'delete',
      isPressed: false,
    });
  });

  it('confirms and cancels with the dialog buttons and releases their hover on close', async () => {
    const harness = await openLoaded([TAP_AT_2000]);
    harness.editor.pointerDownButton('clear');
    harness.editor.pointerUpButton('clear');
    expect(getPending(harness.editor.state)).toEqual({ kind: 'clearNotes' });

    harness.editor.pointerOverButton('confirmCancel');
    harness.editor.pointerDownButton('confirmCancel');
    harness.editor.pointerUpButton('confirmCancel');
    expect(getPending(harness.editor.state)).toBeNull();
    expect(getNotes(harness.editor.state)).toEqual([TAP_AT_2000]);
    expect(harness.editor.state.hover).toBeNull();

    harness.editor.requestClearNotes();
    harness.editor.pointerDownButton('confirmAccept');
    harness.editor.pointerUpButton('confirmAccept');
    expect(getNotes(harness.editor.state)).toEqual([]);
    expect(harness.editor.state.hover).toBeNull();
  });
});
