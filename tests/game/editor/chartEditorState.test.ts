import { describe, expect, it } from 'vitest';
import { RhythmClock } from '../../../src/audio/RhythmClock.js';
import type { Song } from '../../../src/data/songs.js';
import { isDraftDirty } from '../../../src/game/editor/chartDraft.js';
import type { ChartDraft } from '../../../src/game/editor/chartDraft.js';
import {
  advancePlayback,
  applySelection,
  canSave,
  canStartPlayback,
  cancelPending,
  clearSelection,
  completeLoad,
  continueGesture,
  createEditorState,
  deleteSelected,
  confirmPending,
  endGesture,
  failLoad,
  failSave,
  finishSave,
  getEditorDecorations,
  getEditorStatus,
  handlePlayerState,
  requestClearNotes,
  requestNavigation,
  requestPause,
  seek,
  selectTool,
  startGesture,
  startPlayback,
  startSave,
} from '../../../src/game/editor/chartEditorState.js';
import type { ChartEditorState, SaveRequest } from '../../../src/game/editor/chartEditorState.js';
import type { Chart, Note } from '../../../src/rhythm/types.js';

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

const savedSong: Song = { ...song, chartIds: { ...song.chartIds, hard: 'chart_hard' } };

const LIMITS = { snapThresholdMs: 20, pickToleranceMs: 30 };

function makeClock(): RhythmClock {
  return new RhythmClock({ currentTime: 0 }, 0, 0);
}

function makeChart(notes: readonly Note[]): Chart {
  return { songId: 'test-song', difficulty: 'normal', offsetMs: 0, notes };
}

function requireToken(state: ChartEditorState): object {
  if (state.selectionToken === null) {
    throw new Error('missing selection token');
  }
  return state.selectionToken;
}

function loaded(notes: readonly Note[]): ChartEditorState {
  const loading = applySelection(createEditorState(), song, 'normal');
  return completeLoad(loading, requireToken(loading), makeChart(notes));
}

function getDraft(state: ChartEditorState): ChartDraft {
  if (state.phase.kind !== 'editing') {
    throw new Error(`expected editing, got ${state.phase.kind}`);
  }
  return state.phase.draft;
}

/** 빈 곳에 Tap 을 놓아 notes 를 바꾼다. */
function addTap(state: ChartEditorState, timeMs: number): ChartEditorState {
  return endGesture(startGesture(state, 3, timeMs, LIMITS), timeMs);
}

function requireRequest(result: {
  state: ChartEditorState;
  request: SaveRequest | null;
}): SaveRequest {
  if (result.request === null) {
    throw new Error('expected a save request');
  }
  return result.request;
}

describe('selection', () => {
  it('starts loading a difficulty with a chart, at gameStartMs, paused, with a new token', () => {
    const playing = startPlayback(loaded([]), makeClock());
    const previousToken = requireToken(playing);

    const next = applySelection(playing, song, 'normal');

    expect(next.phase).toEqual({ kind: 'loading', song, difficulty: 'normal' });
    expect(next.selectionToken).not.toBeNull();
    expect(next.selectionToken).not.toBe(previousToken);
    expect(next.currentTimeMs).toBe(1000);
    expect(next.transport).toEqual({ kind: 'paused' });
    expect(next.saveResult).toEqual({ kind: 'idle' });
  });

  it('edits an empty draft for a difficulty without a chart', () => {
    const next = applySelection(createEditorState(), song, 'hard');

    const draft = getDraft(next);
    expect(draft.song).toBe(song);
    expect(draft.difficulty).toBe('hard');
    expect(draft.notes).toEqual([]);
  });

  it('ignores load results of a previous selection', () => {
    const first = applySelection(createEditorState(), song, 'normal');
    const second = applySelection(first, song, 'normal');
    const oldToken = requireToken(first);

    expect(completeLoad(second, oldToken, makeChart([]))).toBe(second);
    expect(failLoad(second, oldToken)).toBe(second);
  });

  it('applies load results of the current selection', () => {
    const loading = applySelection(createEditorState(), song, 'normal');
    const token = requireToken(loading);
    const notes: Note[] = [{ type: 'tap', timeMs: 2000, lane: 1 }];

    expect(getDraft(completeLoad(loading, token, makeChart(notes))).notes).toEqual(notes);
    expect(failLoad(loading, token).phase).toEqual({
      kind: 'loadFailed',
      song,
      difficulty: 'normal',
    });
  });

  it('clears the selection', () => {
    const next = clearSelection(startPlayback(loaded([]), makeClock()));

    expect(next.phase).toEqual({ kind: 'empty' });
    expect(next.selectionToken).toBeNull();
    expect(next.transport).toEqual({ kind: 'paused' });
  });

  it('returns the same state when already cleared', () => {
    const cleared = clearSelection(loaded([]));

    expect(clearSelection(cleared)).toBe(cleared);
  });
});

