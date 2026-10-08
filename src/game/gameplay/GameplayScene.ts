import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { getAtlasPresentation } from '../celestial/celestialCatalog.js';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import { GAMEPLAY_FAILURE_STARS } from '../celestial/celestialPlacements.js';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS, exitScene, startScene } from '../config.js';
import type { GameplaySceneData, ResultSceneData, SceneRequest } from '../config.js';
import { RhythmClock } from '../../audio/RhythmClock.js';
import { YouTubePlayer, loadYouTubeIframeApi } from '../../audio/YouTubePlayer.js';
import type { YouTubePlayerState } from '../../audio/YouTubePlayer.js';
import { YouTubeTimeSource } from '../../audio/YouTubeTimeSource.js';
import type { Song } from '../../data/songs.js';
import { GameplaySession } from '../../rhythm/GameplaySession.js';
import { JUDGMENT_WINDOWS, countJudgments } from '../../rhythm/judgment.js';
import { LANES, mapLanes } from '../../rhythm/lanes.js';
import type { Chart, Difficulty, Judgment, JudgmentEvent, Lane } from '../../rhythm/types.js';
import { DEFAULT_SETTINGS, MV_MODES } from '../../storage/LocalSave.js';
import type { LocalSave, Settings } from '../../storage/LocalSave.js';
import { getPlayingStatus, isLoadingStatus } from './gameplayStatus.js';
import type { GameplayStatus } from './gameplayStatus.js';
import { getHitBloomIntensity, hasJudgmentShimmer, shouldFailPlay } from './judgmentEffects.js';
import { getQuitConfirmAction } from './quitConfirm.js';
import { STAYING } from '../sceneExit.js';
import type { SceneExit } from '../sceneExit.js';
import { clamp, cycleItem } from '../range.js';
import { Button } from '../ui/Button.js';
import { addCelestialAtmosphere } from '../celestial/celestialAtmosphere.js';
import {
  addCelestialSprite,
  playCelestialOnce,
  queueCelestialTextures,
  registerCelestialAnimations,
  setCelestialLoopActive,
} from '../celestial/celestialSprites.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.js';
import { formatKeyCode, formatScore } from '../ui/format.js';
import { readGameplayKey } from './gameplayInput.js';
import type { GameplayKey } from './gameplayInput.js';
import { LaneFx } from './LaneFx.js';
import { LIGHT_TEXTURES, addLight, ensureLightTextures } from '../ui/lightTextures.js';
import { NoteLayer } from './NoteLayer.js';
import { OrbitTrace } from './OrbitTrace.js';
import {
  STARLIGHT_RAIL_INSET_PX,
  StarlightGauge,
  addStarlightBacking,
  addStarlightEmblem,
} from './StarlightGauge.js';
import {
  COLORS,
  GAMEPLAY_DEPTH,
  JUDGMENT_COLORS,
  MOTION,
  cssColor,
  textStyle,
  typeStyle,
} from '../ui/theme.js';
import { WorldActivation } from './worldActivation.js';

