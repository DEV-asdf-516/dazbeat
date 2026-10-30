import { filterChangedRegions } from '../../../changedRegions.js';
import type { StateReader } from '../../../changedRegions.js';
import type { YouTubeErrorKind } from '../../../audio/YouTubePlayer.js';
import { getAvailableDifficulties } from '../../../data/songs.js';
import type { Song } from '../../../data/songs.js';
import type { Difficulty, LaneCount, Note } from '../../../rhythm/types.js';
import {
  getButtonView,
  hoverButton,
  isButtonHovered,
  isButtonPressed,
  pressButton,
  releaseButton,
  releaseDisabledButton,
  unhoverButton,
} from '../../ui/state/buttonPointer.js';
import type { ButtonHover, ButtonView } from '../../ui/state/buttonPointer.js';
import { isDraftDirty, restoreNotes } from './chartDraft.js';
import type { ChartDraft } from './chartDraft.js';
import { cancelGesture, NO_GESTURE } from './chartGesture.js';
import type { EditTool, PointerGesture } from './chartGesture.js';
import type { Playhead, Transport } from './chartPlayback.js';

export interface Selection {
  readonly song: Song;
  readonly laneCount: LaneCount;
  readonly difficulty: Difficulty;
}

export type Navigation =
  | {
      readonly kind: 'select';
      readonly song: Song;
      readonly laneCount: LaneCount;
      readonly difficulty: Difficulty;
    }
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
  /** 편집 직전 draft 들. 마지막이 가장 최근 편집 직전이다. */
  readonly undoStack: readonly ChartDraft[];
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

export type EditorPlayerStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready' }
  | {
      readonly kind: 'failed';
      readonly failure:
        | { readonly kind: 'loadFailed' }
        | {
            readonly kind: 'videoError';
            readonly errorKind: YouTubeErrorKind;
            readonly code: number;
          };
    };

export type SegmentHover =
  | { readonly kind: 'laneCount'; readonly laneCount: LaneCount }
  | { readonly kind: 'tool'; readonly tool: EditTool };

export type EditorButton =
  | 'back'
  | 'previousSong'
  | 'nextSong'
  | 'save'
  | 'play'
  | 'delete'
  | 'clear'
  | 'confirmCancel'
  | 'confirmAccept';

export type ChartEditorHover = SegmentHover | ButtonHover<EditorButton>;