describe('requestNavigation', () => {
  it('does nothing for the current selection', () => {
    const state = loaded([]);

    const result = requestNavigation(state, { kind: 'select', song, difficulty: 'normal' });

    expect(result.state).toBe(state);
    expect(result.proceed).toBeNull();
  });

  it('proceeds for the current selection after a load failure', () => {
    const loading = applySelection(createEditorState(), song, 'normal');
    const failed = failLoad(loading, requireToken(loading));
    const navigation = { kind: 'select', song, difficulty: 'normal' } as const;

    expect(requestNavigation(failed, navigation).proceed).toBe(navigation);
  });

  it('proceeds without unsaved changes', () => {
    const navigation = { kind: 'leave' } as const;

    const result = requestNavigation(loaded([]), navigation);

    expect(result.proceed).toBe(navigation);
    expect(result.state.pending).toBeNull();
  });

  it('holds the navigation with unsaved changes and ignores further requests', () => {
    const navigation = { kind: 'select', song, difficulty: 'hard' } as const;
    const result = requestNavigation(addTap(loaded([]), 3000), navigation);

    expect(result.proceed).toBeNull();
    expect(result.state.pending).toBe(navigation);
    const again = requestNavigation(result.state, { kind: 'leave' });
    expect(again.state).toBe(result.state);
    expect(again.proceed).toBeNull();
  });

  it('returns the held navigation on discard and only closes it on cancel', () => {
    const navigation = { kind: 'leave' } as const;
    const held = requestNavigation(addTap(loaded([]), 3000), navigation).state;

    const discarded = confirmPending(held);
    expect(discarded.proceed).toBe(navigation);
    expect(discarded.state.pending).toBeNull();

    const cancelled = cancelPending(held);
    expect(cancelled.pending).toBeNull();
    expect(getDraft(cancelled)).toBe(getDraft(held));
  });
});

describe('requestClearNotes', () => {
  const notes: Note[] = [
    { type: 'tap', timeMs: 2000, lane: 0 },
    { type: 'tap', timeMs: 2000, lane: 2 },
  ];

  it('asks for confirmation even without unsaved changes and clears only on confirm', () => {
    const state = loaded(notes);

    const held = requestClearNotes(state);
    expect(held.pending).toEqual({ kind: 'clearNotes' });
    expect(getDraft(held).notes).toHaveLength(2);

    const confirmed = confirmPending(held);
    expect(confirmed.proceed).toBeNull();
    expect(confirmed.state.pending).toBeNull();
    expect(getDraft(confirmed.state).notes).toEqual([]);
    expect(getEditorStatus(confirmed.state)).toEqual({ kind: 'unsaved' });
  });

  it('keeps the notes on cancel', () => {
    const held = requestClearNotes(loaded(notes));

    const cancelled = cancelPending(held);

    expect(cancelled.pending).toBeNull();
    expect(getDraft(cancelled)).toBe(getDraft(held));
  });

  it('does nothing without notes, without a draft or while another confirmation is open', () => {
    const empty = loaded([]);
    expect(requestClearNotes(empty)).toBe(empty);

    const loading = applySelection(createEditorState(), song, 'normal');
    expect(requestClearNotes(loading)).toBe(loading);

    const leaving = requestNavigation(addTap(loaded(notes), 3000), { kind: 'leave' }).state;
    expect(requestClearNotes(leaving)).toBe(leaving);
  });
});

