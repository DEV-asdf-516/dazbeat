import type { YouTubePlayer, YouTubePlayerState } from './YouTubePlayer.js';
import { getDistance } from '../range.js';
import { isShallowEqual } from '../shallowEqual.js';
import { msToSec, secToMs } from '../time.js';

export type LeadInPlayer = Pick<YouTubePlayer, 'requestPlay' | 'pause' | 'resume' | 'setVolume'>;

export type PlaybackStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'countdown'; readonly digit: 1 | 2 | 3 }
  | { readonly kind: 'paused' }
  | { readonly kind: 'resuming' }
  | { readonly kind: 'running' };

export type PlaybackFailure = 'startFailed';

export interface LeadInPlaybackHandlers {
  onStatusChange(status: PlaybackStatus): void;
  onFailure(failure: PlaybackFailure): void;
  onResyncFailed(): void;
}

type GameClock =
  | { readonly kind: 'flowing'; readonly fromAtMs: number; readonly fromSec: number }
  | { readonly kind: 'stopped'; readonly sec: number };

type PositionReport = { readonly atMs: number; readonly positionSec: number };

// seek 는 모두 뒤로 가므로, seek 직전 보고 위치보다 작은 보고가 나오기 전까지는 seek 결과가 아니다.
type ReportGate =
  | { readonly kind: 'seeking'; readonly fromSec: number }
  | { readonly kind: 'following'; readonly previous: PositionReport | null };

// 일시정지 순간 정한 재개 방법: 영상 종료 뒤면 시계만, 곡 시작 전이면 최초 시작 절차로, 그 밖은 재동기화.
// 허용 범위를 같은 방향으로 벗어난 보고가 이어지는 중. 첫 보고의 수신 시각부터 잰다.
type Drift = { readonly isAhead: boolean; readonly fromAtMs: number };

type ResumeRoute = 'videoEnded' | 'beforeStart' | 'resync';

type ResyncTrigger = 'user' | 'auto';

type ResyncStep =
  | { readonly kind: 'warming'; readonly waitFromAtMs: number; readonly gate: ReportGate }
  | { readonly kind: 'measuring'; readonly seekAtMs: number; readonly gate: ReportGate }
  | { readonly kind: 'probing'; readonly seekAtMs: number; readonly gate: ReportGate }
  | {
      readonly kind: 'planned';
      readonly resumeAtMs: number;
      readonly probeLeadMs: number;
      readonly lastReportedSec: number;
    }
  | {
      readonly kind: 'confirming';
      readonly resumeAtMs: number;
      readonly seekAtMs: number;
      readonly gate: ReportGate;
    }
  | { readonly kind: 'counting'; readonly resumeAtMs: number };

type Stage =
  | {
      readonly kind: 'warming';
      readonly isResuming: boolean;
      readonly waitFromAtMs: number;
      readonly gate: ReportGate;
    }
  | {
      readonly kind: 'calibrating';
      readonly isResuming: boolean;
      readonly waitFromAtMs: number;
      readonly seekAtMs: number;
      readonly gate: ReportGate;
    }
  | { readonly kind: 'preRoll'; readonly seekLeadMs: number; readonly lastReportedSec: number }
  | {
      readonly kind: 'preRollBuffering';
      readonly seekLeadMs: number;
      readonly waitFromAtMs: number;
      readonly gate: ReportGate;
    }
  | {
      readonly kind: 'starting';
      readonly seekAtMs: number;
      readonly startAtMs: number;
      readonly gate: ReportGate;
    }
  | { readonly kind: 'watching'; readonly drift: Drift | null }
  | { readonly kind: 'freeRunning' }
  | { readonly kind: 'endedCountdown'; readonly resumeAtMs: number }
  | { readonly kind: 'paused'; readonly route: ResumeRoute }
  | { readonly kind: 'resyncing'; readonly trigger: ResyncTrigger; readonly step: ResyncStep }
  | { readonly kind: 'failed' };

