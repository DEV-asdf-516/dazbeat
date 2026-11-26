import { LeadInPlayback, getPreRollStartMs } from '../../audio/LeadInPlayback.js';
import type {
  PlaybackChange,
  PlaybackFailure,
  PlaybackStatus,
} from '../../audio/LeadInPlayback.js';
import { RhythmClock } from '../../audio/RhythmClock.js';
import { VideoPreload } from '../../audio/VideoPreload.js';
import type { YouTubePlayer, YouTubePlayerHandlers } from '../../audio/YouTubePlayer.js';
import type { PreparedChart, RankingSubmission } from '../../data/playSession.js';
import type { PlaySubmission } from '../../data/playSubmission.js';
import type { ChartRef } from '../../data/songs.js';
import { cycleItem, getProgress } from '../../range.js';
import { GameplaySession } from '../../rhythm/GameplaySession.js';
import { JUDGMENT_WINDOWS, getJudgmentEventCount } from '../../rhythm/judgment.js';
import { getPlaybackStartMs } from '../../rhythm/playTiming.js';
import type { Chart, GameplayResult, JudgmentEvent, Lane } from '../../rhythm/types.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import { MV_MODES, getAudibleVolume } from '../../storage/settings.js';
import type { Settings } from '../../storage/settings.js';
import { getPlayOriginRequest } from '../app/sceneRoutes.js';
import type {
  GameplaySceneData,
  ResultRanking,
  ResultSceneData,
  SceneRequest,
} from '../app/sceneRoutes.js';
import {
  addPressedLane,
  getErrorKeyAction,
  getLaneReleaseAction,
  getLoadingKeyAction,
  getPlayingKeyAction,
  readGameplayKey,
} from './state/gameplayInput.js';
import type { CommonKeyAction, PressedLanes } from './state/gameplayInput.js';
import { advanceEnteredNotes } from './state/gameplayHud.js';
import {
  hoverGameplayButton,
  pressGameplayButton,
  releaseGameplayButton,
  unhoverGameplayButton,
} from './state/gameplayStatus.js';
import type { GameplayButton, GameplayLoadError } from './state/gameplayStatus.js';
import {
  closeQuitConfirm,
  getFrame,
  getInitialGameplayScreen,
  openQuitConfirm,
  withButtons,
  withClosed,
  withFailure,
  withFrame,
  withLeaving,
  withLoadError,
  withMvMode,
  withPlaybackStatus,
  withReady,
  withStarting,
} from './state/gameplayScreen.js';
import type { ErrorScreenState, GameplayScreenState } from './state/gameplayScreen.js';
import { getRunEnding, getRunRecord, getUnsavedUpload } from './state/runEnding.js';
import type { RunMode, SavedUpload } from './state/runEnding.js';
import { getRunSection } from './state/runStart.js';
import type { RunSection } from './state/runStart.js';
import { WorldActivation } from './state/worldActivation.js';
import type { SoundEffect } from '../ui/view/soundEffects.js';

export interface RankedPlay {
  submit(sessionId: string, submission: PlaySubmission): Promise<RankingSubmission>;
  reportGuestPlayer(chartId: string, chartRevision: string): Promise<void>;
}

export type GameplayPlayer = Pick<
  YouTubePlayer,
  'requestPlay' | 'pause' | 'resume' | 'setVolume' | 'getBufferedEndSec' | 'destroy'
>;

export interface GameplayPlayerFactory {
  loadApi(): Promise<void>;
  create(videoId: string, handlers: YouTubePlayerHandlers): GameplayPlayer;
}

export interface PlayScreen {
  readonly approachMs: number;
  hasNoteEntered(noteTimeMs: number, songTimeMs: number): boolean;
  pressLane(lane: Lane): void;
  showJudgments(events: readonly JudgmentEvent[]): void;
  playFullCombo(onDone: () => void): void;
  playFailure(onDone: () => void): void;
  playClear(onDone: () => void): void;
}

