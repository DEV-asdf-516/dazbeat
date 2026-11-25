import { filterChangedRegions } from '../../../changedRegions.js';
import type { StateReader } from '../../../changedRegions.js';
import type { YouTubeErrorKind } from '../../../audio/YouTubePlayer.js';
import { CHART_LEVELS, findChart, getAvailableDifficulties } from '../../../data/songs.js';
import type { ChartLevel, ChartRef, Song } from '../../../data/songs.js';
import { stepItem } from '../../../range.js';
import type { ListDirection } from '../../../range.js';
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
import { readMenuAction } from '../../ui/state/menuAction.js';
import {
  clearNotes,
  createEmptyDraft,
  deleteSelectedNote,
  isDraftDirty,
  restoreNotes,
  setDraftLevel,
} from './chartDraft.js';
import type { ChartDraft } from './chartDraft.js';
import { cancelGesture, NO_GESTURE } from './chartGesture.js';
import type { EditTool, PointerGesture } from './chartGesture.js';
import { createPlayhead, pausePlayback, seekPlayback } from './chartPlayback.js';
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

/** 저장하지 못한 이유는 SAVE 옆 문구 대신 버튼 하나짜리 확인 팝업으로 알린다. */
export type SaveNotice =
  | { readonly kind: 'saveFailed' }
  | { readonly kind: 'saveConflict' }
  | { readonly kind: 'invalidChart'; readonly reason: string };

export const SAVE_FAILURE_NOTICES: Readonly<Record<'failed' | 'conflict', SaveNotice>> = {
  failed: { kind: 'saveFailed' },
  conflict: { kind: 'saveConflict' },
};

/** 전체 삭제는 되돌릴 수 없으므로 저장 여부와 관계없이 묻는다. */
export type PendingAction =
  Navigation | { readonly kind: 'clearNotes' } | SaveNotice | TestPlayNotice;

export type TestPlayNotice =
  { readonly kind: 'testPlayUnsaved' } | { readonly kind: 'testPlayNoChart' };

export type TestPlayDecision =
  | { readonly kind: 'notice'; readonly notice: TestPlayNotice }
  | { readonly kind: 'start'; readonly chart: ChartRef };

export type SaveProgress = { readonly kind: 'idle' } | { readonly kind: 'saving' };

export interface EditorSession {
  readonly id: object;
  readonly draft: ChartDraft;
  readonly gesture: PointerGesture;
  readonly saveProgress: SaveProgress;
  /** 편집 직전 draft 들. 마지막이 가장 최근 편집 직전이다. */
  readonly undoStack: readonly ChartDraft[];
}

export type EditPhase =
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
  | 'testPlay'
  | 'restart'
  | 'play'
  | 'delete'
  | 'clear'
  | 'confirmCancel'
  | 'confirmAccept'
  | 'levelDown'
  | 'levelUp';

export type ChartEditorHover = SegmentHover | ButtonHover<EditorButton>;

export interface ChartEditorState {
  readonly phase: EditPhase;
  readonly tool: EditTool;
  readonly playhead: Playhead;
  readonly player: EditorPlayerStatus;
  readonly hover: ChartEditorHover | null;
}

export type EditorStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'loadFailed' }
  | { readonly kind: 'unsaved' }
  | { readonly kind: 'none' };

export type NavigationDecision =
  | { readonly kind: 'ignore' }
  | { readonly kind: 'cancelPending'; readonly session: EditorSession }
  | { readonly kind: 'proceed' }
  | { readonly kind: 'settle'; readonly session: EditorSession }
  | { readonly kind: 'settleAndProceed'; readonly session: EditorSession }
  | { readonly kind: 'confirm'; readonly session: EditorSession };

/** 내비게이션 전이 뒤 Controller 가 이어서 할 일. */
export type NavigationFollow =
  | { readonly kind: 'none' }
  | { readonly kind: 'leave'; readonly songId: string }
  | {
      readonly kind: 'loadChart';
      readonly chart: ChartRef;
      readonly loading: Extract<EditPhase, { readonly kind: 'loading' }>;
      /** 있으면 그 위치에서 이어 편집하고, null 이면 채보를 읽은 뒤 첫 노트 앞으로 간다. */
      readonly keptTimeMs: number | null;
    };

