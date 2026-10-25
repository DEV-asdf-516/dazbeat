import { describe, expect, it } from 'vitest';
import { RhythmClock } from '../../../src/audio/RhythmClock.js';
import type { Song } from '../../../src/data/songs.js';
import {
  addNote,
  completeSave,
  createDraft,
  selectNote,
} from '../../../src/game/editor/chartDraft.js';
import type { ChartDraft } from '../../../src/game/editor/chartDraft.js';
import {
  canClearNotes,
  canDeleteSelected,
  canSave,
  getChangedRegions,
  getEditorDecorations,
  getEditorStatus,
  getNotes,
  getPending,
  getSelection,
  hasUnsavedChanges,
  withDraft,
} from '../../../src/game/editor/chartEditorState.js';
import type {
  ChartEditorState,
  EditPhase,
  EditorSession,
  SaveResult,
} from '../../../src/game/editor/chartEditorState.js';
import { createPlayhead } from '../../../src/game/editor/chartPlayback.js';
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
  chartIds: { 4: { normal: 'chart_normal' } },
};

const TAP: Note = {
  type: 'tap',
  timeMs: 2000,
  lane: 0,
};

const SELECTION = {
  song,
  laneCount: 4,
  difficulty: 'normal',
} as const;

function makeDraft(notes: readonly Note[]): ChartDraft {
  return createDraft(song, {
    songId: 'test-song',
    difficulty: 'normal',
    laneCount: 4,
    offsetMs: 0,
    notes,
  });
}

function makeSession(draft: ChartDraft, saveResult: SaveResult = { kind: 'idle' }): EditorSession {
  return {
    id: {},
    draft,
    gesture: { kind: 'none' },
    saveResult,
  };
}

function inPhase(phase: EditPhase): ChartEditorState {
  return {
    phase,
    tool: 'tap',
    playhead: createPlayhead(1000),
  };
}

function editing(session: EditorSession): ChartEditorState {
  return inPhase({
    kind: 'editing',
    session,
  });
}

const empty = inPhase({ kind: 'empty' });
const loading = inPhase({
  kind: 'loading',
  selection: SELECTION,
});
const loadFailed = inPhase({
  kind: 'loadFailed',
  selection: SELECTION,
});
const cleanSession = makeSession(makeDraft([TAP]));
const clean = editing(cleanSession);
const dirtySession = makeSession(
  addNote(makeDraft([TAP]), {
    type: 'tap',
    timeMs: 3000,
    lane: 1,
  }),
);
const dirty = editing(dirtySession);

function withPending(session: EditorSession): ChartEditorState {
  return inPhase({
    kind: 'confirming',
    session,
    pending: { kind: 'leave' },
  });
}

describe('getSelection', () => {
  it('reads the selection from the phase, and from the draft while editing', () => {
    const savedSong: Song = {
      ...song,
      chartIds: {
        4: {
          normal: 'chart_normal',
          hard: 'chart_hard',
        },
      },
    };
    const saved = editing(
      makeSession(
        createDraft(savedSong, {
          songId: 'test-song',
          difficulty: 'normal',
          laneCount: 6,
          offsetMs: 0,
          notes: [TAP],
        }),
      ),
    );

    expect(getSelection(empty)).toBeNull();
    expect(getSelection(loading)).toBe(SELECTION);
    expect(getSelection(loadFailed)).toBe(SELECTION);
    expect(getSelection(saved)).toEqual({
      song: savedSong,
      laneCount: 6,
      difficulty: 'normal',
    });
  });
});

describe('getEditorStatus', () => {
  it('follows the phase, then the save result, then unsaved changes', () => {
    const draft = makeDraft([TAP]);

    expect(getEditorStatus(empty)).toEqual({ kind: 'noSongs' });
    expect(getEditorStatus(loading)).toEqual({ kind: 'loading' });
    expect(getEditorStatus(loadFailed)).toEqual({ kind: 'loadFailed' });
    expect(getEditorStatus(editing(makeSession(draft, { kind: 'saving' })))).toEqual({
      kind: 'saving',
    });
    expect(getEditorStatus(editing(makeSession(draft, { kind: 'saved' })))).toEqual({
      kind: 'saved',
    });
    expect(getEditorStatus(editing(makeSession(draft, { kind: 'failed' })))).toEqual({
      kind: 'saveFailed',
    });
    expect(
      getEditorStatus(
        editing(
          makeSession(draft, {
            kind: 'invalid',
            reason: 'bad',
          }),
        ),
      ),
    ).toEqual({
      kind: 'invalid',
      reason: 'bad',
    });
    expect(getEditorStatus(dirty)).toEqual({ kind: 'unsaved' });
    expect(getEditorStatus(clean)).toEqual({ kind: 'none' });
  });
});

describe('panel and button state', () => {
  it('allows SAVE only with unsaved changes, no save in progress and no dialog open', () => {
    expect(canSave(clean)).toBe(false);
    expect(canSave(dirty)).toBe(true);
    expect(
      canSave(
        editing({
          ...dirtySession,
          saveResult: { kind: 'saving' },
        }),
      ),
    ).toBe(false);
    expect(canSave(withPending(dirtySession))).toBe(false);
    expect(canSave(loading)).toBe(false);
  });

  it('allows DELETE with a selected note and CLEAR with notes, whether or not the dialog is open', () => {
    expect(canDeleteSelected(clean)).toBe(false);
    expect(canDeleteSelected(dirty)).toBe(true);
    expect(canDeleteSelected(withPending(dirtySession))).toBe(true);
    expect(canClearNotes(clean)).toBe(true);
    expect(canClearNotes(withPending(cleanSession))).toBe(true);
    expect(canClearNotes(editing(makeSession(makeDraft([]))))).toBe(false);
    expect(canDeleteSelected(loading)).toBe(false);
    expect(canClearNotes(loading)).toBe(false);
  });

  it('gives the same empty notes and no unsaved changes without a draft', () => {
    expect(getNotes(loading)).toEqual([]);
    expect(getNotes(loading)).toBe(getNotes(empty));
    expect(hasUnsavedChanges(loadFailed)).toBe(false);
    expect(hasUnsavedChanges(dirty)).toBe(true);
  });
});

