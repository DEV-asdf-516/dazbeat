import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../config.js';
import { SCENE_KEYS, exitScene, startScene } from '../sceneRoutes.js';
import type { GameplaySceneData, ResultSceneData, SceneRequest } from '../sceneRoutes.js';
import { RhythmClock } from '../../audio/RhythmClock.js';
import { YouTubePlayer, loadYouTubeIframeApi } from '../../audio/YouTubePlayer.js';
import type { YouTubePlayerState } from '../../audio/YouTubePlayer.js';
import { YouTubeTimeSource } from '../../audio/YouTubeTimeSource.js';
import type { PreparedChart, VerifiedPlay } from '../../data/playSession.js';
import type { PlaySubmission } from '../../data/playSubmission.js';
import type { ChartRef } from '../../data/songs.js';
import { GameplaySession } from '../../rhythm/GameplaySession.js';
import { JUDGMENT_WINDOWS, getJudgmentEventCount } from '../../rhythm/judgment.js';
import { LANES, mapLanes } from '../../rhythm/lanes.js';
import { getGameFraction, getPlaybackStartMs } from '../../rhythm/playTiming.js';
import type {
  Chart,
  GameplayResult,
  GameplayState,
  JudgmentEvent,
  Lane,
} from '../../rhythm/types.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import { DEFAULT_SETTINGS, MV_MODES } from '../../storage/settings.js';
import type { Settings } from '../../storage/settings.js';
import { playFailureFx, playFullComboFx } from './endingFx.js';
import { getPlayingStatus, isLoadingStatus } from './gameplayStatus.js';
import type { GameplayStatus } from './gameplayStatus.js';
import { addHudEffect, addHudText } from './hudObjects.js';
import {
  JUDGMENT_SHIMMER_ID,
  getHitBloomIntensity,
  getJudgmentPopScale,
  hasJudgmentGlow,
  hasJudgmentShimmer,
} from './judgmentEffects.js';
import { STAYING } from '../sceneExit.js';
import type { SceneExit } from '../sceneExit.js';
import { clamp, cycleItem } from '../../range.js';
import { msToSec } from '../../time.js';
import { Button } from '../ui/Button.js';
import { addCelestialAtmosphere } from '../celestial/celestialAtmosphere.js';
import {
  playCelestialOnce,
  queueCelestialTextures,
  setCelestialLoopActive,
} from '../celestial/celestialSprites.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.js';
import { formatKeyCode, formatScore } from '../ui/format.js';
import {
  getErrorKeyAction,
  getLoadingKeyAction,
  getPlayingKeyAction,
  getReadyKeyAction,
  readGameplayKey,
} from './gameplayInput.js';
import type { CommonKeyAction, PlayingKeyAction } from './gameplayInput.js';
import { LaneFx } from './LaneFx.js';
import { LIGHT_TEXTURES, addLight, ensureLightTextures } from '../ui/lightTextures.js';
import { NoteLayer } from './NoteLayer.js';
import { OrbitTrace } from './OrbitTrace.js';
import { StarlightGauge } from './StarlightGauge.js';
import { getRunEnding } from './runEnding.js';
import {
  COLORS,
  GAMEPLAY_DEPTH,
  JUDGMENT_COLORS,
  MOTION,
  cssColor,
  textStyle,
} from '../ui/theme.js';
import { WorldActivation } from './worldActivation.js';

