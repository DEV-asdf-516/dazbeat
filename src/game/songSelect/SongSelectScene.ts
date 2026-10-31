import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { YouTubePlayer, loadYouTubeIframeApi } from '../../audio/YouTubePlayer.js';
import type { CelestialAtlasId } from '../celestial/state/celestialCatalog.js';
import type { CelestialCatalog } from '../celestial/state/celestialCatalog.js';
import { getControlsGuide } from '../app/controlsGuide.js';
import { SCENE_KEYS, exitScene } from '../app/sceneRoutes.js';
import type {
  PlayMode,
  SceneRequest,
  SongSelectRestore,
  SongSelectSceneData,
} from '../app/sceneRoutes.js';
import { SONG_FILTERS } from '../../data/songs.js';
import type { ChartRef, Song, SongFilter } from '../../data/songs.js';
import type { SongFeeds } from '../app/SongFeed.js';
import type { ChartRecord } from '../../storage/chartRecords.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import { DEFAULT_SETTINGS, getMusicVolume } from '../../storage/settings.js';
import {
  SONG_ROW_NODE_IDS,
  SONG_SELECT_ACTIONS,
  getActionAppearance,
  getChangedRegions,
  getChangedRowSlots,
  getDifficultyAccent,
  getFilterAppearance,
  getJacketRange,
  getLoadingMoreAnchor,
  getNoticeKind,
  getPageIndicator,
  getSelectedRecord,
  getSettingsButtonView,
  getShiftedRowSlots,
  getSongDifficultyAppearance,
  getSongPage,
  getSongRows,
  getSongSelectControlsCloseView,
  isSongSelectControlsEntryHovered,
  openSongSelect,
  readSongSelectShortcut,
} from './state/songSelectState.js';
import { SongSelectController } from './SongSelectController.js';
import type { SongSelectScreen } from './SongSelectController.js';
import { DIFFICULTY_TAB_ITEMS } from '../ui/state/difficultyAppearance.js';
import type { Difficulty } from '../../rhythm/types.js';
import { SongSelectJackets } from './view/SongSelectJackets.js';
import { getZodiacSign, strokeZodiacLine } from '../celestial/view/zodiacSign.js';
import { ZODIAC_FIGURES, fitZodiacFigure } from '../celestial/state/zodiacFigures.js';
import type { JacketTextures } from './view/SongSelectJackets.js';
import { STAYING } from '../app/sceneExit.js';
import type { SceneExit } from '../app/sceneExit.js';
import type {
  SongRowView,
  SongSelectAction,
  SongSelectButton,
  SongSelectNotice,
  SongSelectRegion,
  SongSelectState,
  SongSelectView,
} from './state/songSelectState.js';
import { GAME_WIDTH } from '../app/config.js';
import { MenuSceneChrome, getMenuSceneTextureUses } from '../ui/view/widgets/MenuSceneChrome.js';
import { createHeaderAuxiliaryButtons } from '../ui/view/widgets/auxiliaryButton.js';
import type { Button } from '../ui/view/widgets/Button.js';
import {
  addCelestialSprite,
  applyCelestialPresentation,
  playCelestialOnce,
  queueCelestialTextures,
  setCelestialLoopActive,
} from '../celestial/view/celestialSprites.js';
import { formatAccuracy, formatScore } from '../ui/state/format.js';
import {
  JacketView,
  getLoadedJacketSongIds,
  queueJacketLoads,
  removeJacketTextures,
} from '../ui/view/widgets/jacket.js';
import { setFittedText } from '../ui/view/widgets/fitText.js';
import { ensureLightTextures } from '../ui/view/textures/lightTextures.js';
import { requireKeyboard } from '../ui/view/input/menuInput.js';
import type { MenuAction } from '../ui/state/menuAction.js';
import { bindHoverTarget, pointButton } from '../ui/view/input/hoverTarget.js';
import type { ButtonPointer } from '../ui/view/input/hoverTarget.js';
import { TextTabs } from '../ui/view/widgets/TextTabs.js';
import type { TextTabsLayout, TextTabsStyle } from '../ui/view/widgets/TextTabs.js';
import { SoundEffects, queueSoundEffects } from '../ui/view/soundEffects.js';
import { LOADING_STAR_ID } from '../ui/view/widgets/LoadingStar.js';
import { NoticeText } from '../ui/view/widgets/NoticeText.js';
import {
  CATEGORY_COLORS,
  CELESTIAL_COLORS,
  COLORS,
  LIST_ROW,
  RADIUS,
  SCREEN_LAYOUT,
  TYPE_SCALE,
  addTextUnderline,
  setTextColor,
  setTextWeight,
  textStyle,
  typeStyle,
} from '../ui/view/theme.js';
import { MOTION } from '../ui/state/motion.js';
import { requireDefined } from '../../invariant.js';

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
const PAGE_LINE_CENTER_Y_PX = PAGE_Y_PX + TYPE_SCALE.meta.sizePx / 2;
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
// 선택되지 않은 탭·곡·난이도를 얇게 두어 굵은 선택 항목에 시선이 모이게 한다.
const UNSELECTED_WEIGHT = 400;
const FILTER_TABS_STYLE: TextTabsStyle = {
  type: {
    sizePx: TYPE_SCALE.primary.sizePx,
    weight: UNSELECTED_WEIGHT,
  },
  selectedWeight: TYPE_SCALE.primary.weight,
  gapPx: FILTER_GAP_PX,
  normalColor: CELESTIAL_COLORS.textNeutral,
};
const DIFFICULTY_TABS_LAYOUT: TextTabsLayout = {
  xPx: DETAIL_X_PX,
  align: 'left',
  topYPx: DIFFICULTY_Y_PX,
};
const DIFFICULTY_TABS_STYLE: TextTabsStyle = {
  type: {
    sizePx: TYPE_SCALE.primary.sizePx,
    weight: UNSELECTED_WEIGHT,
  },
  selectedWeight: 800,
  gapPx: 40,
  normalColor: CELESTIAL_COLORS.textNeutral,
};
// 기록은 곡 정보와 한 묶음으로 읽히도록 카테고리 바로 아래에 둔다.
const RECORD_GROUP_GAP_PX = 40;
const RECORD_LABEL_GAP_PX = 8;
// 목록 패널과 아랫선을 맞춰 두 덩어리가 같은 바닥에 서 있게 한다.
const ACTION_BASELINE_Y_PX = LIST_PANEL.yPx + LIST_PANEL.heightPx;
// 두 버튼의 hitPaddingPx 합보다 넓혀 누르는 영역이 겹치지 않게 한다.
const RANDOM_PLAY_GAP_PX = 48;
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
    idleColor: CELESTIAL_COLORS.textNeutral,
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