describe('getEditorDecorations', () => {
  it('hides the divider glint only while the dialog is open', () => {
    for (const state of [empty, loading, loadFailed, clean, dirty]) {
      expect(getPending(state)).toBeNull();
      expect(getEditorDecorations(state)).toEqual({ isDividerGlintVisible: true });
    }
    expect(getEditorDecorations(withPending(dirtySession))).toEqual({
      isDividerGlintVisible: false,
    });
  });
});

describe('withDraft', () => {
  it('returns saved, failed and invalid results to idle when notes change', () => {
    const draft = makeDraft([TAP]);
    const edited = addNote(draft, {
      type: 'tap',
      timeMs: 3000,
      lane: 1,
    });
    const results: SaveResult[] = [
      { kind: 'saved' },
      { kind: 'failed' },
      {
        kind: 'invalid',
        reason: 'bad',
      },
    ];

    for (const saveResult of results) {
      expect(withDraft(makeSession(draft, saveResult), edited).saveResult).toEqual({
        kind: 'idle',
      });
    }
  });

  it('keeps saving while notes change and keeps the result when only the selection changes', () => {
    const draft = makeDraft([TAP]);
    const saving = makeSession(draft, { kind: 'saving' });
    const invalid = makeSession(draft, {
      kind: 'invalid',
      reason: 'bad',
    });
    const edited = addNote(draft, {
      type: 'tap',
      timeMs: 3000,
      lane: 1,
    });

    expect(withDraft(saving, edited).saveResult).toEqual({ kind: 'saving' });
    expect(withDraft(invalid, selectNote(draft, draft.notes[0] ?? null)).saveResult).toBe(
      invalid.saveResult,
    );
    expect(withDraft(invalid, draft)).toBe(invalid);
  });
});

describe('getChangedRegions', () => {
  const all = [
    'selection',
    'status',
    'confirm',
    'panel',
    'playButton',
    'player',
    'playhead',
    'notes',
    'decorations',
  ];

  it('redraws every region when the phase changes or another chart opens', () => {
    expect(getChangedRegions(empty, loading)).toEqual(all);
    expect(getChangedRegions(loading, clean)).toEqual(all);
    expect(getChangedRegions(clean, editing(makeSession(cleanSession.draft)))).toEqual(all);
  });

  it('redraws only the notes, panel and status for a notes edit, without the playhead', () => {
    expect(
      getChangedRegions(
        clean,
        editing(
          withDraft(
            cleanSession,
            addNote(cleanSession.draft, {
              type: 'tap',
              timeMs: 3000,
              lane: 1,
            }),
          ),
        ),
      ),
    ).toEqual(['status', 'panel', 'notes']);
    expect(
      getChangedRegions(
        clean,
        editing({
          ...cleanSession,
          draft: selectNote(cleanSession.draft, TAP),
        }),
      ),
    ).toEqual(['panel', 'notes']);
  });

  it('redraws the selection and status when a save changes the song and the saved notes', () => {
    const savedSong: Song = {
      ...song,
      chartIds: {
        4: {
          normal: 'chart_normal',
          hard: 'chart_hard',
        },
      },
    };

    expect(
      getChangedRegions(
        dirty,
        editing({
          ...dirtySession,
          draft: completeSave(dirtySession.draft, dirtySession.draft.notes, savedSong),
          saveResult: { kind: 'saved' },
        }),
      ),
    ).toEqual(['selection', 'status']);
  });

  it('redraws SAVE with the dialog and the decorations when it opens or closes', () => {
    expect(getChangedRegions(dirty, withPending(dirtySession))).toEqual([
      'status',
      'confirm',
      'decorations',
    ]);
    expect(getChangedRegions(withPending(dirtySession), dirty)).toEqual([
      'status',
      'confirm',
      'decorations',
    ]);
  });

  it('redraws nothing for a gesture change alone', () => {
    expect(
      getChangedRegions(
        clean,
        editing({
          ...cleanSession,
          gesture: { kind: 'resizeHold' },
        }),
      ),
    ).toEqual([]);
  });

  it('redraws the play button, panel or playhead with notes for the playhead and the tool', () => {
    const starting: ChartEditorState = {
      ...clean,
      playhead: {
        currentTimeMs: 1000,
        transport: {
          kind: 'starting',
          clock: new RhythmClock({ currentTime: 0 }, 0, 0, {
            audioStartTimeSec: 0,
            songStartMs: 0,
          }),
        },
      },
    };

    expect(getChangedRegions(clean, starting)).toEqual(['playButton']);
    expect(
      getChangedRegions(clean, {
        ...clean,
        tool: 'hold',
      }),
    ).toEqual(['panel']);
    expect(
      getChangedRegions(clean, {
        ...clean,
        playhead: createPlayhead(5000),
      }),
    ).toEqual(['playhead', 'notes']);
    expect(
      getChangedRegions(loading, {
        ...loading,
        playhead: createPlayhead(5000),
      }),
    ).toEqual(['playhead', 'notes']);
  });
});
