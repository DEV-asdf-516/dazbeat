import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
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
import {
  SONG_ROW_NODE_IDS,
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
import { Button } from '../ui/Button.js';
import { createHeaderAuxiliaryButton } from '../ui/auxiliaryButton.js';
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
import { ensureLightTextures } from '../ui/lightTextures.js';
import { addMenuKeyHintRow } from '../ui/keyHintView.js';
import { handleEachEventOnce, readMenuAction, requireKeyboard } from '../ui/menuInput.js';
import { PointerHover } from '../ui/PointerHover.js';
import {
  COLORS,
  INDICATOR,
  MOTION,
  RADIUS,
  SCREEN_LAYOUT,
  setTextColor,
  textStyle,
  typeStyle,
} from '../ui/theme.js';
import { requireDefined } from '../../invariant.js';
import { IDLE_WHEEL, readWheelRows } from '../wheelRows.js';

const FILTER_X_PX = 120;
const FILTER_GAP_PX = 48;
// 연습 모드는 기록이 남지 않으므로 화면 머리에 계속 보여 일반 플레이와 헷갈리지 않게 한다.
const MODE_LABEL_Y_PX = 48;
const MODE_LABEL_TYPE = {
  sizePx: 20,
  weight: 600,
} as const;
const MODE_LABEL_LETTER_SPACING_PX = 5;
const ROW_X_PX = 120;
const ROW_Y_PX = 200;
const ROW_WIDTH_PX = 640;
const ROW_HEIGHT_PX = 72;
const ROW_TEXT_INSET_PX = 24;
const ROWS_PER_PAGE = 9;
const THUMBNAIL_INSET_PX = 8;
const THUMBNAIL_SIZE_PX = 56;
const THUMBNAIL_TITLE_GAP_PX = 16;
const THUMBNAIL_BORDER_PX = 2;
const UNSELECTED_THUMBNAIL_ALPHA = 0.5;
const SELECTED_ROW_OFFSET_PX = 12;
const PAGE_X_PX = 120;
const PAGE_Y_PX = 872;
const DETAIL_X_PX = 880;
const JACKET_Y_PX = 176;
const JACKET_SIZE_PX = 360;
const TITLE_Y_PX = 560;
const TITLE_WRAP_WIDTH_PX = 920;
// 제목 두 줄(64px)이 들어가는 높이를 남긴다.
const DIFFICULTY_Y_PX = 736;
const DIFFICULTY_GAP_PX = 40;
const SELECTED_DIFFICULTY_WEIGHT = 800;
const RECORD_Y_PX = 800;
const RECORD_LABEL_GAP_PX = 16;
// 버튼 아래 끝이 힌트 줄(SCREEN_LAYOUT.hintYPx)보다 위에 오도록 둔다.
const PLAY_Y_PX = 860;
const HINT_X_PX = 120;
// 마우스 휠 한 칸의 이동량(브라우저 기본 100px)에 한 곡씩 넘어가게 한다.
const WHEEL_STEP_PX = 100;

const ROW_NODE_X_PX = ROW_X_PX - 14;
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
const CELESTIAL_IDS: readonly CelestialAtlasId[] = [
  ROW_NODE_INITIAL_ID,
  ...SONG_ROW_NODE_IDS,
  SELECTED_HALO_ID,
  ORBIT_ARC_ID,
  JACKET_GLINT_ID,
  NAVIGATION_STAR_ID,
];
const NAVIGATION_STAR_GAP_PX = 24;

interface FilterTab {
  filter: SongFilter;
  text: Phaser.GameObjects.Text;
  underline: Phaser.GameObjects.Rectangle;
}

interface SongRow {
  background: Phaser.GameObjects.Rectangle;
  content: Phaser.GameObjects.Container;
  thumbnail: JacketView;
  thumbnailBorder: Phaser.GameObjects.Rectangle;
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

interface SongSelectHover {
  filter: PointerHover<SongFilter>;
  row: PointerHover<number>;
  difficulty: PointerHover<Difficulty>;
}

interface SongSelectWidgets {
  tabs: FilterTab[];
  rows: SongRow[];
  emptyText: Phaser.GameObjects.Text;
  pageText: Phaser.GameObjects.Text;
  navigationStar: Phaser.GameObjects.Sprite;
  selectedHalo: Phaser.GameObjects.Sprite;
  orbitArc: Phaser.GameObjects.Sprite;
  jacketGlint: Phaser.GameObjects.Sprite;
  jacket: JacketView;
  titleText: Phaser.GameObjects.Text;
  difficulties: DifficultyItem[];
  recordLabel: Phaser.GameObjects.Text;
  recordValue: Phaser.GameObjects.Text;
  noRecordText: Phaser.GameObjects.Text;
  playButton: Button;
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
    private readonly feeds: SongFeeds,
    private readonly i18n: I18n,
    private readonly celestial: CelestialCatalog,
  ) {
    super(SCENE_KEYS.songSelect);
    this.shown = {
      state: createSongSelectState(feeds.catalog.songs, 'all'),
      notice: null,
    };
  }

  init(data: SongSelectSceneData): void {
    this.restore = data.restore;
  }

  preload(): void {
    this.jackets = new SongSelectJackets(this.jacketTextures);
    this.jackets.preload(
      getJacketRange(openSongSelect(this.feeds.catalog, this.restore).state, ROWS_PER_PAGE),
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
    addCelestialAtmosphere(this, this.celestial, 'songSelect');
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
    addMenuKeyHintRow(this, this.i18n.t('songSelect.hint'), HINT_X_PX);
    const view: SongSelectWidgets = {
      tabs: this.createFilterTabs(hover.filter, (filter) => controller.selectFilter(filter)),
      rows: this.createSongRows(hover.row, (slot) => controller.selectRow(slot)),
      emptyText: this.add
        .text(
          ROW_X_PX + ROW_TEXT_INSET_PX,
          ROW_Y_PX + ROW_HEIGHT_PX / 2,
          '',
          textStyle('secondary', COLORS.textSecondary),
        )
        .setOrigin(0, 0.5),
      pageText: this.add.text(PAGE_X_PX, PAGE_Y_PX, '', textStyle('meta', COLORS.textMuted)),
      navigationStar: this.addCelestial(NAVIGATION_STAR_ID, 0, 0),
      selectedHalo: this.addCelestial(SELECTED_HALO_ID, 0, 0),
      orbitArc: this.addCelestial(ORBIT_ARC_ID, ORBIT_ARC_POSITION_PX.x, ORBIT_ARC_POSITION_PX.y),
      jacketGlint: this.addCelestial(
        JACKET_GLINT_ID,
        JACKET_GLINT_POSITION_PX.x,
        JACKET_GLINT_POSITION_PX.y,
      ),
      jacket: new JacketView(this, DETAIL_X_PX, JACKET_Y_PX, JACKET_SIZE_PX),
      titleText: this.add.text(DETAIL_X_PX, TITLE_Y_PX, '', {
        ...textStyle('title', COLORS.textPrimary),
        wordWrap: { width: TITLE_WRAP_WIDTH_PX },
      }),
      difficulties: this.createDifficultyItems(hover.difficulty, (difficulty) =>
        controller.selectDifficulty(difficulty),
      ),
      ...this.createRecordTexts(),
      playButton: new Button(this, DETAIL_X_PX, PLAY_Y_PX, {
        variant: 'primary',
        label: 'PLAY',
        onActivate: () => controller.play(),
      }),
      hover,
    };
    createHeaderAuxiliaryButton(this, {
      label: 'SETTINGS',
      onActivate: () => controller.openSettings(),
    });
    keyboard.addCapture('TAB');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.removeCapture('TAB'));
    const renderLoadedJackets = (): void => {
      this.jackets.complete(getShownSongs(view));
      this.render(view);
    };
    this.load.on(Phaser.Loader.Events.COMPLETE, renderLoadedJackets);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      controller.close();
      this.load.off(Phaser.Loader.Events.COMPLETE, renderLoadedJackets);
      this.jackets.close();
    });
    const controller = new SongSelectController(this.feeds, screen, ROWS_PER_PAGE, this.restore);
    playCelestialEntryTransition(
      this,
      this.celestial,
      new Phaser.Geom.Rectangle(DETAIL_X_PX, JACKET_Y_PX, JACKET_SIZE_PX, JACKET_SIZE_PX),
    );
    keyboard.on(
      'keydown',
      handleEachEventOnce((event: KeyboardEvent) => this.handleKey(event, controller)),
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
        if (this.exit.kind === 'leaving' || !listArea.contains(pointer.x, pointer.y)) {
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
        textStyle('primary', COLORS.textSecondary),
      );
      const underline = this.addUnderline(text);
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
      const background = this.add
        .rectangle(ROW_X_PX, yPx, ROW_WIDTH_PX, ROW_HEIGHT_PX, COLORS.surface)
        .setOrigin(0, 0)
        .setRounded(RADIUS.smallPx);
      const thumbnailXPx = ROW_X_PX + THUMBNAIL_INSET_PX;
      const thumbnailYPx = centerYPx - THUMBNAIL_SIZE_PX / 2;
      const thumbnail = new JacketView(this, thumbnailXPx, thumbnailYPx, THUMBNAIL_SIZE_PX);
      const thumbnailBorder = this.add
        .rectangle(thumbnailXPx, thumbnailYPx, THUMBNAIL_SIZE_PX, THUMBNAIL_SIZE_PX)
        .setOrigin(0, 0);
      const title = this.add
        .text(
          thumbnailXPx + THUMBNAIL_SIZE_PX + THUMBNAIL_TITLE_GAP_PX,
          centerYPx,
          '',
          textStyle('primary', COLORS.textSecondary),
        )
        .setOrigin(0, 0.5);
      const category = this.add
        .text(
          ROW_X_PX + ROW_WIDTH_PX - ROW_TEXT_INSET_PX,
          centerYPx,
          '',
          textStyle('meta', COLORS.textMuted),
        )
        .setOrigin(1, 0.5);
      hover.bind(background, slot, () => onSelect(slot));
      const content = this.add.container(0, 0, [thumbnail, thumbnailBorder, title]);
      return {
        background,
        content,
        thumbnail,
        thumbnailBorder,
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
        textStyle('primary', COLORS.textSecondary),
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
      DETAIL_X_PX,
      RECORD_Y_PX,
      'BEST',
      textStyle('meta', COLORS.textMuted),
    );
    const recordValue = this.add.text(
      DETAIL_X_PX + recordLabel.width + RECORD_LABEL_GAP_PX,
      RECORD_Y_PX,
      '',
      textStyle('secondary', COLORS.textPrimary),
    );
    const noRecordText = this.add.text(
      DETAIL_X_PX,
      RECORD_Y_PX,
      this.i18n.t('songSelect.noRecord'),
      textStyle('secondary', COLORS.textMuted),
    );
    return {
      recordLabel,
      recordValue,
      noRecordText,
    };
  }

  private handleKey(event: KeyboardEvent, controller: SongSelectController): void {
    if (this.exit.kind === 'leaving') {
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
        this.exit = exitScene(this, this.exit, {
          key: 'main',
          data: undefined,
        });
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
      : getChartRecord(this.records, selection.song.id, selection.difficulty);
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
    const { pageNumber, pageCount } = getSongPage(state, ROWS_PER_PAGE);
    view.pageText.setText(`${pageNumber} / ${pageCount}`).setVisible(pageCount >= 2);

    const { current } = state;
    if (current.kind === 'none') {
      this.renderNoSong(view);
    } else {
      this.renderSong(view, current.song);
    }
    view.difficulties.forEach((item) => this.renderDifficulty(view, item));
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
      selected || view.hover.filter.isHovered(filter) ? COLORS.textPrimary : COLORS.textSecondary,
    );
    underline.setVisible(selected);
    if (selected) {
      const bounds = text.getBounds();
      view.navigationStar.setPosition(bounds.left - NAVIGATION_STAR_GAP_PX, bounds.centerY);
    }
  }

  private renderRow(view: SongSelectWidgets, slot: number, rowView: SongRowView): void {
    const row = getSongRow(view, slot);
    const { background, thumbnail, thumbnailBorder, title, category, node } = row;
    const hasSong = rowView.kind === 'song';
    row.isSelected = hasSong && rowView.isSelected;
    background.setFillStyle(COLORS.surface, row.isSelected ? 1 : 0);
    thumbnail.setVisible(hasSong);
    thumbnailBorder.setVisible(row.isSelected);
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
    thumbnailBorder.setStrokeStyle(THUMBNAIL_BORDER_PX, song.accentColor);
    title.setText(song.title);
    row.record =
      recordChart === null
        ? null
        : getChartRecord(this.records, recordChart.song.id, recordChart.difficulty);
    this.renderRowHighlight(view, slot);
    category.setText(song.category.toUpperCase());
  }

  private renderRowHighlight(view: SongSelectWidgets, slot: number): void {
    const row = getSongRow(view, slot);
    const { isSelected } = row;
    const isHovered = view.hover.row.isHovered(slot);
    setTextColor(row.title, isSelected || isHovered ? COLORS.textPrimary : COLORS.textSecondary);
    applyCelestialPresentation(
      row.node,
      this.celestial.atlasPresentations[getSongRowNodeId(row.record, isSelected, isHovered)],
    );
  }

  private renderSelectedHalo(view: SongSelectWidgets): void {
    const { selectedSlot } = getSongPage(this.shown.state, ROWS_PER_PAGE);
    if (selectedSlot !== null) {
      view.selectedHalo.setPosition(ROW_NODE_X_PX, getRowCenterYPx(selectedSlot));
    }
    setCelestialLoopActive(view.selectedHalo, selectedSlot !== null);
  }

  private renderSong(view: SongSelectWidgets, song: Song): void {
    view.jacket.setSong(song, true);
    view.orbitArc.setVisible(true);
    view.titleText.setText(song.title);
    const record = this.record;
    view.recordLabel.setVisible(record !== null);
    view.recordValue
      .setText(
        record === null ? '' : `${formatScore(record.score)}   ${formatAccuracy(record.accuracy)}`,
      )
      .setVisible(record !== null);
    view.noRecordText.setVisible(record === null);
    view.playButton.setEnabled(true).setFocused(true);
  }

  private renderNoSong(view: SongSelectWidgets): void {
    view.jacket.setSong(null, true);
    view.orbitArc.setVisible(false);
    view.titleText.setText('');
    view.recordLabel.setVisible(false);
    view.recordValue.setVisible(false);
    view.noRecordText.setVisible(false);
    view.playButton.setEnabled(false).setFocused(false);
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
        item.text.setStyle(textStyle('primary', COLORS.textDisabled));
        return;
      case 'selected':
        item.text.setStyle(textStyle('primary', COLORS.textPrimary, SELECTED_DIFFICULTY_WEIGHT));
        return;
      case 'emphasized':
        item.text.setStyle(textStyle('primary', COLORS.textPrimary));
        return;
      case 'normal':
        item.text.setStyle(textStyle('primary', COLORS.textSecondary));
        return;
    }
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
