import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { YouTubePlayer, loadYouTubeIframeApi } from '../../audio/YouTubePlayer.js';
import type { CelestialAtlasId } from '../celestial/celestialCatalog.js';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import { SCENE_KEYS, exitScene } from '../sceneRoutes.js';
import type {
  PlayMode,
  SceneRequest,
  SongSelectRestore,
  SongSelectSceneData,
} from '../sceneRoutes.js';
import { DIFFICULTIES, SONG_FILTERS } from '../../data/songs.js';
import type { ChartRef, Song, SongFilter } from '../../data/songs.js';
import type { SongFeeds } from '../SongFeed.js';
import { getChartRecord } from '../../storage/chartRecords.js';
import type { ChartRecord, ChartRecords } from '../../storage/chartRecords.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import type { Difficulty } from '../../rhythm/types.js';
import { DEFAULT_SETTINGS } from '../../storage/settings.js';
import {
  SONG_ROW_NODE_IDS,
  canSelectRandomSong,
  createSongSelectState,
  getJacketRange,
  getPlayableSelection,
  getSongPage,
  getSongRows,
  getSongDifficultyAppearance,
  getSongRowNodeId,
  hasNewCurrentSong,
  isSameSelection,
  openSongSelect,
} from './songSelectState.js';
import { SongSelectController } from './SongSelectController.js';
import type { SongSelectScreen, SongSelectView } from './SongSelectController.js';
import { SongSelectJackets } from './SongSelectJackets.js';
import type { JacketTextures } from './SongSelectJackets.js';
import { STAYING } from '../sceneExit.js';
import type { SceneExit } from '../sceneExit.js';
import type { SongRowView, SongSelectNotice, SongSelectState } from './songSelectState.js';
import type { DifficultyAppearance } from '../difficultyAppearance.js';
import { getControlsGuide } from '../controlsGuide.js';
import { GAME_WIDTH } from '../config.js';
import { ControlsOverlay, addControlsEntry } from '../ui/ControlsOverlay.js';
import { createHeaderAuxiliaryButtons } from '../ui/auxiliaryButton.js';
import {
  addCelestialAtmosphere,
  getCelestialAtmosphereUses,
  getCelestialEntryTransitionUses,
  playCelestialEntryTransition,
} from '../celestial/celestialAtmosphere.js';
import {
  addCelestialSprite,
  applyCelestialPresentation,
  playCelestialOnce,
  queueCelestialTextures,
  setCelestialLoopActive,
} from '../celestial/celestialSprites.js';
import { formatAccuracy, formatScore } from '../ui/format.js';
import {
  JacketView,
  getLoadedJacketSongIds,
  queueJacketLoads,
  removeJacketTextures,
} from '../ui/jacket.js';
import { setFittedText } from '../ui/fitText.js';
import { ensureLightTextures } from '../ui/lightTextures.js';
import { handleEachEventOnce, readMenuAction, requireKeyboard } from '../ui/menuInput.js';
import { PointerHover } from '../ui/PointerHover.js';
import {
  CATEGORY_COLORS,
  CELESTIAL_COLORS,
  COLORS,
  INDICATOR,
  MOTION,
  RADIUS,
  SCREEN_LAYOUT,
  TYPE_SCALE,
  setTextColor,
  setTextWeight,
  textStyle,
  typeStyle,
} from '../ui/theme.js';
import { requireDefined } from '../../invariant.js';
import { IDLE_WHEEL, readWheelRows } from '../wheelRows.js';

