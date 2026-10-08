import type { RhythmClock } from '../../audio/RhythmClock.js';
import type { YouTubePlayerState } from '../../audio/YouTubePlayer.js';
import { InvalidChartError, parseChart } from '../../data/chartSchema.js';
import type { Song } from '../../data/songs.js';
import type { Chart, Difficulty, Lane, Note } from '../../rhythm/types.js';
import {
  addNote,
  clearNotes,
  completeSave,
  createDraft,
  createEmptyDraft,
  deleteSelectedNote,
  findInvalidNote,
  isDraftDirty,
  moveSelectedNote,
  resizeSelectedHold,
  restoreNotes,
  selectNote,
  toChart,
} from './chartDraft.js';
import type { ChartDraft } from './chartDraft.js';
import { getPlayStartMs, pickNote, snapStartTimeMs, toEditTimeMs } from './editorTimeline.js';

export type EditTool = 'tap' | 'hold';

export type EditPhase =
  | { readonly kind: 'empty' }
  | { readonly kind: 'loading'; readonly song: Song; readonly difficulty: Difficulty }
  | { readonly kind: 'loadFailed'; readonly song: Song; readonly difficulty: Difficulty }
  | { readonly kind: 'editing'; readonly draft: ChartDraft };

/** pointer down 에서 시작해 pointer up 에서 끝나는 timeline drag. */
export type PointerGesture =
  | { readonly kind: 'none' }
  | { readonly kind: 'move'; readonly grabOffsetMs: number }
  | { readonly kind: 'resizeHold' }
  | { readonly kind: 'createHold'; readonly before: ChartDraft; readonly startMs: number };

/** 미저장 변경이 있으면 확인 팝업이 DISCARD 를 기다리는 동작. */
export type Navigation =
  | { readonly kind: 'select'; readonly song: Song; readonly difficulty: Difficulty }
  | { readonly kind: 'leave' };

/** 확인 팝업이 기다리는 동작. 전체 삭제는 되돌릴 수 없으므로 저장 여부와 관계없이 묻는다. */
export type PendingAction = Navigation | { readonly kind: 'clearNotes' };

/** 마지막 Save 의 결과. 선택이 바뀌거나 notes 가 편집되면 idle 로 돌아간다(saving 은 끝날 때까지 유지). */
export type SaveResult =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'invalid'; readonly reason: string };

/** 재생 시각은 clock 에서 읽어 currentTimeMs 에 반영한다. transport 가 따로 시각을 갖지 않는다. */
export type Transport =
  | { readonly kind: 'paused' }
  | { readonly kind: 'starting'; readonly clock: RhythmClock }
  | { readonly kind: 'playing'; readonly clock: RhythmClock };

export interface ChartEditorState {
  /** 현재 곡·난이도는 이 값에서만 읽는다. */
  readonly phase: EditPhase;
  /** 선택을 적용할 때마다 새로 만든다. 비동기 결과는 시작 때 잡은 토큰이 아직 현재일 때만 반영한다. */
  readonly selectionToken: object | null;
  readonly currentTimeMs: number;
  readonly tool: EditTool;
  readonly gesture: PointerGesture;
  /** null 이 아니면 확인 팝업이 열려 있고, 입력 함수는 아무것도 바꾸지 않는다. */
  readonly pending: PendingAction | null;
  readonly saveResult: SaveResult;
  readonly transport: Transport;
}