// 재생이 끊겼다는 보고. 재동기화 seek 를 보낸 뒤가 아니면 자동 복구 대상이다.
const INTERRUPTED_STATES: readonly YouTubePlayerState[] = ['buffering', 'paused', 'ended'];
const COUNTDOWN_MS = 3000;
const COUNTDOWN_STEP_MS = 1000;
// 소리가 거의 들리지 않는 볼륨으로 재생해 두면 오디오 출력이 켜질 때의 정체가 곡 시작 전에 끝난다.
const WARM_VOLUME = 0.01;
const STABLE_MIN_INTERVAL_MS = 120;
const STABLE_MIN_RATE = 0.9;
const STABLE_MAX_RATE = 1.1;
const SYNC_TOLERANCE_MS = 30;
// 초 단위 뺄셈의 반올림 오차(수십 나노초)로 정확히 허용 범위 끝인 편차가 밖으로 분류되지 않게 한다.
const DRIFT_ROUNDING_MS = 1e-6;
// 이보다 짧게 이어지는 이탈은 보고 자체의 오차로 본다.
const SUSTAINED_DRIFT_MS = 1000;
const WAIT_LIMIT_MS = 10000;
const VERIFY_LIMIT_MS = 3000;
// 재개 때 영상을 정지 값보다 이만큼 앞에서 흘려 정지 값에 닿는 시각을 잰다. 그동안 카운트다운을 보인다.
const RESUME_LEAD_MS = COUNTDOWN_MS;
// 0초에서 선행 재생할 때 seek 결과 실측(보고 두 개)이 영상의 정지 값 도달 전에 끝난다고 보장할 수 없는 구간.
// 이 안에서만 같은 재개에서 잰 seek 지연으로 계획한 재개 시각을 쓴다.
const PLANNED_RESUME_MAX_MS = 550;
// 자동 복구로 다시 흐른 뒤 게임 시계가 이만큼 진행하기 전에 또 복구가 필요하면 복구할 수 없는 상황으로 본다.
const AUTO_RECOVERY_INTERVAL_MS = 10000;

export function getVideoStartSec(playbackStartMs: number): number {
  return Math.max(0, msToSec(playbackStartMs));
}

export function getPreRollStartMs(playbackStartMs: number, noteEntryMs: number | null): number {
  const countdownStartMs = secToMs(getVideoStartSec(playbackStartMs)) - COUNTDOWN_MS;
  return noteEntryMs === null ? countdownStartMs : Math.min(countdownStartMs, noteEntryMs);
}

export class LeadInPlayback {
  private readonly player: LeadInPlayer;
  private readonly now: () => number;
  private readonly videoStartSec: number;
  private readonly volume: number;
  private readonly warmVolume: number;
  private readonly handlers: LeadInPlaybackHandlers;
  private clock: GameClock;
  private stage: Stage;
  private shownStatus: PlaybackStatus;
  // 직전 자동 복구로 게임 시계가 다시 흐르기 시작한 값. 사용자 일시정지·재개는 바꾸지 않는다.
  private autoResumedFromSec: number | null = null;

  constructor(
    player: LeadInPlayer,
    now: () => number,
    plan: {
      readonly playbackStartMs: number;
      readonly preRollStartMs: number;
      readonly volume: number;
    },
    handlers: LeadInPlaybackHandlers,
  ) {
    this.player = player;
    this.now = now;
    this.handlers = handlers;
    this.videoStartSec = getVideoStartSec(plan.playbackStartMs);
    this.volume = plan.volume;
    this.warmVolume = plan.volume > 0 ? WARM_VOLUME : 0;
    this.clock = {
      kind: 'stopped',
      sec: msToSec(plan.preRollStartMs),
    };
    player.setVolume(this.warmVolume);
    player.resume();
    this.stage = {
      kind: 'warming',
      isResuming: false,
      waitFromAtMs: now(),
      gate: {
        kind: 'following',
        previous: null,
      },
    };
    this.shownStatus = this.status;
  }

  get currentTime(): number {
    return this.getTimeAt(this.now());
  }

  // 그리기는 화면에 보일 프레임 시각으로 읽는다. 그 시각은 시계가 흐르기 시작한 시각보다 이를 수 있다.
  getTimeAt(atMs: number): number {
    return this.clock.kind === 'flowing'
      ? this.clock.fromSec + msToSec(Math.max(0, atMs - this.clock.fromAtMs))
      : this.clock.sec;
  }