describe('input while the confirm dialog is open', () => {
  function heldWhilePlaying(): ChartEditorState {
    const dirty = addTap(loaded([{ type: 'tap', timeMs: 2000, lane: 0 }]), 3000);
    const playing = startPlayback(dirty, makeClock());
    const { state } = requestNavigation(playing, { kind: 'leave' });
    expect(state.pending).not.toBeNull();
    return state;
  }

  it('ignores edits, seek, tools, pause and save', () => {
    const held = heldWhilePlaying();

    expect(startGesture(held, 1, 5000, LIMITS)).toBe(held);
    expect(startGesture(held, 0, 2000, LIMITS)).toBe(held);
    expect(continueGesture(held, 1, 5000, LIMITS.snapThresholdMs)).toBe(held);
    expect(endGesture(held, 5000)).toBe(held);
    expect(seek(held, 5000)).toBe(held);
    expect(selectTool(held, 'hold')).toBe(held);
    expect(deleteSelected(held)).toBe(held);
    expect(requestPause(held)).toBe(held);
    expect(startSave(held)).toEqual({ state: held, request: null });
  });

  it('does not allow starting playback', () => {
    const { state } = requestNavigation(addTap(loaded([]), 3000), { kind: 'leave' });

    expect(canStartPlayback(state)).toBe(false);
    expect(startPlayback(state, makeClock())).toBe(state);
  });
});

describe('navigation during a hold creation drag', () => {
  it('removes the hold being created and proceeds when that was the only change', () => {
    const clean = selectTool(loaded([{ type: 'tap', timeMs: 2000, lane: 0 }]), 'hold');
    const dragging = continueGesture(
      startGesture(clean, 2, 5000, LIMITS),
      2,
      6000,
      LIMITS.snapThresholdMs,
    );
    expect(getDraft(dragging).notes).toHaveLength(2);
    const navigation = { kind: 'select', song, difficulty: 'hard' } as const;

    const result = requestNavigation(dragging, navigation);

    expect(result.proceed).toBe(navigation);
    expect(getDraft(result.state).notes).toBe(getDraft(clean).notes);
    expect(result.state.gesture).toEqual({ kind: 'none' });
    expect(endGesture(result.state, 6000)).toBe(result.state);
  });

  it('removes the hold before opening the confirm bar and later pointer input changes nothing', () => {
    const dirty = selectTool(addTap(loaded([]), 3000), 'hold');
    const dragging = startGesture(dirty, 2, 5000, LIMITS);

    const { state, proceed } = requestNavigation(dragging, { kind: 'leave' });

    expect(proceed).toBeNull();
    expect(state.pending).toEqual({ kind: 'leave' });
    expect(getDraft(state).notes).toBe(getDraft(dirty).notes);
    expect(continueGesture(state, 2, 6000, LIMITS.snapThresholdMs)).toBe(state);
    expect(endGesture(state, 6000)).toBe(state);
    expect(getDraft(cancelPending(state)).notes).toBe(getDraft(dirty).notes);
  });
});

describe('hold creation across a save', () => {
  it('keeps the save result and removes only the hold when released at its start', () => {
    const dirty = selectTool(addTap(loaded([]), 3000), 'hold');
    const saving = startSave(dirty);
    const request = requireRequest(saving);
    const dragging = startGesture(saving.state, 2, 6000, LIMITS);

    const saved = finishSave(dragging, request, savedSong);
    expect(isDraftDirty(getDraft(saved))).toBe(true);
    const released = endGesture(saved, 6000);

    const draft = getDraft(released);
    expect(draft.notes).toBe(request.savedNotes);
    expect(draft.song).toBe(savedSong);
    expect(isDraftDirty(draft)).toBe(false);
  });
});

