import type { YouTubePlayerState } from '../../audio/YouTubePlayer.js';
import { InvalidChartError, parseChart } from '../../data/chartSchema.js';
import type { ChartRef, Song } from '../../data/songs.js';
import { requireDefined } from '../../invariant.js';
import type { Chart, Difficulty, Lane } from '../../rhythm/types.js';
import { clamp } from '../../range.js';
import {
  clearNotes,
  completeSave,
  createDraft,
  createEmptyDraft,
  deleteSelectedNote,
  findInvalidNote,
  isDraftDirty,
  selectNote,
  toChart,
} from './chartDraft.js';
import type { ChartDraft } from './chartDraft.js';
import { getPending, getSelection, getSession, withDraft } from './chartEditorState.js';
import type {
  ChartEditorState,
  EditPhase,
  EditorSession,
  Navigation,
  PendingAction,
  Selection,
} from './chartEditorState.js';
import {
  cancelGesture,
  continueGesture,
  endGesture,
  NO_GESTURE,
  startGesture,
} from './chartGesture.js';
import type { EditTool, GestureLimits } from './chartGesture.js';
import {
  advancePlayback,
  createPlayhead,
  followPlayerState,
  pausePlayback,
  seekPlayback,
  togglePlayback,
} from './chartPlayback.js';
import type { PlaybackPlayer, Playhead } from './chartPlayback.js';
import { getOpeningTimeMs } from './editorTimeline.js';

export interface ChartCatalog {
  loadChart(ref: ChartRef): Promise<Chart>;
  saveChart(song: Song, chart: Chart): Promise<string>;
}

export interface EditList {
  readonly songs: readonly Song[];
  applySavedChart(songId: string, difficulty: Difficulty, chartId: string): Song | undefined;
}

interface EditorScreen {
  changeSong(song: Song): void;
  leave(focusedSongId: string | null): void;
  render(previous: ChartEditorState, next: ChartEditorState): void;
}

interface EditorTiming {
  readonly openingLeadMs: number;
  readonly snapThresholdMs: number;
  readonly pickToleranceMs: number;
}

const INITIAL_STATE: ChartEditorState = {
  phase: { kind: 'empty' },
  tool: 'tap',
  playhead: createPlayhead(0),
};

export class ChartEditorController {
  private current: ChartEditorState = INITIAL_STATE;

  constructor(
    private readonly catalog: ChartCatalog,
    private readonly list: EditList,
    private readonly player: PlaybackPlayer,
    private readonly screen: EditorScreen,
    private readonly timing: EditorTiming,
  ) {}

  get state(): ChartEditorState {
    return this.current;
  }

  /** 씬이 닫힌 뒤 끝나는 로드·저장 결과가 반영되지 않도록 세션을 버린다. 화면이 없으므로 다시 그리지 않는다. */
  close(): void {
    this.current = INITIAL_STATE;
  }

  select(song: Song, difficulty: Difficulty): void {
    this.requestNavigation({
      kind: 'select',
      song,
      difficulty,
    });
  }

  back(): void {
    if (getPending(this.current) !== null) {
      this.cancelPending();
      return;
    }
    this.requestNavigation({ kind: 'leave' });
  }

  moveSong(delta: number): void {
    this.selectInList(delta, null);
  }

  selectDifficulty(difficulty: Difficulty): void {
    this.selectInList(0, difficulty);
  }

  confirmPending(): void {
    const { phase } = this.current;
    if (phase.kind !== 'confirming') {
      return;
    }
    const { session, pending } = phase;
    if (pending.kind === 'clearNotes') {
      this.edit(withDraft(session, clearNotes(session.draft)));
      return;
    }
    this.edit(session);
    this.proceed(pending);
  }

  cancelPending(): void {
    const { phase } = this.current;
    if (phase.kind === 'confirming') {
      this.edit(phase.session);
    }
  }

  requestClearNotes(): void {
    const session = this.getEditableSession();
    if (session === null) {
      return;
    }
    const settled = settleGesture(session);
    if (settled.draft.notes.length === 0) {
      this.setSession(settled);
      return;
    }
    this.confirm(settled, { kind: 'clearNotes' });
  }