export interface ChartEditorState {
  readonly phase: EditPhase;
  readonly tool: EditTool;
  readonly playhead: Playhead;
  readonly player: EditorPlayerStatus;
  readonly hover: ChartEditorHover | null;
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

export type NavigationDecision =
  | { readonly kind: 'ignore' }
  | { readonly kind: 'proceed' }
  | { readonly kind: 'settle'; readonly session: EditorSession }
  | { readonly kind: 'settleAndProceed'; readonly session: EditorSession }
  | { readonly kind: 'confirm'; readonly session: EditorSession };

export interface EditorDecorations {
  readonly isDividerGlintVisible: boolean;
}

export type EditorRegion =
  | 'selection'
  | 'laneLines'
  | 'status'
  | 'confirm'
  | 'panel'
  | 'playButton'
  | 'playhead'
  | 'seekMarks'
  | 'notes'
  | 'decorations'
  | 'playerStatus'
  | 'laneCountIndicator'
  | 'laneCountSegments'
  | 'toolIndicator'
  | 'toolSegments'
  | 'backButton'
  | 'previousSongButton'
  | 'nextSongButton'
  | 'saveButton'
  | 'deleteButton'
  | 'clearButton'
  | 'confirmButtons';

type EditorReader = StateReader<ChartEditorState>;

const readPhaseKind: EditorReader = (state) => state.phase.kind;
const readSong: EditorReader = (state) => getSelection(state)?.song;
const readLaneCount: EditorReader = (state) => getSelection(state)?.laneCount;
const readDifficulty: EditorReader = (state) => getSelection(state)?.difficulty;
const readNotes: EditorReader = (state) => getNotes(state);
const readSelected: EditorReader = (state) => getSession(state)?.draft.selected;
const readSavedNotes: EditorReader = (state) => getSession(state)?.draft.savedNotes;
const readSaveResult: EditorReader = (state) => getSession(state)?.saveResult;
const readPending: EditorReader = (state) => getPending(state);
const readTool: EditorReader = (state) => state.tool;
const readTransport: EditorReader = (state) => state.playhead.transport;
const readTimeMs: EditorReader = (state) => state.playhead.currentTimeMs;
const readPlayer: EditorReader = (state) => state.player;
const readHoveredLaneCount: EditorReader = (state) => getHoveredLaneCount(state);
const readHoveredTool: EditorReader = (state) => getHoveredTool(state);
const readCanSave: EditorReader = (state) => canSave(state);
const readCanDelete: EditorReader = (state) => canDeleteSelected(state);
const readCanClear: EditorReader = (state) => canClearNotes(state);
const readIsConfirming: EditorReader = (state) => getPending(state) !== null;

function readButton(button: EditorButton): readonly EditorReader[] {
  return [
    (state) => isButtonHovered(state.hover, button),
    (state) => isButtonPressed(state.hover, button),
  ];
}

const REGION_SOURCES: Readonly<Record<EditorRegion, readonly EditorReader[]>> = {
  // 저장하면 곡의 채보 목록이 바뀌어 난이도 표시가 달라진다.
  selection: [readSong, readLaneCount, readDifficulty],
  laneLines: [readLaneCount],
  status: [readPhaseKind, readNotes, readPending, readSavedNotes, readSaveResult],
  confirm: [readPending, readNotes],
  panel: [readNotes, readSelected, readTool],
  playButton: [readTransport, ...readButton('play')],
  playhead: [readTimeMs, readSong],
  seekMarks: [readNotes, readSong],
  // 노트 색은 곡 accent 를, 위치는 레인 수와 playhead 를 따른다.
  notes: [readTimeMs, readNotes, readSelected, readLaneCount, readSong],
  decorations: [readPending],
  playerStatus: [readPlayer],
  laneCountIndicator: [readLaneCount],
  laneCountSegments: [readLaneCount, readHoveredLaneCount],
  toolIndicator: [readTool],
  toolSegments: [readTool, readHoveredTool],
  backButton: readButton('back'),
  previousSongButton: readButton('previousSong'),
  nextSongButton: readButton('nextSong'),
  saveButton: [readCanSave, ...readButton('save')],
  deleteButton: [readCanDelete, ...readButton('delete')],
  clearButton: [readCanClear, ...readButton('clear')],
  confirmButtons: [
    readIsConfirming,
    ...readButton('confirmCancel'),
    ...readButton('confirmAccept'),
  ],
};

const IDLE: SaveResult = { kind: 'idle' };
const DISABLEABLE_BUTTONS: readonly EditorButton[] = ['save', 'delete', 'clear'];
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

const UNDO_LIMIT = 20;

/** 드래그 도중의 중간 상태가 아니라 제스처 하나·삭제 하나를 한 번의 편집으로 기록한다. */
export function recordEdit(session: EditorSession, before: ChartDraft): EditorSession {
  if (session.draft.notes === before.notes) {
    return session;
  }
  return {
    ...session,
    undoStack: [...session.undoStack, before].slice(-UNDO_LIMIT),
  };
}

export function undoEdit(session: EditorSession): EditorSession {
  const before = session.undoStack.at(-1);
  if (before === undefined) {
    return session;
  }
  return {
    ...withDraft(session, restoreNotes(session.draft, before)),
    undoStack: session.undoStack.slice(0, -1),
  };
}

export function settleGesture(session: EditorSession): EditorSession {
  if (session.gesture.kind === 'none') {
    return session;
  }
  return recordEdit(
    {
      ...withDraft(session, cancelGesture(session.draft, session.gesture)),
      gesture: NO_GESTURE,
    },
    session.gesture.before,
  );
}

export function decideNavigation(
  state: ChartEditorState,
  navigation: Navigation,
): NavigationDecision {
  const { phase } = state;
  if (phase.kind === 'confirming') {
    return { kind: 'ignore' };
  }
  const isCurrent = isSelected(getSelection(state), navigation);
  if (phase.kind !== 'editing') {
    return isCurrent && phase.kind !== 'loadFailed' ? { kind: 'ignore' } : { kind: 'proceed' };
  }
  const session = settleGesture(phase.session);
  if (isCurrent) {
    return {
      kind: 'settle',
      session,
    };
  }
  return isDraftDirty(session.draft)
    ? {
        kind: 'confirm',
        session,
      }
    : {
        kind: 'settleAndProceed',
        session,
      };
}

function isSelected(selection: Selection | null, navigation: Navigation): boolean {
  return (
    navigation.kind === 'select' &&
    selection !== null &&
    selection.song.id === navigation.song.id &&
    selection.laneCount === navigation.laneCount &&
    selection.difficulty === navigation.difficulty
  );
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
        laneCount: phase.session.draft.laneCount,
        difficulty: phase.session.draft.difficulty,
      };
  }
}

export function getActiveSelection(state: ChartEditorState): Selection | null {
  return getPending(state) === null ? getSelection(state) : null;
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
  const isSessionChanged =
    previous.phase !== next.phase && (before === null || after === null || before.id !== after.id);
  const regions = filterChangedRegions(REGION_SOURCES, isSessionChanged ? null : previous, next);
  // 도구 표시기는 채보가 바뀌어도 진행 중인 이동을 끊지 않도록 도구가 바뀌거나 처음 그릴 때만 칠한다.
  return regions.filter(
    (region) =>
      region !== 'toolIndicator' || previous.tool !== next.tool || previous.phase.kind === 'empty',
  );
}

export function getEditorDecorations(state: ChartEditorState): EditorDecorations {
  return { isDividerGlintVisible: getPending(state) === null };
}

export function getInitialDifficulty(song: Song, laneCount: LaneCount): Difficulty {
  return getAvailableDifficulties(song, laneCount)[0] ?? 'easy';
}

export type DifficultyLook =
  'selectedWithChart' | 'selectedWithoutChart' | 'withChart' | 'withoutChart';