describe('gestures', () => {
  it('adds a tap in an empty spot and moves it while dragging', () => {
    const added = startGesture(loaded([]), 1, 3000, LIMITS);
    expect(getDraft(added).notes).toEqual([{ type: 'tap', timeMs: 3000, lane: 1 }]);

    const moved = continueGesture(added, 2, 4000, LIMITS.snapThresholdMs);

    expect(getDraft(moved).notes).toEqual([{ type: 'tap', timeMs: 4000, lane: 2 }]);
    expect(endGesture(moved, 4000).gesture).toEqual({ kind: 'none' });
  });

  it('creates a hold by dragging past its start', () => {
    const started = startGesture(selectTool(loaded([]), 'hold'), 0, 3000, LIMITS);
    expect(getDraft(started).notes).toEqual([
      { type: 'hold', timeMs: 3000, endTimeMs: 3001, lane: 0 },
    ]);
    const dragged = continueGesture(started, 0, 3500, LIMITS.snapThresholdMs);

    const released = endGesture(dragged, 3500);

    expect(getDraft(released).notes).toEqual([
      { type: 'hold', timeMs: 3000, endTimeMs: 3500, lane: 0 },
    ]);
    expect(released.gesture).toEqual({ kind: 'none' });
  });

  it('cancels a hold released at its start', () => {
    const clean = selectTool(loaded([]), 'hold');

    const released = endGesture(startGesture(clean, 0, 3000, LIMITS), 3000);

    expect(getDraft(released).notes).toBe(getDraft(clean).notes);
    expect(isDraftDirty(getDraft(released))).toBe(false);
  });

  it('moves a picked note head keeping the grab offset and snapping to other lanes', () => {
    const state = loaded([
      { type: 'tap', timeMs: 3000, lane: 0 },
      { type: 'tap', timeMs: 5000, lane: 1 },
    ]);
    const picked = startGesture(state, 1, 5010, LIMITS);
    expect(getDraft(picked).selected).toBe(getDraft(state).notes[1]);

    // 잡은 오프셋 10ms 를 뺀 3010 이 lane 0 노트(3000)에 스냅된다.
    const moved = continueGesture(picked, 1, 3020, LIMITS.snapThresholdMs);

    expect(getDraft(moved).notes).toEqual([
      { type: 'tap', timeMs: 3000, lane: 0 },
      { type: 'tap', timeMs: 3000, lane: 1 },
    ]);
  });

  it('changes a hold end without snapping', () => {
    const state = loaded([
      { type: 'tap', timeMs: 4500, lane: 0 },
      { type: 'hold', timeMs: 3000, endTimeMs: 4000, lane: 2 },
    ]);
    const picked = startGesture(state, 2, 4010, LIMITS);

    const resized = continueGesture(picked, 2, 4490, LIMITS.snapThresholdMs);

    expect(getDraft(resized).selected).toEqual({
      type: 'hold',
      timeMs: 3000,
      endTimeMs: 4490,
      lane: 2,
    });
  });
});