const LANE_WIDTH_PX = 120;
const PLAY_AREA_WIDTH_PX = LANE_WIDTH_PX * LANES.length;
const LANES_LEFT_PX = (GAME_WIDTH - PLAY_AREA_WIDTH_PX) / 2;
// 판정·콤보는 레인을 따라 놓이고, 안내·종료 문구는 화면 가운데에 놓인다. 지금은 두 값이 같다.
const LANES_CENTER_X_PX = LANES_LEFT_PX + PLAY_AREA_WIDTH_PX / 2;
const SCREEN_CENTER_X_PX = GAME_WIDTH / 2;
const LANE_PANEL_ALPHA = 0.85;
const LANE_BORDER_WIDTH_PX = 1;
const LANE_BORDER_ALPHA = 0.5;
const LANE_DIVIDER_WIDTH_PX = 1;
const LANE_DIVIDER_ALPHA = 0.6;
const JUDGE_LINE_Y_PX = 920;
const KEY_LABEL_Y_PX = 968;
const JUDGMENT_Y_PX = 780;
const JUDGMENT_HOLD_MS = 300;
const JUDGMENT_FADE_MS = 150;
const JUDGMENT_FLASH_ALPHA = 0.9;
const JUDGMENT_FLASH_MS = 140;
const JUDGMENT_GLOW_ALPHA = 0.2;
const JUDGMENT_GLOW_WIDTH_SCALE = [1.1, 1.4] as const;
const JUDGMENT_GLOW_HEIGHT_PX = [56, 80] as const;
const COMBO_Y_PX = 360;
const COMBO_LABEL_Y_PX = 430;
// 같은 월광색 노트가 레인 가운데의 큰 숫자 위를 지날 때 숫자와 섞이지 않도록 한 단계 물린다.
const COMBO_ALPHA = 0.6;
const SCORE_RIGHT_X_PX = 1800;
const SCORE_LABEL_Y_PX = 96;
const SCORE_Y_PX = 128;
const PROGRESS_Y_PX = 40;
// 진행 궤도(y 40)와 SCORE 라벨(y 96) 사이. 오른쪽 끝은 SCORE 와 같은 세로줄에 맞춘다.
const STARLIGHT_Y_PX = 68;
const INTRO_TITLE_Y_PX = 440;
const INTRO_DIFFICULTY_Y_PX = 520;
const STATUS_Y_PX = 600;
const MV_MODE_X_PX = 120;
const MV_MODE_Y_PX = 144;
const MV_MODE_HOLD_MS = 700;
const MV_MODE_FADE_MS = 300;
const ERROR_MESSAGE_Y_PX = 480;
const ERROR_HINT_Y_PX = 540;
const ERROR_BUTTON_Y_PX = 600;
const COMBO_GLINT_ID = 'R37';
// 콤보 자릿수와 무관하게 숫자·라벨 글자와 겹치지 않도록 라벨 바로 아래 고정 위치에 둔다.
const COMBO_GLINT_Y_PX = COMBO_LABEL_Y_PX + 40;
// 판정 글자의 최대 pop scale 에서도 글자와 겹치지 않는 높이다.
const JUDGMENT_SHIMMER_Y_PX = JUDGMENT_Y_PX + 56;
const LOADING_STAR_ID = 'R47';
const LOADING_STAR_GAP_PX = 24;

const STATUS_MESSAGES = {
  loading: 'gameplay.loading',
  awaitingStart: 'gameplay.pressEnterToStart',
  preparing: 'gameplay.preparing',
  buffering: 'gameplay.buffering',
  paused: 'gameplay.paused',
} as const satisfies Record<Exclude<GameplayStatus, 'none'>, string>;

function getLaneXPx(lane: Lane): number {
  return LANES_LEFT_PX + LANE_WIDTH_PX * lane + LANE_WIDTH_PX / 2;
}

interface LaneView {
  keyLabel: Phaser.GameObjects.Text;
}

interface GameplayView {
  lanes: Record<Lane, LaneView>;
  laneFx: LaneFx;
  comboGlint: Phaser.GameObjects.Sprite;
  judgmentShimmer: Phaser.GameObjects.Sprite;
  loadingStar: Phaser.GameObjects.Sprite;
  judgmentGlow: Phaser.GameObjects.Image;
  judgmentText: Phaser.GameObjects.Text;
  judgmentFlash: Phaser.GameObjects.Text;
  comboText: Phaser.GameObjects.Text;
  scoreText: Phaser.GameObjects.Text;
  progress: OrbitTrace;
  starlight: StarlightGauge;
  introTitle: Phaser.GameObjects.Text;
  introDifficulty: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
  mvModeText: Phaser.GameObjects.Text;
  quitDialog: ConfirmDialog;
}

export interface RankedPlay {
  submit(sessionId: string, submission: PlaySubmission): Promise<VerifiedPlay>;
}

interface PreparedRun extends ChartRef {
  chart: Chart;
  // 비로그인·발급 실패면 그 판은 랭킹 없이 진행한다.
  rankedSessionId: string | null;
  view: GameplayView;
  player: YouTubePlayer;
  timeSource: YouTubeTimeSource;
}

