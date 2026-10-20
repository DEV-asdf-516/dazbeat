import type { YouTubePlayer, YouTubePlayerState } from './YouTubePlayer.js';
import { YouTubeTimeSource } from './YouTubeTimeSource.js';
import { msToSec, secToMs } from '../time.js';

export type LeadInPlayer = Pick<
  YouTubePlayer,
  'requestPlay' | 'pause' | 'resume' | 'setVolume' | 'getCurrentTime'
>;

export type PlaybackStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'countdown'; readonly digit: 1 | 2 | 3 }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'paused' }
  | { readonly kind: 'running' };

type CountdownProgress =
  | { readonly kind: 'running'; readonly fromAtMs: number }
  | { readonly kind: 'paused'; readonly elapsedMs: number };

type Stage =
  | { readonly kind: 'countdown'; readonly progress: CountdownProgress }
  | {
      readonly kind: 'departing';
      readonly holdSec: number;
      readonly lastState: YouTubePlayerState | null;
      readonly unpausedAtMs: number;
      readonly lastReportedSec: number | null;
    }
  | { readonly kind: 'video' }
  | {
      readonly kind: 'stalled';
      readonly stopSec: number;
      readonly isPauseRequested: boolean;
      readonly lastState: YouTubePlayerState;
    }
  | {
      readonly kind: 'catchingUp';
      readonly stopSec: number;
      readonly rewindSec: number;
      readonly startedAtMs: number;
      readonly lastState: YouTubePlayerState;
    };

// 도중 복귀의 되감기 길이도 이 값이다: 둘 다 3·2·1 을 들려줄 길이다.
const COUNTDOWN_MS = 3000;
const COUNTDOWN_STEP_MS = 1000;
// 출발 대기가 이보다 짧으면 '로딩 중' 이 깜빡이지 않게 문구를 띄우지 않는다.
const DEPARTING_LOADING_DELAY_MS = 500;

export function getVideoStartSec(playbackStartMs: number): number {
  return Math.max(0, msToSec(playbackStartMs));
}

export class LeadInPlayback {
  private readonly player: LeadInPlayer;
  private readonly now: () => number;
  private readonly videoStartSec: number;
  private readonly volume: number;
  private readonly timeSource: YouTubeTimeSource;
  private stage: Stage;
  private floorSec = Number.NEGATIVE_INFINITY;

  // 선버퍼링이 끝나 일시정지·음소거된 플레이어를 이어받으므로, 카운트다운이 끝날 때까지 플레이어를 건드리지 않는다.
  constructor(
    player: LeadInPlayer,
    now: () => number,
    plan: {
      readonly playbackStartMs: number;
      readonly volume: number;
    },
  ) {
    this.player = player;
    this.now = now;
    this.videoStartSec = getVideoStartSec(plan.playbackStartMs);
    this.volume = plan.volume;
    this.timeSource = new YouTubeTimeSource(player, now);
    this.stage = {
      kind: 'countdown',
      progress: {
        kind: 'running',
        fromAtMs: now(),
      },
    };
  }

  // 시간 소스가 일시정지 재기준·리싱크로 뒤로 가도 노트가 되돌아가지 않게 한다.
  get currentTime(): number {
    this.floorSec = Math.max(this.floorSec, this.getStageSec());
    return this.floorSec;
  }

  get status(): PlaybackStatus {
    switch (this.stage.kind) {
      case 'countdown':
        return {
          kind: 'countdown',
          digit: getDigit(COUNTDOWN_MS - this.getCountdownElapsedMs(this.stage.progress)),
        };
      case 'departing':
        if (this.stage.lastState === 'paused') {
          return { kind: 'paused' };
        }
        return this.now() - this.stage.unpausedAtMs < DEPARTING_LOADING_DELAY_MS
          ? { kind: 'waiting' }
          : { kind: 'loading' };
      case 'video':
        return { kind: 'running' };
      case 'stalled':
        return this.stage.lastState === 'paused' ? { kind: 'paused' } : { kind: 'loading' };
      case 'catchingUp':
        switch (this.stage.lastState) {
          case 'playing':
            return {
              kind: 'countdown',
              digit: getDigit(this.getCatchUpRemainingMs(this.stage)),
            };
          case 'paused':
            return { kind: 'paused' };
          default:
            return { kind: 'loading' };
        }
    }
  }