export interface GameplayScreen {
  render(previous: GameplayScreenState | null, next: GameplayScreenState): void;
  playSound(sound: SoundEffect): void;
  beginPlay(chart: Chart): PlayScreen;
  showResult(data: ResultSceneData): void;
  leave(request: SceneRequest): void;
}

export interface GameplayPorts {
  readonly save: Pick<
    LocalSave,
    'saveSettings' | 'saveResult' | 'isGuestPlayerReported' | 'saveGuestPlayerReport'
  >;
  readonly prepareChart: (ref: ChartRef) => Promise<PreparedChart>;
  readonly loadChart: (ref: ChartRef, isFresh: boolean) => Promise<Chart>;
  readonly rankedPlay: RankedPlay;
  readonly players: GameplayPlayerFactory;
  readonly now: () => number;
  // 콜백이 늦게 불린 프레임도 화면에는 제때 보이므로, 노트는 그 프레임의 시각으로 그린다.
  readonly frameNow: () => number;
}

interface LoadedChart {
  readonly chart: Chart;
  readonly mode: RunMode;
}

interface PreparedRun extends RunSection {
  readonly mode: RunMode;
  readonly player: GameplayPlayer;
}

interface PlayRun extends PreparedRun {
  readonly playback: LeadInPlayback;
  readonly session: GameplaySession;
  readonly clock: RhythmClock;
  readonly activation: WorldActivation;
  readonly playScreen: PlayScreen;
  status: PlaybackStatus;
  pressedLanes: PressedLanes;
}

// 화면 단계는 state 가 갖고, 단계가 starting·playing 일 때만 그 단계가 쓰는 실행 객체를 둔다.
type GameplayExecution =
  | { readonly kind: 'idle' }
  | { readonly kind: 'starting'; readonly run: PreparedRun; readonly preload: VideoPreload }
  | { readonly kind: 'playing'; readonly run: PlayRun };

const LOAD_ERROR_LOGS = {
  chartLoadFailed: 'Failed to load chart',
  playerLoadFailed: 'Failed to load player',
  videoError: 'Video player error',
  playbackStartFailed: 'Video playback failed to start',
} as const satisfies Record<GameplayLoadError['kind'], string>;

const PLAYBACK_FAILURE_ERRORS = {
  startFailed: { kind: 'playbackStartFailed' },
} as const satisfies Record<PlaybackFailure, GameplayLoadError>;

export class GameplayController {
  private execution: GameplayExecution = { kind: 'idle' };
  private player: GameplayPlayer | null = null;
  private state: GameplayScreenState;

  constructor(
    private readonly ports: GameplayPorts,
    private readonly screen: GameplayScreen,
    private readonly route: GameplaySceneData,
    private settings: Settings,
  ) {
    this.state = getInitialGameplayScreen(settings.mvMode);
  }