describe('save', () => {
  it('marks an invalid chart, selects the invalid note and seeks to it paused', () => {
    const state = startPlayback(
      loaded([
        { type: 'tap', timeMs: 3000, lane: 2 },
        { type: 'tap', timeMs: 3000, lane: 2 },
      ]),
      makeClock(),
    );

    const { state: next, request } = startSave(state);

    expect(request).toBeNull();
    expect(next.saveResult).toMatchObject({ kind: 'invalid' });
    expect(getDraft(next).selected).toBe(getDraft(state).notes[1]);
    expect(next.currentTimeMs).toBe(3000);
    expect(next.transport).toEqual({ kind: 'paused' });
  });

  it('requests a save of a valid chart and ignores another save while saving', () => {
    const state = addTap(loaded([]), 3000);

    const { state: saving, request } = startSave(state);

    expect(saving.saveResult).toEqual({ kind: 'saving' });
    expect(request).toEqual({
      token: state.selectionToken,
      song,
      chart: {
        songId: 'test-song',
        difficulty: 'normal',
        offsetMs: 0,
        notes: getDraft(state).notes,
      },
      savedNotes: getDraft(state).notes,
    });
    expect(startSave(saving)).toEqual({ state: saving, request: null });
  });

  it('clears dirty when nothing was edited during the save', () => {
    const saving = startSave(addTap(loaded([]), 3000));

    const saved = finishSave(saving.state, requireRequest(saving), savedSong);

    expect(saved.saveResult).toEqual({ kind: 'saved' });
    expect(getDraft(saved).song).toBe(savedSong);
    expect(isDraftDirty(getDraft(saved))).toBe(false);
  });

  it('stays dirty when notes were edited during the save', () => {
    const saving = startSave(addTap(loaded([]), 3000));
    const edited = addTap(saving.state, 5000);
    expect(edited.saveResult).toEqual({ kind: 'saving' });

    const saved = finishSave(edited, requireRequest(saving), savedSong);

    expect(isDraftDirty(getDraft(saved))).toBe(true);
    expect(getEditorStatus(saved)).toEqual({ kind: 'saved' });
  });

  it('ignores save results of a previous selection', () => {
    const saving = startSave(addTap(loaded([]), 3000));
    const request = requireRequest(saving);
    const reselected = applySelection(saving.state, song, 'hard');

    expect(finishSave(reselected, request, savedSong)).toBe(reselected);
    expect(failSave(reselected, request.token)).toBe(reselected);
  });

  it('marks a failed save', () => {
    const saving = startSave(addTap(loaded([]), 3000));

    expect(failSave(saving.state, requireRequest(saving).token).saveResult).toEqual({
      kind: 'failed',
    });
  });

  it('returns saved, failed and invalid results to idle on a notes edit', () => {
    const saving = startSave(addTap(loaded([]), 3000));
    const request = requireRequest(saving);
    const saved = finishSave(saving.state, request, savedSong);
    const failed = failSave(saving.state, request.token);
    const invalid = startSave(loaded([])).state;
    expect(invalid.saveResult).toMatchObject({ kind: 'invalid' });

    for (const state of [saved, failed, invalid]) {
      expect(addTap(state, 5000).saveResult).toEqual({ kind: 'idle' });
    }
  });
});

describe('transport', () => {
  it('rewinds to gameStartMs when starting playback at gameEndMs', () => {
    const clock = makeClock();
    const atEnd = seek(loaded([]), 10000);
    expect(atEnd.currentTimeMs).toBe(10000);

    const started = startPlayback(atEnd, clock);

    expect(started.currentTimeMs).toBe(1000);
    expect(started.transport).toEqual({ kind: 'starting', clock });
  });

  it('follows player state changes', () => {
    const clock = makeClock();
    const starting = startPlayback(loaded([]), clock);

    const playing = handlePlayerState(starting, 'playing');
    expect(playing.transport).toEqual({ kind: 'playing', clock });
    expect(handlePlayerState(playing, 'buffering')).toBe(playing);
    expect(handlePlayerState(playing, 'paused').transport).toEqual({ kind: 'paused' });
    expect(handlePlayerState(starting, 'ended').transport).toEqual({ kind: 'paused' });
    const paused = loaded([]);
    expect(handlePlayerState(paused, 'playing')).toBe(paused);
  });

  it('advances until gameEndMs and then pauses at gameEndMs', () => {
    const playing = handlePlayerState(startPlayback(loaded([]), makeClock()), 'playing');

    const beforeEnd = advancePlayback(playing, 9999);
    expect(beforeEnd.currentTimeMs).toBe(9999);
    expect(beforeEnd.transport.kind).toBe('playing');

    const atEnd = advancePlayback(playing, 10000);
    expect(atEnd.currentTimeMs).toBe(10000);
    expect(atEnd.transport).toEqual({ kind: 'paused' });
  });

  it('does not advance while paused', () => {
    const paused = loaded([]);

    expect(advancePlayback(paused, 5000)).toBe(paused);
  });

  it('pauses on seek and on a selection', () => {
    const playing = handlePlayerState(startPlayback(loaded([]), makeClock()), 'playing');

    const sought = seek(playing, 5000);
    expect(sought.currentTimeMs).toBe(5000);
    expect(sought.transport).toEqual({ kind: 'paused' });
    expect(applySelection(playing, song, 'hard').transport).toEqual({ kind: 'paused' });
    expect(requestPause(playing).transport).toEqual({ kind: 'paused' });
  });
});