  handleStateChange(state: YouTubePlayerState): void {
    // TEMP 진단: 시작 직후 어긋남 확인 후 제거
    console.log(`t=${performance.now().toFixed(0)} [state] ${this.stage.kind} <- ${state} reported=${this.player.getCurrentTime().toFixed(3)}`);
    switch (this.stage.kind) {
      case 'countdown':
        return;
      case 'departing':
        this.handleDepartingStateChange(this.stage, state);
        return;
      case 'video':
        this.handleVideoStateChange(state);
        return;
      case 'stalled':
      case 'catchingUp':
        this.handleStoppedStateChange(this.stage, state);
        return;
    }
  }

  tick(): void {
    switch (this.stage.kind) {
      case 'countdown':
        if (
          this.stage.progress.kind === 'running' &&
          this.getCountdownElapsedMs(this.stage.progress) >= COUNTDOWN_MS
        ) {
          this.player.setVolume(this.volume);
          // 예열이 멈춘 자리에서 이어 재생한다: 시작 위치로 다시 seek 하면 재생 직후 영상이 끊기는 일이 있었다.
          this.player.resume();
          // TEMP 진단: 시작 직후 어긋남 확인 후 제거
          console.log(`t=${performance.now().toFixed(0)} [countdown end] resume at=${this.player.getCurrentTime().toFixed(3)}`);
          this.stage = {
            kind: 'departing',
            holdSec: this.videoStartSec,
            lastState: null,
            unpausedAtMs: this.now(),
            lastReportedSec: null,
          };
        }
        return;
      case 'departing': {
        // 재생 요청 직후엔 예열 때 멈춘 위치를 보고하다가 V 로 내려갈 수 있어, 고정 기준이 아니라
        // 직전 tick 의 보고 위치보다 늘었을 때만 실제로 흐른다고 본다.
        const reportedSec = this.player.getCurrentTime();
        const stage = this.stage;
        if (
          stage.lastState === 'playing' &&
          stage.lastReportedSec !== null &&
          reportedSec > stage.lastReportedSec
        ) {
          this.timeSource.handleStateChange('playing');
          // TEMP 진단: 시작 직후 어긋남 확인 후 제거
          console.log(`t=${performance.now().toFixed(0)} [depart] notes start at reported=${reportedSec.toFixed(3)}`);
          this.stage = { kind: 'video' };
        } else {
          this.stage = {
            ...stage,
            lastReportedSec: reportedSec,
          };
        }
        return;
      }
      case 'video': {
        // 시간 소스가 보고 위치로 뒤로 재기준하기 전에 읽어 하한을 S 에 고정한다.
        const stopSec = this.currentTime;
        if (this.timeSource.sync()) {
          this.startCatchUp(stopSec);
        }
        return;
      }
      case 'stalled':
        return;
      case 'catchingUp':
        if (this.stage.lastState === 'playing' && this.getCatchUpRemainingMs(this.stage) <= 0) {
          this.timeSource.handleStateChange('playing');
          this.stage = { kind: 'video' };
        }
        return;
    }
  }

  pause(): void {
    switch (this.stage.kind) {
      case 'countdown':
        if (this.stage.progress.kind === 'running') {
          this.stage = {
            kind: 'countdown',
            progress: {
              kind: 'paused',
              elapsedMs: this.getCountdownElapsedMs(this.stage.progress),
            },
          };
        }
        return;
      case 'stalled':
        this.stage = {
          ...this.stage,
          isPauseRequested: true,
        };
        this.player.pause();
        return;
      default:
        this.player.pause();
    }
  }

  resume(): void {
    switch (this.stage.kind) {
      case 'countdown':
        if (this.stage.progress.kind === 'paused') {
          this.stage = {
            kind: 'countdown',
            progress: {
              kind: 'running',
              fromAtMs: this.now() - this.stage.progress.elapsedMs,
            },
          };
        }
        return;
      case 'stalled':
        this.stage = {
          ...this.stage,
          isPauseRequested: false,
        };
        this.player.resume();
        return;
      default:
        this.player.resume();
    }
  }