  async start(): Promise<void> {
    this.screen.render(null, this.state);

    const loaded = await (
      this.route.origin.mode === 'standard'
        ? this.ports.prepareChart(this.route).then((prepared): LoadedChart => ({
            chart: prepared.chart,
            mode: {
              kind: 'standard',
              ranking: prepared.ranking,
            },
          }))
        : // 채보 에디터에서 방금 저장한 채보는 캐시가 아니라 서버에서 다시 읽는다.
          this.ports
            .loadChart(this.route, this.route.origin.kind === 'chartEditor')
            .then((chart): LoadedChart => ({
              chart,
              mode: { kind: 'practice' },
            }))
    ).catch((error: unknown) => {
      if (this.state.kind === 'loading') {
        this.apply(this.fail(this.state, { kind: 'chartLoadFailed' }, error));
      }
      return null;
    });
    if (loaded === null || this.state.kind !== 'loading') {
      return;
    }

    const isApiLoaded = await this.ports.players.loadApi().then(
      () => true,
      (error: unknown) => {
        if (this.state.kind === 'loading') {
          this.apply(this.fail(this.state, { kind: 'playerLoadFailed' }, error));
        }
        return false;
      },
    );
    if (!isApiLoaded || this.state.kind !== 'loading') {
      return;
    }

    const { chart, mode } = loaded;
    let player: GameplayPlayer;
    try {
      player = this.ports.players.create(this.route.song.youtubeVideoId, {
        onReady: () => {
          const { state } = this;
          if (state.kind !== 'loading') {
            return;
          }
          const run: PreparedRun = {
            ...getRunSection(this.route.origin.start, chart, this.route.song),
            mode,
            player,
          };
          const preload = new VideoPreload(player, this.ports.now, {
            playbackStartMs: getPlaybackStartMs(run.gameStartMs),
            preloadEndMs: this.route.song.gameEndMs,
          });
          this.execution = {
            kind: 'starting',
            run,
            preload,
          };
          this.apply(withStarting(state));
        },
        onStateChange: (playerState) => {
          const { state } = this;
          switch (state.kind) {
            case 'starting':
              this.getStarting().preload.handleStateChange(playerState);
              return;
            case 'ready':
            case 'playing': {
              const run = this.getRun();
              this.apply(
                this.withPlaybackChange(run, state, run.playback.handleStateChange(playerState)),
              );
              return;
            }
            default:
              return;
          }
        },
        onPositionReport: (positionSec) => {
          const { state } = this;
          switch (state.kind) {
            case 'ready':
            case 'playing': {
              const run = this.getRun();
              this.apply(
                this.withPlaybackChange(run, state, run.playback.handlePositionReport(positionSec)),
              );
              return;
            }
            default:
              return;
          }
        },
        onAutoplayBlocked: () => {
          const { state } = this;
          switch (state.kind) {
            case 'starting':
            case 'ready':
            case 'playing':
              player.destroy();
              this.apply(
                this.fail(state, { kind: 'playbackStartFailed' }, 'Video autoplay was blocked'),
              );
              return;
            default:
              return;
          }
        },
        onError: (kind, code) => {
          const { state } = this;
          switch (state.kind) {
            case 'readyEnding':
            case 'ending':
            case 'error':
            case 'leaving':
            case 'closed':
              return;
            default:
              player.destroy();
              this.apply(
                this.fail(
                  state,
                  {
                    kind: 'videoError',
                    errorKind: kind,
                    code,
                  },
                  code,
                ),
              );
          }
        },
      });
    } catch (error) {
      this.apply(this.fail(this.state, { kind: 'playerLoadFailed' }, error));
      return;
    }
    this.player = player;
  }

  keyDown(code: string, isRepeat: boolean, atMs: number): void {
    const { state } = this;
    const key = readGameplayKey(code, this.settings.keyBindings[this.route.laneCount]);
    let action: CommonKeyAction;
    switch (state.kind) {
      case 'loading':
      case 'starting':
        action = getLoadingKeyAction(key, isRepeat);
        break;
      case 'error':
        action = getErrorKeyAction(key, isRepeat);
        break;
      case 'ready':
      case 'playing': {
        const run = this.getRun();
        const playingAction = getPlayingKeyAction(
          this.route.origin.quitKey,
          state.buttons.isQuitConfirmOpen,
          run.status,
          key,
          isRepeat,
        );
        switch (playingAction.kind) {
          case 'openQuitConfirm':
            this.apply(
              this.withPlaybackChange(
                run,
                openQuitConfirm(state, 'userPaused'),
                run.playback.pause(),
              ),
            );
            this.screen.playSound('click');
            return;
          case 'closeQuitConfirm':
            this.screen.playSound('close');
            this.apply(
              this.withPlaybackChange(run, closeQuitConfirm(state), run.playback.resume()),
            );
            return;
          case 'pressLane': {
            run.playScreen.pressLane(playingAction.lane);
            run.pressedLanes = addPressedLane(run.pressedLanes, playingAction.lane);
            const events = run.session.press(playingAction.lane, run.clock.getTimeMs(atMs));
            if (events.length > 0) {
              run.playScreen.showJudgments(events);
            }
            const progress = run.session.getProgress();
            // 확인 창이 열려 있어도 keyup 판정으로 실패할 수 있으므로 실패하면 확인 창을 닫는다.
            if (progress.outcome === 'failed') {
              const onDone = this.enterEnding(run, progress);
              run.playback.pause();
              this.apply(withFailure(state, { kind: 'none' }));
              run.playScreen.playFailure(onDone);
            }
            return;
          }
          default:
            action = playingAction;
            break;
        }
        break;
      }
      case 'readyEnding':
      case 'ending':
      case 'leaving':
      case 'closed':
        return;
    }
    switch (action.kind) {
      case 'none':
        return;
      case 'leave':
        this.apply(withLeaving(state));
        this.screen.playSound('close');
        this.screen.leave(this.getLeaveRequest(state));
        return;
      case 'cycleMvMode': {
        const next = cycleItem(MV_MODES, this.settings.mvMode, 'next');
        this.settings = {
          ...this.settings,
          mvMode: next,
        };
        try {
          this.ports.save.saveSettings(this.settings);
        } catch (error) {
          console.error('Failed to save settings', error);
        }
        this.apply(withMvMode(state, next));
        return;
      }
    }
  }

