import { LeadInPlayback, getPreRollStartMs } from '../../audio/LeadInPlayback.js';
import type { PlaybackFailure, PlaybackStatus } from '../../audio/LeadInPlayback.js';
import { RhythmClock } from '../../audio/RhythmClock.js';
import { VideoPreload } from '../../audio/VideoPreload.js';
import type { YouTubePlayer, YouTubePlayerHandlers } from '../../audio/YouTubePlayer.js';
import type { NamedAchievementDefinition } from '../../data/achievements.js';
import type { PreparedChart, VerifiedPlay } from '../../data/playSession.js';
import type { PlaySubmission } from '../../data/playSubmission.js';
import type { ChartRef } from '../../data/songs.js';
import { cycleItem, getProgress } from '../../range.js';
import { GameplaySession } from '../../rhythm/GameplaySession.js';
import { JUDGMENT_WINDOWS, getJudgmentEventCount } from '../../rhythm/judgment.js';
import { getPlaybackStartMs } from '../../rhythm/playTiming.js';
import type { Chart, GameplayResult, JudgmentEvent, Lane } from '../../rhythm/types.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import { MV_MODES, getMusicVolume } from '../../storage/settings.js';
import type { MvMode, Settings } from '../../storage/settings.js';
import type { GameplaySceneData, ResultSceneData } from '../app/sceneRoutes.js';
import {
  addPressedLane,
  getErrorKeyAction,
  getLaneReleaseAction,
  getLoadingKeyAction,
  getPlayingKeyAction,
  readGameplayKey,
} from './state/gameplayInput.js';
import type { CommonKeyAction, PlayingKeyAction, PressedLanes } from './state/gameplayInput.js';
import { advanceEnteredNotes } from './state/gameplayHud.js';
import type { GameplayFrame } from './state/gameplayHud.js';
import type { QuitConfirmReason } from './state/quitConfirm.js';
import {
  INITIAL_GAMEPLAY_BUTTONS,
  getPlayingStatus,
  hoverGameplayButton,
  isMvVisibleIn,
  pressGameplayButton,
  releaseGameplayButton,
  unhoverGameplayButton,
  withQuitConfirmOpen,
} from './state/gameplayStatus.js';
import type {
  GameplayButton,
  GameplayButtons,
  GameplayLoadError,
  GameplayStatus,
} from './state/gameplayStatus.js';
import { getRunEnding, getRunRecord } from './state/runEnding.js';
import type { RunMode } from './state/runEnding.js';
import { WorldActivation } from './state/worldActivation.js';

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

export interface PlayScreen {
  readonly approachMs: number;
  drawFrame(previous: GameplayFrame | null, next: GameplayFrame): void;
  hasNoteEntered(noteTimeMs: number, songTimeMs: number): boolean;
  pressLane(lane: Lane): void;
  showJudgments(events: readonly JudgmentEvent[]): void;
  hideIntro(): void;
  playFullCombo(onDone: () => void): void;
  playFailure(onDone: () => void): void;
  playClear(onDone: () => void): void;
}

export interface GameplayScreen {
  showStatus(previous: GameplayStatus | null, next: GameplayStatus): void;
  renderButtons(previous: GameplayButtons | null, next: GameplayButtons): void;
  showMvMode(mode: MvMode): void;
  setMvVisible(isVisible: boolean): void;
  showLoadError(error: GameplayLoadError): void;
  openQuitConfirm(reason: QuitConfirmReason): void;
  closeQuitConfirm(): void;
  beginPlay(chart: Chart): PlayScreen;
  showResult(data: ResultSceneData): void;
  backToSongSelect(): void;
}

export interface GameplayPorts {
  readonly save: Pick<LocalSave, 'saveSettings' | 'saveResult'>;
  readonly prepareChart: (ref: ChartRef) => Promise<PreparedChart>;
  readonly loadPracticeChart: (ref: ChartRef) => Promise<Chart>;
  readonly rankedPlay: RankedPlay;
  readonly players: GameplayPlayerFactory;
  readonly now: () => number;
  // 콜백이 늦게 불린 프레임도 화면에는 제때 보이므로, 노트는 그 프레임의 시각으로 그린다.
  readonly frameNow: () => number;
}

interface PreparedRun {
  readonly chart: Chart;
  readonly mode: RunMode;
  readonly player: GameplayPlayer;
}

