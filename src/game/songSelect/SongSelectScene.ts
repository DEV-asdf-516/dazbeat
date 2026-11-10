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
import type { LocalSave } from '../../storage/LocalSave.js';
import { DEFAULT_SETTINGS, getAudibleVolume } from '../../storage/settings.js';
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
  getRecordsRetryButtonView,
  getSelectedRecordView,
  getRankingButtonView,
  getRetryButtonView,
  getBackButtonView,
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
import type { SongSelectPorts, SongSelectScreen } from './SongSelectController.js';
import { DIFFICULTY_TAB_ITEMS } from '../ui/state/difficultyAppearance.js';
import type { Difficulty, LaneCount } from '../../rhythm/types.js';
import { SongSelectJackets } from './view/SongSelectJackets.js';
import { renderZodiacFigure } from '../celestial/view/zodiacSign.js';
import {
  DETAIL_RIGHT_X_PX,
  DETAIL_X_PX,
  DIFFICULTY_TABS_LAYOUT,
  DIFFICULTY_TABS_STYLE,
  INFO_X_PX,
  JACKET_SIZE_PX,
  JACKET_Y_PX,
  LIST_PANEL,
  addGlassPanel,
  PAGE_X_PX,
  PAGE_Y_PX,
  ROWS_PER_PAGE,
  ROW_HEIGHT_PX,
  ROW_WIDTH_PX,
  ROW_X_PX,
  ROW_Y_PX,
  TITLE_MAX_LINES,
  TITLE_Y_PX,
  UNSELECTED_WEIGHT,
  ZODIAC_AREA_GAP_PX,
  ZODIAC_AREA_LEFT_X_PX,
  ZODIAC_MAX_SPAN_PX,
  LANE_STAR_ID,
  addLaneMarks,
  fitSongTitle,
  renderLaneMarks,
} from '../ui/view/widgets/songDetailLayout.js';
import type { LaneMarks } from '../ui/view/widgets/songDetailLayout.js';
import type { JacketTextures } from './view/SongSelectJackets.js';
import { STAYING } from '../app/sceneExit.js';
import type { SceneExit } from '../app/sceneExit.js';
import type {
  SelectedRecordView,
  SongRowView,
  SongSelectAction,
  SongSelectButton,
  SongSelectNotice,
  SongSelectRegion,
  SongSelectState,
  SongSelectView,
} from './state/songSelectState.js';
import { getAccountPanelButtonView } from '../ui/state/accountIdentity.js';
import type { AccountSource } from '../ui/state/accountIdentity.js';
import { MenuSceneChrome, getMenuSceneTextureUses } from '../ui/view/widgets/MenuSceneChrome.js';
import { createFooterAuxiliaryButtons } from '../ui/view/widgets/auxiliaryButton.js';
import { Button } from '../ui/view/widgets/Button.js';
import { TOP_RANK_GLINT_ID, TopRankBadge } from '../ui/view/widgets/TopRankBadge.js';
import {
  addCelestialSprite,
  playCelestialOnce,
  queueCelestialTextures,
} from '../celestial/view/celestialSprites.js';
import { formatAccuracy, formatScore } from '../ui/state/format.js';
import {
  JacketView,
  getLoadedJacketSongIds,
  queueJacketLoads,
  removeJacketTextures,
} from '../ui/view/widgets/jacket.js';
import { setFittedText } from '../ui/view/widgets/fitText.js';
import { GradeLetter } from '../ui/view/widgets/GradeLetter.js';
import { queueImageLoads } from '../ui/view/textures/imageLoad.js';
import { ensureLightTextures } from '../ui/view/textures/lightTextures.js';
import { requireKeyboard } from '../ui/view/input/menuInput.js';
import type { MenuAction } from '../ui/state/menuAction.js';
import { bindHoverTarget, pointButton } from '../ui/view/input/hoverTarget.js';
import { getGrainedImageTexture } from '../ui/view/textures/grain.js';
import type { ButtonPointer } from '../ui/view/input/hoverTarget.js';
import { TextTabs } from '../ui/view/widgets/TextTabs.js';
import type { TextTabsStyle } from '../ui/view/widgets/TextTabs.js';
import { SoundEffects, queueSoundEffects } from '../ui/view/soundEffects.js';
import { LOADING_STAR_ID } from '../ui/view/widgets/LoadingStar.js';
import { LoadFailurePanel } from '../ui/view/widgets/LoadFailurePanel.js';
import { NoticeText } from '../ui/view/widgets/NoticeText.js';
import {
  CATEGORY_COLORS,
  CELESTIAL_COLORS,
  COLORS,
  LIST_ROW,
  RADIUS,
  SCREEN_LAYOUT,
  TYPE_SCALE,
  setTextColor,
  setTextWeight,
  textStyle,
  typeStyle,
} from '../ui/view/theme.js';
import { addTextUnderline } from '../ui/view/widgets/cometUnderline.js';
import { MOTION } from '../ui/state/motion.js';
import {
  ListRowMarker,
  SelectedRowHalo,
  slideSelectedRowContent,
} from '../ui/view/widgets/listRowFocus.js';
import { requireDefined } from '../../invariant.js';

