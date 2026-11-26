import type { YouTubePlayer, YouTubePlayerHandlers } from '../../audio/YouTubePlayer.js';
import { RhythmClock } from '../../audio/RhythmClock.js';
import { YouTubeTimeSource } from '../../audio/YouTubeTimeSource.js';
import { InvalidChartError, parseChart } from '../../data/chartSchema.js';
import type { ChartLevel, ChartRef, Song, SongChart } from '../../data/songs.js';
import { requireDefined } from '../../invariant.js';
import type { Chart, Difficulty, LaneCount } from '../../rhythm/types.js';
import { stepItem } from '../../range.js';
import type { ListDirection } from '../../range.js';
import {
  completeSave,
  createDraft,
  findInvalidNote,
  selectNote,
  toChart,
} from './state/chartDraft.js';
import {
  acceptPending,
  decideTestPlay,
  getEditableSession,
  getLevelControl,
  getSelection,
  getSession,
  hoverEditorButton,
  hoverSegment,
  openSelection,
  parseLevelInput,
  pressEditorButton,
  recordEdit,
  releaseEditorButton,
  removeSelectedNote,
  requestNavigation,
  seekTo,
  settleEditorButtons,
  settleGesture,
  startEditing,
  stepLevel,
  undoEdit,
  unhoverEditorButton,
  unhoverSegment,
  withDraft,
  withLevel,
  withPending,
  withSession,
  SAVE_FAILURE_NOTICES,
} from './state/chartEditorState.js';
import type {
  ChartEditorState,
  EditorButton,
  EditorPlayerStatus,
  EditorSession,
  Navigation,
  NavigationFollow,
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
import { getOpeningTimeMs, getPlayStartMs, toEditTimeMs } from './state/editorTimeline.js';

interface PlaybackPlayer {
  play(fromSec: number): Pick<YouTubeTimeSource, 'getTimeAt'> | null;
  pause(): void;
}

export type ChartSaveOutcome =
  | {
      readonly kind: 'saved';
      readonly chartId: string;
      readonly revision: string;
      readonly level: ChartLevel;
    }
  | { readonly kind: 'conflict' };

interface LoadedChart {
  readonly chart: Chart;
  readonly revision: string;
  readonly level: ChartLevel;
}

export interface ChartCatalog {
  loadChart(ref: ChartRef): Promise<LoadedChart>;
  saveChart(
    song: Song,
    chart: Chart,
    level: ChartLevel,
    baseRevision: string | null,
  ): Promise<ChartSaveOutcome>;
}

export interface EditList {
  readonly songs: readonly Song[];
  applySavedChart(
    songId: string,
    laneCount: LaneCount,
    difficulty: Difficulty,
    saved: SongChart,
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
  /** 레벨 입력칸 글자를 그 레벨로 맞춘다(포커스는 건드리지 않는다). */
  syncLevelInput(level: ChartLevel | null): void;
}

interface EditorTiming {
  readonly openingLeadMs: number;
  readonly snapThresholdMs: number;
  readonly pickToleranceMs: number;
}

// 시작 전에는 그린 적이 없어 첫 그림의 직전 state 가 없다. 닫힌 뒤에는 입력과 늦은 결과를 받지 않는다.
type ScreenState =
  | ChartEditorState
  | { readonly kind: 'unstarted'; readonly last: ChartEditorState }
  | { readonly kind: 'closed'; readonly last: ChartEditorState };

const PLAYER_LOAD_FAILED: EditorPlayerStatus = {
  kind: 'failed',
  failure: { kind: 'loadFailed' },
};

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
      kind: 'unstarted',
      last: {
        phase: {
          kind: 'loading',
          selection: first,
        },
        tool: 'tap',
        playhead: createPlayhead(first.song.gameStartMs),
        player: { kind: 'loading' },
        hover: null,
      },
    };
  }

  // 씬의 render 가 view 를 참조하므로 생성자가 아니라 생성 뒤에 시작한다.
  start(): void {
    const step = openSelection(
      this.current,
      this.first,
      this.resumeTimeMs === null ? null : toEditTimeMs(this.resumeTimeMs, this.first.song),
    );
    this.apply(step.state);
    this.follow(step.follow);
  }

  get state(): ChartEditorState {
    return this.current;
  }

  private get current(): ChartEditorState {
    return 'kind' in this.screenState ? this.screenState.last : this.screenState;
  }

  private get isClosed(): boolean {
    return 'kind' in this.screenState && this.screenState.kind === 'closed';
  }

  /** 씬이 닫힌 뒤 끝나는 로드·저장 결과가 반영되지 않도록 세션을 버린다. 화면이 없으므로 다시 그리지 않는다. */
  close(): void {
    this.screenState = {
      kind: 'closed',
      last: this.current,
    };
    this.playerToken = null;
    const { video } = this;
    if (video.kind !== 'none') {
      video.player.destroy();
      this.video = { kind: 'none' };
    }
  }

  back(): void {
    if (this.isClosed) {
      return;
    }
    const step = requestNavigation(this.current, { kind: 'leave' });
    this.apply(step.state);
    this.follow(step.follow);
  }

  selectLaneCount(laneCount: LaneCount): void {
    if (this.isClosed) {
      return;
    }
    const step = requestNavigation(this.current, this.getListNavigation({ laneCount }));
    this.apply(step.state);
    this.follow(step.follow);
  }

  selectDifficulty(difficulty: Difficulty): void {
    if (this.isClosed) {
      return;
    }
    const step = requestNavigation(this.current, this.getListNavigation({ difficulty }));
    this.apply(step.state);
    this.follow(step.follow);
  }

  confirmPending(): void {
    if (this.isClosed) {
      return;
    }
    const step = acceptPending(this.current);
    this.apply(step.state);
    this.follow(step.follow);
  }

  selectTool(tool: EditTool): void {
    if (this.current.tool !== tool) {
      this.apply({
        ...this.current,
        tool,
      });
    }
  }

  hoverSegment(target: SegmentHover): void {
    this.apply(hoverSegment(this.current, target));
  }

  unhoverSegment(target: SegmentHover): void {
    this.apply(unhoverSegment(this.current, target));
  }

  pointerOver(button: EditorButton): void {
    this.apply(hoverEditorButton(this.current, button));
  }

  pointerOut(button: EditorButton): void {
    this.apply(unhoverEditorButton(this.current, button));
  }

  pointerDown(button: EditorButton): void {
    this.apply(pressEditorButton(this.current, button));
  }

  pointerUp(button: EditorButton): void {
    const released = releaseEditorButton(this.current, button);
    // 눌린 그 버튼이었을 때만 눌림이 풀려 state 가 바뀐다.
    if (released === this.current) {
      return;
    }
    switch (button) {
      case 'back':
      case 'previousSong':
      case 'nextSong': {
        if (this.isClosed) {
          return;
        }
        const step = requestNavigation(
          released,
          button === 'back'
            ? { kind: 'leave' }
            : this.getListNavigation({
                direction: button === 'previousSong' ? 'previous' : 'next',
              }),
        );
        this.apply(step.state);
        this.follow(step.follow);
        return;
      }
      case 'confirmAccept': {
        if (this.isClosed) {
          return;
        }
        const step = acceptPending(released);
        this.apply(step.state);
        this.follow(step.follow);
        return;
      }
      case 'confirmCancel': {
        const { phase } = released;
        this.apply(
          phase.kind === 'confirming'
            ? {
                ...released,
                phase: {
                  kind: 'editing',
                  session: phase.session,
                },
              }
            : released,
        );
        return;
      }
      case 'save': {
        const session = getEditableSession(released);
        if (session === null || session.saveProgress.kind === 'saving') {
          this.apply(released);
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
          this.apply(
            note === null
              ? withPending(released, session, notice)
              : {
                  ...released,
                  phase: {
                    kind: 'confirming',
                    session: withDraft(session, selectNote(draft, note)),
                    pending: notice,
                  },
                  playhead: seekPlayback(released.playhead, draft.song, note.timeMs),
                },
          );
          return;
        }
        this.apply(
          withSession(released, {
            ...session,
            saveProgress: { kind: 'saving' },
          }),
        );
        void this.requestSave(session, chart);
        return;
      }
      case 'testPlay': {
        const session = getEditableSession(released);
        if (session === null) {
          this.apply(released);
          return;
        }
        const decision = decideTestPlay(session);
        if (decision.kind === 'notice') {
          this.apply(withPending(released, session, decision.notice));
          return;
        }
        this.apply(released);
        this.screen.startTestPlay(
          decision.chart,
          getPlayStartMs(released.playhead.currentTimeMs, session.draft.song),
        );
        return;
      }
      case 'restart':
        this.apply(seekTo(released, getSelection(released).song.gameStartMs));
        return;
      case 'play': {
        const session = getEditableSession(released);
        if (session === null) {
          this.apply(released);
          return;
        }
        const { song, offsetMs } = session.draft;
        const toggle = togglePlayback(released.playhead, song, offsetMs);
        if (toggle.kind === 'pause') {
          this.apply({
            ...released,
            playhead: toggle.playhead,
          });
          return;
        }
        const timeSource = this.player.play(toggle.fromSec);
        this.apply(
          timeSource === null
            ? released
            : {
                ...released,
                playhead: startPlayback(
                  toggle.startMs,
                  new RhythmClock(timeSource, 0, offsetMs, {
                    audioStartTimeSec: 0,
                    songStartMs: 0,
                  }),
                ),
              },
        );
        return;
      }
      case 'delete':
        this.apply(removeSelectedNote(released));
        return;
      case 'clear': {
        const session = getEditableSession(released);
        if (session === null) {
          this.apply(released);
          return;
        }
        const settled = settleGesture(session);
        this.apply(
          settled.draft.notes.length === 0
            ? withSession(released, settled)
            : withPending(released, settled, { kind: 'clearNotes' }),
        );
        return;
      }
      case 'levelDown':
      case 'levelUp': {
        const session = getEditableSession(released);
        this.apply(
          session === null
            ? released
            : withLevel(
                released,
                stepLevel(session.draft.level, button === 'levelUp' ? 'next' : 'previous'),
              ),
        );
        return;
      }
    }
  }

  /** 값 집합 밖의 글자는 레벨을 바꾸지 않고, 확정하면 입력칸은 지금 레벨 글자로 돌아간다. */
  commitLevelInput(text: string): void {
    const level = parseLevelInput(text);
    if (level !== undefined) {
      this.apply(withLevel(this.current, level));
    }
    this.screen.syncLevelInput(getLevelControl(this.current).level);
  }

  cancelLevelInput(): void {
    this.screen.syncLevelInput(getLevelControl(this.current).level);
  }

  deleteSelected(): void {
    this.apply(removeSelectedNote(this.current));
  }

  undo(): void {
    const session = getEditableSession(this.current);
    if (session !== null && session.gesture.kind === 'none') {
      this.apply(withSession(this.current, undoEdit(session)));
    }
  }

  pressTimeline(pointer: TimelinePointer): void {
    const session = getEditableSession(this.current);
    if (session === null) {
      return;
    }
    const { draft, gesture } = startGesture(
      session.draft,
      this.current.tool,
      pointer,
      this.getGestureLimits(),
    );
    this.apply(
      withSession(this.current, {
        ...withDraft(session, draft),
        gesture,
      }),
    );
  }

  dragTimeline(pointer: TimelinePointer): void {
    const session = getEditableSession(this.current);
    if (session === null || session.gesture.kind === 'none') {
      return;
    }
    const draft = continueGesture(session.draft, session.gesture, pointer, this.getGestureLimits());
    this.apply(withSession(this.current, withDraft(session, draft)));
  }

  releaseTimeline(pointerTimeMs: number): void {
    const session = getEditableSession(this.current);
    if (session === null || session.gesture.kind === 'none') {
      return;
    }
    this.apply(
      withSession(
        this.current,
        recordEdit(
          {
            ...withDraft(session, endGesture(session.draft, session.gesture, pointerTimeMs)),
            gesture: NO_GESTURE,
          },
          session.gesture.before,
        ),
      ),
    );
  }

  seek(targetMs: number): void {
    this.apply(seekTo(this.current, targetMs));
  }

  togglePlayback(): void {
    const session = getEditableSession(this.current);
    if (session === null) {
      return;
    }
    const { song, offsetMs } = session.draft;
    const toggle = togglePlayback(this.current.playhead, song, offsetMs);
    if (toggle.kind === 'pause') {
      this.apply({
        ...this.current,
        playhead: toggle.playhead,
      });
      return;
    }
    const timeSource = this.player.play(toggle.fromSec);
    if (timeSource === null) {
      return;
    }
    const clock = new RhythmClock(timeSource, 0, offsetMs, {
      audioStartTimeSec: 0,
      songStartMs: 0,
    });
    this.apply({
      ...this.current,
      playhead: startPlayback(toggle.startMs, clock),
    });
  }

  advancePlayback(): void {
    const { playhead } = this.current;
    if (playhead.transport.kind !== 'playing') {
      return;
    }
    const next = advancePlayback(
      playhead,
      getSelection(this.current).song,
      playhead.transport.clock.getTimeMs(this.ports.frameNow()),
    );
    if (next !== playhead) {
      this.apply({
        ...this.current,
        playhead: next,
      });
    }
  }

  private getListNavigation(change: {
    readonly direction?: ListDirection;
    readonly laneCount?: LaneCount;
    readonly difficulty?: Difficulty;
  }): Navigation {
    const selection = getSelection(this.current);
    const songs = this.list.songs;
    const listed = requireDefined(
      songs.find((song) => song.id === selection.song.id),
      'Selected song is not in the song list',
      selection.song.id,
    );
    return {
      kind: 'select',
      song: change.direction === undefined ? listed : stepItem(songs, listed, change.direction),
      laneCount: change.laneCount ?? selection.laneCount,
      difficulty: change.difficulty ?? selection.difficulty,
    };
  }

  private follow(follow: NavigationFollow): void {
    switch (follow.kind) {
      case 'none':
        return;
      case 'leave':
        this.screen.leave(follow.songId);
        return;
      case 'loadChart':
        void this.loadChart(follow);
        return;
    }
  }

  private async loadChart(follow: Extract<NavigationFollow, { kind: 'loadChart' }>): Promise<void> {
    const { chart, loading, keptTimeMs } = follow;
    const loaded = await this.catalog.loadChart(chart).catch((error: unknown) => {
      console.error(
        `Failed to load chart for song ${chart.song.id} ${chart.laneCount}K difficulty ${chart.difficulty}`,
        error,
      );
      return undefined;
    });
    const { current } = this;
    if (current.phase !== loading) {
      return;
    }
    if (loaded === undefined) {
      this.apply({
        ...current,
        phase: {
          kind: 'loadFailed',
          selection: loading.selection,
        },
        playhead: createPlayhead(current.playhead.currentTimeMs),
      });
      return;
    }
    const draft = createDraft(chart.song, loaded.chart, loaded.revision, loaded.level);
    this.apply({
      ...current,
      phase: startEditing(draft),
      playhead: createPlayhead(
        keptTimeMs === null
          ? getOpeningTimeMs(draft.notes, this.timing.openingLeadMs, chart.song)
          : current.playhead.currentTimeMs,
      ),
    });
  }

  /** 저장 중에도 편집할 수 있고, 끝나면 요청 때의 notes 만 저장 기준으로 삼으므로 그 뒤의 편집은 미저장으로 남는다. */
  private async requestSave(session: EditorSession, chart: Chart): Promise<void> {
    const { draft } = session;
    const outcome = await this.catalog
      .saveChart(draft.song, chart, draft.level, draft.baseRevision)
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
      this.apply(
        withPending(
          this.current,
          {
            ...current,
            saveProgress: { kind: 'idle' },
          },
          SAVE_FAILURE_NOTICES[outcome.kind],
        ),
      );
      return;
    }
    // 편집 목록은 곡 고르기 화면으로 돌아가도 쓰이므로 세션 확인 전에 반영한다. 저장이 겹칠 수 있으므로 요청 때의
    // 스냅샷이 아니라 지금의 편집 목록 곡에 chart id 를 더한다.
    const song = requireDefined(
      this.list.applySavedChart(draft.song.id, draft.laneCount, draft.difficulty, {
        id: outcome.chartId,
        level: outcome.level,
      }),
      'Saved chart song is not in the edit list',
      draft.song.id,
    );
    const current = getSession(this.current);
    if (current?.id !== session.id) {
      return;
    }
    this.apply(
      withSession(this.current, {
        ...current,
        draft: completeSave(current.draft, draft.notes, draft.level, song, outcome.revision),
        saveProgress: { kind: 'idle' },
      }),
    );
  }

  private async createPlayer(song: Song, token: object): Promise<void> {
    const { players, now, volume } = this.ports;
    const loaded = await players.loadApi().then(
      () => ({ kind: 'loaded' }) as const,
      (error: unknown) =>
        ({
          kind: 'failed',
          error,
        }) as const,
    );
    if (this.playerToken !== token) {
      return;
    }
    if (loaded.kind === 'failed') {
      console.error('Failed to load YouTube player for chart editor', loaded.error);
      this.apply({
        ...this.current,
        player: PLAYER_LOAD_FAILED,
      });
      return;
    }
    const timeSource = new YouTubeTimeSource(now);
    try {
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
          this.apply({
            ...this.current,
            player: { kind: 'ready' },
          });
        },
        onStateChange: (playerState) => {
          if (this.playerToken !== token) {
            return;
          }
          timeSource.handleStateChange(playerState);
          const { current } = this;
          const playhead = followPlayerState(current.playhead, playerState);
          // 멈춘 뒤에 도착한 playing 은 영상만 재생 중이라는 뜻이므로 player 도 다시 멈춘다.
          if (playerState === 'playing' && playhead.transport.kind === 'paused') {
            this.player.pause();
          }
          if (playhead !== current.playhead) {
            this.apply({
              ...current,
              playhead,
            });
          }
        },
        onError: (errorKind, code) => {
          if (this.playerToken !== token) {
            return;
          }
          player.destroy();
          this.video = { kind: 'none' };
          this.apply({
            ...this.current,
            player: {
              kind: 'failed',
              failure: {
                kind: 'videoError',
                errorKind,
                code,
              },
            },
            playhead: pausePlayback(this.current.playhead),
          });
        },
      });
      this.video = {
        kind: 'starting',
        player,
      };
    } catch (error) {
      console.error('Failed to load YouTube player for chart editor', error);
      this.apply({
        ...this.current,
        player: PLAYER_LOAD_FAILED,
      });
    }
  }

  /** player 가 스스로 알린 정지 뒤의 pause 는 무해하다. */
  private apply(requested: ChartEditorState): void {
    const { screenState } = this;
    if ('kind' in screenState && screenState.kind === 'closed') {
      return;
    }
    const previous = 'kind' in screenState ? null : screenState;
    const next = settleEditorButtons(requested);
    if (next === previous) {
      return;
    }
    // 새 loading 재생기 상태는 다른 곡으로 넘어간 것이다. 옛 재생기를 pause 보다 먼저 없애 옛 영상에 pause 가 가지 않는다.
    const isNewPlayer = next.player.kind === 'loading' && next.player !== previous?.player;
    const token = {};
    if (isNewPlayer) {
      this.playerToken = token;
      const { video } = this;
      if (video.kind !== 'none') {
        video.player.destroy();
        this.video = { kind: 'none' };
      }
    }
    this.screenState = next;
    if (
      previous !== null &&
      previous.playhead.transport.kind !== 'paused' &&
      next.playhead.transport.kind === 'paused'
    ) {
      this.player.pause();
    }
    this.screen.render(previous, next);
    if (isNewPlayer) {
      void this.createPlayer(getSelection(next).song, token);
    }
  }

  private getGestureLimits(): GestureLimits {
    return {
      playheadTimeMs: this.current.playhead.currentTimeMs,
      snapThresholdMs: this.timing.snapThresholdMs,
      pickToleranceMs: this.timing.pickToleranceMs,
    };
  }
}