// 공용 textSecondary 는 푸른 은색이라 밝은 목록 유리 위에서 푸르게 떠 보이므로 무채색으로 둔다.
const SECONDARY_TEXT_COLOR = 0xc8c8cb;
const FILTER_GAP_PX = 48;
const LIST_PANEL = {
  xPx: 120,
  yPx: 176,
  widthPx: 736,
  heightPx: 744,
  // 남색 위에 흰빛을 옅게 깔아 뒤 배경이 비치는 젖빛 유리처럼 보이게 한다.
  fill: CELESTIAL_COLORS.highlight,
  fillAlpha: 0.09,
} as const;
// 연습 모드는 기록이 남지 않으므로 화면 머리에 계속 보여 일반 플레이와 헷갈리지 않게 한다.
const MODE_LABEL_Y_PX = 48;
const MODE_LABEL_TYPE = {
  sizePx: 20,
  weight: 600,
} as const;
const MODE_LABEL_LETTER_SPACING_PX = 5;
const ROW_X_PX = LIST_PANEL.xPx + 72;
const FILTER_X_PX = LIST_PANEL.xPx;
const ROW_Y_PX = 200;
const ROW_WIDTH_PX = 640;
const ROW_HEIGHT_PX = 72;
const ROW_TEXT_INSET_PX = 24;
const ROWS_PER_PAGE = 9;
const THUMBNAIL_INSET_PX = 8;
const THUMBNAIL_SIZE_PX = 56;
const THUMBNAIL_TITLE_GAP_PX = 16;
const ROW_TITLE_CATEGORY_GAP_PX = 24;
const UNSELECTED_THUMBNAIL_ALPHA = 0.5;
const SELECTED_ROW_OFFSET_PX = 12;
const PAGE_X_PX = ROW_X_PX;
const PAGE_Y_PX = 872;
// 바깥 여백을 넓히고 목록·자켓·정보 사이는 좁혀 화면 가운데로 한 덩어리처럼 모이게 한다.
const DETAIL_X_PX = LIST_PANEL.xPx + LIST_PANEL.widthPx + 64;
const JACKET_Y_PX = 228;
const JACKET_SIZE_PX = 460;
const INFO_X_PX = DETAIL_X_PX + JACKET_SIZE_PX + 48;
const TITLE_Y_PX = 272;
// 오른쪽 여백을 목록 패널 왼쪽 여백과 같게 두어 한쪽으로 쏠려 보이지 않게 한다.
const DETAIL_RIGHT_X_PX = GAME_WIDTH - LIST_PANEL.xPx;
const TITLE_MAX_WIDTH_PX = DETAIL_RIGHT_X_PX - INFO_X_PX;
// 자켓 옆 칸이 좁아 긴 제목은 이 크기까지 줄인 뒤에도 넘치면 줄을 넘긴다.
const TITLE_MIN_SIZE_PX = 40;
const TITLE_SHRINK_STEP_PX = 4;
// 줄을 넘겨도 기록 묶음이 RANDOM·PLAY 위에서 끝나게 한다.
const TITLE_MAX_LINES = 3;
const CATEGORY_GAP_PX = 8;
const DIFFICULTY_Y_PX = JACKET_Y_PX + JACKET_SIZE_PX + 40;
const DIFFICULTY_GAP_PX = 40;
const SELECTED_DIFFICULTY_WEIGHT = 800;
// 선택되지 않은 탭·곡·난이도를 얇게 두어 굵은 선택 항목에 시선이 모이게 한다.
const UNSELECTED_WEIGHT = 400;
// 기록은 곡 정보와 한 묶음으로 읽히도록 카테고리 바로 아래에 둔다.
const RECORD_GROUP_GAP_PX = 40;
const RECORD_LABEL_GAP_PX = 8;
// 목록 패널과 아랫선을 맞춰 두 덩어리가 같은 바닥에 서 있게 한다.
const ACTION_BASELINE_Y_PX = LIST_PANEL.yPx + LIST_PANEL.heightPx;
// 두 버튼의 hitPaddingPx 합보다 넓혀 누르는 영역이 겹치지 않게 한다.
const RANDOM_PLAY_GAP_PX = 48;
const SONG_SELECT_ACTIONS = ['random', 'play'] as const;
type SongSelectAction = (typeof SONG_SELECT_ACTIONS)[number];
const ACTION_STYLES: Record<
  SongSelectAction,
  {
    type: { sizePx: number; weight: number };
    idleColor: number;
    hoverColor: number;
    hitPaddingPx: number;
  }
> = {
  // PLAY 보다 작고 난이도 글자보다 크게 두어 PLAY 다음 동작으로 읽히게 하되, 굵기는 낮춰 PLAY 와 겨루지 않게 한다.
  random: {
    type: {
      sizePx: TYPE_SCALE.heading.sizePx,
      weight: 500,
    },
    idleColor: SECONDARY_TEXT_COLOR,
    hoverColor: COLORS.textPrimary,
    hitPaddingPx: 12,
  },
  play: {
    type: TYPE_SCALE.title,
    idleColor: COLORS.textPrimary,
    hoverColor: COLORS.primaryHover,
    hitPaddingPx: 24,
  },
};
// 마우스 휠 한 칸의 이동량(브라우저 기본 100px)에 한 곡씩 넘어가게 한다.
const WHEEL_STEP_PX = 100;

// 선택 별의 고리(반지름 약 20px)가 썸네일에 닿지 않게 행 왼쪽 밖에 둔다.
const ROW_NODE_X_PX = ROW_X_PX - 36;
// 선택 행을 왼쪽 별 노드부터 분류 글자까지 한 덩어리로 덮어 밝은 목록 유리 위에서 눌린 듯 읽히게 한다.
const SELECTED_ROW_FILL = {
  xPx: LIST_PANEL.xPx + 8,
  insetYPx: 2,
  widthPx: LIST_PANEL.widthPx - 16,
  color: 0x02040b,
  alpha: 0.55,
} as const;
const ROW_NODE_INITIAL_ID = 'R15';
const SELECTED_HALO_ID = 'R29';
const ORBIT_ARC_ID = 'R30';
const ORBIT_ARC_POSITION_PX = {
  x: DETAIL_X_PX + JACKET_SIZE_PX + 90,
  y: JACKET_Y_PX + 110,
} as const;
const JACKET_GLINT_ID = 'R28';
const JACKET_GLINT_POSITION_PX = {
  x: DETAIL_X_PX + JACKET_SIZE_PX + 30,
  y: JACKET_Y_PX - 14,
} as const;
const NAVIGATION_STAR_ID = 'R31';
const LOADING_STAR_ID = 'R47';
const LOADING_STAR_GAP_PX = 24;
const CELESTIAL_IDS: readonly CelestialAtlasId[] = [
  ROW_NODE_INITIAL_ID,
  ...SONG_ROW_NODE_IDS,
  SELECTED_HALO_ID,
  ORBIT_ARC_ID,
  JACKET_GLINT_ID,
  NAVIGATION_STAR_ID,
  LOADING_STAR_ID,
];
const NAVIGATION_STAR_GAP_PX = 24;