const ROW_NODE_X_PX = ROW_X_PX - LIST_ROW.nodeOffsetXPx;
const SELECTED_ROW_FILL = {
  ...LIST_ROW.selectedFill,
  xPx: LIST_PANEL.xPx + 8,
  widthPx: LIST_PANEL.widthPx - 16,
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
// 별자리는 기록 아래부터 RANDOM, PLAY 위까지 남는 하늘에 맞춰 줄인다. 제목이 길면 남는 하늘이 줄어든다.
const ZODIAC_MAX_SPAN_PX = 290;
// 난이도 탭 끝(EXPERT)이 정보 열 왼쪽 선을 조금 넘어오므로 그만큼 비켜 선다.
const ZODIAC_AREA_LEFT_X_PX = INFO_X_PX + 40;
const ZODIAC_AREA_GAP_PX = 40;
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

interface SongRow {
  selectedFill: Phaser.GameObjects.Rectangle;
  background: Phaser.GameObjects.Rectangle;
  content: Phaser.GameObjects.Container;
  thumbnail: JacketView;
  title: Phaser.GameObjects.Text;
  category: Phaser.GameObjects.Text;
  node: Phaser.GameObjects.Sprite;
}

interface ActionButton {
  text: Phaser.GameObjects.Text;
  underline: Phaser.GameObjects.Rectangle;
  hitArea: Phaser.GameObjects.Rectangle;
}

interface SongSelectWidgets {
  chrome: MenuSceneChrome;
  tabs: TextTabs<SongFilter>;
  rows: SongRow[];
  notice: NoticeText;
  pageText: Phaser.GameObjects.Text;
  loadingMore: NoticeText;
  navigationStar: Phaser.GameObjects.Sprite;
  selectedHalo: Phaser.GameObjects.Sprite;
  orbitArc: Phaser.GameObjects.Sprite;
  jacketGlint: Phaser.GameObjects.Sprite;
  jacket: JacketView;
  titleText: Phaser.GameObjects.Text;
  categoryText: Phaser.GameObjects.Text;
  difficultyTabs: TextTabs<Difficulty>;
  recordLabel: Phaser.GameObjects.Text;
  recordValue: Phaser.GameObjects.Text;
  noRecordText: Phaser.GameObjects.Text;
  zodiacStars: Phaser.GameObjects.Image;
  zodiacLines: Phaser.GameObjects.Graphics;
  actions: Record<SongSelectAction, ActionButton>;
  settingsButton: Button;
}

type HoverInput = Pick<SongSelectController, 'hover' | 'unhover'>;

export class SongSelectScene extends Phaser.Scene {
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
  }

  init(data: SongSelectSceneData): void {
    this.restore = data.restore;
    this.jackets = new SongSelectJackets(this.jacketTextures);
  }

  preload(): void {
    // 재킷 범위는 곡 목록과 선택 위치로만 정해져 레인 수와 무관하므로 설정을 읽지 않는다.
    this.jackets.preload(
      getJacketRange(
        openSongSelect(this.feeds.catalog, DEFAULT_SETTINGS.laneMode, this.restore).state,
        ROWS_PER_PAGE,
      ),
    );
    queueCelestialTextures(this, this.celestial, [
      ...getMenuSceneTextureUses(this.celestial, 'songSelect'),
      ...CELESTIAL_IDS.map((id) => this.celestial.atlasPresentations[id]),
    ]);
    queueSoundEffects(this);
  }

  create(data: SongSelectSceneData): void {
    this.exit = STAYING;
    this.mode = data.mode;
    // 미리듣기는 소리만 낸다.
    this.mvLayer.dataset.mvHidden = '';
    const pointer: ButtonPointer<SongSelectButton> = {
      pointerOver: (button) => controller.pointerOver(button),
      pointerOut: (button) => controller.pointerOut(button),
      pointerDown: (button) => controller.pointerDown(button),
      pointerUp: (button) => controller.pointerUp(button),
    };
    const chrome = new MenuSceneChrome(
      this,
      {
        celestial: this.celestial,
        screen: 'songSelect',
      },
      {
        isLeaving: () => this.exit.kind === 'leaving',
        handleControlsKey: (event) => controller.handleControlsKey(event),
        handleMenuKey: (action, event) => this.handleMenuKey(action, event, controller),
      },
      pointer,
    );
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
    ensureLightTextures(this);
    this.cameras.main.fadeIn(MOTION.mediumMs);

    const hoverInput: HoverInput = {
      hover: (target) => controller.hover(target),
      unhover: (target) => controller.unhover(target),
    };
    const screen: SongSelectScreen = {
      render: (previous, next) => {
        for (const region of getChangedRegions(previous, next, ROWS_PER_PAGE)) {
          this.renderRegion(view, previous, next, region);
        }
      },
      play: (chart, restore) => this.play(chart, restore),
      openSettings: (restore) => this.openSettings(restore),
      playFocusSound: () => soundEffects.play('menuFocus'),
    };
    if (this.mode === 'practice') {
      this.add.text(FILTER_X_PX, MODE_LABEL_Y_PX, 'PRACTICE', {
        ...typeStyle(MODE_LABEL_TYPE, COLORS.textMuted),
        letterSpacing: MODE_LABEL_LETTER_SPACING_PX,
      });
    }
    const tabs = new TextTabs(
      this,
      SONG_FILTERS.map((filter) => ({
        key: filter,
        label: filter.toUpperCase(),
      })),
      {
        xPx: FILTER_X_PX,
        align: 'left',
        topYPx: SCREEN_LAYOUT.headerYPx,
      },
      FILTER_TABS_STYLE,
      {
        onSelect: (filter) => controller.selectFilter(filter),
        onHover: (filter) =>
          hoverInput.hover({
            kind: 'filter',
            filter,
          }),
        onUnhover: (filter) =>
          hoverInput.unhover({
            kind: 'filter',
            filter,
          }),
      },
    );
    const widgets: Omit<SongSelectWidgets, 'settingsButton'> = {
      chrome,
      tabs,
      rows: this.createSongRows(hoverInput, (slot) => controller.selectRow(slot)),
      notice: new NoticeText(
        this,
        this.celestial,
        this.add
          .text(
            LIST_PANEL.xPx + LIST_PANEL.widthPx / 2,
            LIST_PANEL.yPx + LIST_PANEL.heightPx / 2,
            '',
            textStyle('secondary', CELESTIAL_COLORS.textNeutral),
          )
          .setOrigin(0.5),
      ),
      pageText: this.add.text(
        PAGE_X_PX,
        PAGE_Y_PX,
        '',
        textStyle('meta', CELESTIAL_COLORS.textNeutral),
      ),
      loadingMore: new NoticeText(
        this,
        this.celestial,
        this.add.text(0, 0, '', textStyle('secondary', CELESTIAL_COLORS.textNeutral)),
      ),
      navigationStar: this.addCelestial(NAVIGATION_STAR_ID, 0, 0),
      selectedHalo: this.addCelestial(SELECTED_HALO_ID, 0, 0),
      orbitArc: this.addCelestial(ORBIT_ARC_ID, ORBIT_ARC_POSITION_PX.x, ORBIT_ARC_POSITION_PX.y),
      zodiacStars: this.add.image(0, 0, '__DEFAULT').setBlendMode(Phaser.BlendModes.SCREEN),
      zodiacLines: this.add.graphics(),
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
        textStyle('secondary', CELESTIAL_COLORS.textNeutral),
      ),
      difficultyTabs: new TextTabs(
        this,
        DIFFICULTY_TAB_ITEMS,
        DIFFICULTY_TABS_LAYOUT,
        DIFFICULTY_TABS_STYLE,
        {
          onSelect: (difficulty) => controller.selectDifficulty(difficulty),
          onHover: (difficulty) =>
            controller.hover({
              kind: 'difficulty',
              difficulty,
            }),
          onUnhover: (difficulty) =>
            controller.unhover({
              kind: 'difficulty',
              difficulty,
            }),
        },
      ),
      ...this.createRecordTexts(),
      actions: this.createActionButtons(hoverInput, {
        random: () => controller.selectRandomSong(),
        play: () => controller.play(),
      }),
    };
    const [settingsButton] = createHeaderAuxiliaryButtons(this, [
      {
        label: 'SETTINGS',
        pointer: pointButton(pointer, 'settings'),
      },
    ]);
    const view: SongSelectWidgets = {
      ...widgets,
      settingsButton: requireDefined(
        settingsButton,
        'Missing song select header button',
        'SETTINGS',
      ),
    };
    keyboard.addCapture('TAB');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.removeCapture('TAB'));
    const renderLoadedJackets = (): void => {
      this.jackets.complete(getShownSongIds(view));
      const { state, records } = controller.view;
      getSongRows(state, ROWS_PER_PAGE, records).forEach((rowView, slot) => {
        if (rowView.kind === 'song') {
          getSongRow(view, slot).thumbnail.refreshTexture(rowView.song);
        }
      });
      if (state.current.kind === 'song') {
        view.jacket.refreshTexture(state.current.song, true);
      }
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
    const soundEffects = new SoundEffects(this, settings);
    chrome.start(
      new Phaser.Geom.Rectangle(DETAIL_X_PX, JACKET_Y_PX, JACKET_SIZE_PX, JACKET_SIZE_PX),
    );
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
          volume: getMusicVolume(settings),
        },
      },
      screen,
      ROWS_PER_PAGE,
      settings.laneMode,
      this.restore,
      // 기록은 플레이 뒤에만 바뀌고 그때 이 씬은 다시 create 되므로 그릴 때마다 저장소를 다시 읽지 않는다.
      this.save.loadRecords(),
      WHEEL_STEP_PX,
    );
    // 상세 패널(PLAY 버튼) 위에서 휠이 살짝 움직여 선택 곡이 바뀌지 않도록 목록 위에서만 받는다.
    const listArea = new Phaser.Geom.Rectangle(
      ROW_X_PX,
      ROW_Y_PX,
      ROW_WIDTH_PX,
      ROW_HEIGHT_PX * ROWS_PER_PAGE,
    );
    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (pointer: Phaser.Input.Pointer, _over: unknown, _deltaX: number, deltaY: number) => {
        if (this.exit.kind === 'leaving' || !listArea.contains(pointer.x, pointer.y)) {
          return;
        }
        controller.scrollByWheel(deltaY, this.time.now);
      },
    );
  }

  private createSongRows(hoverInput: HoverInput, onSelect: (slot: number) => void): SongRow[] {
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
          textStyle('meta', CELESTIAL_COLORS.textNeutral),
        )
        .setOrigin(1, 0.5);
      bindHoverTarget(background, {
        onOver: () =>
          hoverInput.hover({
            kind: 'row',
            slot,
          }),
        onOut: () =>
          hoverInput.unhover({
            kind: 'row',
            slot,
          }),
        onActivate: () => onSelect(slot),
      });
      const content = this.add.container(0, 0, [thumbnail, title]);
      return {
        selectedFill,
        background,
        content,
        thumbnail,
        title,
        category,
        node: this.addCelestial(ROW_NODE_INITIAL_ID, ROW_NODE_X_PX, centerYPx),
      };
    });
  }

  private addCelestial(id: CelestialAtlasId, xPx: number, yPx: number): Phaser.GameObjects.Sprite {
    return addCelestialSprite(this, this.celestial.atlasPresentations[id], xPx, yPx);
  }

  private createRecordTexts(): Pick<
    SongSelectWidgets,
    'recordLabel' | 'recordValue' | 'noRecordText'
  > {
    const recordLabel = this.add.text(
      INFO_X_PX,
      TITLE_Y_PX,
      'BEST',
      textStyle('meta', CELESTIAL_COLORS.textNeutral),
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
      textStyle('secondary', CELESTIAL_COLORS.textNeutral),
    );
    return {
      recordLabel,
      recordValue,
      noRecordText,
    };
  }

  private createActionButtons(
    hoverInput: HoverInput,
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
      random: this.bindActionButton(hoverInput, 'random', random, handlers.random),
      play: this.bindActionButton(hoverInput, 'play', play, handlers.play),
    };
  }

  private addActionText(action: SongSelectAction): Phaser.GameObjects.Text {
    const { type, idleColor } = ACTION_STYLES[action];
    return this.add.text(0, 0, action.toUpperCase(), typeStyle(type, idleColor));
  }

  private bindActionButton(
    hoverInput: HoverInput,
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
    bindHoverTarget(hitArea, {
      onOver: () =>
        hoverInput.hover({
          kind: 'action',
          action,
        }),
      onOut: () =>
        hoverInput.unhover({
          kind: 'action',
          action,
        }),
      onActivate,
    });
    return {
      text,
      underline: addTextUnderline(this, text, COLORS.textPrimary),
      hitArea,
    };
  }

  private handleMenuKey(
    action: MenuAction | null,
    event: KeyboardEvent,
    controller: SongSelectController,
  ): void {
    switch (action) {
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
      case 'previousTab':
        controller.cycleFilter(-1);
        return;
      case 'nextTab':
        controller.cycleFilter(1);
        return;
      case null:
        break;
    }
    switch (readSongSelectShortcut(event)) {
      case 'openSettings':
        controller.openSettings();
        return;
      case 'selectRandomSong':
        controller.selectRandomSong();
        return;
      case null:
        return;
    }
  }

  private renderRegion(
    view: SongSelectWidgets,
    previous: SongSelectView | null,
    next: SongSelectView,
    region: SongSelectRegion,
  ): void {
    const { state, notice, isLoadingMore, songCount, records } = next;
    switch (region) {
      case 'filterTabs':
        this.renderTabs(view, state);
        return;
      case 'rows': {
        const rows = getSongRows(state, ROWS_PER_PAGE, records);
        for (const slot of getChangedRowSlots(previous, next, ROWS_PER_PAGE)) {
          this.renderRow(view, slot, requireDefined(rows[slot], 'Invalid song row slot', slot));
        }
        return;
      }
      case 'rowShift': {
        const rows = getSongRows(state, ROWS_PER_PAGE, records);
        for (const slot of getShiftedRowSlots(previous, next, ROWS_PER_PAGE)) {
          this.shiftRow(
            getSongRow(view, slot),
            requireDefined(rows[slot], 'Invalid song row slot', slot),
          );
        }
        return;
      }
      case 'selectedHalo':
        this.renderSelectedHalo(view, state);
        return;
      case 'notice':
        view.notice.show(
          notice === null
            ? { kind: 'none' }
            : {
                kind: getNoticeKind(notice),
                text: this.translateNotice(notice),
              },
        );
        return;
      case 'pageIndicator': {
        const indicator = getPageIndicator(state, ROWS_PER_PAGE, songCount);
        if (indicator === null) {
          view.pageText.setVisible(false);
        } else {
          view.pageText.setText(indicator.text).setVisible(true);
        }
        return;
      }
      case 'loadingMore': {
        const anchor = getLoadingMoreAnchor(state, ROWS_PER_PAGE);
        switch (anchor.kind) {
          case 'pageEnd':
            view.loadingMore.setPosition(PAGE_X_PX + ROW_WIDTH_PX, PAGE_LINE_CENTER_Y_PX, 1);
            break;
          case 'row':
            view.loadingMore.setPosition(
              ROW_X_PX + ROW_WIDTH_PX / 2,
              getRowCenterYPx(anchor.slot),
              0.5,
            );
            break;
        }
        view.loadingMore.show(
          isLoadingMore
            ? {
                kind: 'loading',
                text: this.i18n.t('songSelect.loadingMore'),
              }
            : { kind: 'none' },
        );
        return;
      }
      case 'jacket':
        switch (state.current.kind) {
          case 'song':
            view.jacket.setSong(state.current.song, true);
            view.orbitArc.setVisible(true);
            return;
          case 'none':
            view.jacket.setSong(null, true);
            view.orbitArc.setVisible(false);
            return;
        }
        return;
      case 'songInfo':
        switch (state.current.kind) {
          case 'song':
            this.renderSongInfo(view, state.current.song, getSelectedRecord(state, records));
            return;
          case 'none':
            this.renderNoSongInfo(view);
            return;
        }
        return;
      case 'difficultyTabs':
        view.difficultyTabs.render(
          (difficulty) => getSongDifficultyAppearance(state, difficulty),
          getDifficultyAccent(state) ?? COLORS.textPrimary,
        );
        return;
      case 'actions':
        SONG_SELECT_ACTIONS.forEach((action) => this.renderAction(view, state, action));
        return;
      case 'jacketLoads':
        this.jackets.show(getJacketRange(state, ROWS_PER_PAGE), getShownSongIds(view));
        return;
      case 'jacketGlint':
        playCelestialOnce(view.jacketGlint);
        return;
      case 'controls':
        view.chrome.renderControls(
          next.state.isControlsOpen
            ? getControlsGuide(
                this.i18n.t('controls', { returnObjects: true }),
                this.save.loadSettings(),
              )
            : null,
        );
        return;
      case 'settingsButton':
        view.settingsButton.render(getSettingsButtonView(next));
        return;
      case 'controlsEntry':
        view.chrome.renderControlsEntry(isSongSelectControlsEntryHovered(next));
        return;
      case 'controlsClose':
        view.chrome.renderControlsClose(getSongSelectControlsCloseView(next));
        return;
    }
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

  private renderTabs(view: SongSelectWidgets, state: SongSelectState): void {
    view.tabs.render((filter) => getFilterAppearance(state, filter), COLORS.textPrimary);
    const bounds = view.tabs.getBounds(state.filter);
    view.navigationStar.setPosition(bounds.left - NAVIGATION_STAR_GAP_PX, bounds.centerY);
  }

  private renderRow(view: SongSelectWidgets, slot: number, rowView: SongRowView): void {
    const row = getSongRow(view, slot);
    const { selectedFill, background, thumbnail, title, category, node } = row;
    const hasSong = rowView.kind === 'song';
    const isSelected = hasSong && rowView.appearance === 'selected';
    thumbnail.setVisible(hasSong);
    selectedFill.setVisible(isSelected);
    title.setVisible(hasSong);
    category.setVisible(hasSong);
    node.setVisible(hasSong);
    if (!hasSong) {
      background.disableInteractive(true);
      return;
    }
    const { song } = rowView;
    background.setInteractive();
    thumbnail.setSong(song).setAlpha(isSelected ? 1 : UNSELECTED_THUMBNAIL_ALPHA);
    category.setText(song.category.toUpperCase());
    setTextColor(category, CATEGORY_COLORS[song.category]);
    setTextWeight(category, isSelected ? TYPE_SCALE.meta.weight : UNSELECTED_WEIGHT);
    setTextWeight(title, isSelected ? TYPE_SCALE.primary.weight : UNSELECTED_WEIGHT);
    // 선택 행은 오른쪽으로 밀리므로 그만큼 빼야 선택돼도 분류와 겹치지 않는다.
    const titleMaxWidthPx =
      category.x - category.width - ROW_TITLE_CATEGORY_GAP_PX - SELECTED_ROW_OFFSET_PX - title.x;
    setFittedText(title, song.title, titleMaxWidthPx);
    applyCelestialPresentation(node, this.celestial.atlasPresentations[rowView.nodeId]);
  }

  private renderSelectedHalo(view: SongSelectWidgets, state: SongSelectState): void {
    const { selectedSlot } = getSongPage(state, ROWS_PER_PAGE);
    const isSelected = selectedSlot !== null;
    if (isSelected) {
      view.selectedHalo.setPosition(ROW_NODE_X_PX, getRowCenterYPx(selectedSlot));
    }
    setCelestialLoopActive(view.selectedHalo, isSelected);
  }

  private renderSongInfo(view: SongSelectWidgets, song: Song, record: ChartRecord | null): void {
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
    const hasRecord = record !== null;
    view.recordLabel.setY(recordYPx).setVisible(hasRecord);
    view.noRecordText.setY(recordYPx).setVisible(!hasRecord);
    view.recordValue
      .setY(recordYPx + view.recordLabel.height + RECORD_LABEL_GAP_PX)
      .setText(hasRecord ? `${formatScore(record.score)}   ${formatAccuracy(record.accuracy)}` : '')
      .setVisible(hasRecord);
    const recordBottom = hasRecord ? view.recordValue : view.noRecordText;
    this.renderZodiac(view, song, recordBottom.y + recordBottom.height + ZODIAC_AREA_GAP_PX);
  }

  private renderZodiac(view: SongSelectWidgets, song: Song, topYPx: number): void {
    const bottomYPx = view.actions.random.text.y - ZODIAC_AREA_GAP_PX;
    const sign = getZodiacSign(this, song.constellation, ZODIAC_MAX_SPAN_PX);
    const scale = Math.min(
      1,
      (DETAIL_RIGHT_X_PX - ZODIAC_AREA_LEFT_X_PX) / sign.figureWidthPx,
      (bottomYPx - topYPx) / sign.figureHeightPx,
    );
    const centerXPx = (ZODIAC_AREA_LEFT_X_PX + DETAIL_RIGHT_X_PX) / 2;
    const centerYPx = (topYPx + bottomYPx) / 2;
    view.zodiacStars
      .setTexture(sign.textureKey)
      .setScale(scale)
      .setPosition(centerXPx, centerYPx)
      .setVisible(true);
    const figure = ZODIAC_FIGURES[song.constellation];
    const points = fitZodiacFigure(figure, centerXPx, centerYPx, ZODIAC_MAX_SPAN_PX * scale);
    const lines = view.zodiacLines.clear().setVisible(true);
    for (const [from, to] of figure.edges) {
      const [fromXPx, fromYPx] = requireDefined(
        points[from],
        'Zodiac edge outside the figure',
        from,
      );
      const [toXPx, toYPx] = requireDefined(points[to], 'Zodiac edge outside the figure', to);
      strokeZodiacLine(lines, fromXPx, fromYPx, toXPx, toYPx);
    }
  }

  private renderNoSongInfo(view: SongSelectWidgets): void {
    view.titleText.setText('');
    view.categoryText.setText('');
    view.recordLabel.setVisible(false);
    view.recordValue.setVisible(false);
    view.noRecordText.setVisible(false);
    view.zodiacStars.setVisible(false);
    view.zodiacLines.setVisible(false);
  }

  private renderAction(
    view: SongSelectWidgets,
    state: SongSelectState,
    action: SongSelectAction,
  ): void {
    const { text, underline, hitArea } = view.actions[action];
    const { idleColor, hoverColor } = ACTION_STYLES[action];
    switch (getActionAppearance(state, action)) {
      case 'disabled':
        hitArea.disableInteractive(true);
        setTextColor(text, COLORS.textDisabled);
        underline.setVisible(false);
        return;
      case 'hovered':
        hitArea.setInteractive();
        setTextColor(text, hoverColor);
        underline.setFillStyle(hoverColor).setVisible(true);
        return;
      case 'idle':
        hitArea.setInteractive();
        setTextColor(text, idleColor);
        underline.setFillStyle(idleColor).setVisible(false);
        return;
    }
  }

  private shiftRow(row: SongRow, rowView: SongRowView): void {
    this.tweens.killTweensOf(row.content);
    this.tweens.add({
      targets: row.content,
      x: getRowShiftPx(rowView),
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

function getShownSongIds(view: SongSelectWidgets): string[] {
  return [...view.rows.flatMap((row) => row.thumbnail.shownSongIds), ...view.jacket.shownSongIds];
}

function getRowShiftPx(rowView: SongRowView): number {
  if (rowView.kind === 'empty') {
    return 0;
  }
  switch (rowView.appearance) {
    case 'selected':
      return SELECTED_ROW_OFFSET_PX;
    case 'hovered':
    case 'idle':
      return 0;
  }
}