  get status(): PlaybackStatus {
    const { stage } = this;
    switch (stage.kind) {
      case 'warming':
      case 'calibrating':
        return stage.isResuming ? { kind: 'resuming' } : { kind: 'loading' };
      case 'preRollBuffering':
      case 'failed':
        return { kind: 'loading' };
      case 'paused':
        return { kind: 'paused' };
      case 'endedCountdown':
        return this.getResumeCountdownStatus(stage.resumeAtMs);
      case 'preRoll':
      case 'starting':
      case 'watching':
      case 'freeRunning':
        return this.getClockStatus();
      case 'resyncing':
        switch (stage.step.kind) {
          case 'warming':
          case 'measuring':
          case 'probing':
            return { kind: 'resuming' };
          case 'planned':
          case 'confirming':
          case 'counting':
            return this.getResumeCountdownStatus(stage.step.resumeAtMs);
        }
    }
  }

  handleStateChange(state: YouTubePlayerState): void {
    this.applyStateChange(state);
    this.notifyStatus();
  }

  handlePositionReport(positionSec: number): void {
    this.applyPositionReport(positionSec);
    this.notifyStatus();
  }

  tick(): void {
    this.applyTick();
    this.notifyStatus();
  }

  // 어느 단계든 그 자리에서 멈춘다. 진행 중이던 곡 시작 검증·재동기화는 버리고 재개 때 처음부터 한다.
  pause(): void {
    if (this.stage.kind !== 'paused' && this.stage.kind !== 'failed') {
      this.enterPause();
    }
    this.notifyStatus();
  }

  resume(): void {
    const { stage } = this;
    if (stage.kind === 'paused') {
      switch (stage.route) {
        case 'videoEnded':
          this.stage = {
            kind: 'endedCountdown',
            resumeAtMs: this.now() + RESUME_LEAD_MS,
          };
          break;
        case 'beforeStart':
          this.player.setVolume(this.warmVolume);
          this.player.resume();
          this.stage = {
            kind: 'warming',
            isResuming: true,
            waitFromAtMs: this.now(),
            gate: {
              kind: 'following',
              previous: null,
            },
          };
          break;
        case 'resync':
          this.player.setVolume(this.warmVolume);
          this.player.resume();
          this.startResync('user');
          break;
      }
    }
    this.notifyStatus();
  }

  private applyStateChange(state: YouTubePlayerState): void {
    const { stage } = this;
    switch (stage.kind) {
      case 'preRoll':
        if (state === 'buffering') {
          this.stopClock();
          this.stage = {
            kind: 'preRollBuffering',
            seekLeadMs: stage.seekLeadMs,
            waitFromAtMs: this.now(),
            gate: {
              kind: 'following',
              previous: null,
            },
          };
        }
        return;
      case 'watching':
        switch (state) {
          case 'ended':
            this.stage = { kind: 'freeRunning' };
            return;
          case 'buffering':
          case 'paused':
            this.requestAutoRecovery(state === 'paused');
            return;
          default:
            return;
        }
      case 'resyncing':
        // 보낸 seek 의 결과를 기다리는 동안의 상태 보고는 그 seek 의 일부다.
        if (
          (stage.step.kind === 'planned' || stage.step.kind === 'counting') &&
          INTERRUPTED_STATES.includes(state)
        ) {
          this.requestAutoRecovery(state === 'paused');
        }
        return;
      default:
        return;
    }
  }