const FILTER_GAP_PX = 48;
// 연습 모드는 기록이 남지 않으므로 화면 머리에 계속 보여 일반 플레이와 헷갈리지 않게 한다.
const MODE_LABEL_Y_PX = 48;
const MODE_LABEL_TYPE = {
  sizePx: 20,
  weight: 600,
} as const;
const MODE_LABEL_LETTER_SPACING_PX = 5;
const FILTER_X_PX = LIST_PANEL.xPx;
const ROW_TEXT_INSET_PX = 24;
const THUMBNAIL_INSET_PX = 8;
const THUMBNAIL_SIZE_PX = 56;
const THUMBNAIL_TITLE_GAP_PX = 16;
const ROW_TITLE_CATEGORY_GAP_PX = 24;
const UNSELECTED_THUMBNAIL_ALPHA = 0.5;
const PAGE_LINE_CENTER_Y_PX = PAGE_Y_PX + TYPE_SCALE.meta.sizePx / 2;
const CATEGORY_GAP_PX = 8;
const FILTER_TABS_STYLE: TextTabsStyle = {
  type: {
    sizePx: TYPE_SCALE.primary.sizePx,
    weight: UNSELECTED_WEIGHT,
  },
  selectedWeight: TYPE_SCALE.primary.weight,
  gapPx: FILTER_GAP_PX,
  normalColor: CELESTIAL_COLORS.textNeutral,
};
// 기록은 곡 정보와 한 묶음으로 읽히도록 카테고리 바로 아래에 둔다.
const RECORD_GROUP_GAP_PX = 40;
const RECORD_LABEL_GAP_PX = 8;
const RECORD_GRADE_GAP_PX = 24;
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
const SELECTED_ROW_FILL_X_PX = LIST_PANEL.xPx + 8;
const SELECTED_ROW_FILL_WIDTH_PX = LIST_PANEL.widthPx - 16;
const ROW_NODE_INITIAL_ID = 'R15';
const SELECTED_HALO_ID = 'R29';
const ORBIT_ARC_ID = 'R30';
const ORBIT_ARC_POSITION_PX = {
  x: DETAIL_X_PX + JACKET_SIZE_PX + 90,
  y: JACKET_Y_PX + 110,
} as const;
const LOAD_FAILURE_INSET_X_PX = 80;
// 정보 열은 폭이 좁아 패널의 한 줄 안내가 영어, 일본어에서 화면 밖으로 넘치므로 재킷 아래 난이도 탭 밑에 둔다.
const RECORDS_FAILURE_CENTER_Y_PX = 860;
// 곡이 없을 때 제목, 분류, 기록이 놓일 자리를 윤곽으로 남겨 오른쪽이 비어 보이지 않게 한다.
const DETAIL_OUTLINES = [
  {
    offsetYPx: -10,
    widthPx: 340,
    heightPx: 48,
  },
  {
    offsetYPx: 66,
    widthPx: 200,
    heightPx: 22,
  },
  {
    offsetYPx: 130,
    widthPx: 120,
    heightPx: 22,
  },
] as const;
const JACKET_GLINT_ID = 'R28';
const JACKET_GLINT_POSITION_PX = {
  x: DETAIL_X_PX + JACKET_SIZE_PX + 30,
  y: JACKET_Y_PX - 14,
} as const;
const NAVIGATION_STAR_ID = 'R31';
const CELESTIAL_IDS: readonly CelestialAtlasId[] = [
  ROW_NODE_INITIAL_ID,
  ...SONG_ROW_NODE_IDS,
  SELECTED_HALO_ID,
  ORBIT_ARC_ID,
  JACKET_GLINT_ID,
  NAVIGATION_STAR_ID,
  LANE_STAR_ID,
  LOADING_STAR_ID,
  TOP_RANK_GLINT_ID,
];
const NAVIGATION_STAR_GAP_PX = 24;
// 줄의 TOP 표시는 분류 글자 왼쪽 고정 열에 오른쪽 끝을 맞춘다.
const ROW_TOP_RANK_RIGHT_X_PX = 690;
const ROW_TOP_RANK_NUMBER_SIZE_PX = 34;
const ROW_TITLE_TOP_RANK_GAP_PX = 24;
// RANKING 은 재킷 그림을 가리지 않도록 재킷 오른쪽 위 바깥에 두고, 아이콘 오른쪽 끝을 재킷 오른쪽 끝에 맞춘다.
const RANKING_BUTTON_CENTER_Y_PX = 191;
const RANKING_ICON_TEXTURE_KEY = 'ui:song-select-ranking';
const RANKING_ICON_PATH = '/assets/ui/songSelect/ranking.png';
const RANKING_ICON_SIZE_PX = 48;
/** 아이콘 PNG 의 투명 여백만큼 더 밀어 획 끝을 재킷 오른쪽 선에 맞춘다. */
const RANKING_ICON_MARGIN_X_PX = 4;
/** quiet 버튼의 안쪽 가로 여백만큼 밀어 내용을 재킷 오른쪽 선에 맞춘다. */
const QUIET_BUTTON_PADDING_X_PX = 16;