/** 검증을 통과한 chart 의 저장 요청. 결과는 token 이 아직 현재일 때만 반영한다. */
export interface SaveRequest {
  readonly token: object;
  readonly song: Song;
  readonly chart: Chart;
  readonly savedNotes: readonly Note[];
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

const NO_GESTURE: PointerGesture = { kind: 'none' };
const IDLE: SaveResult = { kind: 'idle' };
const PAUSED: Transport = { kind: 'paused' };

export function createEditorState(): ChartEditorState {
  return {
    phase: { kind: 'empty' },
    selectionToken: null,
    currentTimeMs: 0,
    tool: 'tap',
    gesture: NO_GESTURE,
    pending: null,
    saveResult: IDLE,
    transport: PAUSED,
  };
}

export function getSelection(
  state: ChartEditorState,
): { song: Song; difficulty: Difficulty } | null {
  const { phase } = state;
  switch (phase.kind) {
    case 'empty':
      return null;
    case 'loading':
    case 'loadFailed':
      return { song: phase.song, difficulty: phase.difficulty };
    case 'editing':
      return { song: phase.draft.song, difficulty: phase.draft.difficulty };
  }
}

export function hasUnsavedChanges(state: ChartEditorState): boolean {
  return state.phase.kind === 'editing' && isDraftDirty(state.phase.draft);
}

/** 진행 중인 drag·재생·저장 결과는 이전 선택에 대한 것이므로 이어 가지 않는다. */
export function applySelection(
  state: ChartEditorState,
  song: Song,
  difficulty: Difficulty,
): ChartEditorState {
  return {
    ...state,
    selectionToken: {},
    currentTimeMs: song.gameStartMs,
    gesture: NO_GESTURE,
    pending: null,
    saveResult: IDLE,
    transport: PAUSED,
    phase:
      song.chartIds[difficulty] === undefined
        ? { kind: 'editing', draft: createEmptyDraft(song, difficulty) }
        : { kind: 'loading', song, difficulty },
  };
}

export function clearSelection(state: ChartEditorState): ChartEditorState {
  if (
    state.phase.kind === 'empty' &&
    state.selectionToken === null &&
    state.gesture.kind === 'none' &&
    state.pending === null &&
    state.saveResult.kind === 'idle' &&
    state.transport.kind === 'paused'
  ) {
    return state;
  }
  return {
    ...state,
    phase: { kind: 'empty' },
    selectionToken: null,
    gesture: NO_GESTURE,
    pending: null,
    saveResult: IDLE,
    transport: PAUSED,
  };
}

export function completeLoad(
  state: ChartEditorState,
  token: object,
  chart: Chart,
): ChartEditorState {
  const { phase } = state;
  if (state.selectionToken !== token || phase.kind !== 'loading') {
    return state;
  }
  return { ...state, phase: { kind: 'editing', draft: createDraft(phase.song, chart) } };
}

export function failLoad(state: ChartEditorState, token: object): ChartEditorState {
  const { phase } = state;
  if (state.selectionToken !== token || phase.kind !== 'loading') {
    return state;
  }
  return {
    ...state,
    phase: { kind: 'loadFailed', song: phase.song, difficulty: phase.difficulty },
  };
}

/** 확인 팝업을 띄우기 전에 진행 중인 drag 를 거두므로, 취소 뒤에 만들다 만 Hold 가 남지 않는다. */
export function requestNavigation(
  state: ChartEditorState,
  navigation: Navigation,
): { state: ChartEditorState; proceed: Navigation | null } {
  if (state.pending !== null) {
    return { state, proceed: null };
  }
  const settled = finishGesture(state);
  if (navigation.kind === 'select' && settled.phase.kind !== 'loadFailed') {
    const selection = getSelection(settled);
    if (
      selection !== null &&
      selection.song.id === navigation.song.id &&
      selection.difficulty === navigation.difficulty
    ) {
      return { state: settled, proceed: null };
    }
  }
  if (hasUnsavedChanges(settled)) {
    return { state: { ...settled, pending: navigation }, proceed: null };
  }
  return { state: settled, proceed: navigation };
}

function finishGesture(state: ChartEditorState): ChartEditorState {
  const { gesture, phase } = state;
  if (gesture.kind === 'none') {
    return state;
  }
  const ended = { ...state, gesture: NO_GESTURE };
  if (gesture.kind !== 'createHold' || phase.kind !== 'editing') {
    return ended;
  }
  return withDraft(ended, restoreNotes(phase.draft, gesture.before));
}

/** 전체 삭제는 여기서 적용하고, 화면 이동은 호출자가 진행하도록 돌려준다. */
export function confirmPending(state: ChartEditorState): {
  state: ChartEditorState;
  proceed: Navigation | null;
} {
  const { pending, phase } = state;
  if (pending === null) {
    return { state, proceed: null };
  }
  const closed = { ...state, pending: null };
  if (pending.kind !== 'clearNotes') {
    return { state: closed, proceed: pending };
  }
  if (phase.kind !== 'editing') {
    throw new Error('Clearing notes can be pending only while editing a draft');
  }
  return { state: withDraft(closed, clearNotes(phase.draft)), proceed: null };
}

/** 지울 노트가 없으면 묻지 않는다. */
export function requestClearNotes(state: ChartEditorState): ChartEditorState {
  if (state.pending !== null || state.phase.kind !== 'editing') {
    return state;
  }
  const settled = finishGesture(state);
  if (settled.phase.kind !== 'editing' || settled.phase.draft.notes.length === 0) {
    return settled;
  }
  return { ...settled, pending: { kind: 'clearNotes' } };
}

export function cancelPending(state: ChartEditorState): ChartEditorState {
  return state.pending === null ? state : { ...state, pending: null };
}

export function startGesture(
  state: ChartEditorState,
  lane: Lane,
  pointerTimeMs: number,
  limits: { snapThresholdMs: number; pickToleranceMs: number },
): ChartEditorState {
  const { phase } = state;
  if (state.pending !== null || phase.kind !== 'editing') {
    return state;
  }
  const { draft } = phase;
  const hit = pickNote(draft.notes, lane, pointerTimeMs, limits.pickToleranceMs);
  if (hit !== null) {
    const gesture: PointerGesture =
      hit.part === 'end'
        ? { kind: 'resizeHold' }
        : { kind: 'move', grabOffsetMs: pointerTimeMs - hit.note.timeMs };
    return withDraft({ ...state, gesture }, selectNote(draft, hit.note));
  }
  const startMs = snapStart(
    state,
    draft,
    toEditTimeMs(pointerTimeMs, draft.song),
    lane,
    null,
    limits.snapThresholdMs,
  );
  if (state.tool === 'tap') {
    return withDraft(
      { ...state, gesture: { kind: 'move', grabOffsetMs: 0 } },
      addNote(draft, { type: 'tap', timeMs: startMs, lane }),
    );
  }
  return withDraft(
    { ...state, gesture: { kind: 'createHold', before: draft, startMs } },
    addNote(draft, { type: 'hold', timeMs: startMs, endTimeMs: startMs + 1, lane }),
  );
}

export function continueGesture(
  state: ChartEditorState,
  lane: Lane,
  pointerTimeMs: number,
  snapThresholdMs: number,
): ChartEditorState {
  const { gesture, phase } = state;
  if (gesture.kind === 'none' || state.pending !== null || phase.kind !== 'editing') {
    return state;
  }
  const { draft } = phase;
  if (gesture.kind === 'move') {
    const startMs = snapStart(
      state,
      draft,
      toEditTimeMs(pointerTimeMs - gesture.grabOffsetMs, draft.song),
      lane,
      draft.selected,
      snapThresholdMs,
    );
    return withDraft(state, moveSelectedNote(draft, startMs, lane));
  }
  return withDraft(state, resizeSelectedHold(draft, toEditTimeMs(pointerTimeMs, draft.song)));
}

/** 끝이 시작보다 늦지 않은 Hold 생성은 그 Hold 만 거둔다. drag 중 끝난 저장 결과는 유지한다. */
export function endGesture(state: ChartEditorState, pointerTimeMs: number): ChartEditorState {
  const { gesture, phase } = state;
  if (state.pending !== null || gesture.kind === 'none') {
    return state;
  }
  const ended = { ...state, gesture: NO_GESTURE };
  if (
    gesture.kind !== 'createHold' ||
    phase.kind !== 'editing' ||
    toEditTimeMs(pointerTimeMs, phase.draft.song) > gesture.startMs
  ) {
    return ended;
  }
  return withDraft(ended, restoreNotes(phase.draft, gesture.before));
}

function snapStart(
  state: ChartEditorState,
  draft: ChartDraft,
  timeMs: number,
  lane: Lane,
  movingNote: Note | null,
  thresholdMs: number,
): number {
  return snapStartTimeMs(timeMs, lane, {
    notes: draft.notes,
    movingNote,
    playheadTimeMs: state.currentTimeMs,
    thresholdMs,
  });
}

export function selectTool(state: ChartEditorState, tool: EditTool): ChartEditorState {
  if (state.pending !== null || state.tool === tool) {
    return state;
  }
  return { ...state, tool };
}

export function deleteSelected(state: ChartEditorState): ChartEditorState {
  if (state.pending !== null || state.phase.kind !== 'editing') {
    return state;
  }
  return withDraft(state, deleteSelectedNote(state.phase.draft));
}

/** 편집 결과가 같은 draft 이면 상태를 바꾸지 않는다. 지난 저장 결과는 편집 전 notes 에 대한 것이다. */
function withDraft(state: ChartEditorState, draft: ChartDraft): ChartEditorState {
  const { phase } = state;
  if (phase.kind !== 'editing' || phase.draft === draft) {
    return state;
  }
  const saveResult =
    phase.draft.notes !== draft.notes && state.saveResult.kind !== 'saving'
      ? IDLE
      : state.saveResult;
  return { ...state, phase: { kind: 'editing', draft }, saveResult };
}

/** YouTube 는 재생 중 seek 뒤 상태 이벤트를 항상 보내지 않으므로, 재생 재개는 Play 경로 하나로만 한다. */
export function seek(state: ChartEditorState, targetMs: number): ChartEditorState {
  const selection = getSelection(state);
  if (state.pending !== null || selection === null) {
    return state;
  }
  const currentTimeMs = toEditTimeMs(targetMs, selection.song);
  if (currentTimeMs === state.currentTimeMs && state.transport.kind === 'paused') {
    return state;
  }
  return { ...state, currentTimeMs, transport: PAUSED };
}

export function canStartPlayback(state: ChartEditorState): boolean {
  return (
    state.pending === null && state.phase.kind === 'editing' && state.transport.kind === 'paused'
  );
}

export function startPlayback(state: ChartEditorState, clock: RhythmClock): ChartEditorState {
  if (!canStartPlayback(state) || state.phase.kind !== 'editing') {
    return state;
  }
  return {
    ...state,
    currentTimeMs: getPlayStartMs(state.currentTimeMs, state.phase.draft.song),
    transport: { kind: 'starting', clock },
  };
}

export function requestPause(state: ChartEditorState): ChartEditorState {
  return state.pending === null ? pausePlayback(state) : state;
}

/** player 오류처럼 확인 바와 무관하게 멈춰야 할 때 쓴다. currentTimeMs 는 마지막 값을 유지한다. */
export function pausePlayback(state: ChartEditorState): ChartEditorState {
  return state.transport.kind === 'paused' ? state : { ...state, transport: PAUSED };
}

export function handlePlayerState(
  state: ChartEditorState,
  playerState: YouTubePlayerState,
): ChartEditorState {
  const { transport } = state;
  if (playerState === 'playing' && transport.kind === 'starting') {
    return { ...state, transport: { kind: 'playing', clock: transport.clock } };
  }
  if (playerState === 'paused' || playerState === 'ended') {
    return pausePlayback(state);
  }
  return state;
}

export function advancePlayback(state: ChartEditorState, playbackMs: number): ChartEditorState {
  const { phase } = state;
  if (state.transport.kind !== 'playing') {
    return state;
  }
  if (phase.kind !== 'editing') {
    throw new Error('Transport is playing without a draft');
  }
  const { song } = phase.draft;
  if (playbackMs >= song.gameEndMs) {
    return { ...state, currentTimeMs: song.gameEndMs, transport: PAUSED };
  }
  const currentTimeMs = toEditTimeMs(playbackMs, song);
  return currentTimeMs === state.currentTimeMs ? state : { ...state, currentTimeMs };
}

/** 미저장 변경이 있고 진행 중인 저장이 없을 때만 SAVE 를 누를 수 있다. */
export function canSave(state: ChartEditorState): boolean {
  return state.pending === null && state.saveResult.kind !== 'saving' && hasUnsavedChanges(state);
}

/** 검증을 통과한 chart 만 저장을 요청한다. 저장 중 편집은 허용하며 저장 기준 notes 가 dirty 를 지킨다. */
export function startSave(state: ChartEditorState): {
  state: ChartEditorState;
  request: SaveRequest | null;
} {
  const { phase, selectionToken } = state;
  if (state.pending !== null || phase.kind !== 'editing' || state.saveResult.kind === 'saving') {
    return { state, request: null };
  }
  if (selectionToken === null) {
    throw new Error('Editing a draft without a selection token');
  }
  const { draft } = phase;
  let chart: Chart;
  try {
    chart = parseChart(toChart(draft), draft.song, draft.difficulty);
  } catch (error) {
    if (!(error instanceof InvalidChartError)) {
      throw error;
    }
    const invalid: ChartEditorState = {
      ...state,
      saveResult: { kind: 'invalid', reason: error.message },
    };
    const note = findInvalidNote(draft, error);
    if (note === null) {
      return { state: invalid, request: null };
    }
    return { state: seek(withDraft(invalid, selectNote(draft, note)), note.timeMs), request: null };
  }
  return {
    state: { ...state, saveResult: { kind: 'saving' } },
    request: { token: selectionToken, song: draft.song, chart, savedNotes: draft.notes },
  };
}

export function finishSave(
  state: ChartEditorState,
  request: SaveRequest,
  song: Song,
): ChartEditorState {
  const { phase } = state;
  if (state.selectionToken !== request.token || phase.kind !== 'editing') {
    return state;
  }
  return {
    ...state,
    phase: { kind: 'editing', draft: completeSave(phase.draft, request.savedNotes, song) },
    saveResult: { kind: 'saved' },
  };
}

export function failSave(state: ChartEditorState, token: object): ChartEditorState {
  return state.selectionToken === token ? { ...state, saveResult: { kind: 'failed' } } : state;
}

export function getEditorStatus(state: ChartEditorState): EditorStatus {
  switch (state.phase.kind) {
    case 'empty':
      return { kind: 'noSongs' };
    case 'loading':
      return { kind: 'loading' };
    case 'loadFailed':
      return { kind: 'loadFailed' };
    case 'editing':
      break;
  }
  const { saveResult } = state;
  switch (saveResult.kind) {
    case 'saving':
      return { kind: 'saving' };
    case 'saved':
      return { kind: 'saved' };
    case 'failed':
      return { kind: 'saveFailed' };
    case 'invalid':
      return { kind: 'invalid', reason: saveResult.reason };
    case 'idle':
      return hasUnsavedChanges(state) ? { kind: 'unsaved' } : { kind: 'none' };
  }
}

/** 확인창이 열려 있으면 장식을 모두 숨긴다. */
export function getEditorDecorations(state: ChartEditorState): EditorDecorations {
  return { isDividerGlintVisible: state.pending === null };
}