  private applyPositionReport(positionSec: number): void {
    if (this.failIfTimedOut()) {
      return;
    }
    const report: PositionReport = {
      atMs: this.now(),
      positionSec,
    };
    const { stage } = this;
    switch (stage.kind) {
      case 'warming':
      case 'calibrating':
      case 'preRollBuffering':
      case 'starting': {
        const pair = getStablePair(stage.gate, report);
        if (pair === undefined) {
          this.stage = {
            ...stage,
            gate: followReport(stage.gate, report),
          };
          return;
        }
        this.applyStablePair(stage, pair, report);
        return;
      }
      case 'preRoll':
        this.stage = {
          ...stage,
          lastReportedSec: positionSec,
        };
        return;
      case 'watching': {
        // 편차로 게임 시계를 고치지 않는다: 허용 오차 안이면 그대로 두고, 같은 방향으로 계속 벗어나면 다시 맞춘다.
        const driftMs = secToMs(positionSec - this.currentTime);
        if (Math.abs(driftMs) <= SYNC_TOLERANCE_MS + DRIFT_ROUNDING_MS) {
          if (stage.drift === null) {
            return;
          }
          this.stage = {
            ...stage,
            drift: null,
          };
          return;
        }
        const isAhead = driftMs > 0;
        if (stage.drift === null || stage.drift.isAhead !== isAhead) {
          this.stage = {
            ...stage,
            drift: {
              isAhead,
              fromAtMs: report.atMs,
            },
          };
          return;
        }
        if (report.atMs - stage.drift.fromAtMs >= SUSTAINED_DRIFT_MS) {
          this.requestAutoRecovery(false);
        }
        return;
      }
      case 'resyncing':
        this.applyResyncReport(stage.trigger, stage.step, report);
        return;
      default:
        return;
    }
  }

  private applyStablePair(
    stage: Extract<Stage, { kind: 'warming' | 'calibrating' | 'preRollBuffering' | 'starting' }>,
    pair: readonly [PositionReport, PositionReport],
    report: PositionReport,
  ): void {
    switch (stage.kind) {
      case 'warming':
        this.calibrate(stage.isResuming, stage.waitFromAtMs, report);
        return;
      case 'calibrating': {
        const seekLeadMs = getStartAtMs(pair, this.videoStartSec) - stage.seekAtMs;
        const songSeekSec = this.videoStartSec - msToSec(seekLeadMs);
        if (stage.isResuming && this.currentTime > songSeekSec) {
          this.startSongWhileHeld(seekLeadMs, report);
          return;
        }
        this.startPreRoll(seekLeadMs, report);
        return;
      }
      case 'preRollBuffering':
        this.startPreRoll(stage.seekLeadMs, report);
        return;
      case 'starting': {
        const startedAtMs = getStartAtMs(pair, this.videoStartSec);
        if (getDistance(startedAtMs, stage.startAtMs) > SYNC_TOLERANCE_MS) {
          this.fail('startFailed');
          return;
        }
        this.stage = {
          kind: 'watching',
          drift: null,
        };
        return;
      }
    }
  }

  private applyResyncReport(
    trigger: ResyncTrigger,
    step: ResyncStep,
    report: PositionReport,
  ): void {
    if (step.kind === 'counting') {
      return;
    }
    if (step.kind === 'planned') {
      this.stage = {
        kind: 'resyncing',
        trigger,
        step: {
          ...step,
          lastReportedSec: report.positionSec,
        },
      };
      return;
    }
    const pair = getStablePair(step.gate, report);
    if (pair === undefined) {
      this.stage = {
        kind: 'resyncing',
        trigger,
        step: {
          ...step,
          gate: followReport(step.gate, report),
        },
      };
      return;
    }
    const nowMs = this.now();
    const heldSec = this.currentTime;
    switch (step.kind) {
      case 'warming': {
        const leadStartSec = heldSec - msToSec(RESUME_LEAD_MS);
        const isLeadClamped = leadStartSec < 0;
        this.player.requestPlay(isLeadClamped ? 0 : leadStartSec);
        const gate: ReportGate = {
          kind: 'seeking',
          fromSec: report.positionSec,
        };
        this.stage = {
          kind: 'resyncing',
          trigger,
          step: isLeadClamped
            ? {
                kind: 'probing',
                seekAtMs: nowMs,
                gate,
              }
            : {
                kind: 'measuring',
                seekAtMs: nowMs,
                gate,
              },
        };
        return;
      }
      case 'measuring': {
        const resumeAtMs = getStartAtMs(pair, heldSec - msToSec(RESUME_LEAD_MS)) + RESUME_LEAD_MS;
        // 실측이 끝났을 때 영상이 이미 정지 값을 지났으면 그 계획으로는 맞출 수 없다.
        if (resumeAtMs <= nowMs) {
          this.requestAutoRecovery(false);
          return;
        }
        this.stage = {
          kind: 'resyncing',
          trigger,
          step: {
            kind: 'counting',
            resumeAtMs,
          },
        };
        return;
      }
      case 'probing':
        this.stage = {
          kind: 'resyncing',
          trigger,
          step: {
            kind: 'planned',
            resumeAtMs: nowMs + RESUME_LEAD_MS,
            probeLeadMs: getStartAtMs(pair, 0) - step.seekAtMs,
            lastReportedSec: report.positionSec,
          },
        };
        return;
      case 'confirming': {
        if (this.clock.kind === 'flowing') {
          this.stage = {
            kind: 'watching',
            drift: null,
          };
          return;
        }
        const heldMs = secToMs(heldSec);
        const reachAtMs = getStartAtMs(pair, 0) + heldMs;
        if (reachAtMs <= nowMs && heldMs > PLANNED_RESUME_MAX_MS) {
          this.requestAutoRecovery(false);
          return;
        }
        this.stage = {
          kind: 'resyncing',
          trigger,
          step: {
            kind: 'counting',
            resumeAtMs: reachAtMs > nowMs ? reachAtMs : step.resumeAtMs,
          },
        };
        return;
      }
    }
  }

