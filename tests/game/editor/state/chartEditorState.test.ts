import { describe, expect, it } from 'vitest';
import { RhythmClock } from '../../../../src/audio/RhythmClock.js';
import type { Song } from '../../../../src/data/songs.js';
import {
  addNote,
  completeSave,
  createDraft,
  selectNote,
  setDraftLevel,
} from '../../../../src/game/editor/state/chartDraft.js';
import type { ChartDraft } from '../../../../src/game/editor/state/chartDraft.js';
import {
  canClearNotes,
  canDeleteSelected,
  canSave,
  getChangedRegions,
  getDifficultyLook,
  getLaneCountMotion,
  hoverEditorButton,
  hoverSegment,
  pressEditorButton,
  getEditorButtonView,
  getEditorDecorations,
  getEditorStatus,
  getLevelControl,
  getInitialDifficulty,
  getNotes,
  getPending,
  getSelection,
  getSelectionPanel,
  hasUnsavedChanges,
  readEditorKey,
  withDraft,
} from '../../../../src/game/editor/state/chartEditorState.js';
import type {
  ChartEditorState,
  EditorPlayerStatus,
  EditPhase,
  EditorSession,
  SaveProgress,
} from '../../../../src/game/editor/state/chartEditorState.js';
import { createPlayhead } from '../../../../src/game/editor/state/chartPlayback.js';
import { requireDefined } from '../../../../src/invariant.js';
import type { Note } from '../../../../src/rhythm/types.js';

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
  charts: {
    4: {
      normal: {
        id: 'chart_normal',
        level: 1,
      },
    },
  },
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
  return createDraft(
    song,
    {
      songId: 'test-song',
      difficulty: 'normal',
      laneCount: 4,
      offsetMs: 0,
      notes,
    },
    'r0',
    1,
  );
}

function makeSession(
  draft: ChartDraft,
  saveProgress: SaveProgress = { kind: 'idle' },
): EditorSession {
  return {
    id: {},
    draft,
    gesture: { kind: 'none' },
    saveProgress,
    undoStack: [],
  };
}

const LOADING_PLAYER: EditorPlayerStatus = { kind: 'loading' };

function inPhase(phase: EditPhase): ChartEditorState {
  return {
    phase,
    tool: 'tap',
    playhead: createPlayhead(1000),
    player: LOADING_PLAYER,
    hover: null,
  };
}

function editing(session: EditorSession): ChartEditorState {
  return inPhase({
    kind: 'editing',
    session,
  });
}

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
      charts: {
        4: {
          normal: {
            id: 'chart_normal',
            level: 1,
          },
          hard: {
            id: 'chart_hard',
            level: 1,
          },
        },
      },
    };
    const saved = editing(
      makeSession(
        createDraft(
          savedSong,
          {
            songId: 'test-song',
            difficulty: 'normal',
            laneCount: 6,
            offsetMs: 0,
            notes: [TAP],
          },
          'r0',
          1,
        ),
      ),
    );

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
  it('follows the phase, then unsaved changes whether or not a save is in progress', () => {
    expect(getEditorStatus(loading)).toEqual({ kind: 'loading' });
    expect(getEditorStatus(loadFailed)).toEqual({ kind: 'loadFailed' });
    expect(
      getEditorStatus(
        editing({
          ...dirtySession,
          saveProgress: { kind: 'saving' },
        }),
      ),
    ).toEqual({ kind: 'unsaved' });
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
          saveProgress: { kind: 'saving' },
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
    expect(getNotes(loading)).toBe(getNotes(loadFailed));
    expect(hasUnsavedChanges(loadFailed)).toBe(false);
    expect(hasUnsavedChanges(dirty)).toBe(true);
  });
});

describe('getEditorDecorations', () => {
  it('hides the divider glint only while the dialog is open', () => {
    for (const state of [loading, loadFailed, clean, dirty]) {
      expect(getPending(state)).toBeNull();
      expect(getEditorDecorations(state)).toEqual({ isDividerGlintVisible: true });
    }
    expect(getEditorDecorations(withPending(dirtySession))).toEqual({
      isDividerGlintVisible: false,
    });
  });
});