  private handleDepartingStateChange(
    stage: Extract<Stage, { kind: 'departing' }>,
    state: YouTubePlayerState,
  ): void {
    if (state === 'ended') {
      this.timeSource.handleStateChange(state);
      this.stage = { kind: 'video' };
      return;
    }
    if (state === 'paused') {
      this.stage = {
        ...stage,
        lastState: state,
      };
      return;
    }
    this.stage = {
      ...stage,
      lastState: state,
      unpausedAtMs: stage.lastState === 'paused' ? this.now() : stage.unpausedAtMs,
    };
  }

  private handleVideoStateChange(state: YouTubePlayerState): void {
    if (state === 'buffering') {
      // 시간 소스가 보고 위치로 뒤로 재기준하기 전에 읽어 하한을 S 에 고정한다.
      const stopSec = this.currentTime;
      this.timeSource.handleStateChange(state);
      this.player.setVolume(0);
      this.stage = {
        kind: 'stalled',
        stopSec,
        isPauseRequested: false,
        lastState: state,
      };
      return;
    }
    if (state === 'paused') {
      const holdSec = this.currentTime;
      this.timeSource.handleStateChange(state);
      this.stage = {
        kind: 'departing',
        holdSec,
        lastState: state,
        unpausedAtMs: this.now(),
        lastReportedSec: null,
      };
      return;
    }
    this.timeSource.handleStateChange(state);
  }

  private handleStoppedStateChange(
    stage: Extract<Stage, { kind: 'stalled' | 'catchingUp' }>,
    state: YouTubePlayerState,
  ): void {
    if (state === 'ended') {
      this.timeSource.handleStateChange(state);
      this.stage = { kind: 'video' };
      return;
    }
    if (stage.kind === 'stalled' && state === 'playing') {
      // 사용자의 일시정지 뒤 늦게 온 재개에 재생을 요청하면 그 일시정지를 덮어쓴다.
      if (stage.isPauseRequested) {
        return;
      }
      this.startCatchUp(stage.stopSec);
      return;
    }
    this.stage = {
      ...stage,
      lastState: state,
    };
  }

  private startCatchUp(stopSec: number): void {
    const rewindSec = Math.max(0, stopSec - msToSec(COUNTDOWN_MS));
    // TEMP 진단: 시작 직후 어긋남 확인 후 제거
    console.log(`t=${performance.now().toFixed(0)} [catch-up] stop=${stopSec.toFixed(3)} rewind=${rewindSec.toFixed(3)} reported=${this.player.getCurrentTime().toFixed(3)}`);
    this.player.requestPlay(rewindSec);
    // 되감기 뒤에 볼륨을 올려 S 근처 소리가 나지 않게 한다.
    this.player.setVolume(this.volume);
    this.stage = {
      kind: 'catchingUp',
      stopSec,
      rewindSec,
      startedAtMs: this.now(),
      lastState: 'playing',
    };
  }

  private getCountdownElapsedMs(progress: CountdownProgress): number {
    return progress.kind === 'paused' ? progress.elapsedMs : this.now() - progress.fromAtMs;
  }

  // 보고 위치 항은 시간 소스가 아니라 원시 보고 위치다: 되감기 직후 낡은 보고값으로 잡힌 소프트
  // 보정이 실제 영상보다 앞설 수 있다. 벽시계 항은 소리가 1배속보다 빨리 S 에 닿을 수 없다는 하한이다.
  private getCatchUpRemainingMs(stage: Extract<Stage, { kind: 'catchingUp' }>): number {
    return Math.max(
      secToMs(stage.stopSec - this.player.getCurrentTime()),
      secToMs(stage.stopSec - stage.rewindSec) - (this.now() - stage.startedAtMs),
    );
  }

  private getStageSec(): number {
    switch (this.stage.kind) {
      case 'countdown':
        return this.videoStartSec;
      case 'departing':
        return this.stage.holdSec;
      case 'video':
        return this.timeSource.currentTime;
      case 'stalled':
      case 'catchingUp':
        return this.stage.stopSec;
    }
  }
}

function getDigit(remainingMs: number): 1 | 2 | 3 {
  const digit = Math.ceil(remainingMs / COUNTDOWN_STEP_MS);
  if (digit >= 3) {
    return 3;
  }
  return digit === 2 ? 2 : 1;
}