interface PlayRun extends PreparedRun {
  session: GameplaySession;
  clock: RhythmClock;
  notes: NoteLayer;
  playerState: YouTubePlayerState;
  activation: WorldActivation;
  isQuitConfirmOpen: boolean;
  hud: { combo: number; score: number };
}

type GameplayPhase =
  | { kind: 'loading' }
  | { kind: 'ready'; run: PreparedRun }
  | { kind: 'starting'; run: PreparedRun }
  | { kind: 'error' }
  | { kind: 'playing'; run: PlayRun }
  | { kind: 'ending' };

export class GameplayScene extends Phaser.Scene {
  private runToken: object | null = null;
  private phase: GameplayPhase = { kind: 'loading' };
  private exit: SceneExit<SceneRequest> = STAYING;
  private player: YouTubePlayer | null = null;
  private settings: Settings = DEFAULT_SETTINGS;

  constructor(
    private readonly save: LocalSave,
    private readonly mvLayer: HTMLElement,
    private readonly prepareChart: (ref: ChartRef) => Promise<PreparedChart>,
    private readonly i18n: I18n,
    private readonly celestial: CelestialCatalog,
    private readonly rankedPlay: RankedPlay,
  ) {
    super(SCENE_KEYS.gameplay);
  }

  preload(): void {
    queueCelestialTextures(this, this.celestial);
  }