describe('withDraft', () => {
  it('keeps saving while notes change and the same session for the same draft', () => {
    const draft = makeDraft([TAP]);
    const saving = makeSession(draft, { kind: 'saving' });
    const edited = addNote(draft, {
      type: 'tap',
      timeMs: 3000,
      lane: 1,
    });

    expect(withDraft(saving, edited).saveProgress).toEqual({ kind: 'saving' });
    expect(withDraft(saving, draft)).toBe(saving);
  });
});

describe('getChangedRegions', () => {
  const all = [
    'selection',
    'laneLines',
    'status',
    'confirm',
    'panel',
    'restartButton',
    'playButton',
    'playhead',
    'seekMarks',
    'notes',
    'decorations',
    'playerStatus',
    'laneCountIndicator',
    'laneCountSegments',
    'toolIndicator',
    'toolSegments',
    'backButton',
    'previousSongButton',
    'nextSongButton',
    'saveButton',
    'testPlayButton',
    'deleteButton',
    'clearButton',
    'confirmButtons',
    'levelControl',
  ];

  const allButToolIndicator = all.filter((region) => region !== 'toolIndicator');

  it('redraws every region when the first chart opens', () => {
    expect(getChangedRegions(null, loading)).toEqual(all);
  });

  it('redraws every region but the tool indicator when the phase changes or another chart opens', () => {
    expect(getChangedRegions(loading, clean)).toEqual(allButToolIndicator);
    expect(getChangedRegions(clean, editing(makeSession(cleanSession.draft)))).toEqual(
      allButToolIndicator,
    );
  });

  it('redraws what reads the notes for a notes edit, without the playhead', () => {
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
    ).toEqual(['status', 'confirm', 'panel', 'seekMarks', 'notes', 'saveButton', 'deleteButton']);
    expect(
      getChangedRegions(
        clean,
        editing({
          ...cleanSession,
          draft: selectNote(cleanSession.draft, TAP),
        }),
      ),
    ).toEqual(['panel', 'notes', 'deleteButton']);
  });

  it('redraws what reads the song and the status when a save changes the song and the saved notes', () => {
    const savedSong: Song = {
      ...song,
      charts: {
        4: {
          normal: {
            id: 'chart_normal',
            level: 1,
          },
          hard: {
            id: 'chart_hard',
            level: 1,
          },
        },
      },
    };

    expect(
      getChangedRegions(
        dirty,
        editing({
          ...dirtySession,
          draft: completeSave(
            dirtySession.draft,
            dirtySession.draft.notes,
            dirtySession.draft.level,
            savedSong,
            'r1',
          ),
        }),
      ),
    ).toEqual(['selection', 'status', 'playhead', 'seekMarks', 'notes', 'saveButton']);
  });

  it('redraws SAVE, TEST PLAY and the level control with the dialog and the decorations when it opens or closes', () => {
    expect(getChangedRegions(dirty, withPending(dirtySession))).toEqual([
      'status',
      'confirm',
      'decorations',
      'saveButton',
      'testPlayButton',
      'levelControl',
    ]);
    expect(getChangedRegions(withPending(dirtySession), dirty)).toEqual([
      'status',
      'confirm',
      'decorations',
      'saveButton',
      'testPlayButton',
      'levelControl',
    ]);
  });

  it('redraws nothing for a gesture change alone', () => {
    expect(
      getChangedRegions(
        clean,
        editing({
          ...cleanSession,
          gesture: {
            kind: 'resizeHold',
            before: cleanSession.draft,
          },
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
          clock: new RhythmClock({ getTimeAt: () => 0 }, 0, 0, {
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
    ).toEqual(['panel', 'toolIndicator', 'toolSegments']);
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

describe('getChangedRegions for the player', () => {
  it('redraws only the player status when only the player changes', () => {
    expect(
      getChangedRegions(clean, {
        ...clean,
        player: { kind: 'ready' },
      }),
    ).toEqual(['playerStatus']);
  });
});

describe('getDifficultyLook', () => {
  const hardSelection = inPhase({
    kind: 'loading',
    selection: {
      ...SELECTION,
      difficulty: 'hard',
    },
  });

  it('tells the selected difficulty apart by whether it has a chart', () => {
    expect(getDifficultyLook(loading, 'normal')).toBe('selectedWithChart');
    expect(getDifficultyLook(hardSelection, 'hard')).toBe('selectedWithoutChart');
  });

  it('tells the other difficulties apart by whether they have a chart', () => {
    expect(getDifficultyLook(hardSelection, 'normal')).toBe('withChart');
    expect(getDifficultyLook(loading, 'expert')).toBe('withoutChart');
  });
});

describe('getInitialDifficulty', () => {
  it('starts from the first difficulty with a chart, or easy without one', () => {
    expect(getInitialDifficulty(song, 4)).toBe('normal');
    expect(getInitialDifficulty(song, 5)).toBe('easy');
  });
});

describe('getSelectionPanel', () => {
  it('has no note count without a draft', () => {
    expect(getSelectionPanel(loading)).toEqual({
      titleKey: 'chartEditor.noSelection',
      noteCount: null,
    });
  });

  it('counts the notes and names the selection section when a note is selected', () => {
    expect(getSelectionPanel(clean)).toEqual({
      titleKey: 'chartEditor.noSelection',
      noteCount: 1,
    });
    expect(
      getSelectionPanel(
        editing({
          ...cleanSession,
          draft: selectNote(cleanSession.draft, requireDefined(getNotes(clean)[0], 'Missing note')),
        }),
      ),
    ).toEqual({
      titleKey: 'chartEditor.selectionSection',
      noteCount: 1,
    });
  });
});

describe('segments', () => {
  it('redraws only the segments of the hovered control', () => {
    expect(
      getChangedRegions(
        clean,
        hoverSegment(clean, {
          kind: 'laneCount',
          laneCount: 5,
        }),
      ),
    ).toEqual(['laneCountSegments']);
    expect(
      getChangedRegions(
        clean,
        hoverSegment(clean, {
          kind: 'tool',
          tool: 'hold',
        }),
      ),
    ).toEqual(['toolSegments']);
  });

  it('keeps the same state when hovering the hovered segment again', () => {
    const hovered = hoverSegment(clean, {
      kind: 'tool',
      tool: 'hold',
    });

    expect(
      hoverSegment(hovered, {
        kind: 'tool',
        tool: 'hold',
      }),
    ).toBe(hovered);
  });

  it('snaps the lane count indicator only on the first draw', () => {
    expect(getLaneCountMotion(null)).toBe('snap');
    expect(getLaneCountMotion(clean)).toBe('slide');
  });
});

describe('buttons', () => {
  it('redraws only the hovered button when the hover changes', () => {
    const hovered = hoverEditorButton(clean, 'back');

    expect(getChangedRegions(clean, hovered)).toEqual(['backButton']);
    expect(getChangedRegions(hovered, hoverEditorButton(hovered, 'play'))).toEqual([
      'playButton',
      'backButton',
    ]);
  });

  it('redraws only the pressed button when it is pressed', () => {
    const hovered = hoverEditorButton(clean, 'nextSong');

    expect(getChangedRegions(hovered, pressEditorButton(hovered, 'nextSong'))).toEqual([
      'nextSongButton',
    ]);
  });
});

describe('level', () => {
  const leveled = (level: Parameters<typeof setDraftLevel>[1]) =>
    editing(withDraft(cleanSession, setDraftLevel(cleanSession.draft, level)));

  it('makes the draft unsaved and redraws the status, SAVE and the level control when only the level changes', () => {
    const changed = leveled(3.5);

    expect(hasUnsavedChanges(changed)).toBe(true);
    expect(canSave(changed)).toBe(true);
    expect(getEditorStatus(changed)).toEqual({ kind: 'unsaved' });
    expect(getChangedRegions(clean, changed)).toEqual(['status', 'saveButton', 'levelControl']);
  });

  it('redraws the status when a save makes only the saved level match', () => {
    const changed = leveled(3.5);
    const session = requireDefined(
      changed.phase.kind === 'editing' ? changed.phase.session : undefined,
      'Leveled state is not editing',
    );
    const saved = editing({
      ...session,
      draft: completeSave(session.draft, session.draft.notes, 3.5, song, 'r0'),
    });

    expect(hasUnsavedChanges(saved)).toBe(false);
    expect(getChangedRegions(changed, saved)).toContain('status');
  });

  it('disables ◀ at level 1 and ▶ at level 5', () => {
    expect(getEditorButtonView(clean, 'levelDown').appearance).toBe('disabled');
    expect(getEditorButtonView(clean, 'levelUp').appearance).not.toBe('disabled');
    expect(getEditorButtonView(leveled(5), 'levelUp').appearance).toBe('disabled');
    expect(getEditorButtonView(leveled(5), 'levelDown').appearance).not.toBe('disabled');
  });

  it('cannot be used while loading, after a failed load or behind a dialog', () => {
    expect(getLevelControl(loading)).toEqual({
      level: null,
      isEnabled: false,
    });
    expect(getLevelControl(loadFailed).isEnabled).toBe(false);
    expect(getLevelControl(withPending(dirtySession)).isEnabled).toBe(false);
    expect(getEditorButtonView(loading, 'levelUp').appearance).toBe('disabled');
    expect(getLevelControl(leveled(2))).toEqual({
      level: 2,
      isEnabled: true,
    });
  });
});

describe('readEditorKey', () => {
  const key = (
    code: string,
    modifiers: Partial<Pick<KeyboardEvent, 'repeat' | 'ctrlKey' | 'metaKey' | 'shiftKey'>> = {},
  ) => ({
    code,
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...modifiers,
  });

  it('undoes on Ctrl+Z or Meta+Z but not with Shift', () => {
    expect(readEditorKey(key('KeyZ', { ctrlKey: true }), false)).toBe('undo');
    expect(readEditorKey(key('KeyZ', { metaKey: true }), false)).toBe('undo');
    expect(
      readEditorKey(
        key('KeyZ', {
          ctrlKey: true,
          shiftKey: true,
        }),
        false,
      ),
    ).toBeNull();
  });

  it('confirms the pending action on Enter but not on a repeat', () => {
    expect(readEditorKey(key('Enter'), false)).toBe('confirmPending');
    expect(readEditorKey(key('Enter', { repeat: true }), false)).toBeNull();
  });

  it('toggles playback on Space but not on a repeat', () => {
    expect(readEditorKey(key('Space'), false)).toBe('togglePlayback');
    expect(readEditorKey(key('Space', { repeat: true }), false)).toBeNull();
  });

  it('deletes the selected note on Delete or Backspace', () => {
    expect(readEditorKey(key('Delete'), false)).toBe('deleteSelected');
    expect(readEditorKey(key('Backspace'), false)).toBe('deleteSelected');
  });

  it('goes back on Escape but not on a repeat', () => {
    expect(readEditorKey(key('Escape'), false)).toBe('back');
    expect(readEditorKey(key('Escape', { repeat: true }), false)).toBeNull();
  });

  it('ignores other keys', () => {
    expect(readEditorKey(key('KeyX'), false)).toBeNull();
  });

  it('only blurs on Enter and cancels on Escape while the level input is focused', () => {
    expect(readEditorKey(key('Enter'), true)).toBe('blurLevelInput');
    expect(readEditorKey(key('Escape'), true)).toBe('cancelLevelInput');
    expect(readEditorKey(key('Space'), true)).toBeNull();
    expect(readEditorKey(key('Backspace'), true)).toBeNull();
    expect(readEditorKey(key('Delete'), true)).toBeNull();
    expect(readEditorKey(key('KeyZ', { ctrlKey: true }), true)).toBeNull();
  });
});