  private applyTick(): void {
    if (this.failIfTimedOut()) {
      return;
    }
    const { stage } = this;
    const nowMs = this.now();
    switch (stage.kind) {
      case 'preRoll': {
        const clockSec = this.currentTime;
        const songSeekSec = this.videoStartSec - msToSec(stage.seekLeadMs);
        if (clockSec < songSeekSec) {
          return;
        }
        this.player.requestPlay(this.videoStartSec);
        this.player.setVolume(this.volume);
        const seekAtMs = this.now();
        this.stage = {
          kind: 'starting',
          seekAtMs,
          startAtMs: seekAtMs + secToMs(this.videoStartSec - clockSec),
          gate: {
            kind: 'seeking',
            fromSec: stage.lastReportedSec,
          },
        };
        return;
      }
      case 'starting':
        // 곡 시작 seek 를 먼저 보낸 재개는 게임 시계가 S 에 닿는 시각이 그 seek 의 결과 시각이 되도록 흐른다.
        if (this.clock.kind === 'stopped') {
          const resumeAtMs = stage.startAtMs - secToMs(this.videoStartSec - this.clock.sec);
          if (nowMs >= resumeAtMs) {
            this.flowFromHeld(resumeAtMs);
          }
        }
        return;
      case 'endedCountdown':
        if (nowMs >= stage.resumeAtMs) {
          this.flowFromHeld(stage.resumeAtMs);
          this.stage = { kind: 'freeRunning' };
        }
        return;
      case 'resyncing':
        this.advanceResync(stage.trigger, stage.step, nowMs);
        return;
      default:
        return;
    }
  }

  private advanceResync(trigger: ResyncTrigger, step: ResyncStep, nowMs: number): void {
    switch (step.kind) {
      case 'planned': {
        // 이번 재개에서 잰 지연만큼 걸리면 둘째 0초 seek 의 영상이 계획 재개 시각에 정지 값에 닿는다.
        const secondSeekAtMs = step.resumeAtMs - step.probeLeadMs - secToMs(this.currentTime);
        if (nowMs >= secondSeekAtMs) {
          this.player.requestPlay(0);
          this.stage = {
            kind: 'resyncing',
            trigger,
            step: {
              kind: 'confirming',
              resumeAtMs: step.resumeAtMs,
              seekAtMs: nowMs,
              gate: {
                kind: 'seeking',
                fromSec: step.lastReportedSec,
              },
            },
          };
        }
        return;
      }
      case 'confirming':
        if (
          this.clock.kind === 'stopped' &&
          nowMs >= step.resumeAtMs &&
          secToMs(this.clock.sec) <= PLANNED_RESUME_MAX_MS
        ) {
          this.resumeFromHeld(trigger, step.resumeAtMs);
        }
        return;
      case 'counting':
        if (nowMs >= step.resumeAtMs) {
          this.resumeFromHeld(trigger, step.resumeAtMs);
          this.stage = {
            kind: 'watching',
            drift: null,
          };
        }
        return;
      default:
        return;
    }
  }