const LEAD_IN_MS = 2000;
const LANE_WIDTH_PX = 120;
const PLAY_AREA_WIDTH_PX = LANE_WIDTH_PX * LANES.length;
const LANES_LEFT_PX = (GAME_WIDTH - PLAY_AREA_WIDTH_PX) / 2;
const LANE_PANEL_ALPHA = 0.85;
const LANE_BORDER_WIDTH_PX = 1;
const LANE_BORDER_ALPHA = 0.5;
const LANE_DIVIDER_WIDTH_PX = 1;
const LANE_DIVIDER_ALPHA = 0.6;
const JUDGE_LINE_Y_PX = 920;
const KEY_LABEL_Y_PX = 968;
const JUDGMENT_X_PX = 960;
const JUDGMENT_Y_PX = 780;
const JUDGMENT_HOLD_MS = 300;
const JUDGMENT_FADE_MS = 150;
// 판정 글자는 흐리게 번지지 않고, 같은 모양의 진주빛 글자가 겹쳐 번쩍였다가 판정색으로 가라앉는다.
const JUDGMENT_FLASH_ALPHA = 0.9;
const JUDGMENT_FLASH_MS = 140;
// 뒤의 빛은 PERFECT·GREAT 에만 공기처럼 옅게 남긴다. 세기는 타격 번짐과 같은 값을 곱한다.
const JUDGMENT_GLOW_ALPHA = 0.2;
const JUDGMENT_GLOW_MIN_INTENSITY = 0.75;
const JUDGMENT_GLOW_WIDTH_SCALE = [1.1, 1.4] as const;
const JUDGMENT_GLOW_HEIGHT_PX = [56, 80] as const;
const JUDGMENT_POP_SCALE: Record<Judgment, number> = {
  perfect: 1.18,
  great: 1.08,
  good: 1,
  bad: 1,
  miss: 1,
};
const COMBO_X_PX = 960;
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
const STARLIGHT_EMBLEM_GAP_PX = 8;
const STARLIGHT_LABEL_GAP_PX = 12;
const STARLIGHT_WIDTH_PX = 256;
const STARLIGHT_LABEL_TYPE = { sizePx: 12, weight: 500 } as const;
// 밝은 영상 위에서도 라벨이 읽히도록 글자 바로 뒤에만 좁은 어두운 그림자를 둔다.
const STARLIGHT_LABEL_SHADOW = {
  offsetXPx: 0,
  offsetYPx: 1,
  color: 'rgba(8, 15, 32, 0.7)',
  blurPx: 2,
} as const;
const INTRO_X_PX = 960;
const INTRO_TITLE_Y_PX = 440;
const INTRO_DIFFICULTY_Y_PX = 520;
const STATUS_X_PX = 960;
const STATUS_Y_PX = 600;
const MV_MODE_X_PX = 120;
const MV_MODE_Y_PX = 144;
const MV_MODE_HOLD_MS = 700;
const MV_MODE_FADE_MS = 300;
const ERROR_X_PX = 960;
const ERROR_MESSAGE_Y_PX = 480;
const ERROR_HINT_Y_PX = 540;
const ERROR_BUTTON_Y_PX = 600;
const COMBO_GLINT_ID = 'R37';
// 콤보 자릿수와 무관하게 숫자·라벨 글자와 겹치지 않도록 라벨 바로 아래 고정 위치에 둔다.
const COMBO_GLINT_Y_PX = COMBO_LABEL_Y_PX + 40;
const JUDGMENT_SHIMMER_ID = 'R38';
// 판정 글자의 최대 pop scale 에서도 글자와 겹치지 않는 높이다.
const JUDGMENT_SHIMMER_Y_PX = JUDGMENT_Y_PX + 56;
const LOADING_STAR_ID = 'R47';
const LOADING_STAR_GAP_PX = 24;
const FAILURE_STAR_APPEAR_MS = 300;
const FAILURE_STAR_HOLD_MS = 200;
// 실패 별 10개가 하나씩 사라지도록 소멸 시작을 이 간격으로 늦춘다.
const FAILURE_STAR_STAGGER_MS = 100;
const FAILURE_STAR_FADE_MS = 360;
const FAILED_X_PX = 960;
const FAILED_Y_PX = 440;
const FAILED_HOLD_MS = 600;

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
  comboGlint: Phaser.GameObjects.Sprite | null;
  judgmentShimmer: Phaser.GameObjects.Sprite | null;
  loadingStar: Phaser.GameObjects.Sprite | null;
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
  /** 플레이 중 Esc 로 여는 나가기 확인창. */
  quitDialog: ConfirmDialog;
}

interface PreparedRun {
  song: Song;
  difficulty: Difficulty;
  chart: Chart;
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
  /** 열려 있는 동안 영상은 멈춰 있고 레인 입력은 받지 않는다. */
  isQuitConfirmOpen: boolean;
}

type GameplayPhase =
  | { kind: 'loading' }
  | { kind: 'ready'; run: PreparedRun }
  /** 재생 요청을 이미 보냈고 플레이어가 재생을 시작하기를 기다린다. */
  | { kind: 'starting'; run: PreparedRun }
  | { kind: 'error' }
  | { kind: 'playing'; run: PlayRun }
  | { kind: 'ending' };

export class GameplayScene extends Phaser.Scene {
  private runToken: object | null = null;
  private phase: GameplayPhase = { kind: 'loading' };
  private exit: SceneExit<SceneRequest> = STAYING;
  private player: YouTubePlayer | null = null;
  /** 플레이 중 Tab 으로 MV 모드를 바꾸면 갱신된다. 이 씬의 설정은 여기만 읽는다. */
  private settings: Settings = DEFAULT_SETTINGS;

  constructor(
    private readonly save: LocalSave,
    private readonly mvLayer: HTMLElement,
    private readonly loadChart: (song: Song, difficulty: Difficulty) => Promise<Chart>,
    private readonly i18n: I18n,
    private readonly celestial: CelestialCatalog,
  ) {
    super(SCENE_KEYS.gameplay);
  }

