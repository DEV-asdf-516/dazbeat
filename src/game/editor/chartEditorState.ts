import type { Song } from '../../data/songs.js';
import type { Difficulty, Note } from '../../rhythm/types.js';
import { isDraftDirty } from './chartDraft.js';
import type { ChartDraft } from './chartDraft.js';
import type { EditTool, PointerGesture } from './chartGesture.js';
import type { Playhead, Transport } from './chartPlayback.js';

export interface Selection {
  readonly song: Song;
  readonly difficulty: Difficulty;
}

export type Navigation =
  | { readonly kind: 'select'; readonly song: Song; readonly difficulty: Difficulty }
  | { readonly kind: 'leave' };

/** 전체 삭제는 되돌릴 수 없으므로 저장 여부와 관계없이 묻는다. */
export type PendingAction = Navigation | { readonly kind: 'clearNotes' };

export type SaveResult =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'invalid'; readonly reason: string };

export interface EditorSession {
  readonly id: object;
  readonly draft: ChartDraft;
  readonly gesture: PointerGesture;
  readonly saveResult: SaveResult;
}

export type EditPhase =
  | { readonly kind: 'empty' }
  | { readonly kind: 'loading'; readonly selection: Selection }
  | { readonly kind: 'loadFailed'; readonly selection: Selection }
  | { readonly kind: 'editing'; readonly session: EditorSession }
  | {
      readonly kind: 'confirming';
      readonly session: EditorSession;
      readonly pending: PendingAction;
    };

export interface ChartEditorState {
  readonly phase: EditPhase;
  readonly tool: EditTool;
  readonly playhead: Playhead;
}

export type EditorStatus =
  | { readonly kind: 'noSongs' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'loadFailed' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'saveFailed' }
  | { readonly kind: 'invalid'; readonly reason: string }
  | { readonly kind: 'unsaved' }
  | { readonly kind: 'none' };

export interface EditorDecorations {
  readonly isDividerGlintVisible: boolean;
}

export type EditorRegion =
  | 'selection'
  | 'status'
  | 'confirm'
  | 'panel'
  | 'playButton'
  | 'player'
  | 'playhead'
  | 'notes'
  | 'decorations';

const ALL_REGIONS: readonly EditorRegion[] = [
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

type StateReader = (state: ChartEditorState) => unknown;

const readSong: StateReader = (state) => getSession(state)?.draft.song;
const readNotes: StateReader = (state) => getSession(state)?.draft.notes;
const readSelected: StateReader = (state) => getSession(state)?.draft.selected;
const readSavedNotes: StateReader = (state) => getSession(state)?.draft.savedNotes;
const readSaveResult: StateReader = (state) => getSession(state)?.saveResult;
const readPending: StateReader = (state) => getPending(state);
const readTool: StateReader = (state) => state.tool;
const readTransport: StateReader = (state) => state.playhead.transport;
const readTimeMs: StateReader = (state) => state.playhead.currentTimeMs;

/** 영역마다 그릴 때 읽는 값이고, 그중 하나라도 바뀐 영역만 다시 그린다. */
const REGION_SOURCES: Readonly<Record<EditorRegion, readonly StateReader[]>> = {
  // 저장하면 곡의 채보 목록이 바뀌어 난이도 표시가 달라진다.
  selection: [readSong],
  status: [readNotes, readPending, readSavedNotes, readSaveResult],
  confirm: [readPending],
  panel: [readNotes, readSelected, readTool],
  playButton: [readTransport],
  player: [],
  playhead: [readTimeMs],
  notes: [readTimeMs, readNotes, readSelected],
  decorations: [readPending],
};

const IDLE: SaveResult = { kind: 'idle' };
const NO_NOTES: readonly Note[] = [];

/** 지난 저장 결과는 편집 전 notes 에 대한 것이다. */
export function withDraft(session: EditorSession, draft: ChartDraft): EditorSession {
  if (session.draft === draft) {
    return session;
  }
  const saveResult =
    session.draft.notes !== draft.notes && session.saveResult.kind !== 'saving'
      ? IDLE
      : session.saveResult;
  return {
    ...session,
    draft,
    saveResult,
  };
}

export function getSession(state: ChartEditorState): EditorSession | null {
  const { phase } = state;
  return phase.kind === 'editing' || phase.kind === 'confirming' ? phase.session : null;
}

export function getSelection(state: ChartEditorState): Selection | null {
  const { phase } = state;
  switch (phase.kind) {
    case 'empty':
      return null;
    case 'loading':
    case 'loadFailed':
      return phase.selection;
    case 'editing':
    case 'confirming':
      return {
        song: phase.session.draft.song,
        difficulty: phase.session.draft.difficulty,
      };
  }
}

export function getPending(state: ChartEditorState): PendingAction | null {
  return state.phase.kind === 'confirming' ? state.phase.pending : null;
}

/** draft 가 없으면 늘 같은 빈 배열이라, 같은 배열인지로 다시 그릴지 정할 수 있다. */
export function getNotes(state: ChartEditorState): readonly Note[] {
  return getSession(state)?.draft.notes ?? NO_NOTES;
}

export function getTransport(state: ChartEditorState): Transport {
  return state.playhead.transport;
}

export function hasUnsavedChanges(state: ChartEditorState): boolean {
  const session = getSession(state);
  return session !== null && isDraftDirty(session.draft);
}

/** 열린 확인 팝업이 입력을 막으므로, 팝업 뒤에서 다시 그려도 버튼 모양이 바뀌지 않게 팝업 여부는 보지 않는다. */
export function canDeleteSelected(state: ChartEditorState): boolean {
  const session = getSession(state);
  return session !== null && session.draft.selected !== null;
}

export function canClearNotes(state: ChartEditorState): boolean {
  return getNotes(state).length > 0;
}

export function canSave(state: ChartEditorState): boolean {
  const { phase } = state;
  return (
    phase.kind === 'editing' &&
    phase.session.saveResult.kind !== 'saving' &&
    isDraftDirty(phase.session.draft)
  );
}

export function getEditorStatus(state: ChartEditorState): EditorStatus {
  const { phase } = state;
  switch (phase.kind) {
    case 'empty':
      return { kind: 'noSongs' };
    case 'loading':
      return { kind: 'loading' };
    case 'loadFailed':
      return { kind: 'loadFailed' };
    case 'editing':
    case 'confirming':
      break;
  }
  const { saveResult, draft } = phase.session;
  switch (saveResult.kind) {
    case 'saving':
      return { kind: 'saving' };
    case 'saved':
      return { kind: 'saved' };
    case 'failed':
      return { kind: 'saveFailed' };
    case 'invalid':
      return {
        kind: 'invalid',
        reason: saveResult.reason,
      };
    case 'idle':
      return isDraftDirty(draft) ? { kind: 'unsaved' } : { kind: 'none' };
  }
}

export function getChangedRegions(
  previous: ChartEditorState,
  next: ChartEditorState,
): readonly EditorRegion[] {
  const before = getSession(previous);
  const after = getSession(next);
  if (
    previous.phase !== next.phase &&
    (before === null || after === null || before.id !== after.id)
  ) {
    return ALL_REGIONS;
  }
  return ALL_REGIONS.filter((region) =>
    REGION_SOURCES[region].some((read) => read(previous) !== read(next)),
  );
}

export function getEditorDecorations(state: ChartEditorState): EditorDecorations {
  return { isDividerGlintVisible: getPending(state) === null };
}
