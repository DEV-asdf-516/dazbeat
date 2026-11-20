import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import type { CelestialAtlasId, CelestialCatalog } from '../celestial/state/celestialCatalog.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../app/config.js';
import { SCENE_KEYS, startScene } from '../app/sceneRoutes.js';
import type { GameplaySceneData, ResultSceneData } from '../app/sceneRoutes.js';
import { YouTubePlayer, loadYouTubeIframeApi } from '../../audio/YouTubePlayer.js';
import type { PreparedChart } from '../../data/playSession.js';
import type { ChartRef } from '../../data/songs.js';
import { requireDefined } from '../../invariant.js';
import { calculateAccuracy } from '../../rhythm/accuracy.js';
import { getNoteTimeAtY } from '../../rhythm/notePosition.js';
import type { Chart, Judgment, JudgmentEvent } from '../../rhythm/types.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import type { MvMode } from '../../storage/settings.js';
import {
  ENDING_FX_IDS,
  ENDING_IMAGES,
  playClearFx,
  playFailureFx,
  playFullComboFx,
} from './view/endingFx.js';
import { GameplayController } from './GameplayController.js';
import type { GameplayScreen, PlayScreen, RankedPlay } from './GameplayController.js';
import {
  getChangedButtonRegions,
  getChangedStatusRegions,
  getGameplayButtonView,
  getLoadErrorText,
  getMvModeMarks,
  getStatusView,
} from './state/gameplayStatus.js';
import type {
  GameplayButton,
  GameplayButtonRegion,
  GameplayButtons,
  GameplayLoadError,
  GameplayStatus,
  GameplayStatusMessage,
  GameplayStatusRegion,
  LoadErrorMessage,
} from './state/gameplayStatus.js';
import { QUIT_CONFIRM_TEXTS } from './state/quitConfirm.js';
import type { QuitConfirmReason } from './state/quitConfirm.js';
import { HUD_LABEL, addHudEffect, addHudText, withHudOutline } from './view/hudObjects.js';
import {
  JUDGMENT_SHIMMER_ID,
  LANE_EFFECT_IDS,
  getJudgmentEffect,
  getJudgmentSoundEffect,
  getShownJudgment,
} from './state/judgmentEffects.js';
import { Button } from '../ui/view/widgets/Button.js';
import {
  addCelestialAtmosphere,
  getCelestialAtmosphereUses,
} from '../celestial/view/celestialAtmosphere.js';
import { playCelestialOnce, queueCelestialTextures } from '../celestial/view/celestialSprites.js';
import { ConfirmDialog } from '../ui/view/widgets/ConfirmDialog.js';
import { pointButton } from '../ui/view/input/hoverTarget.js';
import type { ButtonPointer } from '../ui/view/input/hoverTarget.js';
import { formatKeyCode, formatScore } from '../ui/state/format.js';
import { queueImageLoads } from '../ui/view/textures/imageLoad.js';
import { LaneFx } from './view/LaneFx.js';
import { MvModeIndicator } from './view/MvModeIndicator.js';
import { LANE_ORNAMENT_IMAGES, addLaneOrnaments } from './view/laneOrnaments.js';
import {
  LIGHT_TEXTURES,
  addLight,
  ensureLightTextures,
} from '../ui/view/textures/lightTextures.js';
import { NoteLayer } from './view/NoteLayer.js';
import { SoundEffects, queueSoundEffects } from '../ui/view/soundEffects.js';
import { LOADING_STAR_ID } from '../ui/view/widgets/LoadingStar.js';
import { NoticeText } from '../ui/view/widgets/NoticeText.js';
import { OrbitTrace } from './view/OrbitTrace.js';
import { getPlayfieldLayout, getPlayfieldXAtY } from './state/playfieldLayout.js';
import type { PlayfieldLayout } from './state/playfieldLayout.js';
import { GlyphText } from '../ui/view/widgets/GlyphText.js';
import { PracticeStats } from './view/PracticeStats.js';
import { StarlightGauge } from './view/StarlightGauge.js';
import { IntroStarChart, getIntroStarChartUses } from './view/IntroStarChart.js';
import { getComboTier } from './state/comboTier.js';
import { getChangedHudRegions, getEnteredNoteRange } from './state/gameplayHud.js';
import { getNoteTrailMs } from './state/noteAppearance.js';
import type { GameplayFrame, HudRegion } from './state/gameplayHud.js';
import { getStarlightBand, isBreathingBand } from './state/starlightBand.js';
import type { ComboTier } from './state/comboTier.js';
import {
  addLaneChrome,
  addLaneDividers,
  addSkyScrim,
  fitSkyScrim,
} from './view/gameplayTextures.js';
import {
  CELESTIAL_COLORS,
  COLORS,
  GAMEPLAY_DEPTH,
  JUDGMENT_COLORS,
  textStyle,
} from '../ui/view/theme.js';
import { MOTION } from '../ui/state/motion.js';
import { getGraphicsLevel } from '../ui/state/graphicsLevel.js';