interface FilterTab {
  filter: SongFilter;
  text: Phaser.GameObjects.Text;
  underline: Phaser.GameObjects.Rectangle;
}

interface SongRow {
  selectedFill: Phaser.GameObjects.Rectangle;
  background: Phaser.GameObjects.Rectangle;
  content: Phaser.GameObjects.Container;
  thumbnail: JacketView;
  title: Phaser.GameObjects.Text;
  category: Phaser.GameObjects.Text;
  node: Phaser.GameObjects.Sprite;
  isSelected: boolean;
  record: ChartRecord | null;
  shifted: boolean;
}

interface DifficultyItem {
  difficulty: Difficulty;
  text: Phaser.GameObjects.Text;
  underline: Phaser.GameObjects.Rectangle;
  /** setStyle 은 텍스트를 다시 그리므로 모양이 바뀔 때만 적용한다. */
  appearance: DifficultyAppearance | null;
}

interface ActionButton {
  text: Phaser.GameObjects.Text;
  underline: Phaser.GameObjects.Rectangle;
  hitArea: Phaser.GameObjects.Rectangle;
}

interface SongSelectHover {
  filter: PointerHover<SongFilter>;
  row: PointerHover<number>;
  difficulty: PointerHover<Difficulty>;
  action: PointerHover<SongSelectAction>;
}

interface SongSelectWidgets {
  tabs: FilterTab[];
  rows: SongRow[];
  emptyText: Phaser.GameObjects.Text;
  loadingStar: Phaser.GameObjects.Sprite;
  pageText: Phaser.GameObjects.Text;
  navigationStar: Phaser.GameObjects.Sprite;
  selectedHalo: Phaser.GameObjects.Sprite;
  orbitArc: Phaser.GameObjects.Sprite;
  jacketGlint: Phaser.GameObjects.Sprite;
  jacket: JacketView;
  titleText: Phaser.GameObjects.Text;
  categoryText: Phaser.GameObjects.Text;
  difficulties: DifficultyItem[];
  recordLabel: Phaser.GameObjects.Text;
  recordValue: Phaser.GameObjects.Text;
  noRecordText: Phaser.GameObjects.Text;
  actions: Record<SongSelectAction, ActionButton>;
  hover: SongSelectHover;
}

export class SongSelectScene extends Phaser.Scene {
  /** 포인터 hover·재킷 로드 완료 때 다시 그리기 위한 마지막 view. 상태의 원본은 컨트롤러다. */
  private shown: SongSelectView;
  /** 기록은 플레이 뒤에만 바뀌고 그때 이 씬은 다시 create 되므로 렌더마다 저장소를 다시 읽지 않는다. */
  private records: ChartRecords = new Map();
  private record: ChartRecord | null = null;
  private exit: SceneExit<SceneRequest> = STAYING;
  private mode: PlayMode = 'standard';
  private restore: SongSelectRestore | undefined;
  private readonly jacketTextures: JacketTextures = {
    loadedSongIds: () => getLoadedJacketSongIds(this),
    queue: (songs, onError) => queueJacketLoads(this, songs, onError),
    start: () => this.load.start(),
    remove: (songIds) => removeJacketTextures(this, songIds),
  };
  private jackets = new SongSelectJackets(this.jacketTextures);

  constructor(
    private readonly save: LocalSave,
    private readonly mvLayer: HTMLElement,
    private readonly feeds: SongFeeds,
    private readonly i18n: I18n,
    private readonly celestial: CelestialCatalog,
  ) {
    super(SCENE_KEYS.songSelect);
    this.shown = {
      state: createSongSelectState(feeds.catalog.songs, 'all', DEFAULT_SETTINGS.laneMode),
      notice: null,
    };
  }

  init(data: SongSelectSceneData): void {
    this.restore = data.restore;
  }

  preload(): void {
    this.jackets = new SongSelectJackets(this.jacketTextures);
    // 재킷 범위는 곡 목록과 선택 위치로만 정해져 레인 수와 무관하므로 설정을 읽지 않는다.
    this.jackets.preload(
      getJacketRange(
        openSongSelect(this.feeds.catalog, DEFAULT_SETTINGS.laneMode, this.restore).state,
        ROWS_PER_PAGE,
      ),
    );
    queueCelestialTextures(this, this.celestial, [
      ...getCelestialAtmosphereUses(this.celestial, 'songSelect'),
      ...getCelestialEntryTransitionUses(this.celestial),
      ...CELESTIAL_IDS.map((id) => this.celestial.atlasPresentations[id]),
    ]);
  }

