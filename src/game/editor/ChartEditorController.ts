import type {
  YouTubePlayer,
  YouTubePlayerHandlers,
  YouTubePlayerState,
} from '../../audio/YouTubePlayer.js';
import { RhythmClock } from '../../audio/RhythmClock.js';
import { YouTubeTimeSource } from '../../audio/YouTubeTimeSource.js';
import { InvalidChartError, parseChart } from '../../data/chartSchema.js';
import type { ChartRef, Song } from '../../data/songs.js';
import { requireDefined } from '../../invariant.js';
import type { Chart, Difficulty, LaneCount } from '../../rhythm/types.js';
import { stepItem } from '../../range.js';
import {
  clearNotes,
  completeSave,
  createDraft,
  createEmptyDraft,
  deleteSelectedNote,
  findInvalidNote,
  selectNote,
  toChart,
} from './state/chartDraft.js';
import type { ChartDraft } from './state/chartDraft.js';
import {
  decideNavigation,
  decideTestPlay,
  getActiveSelection,
  getSelection,
  getSession,
  hoverEditorButton,
  hoverSegment,
  pressEditorButton,
  recordEdit,
  releaseEditorButton,
  settleEditorButtons,
  settleGesture,
  undoEdit,
  unhoverEditorButton,
  unhoverSegment,
  withDraft,
  SAVE_FAILURE_NOTICES,
} from './state/chartEditorState.js';
import type {
  ChartEditorState,
  EditorButton,
  EditorPlayerStatus,
  EditPhase,
  EditorSession,
  Navigation,
  PendingAction,
  SaveNotice,
  SegmentHover,
  Selection,
} from './state/chartEditorState.js';
import { continueGesture, endGesture, NO_GESTURE, startGesture } from './state/chartGesture.js';
import type { EditTool, GestureLimits, TimelinePointer } from './state/chartGesture.js';
import {
  advancePlayback,
  createPlayhead,
  followPlayerState,
  pausePlayback,
  seekPlayback,
  startPlayback,
  togglePlayback,
} from './state/chartPlayback.js';
import type { Playhead } from './state/chartPlayback.js';
import { getOpeningTimeMs, getPlayStartMs, toEditTimeMs } from './state/editorTimeline.js';

interface PlaybackPlayer {
  play(fromSec: number): Pick<YouTubeTimeSource, 'getTimeAt'> | null;
  pause(): void;
}

export type ChartSaveOutcome =
  | { readonly kind: 'saved'; readonly chartId: string; readonly revision: string }
  | { readonly kind: 'conflict' };

export interface ChartCatalog {
  loadChart(ref: ChartRef): Promise<{ readonly chart: Chart; readonly revision: string }>;
  saveChart(song: Song, chart: Chart, baseRevision: string | null): Promise<ChartSaveOutcome>;
}

export interface EditList {
  readonly songs: readonly Song[];
  applySavedChart(
    songId: string,
    laneCount: LaneCount,
    difficulty: Difficulty,
    chartId: string,
  ): Song | undefined;
}

export type EditorVideoPlayer = Pick<
  YouTubePlayer,
  'requestPlay' | 'pause' | 'setVolume' | 'destroy'
>;

export interface EditorPlayerPorts {
  readonly players: {
    loadApi(): Promise<void>;
    create(videoId: string, handlers: YouTubePlayerHandlers): EditorVideoPlayer;
  };
  readonly now: () => number;
  readonly frameNow: () => number;
  readonly volume: number;
}

type VideoState =
  | { readonly kind: 'none' }
  | { readonly kind: 'starting'; readonly player: EditorVideoPlayer }
  | {
      readonly kind: 'ready';
      readonly player: EditorVideoPlayer;
      readonly timeSource: YouTubeTimeSource;
    };

interface EditorScreen {
  leave(focusedSongId: string): void;
  render(previous: ChartEditorState | null, next: ChartEditorState): void;
  startTestPlay(chart: ChartRef, startTimeMs: number): void;
}

interface EditorTiming {
  readonly openingLeadMs: number;
  readonly snapThresholdMs: number;
  readonly pickToleranceMs: number;
}

// 닫힌 뒤에는 입력과 늦은 결과를 받지 않는다.
type ScreenState = ChartEditorState | { readonly kind: 'closed'; readonly last: ChartEditorState };