interface PlayRun extends PreparedRun {
  readonly playback: LeadInPlayback;
  readonly session: GameplaySession;
  readonly clock: RhythmClock;
  readonly frameClock: RhythmClock;
  readonly activation: WorldActivation;
  readonly playScreen: PlayScreen;
  status: PlaybackStatus;
  pressedLanes: PressedLanes;
  isIntroVisible: boolean;
  lastFrame: GameplayFrame | null;
}

type GameplayPhase =
  | { readonly kind: 'loading' }
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
  private shownStatus: GameplayStatus | null = null;
  private buttons = INITIAL_GAMEPLAY_BUTTONS;

  constructor(
    private readonly ports: GameplayPorts,
    private readonly screen: GameplayScreen,
    private readonly route: GameplaySceneData,
    private settings: Settings,
  ) {
    this.screen.renderButtons(null, this.buttons);
  }

  async start(): Promise<void> {
    this.showStatus({ kind: 'loading' });
    const loading: GameplayPhase = { kind: 'loading' };
    this.phase = loading;

    let failure: GameplayLoadError = { kind: 'chartLoadFailed' };
    let chart: Chart;
    let mode: RunMode;
    let player: GameplayPlayer;
    try {
      if (this.route.mode === 'standard') {
        const prepared = await this.ports.prepareChart(this.route);
        chart = prepared.chart;
        mode = {
          kind: 'standard',
          rankedSessionId: prepared.rankedSessionId,
        };
      } else {
        chart = await this.ports.loadPracticeChart(this.route);
        mode = { kind: 'practice' };
      }

      if (this.phase !== loading) {
        return;
      }

      failure = { kind: 'playerLoadFailed' };
      await this.ports.players.loadApi();
      if (this.phase !== loading) {
        return;
      }

      player = this.ports.players.create(this.route.song.youtubeVideoId, {
        onReady: () => {
          if (this.phase !== loading) {
            return;
          }
          this.requestStart({
            chart,
            mode,
            player,
          });
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
      case 'error':
        this.applyCommonKeyAction(getErrorKeyAction(key, isRepeat));
        return;
      case 'ending':
        return;
      case 'playing':
        this.applyPlayingKeyAction(
          phase.run,
          getPlayingKeyAction(this.buttons.isQuitConfirmOpen, phase.run.status, key, isRepeat),
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
    if (phase.kind !== 'playing' || !this.buttons.isQuitConfirmOpen) {
      return;
    }
    this.applyButtons((buttons) => withQuitConfirmOpen(buttons, false));
    this.screen.closeQuitConfirm();
    phase.run.playback.resume();
  }

  pointerOver(button: GameplayButton): void {
    this.applyButtons((buttons) => hoverGameplayButton(buttons, button));
  }

  pointerOut(button: GameplayButton): void {
    this.applyButtons((buttons) => unhoverGameplayButton(buttons, button));
  }

  pointerDown(button: GameplayButton): void {
    this.applyButtons((buttons) => pressGameplayButton(buttons, button));
  }

  pointerUp(button: GameplayButton): void {
    const previous = this.buttons;
    this.applyButtons((buttons) => releaseGameplayButton(buttons, button));
    // 눌린 그 버튼이었을 때만 눌림이 풀려 값이 바뀐다.
    if (this.buttons === previous) {
      return;
    }
    switch (button) {
      case 'back':
      case 'quitAccept':
        this.leave();
        return;
      case 'quitCancel':
        this.closeQuitConfirm();
        return;
    }
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

  private applyButtons(transition: (buttons: GameplayButtons) => GameplayButtons): void {
    if (this.phase.kind === 'closed') {
      return;
    }
    const previous = this.buttons;
    const next = transition(previous);
    if (next === previous) {
      return;
    }
    this.buttons = next;
    this.screen.renderButtons(previous, next);
  }

  private showStatus(status: GameplayStatus): void {
    this.screen.showStatus(this.shownStatus, status);
    this.shownStatus = status;
  }

  private fail(error: GameplayLoadError, cause: unknown): void {
    console.error(LOAD_ERROR_LOGS[error.kind], cause);
    this.applyButtons((buttons) => withQuitConfirmOpen(buttons, false));
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
    const preload = new VideoPreload(run.player, this.ports.now, {
      playbackStartMs: getPlaybackStartMs(song.gameStartMs),
      preloadEndMs: song.gameEndMs,
    });
    this.showStatus({ kind: 'loading' });
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
      this.ports.now,
      {
        playbackStartMs,
        preRollStartMs: getPreRollStartMs(playbackStartMs, noteEntryMs),
        volume: getMusicVolume(this.settings),
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
          this.applyButtons((buttons) => withQuitConfirmOpen(buttons, true));
          this.screen.openQuitConfirm('resyncFailed');
        },
      },
    );
    const session = new GameplaySession(chart, JUDGMENT_WINDOWS, {
      canFail: run.mode.kind === 'standard',
    });
    const clockStart = {
      audioStartTimeSec: 0,
      songStartMs: 0,
    };
    const clock = new RhythmClock(
      playback,
      this.settings.inputOffsetMs,
      chart.offsetMs,
      clockStart,
    );
    const { frameNow } = this.ports;
    const frameClock = new RhythmClock(
      {
        get currentTime() {
          return playback.getTimeAt(frameNow());
        },
      },
      this.settings.inputOffsetMs,
      chart.offsetMs,
      clockStart,
    );
    const { status } = playback;
    this.showStatus(getPlayingStatus(status));
    this.phase = {
      kind: 'playing',
      run: {
        ...run,
        playback,
        session,
        clock,
        frameClock,
        activation: new WorldActivation(getJudgmentEventCount(chart.notes), clock.getTimeMs()),
        playScreen,
        status,
        pressedLanes: new Set(),
        isIntroVisible: true,
        lastFrame: null,
      },
    };
  }

  private applyPlayingKeyAction(run: PlayRun, action: PlayingKeyAction): void {
    switch (action.kind) {
      case 'openQuitConfirm':
        this.applyButtons((buttons) => withQuitConfirmOpen(buttons, true));
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
    const songTimeMs = run.frameClock.getTimeMs();
    if (this.applyJudgments(run, run.session.update(songTimeMs))) {
      return;
    }
    const state = run.session.getState();
    const activation = run.activation.advance(state.combo, songTimeMs);
    const frame: GameplayFrame = {
      session: run.session,
      songTimeMs,
      state,
      progress: getProgress(songTimeMs, song.gameStartMs, song.gameEndMs),
      activation,
      enteredNoteCount: advanceEnteredNotes(
        run.chart.notes,
        run.lastFrame?.enteredNoteCount ?? 0,
        songTimeMs,
        (noteTimeMs, atSongTimeMs) => run.playScreen.hasNoteEntered(noteTimeMs, atSongTimeMs),
      ),
    };
    run.playScreen.drawFrame(run.lastFrame, frame);
    run.lastFrame = frame;
    if (run.isIntroVisible && run.frameClock.getPlaybackMs() >= song.gameStartMs) {
      run.isIntroVisible = false;
      run.playScreen.hideIntro();
    }
    const ending = getRunEnding(
      run.frameClock.getPlaybackMs(),
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
    const isMvVisible = isMvVisibleIn(status);
    const wasMvVisible = isMvVisibleIn(run.status);
    run.status = status;
    this.showStatus(getPlayingStatus(status));
    if (isMvVisible !== wasMvVisible) {
      this.screen.setMvVisible(isMvVisible);
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
    // 실패 연출은 열린 확인 창을 숨긴다.
    this.applyButtons((buttons) => withQuitConfirmOpen(buttons, false));
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
    let newAchievements: Promise<readonly NamedAchievementDefinition[]> = Promise.resolve([]);
    const record = getRunRecord(run.mode, result);
    if (record.kind === 'save') {
      try {
        this.ports.save.saveResult(song.id, laneCount, difficulty, record.result);
      } catch (error) {
        console.error('Failed to save result', error);
      }
      const { rankedSessionId } = record;
      if (rankedSessionId !== null) {
        newAchievements = this.ports.rankedPlay
          .submit(rankedSessionId, {
            inputOffsetMs: this.settings.inputOffsetMs,
            events: run.session.getInputs(),
          })
          .then((play) => play.newAchievements)
          .catch((error: unknown) => {
            console.warn('Failed to submit ranked play', error);
            return [];
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
      newAchievements,
    });
  }

  private cycleMvMode(): void {
    const next = cycleItem(MV_MODES, this.settings.mvMode, 1);
    this.settings = {
      ...this.settings,
      mvMode: next,
    };
    try {
      this.ports.save.saveSettings(this.settings);
    } catch (error) {
      console.error('Failed to save settings', error);
    }
    this.screen.showMvMode(next);
  }
}