// 판정·콤보는 플레이필드 가운데에, 안내·종료 문구는 화면 가운데에 놓는다.
const SCREEN_CENTER_X_PX = GAME_WIDTH / 2;
const KEY_LABEL_Y_PX = 968;
// 흰색으로 한 번 굽고 틴트로 색을 내야 번쩍일 때 글자를 다시 굽지 않는다.
const KEY_LABEL_FILL = 0xffffff;
const JUDGMENT_Y_PX = 780;
const JUDGMENT_HOLD_MS = 300;
const JUDGMENT_FADE_MS = 150;
const JUDGMENT_FLASH_ALPHA = 0.9;
const JUDGMENT_FLASH_MS = 140;
const JUDGMENT_GLOW_ALPHA = 0.2;
const JUDGMENT_GLOW_WIDTH_SCALE = {
  from: 1.1,
  to: 1.4,
} as const;
const JUDGMENT_GLOW_HEIGHT_PX = {
  from: 56,
  to: 80,
} as const;
const COMBO_Y_PX = 360;
const COMBO_GLYPH_FONT_KEY = 'glyph:combo';
const SCORE_GLYPH_FONT_KEY = 'glyph:score';
const COMBO_LABEL_Y_PX = 430;
// 노트가 레인 가운데의 큰 숫자 위를 지나도 보이도록 조금 물린다. 색이 노트의 흰색과 달라 많이 물리지 않아도 섞이지 않는다.
const COMBO_ALPHA = 0.85;
// 숫자는 흰색으로 채우고 위아래 모서리 틴트로 색을 입힌다. 콤보가 길어질수록 금빛과 아래 색이 짙어진다.
const COMBO_FILL = 0xffffff;
const COMBO_TIER_TINTS: Readonly<Record<ComboTier, { top: number; bottom: number }>> = {
  spark: {
    top: CELESTIAL_COLORS.highlight,
    bottom: COLORS.holdRibbon,
  },
  glow: {
    top: JUDGMENT_COLORS.perfect,
    bottom: COLORS.holdRibbon,
  },
  radiant: {
    top: JUDGMENT_COLORS.perfect,
    bottom: JUDGMENT_COLORS.good,
  },
  stellar: {
    top: 0xffd98a,
    bottom: 0x9ee6b0,
  },
};
const COMBO_TIER_POP_SCALE = 1.25;
// 라벨도 숫자와 같은 단계 색을 입혀 한 묶음으로 읽히게 하고, 숫자보다 앞서지 않게 조금 물린다.
const COMBO_LABEL_WEIGHT = 600;
const COMBO_LABEL_LETTER_SPACING_PX = 6;
const COMBO_LABEL_ALPHA = 0.75;
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
// MV 전환도 키 조작이라 레인 키 이름과 같은 줄, 레인 왼쪽 바깥에 둔다. 노트를 가리지 않고 YouTube 의 구석 버튼과도 떨어진다.
const MV_MODE_LANE_GAP_PX = 48;
// 곡이 끝나면 레인·판정 HUD 를 먼저 걷어 입력이 끝났음을 보여 준 뒤 종료 연출을 띄운다.
const PLAYFIELD_CLEAR_MS = 450;
const PLAYFIELD_SINK_PX = 24;
const ERROR_MESSAGE_Y_PX = 480;
const ERROR_HINT_Y_PX = 540;
const ERROR_BUTTON_Y_PX = 600;
const COMBO_GLINT_ID = 'R37';
// 콤보 자릿수와 무관하게 숫자·라벨 글자와 겹치지 않도록 라벨 바로 아래 고정 위치에 둔다.
const COMBO_GLINT_Y_PX = COMBO_LABEL_Y_PX + 40;
// 판정 글자의 최대 pop scale 에서도 글자와 겹치지 않는 높이다.
const JUDGMENT_SHIMMER_Y_PX = JUDGMENT_Y_PX + 56;
const CELESTIAL_IDS: readonly CelestialAtlasId[] = [
  COMBO_GLINT_ID,
  LOADING_STAR_ID,
  JUDGMENT_SHIMMER_ID,
  ...LANE_EFFECT_IDS,
  ...ENDING_FX_IDS,
];
const COUNTDOWN_POP_SCALE = 1.3;
const COUNTDOWN_POP_START_ALPHA = 0.3;

const STATUS_MESSAGES = {
  loading: 'gameplay.loading',
  resuming: 'gameplay.resuming',
} as const satisfies Record<GameplayStatusMessage, string>;

interface LaneView {
  keyLabel: Phaser.GameObjects.Text;
}