export class ChartEditorController {
  private screenState: ScreenState;
  /** player 이벤트와 늦은 API 로드 결과는 시작 때 잡은 토큰이 아직 현재일 때만 반영한다. */
  private playerToken: object | null = null;
  private video: VideoState = { kind: 'none' };
  private readonly player: PlaybackPlayer = {
    play: (fromSec) => {
      const { video } = this;
      if (video.kind !== 'ready') {
        return null;
      }
      video.timeSource.hold(fromSec);
      video.player.requestPlay(fromSec);
      return video.timeSource;
    },
    pause: () => {
      if (this.video.kind === 'ready') {
        this.video.player.pause();
      }
    },
  };

  constructor(
    private readonly catalog: ChartCatalog,
    private readonly list: EditList,
    private readonly ports: EditorPlayerPorts,
    private readonly screen: EditorScreen,
    private readonly timing: EditorTiming,
    private readonly first: Selection,
    private readonly resumeTimeMs: number | null = null,
  ) {
    this.screenState = {
      phase: {
        kind: 'loading',
        selection: first,
      },
      tool: 'tap',
      playhead: createPlayhead(first.song.gameStartMs),
      player: { kind: 'loading' },
      hover: null,
    };
  }

  // 씬의 render 가 view 를 참조하므로 생성자가 아니라 생성 뒤에 시작한다.
  start(): void {
    this.screen.render(null, this.current);
    this.replacePlayer(this.first.song);
    void this.open(
      this.first,
      this.resumeTimeMs === null ? null : toEditTimeMs(this.resumeTimeMs, this.first.song),
    );
  }

  get state(): ChartEditorState {
    return this.current;
  }

  private get current(): ChartEditorState {
    return 'kind' in this.screenState ? this.screenState.last : this.screenState;
  }

  /** 씬이 닫힌 뒤 끝나는 로드·저장 결과가 반영되지 않도록 세션을 버린다. 화면이 없으므로 다시 그리지 않는다. */
  close(): void {
    this.screenState = {
      kind: 'closed',
      last: this.current,
    };
    this.playerToken = null;
    this.releasePlayer();
  }

  back(): void {
    this.requestNavigation({ kind: 'leave' });
  }

  moveSong(delta: number): void {
    this.selectInList(delta, {});
  }

  selectLaneCount(laneCount: LaneCount): void {
    this.selectInList(0, { laneCount });
  }

  selectDifficulty(difficulty: Difficulty): void {
    this.selectInList(0, { difficulty });
  }

  confirmPending(): void {
    const { phase } = this.current;
    if (phase.kind !== 'confirming') {
      return;
    }
    const { session, pending } = phase;
    switch (pending.kind) {
      case 'clearNotes':
        this.edit(recordEdit(withDraft(session, clearNotes(session.draft)), session.draft));
        return;
      case 'select':
      case 'leave':
        this.edit(session);
        this.proceed(pending);
        return;
      case 'saveFailed':
      case 'saveConflict':
      case 'invalidChart':
      case 'testPlayUnsaved':
      case 'testPlayNoChart':
        this.edit(session);
        return;
    }
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
    if (session === null || session.saveProgress.kind === 'saving') {
      return;
    }
    const { draft } = session;
    let chart: Chart;
    try {
      chart = parseChart(toChart(draft), draft.song, draft.difficulty, draft.laneCount);
    } catch (error) {
      if (!(error instanceof InvalidChartError)) {
        throw error;
      }
      const notice: SaveNotice = {
        kind: 'invalidChart',
        reason: error.message,
      };
      const note = findInvalidNote(draft, error);
      if (note === null) {
        this.confirm(session, notice);
        return;
      }
      this.setState({
        ...this.current,
        phase: {
          kind: 'confirming',
          session: withDraft(session, selectNote(draft, note)),
          pending: notice,
        },
        playhead: seekPlayback(this.current.playhead, draft.song, note.timeMs),
      });
      return;
    }
    this.setSession({
      ...session,
      saveProgress: { kind: 'saving' },
    });
    const outcome = await this.catalog
      .saveChart(draft.song, chart, draft.baseRevision)
      .catch((error: unknown) => {
        console.error(
          `Failed to save chart for song ${draft.song.id} ${draft.laneCount}K difficulty ${draft.difficulty}`,
          error,
        );
        return { kind: 'failed' } as const;
      });
    if (outcome.kind !== 'saved') {
      const current = getSession(this.current);
      if (current?.id !== session.id) {
        return;
      }
      // 다른 확인 팝업이 떠 있어도 실패를 놓치지 않게 알림으로 바꾼다.
      // 충돌이면 초안과 기준 revision 은 그대로 두고, 다시 열 때만 서버 최신으로 바꾼다.
      this.confirm(
        {
          ...current,
          saveProgress: { kind: 'idle' },
        },
        SAVE_FAILURE_NOTICES[outcome.kind],
      );
      return;
    }
    // 편집 목록은 곡 고르기 화면으로 돌아가도 쓰이므로 세션 확인 전에 반영한다. 저장이 겹칠 수 있으므로 요청 때의
    // 스냅샷이 아니라 지금의 편집 목록 곡에 chart id 를 더한다.
    const song = requireDefined(
      this.list.applySavedChart(draft.song.id, draft.laneCount, draft.difficulty, outcome.chartId),
      'Saved chart song is not in the edit list',
      draft.song.id,
    );
    const current = getSession(this.current);
    if (current?.id !== session.id) {
      return;
    }
    this.setSession({
      ...current,
      draft: completeSave(current.draft, draft.notes, song, outcome.revision),
      saveProgress: { kind: 'idle' },
    });
  }