  keyUp(code: string, atMs: number): void {
    const { state } = this;
    if (state.kind !== 'ready' && state.kind !== 'playing') {
      return;
    }
    const run = this.getRun();
    const { lane } = readGameplayKey(code, this.settings.keyBindings[this.route.laneCount]);
    if (lane === null) {
      return;
    }
    const action = getLaneReleaseAction(run.pressedLanes, lane);
    if (action.kind === 'none') {
      return;
    }
    run.pressedLanes = action.pressedLanes;
    const events = run.session.release(lane, run.clock.getTimeMs(atMs));
    if (events.length > 0) {
      run.playScreen.showJudgments(events);
    }
    const progress = run.session.getProgress();
    // 확인 창이 열려 있어도 keyup 판정으로 실패할 수 있으므로 실패하면 확인 창을 닫는다.
    if (progress.outcome === 'failed') {
      const onDone = this.enterEnding(run, progress);
      run.playback.pause();
      this.apply(withFailure(state, { kind: 'none' }));
      run.playScreen.playFailure(onDone);
    }
  }

  tick(): void {
    const { state } = this;
    switch (state.kind) {
      case 'starting': {
        const { run, preload } = this.getStarting();
        switch (preload.tick()) {
          case 'ready':
            this.apply(withReady(state, this.beginPlay(run)));
            return;
          case 'timedOut':
            run.player.destroy();
            this.apply(
              this.fail(state, { kind: 'playbackStartFailed' }, 'Video preload timed out'),
            );
            return;
          case 'waiting':
            return;
        }
        return;
      }
      case 'ready':
      case 'playing': {
        const run = this.getRun();
        const { song } = this.route;
        const change = run.playback.tick();
        if (change.kind === 'failed') {
          this.apply(this.withPlaybackChange(run, state, change));
          return;
        }
        if (change.kind !== 'none') {
          run.status = change.status;
        }
        const frameAtMs = this.ports.frameNow();
        const songTimeMs = run.clock.getTimeMs(frameAtMs);
        const events = run.session.update(songTimeMs);
        if (events.length > 0) {
          run.playScreen.showJudgments(events);
        }
        const progress = run.session.getProgress();
        if (progress.outcome === 'failed') {
          const onDone = this.enterEnding(run, progress);
          run.playback.pause();
          this.apply(withFailure(state, change));
          run.playScreen.playFailure(onDone);
          return;
        }
        const gameState = run.session.getState();
        const playbackMs = run.clock.getPlaybackMs(frameAtMs);
        const ending = getRunEnding(playbackMs, song.gameEndMs, progress);
        this.apply(
          withFrame(
            state,
            change,
            ending.kind === 'continue' ? 'playing' : 'ending',
            run.session,
            songTimeMs,
            gameState,
            getProgress(songTimeMs, song.gameStartMs, song.gameEndMs),
            run.activation.advance(gameState.combo, songTimeMs),
            advanceEnteredNotes(
              run.chart.notes,
              getFrame(state)?.enteredNoteCount ?? 0,
              songTimeMs,
              (noteTimeMs, atSongTimeMs) => run.playScreen.hasNoteEntered(noteTimeMs, atSongTimeMs),
            ),
            playbackMs < run.gameStartMs,
          ),
        );
        if (ending.kind === 'continue') {
          return;
        }
        const onDone = this.enterEnding(run, ending.result);
        run.playback.pause();
        if (ending.kind === 'fullCombo') {
          run.playScreen.playFullCombo(onDone);
          return;
        }
        run.playScreen.playClear(onDone);
        return;
      }
      default:
        return;
    }
  }