  /** 저장 중에도 편집할 수 있고, 끝나면 요청 때의 notes 만 저장 기준으로 삼으므로 그 뒤의 편집은 미저장으로 남는다. */
  async save(): Promise<void> {
    const session = this.getEditableSession();
    if (session === null || session.saveResult.kind === 'saving') {
      return;
    }
    const { draft } = session;
    let chart: Chart;
    try {
      chart = parseChart(toChart(draft), draft.song, draft.difficulty);
    } catch (error) {
      if (!(error instanceof InvalidChartError)) {
        throw error;
      }
      const invalid: EditorSession = {
        ...session,
        saveResult: {
          kind: 'invalid',
          reason: error.message,
        },
      };
      const note = findInvalidNote(draft, error);
      if (note === null) {
        this.setSession(invalid);
        return;
      }
      this.setState({
        ...this.current,
        phase: {
          kind: 'editing',
          session: withDraft(invalid, selectNote(draft, note)),
        },
        playhead: seekPlayback(this.current.playhead, draft.song, note.timeMs),
      });
      return;
    }
    this.setSession({
      ...session,
      saveResult: { kind: 'saving' },
    });
    const chartId = await this.catalog.saveChart(draft.song, chart).catch((error: unknown) => {
      console.error(
        `Failed to save chart for song ${draft.song.id} difficulty ${draft.difficulty}`,
        error,
      );
      return null;
    });
    // 저장이 겹칠 수 있으므로 요청 때의 스냅샷이 아니라 지금의 편집 목록 곡에 chart id 를 더한다.
    const saved =
      chartId === null
        ? null
        : requireDefined(
            this.list.applySavedChart(draft.song.id, draft.difficulty, chartId),
            'Saved chart song is not in the edit list',
            draft.song.id,
          );
    const current = getSession(this.current);
    if (current?.id !== session.id) {
      return;
    }
    if (saved === null) {
      this.setSession({
        ...current,
        saveResult: { kind: 'failed' },
      });
      return;
    }
    this.setSession({
      ...current,
      draft: completeSave(current.draft, draft.notes, saved),
      saveResult: { kind: 'saved' },
    });
  }

  selectTool(tool: EditTool): void {
    if (getPending(this.current) !== null || this.current.tool === tool) {
      return;
    }
    this.setState({
      ...this.current,
      tool,
    });
  }

  deleteSelected(): void {
    const session = this.getEditableSession();
    if (session !== null) {
      this.setSession(withDraft(session, deleteSelectedNote(session.draft)));
    }
  }

  pointerDown(lane: Lane, pointerTimeMs: number): void {
    const session = this.getEditableSession();
    if (session === null) {
      return;
    }
    const { draft, gesture } = startGesture(
      session.draft,
      this.current.tool,
      {
        lane,
        timeMs: pointerTimeMs,
      },
      this.getGestureLimits(),
    );
    this.setSession({
      ...withDraft(session, draft),
      gesture,
    });
  }

  pointerMove(lane: Lane, pointerTimeMs: number): void {
    const session = this.getEditableSession();
    if (session === null || session.gesture.kind === 'none') {
      return;
    }
    const draft = continueGesture(
      session.draft,
      session.gesture,
      {
        lane,
        timeMs: pointerTimeMs,
      },
      this.getGestureLimits(),
    );
    this.setSession(withDraft(session, draft));
  }

  pointerUp(pointerTimeMs: number): void {
    const session = this.getEditableSession();
    if (session === null || session.gesture.kind === 'none') {
      return;
    }
    this.setSession({
      ...withDraft(session, endGesture(session.draft, session.gesture, pointerTimeMs)),
      gesture: NO_GESTURE,
    });
  }

  seek(targetMs: number): void {
    const selection = getSelection(this.current);
    if (selection === null || getPending(this.current) !== null) {
      return;
    }
    this.setPlayhead(seekPlayback(this.current.playhead, selection.song, targetMs));
  }

  togglePlayback(): void {
    const session = this.getEditableSession();
    if (session !== null) {
      const { song, offsetMs } = session.draft;
      this.setPlayhead(togglePlayback(this.current.playhead, song, offsetMs, this.player));
    }
  }

  handlePlayerState(playerState: YouTubePlayerState): void {
    const playhead = followPlayerState(this.current.playhead, playerState);
    // 멈춘 뒤에 도착한 playing 은 영상만 재생 중이라는 뜻이므로 player 도 다시 멈춘다.
    if (playerState === 'playing' && playhead.transport.kind === 'paused') {
      this.player.pause();
    }
    this.setPlayhead(playhead);
  }

  stopPlayback(): void {
    this.setPlayhead(pausePlayback(this.current.playhead));
  }

  advancePlayback(): void {
    const selection = getSelection(this.current);
    if (selection !== null) {
      this.setPlayhead(advancePlayback(this.current.playhead, selection.song));
    }
  }

  /** 곡 목록은 바뀔 수 있으므로 고를 때마다 다시 읽는다. */
  private selectInList(delta: number, difficulty: Difficulty | null): void {
    const selection = getSelection(this.current);
    if (selection === null || getPending(this.current) !== null) {
      return;
    }
    const songs = this.list.songs;
    if (songs.length === 0) {
      this.enter({ kind: 'empty' }, this.current.playhead.currentTimeMs);
      return;
    }
    const index = songs.findIndex((song) => song.id === selection.song.id);
    if (index === -1) {
      throw new Error(`Selected song is not in the song list: ${selection.song.id}`);
    }
    const song = requireDefined(
      songs[clamp(index + delta, 0, songs.length - 1)],
      'Song list has no song at clamped index',
      index + delta,
    );
    this.select(song, difficulty ?? selection.difficulty);
  }