  selectTool(tool: EditTool): void {
    if (this.current.tool === tool) {
      return;
    }
    this.setState({
      ...this.current,
      tool,
    });
  }

  hoverSegment(target: SegmentHover): void {
    this.applyHover(hoverSegment(this.current, target));
  }

  unhoverSegment(target: SegmentHover): void {
    this.applyHover(unhoverSegment(this.current, target));
  }

  pointerOverButton(button: EditorButton): void {
    this.applyHover(hoverEditorButton(this.current, button));
  }

  pointerOutButton(button: EditorButton): void {
    this.applyHover(unhoverEditorButton(this.current, button));
  }

  pointerDownButton(button: EditorButton): void {
    this.applyHover(pressEditorButton(this.current, button));
  }

  pointerUpButton(button: EditorButton): void {
    const released = releaseEditorButton(this.current, button);
    // 눌린 그 버튼이었을 때만 눌림이 풀려 state 가 바뀐다.
    if (released === this.current) {
      return;
    }
    this.setState(released);
    switch (button) {
      case 'back':
        this.back();
        return;
      case 'previousSong':
        this.moveSong(-1);
        return;
      case 'nextSong':
        this.moveSong(1);
        return;
      case 'save':
        void this.save();
        return;
      case 'testPlay':
        this.requestTestPlay();
        return;
      case 'restart':
        this.seek(getSelection(this.current).song.gameStartMs);
        return;
      case 'play':
        this.togglePlayback();
        return;
      case 'delete':
        this.deleteSelected();
        return;
      case 'clear':
        this.requestClearNotes();
        return;
      case 'confirmCancel':
        this.cancelPending();
        return;
      case 'confirmAccept':
        this.confirmPending();
        return;
    }
  }

  deleteSelected(): void {
    const session = this.getEditableSession();
    if (session !== null) {
      this.setSession(
        recordEdit(withDraft(session, deleteSelectedNote(session.draft)), session.draft),
      );
    }
  }

  undo(): void {
    const session = this.getEditableSession();
    if (session !== null && session.gesture.kind === 'none') {
      this.setSession(undoEdit(session));
    }
  }

  pointerDown(pointer: TimelinePointer): void {
    const session = this.getEditableSession();
    if (session === null) {
      return;
    }
    const { draft, gesture } = startGesture(
      session.draft,
      this.current.tool,
      pointer,
      this.getGestureLimits(),
    );
    this.setSession({
      ...withDraft(session, draft),
      gesture,
    });
  }

  pointerMove(pointer: TimelinePointer): void {
    const session = this.getEditableSession();
    if (session === null || session.gesture.kind === 'none') {
      return;
    }
    const draft = continueGesture(session.draft, session.gesture, pointer, this.getGestureLimits());
    this.setSession(withDraft(session, draft));
  }