  pointerOver(button: GameplayButton): void {
    this.apply(withButtons(this.state, hoverGameplayButton(this.state.buttons, button)));
  }

  pointerOut(button: GameplayButton): void {
    this.apply(withButtons(this.state, unhoverGameplayButton(this.state.buttons, button)));
  }

  pointerDown(button: GameplayButton): void {
    this.apply(withButtons(this.state, pressGameplayButton(this.state.buttons, button)));
  }

  pointerUp(button: GameplayButton): void {
    const { state } = this;
    const released = withButtons(state, releaseGameplayButton(state.buttons, button));
    // 눌린 그 버튼이었을 때만 눌림이 풀려 값이 바뀐다.
    if (released === state) {
      return;
    }
    switch (button) {
      case 'back':
      case 'quitAccept':
        this.apply(withLeaving(released));
        if (state.kind === 'leaving') {
          return;
        }
        this.screen.playSound('close');
        this.screen.leave(this.getLeaveRequest(state));
        return;
      case 'quitCancel': {
        if (state.kind !== 'ready' && state.kind !== 'playing') {
          this.apply(released);
          return;
        }
        const run = this.getRun();
        this.screen.playSound('close');
        this.apply(this.withPlaybackChange(run, closeQuitConfirm(released), run.playback.resume()));
        return;
      }
    }
  }

  close(): void {
    this.state = withClosed(this.state);
    this.execution = { kind: 'idle' };
    this.player?.destroy();
    this.player = null;
  }

  private apply(next: GameplayScreenState): void {
    if (this.state.kind === 'closed' || next === this.state) {
      return;
    }
    const previous = this.state;
    this.state = next;
    this.screen.render(previous, next);
  }

  private getStarting(): Extract<GameplayExecution, { readonly kind: 'starting' }> {
    const { execution } = this;
    if (execution.kind !== 'starting') {
      throw new Error('Gameplay is not starting');
    }
    return execution;
  }

  private getRun(): PlayRun {
    const { execution } = this;
    if (execution.kind !== 'playing') {
      throw new Error('Gameplay is not playing');
    }
    return execution.run;
  }

  private getLeaveRequest(state: GameplayScreenState): SceneRequest {
    return getPlayOriginRequest(
      this.route.origin,
      this.route,
      this.route,
      state.kind === 'ready' || state.kind === 'playing'
        ? this.getRun().clock.getTimeMs(this.ports.now())
        : 0,
    );
  }

  private fail(
    state: GameplayScreenState,
    error: GameplayLoadError,
    cause: unknown,
  ): ErrorScreenState {
    console.error(LOAD_ERROR_LOGS[error.kind], cause);
    return withLoadError(state, error);
  }

  // 돌려준 상태 위에 재생 결과를 더한다.
  private withPlaybackChange<State extends GameplayScreenState>(
    run: PlayRun,
    state: State,
    change: PlaybackChange,
  ): State | ErrorScreenState {
    switch (change.kind) {
      case 'none':
        return state;
      case 'status':
        run.status = change.status;
        return withPlaybackStatus(state, change.status);
      case 'failed':
        run.player.destroy();
        return this.fail(state, PLAYBACK_FAILURE_ERRORS[change.failure], change.failure);
      case 'resyncFailed':
        run.status = change.status;
        return openQuitConfirm(withPlaybackStatus(state, change.status), 'resyncFailed');
    }
  }