  /** 확인 팝업을 띄우기 전에 진행 중인 drag 를 거두므로, 취소 뒤에 만들다 만 Hold 가 남지 않는다. */
  private requestNavigation(navigation: Navigation): void {
    const { phase } = this.current;
    if (phase.kind === 'confirming') {
      return;
    }
    const isCurrent = isSelected(getSelection(this.current), navigation);
    if (phase.kind !== 'editing') {
      if (!isCurrent || phase.kind === 'loadFailed') {
        this.proceed(navigation);
      }
      return;
    }
    const settled = settleGesture(phase.session);
    if (!isCurrent && isDraftDirty(settled.draft)) {
      this.confirm(settled, navigation);
      return;
    }
    this.setSession(settled);
    if (!isCurrent) {
      this.proceed(navigation);
    }
  }

  private proceed(navigation: Navigation): void {
    if (navigation.kind === 'leave') {
      this.screen.leave(getSelection(this.current)?.song.id ?? null);
      return;
    }
    void this.open({
      song: navigation.song,
      difficulty: navigation.difficulty,
    });
  }

  private async open(selection: Selection): Promise<void> {
    const { song, difficulty } = selection;
    // 난이도만 바뀌면 같은 음원이므로 player 를 유지한다.
    if (getSelection(this.current)?.song.id !== song.id) {
      this.screen.changeSong(song);
    }
    // 에디터는 채보가 없는 난이도도 고를 수 있으므로 여기서 chart id 유무로 새 draft 와 로드를 가른다.
    const chartId = song.chartIds[difficulty];
    if (chartId === undefined) {
      this.enter(startEditing(createEmptyDraft(song, difficulty)), song.gameStartMs);
      return;
    }
    const loading: EditPhase = {
      kind: 'loading',
      selection,
    };
    this.enter(loading, song.gameStartMs);
    const chart = await this.catalog
      .loadChart({
        song,
        difficulty,
        chartId,
      })
      .catch((error: unknown) => {
        console.error(`Failed to load chart for song ${song.id} difficulty ${difficulty}`, error);
        return null;
      });
    if (this.current.phase !== loading) {
      return;
    }
    if (chart === null) {
      this.enter(
        {
          kind: 'loadFailed',
          selection,
        },
        this.current.playhead.currentTimeMs,
      );
      return;
    }
    const draft = createDraft(song, chart);
    this.enter(startEditing(draft), getOpeningTimeMs(draft.notes, this.timing.openingLeadMs, song));
  }

  private enter(phase: EditPhase, currentTimeMs: number): void {
    this.setState({
      ...this.current,
      phase,
      playhead: createPlayhead(currentTimeMs),
    });
  }

  /** 확인 팝업이 떠 있는 동안 끝난 저장도 세션에 반영하되 팝업은 그대로 둔다. */
  private setSession(session: EditorSession): void {
    const { phase } = this.current;
    if (phase.kind !== 'editing' && phase.kind !== 'confirming') {
      throw new Error(`Editor session cannot change in phase: ${phase.kind}`);
    }
    if (phase.session !== session) {
      this.setPhase({
        ...phase,
        session,
      });
    }
  }

  private edit(session: EditorSession): void {
    this.setPhase({
      kind: 'editing',
      session,
    });
  }

  private confirm(session: EditorSession, pending: PendingAction): void {
    this.setPhase({
      kind: 'confirming',
      session,
      pending,
    });
  }

  private setPhase(phase: EditPhase): void {
    this.setState({
      ...this.current,
      phase,
    });
  }

  private setPlayhead(playhead: Playhead): void {
    if (this.current.playhead !== playhead) {
      this.setState({
        ...this.current,
        playhead,
      });
    }
  }

  /** player 가 스스로 알린 정지 뒤의 pause 는 무해하다. */
  private setState(next: ChartEditorState): void {
    const previous = this.current;
    this.current = next;
    if (
      previous.playhead.transport.kind !== 'paused' &&
      next.playhead.transport.kind === 'paused'
    ) {
      this.player.pause();
    }
    this.screen.render(previous, next);
  }

  private getEditableSession(): EditorSession | null {
    const { phase } = this.current;
    return phase.kind === 'editing' ? phase.session : null;
  }

  private getGestureLimits(): GestureLimits {
    return {
      playheadTimeMs: this.current.playhead.currentTimeMs,
      snapThresholdMs: this.timing.snapThresholdMs,
      pickToleranceMs: this.timing.pickToleranceMs,
    };
  }
}

function startEditing(draft: ChartDraft): EditPhase {
  return {
    kind: 'editing',
    session: {
      id: {},
      draft,
      gesture: NO_GESTURE,
      saveResult: { kind: 'idle' },
    },
  };
}

function settleGesture(session: EditorSession): EditorSession {
  if (session.gesture.kind === 'none') {
    return session;
  }
  return {
    ...withDraft(session, cancelGesture(session.draft, session.gesture)),
    gesture: NO_GESTURE,
  };
}

function isSelected(selection: Selection | null, navigation: Navigation): boolean {
  return (
    navigation.kind === 'select' &&
    selection !== null &&
    selection.song.id === navigation.song.id &&
    selection.difficulty === navigation.difficulty
  );
}