  // 보정 seek 결과의 진행 시작 시각으로 이 세션의 seek 지연을 잰다. 곡 시작 seek 는 그만큼 앞당겨 보낸다.
  private calibrate(isResuming: boolean, waitFromAtMs: number, lastReport: PositionReport): void {
    this.player.requestPlay(this.videoStartSec);
    this.stage = {
      kind: 'calibrating',
      isResuming,
      waitFromAtMs,
      seekAtMs: this.now(),
      gate: {
        kind: 'seeking',
        fromSec: lastReport.positionSec,
      },
    };
  }

  private startPreRoll(seekLeadMs: number, lastReport: PositionReport): void {
    this.clock = {
      kind: 'flowing',
      fromAtMs: this.now(),
      fromSec: this.currentTime,
    };
    this.stage = {
      kind: 'preRoll',
      seekLeadMs,
      lastReportedSec: lastReport.positionSec,
    };
  }

  // 곡 시작 seek 를 보낼 시점이 이미 지난 정지 값에서는 게임 시계를 세운 채 seek 부터 보낸다.
  private startSongWhileHeld(seekLeadMs: number, lastReport: PositionReport): void {
    this.player.requestPlay(this.videoStartSec);
    this.player.setVolume(this.volume);
    const seekAtMs = this.now();
    this.stage = {
      kind: 'starting',
      seekAtMs,
      startAtMs: seekAtMs + seekLeadMs,
      gate: {
        kind: 'seeking',
        fromSec: lastReport.positionSec,
      },
    };
  }

  private startResync(trigger: ResyncTrigger): void {
    this.stage = {
      kind: 'resyncing',
      trigger,
      step: {
        kind: 'warming',
        waitFromAtMs: this.now(),
        gate: {
          kind: 'following',
          previous: null,
        },
      },
    };
  }

  private requestAutoRecovery(isPlayerPaused: boolean): void {
    const isRecovering = this.stage.kind === 'resyncing' && this.stage.trigger === 'auto';
    if (
      isRecovering ||
      (this.autoResumedFromSec !== null &&
        secToMs(this.currentTime - this.autoResumedFromSec) < AUTO_RECOVERY_INTERVAL_MS)
    ) {
      this.failResync();
      return;
    }
    this.stopClock();
    this.player.setVolume(this.warmVolume);
    // 사용자가 멈추지 않았는데 멈췄으면 YouTube 가 스스로 재개하지 않는다.
    if (isPlayerPaused) {
      this.player.resume();
    }
    this.startResync('auto');
  }

  private resumeFromHeld(trigger: ResyncTrigger, resumeAtMs: number): void {
    this.player.setVolume(this.volume);
    if (trigger === 'auto') {
      this.autoResumedFromSec = this.currentTime;
    }
    this.flowFromHeld(resumeAtMs);
  }

  private flowFromHeld(resumeAtMs: number): void {
    if (this.clock.kind === 'stopped') {
      this.clock = {
        kind: 'flowing',
        fromAtMs: resumeAtMs,
        fromSec: this.clock.sec,
      };
    }
  }

  private getClockStatus(): PlaybackStatus {
    const remainingMs = secToMs(this.videoStartSec - this.currentTime);
    return remainingMs > 0
      ? {
          kind: 'countdown',
          digit: getDigit(remainingMs),
        }
      : { kind: 'running' };
  }

  private getResumeCountdownStatus(resumeAtMs: number): PlaybackStatus {
    return this.clock.kind === 'stopped'
      ? {
          kind: 'countdown',
          digit: getDigit(resumeAtMs - this.now()),
        }
      : this.getClockStatus();
  }

