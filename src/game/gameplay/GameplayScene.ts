import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../config.js';
import { SCENE_KEYS, startScene } from '../sceneRoutes.js';
import type { GameplaySceneData, ResultSceneData } from '../sceneRoutes.js';
import { YouTubePlayer, loadYouTubeIframeApi } from '../../audio/YouTubePlayer.js';
import type { PreparedChart } from '../../data/playSession.js';
import type { ChartRef } from '../../data/songs.js';
import { LANES, mapLanes } from '../../rhythm/lanes.js';
import type { Chart, JudgmentEvent, Lane } from '../../rhythm/types.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import type { MvMode } from '../../storage/settings.js';
import { playFailureFx, playFullComboFx } from './endingFx.js';
import { GameplayController } from './GameplayController.js';
import type {
  GameplayFrame,
  GameplayLoadError,
  GameplayScreen,
  PlayScreen,
  RankedPlay,
} from './GameplayController.js';
import { isLoadingStatus } from './gameplayStatus.js';
import type { GameplayStatus } from './gameplayStatus.js';
import { addHudEffect, addHudText } from './hudObjects.js';
import {
  JUDGMENT_SHIMMER_ID,
  getHitBloomIntensity,
  getJudgmentPopScale,
  hasJudgmentGlow,
  hasJudgmentShimmer,
} from './judgmentEffects.js';
import { Button } from '../ui/Button.js';
import { addCelestialAtmosphere } from '../celestial/celestialAtmosphere.js';
import {
  playCelestialOnce,
  queueCelestialTextures,
  setCelestialLoopActive,
} from '../celestial/celestialSprites.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.js';
import { formatKeyCode, formatScore } from '../ui/format.js';
import { LaneFx } from './LaneFx.js';
import { LIGHT_TEXTURES, addLight, ensureLightTextures } from '../ui/lightTextures.js';
import { NoteLayer } from './NoteLayer.js';
import { OrbitTrace } from './OrbitTrace.js';
import { PracticeStats } from './PracticeStats.js';
import { StarlightGauge } from './StarlightGauge.js';
import {
  COLORS,
  GAMEPLAY_DEPTH,
  JUDGMENT_COLORS,
  MOTION,
  cssColor,
  textStyle,
} from '../ui/theme.js';

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
// SCORE 숫자 바로 아래에 붙여 연습 지표도 우상단 한 묶음으로 읽게 한다.
const PRACTICE_STATS_Y_PX = 184;
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
  paused: 'gameplay.paused',
} as const satisfies Record<Exclude<GameplayStatus['kind'], 'countdown' | 'none'>, string>;

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
  modeHud: ModeHud;
  introTitle: Phaser.GameObjects.Text;
  introDifficulty: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
  countdownText: Phaser.GameObjects.Text;
  mvModeText: Phaser.GameObjects.Text;
  quitDialog: ConfirmDialog;
}

type ModeHud =
  | { readonly kind: 'standard'; readonly starlight: StarlightGauge }
  | { readonly kind: 'practice'; readonly stats: PracticeStats };