  create(data: GameplaySceneData): void {
    this.exit = STAYING;
    addCelestialAtmosphere(this, this.celestial, 'gameplay');
    const token = {};
    this.runToken = token;
    this.phase = { kind: 'loading' };
    this.settings = this.save.loadSettings();
    this.mvLayer.dataset.mvMode = this.settings.mvMode;
    ensureLightTextures(this);
    this.cameras.main.fadeIn(MOTION.mediumMs);

    this.add
      .image(LANES_LEFT_PX, 0, LIGHT_TEXTURES.fadeTop)
      .setOrigin(0, 0)
      .setDisplaySize(PLAY_AREA_WIDTH_PX, GAME_HEIGHT)
      .setTint(COLORS.background)
      .setAlpha(LANE_PANEL_ALPHA)
      .setDepth(GAMEPLAY_DEPTH.lanePanel);
    [LANES_LEFT_PX, LANES_LEFT_PX + PLAY_AREA_WIDTH_PX].forEach((xPx) => {
      this.add
        .rectangle(xPx, GAME_HEIGHT / 2, LANE_BORDER_WIDTH_PX, GAME_HEIGHT, COLORS.border)
        .setAlpha(LANE_BORDER_ALPHA)
        .setDepth(GAMEPLAY_DEPTH.lanePanel);
    });
    LANES.slice(1).forEach((lane) => {
      this.add
        .rectangle(
          LANES_LEFT_PX + LANE_WIDTH_PX * lane,
          GAME_HEIGHT / 2,
          LANE_DIVIDER_WIDTH_PX,
          GAME_HEIGHT,
          COLORS.border,
        )
        .setAlpha(LANE_DIVIDER_ALPHA)
        .setDepth(GAMEPLAY_DEPTH.laneDivider);
    });
    addHudText(
      this,
      LANES_CENTER_X_PX,
      COMBO_LABEL_Y_PX,
      'COMBO',
      textStyle('meta', COLORS.textMuted),
    );
    addHudText(
      this,
      SCORE_RIGHT_X_PX,
      SCORE_LABEL_Y_PX,
      'SCORE',
      textStyle('meta', COLORS.textMuted),
    ).setOrigin(1, 0);
    // STARLIGHT 는 SCORE 위에 두어 체력·점수를 우상단 한 묶음으로 읽게 한다.
    // YouTube 임베드가 재생 시작·일시정지 때 띄우는 제목 바(좌상단)·버튼(아래 양 구석)과도 겹치지 않는다.
    const starlight = new StarlightGauge(this, SCORE_RIGHT_X_PX, STARLIGHT_Y_PX);
    const keyBindings = this.settings.keyBindings;
    const view: GameplayView = {
      lanes: mapLanes((lane) => ({
        keyLabel: addHudText(
          this,
          getLaneXPx(lane),
          KEY_LABEL_Y_PX,
          formatKeyCode(keyBindings[lane]),
          textStyle('meta', COLORS.textMuted),
        ),
      })),
      laneFx: new LaneFx(this, this.celestial, mapLanes(getLaneXPx), JUDGE_LINE_Y_PX),
      comboGlint: addHudEffect(
        this,
        this.celestial,
        COMBO_GLINT_ID,
        LANES_CENTER_X_PX,
        COMBO_GLINT_Y_PX,
      ),
      judgmentShimmer: addHudEffect(
        this,
        this.celestial,
        JUDGMENT_SHIMMER_ID,
        LANES_CENTER_X_PX,
        JUDGMENT_SHIMMER_Y_PX,
      ),
      loadingStar: addHudEffect(this, this.celestial, LOADING_STAR_ID, 0, 0),
      // 같은 depth 에서 글자 아래에 그려지도록 글자보다 먼저 만든다.
      judgmentGlow: addLight(this, LIGHT_TEXTURES.glow, LANES_CENTER_X_PX, JUDGMENT_Y_PX)
        .setAlpha(0)
        .setDepth(GAMEPLAY_DEPTH.text),
      judgmentText: addHudText(
        this,
        LANES_CENTER_X_PX,
        JUDGMENT_Y_PX,
        '',
        textStyle('judgment', COLORS.textPrimary),
      ).setAlpha(0),
      // 글자 위에 겹쳐 그리도록 글자 다음에 만든다.
      judgmentFlash: addHudText(
        this,
        LANES_CENTER_X_PX,
        JUDGMENT_Y_PX,
        '',
        textStyle('judgment', COLORS.note),
      )
        .setAlpha(0)
        .setBlendMode(Phaser.BlendModes.SCREEN),
      comboText: addHudText(
        this,
        LANES_CENTER_X_PX,
        COMBO_Y_PX,
        '0',
        textStyle('combo', COLORS.textPrimary),
      ).setAlpha(COMBO_ALPHA),
      scoreText: addHudText(
        this,
        SCORE_RIGHT_X_PX,
        SCORE_Y_PX,
        formatScore(0),
        textStyle('hudScore', COLORS.textPrimary),
      ).setOrigin(1, 0),
      progress: new OrbitTrace(this, LANES_LEFT_PX, PLAY_AREA_WIDTH_PX, PROGRESS_Y_PX),
      starlight,
      introTitle: addHudText(
        this,
        SCREEN_CENTER_X_PX,
        INTRO_TITLE_Y_PX,
        data.song.title,
        textStyle('title', COLORS.textPrimary),
      ),
      introDifficulty: addHudText(
        this,
        SCREEN_CENTER_X_PX,
        INTRO_DIFFICULTY_Y_PX,
        data.difficulty.toUpperCase(),
        textStyle('secondary', COLORS.textSecondary),
      ),
      statusText: addHudText(
        this,
        SCREEN_CENTER_X_PX,
        STATUS_Y_PX,
        '',
        textStyle('meta', COLORS.textMuted),
      ),
      mvModeText: addHudText(
        this,
        MV_MODE_X_PX,
        MV_MODE_Y_PX,
        '',
        textStyle('secondary', COLORS.textPrimary),
      )
        .setOrigin(0)
        .setAlpha(0),
      quitDialog: new ConfirmDialog(this, {
        onCancel: () => {
          if (this.phase.kind === 'playing') {
            this.closeQuitConfirm(this.phase.run);
          }
        },
        onAccept: () => this.backToSongSelect(),
      }),
    };
    this.setStatus(view, 'loading');

    const onKeyDown = (event: KeyboardEvent): void => this.handleKeyDown(event, view);
    const onKeyUp = (event: KeyboardEvent): void => this.handleKeyUp(event);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      this.player?.destroy();
      this.player = null;
      this.runToken = null;
    });

    void this.startRun(token, data, view).catch((error: unknown) => {
      console.error('Failed to start gameplay', error);
    });
  }

  override update(): void {
    if (this.phase.kind !== 'playing') {
      return;
    }
    const run = this.phase.run;
    run.timeSource.sync();
    const songTimeMs = run.clock.getTimeMs();
    if (this.applyJudgments(run, run.session.update(songTimeMs))) {
      return;
    }
    const state = run.session.getState();
    const activation = run.activation.advance(state.combo, songTimeMs);
    run.view.laneFx.setActivation(activation.level);
    if (activation.reachedFull) {
      playCelestialOnce(run.view.comboGlint);
    }
    run.notes.render(run.session, songTimeMs);
    this.renderHud(run, state, songTimeMs);
    if (run.clock.getPlaybackMs() >= run.song.gameStartMs) {
      this.hideIntro(run.view);
    }
    this.finishIfEnded(run);
  }

  private async startRun(
    token: object,
    data: GameplaySceneData,
    view: GameplayView,
  ): Promise<void> {
    const { song, difficulty, chartId } = data;

    let failedMessage = this.i18n.t('gameplay.chartLoadFailed');
    let prepared: PreparedChart;
    try {
      prepared = await this.prepareChart(data);

      if (!this.isCurrentRun(token)) {
        return;
      }

      failedMessage = this.i18n.t('gameplay.playerLoadFailed');
      await loadYouTubeIframeApi();
    } catch (error) {
      if (this.isCurrentRun(token)) {
        this.showLoadError(view, failedMessage, error);
      }
      return;
    }
    if (!this.isCurrentRun(token)) {
      return;
    }
    const { chart, rankedSessionId } = prepared;

    let player: YouTubePlayer;

    try {
      player = new YouTubePlayer(this.mvLayer, song.youtubeVideoId, {
        onReady: () => {
          if (!this.isCurrentRun(token) || this.phase.kind !== 'loading') {
            return;
          }
          player.setVolume(this.settings.masterVolume * this.settings.musicVolume);
          this.phase = {
            kind: 'ready',
            run: {
              song,
              difficulty,
              chartId,
              chart,
              rankedSessionId,
              view,
              player,
              timeSource,
            },
          };
          this.setStatus(view, 'awaitingStart');
        },
        onStateChange: (state) => {
          if (this.isCurrentRun(token)) {
            this.handlePlayerStateChange(state);
          }
        },
        onError: (kind, code) => {
          if (
            !this.isCurrentRun(token) ||
            this.phase.kind === 'ending' ||
            this.phase.kind === 'error'
          ) {
            return;
          }
          player.destroy();
          const message = this.i18n.t('youtubeError.withCode', {
            message: this.i18n.t(`youtubeError.${kind}`),
            code,
          });
          this.showLoadError(
            view,
            this.i18n.t('gameplay.videoError', { message }),
            code,
            kind === 'embeddingNotAllowed'
              ? this.i18n.t('youtubeError.embeddingNotAllowedHint')
              : undefined,
          );
        },
      });
    } catch (error) {
      this.showLoadError(view, this.i18n.t('gameplay.playerLoadFailed'), error);
      return;
    }
    this.player = player;
    const timeSource = new YouTubeTimeSource(player, () => performance.now());
  }

  private isCurrentRun(token: object): boolean {
    return this.runToken === token;
  }
  private handlePlayerStateChange(state: YouTubePlayerState): void {
    switch (this.phase.kind) {
      case 'ready':
      case 'starting': {
        this.phase.run.timeSource.handleStateChange(state);
        if (state === 'playing') {
          this.beginPlay(this.phase.run);
        }
        return;
      }
      case 'playing': {
        const run = this.phase.run;
        run.timeSource.handleStateChange(state);
        run.playerState = state;
        this.setStatus(run.view, getPlayingStatus(state));
        return;
      }
      default:
        return;
    }
  }

  private setStatus(view: GameplayView, status: GameplayStatus): void {
    view.statusText.setText(status === 'none' ? '' : this.i18n.t(STATUS_MESSAGES[status]));
    const isLoading = isLoadingStatus(status);
    if (isLoading) {
      const bounds = view.statusText.getBounds();
      view.loadingStar.setPosition(bounds.left - LOADING_STAR_GAP_PX, bounds.centerY);
    }
    setCelestialLoopActive(view.loadingStar, isLoading);
  }

  private beginPlay(prepared: PreparedRun): void {
    const { chart } = prepared;
    const session = new GameplaySession(chart, JUDGMENT_WINDOWS);
    const clock = new RhythmClock(
      prepared.timeSource,
      this.settings.inputOffsetMs,
      chart.offsetMs,
      {
        audioStartTimeSec: 0,
        songStartMs: 0,
      },
    );
    this.setStatus(prepared.view, 'none');
    this.phase = {
      kind: 'playing',
      run: {
        ...prepared,
        session,
        clock,
        notes: new NoteLayer(this, {
          notes: chart.notes,
          laneCenterXPx: mapLanes(getLaneXPx),
          judgeLineYPx: JUDGE_LINE_Y_PX,
          scrollSpeedPxPerSecond: this.settings.scrollSpeedPxPerSecond,
        }),
        playerState: 'playing',
        isQuitConfirmOpen: false,
        hud: {
          combo: 0,
          score: 0,
        },
        activation: new WorldActivation(getJudgmentEventCount(chart.notes), clock.getTimeMs()),
      },
    };
  }

  private showLoadError(view: GameplayView, message: string, error: unknown, hint?: string): void {
    console.error(message, error);
    view.quitDialog.hide();
    this.hideIntro(view);
    this.setStatus(view, 'none');
    addHudText(
      this,
      SCREEN_CENTER_X_PX,
      ERROR_MESSAGE_Y_PX,
      message,
      textStyle('heading', COLORS.textPrimary),
    );
    if (hint !== undefined) {
      addHudText(
        this,
        SCREEN_CENTER_X_PX,
        ERROR_HINT_Y_PX,
        hint,
        textStyle('secondary', COLORS.textSecondary),
      );
    }
    const button = new Button(this, 0, ERROR_BUTTON_Y_PX, {
      variant: 'primary',
      label: this.i18n.t('gameplay.backToSongSelect'),
      onActivate: () => this.backToSongSelect(),
    });
    button.alignX(SCREEN_CENTER_X_PX, 0.5).setFocused(true).setDepth(GAMEPLAY_DEPTH.text);
    this.phase = { kind: 'error' };
  }

  private hideIntro(view: GameplayView): void {
    view.introTitle.setVisible(false);
    view.introDifficulty.setVisible(false);
  }

  private handleKeyDown(event: KeyboardEvent, view: GameplayView): void {
    if (this.exit.kind === 'leaving') {
      return;
    }
    if (event.code === 'Tab') {
      // 브라우저가 Tab 으로 포커스를 옮기지 않게 한다.
      event.preventDefault();
    }
    const key = readGameplayKey(event.code, this.settings.keyBindings);
    switch (this.phase.kind) {
      case 'loading':
      case 'starting':
        this.applyCommonKeyAction(getLoadingKeyAction(key, event.repeat), view);
        return;
      case 'ready': {
        const action = getReadyKeyAction(key, event.repeat);
        if (action.kind === 'start') {
          this.requestStart(this.phase.run);
          return;
        }
        this.applyCommonKeyAction(action, view);
        return;
      }
      case 'error':
        this.applyCommonKeyAction(getErrorKeyAction(key, event.repeat), view);
        return;
      case 'ending':
        return;
      case 'playing': {
        const run = this.phase.run;
        this.applyPlayingKeyAction(
          run,
          getPlayingKeyAction(run.isQuitConfirmOpen, run.playerState, key, event.repeat),
          view,
        );
        return;
      }
    }
  }

  private applyCommonKeyAction(action: CommonKeyAction, view: GameplayView): void {
    switch (action.kind) {
      case 'none':
        return;
      case 'leave':
        this.backToSongSelect();
        return;
      case 'cycleMvMode':
        this.cycleMvMode(view);
        return;
    }
  }

  private requestStart(run: PreparedRun): void {
    run.player.requestPlay(msToSec(getPlaybackStartMs(run.song.gameStartMs)));
    this.setStatus(run.view, 'preparing');
    this.phase = {
      kind: 'starting',
      run,
    };
  }

  private applyPlayingKeyAction(run: PlayRun, action: PlayingKeyAction, view: GameplayView): void {
    switch (action.kind) {
      case 'openQuitConfirm':
        this.openQuitConfirm(run);
        return;
      case 'closeQuitConfirm':
        this.closeQuitConfirm(run);
        return;
      case 'resume':
        run.player.resume();
        return;
      case 'pressLane':
        run.view.laneFx.press(action.lane);
        this.flashKeyLabel(run.view.lanes[action.lane].keyLabel);
        this.applyJudgments(run, run.session.press(action.lane, run.clock.getTimeMs()));
        return;
      default:
        this.applyCommonKeyAction(action, view);
        return;
    }
  }

  // 뒤의 일시정지 안내는 Enter 의 뜻이 달라지므로 가린다.
  private openQuitConfirm(run: PlayRun): void {
    run.isQuitConfirmOpen = true;
    run.player.pause();
    run.view.statusText.setVisible(false);
    run.view.quitDialog.show({
      title: this.i18n.t('gameplay.quitTitle'),
      body: this.i18n.t('gameplay.quitConfirm'),
      cancelLabel: 'CONTINUE',
      acceptLabel: 'QUIT',
      acceptTone: 'default',
    });
  }

  private closeQuitConfirm(run: PlayRun): void {
    if (!run.isQuitConfirmOpen) {
      return;
    }
    run.isQuitConfirmOpen = false;
    run.view.quitDialog.hide();
    run.view.statusText.setVisible(true);
    run.player.resume();
  }

  private backToSongSelect(): void {
    this.exit = exitScene(this, this.exit, {
      key: 'songSelect',
      data: undefined,
    });
  }

  private cycleMvMode(view: GameplayView): void {
    const next = cycleItem(MV_MODES, this.settings.mvMode, 1);
    this.mvLayer.dataset.mvMode = next;
    this.settings = {
      ...this.settings,
      mvMode: next,
    };
    try {
      this.save.saveSettings(this.settings);
    } catch (error) {
      console.error('Failed to save settings', error);
    }
    const mvModeText = view.mvModeText;
    this.tweens.killTweensOf(mvModeText);
    mvModeText.setText(`MV ${next.toUpperCase()}`).setAlpha(1);
    this.tweens.add({
      targets: mvModeText,
      alpha: 0,
      delay: MV_MODE_HOLD_MS,
      duration: MV_MODE_FADE_MS,
    });
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (this.phase.kind !== 'playing') {
      return;
    }
    const run = this.phase.run;
    const { lane } = readGameplayKey(event.code, this.settings.keyBindings);
    if (lane === null) {
      return;
    }
    this.applyJudgments(run, run.session.release(lane, run.clock.getTimeMs()));
  }

  private flashKeyLabel(keyLabel: Phaser.GameObjects.Text): void {
    this.tweens.killTweensOf(keyLabel);
    keyLabel.setColor(cssColor(COLORS.textPrimary));
    // 색은 tween 대상이 아니므로 fast 길이의 빈 tween 완료 시점에 되돌린다. 연타 시 이전 tween 은 정리된다.
    this.tweens.add({
      targets: keyLabel,
      alpha: 1,
      duration: MOTION.fastMs,
      onComplete: () => keyLabel.setColor(cssColor(COLORS.textMuted)),
    });
  }

  private applyJudgments(run: PlayRun, events: readonly JudgmentEvent[]): boolean {
    this.applyJudgmentEvents(run.view, events);
    return this.failIfDepleted(run);
  }

  private applyJudgmentEvents(view: GameplayView, events: readonly JudgmentEvent[]): void {
    events.forEach((event) => view.laneFx.judge(event));
    const lastEvent = events.at(-1);
    if (lastEvent === undefined) {
      return;
    }
    const { judgmentText, judgmentFlash, judgmentGlow } = view;
    const { judgment } = lastEvent;
    const color = JUDGMENT_COLORS[judgment];
    const intensity = getHitBloomIntensity(judgment);
    const popScale = getJudgmentPopScale(judgment);
    this.tweens.killTweensOf([judgmentText, judgmentFlash, judgmentGlow]);
    judgmentText
      .setText(judgment.toUpperCase())
      .setColor(cssColor(color))
      .setAlpha(1)
      .setScale(popScale);
    this.tweens.add({
      targets: judgmentText,
      alpha: 0,
      delay: JUDGMENT_HOLD_MS,
      duration: JUDGMENT_FADE_MS,
    });
    this.tweens.add({
      targets: judgmentText,
      scale: 1,
      duration: MOTION.fastMs,
    });
    // 글자와 같은 크기로 줄어들며 사라져 획이 어긋나 보이지 않는다.
    judgmentFlash
      .setText(judgmentText.text)
      .setAlpha(JUDGMENT_FLASH_ALPHA * intensity)
      .setScale(popScale);
    this.tweens.add({
      targets: judgmentFlash,
      alpha: 0,
      scale: 1,
      duration: JUDGMENT_FLASH_MS,
      ease: 'Quad.Out',
    });
    judgmentGlow.setAlpha(0);
    if (hasJudgmentGlow(judgment)) {
      judgmentGlow
        .setTint(color)
        .setAlpha(JUDGMENT_GLOW_ALPHA * intensity)
        .setDisplaySize(
          judgmentText.width * JUDGMENT_GLOW_WIDTH_SCALE[0],
          JUDGMENT_GLOW_HEIGHT_PX[0],
        );
      this.tweens.add({
        targets: judgmentGlow,
        alpha: 0,
        displayWidth: judgmentText.width * JUDGMENT_GLOW_WIDTH_SCALE[1],
        displayHeight: JUDGMENT_GLOW_HEIGHT_PX[1],
        duration: JUDGMENT_HOLD_MS + JUDGMENT_FADE_MS,
        ease: 'Cubic.Out',
      });
    }
    if (hasJudgmentShimmer(lastEvent.judgment)) {
      playCelestialOnce(view.judgmentShimmer);
    }
  }

  private renderHud(run: PlayRun, state: GameplayState, songTimeMs: number): void {
    const progress = clamp(
      getGameFraction(run.song.gameStartMs, run.song.gameEndMs, songTimeMs),
      0,
      1,
    );
    const { hud } = run;
    if (state.combo !== hud.combo) {
      hud.combo = state.combo;
      run.view.comboText.setText(`${state.combo}`);
    }
    if (state.score !== hud.score) {
      hud.score = state.score;
      run.view.scoreText.setText(formatScore(state.score));
    }
    run.view.progress.setProgress(progress);
    run.view.starlight.setHp(state.hp);
  }

  private finishIfEnded(run: PlayRun): void {
    const ending = getRunEnding(
      run.clock.getPlaybackMs(),
      run.song.gameEndMs,
      run.session.getProgress(),
    );
    if (ending.kind === 'continue') {
      return;
    }
    this.phase = { kind: 'ending' };
    if (ending.kind === 'fullCombo') {
      playFullComboFx(this, this.celestial, () => this.showResult(run, ending.result));
      return;
    }
    this.showResult(run, ending.result);
  }

  // 확인창이 열려 있어도 keyup 판정으로 실패할 수 있으므로 재생 재개 없이 확인창만 숨긴다.
  private failIfDepleted(run: PlayRun): boolean {
    const progress = run.session.getProgress();
    if (progress.outcome !== 'failed') {
      return false;
    }
    this.phase = { kind: 'ending' };
    if (run.isQuitConfirmOpen) {
      run.view.quitDialog.hide();
    }
    run.player.pause();
    playFailureFx(this, this.celestial, run.view.starlight, () => this.showResult(run, progress));
    return true;
  }

  private showResult(run: PlayRun, result: GameplayResult): void {
    if (result.outcome === 'finished') {
      try {
        this.save.saveResult(run.song.id, run.difficulty, result);
      } catch (error) {
        console.error('Failed to save result', error);
      }
      void this.submitRankedPlay(run).catch((error: unknown) => {
        console.warn('Failed to submit ranked play', error);
      });
    }
    const data: ResultSceneData = {
      song: run.song,
      difficulty: run.difficulty,
      chartId: run.chartId,
      result,
    };
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      startScene(this, 'result', data),
    );
    this.cameras.main.fadeOut(MOTION.mediumMs);
  }

  private async submitRankedPlay(run: PlayRun): Promise<void> {
    // RhythmClock 에 준 값과 같다. 플레이 중에는 바뀌지 않지만, 제출을 기다리는 동안 다음 씬이
    // this.settings 를 바꿀 수 있어 await 전에 고정한다.
    const submission: PlaySubmission = {
      inputOffsetMs: this.settings.inputOffsetMs,
      events: run.session.getInputs(),
    };
    if (run.rankedSessionId === null) {
      return;
    }
    await this.rankedPlay.submit(run.rankedSessionId, submission);
  }
}