interface SongRow {
  marker: ListRowMarker;
  background: Phaser.GameObjects.Rectangle;
  content: Phaser.GameObjects.Container;
  thumbnail: JacketView;
  title: Phaser.GameObjects.Text;
  category: Phaser.GameObjects.Text;
  topRank: TopRankBadge;
}

interface ActionButton {
  text: Phaser.GameObjects.Text;
  underline: Phaser.GameObjects.Image;
  hitArea: Phaser.GameObjects.Rectangle;
}

interface SongSelectWidgets {
  chrome: MenuSceneChrome;
  tabs: TextTabs<SongFilter>;
  rows: SongRow[];
  notice: NoticeText;
  loadFailure: LoadFailurePanel;
  recordsFailure: LoadFailurePanel;
  pageText: Phaser.GameObjects.Text;
  loadingMore: NoticeText;
  navigationStar: Phaser.GameObjects.Sprite;
  selectedHalo: SelectedRowHalo;
  orbitArc: Phaser.GameObjects.Sprite;
  jacketGlint: Phaser.GameObjects.Sprite;
  jacket: JacketView;
  detailOutlines: readonly Phaser.GameObjects.Image[];
  titleText: Phaser.GameObjects.Text;
  categoryText: Phaser.GameObjects.Text;
  laneMarks: LaneMarks;
  difficultyTabs: TextTabs<Difficulty>;
  recordLabel: Phaser.GameObjects.Text;
  recordValue: Phaser.GameObjects.Text;
  recordGrade: GradeLetter;
  noRecordText: Phaser.GameObjects.Text;
  zodiacStars: Phaser.GameObjects.Image;
  zodiacLines: Phaser.GameObjects.Graphics;
  actions: Record<SongSelectAction, ActionButton>;
  settingsButton: Button;
  backButton: Button;
  rankingButton: Button;
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
    private readonly rankings: SongSelectPorts['rankings'],
    private readonly account: AccountSource,
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
    queueImageLoads(
      this,
      [
        {
          key: RANKING_ICON_TEXTURE_KEY,
          url: RANKING_ICON_PATH,
        },
      ],
      'song select scene image',
    );
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
        account: {
          kind: 'nameplate',
          catalog: this.account.catalog,
          pointer,
        },
      },
      {
        isLeaving: () => this.exit.kind === 'leaving',
        handleControlsKey: (event) => controller.handleControlsKey(event),
        handleMenuKey: (action, event) => this.handleMenuKey(action, event, controller),
      },
      pointer,
    );
    chrome.renderAccount(this.account.getIdentity());
    addGlassPanel(this, LIST_PANEL, RADIUS.smallPx);
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
      openRanking: (chart, restore) => {
        this.exit = exitScene(this, this.exit, {
          key: 'ranking',
          data: {
            mode: this.mode,
            restore,
            chart,
          },
        });
      },
      backToMain: () => this.backToMain(),
      openProfile: (restore) => this.openProfile(restore),
      playSound: (sound) => soundEffects.play(sound),
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
    const detailOutlines = DETAIL_OUTLINES.map(({ offsetYPx, widthPx, heightPx }) =>
      addGlassPanel(
        this,
        {
          xPx: INFO_X_PX,
          yPx: TITLE_Y_PX + offsetYPx,
          widthPx,
          heightPx,
        },
        RADIUS.smallPx,
      ).setVisible(false),
    );
    const widgets: Omit<SongSelectWidgets, 'settingsButton' | 'backButton' | 'rankingButton'> = {
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
      loadFailure: new LoadFailurePanel(
        this,
        {
          leftXPx: LIST_PANEL.xPx + LOAD_FAILURE_INSET_X_PX,
          centerYPx: LIST_PANEL.yPx + LIST_PANEL.heightPx / 2,
        },
        pointButton(pointer, 'retry'),
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
      selectedHalo: new SelectedRowHalo(this, this.celestial.atlasPresentations[SELECTED_HALO_ID]),
      orbitArc: this.addCelestial(ORBIT_ARC_ID, ORBIT_ARC_POSITION_PX.x, ORBIT_ARC_POSITION_PX.y),
      zodiacStars: this.add.image(0, 0, '__DEFAULT').setBlendMode(Phaser.BlendModes.SCREEN),
      zodiacLines: this.add.graphics(),
      jacketGlint: this.addCelestial(
        JACKET_GLINT_ID,
        JACKET_GLINT_POSITION_PX.x,
        JACKET_GLINT_POSITION_PX.y,
      ),
      jacket: new JacketView(this, DETAIL_X_PX, JACKET_Y_PX, JACKET_SIZE_PX),
      detailOutlines,
      titleText: this.add
        .text(INFO_X_PX, TITLE_Y_PX, '', textStyle('title', COLORS.textPrimary))
        .setMaxLines(TITLE_MAX_LINES),
      categoryText: this.add.text(
        INFO_X_PX,
        TITLE_Y_PX,
        '',
        textStyle('secondary', CELESTIAL_COLORS.textNeutral),
      ),
      laneMarks: addLaneMarks(this, this.celestial),
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
      recordsFailure: new LoadFailurePanel(
        this,
        {
          leftXPx: DETAIL_X_PX,
          centerYPx: RECORDS_FAILURE_CENTER_Y_PX,
        },
        pointButton(pointer, 'recordsRetry'),
      ),
      actions: this.createActionButtons(hoverInput, {
        random: () => controller.selectRandomSong(),
        play: () => controller.play(),
      }),
    };
    const [settingsButton, backButton] = createFooterAuxiliaryButtons(this, [
      {
        label: 'SETTINGS',
        pointer: pointButton(pointer, 'settings'),
      },
      {
        label: 'BACK',
        pointer: pointButton(pointer, 'back'),
      },
    ]);
    const view: SongSelectWidgets = {
      ...widgets,
      settingsButton: requireDefined(
        settingsButton,
        'Missing song select header button',
        'SETTINGS',
      ),
      backButton: requireDefined(backButton, 'Missing song select header button', 'BACK'),
      rankingButton: this.createRankingButton(pointer),
    };
    keyboard.addCapture('TAB');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.removeCapture('TAB'));
    const renderLoadedJackets = (): void => {
      this.jackets.complete(getShownSongIds(view));
      const { state } = controller.view;
      getSongRows(state, ROWS_PER_PAGE).forEach((rowView, slot) => {
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
          volume: getAudibleVolume(settings, 'musicVolume'),
        },
        rankings: this.rankings,
        loadLocalRecords: () => this.save.loadRecords(),
      },
      screen,
      ROWS_PER_PAGE,
      settings.laneMode,
      this.restore,
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
      const marker = new ListRowMarker(
        this,
        {
          topYPx: yPx,
          heightPx: ROW_HEIGHT_PX,
          nodeXPx: ROW_NODE_X_PX,
          fillXPx: SELECTED_ROW_FILL_X_PX,
          fillWidthPx: SELECTED_ROW_FILL_WIDTH_PX,
        },
        this.celestial.atlasPresentations[ROW_NODE_INITIAL_ID],
      );
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
        marker,
        background,
        content,
        thumbnail,
        title,
        category,
        topRank: new TopRankBadge(this, this.celestial, {
          xPx: ROW_TOP_RANK_RIGHT_X_PX,
          yPx: centerYPx,
          align: 'right',
          hasWord: true,
          numberSizePx: ROW_TOP_RANK_NUMBER_SIZE_PX,
        }),
      };
    });
  }

  private createRankingButton(pointer: ButtonPointer<SongSelectButton>): Button {
    const button = new Button(this, 0, 0, {
      variant: 'quiet',
      focus: 'slide',
      label: 'RANKING',
      pointer: pointButton(pointer, 'ranking'),
    });
    if (this.textures.exists(RANKING_ICON_TEXTURE_KEY)) {
      button.setIcon(
        getGrainedImageTexture(this, RANKING_ICON_TEXTURE_KEY, RANKING_ICON_SIZE_PX),
        RANKING_ICON_SIZE_PX,
      );
    }
    return button.setPosition(
      DETAIL_X_PX +
        JACKET_SIZE_PX +
        QUIET_BUTTON_PADDING_X_PX +
        RANKING_ICON_MARGIN_X_PX -
        button.width,
      RANKING_BUTTON_CENTER_Y_PX - button.height / 2,
    );
  }

  private addCelestial(id: CelestialAtlasId, xPx: number, yPx: number): Phaser.GameObjects.Sprite {
    return addCelestialSprite(this, this.celestial.atlasPresentations[id], xPx, yPx);
  }

  private createRecordTexts(): Pick<
    SongSelectWidgets,
    'recordLabel' | 'recordValue' | 'recordGrade' | 'noRecordText'
  > {
    const recordLabel = this.add.text(
      INFO_X_PX,
      TITLE_Y_PX,
      'BEST',
      textStyle('meta', COLORS.textPrimary),
    );
    const recordValue = this.add.text(
      INFO_X_PX,
      TITLE_Y_PX,
      '',
      textStyle('secondary', COLORS.textPrimary),
    );
    // 등급 글자가 BEST 윗면부터 점수 기준선까지 차도록 실제 글자 높이로 크기를 정한다.
    const labelTopPx =
      recordLabel.getTextMetrics().ascent -
      recordLabel.context.measureText('BEST').actualBoundingBoxAscent;
    const valueBaselinePx =
      recordLabel.height + RECORD_LABEL_GAP_PX + recordValue.getTextMetrics().ascent;
    const recordGrade = new GradeLetter(this, this.celestial, {
      role: 'heading',
      glyphHeightPx: valueBaselinePx - labelTopPx,
    });
    recordGrade.playSheen();
    const noRecordText = this.add.text(
      INFO_X_PX,
      TITLE_Y_PX,
      this.i18n.t('songSelect.noRecord'),
      textStyle('secondary', CELESTIAL_COLORS.textNeutral),
    );
    return {
      recordLabel,
      recordValue,
      recordGrade,
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
        controller.back();
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
      case 'openRanking':
        controller.openRanking();
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
    const { state, notice, isLoadingMore, songCount } = next;
    switch (region) {
      case 'filterTabs':
        this.renderTabs(view, state);
        return;
      case 'rows': {
        const rows = getSongRows(state, ROWS_PER_PAGE);
        for (const slot of getChangedRowSlots(previous, next, ROWS_PER_PAGE)) {
          this.renderRow(view, slot, requireDefined(rows[slot], 'Invalid song row slot', slot));
        }
        return;
      }
      case 'rowShift': {
        const rows = getSongRows(state, ROWS_PER_PAGE);
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
        view.loadFailure.render(
          notice === 'loadFailed'
            ? {
                title: this.i18n.t('songSelect.loadFailed'),
                body: this.i18n.t('loadFailure.body'),
              }
            : null,
        );
        view.notice.show(
          notice === null || notice === 'loadFailed'
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
            view.detailOutlines.forEach((outline) => outline.setVisible(false));
            view.orbitArc.setVisible(true);
            return;
          case 'none':
            view.jacket.setEmptySlot(true);
            view.detailOutlines.forEach((outline) => outline.setVisible(true));
            view.orbitArc.setVisible(false);
            return;
        }
        return;
      case 'songInfo':
        switch (state.current.kind) {
          case 'song':
            this.renderSongInfo(
              view,
              state.current.song,
              state.laneCount,
              getSelectedRecordView(state),
            );
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
      case 'backButton':
        view.backButton.render(getBackButtonView(next));
        return;
      case 'rankingButton':
        view.rankingButton.render(getRankingButtonView(next));
        return;
      case 'retryButton':
        view.loadFailure.renderRetry(getRetryButtonView(next));
        return;
      case 'recordsRetryButton':
        view.recordsFailure.renderRetry(getRecordsRetryButtonView(next));
        return;
      case 'controlsEntry':
        view.chrome.renderControlsEntry(isSongSelectControlsEntryHovered(next));
        return;
      case 'controlsClose':
        view.chrome.renderControlsClose(getSongSelectControlsCloseView(next));
        return;
      case 'accountButton':
        view.chrome.renderAccountButton(getAccountPanelButtonView(next.state.hover));
        return;
    }
  }

  private play(chart: ChartRef, restore: SongSelectRestore): void {
    this.exit = exitScene(this, this.exit, {
      key: 'gameplay',
      data: {
        ...chart,
        origin: {
          kind: 'songSelect',
          mode: this.mode,
          quitKey: 'confirm',
          start: { kind: 'whole' },
          restore,
        },
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

  private openProfile(restore: SongSelectRestore): void {
    this.exit = exitScene(this, this.exit, {
      key: 'profile',
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

  private translateNotice(notice: Exclude<SongSelectNotice, 'loadFailed'>): string {
    switch (notice) {
      case 'loading':
        return this.i18n.t('songSelect.loading');
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
    const { marker, background, thumbnail, title, category, topRank } = row;
    const hasSong = rowView.kind === 'song';
    const isSelected = hasSong && rowView.appearance === 'selected';
    thumbnail.setVisible(hasSong);
    title.setVisible(hasSong);
    category.setVisible(hasSong);
    if (!hasSong) {
      topRank.render(null);
      marker.render(null);
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
    topRank.render(rowView.topRank);
    const topRankLeftXPx = topRank.getLeftXPx();
    // 선택 행은 오른쪽으로 밀리므로 그만큼 빼야 선택돼도 분류나 TOP 표시와 겹치지 않는다.
    const titleRightXPx =
      topRankLeftXPx === null
        ? category.x - category.width - ROW_TITLE_CATEGORY_GAP_PX
        : topRankLeftXPx - ROW_TITLE_TOP_RANK_GAP_PX;
    const titleMaxWidthPx = titleRightXPx - LIST_ROW.selectedShiftPx - title.x;
    setFittedText(title, song.title, titleMaxWidthPx);
    marker.render({
      node: this.celestial.atlasPresentations[rowView.nodeId],
      isSelected,
    });
  }

  private renderSelectedHalo(view: SongSelectWidgets, state: SongSelectState): void {
    const { selectedSlot } = getSongPage(state, ROWS_PER_PAGE);
    view.selectedHalo.render(selectedSlot === null ? null : getSongRow(view, selectedSlot).marker);
  }

  private renderSongInfo(
    view: SongSelectWidgets,
    song: Song,
    laneCount: LaneCount,
    record: SelectedRecordView,
  ): void {
    fitSongTitle(view.titleText, song.title);
    setTextColor(view.categoryText, CATEGORY_COLORS[song.category]);
    view.categoryText
      .setText(song.category.toUpperCase())
      .setY(view.titleText.y + view.titleText.height + CATEGORY_GAP_PX);
    renderLaneMarks(view.laneMarks, view.categoryText, laneCount);
    const recordYPx = view.categoryText.y + view.categoryText.height + RECORD_GROUP_GAP_PX;
    const hasRecord = record.kind === 'record';
    view.recordLabel.setY(recordYPx).setVisible(hasRecord);
    view.noRecordText.setY(recordYPx).setVisible(record.kind === 'none');
    view.recordValue
      .setY(recordYPx + view.recordLabel.height + RECORD_LABEL_GAP_PX)
      .setText(hasRecord ? `${formatScore(record.score)}   ${formatAccuracy(record.accuracy)}` : '')
      .setVisible(hasRecord);
    view.recordGrade.render(hasRecord ? record.grade : null);
    // 글자 크기가 달라 기준선을 맞춰야 한 줄로 읽힌다.
    view.recordGrade.place(
      view.recordValue.x + view.recordValue.width + RECORD_GRADE_GAP_PX,
      view.recordValue.y +
        view.recordValue.getTextMetrics().ascent -
        view.recordGrade.getAscentPx(),
    );
    view.recordsFailure.render(
      record.kind === 'failed'
        ? {
            title: this.i18n.t('songSelect.recordsFailed'),
            body: this.i18n.t('loadFailure.body'),
          }
        : null,
    );
    const recordBottom = hasRecord ? view.recordValue : view.noRecordText;
    // 별자리는 기록 아래부터 RANDOM, PLAY 위까지 남는 하늘에 그린다.
    renderZodiacFigure(
      view.zodiacStars,
      view.zodiacLines,
      song.constellation,
      {
        leftXPx: ZODIAC_AREA_LEFT_X_PX,
        rightXPx: DETAIL_RIGHT_X_PX,
        topYPx: recordBottom.y + recordBottom.height + ZODIAC_AREA_GAP_PX,
        bottomYPx: view.actions.random.text.y - ZODIAC_AREA_GAP_PX,
      },
      ZODIAC_MAX_SPAN_PX,
    );
  }

  private renderNoSongInfo(view: SongSelectWidgets): void {
    view.titleText.setText('');
    view.categoryText.setText('');
    renderLaneMarks(view.laneMarks, view.categoryText, null);
    view.recordLabel.setVisible(false);
    view.recordValue.setVisible(false);
    view.recordGrade.render(null);
    view.noRecordText.setVisible(false);
    view.recordsFailure.render(null);
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
        underline.setTint(hoverColor).setVisible(true);
        return;
      case 'idle':
        hitArea.setInteractive();
        setTextColor(text, idleColor);
        underline.setTint(idleColor).setVisible(false);
        return;
    }
  }

  private shiftRow(row: SongRow, rowView: SongRowView): void {
    slideSelectedRowContent(
      this,
      row.content,
      0,
      rowView.kind === 'song' && rowView.appearance === 'selected',
    );
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