export function getDifficultyLook(state: ChartEditorState, difficulty: Difficulty): DifficultyLook {
  const selection = getSelection(state);
  if (selection === null) {
    return 'withoutChart';
  }
  const hasChart = getAvailableDifficulties(selection.song, selection.laneCount).includes(
    difficulty,
  );
  if (selection.difficulty === difficulty) {
    return hasChart ? 'selectedWithChart' : 'selectedWithoutChart';
  }
  return hasChart ? 'withChart' : 'withoutChart';
}

export function getSelectionPanel(state: ChartEditorState): {
  readonly titleKey: 'chartEditor.noSelection' | 'chartEditor.selectionSection';
  readonly noteCount: number | null;
} {
  const draft = getSession(state)?.draft ?? null;
  const selected = draft?.selected ?? null;
  return {
    titleKey: selected === null ? 'chartEditor.noSelection' : 'chartEditor.selectionSection',
    noteCount: draft === null ? null : draft.notes.length,
  };
}

export function getPlayButtonLabel(state: ChartEditorState): 'PLAY' | 'PAUSE' {
  return getTransport(state).kind === 'paused' ? 'PLAY' : 'PAUSE';
}

export function hoverSegment(state: ChartEditorState, target: SegmentHover): ChartEditorState {
  return isSameHover(state.hover, target)
    ? state
    : {
        ...state,
        hover: target,
      };
}

export function unhoverSegment(state: ChartEditorState, target: SegmentHover): ChartEditorState {
  return isSameHover(state.hover, target)
    ? {
        ...state,
        hover: null,
      }
    : state;
}

export function getHoveredLaneCount(state: ChartEditorState): LaneCount | null {
  return state.hover?.kind === 'laneCount' ? state.hover.laneCount : null;
}

export function getHoveredTool(state: ChartEditorState): EditTool | null {
  return state.hover?.kind === 'tool' ? state.hover.tool : null;
}

// 선택이 없던 레인 수 표시기는 처음 놓이는 것이라 옮기지 않고 바로 놓는다.
export function getLaneCountMotion(previous: ChartEditorState): 'snap' | 'slide' {
  return getSelection(previous) === null ? 'snap' : 'slide';
}

// 도구는 처음부터 값이 있으므로 바뀐 때만 옮기고, 같은 도구를 다시 칠하는 첫 그림은 바로 놓는다.
export function getToolMotion(
  previous: ChartEditorState,
  next: ChartEditorState,
): 'snap' | 'slide' {
  return previous.tool === next.tool ? 'snap' : 'slide';
}

function isSameHover(hover: ChartEditorHover | null, target: SegmentHover): boolean {
  if (hover === null) {
    return false;
  }
  switch (hover.kind) {
    case 'laneCount':
      return target.kind === 'laneCount' && target.laneCount === hover.laneCount;
    case 'tool':
      return target.kind === 'tool' && target.tool === hover.tool;
    case 'button':
      return false;
  }
}

function isEditorButtonEnabled(state: ChartEditorState, button: EditorButton): boolean {
  switch (button) {
    case 'save':
      return canSave(state);
    case 'delete':
      return canDeleteSelected(state);
    case 'clear':
      return canClearNotes(state);
    case 'confirmCancel':
    case 'confirmAccept':
      return getPending(state) !== null;
    case 'back':
    case 'previousSong':
    case 'nextSong':
    case 'play':
      return true;
  }
}

function withHover(state: ChartEditorState, hover: ChartEditorHover | null): ChartEditorState {
  return hover === state.hover
    ? state
    : {
        ...state,
        hover,
      };
}

export function hoverEditorButton(state: ChartEditorState, button: EditorButton): ChartEditorState {
  return withHover(state, hoverButton(state.hover, button));
}

export function unhoverEditorButton(
  state: ChartEditorState,
  button: EditorButton,
): ChartEditorState {
  return withHover(state, unhoverButton(state.hover, button));
}

export function pressEditorButton(state: ChartEditorState, button: EditorButton): ChartEditorState {
  return withHover(state, pressButton(state.hover, button, isEditorButtonEnabled(state, button)));
}

export function releaseEditorButton(
  state: ChartEditorState,
  button: EditorButton,
): ChartEditorState {
  return withHover(state, releaseButton(state.hover, button));
}

export function settleEditorButtons(state: ChartEditorState): ChartEditorState {
  const released = DISABLEABLE_BUTTONS.reduce<ChartEditorHover | null>(
    (hover, button) => releaseDisabledButton(hover, button, isEditorButtonEnabled(state, button)),
    state.hover,
  );
  // Phaser 는 숨긴 대상에 POINTER_OUT 을 보내지 않으므로 확인 창이 닫히면 그 안 버튼의 hover 를 푼다.
  return withHover(
    state,
    getPending(state) === null
      ? unhoverButton(unhoverButton(released, 'confirmCancel'), 'confirmAccept')
      : released,
  );
}

export function getEditorButtonView(state: ChartEditorState, button: EditorButton): ButtonView {
  return getButtonView(state.hover, button, isEditorButtonEnabled(state, button), false);
}
