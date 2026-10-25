import { LeadInPlayback, getPreRollStartMs } from '../../audio/LeadInPlayback.js';
import type { PlaybackFailure, PlaybackStatus } from '../../audio/LeadInPlayback.js';
import { RhythmClock } from '../../audio/RhythmClock.js';
import { VideoPreload } from '../../audio/VideoPreload.js';
import type {
  YouTubeErrorKind,
  YouTubePlayer,
  YouTubePlayerHandlers,
} from '../../audio/YouTubePlayer.js';
import type { PreparedChart, VerifiedPlay } from '../../data/playSession.js';
import type { PlaySubmission } from '../../data/playSubmission.js';
import type { ChartRef } from '../../data/songs.js';
import { clamp, cycleItem } from '../../range.js';
import { GameplaySession } from '../../rhythm/GameplaySession.js';
import { JUDGMENT_WINDOWS, getJudgmentEventCount } from '../../rhythm/judgment.js';
import { getGameFraction, getPlaybackStartMs } from '../../rhythm/playTiming.js';
import type {
  Chart,
  GameplayResult,
  GameplayState,
  JudgmentEvent,
  Lane,
} from '../../rhythm/types.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import { MV_MODES } from '../../storage/settings.js';
import type { MvMode, Settings } from '../../storage/settings.js';
import type { GameplaySceneData, ResultSceneData } from '../sceneRoutes.js';
import {
  addPressedLane,
  getErrorKeyAction,
  getLaneReleaseAction,
  getLoadingKeyAction,
  getPlayingKeyAction,
  getReadyKeyAction,
  readGameplayKey,
} from './gameplayInput.js';
import type { CommonKeyAction, PlayingKeyAction, PressedLanes } from './gameplayInput.js';
import { getPlayingStatus } from './gameplayStatus.js';
import type { GameplayStatus } from './gameplayStatus.js';
import { getRunEnding } from './runEnding.js';
import { WorldActivation } from './worldActivation.js';

export interface RankedPlay {
  submit(sessionId: string, submission: PlaySubmission): Promise<VerifiedPlay>;
}

export type GameplayPlayer = Pick<
  YouTubePlayer,
  'requestPlay' | 'pause' | 'resume' | 'setVolume' | 'getBufferedEndSec' | 'destroy'
>;

export interface GameplayPlayerFactory {
  loadApi(): Promise<void>;
  create(videoId: string, handlers: YouTubePlayerHandlers): GameplayPlayer;
}

export type GameplayLoadError =
  | { readonly kind: 'chartLoadFailed' }
  | { readonly kind: 'playerLoadFailed' }
  | { readonly kind: 'videoError'; readonly errorKind: YouTubeErrorKind; readonly code: number }
  | { readonly kind: 'playbackStartFailed' };

export interface GameplayFrame {
  readonly session: GameplaySession;
  readonly songTimeMs: number;
  readonly state: GameplayState;
  readonly progress: number;
  readonly activation: { readonly level: number; readonly reachedFull: boolean };
}

export interface PlayScreen {
  readonly approachMs: number;
  drawFrame(frame: GameplayFrame): void;
  pressLane(lane: Lane): void;
  showJudgments(events: readonly JudgmentEvent[]): void;
  hideIntro(): void;
  playFullCombo(onDone: () => void): void;
  playFailure(onDone: () => void): void;
  playClear(onDone: () => void): void;
}

export type QuitConfirmReason = 'userPaused' | 'resyncFailed';

export interface GameplayScreen {
  showStatus(status: GameplayStatus): void;
  showMvMode(mode: MvMode): void;
  setMvVisible(isVisible: boolean): void;
  showLoadError(error: GameplayLoadError): void;
  openQuitConfirm(reason: QuitConfirmReason): void;
  closeQuitConfirm(): void;
  beginPlay(chart: Chart): PlayScreen;
  showResult(data: ResultSceneData): void;
  backToSongSelect(): void;
}

export interface GameplayDeps {
  readonly save: Pick<LocalSave, 'saveSettings' | 'saveResult'>;
  readonly prepareChart: (ref: ChartRef) => Promise<PreparedChart>;
  readonly loadPracticeChart: (ref: ChartRef) => Promise<Chart>;
  readonly rankedPlay: RankedPlay;
  readonly players: GameplayPlayerFactory;
  readonly now: () => number;
}