  create(data: SongSelectSceneData): void {
    this.exit = STAYING;
    this.mode = data.mode;
    // 미리듣기는 소리만 낸다.
    this.mvLayer.dataset.mvHidden = '';
    addCelestialAtmosphere(this, this.celestial, 'songSelect');
    this.add
      .rectangle(
        LIST_PANEL.xPx,
        LIST_PANEL.yPx,
        LIST_PANEL.widthPx,
        LIST_PANEL.heightPx,
        LIST_PANEL.fill,
        LIST_PANEL.fillAlpha,
      )
      .setOrigin(0, 0)
      .setRounded(RADIUS.smallPx);
    const keyboard = requireKeyboard(this);
    this.records = this.save.loadRecords();
    ensureLightTextures(this);
    this.cameras.main.fadeIn(MOTION.mediumMs);

    const hover: SongSelectHover = {
      filter: new PointerHover((filter) => this.renderTab(view, getTab(view, filter))),
      row: new PointerHover((slot) => this.renderRowHighlight(view, slot)),
      difficulty: new PointerHover((difficulty) =>
        this.renderDifficulty(view, getDifficultyItem(view, difficulty)),
      ),
      action: new PointerHover((action) => this.renderAction(view, action)),
    };
    const screen: SongSelectScreen = {
      render: (shown, previous) => this.show(view, shown, previous),
      play: (chart, restore) => this.play(chart, restore),
      openSettings: (restore) => this.openSettings(restore),
    };
    if (this.mode === 'practice') {
      this.add.text(FILTER_X_PX, MODE_LABEL_Y_PX, 'PRACTICE', {
        ...typeStyle(MODE_LABEL_TYPE, COLORS.textMuted),
        letterSpacing: MODE_LABEL_LETTER_SPACING_PX,
      });
    }
    const tabs = this.createFilterTabs(hover.filter, (filter) => controller.selectFilter(filter));
    const view: SongSelectWidgets = {
      tabs,
      rows: this.createSongRows(hover.row, (slot) => controller.selectRow(slot)),
      emptyText: this.add
        .text(
          LIST_PANEL.xPx + LIST_PANEL.widthPx / 2,
          LIST_PANEL.yPx + LIST_PANEL.heightPx / 2,
          '',
          textStyle('secondary', SECONDARY_TEXT_COLOR),
        )
        .setOrigin(0.5),
      loadingStar: this.addCelestial(LOADING_STAR_ID, 0, 0),
      pageText: this.add.text(PAGE_X_PX, PAGE_Y_PX, '', textStyle('meta', SECONDARY_TEXT_COLOR)),
      navigationStar: this.addCelestial(NAVIGATION_STAR_ID, 0, 0),
      selectedHalo: this.addCelestial(SELECTED_HALO_ID, 0, 0),
      orbitArc: this.addCelestial(ORBIT_ARC_ID, ORBIT_ARC_POSITION_PX.x, ORBIT_ARC_POSITION_PX.y),
      jacketGlint: this.addCelestial(
        JACKET_GLINT_ID,
        JACKET_GLINT_POSITION_PX.x,
        JACKET_GLINT_POSITION_PX.y,
      ),
      jacket: new JacketView(this, DETAIL_X_PX, JACKET_Y_PX, JACKET_SIZE_PX),
      titleText: this.add
        .text(INFO_X_PX, TITLE_Y_PX, '', textStyle('title', COLORS.textPrimary))
        .setMaxLines(TITLE_MAX_LINES),
      categoryText: this.add.text(
        INFO_X_PX,
        TITLE_Y_PX,
        '',
        textStyle('secondary', SECONDARY_TEXT_COLOR),
      ),
      difficulties: this.createDifficultyItems(hover.difficulty, (difficulty) =>
        controller.selectDifficulty(difficulty),
      ),
      ...this.createRecordTexts(),
      actions: this.createActionButtons(hover.action, {
        random: () => controller.selectRandomSong(),
        play: () => controller.play(),
      }),
      hover,
    };
    const overlay = new ControlsOverlay(this, () =>
      getControlsGuide(this.i18n.t('controls', { returnObjects: true }), this.save.loadSettings()),
    );
    addControlsEntry(this, SCREEN_LAYOUT.leftXPx, SCREEN_LAYOUT.hintYPx, () => overlay.open());
    createHeaderAuxiliaryButtons(this, [
      {
        label: 'SETTINGS',
        onActivate: () => controller.openSettings(),
      },
    ]);
    keyboard.addCapture('TAB');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.removeCapture('TAB'));
    const renderLoadedJackets = (): void => {
      this.jackets.complete(getShownSongs(view));
      this.render(view);
    };
    this.load.on(Phaser.Loader.Events.COMPLETE, renderLoadedJackets);
    const onUpdate = (): void => controller.tick();
    this.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
      controller.close();
      this.load.off(Phaser.Loader.Events.COMPLETE, renderLoadedJackets);
      this.jackets.close();
      // mv-layer 는 게임플레이·채보 에디터도 쓰므로 가림을 남기지 않는다.
      delete this.mvLayer.dataset.mvHidden;
    });
    const settings = this.save.loadSettings();
    const controller = new SongSelectController(
      {
        feeds: this.feeds,
        random: Math.random,
        preview: {
          players: {
            loadApi: loadYouTubeIframeApi,
            create: (videoId, handlers) => new YouTubePlayer(this.mvLayer, videoId, handlers),
          },
          now: () => performance.now(),
          volume: settings.masterVolume * settings.musicVolume,
        },
      },
      screen,
      ROWS_PER_PAGE,
      settings.laneMode,
      this.restore,
    );
    playCelestialEntryTransition(
      this,
      this.celestial,
      new Phaser.Geom.Rectangle(DETAIL_X_PX, JACKET_Y_PX, JACKET_SIZE_PX, JACKET_SIZE_PX),
    );
    keyboard.on(
      'keydown',
      handleEachEventOnce((event: KeyboardEvent) => this.handleKey(event, controller, overlay)),
    );
    // 상세 패널(PLAY 버튼) 위에서 휠이 살짝 움직여 선택 곡이 바뀌지 않도록 목록 위에서만 받는다.
    const listArea = new Phaser.Geom.Rectangle(
      ROW_X_PX,
      ROW_Y_PX,
      ROW_WIDTH_PX,
      ROW_HEIGHT_PX * ROWS_PER_PAGE,
    );
    let wheel = IDLE_WHEEL;
    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (pointer: Phaser.Input.Pointer, _over: unknown, _deltaX: number, deltaY: number) => {
        if (
          this.exit.kind === 'leaving' ||
          overlay.isOpen ||
          !listArea.contains(pointer.x, pointer.y)
        ) {
          return;
        }
        const read = readWheelRows(wheel, deltaY, this.time.now, WHEEL_STEP_PX);
        wheel = read.gesture;
        if (read.rows !== 0) {
          controller.moveSong(read.rows);
        }
      },
    );
  }

  private createFilterTabs(
    hover: PointerHover<SongFilter>,
    onSelect: (filter: SongFilter) => void,
  ): FilterTab[] {
    let xPx = FILTER_X_PX;
    return SONG_FILTERS.map((filter) => {
      const text = this.add.text(
        xPx,
        SCREEN_LAYOUT.headerYPx,
        filter.toUpperCase(),
        textStyle('primary', SECONDARY_TEXT_COLOR),
      );
      // 선택 시 굵어지는 글자 폭에 맞춰 밑줄과 간격을 잡는다.
      const underline = this.addUnderline(text);
      setTextWeight(text, UNSELECTED_WEIGHT);
      hover.bind(text, filter, () => onSelect(filter));
      xPx += text.width + FILTER_GAP_PX;
      return {
        filter,
        text,
        underline,
      };
    });
  }

  private createSongRows(hover: PointerHover<number>, onSelect: (slot: number) => void): SongRow[] {
    return Array.from({ length: ROWS_PER_PAGE }, (_, slot) => {
      const yPx = ROW_Y_PX + ROW_HEIGHT_PX * slot;
      const centerYPx = getRowCenterYPx(slot);
      const selectedFill = this.add
        .rectangle(
          SELECTED_ROW_FILL.xPx,
          yPx + SELECTED_ROW_FILL.insetYPx,
          SELECTED_ROW_FILL.widthPx,
          ROW_HEIGHT_PX - SELECTED_ROW_FILL.insetYPx * 2,
          SELECTED_ROW_FILL.color,
          SELECTED_ROW_FILL.alpha,
        )
        .setOrigin(0, 0)
        .setRounded(RADIUS.smallPx)
        .setVisible(false);
      const background = this.add
        .rectangle(ROW_X_PX, yPx, ROW_WIDTH_PX, ROW_HEIGHT_PX)
        .setOrigin(0, 0);
      const thumbnailXPx = ROW_X_PX + THUMBNAIL_INSET_PX;
      const thumbnailYPx = centerYPx - THUMBNAIL_SIZE_PX / 2;
      const thumbnail = new JacketView(this, thumbnailXPx, thumbnailYPx, THUMBNAIL_SIZE_PX);
      const title = this.add
        .text(
          thumbnailXPx + THUMBNAIL_SIZE_PX + THUMBNAIL_TITLE_GAP_PX,
          centerYPx,
          '',
          textStyle('primary', COLORS.textPrimary),
        )
        .setOrigin(0, 0.5);
      const category = this.add
        .text(
          ROW_X_PX + ROW_WIDTH_PX - ROW_TEXT_INSET_PX,
          centerYPx,
          '',
          textStyle('meta', SECONDARY_TEXT_COLOR),
        )
        .setOrigin(1, 0.5);
      hover.bind(background, slot, () => onSelect(slot));
      const content = this.add.container(0, 0, [thumbnail, title]);
      return {
        selectedFill,
        background,
        content,
        thumbnail,
        title,
        category,
        node: this.addCelestial(ROW_NODE_INITIAL_ID, ROW_NODE_X_PX, centerYPx),
        isSelected: false,
        record: null,
        shifted: false,
      };
    });
  }

  private createDifficultyItems(
    hover: PointerHover<Difficulty>,
    onSelect: (difficulty: Difficulty) => void,
  ): DifficultyItem[] {
    let xPx = DETAIL_X_PX;
    return DIFFICULTIES.map((difficulty) => {
      const text = this.add.text(
        xPx,
        DIFFICULTY_Y_PX,
        difficulty.toUpperCase(),
        textStyle('primary', SECONDARY_TEXT_COLOR),
      );
      // 선택 시 굵어지는 글자 폭에 맞춰 밑줄과 간격을 잡는다.
      text.setStyle(textStyle('primary', COLORS.textPrimary, SELECTED_DIFFICULTY_WEIGHT));
      const underline = this.addUnderline(text);
      hover.bind(text, difficulty, () => onSelect(difficulty));
      xPx += text.width + DIFFICULTY_GAP_PX;
      return {
        difficulty,
        text,
        underline,
        appearance: null,
      };
    });
  }

  private addCelestial(id: CelestialAtlasId, xPx: number, yPx: number): Phaser.GameObjects.Sprite {
    return addCelestialSprite(this, this.celestial.atlasPresentations[id], xPx, yPx);
  }

  private addUnderline(text: Phaser.GameObjects.Text): Phaser.GameObjects.Rectangle {
    return this.add
      .rectangle(
        text.x,
        text.y + text.height + INDICATOR.underlineOffsetPx,
        text.width,
        INDICATOR.underlineThicknessPx,
        COLORS.textPrimary,
      )
      .setOrigin(0, 0);
  }

  private createRecordTexts(): Pick<
    SongSelectWidgets,
    'recordLabel' | 'recordValue' | 'noRecordText'
  > {
    const recordLabel = this.add.text(
      INFO_X_PX,
      TITLE_Y_PX,
      'BEST',
      textStyle('meta', SECONDARY_TEXT_COLOR),
    );
    const recordValue = this.add.text(
      INFO_X_PX,
      TITLE_Y_PX,
      '',
      textStyle('secondary', COLORS.textPrimary),
    );
    const noRecordText = this.add.text(
      INFO_X_PX,
      TITLE_Y_PX,
      this.i18n.t('songSelect.noRecord'),
      textStyle('secondary', SECONDARY_TEXT_COLOR),
    );
    return {
      recordLabel,
      recordValue,
      noRecordText,
    };
  }

  private createActionButtons(
    hover: PointerHover<SongSelectAction>,
    handlers: Record<SongSelectAction, () => void>,
  ): Record<SongSelectAction, ActionButton> {
    const play = this.addActionText('play');
    play.setPosition(
      DETAIL_RIGHT_X_PX - play.width,
      ACTION_BASELINE_Y_PX - play.getTextMetrics().ascent,
    );
    const random = this.addActionText('random');
    // 글자 크기가 달라 기준선을 맞춰야 한 줄로 읽힌다.
    random.setPosition(
      play.x - RANDOM_PLAY_GAP_PX - random.width,
      ACTION_BASELINE_Y_PX - random.getTextMetrics().ascent,
    );
    return {
      random: this.bindActionButton(hover, 'random', random, handlers.random),
      play: this.bindActionButton(hover, 'play', play, handlers.play),
    };
  }

  private addActionText(action: SongSelectAction): Phaser.GameObjects.Text {
    const { type, idleColor } = ACTION_STYLES[action];
    return this.add.text(0, 0, action.toUpperCase(), typeStyle(type, idleColor));
  }

  private bindActionButton(
    hover: PointerHover<SongSelectAction>,
    action: SongSelectAction,
    text: Phaser.GameObjects.Text,
    onActivate: () => void,
  ): ActionButton {
    const { hitPaddingPx } = ACTION_STYLES[action];
    const hitArea = this.add
      .rectangle(
        text.x - hitPaddingPx,
        text.y - hitPaddingPx,
        text.width + hitPaddingPx * 2,
        text.height + hitPaddingPx * 2,
      )
      .setOrigin(0, 0);
    hover.bind(hitArea, action, onActivate);
    return {
      text,
      underline: this.addUnderline(text),
      hitArea,
    };
  }

  private handleKey(
    event: KeyboardEvent,
    controller: SongSelectController,
    overlay: ControlsOverlay,
  ): void {
    if (this.exit.kind === 'leaving') {
      return;
    }
    if (overlay.handleKey(event)) {
      return;
    }
    switch (readMenuAction(event)) {
      case 'up':
        controller.moveSong(-1);
        return;
      case 'down':
        controller.moveSong(1);
        return;
      case 'left':
        controller.moveDifficulty(-1);
        return;
      case 'right':
        controller.moveDifficulty(1);
        return;
      case 'confirm':
        controller.play();
        return;
      case 'back':
        this.backToMain();
        return;
      case null:
        break;
    }
    switch (event.code) {
      case 'KeyQ':
        controller.cycleFilter(-1);
        return;
      case 'KeyE':
        controller.cycleFilter(1);
        return;
      case 'Tab':
        controller.openSettings();
        return;
      case 'KeyR':
        if (!event.repeat) {
          controller.selectRandomSong();
        }
        return;
      default:
        return;
    }
  }

  private show(
    view: SongSelectWidgets,
    shown: SongSelectView,
    previous: SongSelectState | null,
  ): void {
    this.shown = shown;
    if (previous === null || !isSameSelection(previous, shown.state)) {
      this.record = this.findSelectedRecord(shown.state);
    }
    this.render(view);
    this.syncJackets(view);
    if (previous !== null && hasNewCurrentSong(previous, shown.state)) {
      playCelestialOnce(view.jacketGlint);
    }
  }

  private syncJackets(view: SongSelectWidgets): void {
    this.jackets.show(getJacketRange(this.shown.state, ROWS_PER_PAGE), getShownSongs(view));
  }

  private findSelectedRecord(state: SongSelectState): ChartRecord | null {
    const selection = getPlayableSelection(state);
    return selection === null
      ? null
      : getChartRecord(this.records, selection.song.id, selection.laneCount, selection.difficulty);
  }

  private play(chart: ChartRef, restore: SongSelectRestore): void {
    this.exit = exitScene(this, this.exit, {
      key: 'gameplay',
      data: {
        ...chart,
        mode: this.mode,
        restore,
      },
    });
  }

  private openSettings(restore: SongSelectRestore): void {
    this.exit = exitScene(this, this.exit, {
      key: 'settings',
      data: {
        returnTo: {
          key: 'songSelect',
          data: {
            mode: this.mode,
            restore,
          },
        },
      },
    });
  }

  private backToMain(): void {
    this.exit = exitScene(this, this.exit, {
      key: 'main',
      data: undefined,
    });
  }

  private render(view: SongSelectWidgets): void {
    const { state, notice } = this.shown;
    view.tabs.forEach((tab) => this.renderTab(view, tab));
    getSongRows(state, ROWS_PER_PAGE).forEach((rowView, slot) =>
      this.renderRow(view, slot, rowView),
    );
    this.renderSelectedHalo(view);
    view.emptyText.setVisible(notice !== null);
    if (notice !== null) {
      view.emptyText.setText(this.translateNotice(notice));
    }
    const isLoading = notice === 'loading';
    if (isLoading) {
      const bounds = view.emptyText.getBounds();
      view.loadingStar.setPosition(bounds.left - LOADING_STAR_GAP_PX, bounds.centerY);
    }
    setCelestialLoopActive(view.loadingStar, isLoading);
    const { pageNumber, pageCount } = getSongPage(state, ROWS_PER_PAGE);
    view.pageText.setText(`${pageNumber} / ${pageCount}`).setVisible(pageCount >= 2);

    const { current } = state;
    if (current.kind === 'none') {
      this.renderNoSong(view);
    } else {
      this.renderSong(view, current.song);
    }
    view.difficulties.forEach((item) => this.renderDifficulty(view, item));
    SONG_SELECT_ACTIONS.forEach((action) => this.renderAction(view, action));
  }

  private translateNotice(notice: SongSelectNotice): string {
    switch (notice) {
      case 'loading':
        return this.i18n.t('songSelect.loading');
      case 'loadFailed':
        return this.i18n.t('songSelect.loadFailed');
      case 'noSongs':
        return this.i18n.t('songSelect.noSongs');
    }
  }

  private renderTab(view: SongSelectWidgets, { filter, text, underline }: FilterTab): void {
    const selected = filter === this.shown.state.filter;
    setTextColor(
      text,
      selected || view.hover.filter.isHovered(filter) ? COLORS.textPrimary : SECONDARY_TEXT_COLOR,
    );
    setTextWeight(text, selected ? TYPE_SCALE.primary.weight : UNSELECTED_WEIGHT);
    underline.setVisible(selected);
    if (selected) {
      const bounds = text.getBounds();
      view.navigationStar.setPosition(bounds.left - NAVIGATION_STAR_GAP_PX, bounds.centerY);
    }
  }

  private renderRow(view: SongSelectWidgets, slot: number, rowView: SongRowView): void {
    const row = getSongRow(view, slot);
    const { selectedFill, background, thumbnail, title, category, node } = row;
    const hasSong = rowView.kind === 'song';
    row.isSelected = hasSong && rowView.isSelected;
    thumbnail.setVisible(hasSong);
    selectedFill.setVisible(row.isSelected);
    title.setVisible(hasSong);
    category.setVisible(hasSong);
    node.setVisible(hasSong);
    this.shiftRow(row, row.isSelected);
    if (rowView.kind === 'empty') {
      view.hover.row.release(slot);
      background.disableInteractive(true);
      return;
    }
    const { song, recordChart } = rowView;
    background.setInteractive();
    thumbnail.setSong(song).setAlpha(row.isSelected ? 1 : UNSELECTED_THUMBNAIL_ALPHA);
    category.setText(song.category.toUpperCase());
    setTextColor(category, CATEGORY_COLORS[song.category]);
    setTextWeight(category, row.isSelected ? TYPE_SCALE.meta.weight : UNSELECTED_WEIGHT);
    setTextWeight(title, row.isSelected ? TYPE_SCALE.primary.weight : UNSELECTED_WEIGHT);
    // 선택 행은 오른쪽으로 밀리므로 그만큼 빼야 선택돼도 분류와 겹치지 않는다.
    const titleMaxWidthPx =
      category.x - category.width - ROW_TITLE_CATEGORY_GAP_PX - SELECTED_ROW_OFFSET_PX - title.x;
    setFittedText(title, song.title, titleMaxWidthPx);
    row.record =
      recordChart === null
        ? null
        : getChartRecord(
            this.records,
            recordChart.song.id,
            recordChart.laneCount,
            recordChart.difficulty,
          );
    this.renderRowHighlight(view, slot);
  }

  private renderRowHighlight(view: SongSelectWidgets, slot: number): void {
    const row = getSongRow(view, slot);
    const { isSelected } = row;
    const isHovered = view.hover.row.isHovered(slot);
    applyCelestialPresentation(
      row.node,
      this.celestial.atlasPresentations[getSongRowNodeId(row.record, isSelected, isHovered)],
    );
  }

  private renderSelectedHalo(view: SongSelectWidgets): void {
    const { selectedSlot } = getSongPage(this.shown.state, ROWS_PER_PAGE);
    const isSelected = selectedSlot !== null;
    if (isSelected) {
      view.selectedHalo.setPosition(ROW_NODE_X_PX, getRowCenterYPx(selectedSlot));
    }
    setCelestialLoopActive(view.selectedHalo, isSelected);
  }

  private renderSong(view: SongSelectWidgets, song: Song): void {
    view.jacket.setSong(song, true);
    view.orbitArc.setVisible(true);
    let titleSizePx = TYPE_SCALE.title.sizePx;
    view.titleText.setWordWrapWidth(null).setFontSize(titleSizePx).setText(song.title);
    while (view.titleText.width > TITLE_MAX_WIDTH_PX && titleSizePx > TITLE_MIN_SIZE_PX) {
      titleSizePx -= TITLE_SHRINK_STEP_PX;
      view.titleText.setFontSize(titleSizePx);
    }
    view.titleText.setWordWrapWidth(TITLE_MAX_WIDTH_PX, true);
    setTextColor(view.categoryText, CATEGORY_COLORS[song.category]);
    view.categoryText
      .setText(song.category.toUpperCase())
      .setY(view.titleText.y + view.titleText.height + CATEGORY_GAP_PX);
    const recordYPx = view.categoryText.y + view.categoryText.height + RECORD_GROUP_GAP_PX;
    const record = this.record;
    view.recordLabel.setY(recordYPx).setVisible(record !== null);
    view.noRecordText.setY(recordYPx);
    view.recordValue
      .setY(recordYPx + view.recordLabel.height + RECORD_LABEL_GAP_PX)
      .setText(
        record === null ? '' : `${formatScore(record.score)}   ${formatAccuracy(record.accuracy)}`,
      )
      .setVisible(record !== null);
    view.noRecordText.setVisible(record === null);
  }

  private renderNoSong(view: SongSelectWidgets): void {
    view.jacket.setSong(null, true);
    view.orbitArc.setVisible(false);
    view.titleText.setText('');
    view.categoryText.setText('');
    view.recordLabel.setVisible(false);
    view.recordValue.setVisible(false);
    view.noRecordText.setVisible(false);
  }

  private renderDifficulty(view: SongSelectWidgets, item: DifficultyItem): void {
    const { difficulty, text, underline } = item;
    const appearance = getSongDifficultyAppearance(
      this.shown.state,
      difficulty,
      view.hover.difficulty.isHovered(difficulty),
    );
    underline.setVisible(appearance === 'selected');
    const { current } = this.shown.state;
    if (current.kind === 'song') {
      underline.setFillStyle(current.song.accentColor);
    }
    if (appearance === 'disabled') {
      view.hover.difficulty.release(difficulty);
      text.disableInteractive(true);
    } else {
      text.setInteractive();
    }
    this.applyDifficultyAppearance(item, appearance);
  }

  private applyDifficultyAppearance(item: DifficultyItem, appearance: DifficultyAppearance): void {
    if (appearance === item.appearance) {
      return;
    }
    item.appearance = appearance;
    switch (appearance) {
      case 'disabled':
        item.text.setStyle(textStyle('primary', COLORS.textDisabled, UNSELECTED_WEIGHT));
        return;
      case 'selected':
        item.text.setStyle(textStyle('primary', COLORS.textPrimary, SELECTED_DIFFICULTY_WEIGHT));
        return;
      case 'emphasized':
        item.text.setStyle(textStyle('primary', COLORS.textPrimary, UNSELECTED_WEIGHT));
        return;
      case 'normal':
        item.text.setStyle(textStyle('primary', SECONDARY_TEXT_COLOR, UNSELECTED_WEIGHT));
        return;
    }
  }

  private renderAction(view: SongSelectWidgets, action: SongSelectAction): void {
    const { text, underline, hitArea } = view.actions[action];
    const isEnabled =
      action === 'random'
        ? canSelectRandomSong(this.shown.state)
        : getPlayableSelection(this.shown.state) !== null;
    if (!isEnabled) {
      view.hover.action.release(action);
      hitArea.disableInteractive(true);
      setTextColor(text, COLORS.textDisabled);
      underline.setVisible(false);
      return;
    }
    hitArea.setInteractive();
    const { idleColor, hoverColor } = ACTION_STYLES[action];
    const isHovered = view.hover.action.isHovered(action);
    const color = isHovered ? hoverColor : idleColor;
    setTextColor(text, color);
    underline.setFillStyle(color).setVisible(isHovered);
  }

  private shiftRow(row: SongRow, shifted: boolean): void {
    if (row.shifted === shifted) {
      return;
    }
    row.shifted = shifted;
    this.tweens.killTweensOf(row.content);
    this.tweens.add({
      targets: row.content,
      x: shifted ? SELECTED_ROW_OFFSET_PX : 0,
      duration: MOTION.fastMs,
      ease: 'Cubic.Out',
    });
  }
}

function getRowCenterYPx(slot: number): number {
  return ROW_Y_PX + ROW_HEIGHT_PX * slot + ROW_HEIGHT_PX / 2;
}

function getSongRow(view: SongSelectWidgets, slot: number): SongRow {
  return requireDefined(view.rows[slot], 'Invalid song row slot', slot);
}

function getTab(view: SongSelectWidgets, filter: SongFilter): FilterTab {
  return requireDefined(
    view.tabs.find((candidate) => candidate.filter === filter),
    'Missing filter tab',
    filter,
  );
}

function getDifficultyItem(view: SongSelectWidgets, difficulty: Difficulty): DifficultyItem {
  return requireDefined(
    view.difficulties.find((candidate) => candidate.difficulty === difficulty),
    'Missing difficulty item',
    difficulty,
  );
}

function getShownSongs(view: SongSelectWidgets): Song[] {
  return [...view.rows.flatMap((row) => row.thumbnail.shownSongs), ...view.jacket.shownSongs];
}