export interface NavigationStep {
  readonly state: ChartEditorState;
  readonly follow: NavigationFollow;
}

const NO_FOLLOW: NavigationFollow = { kind: 'none' };

export interface EditorDecorations {
  readonly isDividerGlintVisible: boolean;
}

export type EditorRegion =
  | 'selection'
  | 'laneLines'
  | 'status'
  | 'confirm'
  | 'panel'
  | 'restartButton'
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
  | 'testPlayButton'
  | 'deleteButton'
  | 'clearButton'
  | 'confirmButtons'
  | 'levelControl';

type EditorReader = StateReader<ChartEditorState>;

const readPhaseKind: EditorReader = (state) => state.phase.kind;
const readSong: EditorReader = (state) => getSelection(state).song;
const readLaneCount: EditorReader = (state) => getSelection(state).laneCount;
const readDifficulty: EditorReader = (state) => getSelection(state).difficulty;
const readNotes: EditorReader = (state) => getNotes(state);
const readSelected: EditorReader = (state) => getSession(state)?.draft.selected;
const readSavedNotes: EditorReader = (state) => getSession(state)?.draft.savedNotes;
const readLevel: EditorReader = (state) => getSession(state)?.draft.level;
const readSavedLevel: EditorReader = (state) => getSession(state)?.draft.savedLevel;
const readPending: EditorReader = (state) => getPending(state);
const readTool: EditorReader = (state) => state.tool;
const readTransport: EditorReader = (state) => state.playhead.transport;
const readTimeMs: EditorReader = (state) => state.playhead.currentTimeMs;
const readPlayer: EditorReader = (state) => state.player;
const readHoveredLaneCount: EditorReader = (state) => getHoveredLaneCount(state);
const readHoveredTool: EditorReader = (state) => getHoveredTool(state);
const readCanSave: EditorReader = (state) => canSave(state);
const readCanTestPlay: EditorReader = (state) => canTestPlay(state);
const readCanDelete: EditorReader = (state) => canDeleteSelected(state);
const readCanClear: EditorReader = (state) => canClearNotes(state);

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
  status: [readPhaseKind, readNotes, readPending, readSavedNotes, readLevel, readSavedLevel],
  confirm: [readPending, readNotes],
  panel: [readNotes, readSelected, readTool],
  restartButton: readButton('restart'),
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
  testPlayButton: [readCanTestPlay, ...readButton('testPlay')],
  deleteButton: [readCanDelete, ...readButton('delete')],
  clearButton: [readCanClear, ...readButton('clear')],
  confirmButtons: [...readButton('confirmCancel'), ...readButton('confirmAccept')],
  levelControl: [readLevel, readPhaseKind, ...readButton('levelDown'), ...readButton('levelUp')],
};

const DISABLEABLE_BUTTONS: readonly EditorButton[] = [
  'save',
  'testPlay',
  'delete',
  'clear',
  'levelDown',
  'levelUp',
];
const NO_NOTES: readonly Note[] = [];