describe('getEditorStatus', () => {
  it('follows the phase, then the save result, then unsaved changes', () => {
    const loading = applySelection(createEditorState(), song, 'normal');
    const dirty = addTap(loaded([]), 3000);
    const saving = startSave(dirty);
    const request = requireRequest(saving);

    expect(getEditorStatus(createEditorState())).toEqual({ kind: 'noSongs' });
    expect(getEditorStatus(loading)).toEqual({ kind: 'loading' });
    expect(getEditorStatus(failLoad(loading, requireToken(loading)))).toEqual({
      kind: 'loadFailed',
    });
    expect(getEditorStatus(saving.state)).toEqual({ kind: 'saving' });
    expect(getEditorStatus(finishSave(saving.state, request, savedSong))).toEqual({
      kind: 'saved',
    });
    expect(getEditorStatus(failSave(saving.state, request.token))).toEqual({
      kind: 'saveFailed',
    });
    expect(getEditorStatus(startSave(loaded([])).state)).toEqual({
      kind: 'invalid',
      reason: 'Invalid chart: chart.notes must not be empty',
    });
    expect(getEditorStatus(dirty)).toEqual({ kind: 'unsaved' });
    expect(getEditorStatus(loaded([]))).toEqual({ kind: 'none' });
  });
});

describe('getEditorDecorations', () => {
  const visible = { isDividerGlintVisible: true };
  const hidden = { isDividerGlintVisible: false };

  it('shows the glint whenever the dialog is closed', () => {
    const loading = applySelection(createEditorState(), song, 'normal');
    const dirty = addTap(loaded([]), 3000);
    const saving = startSave(dirty);
    const request = requireRequest(saving);

    expect(getEditorDecorations(createEditorState())).toEqual(visible);
    expect(getEditorDecorations(loading)).toEqual(visible);
    expect(getEditorDecorations(failLoad(loading, requireToken(loading)))).toEqual(visible);
    expect(getEditorDecorations(saving.state)).toEqual(visible);
    expect(getEditorDecorations(finishSave(saving.state, request, savedSong))).toEqual(visible);
    expect(getEditorDecorations(failSave(saving.state, request.token))).toEqual(visible);
    expect(getEditorDecorations(startSave(loaded([])).state)).toEqual(visible);
    expect(getEditorDecorations(dirty)).toEqual(visible);
    expect(getEditorDecorations(loaded([]))).toEqual(visible);
  });

  it('hides the glint while the dialog is open and restores it once it closes', () => {
    const saving = startSave(addTap(loaded([]), 3000)).state;

    const clearHeld = requestClearNotes(saving);
    expect(clearHeld.pending).toEqual({ kind: 'clearNotes' });
    expect(getEditorDecorations(clearHeld)).toEqual(hidden);
    expect(getEditorDecorations(cancelPending(clearHeld))).toEqual(visible);

    const navigationHeld = requestNavigation(addTap(loaded([]), 3000), { kind: 'leave' }).state;
    expect(navigationHeld.pending).not.toBeNull();
    expect(getEditorDecorations(navigationHeld)).toEqual(hidden);
  });
});

describe('canSave', () => {
  it('allows saving only unsaved changes with no save in progress and no dialog open', () => {
    const dirty = addTap(loaded([]), 3000);
    const saving = startSave(dirty);

    expect(canSave(loaded([]))).toBe(false);
    expect(canSave(dirty)).toBe(true);
    expect(canSave(saving.state)).toBe(false);
    expect(canSave(failSave(saving.state, requireRequest(saving).token))).toBe(true);
    expect(canSave(finishSave(saving.state, requireRequest(saving), savedSong))).toBe(false);
    expect(canSave(requestNavigation(dirty, { kind: 'leave' }).state)).toBe(false);
  });
});