export class GameplayScene extends Phaser.Scene {
  constructor(
    private readonly save: LocalSave,
    private readonly mvLayer: HTMLElement,
    private readonly prepareChart: (ref: ChartRef) => Promise<PreparedChart>,
    private readonly loadPracticeChart: (ref: ChartRef) => Promise<Chart>,
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
    addCelestialAtmosphere(this, this.celestial, 'gameplay');
    const settings = this.save.loadSettings();
    this.mvLayer.dataset.mvMode = settings.mvMode;
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
    // STARLIGHT(연습이면 배지)는 SCORE 위에 두어 체력·점수를 우상단 한 묶음으로 읽게 한다.
    // YouTube 임베드가 재생 시작·일시정지 때 띄우는 제목 바(좌상단)·버튼(아래 양 구석)과도 겹치지 않는다.
    const modeHud: ModeHud =
      data.mode === 'standard'
        ? {
            kind: 'standard',
            starlight: new StarlightGauge(this, SCORE_RIGHT_X_PX, STARLIGHT_Y_PX),
          }
        : {
            kind: 'practice',
            stats: this.addPracticeHud(),
          };
    const keyBindings = settings.keyBindings;
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
      modeHud,
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
      countdownText: addHudText(
        this,
        SCREEN_CENTER_X_PX,
        STATUS_Y_PX,
        '',
        textStyle('number', COLORS.textPrimary),
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
        onCancel: () => controller.closeQuitConfirm(),
        onAccept: () => controller.leave(),
      }),
    };

    const screen: GameplayScreen = {
      showStatus: (status) => this.setStatus(view, status),
      showMvMode: (mode) => this.showMvMode(view, mode),
      showLoadError: (error) => this.showLoadError(view, controller, error),
      openQuitConfirm: () => this.openQuitConfirm(view),
      closeQuitConfirm: () => this.closeQuitConfirm(view),
      beginPlay: (chart) => this.beginPlay(view, chart, settings.scrollSpeedPxPerSecond),
      showResult: (result) => this.showResult(result),
      backToSongSelect: () => startScene(this, 'songSelect', { mode: data.mode }),
    };
    const controller = new GameplayController(
      {
        save: this.save,
        prepareChart: this.prepareChart,
        loadPracticeChart: this.loadPracticeChart,
        rankedPlay: this.rankedPlay,
        players: {
          loadApi: loadYouTubeIframeApi,
          create: (videoId, handlers) => new YouTubePlayer(this.mvLayer, videoId, handlers),
        },
        now: () => performance.now(),
      },
      screen,
      data,
      settings,
    );

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'Tab') {
        // 브라우저가 Tab 으로 포커스를 옮기지 않게 한다.
        event.preventDefault();
      }
      controller.keyDown(event.code, event.repeat);
    };
    const onKeyUp = (event: KeyboardEvent): void => controller.keyUp(event.code);
    const onUpdate = (): void => controller.tick();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    this.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      this.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
      controller.close();
    });

    void controller.start().catch((error: unknown) => {
      console.error('Failed to start gameplay', error);
    });
  }

  private addPracticeHud(): PracticeStats {
    addHudText(
      this,
      SCORE_RIGHT_X_PX,
      STARLIGHT_Y_PX,
      'PRACTICE',
      textStyle('meta', COLORS.textMuted),
    ).setOrigin(1, 0.5);
    return new PracticeStats(this, SCORE_RIGHT_X_PX, PRACTICE_STATS_Y_PX);
  }

  private setStatus(view: GameplayView, status: GameplayStatus): void {
    view.statusText.setText(
      status.kind === 'countdown' || status.kind === 'none'
        ? ''
        : this.i18n.t(STATUS_MESSAGES[status.kind]),
    );
    view.countdownText.setText(status.kind === 'countdown' ? `${status.digit}` : '');
    const isLoading = isLoadingStatus(status);
    if (isLoading) {
      const bounds = view.statusText.getBounds();
      view.loadingStar.setPosition(bounds.left - LOADING_STAR_GAP_PX, bounds.centerY);
    }
    setCelestialLoopActive(view.loadingStar, isLoading);
  }

  private beginPlay(view: GameplayView, chart: Chart, scrollSpeedPxPerSecond: number): PlayScreen {
    const notes = new NoteLayer(this, {
      notes: chart.notes,
      laneCenterXPx: mapLanes(getLaneXPx),
      judgeLineYPx: JUDGE_LINE_Y_PX,
      scrollSpeedPxPerSecond,
    });
    const hud = {
      combo: 0,
      score: 0,
    };
    return {
      drawFrame: (frame) => {
        view.laneFx.setActivation(frame.activation.level);
        if (frame.activation.reachedFull) {
          playCelestialOnce(view.comboGlint);
        }
        notes.render(frame.session, frame.songTimeMs);
        this.renderHud(view, hud, frame);
      },
      pressLane: (lane) => {
        view.laneFx.press(lane);
        this.flashKeyLabel(view.lanes[lane].keyLabel);
      },
      showJudgments: (events) => this.applyJudgmentEvents(view, events),
      hideIntro: () => this.hideIntro(view),
      playFullCombo: (onDone) => playFullComboFx(this, this.celestial, onDone),
      // 확인창이 열려 있어도 keyup 판정으로 실패할 수 있으므로 확인창만 숨긴다.
      playFailure: (onDone) => {
        const { modeHud } = view;
        if (modeHud.kind !== 'standard') {
          throw new Error('Practice play cannot fail');
        }
        view.quitDialog.hide();
        playFailureFx(this, this.celestial, modeHud.starlight, onDone);
      },
    };
  }

  private showLoadError(
    view: GameplayView,
    controller: GameplayController,
    error: GameplayLoadError,
  ): void {
    let message: string;
    let hint: string | undefined;
    switch (error.kind) {
      case 'chartLoadFailed':
        message = this.i18n.t('gameplay.chartLoadFailed');
        break;
      case 'playerLoadFailed':
        message = this.i18n.t('gameplay.playerLoadFailed');
        break;
      case 'videoError':
        message = this.i18n.t('gameplay.videoError', {
          message: this.i18n.t('youtubeError.withCode', {
            message: this.i18n.t(`youtubeError.${error.errorKind}`),
            code: error.code,
          }),
        });
        if (error.errorKind === 'embeddingNotAllowed') {
          hint = this.i18n.t('youtubeError.embeddingNotAllowedHint');
        }
        break;
    }
    view.quitDialog.hide();
    this.hideIntro(view);
    this.setStatus(view, { kind: 'none' });
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
      onActivate: () => controller.leave(),
    });
    button.alignX(SCREEN_CENTER_X_PX, 0.5).setFocused(true).setDepth(GAMEPLAY_DEPTH.text);
  }

  private hideIntro(view: GameplayView): void {
    view.introTitle.setVisible(false);
    view.introDifficulty.setVisible(false);
  }

  // 뒤의 일시정지 안내는 Enter 의 뜻이 달라지므로 카운트다운 숫자와 함께 가린다.
  private openQuitConfirm(view: GameplayView): void {
    view.statusText.setVisible(false);
    view.countdownText.setVisible(false);
    view.quitDialog.show({
      title: this.i18n.t('gameplay.quitTitle'),
      body: this.i18n.t('gameplay.quitConfirm'),
      cancelLabel: 'CONTINUE',
      acceptLabel: 'QUIT',
      acceptTone: 'default',
    });
  }

  private closeQuitConfirm(view: GameplayView): void {
    view.quitDialog.hide();
    view.statusText.setVisible(true);
    view.countdownText.setVisible(true);
  }

  private showMvMode(view: GameplayView, mode: MvMode): void {
    this.mvLayer.dataset.mvMode = mode;
    const mvModeText = view.mvModeText;
    this.tweens.killTweensOf(mvModeText);
    mvModeText.setText(`MV ${mode.toUpperCase()}`).setAlpha(1);
    this.tweens.add({
      targets: mvModeText,
      alpha: 0,
      delay: MV_MODE_HOLD_MS,
      duration: MV_MODE_FADE_MS,
    });
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

  private renderHud(
    view: GameplayView,
    hud: { combo: number; score: number },
    frame: GameplayFrame,
  ): void {
    const { state } = frame;
    if (state.combo !== hud.combo) {
      hud.combo = state.combo;
      view.comboText.setText(`${state.combo}`);
    }
    if (state.score !== hud.score) {
      hud.score = state.score;
      view.scoreText.setText(formatScore(state.score));
    }
    view.progress.setProgress(frame.progress);
    const { modeHud } = view;
    if (modeHud.kind === 'standard') {
      modeHud.starlight.setHp(state.hp);
    } else {
      modeHud.stats.setCounts(state.counts);
    }
  }

  private showResult(data: ResultSceneData): void {
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      startScene(this, 'result', data),
    );
    this.cameras.main.fadeOut(MOTION.mediumMs);
  }
}