  preload(): void {
    queueCelestialTextures(this, this.celestial);
  }

  create(data: GameplaySceneData): void {
    this.exit = STAYING;
    registerCelestialAnimations(this, this.celestial);
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
    this.addHudText(COMBO_X_PX, COMBO_LABEL_Y_PX, 'COMBO', textStyle('meta', COLORS.textMuted));
    this.addHudText(
      SCORE_RIGHT_X_PX,
      SCORE_LABEL_Y_PX,
      'SCORE',
      textStyle('meta', COLORS.textMuted),
    ).setOrigin(1, 0);
    // STARLIGHT 는 SCORE 위에 두어 체력·점수를 우상단 한 묶음으로 읽게 한다.
    // YouTube 임베드가 재생 시작·일시정지 때 띄우는 제목 바(좌상단)·버튼(아래 양 구석)과도 겹치지 않는다.
    const starlightLeftXPx = SCORE_RIGHT_X_PX - STARLIGHT_RAIL_INSET_PX - STARLIGHT_WIDTH_PX;
    const { offsetXPx, offsetYPx, color, blurPx } = STARLIGHT_LABEL_SHADOW;
    const starlightLabel = this.addHudText(
      starlightLeftXPx - STARLIGHT_RAIL_INSET_PX - STARLIGHT_LABEL_GAP_PX,
      STARLIGHT_Y_PX,
      'STARLIGHT',
      typeStyle(STARLIGHT_LABEL_TYPE, COLORS.noteShade),
    )
      .setOrigin(1, 0.5)
      .setShadow(offsetXPx, offsetYPx, color, blurPx, false, true);
    const emblem = addStarlightEmblem(
      this,
      starlightLabel.x - starlightLabel.width - STARLIGHT_EMBLEM_GAP_PX,
      STARLIGHT_Y_PX,
    );
    addStarlightBacking(this, emblem.x - emblem.width, SCORE_RIGHT_X_PX, STARLIGHT_Y_PX);
    const keyBindings = this.settings.keyBindings;
    const view: GameplayView = {
      lanes: mapLanes((lane) => ({
        keyLabel: this.addHudText(
          getLaneXPx(lane),
          KEY_LABEL_Y_PX,
          formatKeyCode(keyBindings[lane]),
          textStyle('meta', COLORS.textMuted),
        ),
      })),
      laneFx: new LaneFx(this, this.celestial, mapLanes(getLaneXPx), JUDGE_LINE_Y_PX),
      comboGlint: this.addHudEffect(COMBO_GLINT_ID, COMBO_X_PX, COMBO_GLINT_Y_PX),
      judgmentShimmer: this.addHudEffect(JUDGMENT_SHIMMER_ID, JUDGMENT_X_PX, JUDGMENT_SHIMMER_Y_PX),
      loadingStar: this.addHudEffect(LOADING_STAR_ID, 0, 0),
      // 같은 depth 에서 글자 아래에 그려지도록 글자보다 먼저 만든다.
      judgmentGlow: addLight(this, LIGHT_TEXTURES.glow, JUDGMENT_X_PX, JUDGMENT_Y_PX)
        .setAlpha(0)
        .setDepth(GAMEPLAY_DEPTH.text),
      judgmentText: this.addHudText(
        JUDGMENT_X_PX,
        JUDGMENT_Y_PX,
        '',
        textStyle('judgment', COLORS.textPrimary),
      ).setAlpha(0),
      // 글자 위에 겹쳐 그리도록 글자 다음에 만든다.
      judgmentFlash: this.addHudText(
        JUDGMENT_X_PX,
        JUDGMENT_Y_PX,
        '',
        textStyle('judgment', COLORS.note),
      )
        .setAlpha(0)
        .setBlendMode(Phaser.BlendModes.SCREEN),
      comboText: this.addHudText(
        COMBO_X_PX,
        COMBO_Y_PX,
        '0',
        textStyle('combo', COLORS.textPrimary),
      ).setAlpha(COMBO_ALPHA),
      scoreText: this.addHudText(
        SCORE_RIGHT_X_PX,
        SCORE_Y_PX,
        formatScore(0),
        textStyle('hudScore', COLORS.textPrimary),
      ).setOrigin(1, 0),
      progress: new OrbitTrace(this, LANES_LEFT_PX, PLAY_AREA_WIDTH_PX, PROGRESS_Y_PX),
      starlight: new StarlightGauge(this, starlightLeftXPx, STARLIGHT_WIDTH_PX, STARLIGHT_Y_PX),
      introTitle: this.addHudText(
        INTRO_X_PX,
        INTRO_TITLE_Y_PX,
        data.song.title,
        textStyle('title', COLORS.textPrimary),
      ),
      introDifficulty: this.addHudText(
        INTRO_X_PX,
        INTRO_DIFFICULTY_Y_PX,
        data.difficulty.toUpperCase(),
        textStyle('secondary', COLORS.textSecondary),
      ),
      statusText: this.addHudText(
        STATUS_X_PX,
        STATUS_Y_PX,
        '',
        textStyle('meta', COLORS.textMuted),
      ),
      mvModeText: this.addHudText(
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
    this.applyJudgmentEvents(run.view, run.session.update(songTimeMs));
    // 실패하면 이 프레임의 활성화·노트·HUD·완주 확인을 하지 않고 그 자리에 멈춘다.
    if (this.failIfDepleted(run)) {
      return;
    }
    const activation = run.activation.advance(run.session.getState().combo, songTimeMs);
    run.view.laneFx.setActivation(activation.level);
    if (activation.reachedFull && run.view.comboGlint !== null) {
      playCelestialOnce(run.view.comboGlint);
    }
    run.notes.render(run.session, songTimeMs);
    this.renderHud(run, songTimeMs);
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
    const { song, difficulty } = data;

    let chart: Chart;
    try {
      chart = await this.loadChart(song, difficulty);
    } catch (error) {
      if (this.isCurrentRun(token)) {
        this.showLoadError(view, this.i18n.t('gameplay.chartLoadFailed'), error);
      }
      return;
    }

    if (!this.isCurrentRun(token)) {
      return;
    }

    try {
      await loadYouTubeIframeApi();
    } catch (error) {
      if (this.isCurrentRun(token)) {
        this.showLoadError(view, this.i18n.t('gameplay.playerLoadFailed'), error);
      }
      return;
    }
    if (!this.isCurrentRun(token)) {
      return;
    }

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
            run: { song, difficulty, chart, view, player, timeSource },
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

  /** 상태 문구를 바꾸면서 loading star 도 그 상태가 대기 상태인지로 함께 켜고 끈다. */
  private setStatus(view: GameplayView, status: GameplayStatus): void {
    view.statusText.setText(status === 'none' ? '' : this.i18n.t(STATUS_MESSAGES[status]));
    if (view.loadingStar === null) {
      return;
    }
    const isLoading = isLoadingStatus(status);
    if (isLoading) {
      // 문구마다 폭이 달라 켤 때마다 텍스트 왼쪽 끝을 다시 따라간다.
      const bounds = view.statusText.getBounds();
      view.loadingStar.setPosition(bounds.left - LOADING_STAR_GAP_PX, bounds.centerY);
    }
    setCelestialLoopActive(view.loadingStar, isLoading);
  }

  private beginPlay(prepared: PreparedRun): void {
    const { chart } = prepared;
    const session = new GameplaySession(chart, JUDGMENT_WINDOWS);
    const clock = new RhythmClock(prepared.timeSource, this.settings.inputOffsetMs, chart.offsetMs);
    clock.start(0, 0);
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
        activation: new WorldActivation(countJudgments(chart.notes), clock.getTimeMs()),
      },
    };
  }

  private showLoadError(view: GameplayView, message: string, error: unknown, hint?: string): void {
    console.error(message, error);
    view.quitDialog.hide();
    this.hideIntro(view);
    view.statusText.setVisible(false);
    if (view.loadingStar !== null) {
      setCelestialLoopActive(view.loadingStar, false);
    }
    this.addHudText(
      ERROR_X_PX,
      ERROR_MESSAGE_Y_PX,
      message,
      textStyle('heading', COLORS.textPrimary),
    );
    if (hint !== undefined) {
      this.addHudText(
        ERROR_X_PX,
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
    button.alignX(ERROR_X_PX, 0.5).setFocused(true).setDepth(GAMEPLAY_DEPTH.text);
    this.phase = { kind: 'error' };
  }

  private hideIntro(view: GameplayView): void {
    view.introTitle.setVisible(false);
    view.introDifficulty.setVisible(false);
  }

  /** 기본은 가운데 정렬. 다른 정렬이 필요하면 반환값에 setOrigin 을 다시 건다. */
  private addHudText(
    xPx: number,
    yPx: number,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    return this.add.text(xPx, yPx, text, style).setOrigin(0.5).setDepth(GAMEPLAY_DEPTH.text);
  }

  private addHudEffect(id: string, xPx: number, yPx: number): Phaser.GameObjects.Sprite | null {
    const sprite = addCelestialSprite(this, getAtlasPresentation(this.celestial, id), xPx, yPx);
    return sprite === null ? null : sprite.setDepth(GAMEPLAY_DEPTH.text);
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
    // 키를 누르고 있을 때의 반복 입력은 나가기만 받는다. 플레이 중에는 Esc 반복이 확인창을 여닫지 않게 모두 무시한다.
    if (event.repeat && (key.command !== 'back' || this.phase.kind === 'playing')) {
      return;
    }
    switch (this.phase.kind) {
      case 'loading':
      case 'starting':
        // starting 은 재생 요청을 이미 보냈으므로 확인을 로딩 중처럼 무시한다.
        this.handleLoadingKey(key, view);
        return;
      case 'ready':
        this.handleReadyKey(this.phase.run, key, view);
        return;
      case 'playing':
        this.handlePlayingKey(this.phase.run, key, view);
        return;
      case 'error':
        if (key.command === 'confirm' || key.command === 'back') {
          this.backToSongSelect();
        }
        return;
      case 'ending':
        return;
    }
  }

  private handleLoadingKey(key: GameplayKey, view: GameplayView): void {
    switch (key.command) {
      case 'back':
        this.backToSongSelect();
        return;
      case 'mvMode':
        this.cycleMvMode(view);
        return;
      default:
        return;
    }
  }

  private handleReadyKey(run: PreparedRun, key: GameplayKey, view: GameplayView): void {
    switch (key.command) {
      case 'confirm':
        run.player.requestPlay(Math.max(0, run.song.gameStartMs - LEAD_IN_MS) / 1000);
        this.setStatus(run.view, 'preparing');
        this.phase = { kind: 'starting', run };
        return;
      case 'back':
        this.backToSongSelect();
        return;
      case 'mvMode':
        this.cycleMvMode(view);
        return;
      case null:
        return;
    }
  }

  private handlePlayingKey(run: PlayRun, key: GameplayKey, view: GameplayView): void {
    switch (getQuitConfirmAction(run.isQuitConfirmOpen, key.command)) {
      case 'open':
        this.openQuitConfirm(run);
        return;
      case 'quit':
        this.backToSongSelect();
        return;
      case 'cancel':
        this.closeQuitConfirm(run);
        return;
      case 'ignore':
        return;
      case 'pass':
        break;
    }
    // 버퍼링·일시정지 중에는 레인 입력을 판정하지 않는다.
    const isStopped = run.playerState === 'buffering' || run.playerState === 'paused';
    if (key.lane !== null && !isStopped) {
      run.view.laneFx.press(key.lane);
      this.flashKeyLabel(run.view.lanes[key.lane].keyLabel);
      this.applyJudgmentEvent(run.view, run.session.press(key.lane, run.clock.getTimeMs()));
      this.failIfDepleted(run);
      return;
    }
    switch (key.command) {
      case 'confirm':
        if (run.playerState === 'paused') {
          run.player.resume();
        }
        return;
      case 'mvMode':
        this.cycleMvMode(view);
        return;
      case null:
        return;
    }
  }

  /** 영상을 멈춰 판정 시계도 함께 멈춘다. 뒤의 일시정지 안내는 Enter 의 뜻이 달라지므로 가린다. */
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
    this.exit = exitScene(this, this.exit, { key: 'songSelect', data: undefined });
  }

  private cycleMvMode(view: GameplayView): void {
    const next = cycleItem(MV_MODES, this.settings.mvMode, 1);
    this.mvLayer.dataset.mvMode = next;
    this.settings = { ...this.settings, mvMode: next };
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
    this.applyJudgmentEvent(run.view, run.session.release(lane, run.clock.getTimeMs()));
    this.failIfDepleted(run);
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

  private applyJudgmentEvent(view: GameplayView, event: JudgmentEvent | null): void {
    this.applyJudgmentEvents(view, event === null ? [] : [event]);
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
    const popScale = JUDGMENT_POP_SCALE[judgment];
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
    this.tweens.add({ targets: judgmentText, scale: 1, duration: MOTION.fastMs });
    // 맞힌 판정만 번쩍인다. 글자와 같은 크기로 줄어들며 사라져 획이 어긋나 보이지 않는다.
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
    if (intensity >= JUDGMENT_GLOW_MIN_INTENSITY) {
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
    if (hasJudgmentShimmer(lastEvent.judgment) && view.judgmentShimmer !== null) {
      playCelestialOnce(view.judgmentShimmer);
    }
  }

  private renderHud(run: PlayRun, songTimeMs: number): void {
    const state = run.session.getState();
    const progress = clamp(
      (songTimeMs - run.song.gameStartMs) / (run.song.gameEndMs - run.song.gameStartMs),
      0,
      1,
    );
    run.view.comboText.setText(`${state.combo}`);
    run.view.scoreText.setText(formatScore(state.score));
    run.view.progress.setProgress(progress);
    run.view.starlight.setHp(state.hp);
  }

  private finishIfEnded(run: PlayRun): void {
    if (run.clock.getPlaybackMs() < run.song.gameEndMs || !run.session.isFinished()) {
      return;
    }
    this.phase = { kind: 'ending' };
    this.showResult(run);
  }

  /**
   * 판정 반영 직후 부른다. 세션이 방금 실패했으면 실패 연출을 한 번만 시작하고 true 를 돌려준다.
   * 확인창이 열려 있어도 keyup 판정으로 실패할 수 있으므로 재생 재개 없이 확인창만 숨긴다.
   */
  private failIfDepleted(run: PlayRun): boolean {
    if (!shouldFailPlay(this.phase.kind === 'playing', run.session.isFailed())) {
      return false;
    }
    this.phase = { kind: 'ending' };
    if (run.isQuitConfirmOpen) {
      run.view.quitDialog.hide();
    }
    run.player.pause();
    this.playFailure(run);
    return true;
  }

  /** 게이지 꺼짐 → 실패 별이 하나씩 사라짐 → FAILED → 결과 화면 순서다. */
  private playFailure(run: PlayRun): void {
    run.view.starlight.extinguish();
    // 게이지 소멸(StarlightGauge.extinguish 의 MOTION.mediumMs)이 끝난 뒤에 별이 등장한다.
    const gaugeGoneMs = MOTION.mediumMs;
    const starsFadedMs =
      gaugeGoneMs +
      FAILURE_STAR_APPEAR_MS +
      FAILURE_STAR_HOLD_MS +
      FAILURE_STAR_STAGGER_MS * (GAMEPLAY_FAILURE_STARS.length - 1) +
      FAILURE_STAR_FADE_MS;
    GAMEPLAY_FAILURE_STARS.forEach(({ id, xPx, yPx, scale, phaseFraction }, index) => {
      const star = addCelestialSprite(
        this,
        getAtlasPresentation(this.celestial, id),
        xPx,
        yPx,
        phaseFraction,
      );
      if (star === null) {
        return;
      }
      const alpha = star.alpha;
      star.setScale(scale).setDepth(GAMEPLAY_DEPTH.text).setAlpha(0);
      this.tweens.chain({
        targets: star,
        tweens: [
          { alpha, delay: gaugeGoneMs, duration: FAILURE_STAR_APPEAR_MS },
          {
            alpha: 0,
            delay: FAILURE_STAR_HOLD_MS + FAILURE_STAR_STAGGER_MS * index,
            duration: FAILURE_STAR_FADE_MS,
          },
        ],
      });
    });
    const failed = this.addHudText(
      FAILED_X_PX,
      FAILED_Y_PX,
      'FAILED',
      textStyle('title', JUDGMENT_COLORS.miss),
    ).setAlpha(0);
    this.tweens.add({
      targets: failed,
      alpha: 1,
      delay: starsFadedMs,
      duration: MOTION.mediumMs,
      onComplete: () => this.time.delayedCall(FAILED_HOLD_MS, () => this.showResult(run)),
    });
  }

  /** 완주·실패 공용 종료 경로. 완주 결과만 기록에 남긴다. */
  private showResult(run: PlayRun): void {
    const result = run.session.getResult();
    if (result.outcome === 'finished') {
      try {
        this.save.saveResult(run.song.id, run.difficulty, result);
      } catch (error) {
        console.error('Failed to save result', error);
      }
    }
    const data: ResultSceneData = { song: run.song, difficulty: run.difficulty, result };
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      startScene(this, 'result', data),
    );
    this.cameras.main.fadeOut(MOTION.mediumMs);
  }
}