  pointerUp(pointerTimeMs: number): void {
    const session = this.getEditableSession();
    if (session === null || session.gesture.kind === 'none') {
      return;
    }
    this.setSession(
      recordEdit(
        {
          ...withDraft(session, endGesture(session.draft, session.gesture, pointerTimeMs)),
          gesture: NO_GESTURE,
        },
        session.gesture.before,
      ),
    );
  }

  seek(targetMs: number): void {
    const selection = getActiveSelection(this.current);
    if (selection === null) {
      return;
    }
    this.setPlayhead(seekPlayback(this.current.playhead, selection.song, targetMs));
  }

  togglePlayback(): void {
    const session = this.getEditableSession();
    if (session === null) {
      return;
    }
    const { song, offsetMs } = session.draft;
    const toggle = togglePlayback(this.current.playhead, song, offsetMs);
    if (toggle.kind === 'pause') {
      this.setPlayhead(toggle.playhead);
      return;
    }
    const timeSource = this.player.play(toggle.fromSec);
    if (timeSource === null) {
      return;
    }
    const { frameNow } = this.ports;
    const clock = new RhythmClock(
      {
        get currentTime() {
          return timeSource.getTimeAt(frameNow());
        },
      },
      0,
      offsetMs,
      {
        audioStartTimeSec: 0,
        songStartMs: 0,
      },
    );
    this.setPlayhead(startPlayback(toggle.startMs, clock));
  }

  private handlePlayerState(playerState: YouTubePlayerState): void {
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
    const { playhead } = this.current;
    if (playhead.transport.kind === 'playing') {
      this.setPlayhead(
        advancePlayback(
          playhead,
          getSelection(this.current).song,
          playhead.transport.clock.getTimeMs(),
        ),
      );
    }
  }

  private selectInList(
    delta: number,
    change: { readonly laneCount?: LaneCount; readonly difficulty?: Difficulty },
  ): void {
    const selection = getSelection(this.current);
    const songs = this.list.songs;
    const listed = requireDefined(
      songs.find((song) => song.id === selection.song.id),
      'Selected song is not in the song list',
      selection.song.id,
    );
    this.requestNavigation({
      kind: 'select',
      song: stepItem(songs, listed, delta),
      laneCount: change.laneCount ?? selection.laneCount,
      difficulty: change.difficulty ?? selection.difficulty,
    });
  }

  /** 확인 팝업을 띄우기 전에 진행 중인 drag 를 거두므로, 취소 뒤에 만들다 만 Hold 가 남지 않는다. */
  private requestNavigation(navigation: Navigation): void {
    if ('kind' in this.screenState) {
      return;
    }
    const decision = decideNavigation(this.current, navigation);
    switch (decision.kind) {
      case 'ignore':
        return;
      case 'cancelPending':
        this.cancelPending();
        return;
      case 'proceed':
        this.proceed(navigation);
        return;
      case 'settle':
        this.setSession(decision.session);
        return;
      case 'settleAndProceed':
        this.setSession(decision.session);
        this.proceed(navigation);
        return;
      case 'confirm':
        this.confirm(decision.session, navigation);
        return;
    }
  }

  private proceed(navigation: Navigation): void {
    if (navigation.kind === 'leave') {
      this.screen.leave(getSelection(this.current).song.id);
      return;
    }
    // 레인 수·난이도만 바뀌면 같은 음원이므로 player 를 유지하고, 보던 위치에서 이어 편집한다.
    const isSameSong = getSelection(this.current).song.id === navigation.song.id;
    if (!isSameSong) {
      this.replacePlayer(navigation.song);
    }
    void this.open(
      {
        song: navigation.song,
        laneCount: navigation.laneCount,
        difficulty: navigation.difficulty,
      },
      isSameSong ? this.current.playhead.currentTimeMs : null,
    );
  }