type RunMode =
  // 비로그인·발급 실패면 그 판은 랭킹 없이 진행한다.
  | { readonly kind: 'standard'; readonly rankedSessionId: string | null }
  | { readonly kind: 'practice' };

interface PreparedRun {
  readonly chart: Chart;
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
  isQuitConfirmOpen: boolean;
  isIntroVisible: boolean;
}

type GameplayPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly run: PreparedRun }
  | { readonly kind: 'starting'; readonly run: PreparedRun; readonly preload: VideoPreload }
  | { readonly kind: 'playing'; readonly run: PlayRun }
  | { readonly kind: 'ending' }
  | { readonly kind: 'error' }
  | { readonly kind: 'leaving' }
  | { readonly kind: 'closed' };

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
  private phase: GameplayPhase = { kind: 'loading' };
  private player: GameplayPlayer | null = null;

  constructor(
    private readonly deps: GameplayDeps,
    private readonly screen: GameplayScreen,
    private readonly route: GameplaySceneData,
    private settings: Settings,
  ) {}

  async start(): Promise<void> {
    this.screen.showStatus({ kind: 'loading' });
    const loading: GameplayPhase = { kind: 'loading' };
    this.phase = loading;

    let failure: GameplayLoadError = { kind: 'chartLoadFailed' };
    let chart: Chart;
    let mode: RunMode;
    let player: GameplayPlayer;
    try {
      if (this.route.mode === 'standard') {
        const prepared = await this.deps.prepareChart(this.route);
        chart = prepared.chart;
        mode = {
          kind: 'standard',
          rankedSessionId: prepared.rankedSessionId,
        };
      } else {
        chart = await this.deps.loadPracticeChart(this.route);
        mode = { kind: 'practice' };
      }

      if (this.phase !== loading) {
        return;
      }

      failure = { kind: 'playerLoadFailed' };
      await this.deps.players.loadApi();
      if (this.phase !== loading) {
        return;
      }

      player = this.deps.players.create(this.route.song.youtubeVideoId, {
        onReady: () => {
          if (this.phase !== loading) {
            return;
          }
          player.setVolume(this.settings.masterVolume * this.settings.musicVolume);
          this.phase = {
            kind: 'ready',
            run: {
              chart,
              mode,
              player,
            },
          };
          this.screen.showStatus({ kind: 'awaitingStart' });
        },
        onStateChange: (state) => {
          const { phase } = this;
          switch (phase.kind) {
            case 'starting':
              phase.preload.handleStateChange(state);
              return;
            case 'playing':
              phase.run.playback.handleStateChange(state);
              return;
            default:
              return;
          }
        },
        onPositionReport: (positionSec) => {
          const { phase } = this;
          switch (phase.kind) {
            case 'playing':
              phase.run.playback.handlePositionReport(positionSec);
              return;
            default:
              return;
          }
        },
        onError: (kind, code) => {
          switch (this.phase.kind) {
            case 'ending':
            case 'error':
            case 'leaving':
            case 'closed':
              return;
            default:
              player.destroy();
              this.fail(
                {
                  kind: 'videoError',
                  errorKind: kind,
                  code,
                },
                code,
              );
          }
        },
      });
    } catch (error) {
      if (this.phase === loading) {
        this.fail(failure, error);
      }
      return;
    }
    this.player = player;
  }

  keyDown(code: string, isRepeat: boolean): void {
    const { phase } = this;
    if (phase.kind === 'leaving' || phase.kind === 'closed') {
      return;
    }
    const key = readGameplayKey(code, this.settings.keyBindings[this.route.laneCount]);
    switch (phase.kind) {
      case 'loading':
      case 'starting':
        this.applyCommonKeyAction(getLoadingKeyAction(key, isRepeat));
        return;
      case 'ready': {
        const action = getReadyKeyAction(key, isRepeat);
        if (action.kind === 'start') {
          this.requestStart(phase.run);
          return;
        }
        this.applyCommonKeyAction(action);
        return;
      }
      case 'error':
        this.applyCommonKeyAction(getErrorKeyAction(key, isRepeat));
        return;
      case 'ending':
        return;
      case 'playing':
        this.applyPlayingKeyAction(
          phase.run,
          getPlayingKeyAction(phase.run.isQuitConfirmOpen, phase.run.status, key, isRepeat),
        );
        return;
    }
  }

  keyUp(code: string): void {
    const { phase } = this;
    if (phase.kind !== 'playing') {
      return;
    }
    const { run } = phase;
    const { lane } = readGameplayKey(code, this.settings.keyBindings[this.route.laneCount]);
    if (lane === null) {
      return;
    }
    const action = getLaneReleaseAction(run.pressedLanes, lane);
    if (action.kind === 'none') {
      return;
    }
    run.pressedLanes = action.pressedLanes;
    this.applyJudgments(run, run.session.release(lane, run.clock.getTimeMs()));
  }

  tick(): void {
    const { phase } = this;
    switch (phase.kind) {
      case 'starting':
        if (phase.preload.tick()) {
          this.beginPlay(phase.run);
        }
        return;
      case 'playing':
        this.advancePlay(phase.run);
        return;
      default:
        return;
    }
  }

  closeQuitConfirm(): void {
    const { phase } = this;
    if (phase.kind !== 'playing' || !phase.run.isQuitConfirmOpen) {
      return;
    }
    phase.run.isQuitConfirmOpen = false;
    this.screen.closeQuitConfirm();
    phase.run.playback.resume();
  }

  leave(): void {
    if (this.phase.kind === 'leaving' || this.phase.kind === 'closed') {
      return;
    }
    this.phase = { kind: 'leaving' };
    this.screen.backToSongSelect();
  }

  close(): void {
    this.phase = { kind: 'closed' };
    this.player?.destroy();
    this.player = null;
  }

  private fail(error: GameplayLoadError, cause: unknown): void {
    console.error(LOAD_ERROR_LOGS[error.kind], cause);
    this.phase = { kind: 'error' };
    this.screen.showLoadError(error);
  }

  private applyCommonKeyAction(action: CommonKeyAction): void {
    switch (action.kind) {
      case 'none':
        return;
      case 'leave':
        this.leave();
        return;
      case 'cycleMvMode':
        this.cycleMvMode();
        return;
    }
  }

  private requestStart(run: PreparedRun): void {
    const { song } = this.route;
    const preload = new VideoPreload(run.player, this.deps.now, {
      playbackStartMs: getPlaybackStartMs(song.gameStartMs),
      preloadEndMs: song.gameEndMs,
    });
    this.screen.showStatus({ kind: 'loading' });
    this.screen.setMvVisible(false);
    this.phase = {
      kind: 'starting',
      run,
      preload,
    };
  }

  private beginPlay(run: PreparedRun): void {
    const { chart } = run;
    const playScreen = this.screen.beginPlay(chart);
    // 채보 검증이 노트를 시간순으로 보장하므로 첫 노트가 가장 이르다.
    const firstNote = chart.notes[0];
    const noteEntryMs =
      firstNote === undefined
        ? null
        : firstNote.timeMs - playScreen.approachMs - this.settings.inputOffsetMs - chart.offsetMs;
    const playbackStartMs = getPlaybackStartMs(this.route.song.gameStartMs);
    const playback = new LeadInPlayback(
      run.player,
      this.deps.now,
      {
        playbackStartMs,
        preRollStartMs: getPreRollStartMs(playbackStartMs, noteEntryMs),
        volume: this.settings.masterVolume * this.settings.musicVolume,
      },
      {
        onStatusChange: (status) => {
          const { phase } = this;
          if (phase.kind === 'playing') {
            this.showPlaybackStatus(phase.run, status);
          }
        },
        onFailure: (failure) => {
          if (this.phase.kind !== 'playing') {
            return;
          }
          run.player.destroy();
          this.fail(PLAYBACK_FAILURE_ERRORS[failure], failure);
        },
        onResyncFailed: () => {
          const { phase } = this;
          if (phase.kind !== 'playing') {
            return;
          }
          phase.run.isQuitConfirmOpen = true;
          this.screen.openQuitConfirm('resyncFailed');
        },
      },
    );
    const session = new GameplaySession(chart, JUDGMENT_WINDOWS, {
      canFail: run.mode.kind === 'standard',
    });
    const clock = new RhythmClock(playback, this.settings.inputOffsetMs, chart.offsetMs, {
      audioStartTimeSec: 0,
      songStartMs: 0,
    });
    const { status } = playback;
    this.screen.showStatus(getPlayingStatus(status));
    this.phase = {
      kind: 'playing',
      run: {
        ...run,
        playback,
        session,
        clock,
        activation: new WorldActivation(getJudgmentEventCount(chart.notes), clock.getTimeMs()),
        playScreen,
        status,
        pressedLanes: new Set(),
        isQuitConfirmOpen: false,
        isIntroVisible: true,
      },
    };
  }

  private applyPlayingKeyAction(run: PlayRun, action: PlayingKeyAction): void {
    switch (action.kind) {
      case 'openQuitConfirm':
        run.isQuitConfirmOpen = true;
        run.playback.pause();
        this.screen.openQuitConfirm('userPaused');
        return;
      case 'closeQuitConfirm':
        this.closeQuitConfirm();
        return;
      case 'pressLane':
        run.playScreen.pressLane(action.lane);
        run.pressedLanes = addPressedLane(run.pressedLanes, action.lane);
        this.applyJudgments(run, run.session.press(action.lane, run.clock.getTimeMs()));
        return;
      default:
        this.applyCommonKeyAction(action);
        return;
    }
  }

  private advancePlay(run: PlayRun): void {
    const { song } = this.route;
    run.playback.tick();
    if (this.phase.kind !== 'playing') {
      return;
    }
    const songTimeMs = run.clock.getTimeMs();
    if (this.applyJudgments(run, run.session.update(songTimeMs))) {
      return;
    }
    const state = run.session.getState();
    const activation = run.activation.advance(state.combo, songTimeMs);
    run.playScreen.drawFrame({
      session: run.session,
      songTimeMs,
      state,
      progress: clamp(getGameFraction(song.gameStartMs, song.gameEndMs, songTimeMs), 0, 1),
      activation,
    });
    if (run.isIntroVisible && run.clock.getPlaybackMs() >= song.gameStartMs) {
      run.isIntroVisible = false;
      run.playScreen.hideIntro();
    }
    const ending = getRunEnding(
      run.clock.getPlaybackMs(),
      song.gameEndMs,
      run.session.getProgress(),
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
  }

  private showPlaybackStatus(run: PlayRun, status: PlaybackStatus): void {
    const isRunning = status.kind === 'running';
    const wasRunning = run.status.kind === 'running';
    run.status = status;
    this.screen.showStatus(getPlayingStatus(status));
    if (isRunning !== wasRunning) {
      this.screen.setMvVisible(isRunning);
    }
  }

  private applyJudgments(run: PlayRun, events: readonly JudgmentEvent[]): boolean {
    if (events.length > 0) {
      run.playScreen.showJudgments(events);
    }
    const progress = run.session.getProgress();
    if (progress.outcome !== 'failed') {
      return false;
    }
    const onDone = this.enterEnding(run, progress);
    run.playback.pause();
    run.playScreen.playFailure(onDone);
    return true;
  }

  // 연출이 끝나기 전에 나가기·close 로 단계가 바뀌면 결과 화면으로 가지 않는다.
  private enterEnding(run: PlayRun, result: GameplayResult): () => void {
    const ending: GameplayPhase = { kind: 'ending' };
    this.phase = ending;
    return () => {
      if (this.phase === ending) {
        this.finishRun(run, result);
      }
    };
  }

  private finishRun(run: PlayRun, result: GameplayResult): void {
    const { song, laneCount, difficulty, chartId, mode } = this.route;
    if (run.mode.kind === 'standard' && result.outcome === 'finished') {
      try {
        this.deps.save.saveResult(song.id, laneCount, difficulty, result);
      } catch (error) {
        console.error('Failed to save result', error);
      }
      const { rankedSessionId } = run.mode;
      if (rankedSessionId !== null) {
        void this.deps.rankedPlay
          .submit(rankedSessionId, {
            inputOffsetMs: this.settings.inputOffsetMs,
            events: run.session.getInputs(),
          })
          .catch((error: unknown) => {
            console.warn('Failed to submit ranked play', error);
          });
      }
    }
    this.screen.showResult({
      song,
      laneCount,
      difficulty,
      chartId,
      mode,
      result,
    });
  }

  private cycleMvMode(): void {
    const next = cycleItem(MV_MODES, this.settings.mvMode, 1);
    this.settings = {
      ...this.settings,
      mvMode: next,
    };
    try {
      this.deps.save.saveSettings(this.settings);
    } catch (error) {
      console.error('Failed to save settings', error);
    }
    this.screen.showMvMode(next);
  }
}