interface GameplayView {
  playfield: PlayfieldLayout;
  playfieldChrome: readonly Phaser.GameObjects.GameObject[];
  soundEffects: SoundEffects;
  lanes: readonly LaneView[];
  laneFx: LaneFx;
  comboGlint: Phaser.GameObjects.Sprite;
  judgmentShimmer: Phaser.GameObjects.Sprite;
  judgmentGlow: Phaser.GameObjects.Image;
  judgments: Readonly<Record<Judgment, JudgmentTexts>>;
  combo: GlyphText;
  comboLabel: Phaser.GameObjects.Text;
  introChart: IntroStarChart;
  score: GlyphText;
  progress: OrbitTrace;
  modeHud: ModeHud;
  introTitle: Phaser.GameObjects.Text;
  introDifficulty: Phaser.GameObjects.Text;
  status: NoticeText;
  countdownText: Phaser.GameObjects.Text;
  mvMode: MvModeIndicator;
  quitDialog: ConfirmDialog;
  backButton: Button;
}

const PRACTICE_COUNT_JUDGMENTS: Readonly<Record<Extract<HudRegion, `${Judgment}Count`>, Judgment>> =
  {
    perfectCount: 'perfect',
    greatCount: 'great',
    goodCount: 'good',
    badCount: 'bad',
    missCount: 'miss',
  };

interface JudgmentTexts {
  readonly text: Phaser.GameObjects.Text;
  readonly flash: Phaser.GameObjects.Text;
}

type ModeHud =
  | { readonly kind: 'standard'; readonly starlight: StarlightGauge }
  | { readonly kind: 'practice'; readonly stats: PracticeStats };

export class GameplayScene extends Phaser.Scene {
  constructor(
    private readonly save: LocalSave,
    private readonly mvLayer: HTMLElement,
    private readonly prepareChart: (ref: ChartRef) => Promise<PreparedChart>,
    private readonly loadChart: (ref: ChartRef, isFresh: boolean) => Promise<Chart>,
    private readonly i18n: I18n,
    private readonly celestial: CelestialCatalog,
    private readonly rankedPlay: RankedPlay,
    private readonly isSoftwareRendering: boolean,
  ) {
    super(SCENE_KEYS.gameplay);
  }

  preload(): void {
    queueCelestialTextures(this, this.celestial, [
      ...getCelestialAtmosphereUses(this.celestial, 'gameplay'),
      ...getIntroStarChartUses(this.celestial),
      ...CELESTIAL_IDS.map((id) => this.celestial.atlasPresentations[id]),
    ]);
    queueImageLoads(this, ENDING_IMAGES, 'ending effect');
    queueImageLoads(this, LANE_ORNAMENT_IMAGES, 'lane ornament');
    queueSoundEffects(this);
  }