export function withDraft(session: EditorSession, draft: ChartDraft): EditorSession {
  if (session.draft === draft) {
    return session;
  }
  return {
    ...session,
    draft,
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

function decideNavigation(state: ChartEditorState, navigation: Navigation): NavigationDecision {
  const { phase } = state;
  // 확인 팝업이 열린 동안 닿는 이동 요청은 뒤로(leave)뿐이고, 다시 누르면 팝업을 닫는다.
  if (phase.kind === 'confirming') {
    return {
      kind: 'cancelPending',
      session: phase.session,
    };
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

/** 확인 팝업을 띄우기 전에 진행 중인 drag 를 거두므로, 취소 뒤에 만들다 만 Hold 가 남지 않는다. */
export function requestNavigation(state: ChartEditorState, navigation: Navigation): NavigationStep {
  const decision = decideNavigation(state, navigation);
  switch (decision.kind) {
    case 'ignore':
      return {
        state,
        follow: NO_FOLLOW,
      };
    case 'cancelPending':
      return {
        state: withEditing(state, decision.session),
        follow: NO_FOLLOW,
      };
    case 'proceed':
      return proceed(state, navigation);
    case 'settle':
      return {
        state: withSession(state, decision.session),
        follow: NO_FOLLOW,
      };
    case 'settleAndProceed':
      return proceed(withSession(state, decision.session), navigation);
    case 'confirm':
      return {
        state: withPending(state, decision.session, navigation),
        follow: NO_FOLLOW,
      };
  }
}

export function acceptPending(state: ChartEditorState): NavigationStep {
  const { phase } = state;
  if (phase.kind !== 'confirming') {
    return {
      state,
      follow: NO_FOLLOW,
    };
  }
  const { session, pending } = phase;
  switch (pending.kind) {
    case 'clearNotes':
      return {
        state: withEditing(
          state,
          recordEdit(withDraft(session, clearNotes(session.draft)), session.draft),
        ),
        follow: NO_FOLLOW,
      };
    case 'select':
    case 'leave':
      return proceed(withEditing(state, session), pending);
    case 'saveFailed':
    case 'saveConflict':
    case 'invalidChart':
    case 'testPlayUnsaved':
    case 'testPlayNoChart':
      return {
        state: withEditing(state, session),
        follow: NO_FOLLOW,
      };
  }
}

function proceed(state: ChartEditorState, navigation: Navigation): NavigationStep {
  const { song } = getSelection(state);
  if (navigation.kind === 'leave') {
    return {
      state,
      follow: {
        kind: 'leave',
        songId: song.id,
      },
    };
  }
  // 레인 수·난이도만 바뀌면 같은 음원이므로 player 를 유지하고, 보던 위치에서 이어 편집한다.
  const isSameSong = song.id === navigation.song.id;
  return openSelection(
    isSameSong
      ? state
      : {
          ...state,
          player: { kind: 'loading' },
        },
    {
      song: navigation.song,
      laneCount: navigation.laneCount,
      difficulty: navigation.difficulty,
    },
    isSameSong ? state.playhead.currentTimeMs : null,
  );
}

export function openSelection(
  state: ChartEditorState,
  selection: Selection,
  keptTimeMs: number | null,
): NavigationStep {
  const { song, laneCount, difficulty } = selection;
  const playhead = createPlayhead(keptTimeMs ?? song.gameStartMs);
  // 에디터는 채보가 없는 레인 수·난이도도 고를 수 있으므로 여기서 chart id 유무로 새 draft 와 로드를 가른다.
  const listed = song.charts[laneCount]?.[difficulty];
  if (listed === undefined) {
    return {
      state: {
        ...state,
        phase: startEditing(createEmptyDraft(song, laneCount, difficulty)),
        playhead,
      },
      follow: NO_FOLLOW,
    };
  }
  const loading = {
    kind: 'loading',
    selection,
  } as const;
  return {
    state: {
      ...state,
      phase: loading,
      playhead,
    },
    follow: {
      kind: 'loadChart',
      chart: {
        song,
        laneCount,
        difficulty,
        chartId: listed.id,
        level: listed.level,
      },
      loading,
      keptTimeMs,
    },
  };
}

export function startEditing(draft: ChartDraft): EditPhase {
  return {
    kind: 'editing',
    session: {
      id: {},
      draft,
      gesture: NO_GESTURE,
      saveProgress: { kind: 'idle' },
      undoStack: [],
    },
  };
}

function withEditing(state: ChartEditorState, session: EditorSession): ChartEditorState {
  return {
    ...state,
    phase: {
      kind: 'editing',
      session,
    },
  };
}

/** 확인 팝업이 떠 있는 동안 끝난 저장도 세션에 반영하되 팝업은 그대로 둔다. */
export function withSession(state: ChartEditorState, session: EditorSession): ChartEditorState {
  const { phase } = state;
  if (phase.kind !== 'editing' && phase.kind !== 'confirming') {
    throw new Error(`Editor session cannot change in phase: ${phase.kind}`);
  }
  if (phase.session === session) {
    return state;
  }
  return {
    ...state,
    phase: {
      ...phase,
      session,
    },
  };
}

export function withPending(
  state: ChartEditorState,
  session: EditorSession,
  pending: PendingAction,
): ChartEditorState {
  return {
    ...state,
    phase: {
      kind: 'confirming',
      session,
      pending,
    },
    playhead: pausePlayback(state.playhead),
  };
}

/** 레벨 변경은 Ctrl+Z 되돌리기 기록에 넣지 않는다. 되돌리기는 노트 편집만 되돌린다. */
export function withLevel(state: ChartEditorState, level: ChartLevel): ChartEditorState {
  const session = getEditableSession(state);
  return session === null
    ? state
    : withSession(state, withDraft(session, setDraftLevel(session.draft, level)));
}

export function removeSelectedNote(state: ChartEditorState): ChartEditorState {
  const session = getEditableSession(state);
  return session === null
    ? state
    : withSession(
        state,
        recordEdit(withDraft(session, deleteSelectedNote(session.draft)), session.draft),
      );
}

export function seekTo(state: ChartEditorState, targetMs: number): ChartEditorState {
  const selection = getActiveSelection(state);
  if (selection === null) {
    return state;
  }
  const playhead = seekPlayback(state.playhead, selection.song, targetMs);
  return playhead === state.playhead
    ? state
    : {
        ...state,
        playhead,
      };
}

function isSelected(selection: Selection, navigation: Navigation): boolean {
  return (
    navigation.kind === 'select' &&
    selection.song.id === navigation.song.id &&
    selection.laneCount === navigation.laneCount &&
    selection.difficulty === navigation.difficulty
  );
}

export function getSession(state: ChartEditorState): EditorSession | null {
  const { phase } = state;
  return phase.kind === 'editing' || phase.kind === 'confirming' ? phase.session : null;
}

export function getEditableSession(state: ChartEditorState): EditorSession | null {
  const { phase } = state;
  return phase.kind === 'editing' ? phase.session : null;
}

export function getSelection(state: ChartEditorState): Selection {
  const { phase } = state;
  switch (phase.kind) {
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
  const session = getSession(state);
  return session !== null && session.draft.notes.length > 0;
}

export function canTestPlay(state: ChartEditorState): boolean {
  const { phase } = state;
  return phase.kind === 'editing' && phase.session.saveProgress.kind !== 'saving';
}

export function decideTestPlay({ draft }: EditorSession): TestPlayDecision {
  if (isDraftDirty(draft)) {
    return {
      kind: 'notice',
      notice: { kind: 'testPlayUnsaved' },
    };
  }
  const chart = findChart(draft.song, draft.laneCount, draft.difficulty);
  return chart === undefined
    ? {
        kind: 'notice',
        notice: { kind: 'testPlayNoChart' },
      }
    : {
        kind: 'start',
        chart,
      };
}

export function canSave(state: ChartEditorState): boolean {
  const { phase } = state;
  return (
    phase.kind === 'editing' &&
    phase.session.saveProgress.kind !== 'saving' &&
    isDraftDirty(phase.session.draft)
  );
}

export function getEditorStatus(state: ChartEditorState): EditorStatus {
  const { phase } = state;
  switch (phase.kind) {
    case 'loading':
      return { kind: 'loading' };
    case 'loadFailed':
      return { kind: 'loadFailed' };
    case 'editing':
    case 'confirming':
      break;
  }
  return isDraftDirty(phase.session.draft) ? { kind: 'unsaved' } : { kind: 'none' };
}

export function getChangedRegions(
  previous: ChartEditorState | null,
  next: ChartEditorState,
): readonly EditorRegion[] {
  if (previous === null) {
    return filterChangedRegions(REGION_SOURCES, null, next);
  }
  const before = getSession(previous);
  const after = getSession(next);
  const isSessionChanged =
    previous.phase !== next.phase && (before === null || after === null || before.id !== after.id);
  const regions = filterChangedRegions(REGION_SOURCES, isSessionChanged ? null : previous, next);
  // 도구 표시기는 채보가 바뀌어도 진행 중인 이동을 끊지 않도록 도구가 바뀔 때만 칠한다.
  return regions.filter((region) => region !== 'toolIndicator' || previous.tool !== next.tool);
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
  const hasChart = getAvailableDifficulties(selection.song, selection.laneCount).includes(
    difficulty,
  );
  if (selection.difficulty === difficulty) {
    return hasChart ? 'selectedWithChart' : 'selectedWithoutChart';
  }
  return hasChart ? 'withChart' : 'withoutChart';
}

export function stepLevel(level: ChartLevel, direction: ListDirection): ChartLevel {
  return stepItem(CHART_LEVELS, level, direction);
}

export function parseLevelInput(text: string): ChartLevel | undefined {
  const trimmed = text.trim();
  // Number('') 는 0 이라 값 집합 밖으로 떨어진다.
  const value = Number(trimmed);
  return CHART_LEVELS.find((level) => level === value);
}

export function getLevelControl(state: ChartEditorState): {
  readonly level: ChartLevel | null;
  readonly isEnabled: boolean;
} {
  const session = getSession(state);
  return {
    level: session?.draft.level ?? null,
    isEnabled: state.phase.kind === 'editing',
  };
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

export type EditorKeyCommand =
  | 'undo'
  | 'confirmPending'
  | 'togglePlayback'
  | 'deleteSelected'
  | 'back'
  | 'blurLevelInput'
  | 'cancelLevelInput';

export function readEditorKey(
  event: Pick<KeyboardEvent, 'code' | 'repeat' | 'ctrlKey' | 'metaKey' | 'shiftKey'>,
  isLevelInputFocused: boolean,
): EditorKeyCommand | null {
  const action = readMenuAction(event);
  if (isLevelInputFocused) {
    switch (action) {
      case 'confirm':
        return 'blurLevelInput';
      case 'back':
        return 'cancelLevelInput';
      default:
        return null;
    }
  }
  if (event.code === 'KeyZ' && (event.ctrlKey || event.metaKey) && !event.shiftKey) {
    return 'undo';
  }
  if (action === 'confirm') {
    return 'confirmPending';
  }
  if (event.code === 'Space') {
    // 누르고 있는 동안의 반복 입력으로 재생과 일시정지가 번갈아 바뀌지 않게 한다.
    return event.repeat ? null : 'togglePlayback';
  }
  if (event.code === 'Delete' || event.code === 'Backspace') {
    return 'deleteSelected';
  }
  return action === 'back' ? 'back' : null;
}

export function getPlayButtonIcon(state: ChartEditorState): 'play' | 'pause' {
  return getTransport(state).kind === 'paused' ? 'play' : 'pause';
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

// 첫 그림의 레인 수 표시기는 처음 놓이는 것이라 옮기지 않고 바로 놓는다.
export function getLaneCountMotion(previous: ChartEditorState | null): 'snap' | 'slide' {
  return previous === null ? 'snap' : 'slide';
}

// 도구는 처음부터 값이 있으므로 바뀐 때만 옮기고, 같은 도구를 다시 칠하는 첫 그림은 바로 놓는다.
export function getToolMotion(
  previous: ChartEditorState | null,
  next: ChartEditorState,
): 'snap' | 'slide' {
  return previous === null || previous.tool === next.tool ? 'snap' : 'slide';
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
    case 'testPlay':
      return canTestPlay(state);
    case 'delete':
      return canDeleteSelected(state);
    case 'clear':
      return canClearNotes(state);
    case 'levelDown':
    case 'levelUp': {
      const { level, isEnabled } = getLevelControl(state);
      return (
        isEnabled &&
        level !== null &&
        stepLevel(level, button === 'levelUp' ? 'next' : 'previous') !== level
      );
    }
    case 'confirmCancel':
    case 'confirmAccept':
    case 'back':
    case 'previousSong':
    case 'nextSong':
    case 'restart':
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