  /** keptTimeMs 가 있으면 그 위치에서 이어 편집하고, null 이면 채보를 읽은 뒤 첫 노트 앞으로 간다. */
  private async open(selection: Selection, keptTimeMs: number | null): Promise<void> {
    const { song, laneCount, difficulty } = selection;
    const startTimeMs = keptTimeMs ?? song.gameStartMs;
    // 에디터는 채보가 없는 레인 수·난이도도 고를 수 있으므로 여기서 chart id 유무로 새 draft 와 로드를 가른다.
    const chartId = song.chartIds[laneCount]?.[difficulty];
    if (chartId === undefined) {
      this.enter(startEditing(createEmptyDraft(song, laneCount, difficulty)), startTimeMs);
      return;
    }
    const loading: EditPhase = {
      kind: 'loading',
      selection,
    };
    this.enter(loading, startTimeMs);
    let loaded: { readonly chart: Chart; readonly revision: string };
    try {
      loaded = await this.catalog.loadChart({
        song,
        laneCount,
        difficulty,
        chartId,
      });
    } catch (error) {
      console.error(
        `Failed to load chart for song ${song.id} ${laneCount}K difficulty ${difficulty}`,
        error,
      );
      if (this.current.phase === loading) {
        this.enter(
          {
            kind: 'loadFailed',
            selection,
          },
          this.current.playhead.currentTimeMs,
        );
      }
      return;
    }
    if (this.current.phase !== loading) {
      return;
    }
    const draft = createDraft(song, loaded.chart, loaded.revision);
    this.enter(
      startEditing(draft),
      keptTimeMs === null
        ? getOpeningTimeMs(draft.notes, this.timing.openingLeadMs, song)
        : this.current.playhead.currentTimeMs,
    );
  }

  private replacePlayer(song: Song): void {
    const token = {};
    this.playerToken = token;
    this.releasePlayer();
    this.setPlayerStatus({ kind: 'loading' });
    void this.createPlayer(song, token);
  }

  private releasePlayer(): void {
    const { video } = this;
    if (video.kind !== 'none') {
      video.player.destroy();
      this.video = { kind: 'none' };
    }
  }

  private async createPlayer(song: Song, token: object): Promise<void> {
    const { players, now, volume } = this.ports;
    try {
      await players.loadApi();
      if (this.playerToken !== token) {
        return;
      }
      const timeSource = new YouTubeTimeSource(now);
      const player = players.create(song.youtubeVideoId, {
        onReady: () => {
          if (this.playerToken !== token) {
            return;
          }
          player.setVolume(volume);
          this.video = {
            kind: 'ready',
            player,
            timeSource,
          };
          this.setPlayerStatus({ kind: 'ready' });
        },
        onStateChange: (state) => {
          if (this.playerToken === token) {
            timeSource.handleStateChange(state);
            this.handlePlayerState(state);
          }
        },
        onError: (errorKind, code) => {
          if (this.playerToken !== token) {
            return;
          }
          player.destroy();
          this.video = { kind: 'none' };
          this.setPlayerStatus({
            kind: 'failed',
            failure: {
              kind: 'videoError',
              errorKind,
              code,
            },
          });
          this.stopPlayback();
        },
      });
      this.video = {
        kind: 'starting',
        player,
      };
    } catch (error) {
      if (this.playerToken === token) {
        this.failPlayer(error);
      }
    }
  }

  private failPlayer(error: unknown): void {
    console.error('Failed to load YouTube player for chart editor', error);
    this.setPlayerStatus({
      kind: 'failed',
      failure: { kind: 'loadFailed' },
    });
  }

  private setPlayerStatus(player: EditorPlayerStatus): void {
    this.setState({
      ...this.current,
      player,
    });
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

  private requestTestPlay(): void {
    const session = this.getEditableSession();
    if (session === null) {
      return;
    }
    const decision = decideTestPlay(session);
    switch (decision.kind) {
      case 'notice':
        this.confirm(session, decision.notice);
        return;
      case 'start':
        this.screen.startTestPlay(
          decision.chart,
          getPlayStartMs(this.current.playhead.currentTimeMs, session.draft.song),
        );
        return;
    }
  }

  private confirm(session: EditorSession, pending: PendingAction): void {
    this.setState({
      ...this.current,
      phase: {
        kind: 'confirming',
        session,
        pending,
      },
      playhead: pausePlayback(this.current.playhead),
    });
  }

  private setPhase(phase: EditPhase): void {
    this.setState({
      ...this.current,
      phase,
    });
  }

  private applyHover(next: ChartEditorState): void {
    if (next !== this.current) {
      this.setState(next);
    }
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
  private setState(requested: ChartEditorState): void {
    if ('kind' in this.screenState) {
      return;
    }
    const next = settleEditorButtons(requested);
    const previous = this.screenState;
    this.screenState = next;
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
      saveProgress: { kind: 'idle' },
      undoStack: [],
    },
  };
}