  private beginPlay(run: PreparedRun): PlaybackStatus {
    const { chart } = run;
    const playScreen = this.screen.beginPlay(chart);
    // 채보 검증이 노트를 시간순으로 보장하므로 첫 노트가 가장 이르다.
    const firstNote = chart.notes[0];
    const noteEntryMs =
      firstNote === undefined
        ? null
        : firstNote.timeMs - playScreen.approachMs - this.settings.inputOffsetMs - chart.offsetMs;
    const playbackStartMs = getPlaybackStartMs(run.gameStartMs);
    const playback = new LeadInPlayback(run.player, this.ports.now, {
      playbackStartMs,
      preRollStartMs: getPreRollStartMs(playbackStartMs, noteEntryMs),
      volume: getAudibleVolume(this.settings, 'musicVolume'),
    });
    const session = new GameplaySession(chart, JUDGMENT_WINDOWS, {
      canFail: run.mode.kind === 'standard',
    });
    const clock = new RhythmClock(playback, this.settings.inputOffsetMs, chart.offsetMs, {
      audioStartTimeSec: 0,
      songStartMs: 0,
    });
    const { status } = playback;
    this.execution = {
      kind: 'playing',
      run: {
        ...run,
        playback,
        session,
        clock,
        activation: new WorldActivation(
          getJudgmentEventCount(chart.notes),
          clock.getTimeMs(this.ports.now()),
        ),
        playScreen,
        status,
        pressedLanes: new Set(),
      },
    };
    return status;
  }

  // 연출이 끝나기 전에 나가기·close 로 단계가 바뀌면 결과 화면으로 가지 않는다.
  private enterEnding(run: PlayRun, result: GameplayResult): () => void {
    this.execution = { kind: 'idle' };
    return () => {
      if (this.state.kind === 'readyEnding' || this.state.kind === 'ending') {
        this.finishRun(run, result);
      }
    };
  }

  private finishRun(run: PlayRun, result: GameplayResult): void {
    const { song, laneCount, difficulty, chartId, level, origin } = this.route;
    let ranking: ResultRanking = { kind: 'none' };
    const record = getRunRecord(run.mode, result);
    if (record.kind === 'save') {
      let upload: SavedUpload = record.upload;
      try {
        this.ports.save.saveResult(song.id, laneCount, difficulty, record.result);
      } catch (error) {
        console.error('Failed to save result', error);
        upload = getUnsavedUpload(record.upload);
      }
      switch (upload.kind) {
        case 'none':
          break;
        case 'local':
          ranking = { kind: 'local' };
          this.reportGuestPlayer(chartId, upload.chartRevision);
          break;
        case 'issueFailed':
          ranking = { kind: 'issueFailed' };
          break;
        case 'submit':
          ranking = {
            kind: 'submitted',
            submission: this.ports.rankedPlay
              .submit(upload.sessionId, {
                inputOffsetMs: this.settings.inputOffsetMs,
                events: run.session.getInputs(),
              })
              .catch((error: unknown): RankingSubmission => {
                console.warn('Failed to submit ranked play', error);
                return { kind: 'unknown' };
              }),
          };
          break;
      }
    }
    this.screen.showResult({
      song,
      laneCount,
      difficulty,
      chartId,
      level,
      origin,
      report: run.report,
      result,
      ranking,
    });
  }

  // 같은 브라우저는 revision 마다 한 명으로 센다. 보내는 데 성공했을 때만 남겨 실패한 판은 다음 완주에 다시 보낸다.
  // 플레이어 수는 표시용이라 실패해도 결과 화면을 막지 않는다.
  private reportGuestPlayer(chartId: string, chartRevision: string): void {
    const { save, rankedPlay } = this.ports;
    if (save.isGuestPlayerReported(chartId, chartRevision)) {
      return;
    }
    void rankedPlay
      .reportGuestPlayer(chartId, chartRevision)
      .then(() => save.saveGuestPlayerReport(chartId, chartRevision))
      .catch((error: unknown) => {
        console.warn('Failed to report guest player', error);
      });
  }
}