  // 보고가 tick 보다 먼저 제한 시각 뒤에 도착해도 제한이 우회되지 않도록 보고 처리 앞에서도 부른다.
  private failIfTimedOut(): boolean {
    const { stage } = this;
    const nowMs = this.now();
    switch (stage.kind) {
      case 'warming':
      case 'calibrating':
      case 'preRollBuffering':
        if (nowMs - stage.waitFromAtMs <= WAIT_LIMIT_MS) {
          return false;
        }
        this.fail('startFailed');
        return true;
      case 'starting':
        if (nowMs - stage.seekAtMs <= VERIFY_LIMIT_MS) {
          return false;
        }
        this.fail('startFailed');
        return true;
      case 'resyncing': {
        const waitFromAtMs = getResyncWaitFromAtMs(stage.step);
        if (waitFromAtMs === null || nowMs - waitFromAtMs <= WAIT_LIMIT_MS) {
          return false;
        }
        this.failResync();
        return true;
      }
      default:
        return false;
    }
  }

  private fail(failure: PlaybackFailure): void {
    this.stopClock();
    this.stage = { kind: 'failed' };
    this.handlers.onFailure(failure);
  }

  // 재동기화 실패는 오류가 아니다: 사용자 일시정지와 같은 상태로 멈추고, 다시 시도는 사용자의 재개뿐이다.
  private failResync(): void {
    this.enterPause();
    this.notifyStatus();
    this.handlers.onResyncFailed();
  }

  private enterPause(): void {
    const isVideoEnded = this.stage.kind === 'freeRunning' || this.stage.kind === 'endedCountdown';
    this.stopClock();
    this.player.pause();
    let route: ResumeRoute = 'resync';
    if (isVideoEnded) {
      route = 'videoEnded';
    } else if (this.currentTime < this.videoStartSec) {
      route = 'beforeStart';
    }
    this.stage = {
      kind: 'paused',
      route,
    };
  }

  // 실패는 onFailure 로 한 번만 알리고, 그 뒤로는 상태를 알리지 않는다.
  private notifyStatus(): void {
    if (this.stage.kind === 'failed') {
      return;
    }
    const { status } = this;
    if (isShallowEqual(status, this.shownStatus)) {
      return;
    }
    this.shownStatus = status;
    this.handlers.onStatusChange(status);
  }

  private stopClock(): void {
    this.clock = {
      kind: 'stopped',
      sec: this.currentTime,
    };
  }
}

function followReport(gate: ReportGate, report: PositionReport): ReportGate {
  if (gate.kind === 'seeking' && report.positionSec >= gate.fromSec) {
    return gate;
  }
  return {
    kind: 'following',
    previous: report,
  };
}

function getStablePair(
  gate: ReportGate,
  report: PositionReport,
): readonly [PositionReport, PositionReport] | undefined {
  if (gate.kind !== 'following' || gate.previous === null) {
    return undefined;
  }
  const { previous } = gate;
  const intervalMs = report.atMs - previous.atMs;
  if (intervalMs < STABLE_MIN_INTERVAL_MS) {
    return undefined;
  }
  const rate = secToMs(report.positionSec - previous.positionSec) / intervalMs;
  return rate >= STABLE_MIN_RATE && rate <= STABLE_MAX_RATE ? [previous, report] : undefined;
}

// 보고 위치는 기대 시작 위치에서 1배속으로 흘렀다고 보고, 두 보고가 가리키는 진행 시작 시각을 평균한다.
function getStartAtMs(pair: readonly [PositionReport, PositionReport], startSec: number): number {
  const [first, second] = pair;
  const firstStartAtMs = first.atMs - secToMs(first.positionSec - startSec);
  const secondStartAtMs = second.atMs - secToMs(second.positionSec - startSec);
  return (firstStartAtMs + secondStartAtMs) / 2;
}

function getResyncWaitFromAtMs(step: ResyncStep): number | null {
  switch (step.kind) {
    case 'warming':
      return step.waitFromAtMs;
    case 'measuring':
    case 'probing':
    case 'confirming':
      return step.seekAtMs;
    case 'planned':
    case 'counting':
      return null;
  }
}

function getDigit(remainingMs: number): 1 | 2 | 3 {
  const digit = Math.ceil(remainingMs / COUNTDOWN_STEP_MS);
  if (digit >= 3) {
    return 3;
  }
  return digit === 2 ? 2 : 1;
}