  create(data: GameplaySceneData): void {
    const settings = this.save.loadSettings();
    addCelestialAtmosphere(this, this.celestial, 'gameplay');
    const introChart = new IntroStarChart(
      this,
      this.celestial,
      data.song.constellation,
      SCREEN_CENTER_X_PX,
    );
    // 늘려 그리는 화면 크기 덮개 한 장이 가속 꺼짐에서 약 8ms 라 지금 게임 폭으로 구워 1:1 로 그린다.
    const skyScrim = addSkyScrim(this, this.scale.width)
      .setScrollFactor(0)
      .setDepth(GAMEPLAY_DEPTH.world);
    this.mvLayer.dataset.mvMode = settings.mvMode;
    this.mvLayer.dataset.graphics = getGraphicsLevel(this.isSoftwareRendering);
    ensureLightTextures(this);
    this.cameras.main.fadeIn(MOTION.mediumMs);

    const playfield = getPlayfieldLayout(GAME_WIDTH, data.laneCount);
    const laneChrome = addLaneChrome(this, playfield, data.laneCount).setDepth(
      GAMEPLAY_DEPTH.lanePanel,
    );
    const laneDividers = addLaneDividers(this, playfield, data.laneCount).setDepth(
      GAMEPLAY_DEPTH.laneDivider,
    );
    const laneOrnaments = addLaneOrnaments(this, playfield, data.laneCount);
    const comboLabel = addHudText(this, playfield.centerXPx, COMBO_LABEL_Y_PX, 'COMBO', {
      ...textStyle('meta', COMBO_FILL, COMBO_LABEL_WEIGHT),
      letterSpacing: COMBO_LABEL_LETTER_SPACING_PX,
    }).setAlpha(0);
    const rightHudStartIndex = this.children.list.length;
    addHudText(
      this,
      SCORE_RIGHT_X_PX,
      SCORE_LABEL_Y_PX,
      'SCORE',
      withHudOutline({
        ...textStyle('meta', HUD_LABEL.color, HUD_LABEL.weight),
        letterSpacing: HUD_LABEL.letterSpacingPx,
      }),
    ).setOrigin(1, 0);
    // STARLIGHT(연습이면 배지)는 SCORE 위에 두어 체력·점수를 우상단 한 묶음으로 읽게 한다.
    // YouTube 임베드가 재생 시작·일시정지 때 띄우는 제목 바(좌상단)·버튼(아래 양 구석)과도 겹치지 않는다.
    const modeHud: ModeHud =
      data.origin.mode === 'standard'
        ? {
            kind: 'standard',
            starlight: new StarlightGauge(this, SCORE_RIGHT_X_PX, STARLIGHT_Y_PX),
          }
        : {
            kind: 'practice',
            stats: this.addPracticeHud(),
          };
    const score = new GlyphText(this, {
      fontKey: SCORE_GLYPH_FONT_KEY,
      style: withHudOutline(textStyle('hudScore', COLORS.textPrimary)),
      chars: '0123456789,',
      xPx: SCORE_RIGHT_X_PX,
      yPx: SCORE_Y_PX,
      originX: 1,
      originY: 0,
      text: formatScore(0),
      depth: GAMEPLAY_DEPTH.text,
    });
    // 창 폭이 바뀌면 오른쪽 끝을 따라 함께 옮기도록 묶는다. 묶음 안에서도 기존 depth 순서로 그린다.
    const rightHud = this.add
      .container(0, 0, this.children.list.slice(rightHudStartIndex))
      .sort('depth')
      .setDepth(GAMEPLAY_DEPTH.text);
    const laneKeys = settings.keyBindings[data.laneCount];
    const progressLeftXPx = getPlayfieldXAtY(playfield, playfield.leftPx, PROGRESS_Y_PX);
    const progressRightXPx = getPlayfieldXAtY(
      playfield,
      playfield.leftPx + playfield.widthPx,
      PROGRESS_Y_PX,
    );
    const statusText = addHudText(
      this,
      SCREEN_CENTER_X_PX,
      STATUS_Y_PX,
      '',
      textStyle('meta', COLORS.textMuted),
    );
    const pointer: ButtonPointer<GameplayButton> = {
      pointerOver: (button) => controller.pointerOver(button),
      pointerOut: (button) => controller.pointerOut(button),
      pointerDown: (button) => controller.pointerDown(button),
      pointerUp: (button) => controller.pointerUp(button),
    };
    // 판정마다 글자를 다시 굽지 않도록 판정별로 미리 만들어 두고 보일 것만 켠다.
    const addJudgmentTexts = (judgment: Judgment): JudgmentTexts => ({
      text: addHudText(
        this,
        playfield.centerXPx,
        JUDGMENT_Y_PX,
        judgment.toUpperCase(),
        textStyle('judgment', JUDGMENT_COLORS[judgment]),
      ).setAlpha(0),
      // 자기 판정 글자 위에 겹쳐 그리도록 글자 다음에 만든다.
      flash: addHudText(
        this,
        playfield.centerXPx,
        JUDGMENT_Y_PX,
        judgment.toUpperCase(),
        textStyle('judgment', COLORS.note),
      )
        .setAlpha(0)
        .setBlendMode(Phaser.BlendModes.SCREEN),
    });
    const view: GameplayView = {
      playfield,
      playfieldChrome: [laneChrome, laneDividers, ...laneOrnaments, comboLabel],
      soundEffects: new SoundEffects(this, settings),
      lanes: playfield.laneCenterXPx.map((xPx, lane) => ({
        keyLabel: addHudText(
          this,
          getPlayfieldXAtY(playfield, xPx, KEY_LABEL_Y_PX),
          KEY_LABEL_Y_PX,
          formatKeyCode(requireDefined(laneKeys[lane], 'Missing lane key', lane)),
          textStyle('meta', KEY_LABEL_FILL),
        ).setTint(COLORS.textMuted),
      })),
      laneFx: new LaneFx(this, this.celestial, playfield),
      comboGlint: addHudEffect(
        this,
        this.celestial,
        COMBO_GLINT_ID,
        playfield.centerXPx,
        COMBO_GLINT_Y_PX,
      ),
      judgmentShimmer: addHudEffect(
        this,
        this.celestial,
        JUDGMENT_SHIMMER_ID,
        playfield.centerXPx,
        JUDGMENT_SHIMMER_Y_PX,
      ),
      // 같은 depth 에서 글자 아래에 그려지도록 글자보다 먼저 만든다.
      judgmentGlow: addLight(this, LIGHT_TEXTURES.glow, playfield.centerXPx, JUDGMENT_Y_PX)
        .setAlpha(0)
        .setDepth(GAMEPLAY_DEPTH.text),
      judgments: {
        perfect: addJudgmentTexts('perfect'),
        great: addJudgmentTexts('great'),
        good: addJudgmentTexts('good'),
        bad: addJudgmentTexts('bad'),
        miss: addJudgmentTexts('miss'),
      },
      comboLabel,
      combo: new GlyphText(this, {
        fontKey: COMBO_GLYPH_FONT_KEY,
        style: textStyle('combo', COMBO_FILL),
        chars: '0123456789',
        xPx: playfield.centerXPx,
        yPx: COMBO_Y_PX,
        originX: 0.5,
        originY: 0.5,
        text: '0',
        depth: GAMEPLAY_DEPTH.text,
      }),
      introChart,
      score,
      progress: new OrbitTrace(
        this,
        progressLeftXPx,
        progressRightXPx - progressLeftXPx,
        PROGRESS_Y_PX,
      ),
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
      status: new NoticeText(this, this.celestial, statusText),
      countdownText: addHudText(
        this,
        SCREEN_CENTER_X_PX,
        STATUS_Y_PX,
        '',
        textStyle('number', COLORS.textPrimary),
      ),
      mvMode: new MvModeIndicator(
        this,
        getPlayfieldXAtY(playfield, playfield.leftPx, KEY_LABEL_Y_PX) - MV_MODE_LANE_GAP_PX,
        KEY_LABEL_Y_PX,
      ),
      quitDialog: new ConfirmDialog(this, {
        cancel: pointButton(pointer, 'quitCancel'),
        accept: pointButton(pointer, 'quitAccept'),
      }),
      backButton: new Button(this, 0, ERROR_BUTTON_Y_PX, {
        variant: 'primary',
        label: this.i18n.t(
          data.origin.kind === 'chartEditor'
            ? 'gameplay.backToEditor'
            : 'gameplay.backToSongSelect',
        ),
        pointer: pointButton(pointer, 'back'),
      })
        .alignX(SCREEN_CENTER_X_PX, 0.5)
        .setDepth(GAMEPLAY_DEPTH.text)
        .setVisible(false),
    };
    view.combo.layers.forEach((layer) => layer.setAlpha(0));
    // 플레이어가 준비되기 전에는 보일 영상이 없으므로 가린 상태로 시작한다.
    this.setMvVisible(view, false);

    const screen: GameplayScreen = {
      showStatus: (previous, next) => this.renderStatus(view, previous, next),
      renderButtons: (previous, next) => {
        for (const region of getChangedButtonRegions(previous, next)) {
          this.renderButtonRegion(view, next, region);
        }
      },
      showMvMode: (mode) => this.showMvMode(view, mode),
      setMvVisible: (isVisible) => this.setMvVisible(view, isVisible),
      showLoadError: (error) => this.showLoadError(view, error),
      openQuitConfirm: (reason) => this.openQuitConfirm(view, reason),
      closeQuitConfirm: () => this.closeQuitConfirm(view),
      playSound: (sound) => view.soundEffects.play(sound),
      beginPlay: (chart) => this.beginPlay(view, chart, settings.scrollSpeedPxPerSecond),
      showResult: (result) => this.showResult(result),
      leave: (request) => this.scene.start(SCENE_KEYS[request.key], request.data),
    };
    const controller = new GameplayController(
      {
        save: this.save,
        prepareChart: this.prepareChart,
        loadChart: this.loadChart,
        rankedPlay: this.rankedPlay,
        players: {
          loadApi: loadYouTubeIframeApi,
          create: (videoId, handlers) => new YouTubePlayer(this.mvLayer, videoId, handlers),
        },
        now: () => performance.now(),
        frameNow: () => this.game.loop.now,
      },
      screen,
      data,
      settings,
    );

    // 노트·레인은 창 크기와 무관하게 창 높이에 맞추고 남는 폭은 양옆으로 늘리거나 자른다.
    // 점수 묶음은 오른쪽 끝을 따라오되 레인에 닿기 전에 멈추고, 더 좁으면 창 밖으로 잘린다.
    // 레인은 아래로 갈수록 넓으므로 묶음 아래끝 높이의 레인 오른쪽 끝을 기준으로 한다.
    const rightHudBounds = rightHud.getBounds();
    const minRightHudOffsetPx =
      getPlayfieldXAtY(playfield, playfield.leftPx + playfield.widthPx, rightHudBounds.bottom) -
      rightHudBounds.left;
    const fitToWindow = (): void => {
      const { width, height } = this.scale.parentSize;
      const gameWidthPx = Math.round((GAME_HEIGHT * width) / height);
      if (gameWidthPx !== this.scale.width) {
        this.scale.setGameSize(gameWidthPx, GAME_HEIGHT);
        fitSkyScrim(skyScrim, gameWidthPx);
      }
      // 가속이 꺼지면 소수 px 위치의 화면 크기 그림을 보간해 그려 한 장에 약 3.6ms 가 들어 정수로 맞춘다.
      const edgeOffsetPx = Math.round((gameWidthPx - GAME_WIDTH) / 2);
      this.cameras.main.setScroll(-edgeOffsetPx, 0);
      rightHud.setX(Math.max(edgeOffsetPx, minRightHudOffsetPx));
    };
    fitToWindow();
    this.scale.on(Phaser.Scale.Events.RESIZE, fitToWindow);

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'Tab') {
        // 브라우저가 Tab 으로 포커스를 옮기지 않게 한다.
        event.preventDefault();
      }
      controller.keyDown(event.code, event.repeat, event.timeStamp);
    };
    const onKeyUp = (event: KeyboardEvent): void => controller.keyUp(event.code, event.timeStamp);
    const onUpdate = (): void => controller.tick();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    this.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      this.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
      this.scale.off(Phaser.Scale.Events.RESIZE, fitToWindow);
      // 다른 화면은 1920×1080 배치를 FIT 으로 맞춘다.
      this.scale.setGameSize(GAME_WIDTH, GAME_HEIGHT);
      controller.close();
      delete this.mvLayer.dataset.mvHidden;
      delete this.mvLayer.dataset.graphics;
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

  private renderStatus(
    view: GameplayView,
    previous: GameplayStatus | null,
    next: GameplayStatus,
  ): void {
    for (const region of getChangedStatusRegions(previous, next)) {
      this.renderStatusRegion(view, next, region);
    }
  }

  private renderStatusRegion(
    view: GameplayView,
    status: GameplayStatus,
    region: GameplayStatusRegion,
  ): void {
    const { notice, countdownDigit } = getStatusView(status);
    const { countdownText } = view;
    switch (region) {
      case 'notice':
        switch (notice.kind) {
          case 'none':
            view.status.show(notice);
            return;
          case 'loading':
            view.status.show({
              kind: 'loading',
              text: this.i18n.t(STATUS_MESSAGES[notice.message]),
            });
            return;
        }
        return;
      case 'countdown':
        countdownText.setText(countdownDigit === null ? '' : `${countdownDigit}`);
        return;
      case 'countdownPop':
        this.tweens.killTweensOf(countdownText);
        countdownText.setScale(1).setAlpha(1);
        if (countdownDigit !== null) {
          // 숫자가 바뀌는 순간을 박자처럼 읽게 해 재개 시점을 미리 맞출 수 있게 한다.
          countdownText.setScale(COUNTDOWN_POP_SCALE).setAlpha(COUNTDOWN_POP_START_ALPHA);
          this.tweens.add({
            targets: countdownText,
            scale: 1,
            alpha: 1,
            duration: MOTION.fastMs,
            ease: 'Cubic.Out',
          });
        }
        return;
    }
  }

  private beginPlay(view: GameplayView, chart: Chart, scrollSpeedPxPerSecond: number): PlayScreen {
    const notes = new NoteLayer(this, {
      notes: chart.notes,
      playfield: view.playfield,
      scrollSpeedPxPerSecond,
    });
    setComboTint([...view.combo.layers, view.comboLabel], getComboTier(0));
    return {
      approachMs: getNoteTimeAtY(0, 0, view.playfield.judgeLineYPx, scrollSpeedPxPerSecond),
      drawFrame: (previous, next) => {
        view.laneFx.setActivation(next.activation.level);
        if (next.activation.reachedFull) {
          playCelestialOnce(view.comboGlint);
        }
        notes.spawn(getEnteredNoteRange(previous, next));
        notes.render(next.session, next.songTimeMs, getNoteTrailMs(previous, next));
        for (const region of getChangedHudRegions(previous, next)) {
          this.renderHudRegion(view, next, region);
        }
      },
      hasNoteEntered: (noteTimeMs, songTimeMs) => notes.hasEntered(noteTimeMs, songTimeMs),
      pressLane: (lane) => {
        view.soundEffects.play('lanePress');
        view.laneFx.press(lane);
        this.flashKeyLabel(requireDefined(view.lanes[lane], 'Unknown lane', lane).keyLabel);
      },
      showJudgments: (events) => this.applyJudgmentEvents(view, events),
      hideIntro: () => this.hideIntro(view),
      playFullCombo: (onDone) =>
        this.clearPlayfield(view, () => playFullComboFx(this, this.celestial, onDone)),
      // 확인창이 열려 있어도 keyup 판정으로 실패할 수 있으므로 확인창만 숨긴다.
      playFailure: (onDone) => {
        view.quitDialog.render(null);
        playFailureFx(
          this,
          this.celestial,
          view.modeHud.kind === 'standard' ? view.modeHud.starlight : null,
          onDone,
        );
      },
      playClear: (onDone) => this.clearPlayfield(view, () => playClearFx(this, onDone)),
    };
  }

  private showLoadError(view: GameplayView, error: GameplayLoadError): void {
    const { message, hasHint } = getLoadErrorText(error);
    view.quitDialog.render(null);
    this.hideIntro(view);
    // 오류 뒤에는 컨트롤러가 안내를 더 보내지 않으므로 처음 그리듯 안내를 지운다.
    this.renderStatus(view, null, { kind: 'none' });
    addHudText(
      this,
      SCREEN_CENTER_X_PX,
      ERROR_MESSAGE_Y_PX,
      this.translateLoadError(message),
      textStyle('heading', COLORS.textPrimary),
    );
    if (hasHint) {
      addHudText(
        this,
        SCREEN_CENTER_X_PX,
        ERROR_HINT_Y_PX,
        this.i18n.t('youtubeError.embeddingNotAllowedHint'),
        textStyle('secondary', COLORS.textSecondary),
      );
    }
    view.backButton.setVisible(true).playFocus(true);
  }

  private renderButtonRegion(
    view: GameplayView,
    buttons: GameplayButtons,
    region: GameplayButtonRegion,
  ): void {
    switch (region) {
      case 'backButton':
        view.backButton.render(getGameplayButtonView(buttons, 'back'));
        return;
      case 'quitConfirmButtons':
        view.quitDialog.renderButtons(
          getGameplayButtonView(buttons, 'quitCancel'),
          getGameplayButtonView(buttons, 'quitAccept'),
        );
        return;
    }
  }

  private translateLoadError(message: LoadErrorMessage): string {
    switch (message.kind) {
      case 'key':
        return this.i18n.t(message.key);
      case 'videoError':
        return this.i18n.t('gameplay.videoError', {
          message: this.i18n.t('youtubeError.withCode', {
            message: this.i18n.t(`youtubeError.${message.errorKind}`),
            code: message.code,
          }),
        });
    }
  }

  private hideIntro(view: GameplayView): void {
    view.introTitle.setVisible(false);
    view.introDifficulty.setVisible(false);
    // 콤보는 곡 제목과 같은 자리라 시작 전에는 숨겨 두고 제목이 걷힐 때 들인다.
    this.tweens.add({
      targets: view.combo.layers,
      alpha: COMBO_ALPHA,
      duration: MOTION.mediumMs,
    });
    this.tweens.add({
      targets: view.comboLabel,
      alpha: COMBO_LABEL_ALPHA,
      duration: MOTION.mediumMs,
    });
  }

  private popComboTier(comboLayers: readonly Phaser.GameObjects.BitmapText[]): void {
    this.tweens.add({
      targets: comboLayers,
      scale: {
        from: COMBO_TIER_POP_SCALE,
        to: 1,
      },
      alpha: {
        from: 1,
        to: COMBO_ALPHA,
      },
      duration: MOTION.mediumMs,
      ease: 'Cubic.Out',
    });
  }

  private openQuitConfirm(view: GameplayView, reason: QuitConfirmReason): void {
    view.status.setVisible(false);
    view.countdownText.setVisible(false);
    const { titleKey, bodyKey } = QUIT_CONFIRM_TEXTS[reason];
    view.quitDialog.render({
      title: this.i18n.t(titleKey),
      body: this.i18n.t(bodyKey),
      cancelLabel: 'CONTINUE',
      acceptLabel: 'QUIT',
      acceptTone: 'default',
    });
  }

  private closeQuitConfirm(view: GameplayView): void {
    view.quitDialog.render(null);
    view.status.setVisible(true);
    view.countdownText.setVisible(true);
  }

  private showMvMode(view: GameplayView, mode: MvMode): void {
    this.mvLayer.dataset.mvMode = mode;
    view.mvMode.show(mode, getMvModeMarks(mode));
  }

  private setMvVisible(view: GameplayView, isVisible: boolean): void {
    // 영상이 가려지면 화면이 검게 비므로 그 동안만 밤하늘 성도를 깐다.
    view.introChart.render(!isVisible);
    if (isVisible) {
      delete this.mvLayer.dataset.mvHidden;
      return;
    }
    this.mvLayer.dataset.mvHidden = '';
  }

  private clearPlayfield(view: GameplayView, onCleared: () => void): void {
    const targets = [
      ...view.playfieldChrome,
      ...view.lanes.map(({ keyLabel }) => keyLabel),
      ...view.combo.layers,
      view.comboGlint,
      view.judgmentShimmer,
      view.judgmentGlow,
      ...Object.values(view.judgments).flatMap(({ text, flash }) => [text, flash]),
    ];
    this.tweens.killTweensOf(targets);
    this.tweens.add({
      targets,
      alpha: 0,
      y: `+=${PLAYFIELD_SINK_PX}`,
      duration: PLAYFIELD_CLEAR_MS,
      ease: 'Cubic.Out',
    });
    view.laneFx.fadeOut(PLAYFIELD_CLEAR_MS, PLAYFIELD_SINK_PX);
    this.time.delayedCall(PLAYFIELD_CLEAR_MS, onCleared);
  }

  private flashKeyLabel(keyLabel: Phaser.GameObjects.Text): void {
    this.tweens.killTweensOf(keyLabel);
    keyLabel.setTint(COLORS.textPrimary);
    // 색은 tween 대상이 아니므로 fast 길이의 빈 tween 완료 시점에 되돌린다. 연타 시 이전 tween 은 정리된다.
    this.tweens.add({
      targets: keyLabel,
      alpha: 1,
      duration: MOTION.fastMs,
      onComplete: () => keyLabel.setTint(COLORS.textMuted),
    });
  }

  private applyJudgmentEvents(view: GameplayView, events: readonly JudgmentEvent[]): void {
    events.forEach((event) => {
      view.laneFx.judge(event);
      const effect = getJudgmentSoundEffect(event);
      if (effect !== null) {
        view.soundEffects.play(effect);
      }
    });
    const lastEvent = getShownJudgment(events);
    if (lastEvent === undefined) {
      return;
    }
    const { judgmentGlow } = view;
    const { judgment } = lastEvent;
    const { text: judgmentText, flash: judgmentFlash } = view.judgments[judgment];
    const color = JUDGMENT_COLORS[judgment];
    const { intensity, popScale, hasGlow, hasShimmer } = getJudgmentEffect(judgment);
    const judgmentTexts = Object.values(view.judgments).flatMap(({ text, flash }) => [text, flash]);
    this.tweens.killTweensOf([...judgmentTexts, judgmentGlow]);
    judgmentTexts.forEach((text) => text.setAlpha(0));
    judgmentText.setAlpha(1).setScale(popScale);
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
    judgmentFlash.setAlpha(JUDGMENT_FLASH_ALPHA * intensity).setScale(popScale);
    this.tweens.add({
      targets: judgmentFlash,
      alpha: 0,
      scale: 1,
      duration: JUDGMENT_FLASH_MS,
      ease: 'Quad.Out',
    });
    judgmentGlow.setAlpha(0);
    if (hasGlow) {
      judgmentGlow
        .setTint(color)
        .setAlpha(JUDGMENT_GLOW_ALPHA * intensity)
        .setDisplaySize(
          judgmentText.width * JUDGMENT_GLOW_WIDTH_SCALE.from,
          JUDGMENT_GLOW_HEIGHT_PX.from,
        );
      this.tweens.add({
        targets: judgmentGlow,
        alpha: 0,
        displayWidth: judgmentText.width * JUDGMENT_GLOW_WIDTH_SCALE.to,
        displayHeight: JUDGMENT_GLOW_HEIGHT_PX.to,
        duration: JUDGMENT_HOLD_MS + JUDGMENT_FADE_MS,
        ease: 'Cubic.Out',
      });
    }
    if (hasShimmer) {
      playCelestialOnce(view.judgmentShimmer);
    }
  }

  private renderHudRegion(view: GameplayView, frame: GameplayFrame, region: HudRegion): void {
    const { state } = frame;
    switch (region) {
      case 'combo':
        view.combo.render(`${state.combo}`);
        return;
      case 'comboTier':
        setComboTint([...view.combo.layers, view.comboLabel], getComboTier(state.combo));
        return;
      case 'comboPop':
        this.popComboTier(view.combo.layers);
        return;
      case 'score':
        view.score.render(formatScore(state.score));
        return;
      case 'progress':
        view.progress.render(frame.progress);
        return;
      case 'gaugeFill':
      case 'gaugeBand':
      case 'gaugeGlint':
        switch (view.modeHud.kind) {
          case 'standard':
            this.renderGaugeRegion(view.modeHud.starlight, frame, region);
            return;
          case 'practice':
            return;
        }
        return;
      case 'accuracy':
        switch (view.modeHud.kind) {
          case 'standard':
            return;
          case 'practice':
            view.modeHud.stats.renderAccuracy(calculateAccuracy(frame.state.counts));
            return;
        }
        return;
      case 'perfectCount':
      case 'greatCount':
      case 'goodCount':
      case 'badCount':
      case 'missCount':
        switch (view.modeHud.kind) {
          case 'standard':
            return;
          case 'practice': {
            const judgment = PRACTICE_COUNT_JUDGMENTS[region];
            view.modeHud.stats.renderCount(judgment, state.counts[judgment]);
            return;
          }
        }
        return;
    }
  }

  private renderGaugeRegion(
    starlight: StarlightGauge,
    frame: GameplayFrame,
    region: Extract<HudRegion, 'gaugeFill' | 'gaugeBand' | 'gaugeGlint'>,
  ): void {
    const { hp } = frame.state;
    switch (region) {
      case 'gaugeFill':
        starlight.renderFill(hp);
        return;
      case 'gaugeBand': {
        const band = getStarlightBand(hp);
        starlight.renderBand(band, isBreathingBand(band));
        return;
      }
      case 'gaugeGlint':
        starlight.flashGlint();
        return;
    }
  }

  private showResult(data: ResultSceneData): void {
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      startScene(this, 'result', data),
    );
    this.cameras.main.fadeOut(MOTION.mediumMs);
  }
}

function setComboTint(
  texts: readonly (Phaser.GameObjects.Text | Phaser.GameObjects.BitmapText)[],
  tier: ComboTier,
): void {
  const { top, bottom } = COMBO_TIER_TINTS[tier];
  texts.forEach((text) => text.setTint(top, top, bottom, bottom));
}
