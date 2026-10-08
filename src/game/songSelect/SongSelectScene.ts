import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { getAtlasPresentation } from '../celestial/celestialCatalog.js';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import { SCENE_KEYS, exitScene } from '../config.js';
import type { SceneRequest } from '../config.js';
import { DIFFICULTIES, SONG_FILTERS, getAvailableDifficulties } from '../../data/songs.js';
import type { Song, SongFilter } from '../../data/songs.js';
import type { ChartRecord, LocalSave } from '../../storage/LocalSave.js';
import type { Difficulty } from '../../rhythm/types.js';
import {
  createSongSelectState,
  cycleFilter,
  getCurrentSong,
  getPlayableSelection,
  getRowRecordDifficulty,
  getSongRowNodeId,
  hasNewCurrentSong,
  isSameSelection,
  moveDifficulty,
  moveSong,
  selectDifficulty,
  selectFilter,
  selectSong,
} from './songSelectState.js';
import { STAYING } from '../sceneExit.js';
import type { SceneExit } from '../sceneExit.js';
import type { SongSelectState } from './songSelectState.js';
import { Button } from '../ui/Button.js';
import { createAuxiliaryButton } from '../ui/auxiliaryButton.js';
import {
  addCelestialAtmosphere,
  playCelestialEntryTransition,
} from '../celestial/celestialAtmosphere.js';
import {
  addCelestialSprite,
  applyCelestialPresentation,
  playCelestialOnce,
  queueCelestialTextures,
  registerCelestialAnimations,
  setCelestialLoopActive,
} from '../celestial/celestialSprites.js';
import { formatAccuracy, formatScore } from '../ui/format.js';
import { JacketView, queueJacketLoads } from '../ui/jacket.js';
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
} from '../ui/theme.js';

const FILTER_X_PX = 120;
const FILTER_GAP_PX = 48;
const SETTINGS_RIGHT_X_PX = 1800;
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
  node: Phaser.GameObjects.Sprite | null;
  /** 마지막 행 렌더에서 읽은 기록. hover 변경 때는 저장소를 다시 읽지 않고 이 값을 쓴다. */
  record: ChartRecord | null;
  shifted: boolean;
}

type DifficultyAppearance = 'disabled' | 'selected' | 'emphasized' | 'normal';

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

interface SongSelectView {
  tabs: FilterTab[];
  rows: SongRow[];
  emptyText: Phaser.GameObjects.Text;
  pageText: Phaser.GameObjects.Text;
  navigationStar: Phaser.GameObjects.Sprite | null;
  selectedHalo: Phaser.GameObjects.Sprite | null;
  orbitArc: Phaser.GameObjects.Sprite | null;
  jacketGlint: Phaser.GameObjects.Sprite | null;
  jacket: JacketView;
  titleText: Phaser.GameObjects.Text;
  difficulties: DifficultyItem[];
  recordLabel: Phaser.GameObjects.Text;
  recordValue: Phaser.GameObjects.Text;
  noRecordText: Phaser.GameObjects.Text;
  playButton: Button;
  hover: SongSelectHover;
}

type Transition = (state: SongSelectState) => SongSelectState;
type Update = (transition: Transition) => void;

export class SongSelectScene extends Phaser.Scene {
  private state: SongSelectState;
  /** 선택한 곡·난이도의 최고 기록. 선택이 바뀔 때만 저장소에서 다시 읽는다. */
  private record: ChartRecord | null = null;
  private exit: SceneExit<SceneRequest> = STAYING;

  constructor(
    private readonly save: LocalSave,
    private readonly getSongs: () => readonly Song[],
    private readonly i18n: I18n,
    private readonly celestial: CelestialCatalog,
  ) {
    super(SCENE_KEYS.songSelect);
    this.state = createSongSelectState(getSongs());
  }

  preload(): void {
    queueJacketLoads(this, this.getSongs());
    queueCelestialTextures(this, this.celestial);
  }

  create(): void {
    this.exit = STAYING;
    registerCelestialAnimations(this, this.celestial);
    addCelestialAtmosphere(this, this.celestial, 'songSelect');
    const keyboard = requireKeyboard(this);
    this.state = createSongSelectState(this.getSongs());
    this.record = this.loadSelectedRecord(this.state);
    ensureLightTextures(this);
    this.cameras.main.fadeIn(MOTION.mediumMs);

    const hover: SongSelectHover = {
      filter: new PointerHover((filter) => this.renderTab(view, getTab(view, filter))),
      row: new PointerHover((slot) => this.renderRowHighlight(view, slot)),
      difficulty: new PointerHover((difficulty) =>
        this.renderDifficulty(view, getDifficultyItem(view, difficulty)),
      ),
    };
    const update: Update = (transition) => this.applyTransition(view, transition);

    addMenuKeyHintRow(this, this.i18n.t('songSelect.hint'), HINT_X_PX);
    const view: SongSelectView = {
      tabs: this.createFilterTabs(hover.filter, update),
      rows: this.createSongRows(hover.row, update),
      emptyText: this.add
        .text(
          ROW_X_PX + ROW_TEXT_INSET_PX,
          ROW_Y_PX + ROW_HEIGHT_PX / 2,
          this.i18n.t('songSelect.noSongs'),
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
      difficulties: this.createDifficultyItems(hover.difficulty, update),
      ...this.createRecordTexts(),
      playButton: new Button(this, DETAIL_X_PX, PLAY_Y_PX, {
        variant: 'primary',
        label: 'PLAY',
        onActivate: () => this.play(),
      }),
      hover,
    };
    const firstTab = view.tabs[0];
    if (firstTab === undefined) {
      throw new Error('Missing filter tabs');
    }
    createAuxiliaryButton(this, 0, firstTab.text.y + firstTab.text.height / 2, {
      label: 'SETTINGS',
      onActivate: () => this.openSettings(),
    }).alignX(SETTINGS_RIGHT_X_PX, 1);
    keyboard.addCapture('TAB');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.removeCapture('TAB'));
    this.render(view);
    playCelestialEntryTransition(
      this,
      this.celestial,
      new Phaser.Geom.Rectangle(DETAIL_X_PX, JACKET_Y_PX, JACKET_SIZE_PX, JACKET_SIZE_PX),
    );
    keyboard.on(
      'keydown',
      handleEachEventOnce((event: KeyboardEvent) => this.handleKey(event, update)),
    );
  }

  private createFilterTabs(hover: PointerHover<SongFilter>, update: Update): FilterTab[] {
    let xPx = FILTER_X_PX;
    return SONG_FILTERS.map((filter) => {
      const text = this.add.text(
        xPx,
        SCREEN_LAYOUT.headerYPx,
        filter.toUpperCase(),
        textStyle('primary', COLORS.textSecondary),
      );
      const underline = this.addUnderline(text);
      hover.bind(text, filter, () => update((state) => selectFilter(state, filter)));
      xPx += text.width + FILTER_GAP_PX;
      return { filter, text, underline };
    });
  }

  private createSongRows(hover: PointerHover<number>, update: Update): SongRow[] {
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
      hover.bind(background, slot, () =>
        update((state) => selectSong(state, this.pageStart() + slot)),
      );
      const content = this.add.container(0, 0, [thumbnail, thumbnailBorder, title]);
      return {
        background,
        content,
        thumbnail,
        thumbnailBorder,
        title,
        category,
        node: this.addCelestial(ROW_NODE_INITIAL_ID, ROW_NODE_X_PX, centerYPx),
        record: null,
        shifted: false,
      };
    });
  }

  private createDifficultyItems(hover: PointerHover<Difficulty>, update: Update): DifficultyItem[] {
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
      hover.bind(text, difficulty, () => update((state) => selectDifficulty(state, difficulty)));
      xPx += text.width + DIFFICULTY_GAP_PX;
      return { difficulty, text, underline, appearance: null };
    });
  }

  private addCelestial(id: string, xPx: number, yPx: number): Phaser.GameObjects.Sprite | null {
    return addCelestialSprite(this, getAtlasPresentation(this.celestial, id), xPx, yPx);
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
    SongSelectView,
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
    return { recordLabel, recordValue, noRecordText };
  }

  private handleKey(event: KeyboardEvent, update: Update): void {
    if (this.exit.kind === 'leaving') {
      return;
    }
    switch (readMenuAction(event)) {
      case 'up':
        update((state) => moveSong(state, -1));
        return;
      case 'down':
        update((state) => moveSong(state, 1));
        return;
      case 'left':
        update((state) => moveDifficulty(state, -1));
        return;
      case 'right':
        update((state) => moveDifficulty(state, 1));
        return;
      case 'confirm':
        this.play();
        return;
      case 'back':
        this.exit = exitScene(this, this.exit, { key: 'main', data: undefined });
        return;
      case null:
        break;
    }
    switch (event.code) {
      case 'KeyQ':
        update((state) => cycleFilter(state, -1));
        return;
      case 'KeyE':
        update((state) => cycleFilter(state, 1));
        return;
      case 'Tab':
        this.openSettings();
        return;
      default:
        return;
    }
  }

  /** 상태가 그대로면 아무것도 다시 그리지 않는다. */
  private applyTransition(view: SongSelectView, transition: Transition): void {
    const previous = this.state;
    const next = transition(previous);
    if (next === previous) {
      return;
    }
    this.state = next;
    if (!isSameSelection(previous, next)) {
      this.record = this.loadSelectedRecord(next);
    }
    this.render(view);
    if (view.jacketGlint !== null && hasNewCurrentSong(previous, next)) {
      playCelestialOnce(view.jacketGlint);
    }
  }

  private loadSelectedRecord(state: SongSelectState): ChartRecord | null {
    const selection = getPlayableSelection(state);
    return selection === null
      ? null
      : this.save.loadRecord(selection.song.id, selection.difficulty);
  }

  private play(): void {
    const selection = getPlayableSelection(this.state);
    if (selection !== null) {
      this.exit = exitScene(this, this.exit, { key: 'gameplay', data: selection });
    }
  }

  private openSettings(): void {
    this.exit = exitScene(this, this.exit, {
      key: 'settings',
      data: { returnScene: 'songSelect' },
    });
  }

  private pageStart(): number {
    return Math.floor(this.state.songIndex / ROWS_PER_PAGE) * ROWS_PER_PAGE;
  }

  private isSelectedSlot(slot: number): boolean {
    const songIndex = this.pageStart() + slot;
    return this.state.songs[songIndex] !== undefined && songIndex === this.state.songIndex;
  }

  private render(view: SongSelectView): void {
    view.tabs.forEach((tab) => this.renderTab(view, tab));
    view.rows.forEach((row, slot) => this.renderRow(view, row, slot));
    this.renderSelectedHalo(view);
    view.emptyText.setVisible(this.state.songs.length === 0);
    const pageCount = Math.ceil(this.state.songs.length / ROWS_PER_PAGE);
    view.pageText
      .setText(`${this.pageStart() / ROWS_PER_PAGE + 1} / ${pageCount}`)
      .setVisible(pageCount >= 2);

    const song = getCurrentSong(this.state);
    if (song === undefined) {
      this.renderNoSong(view);
    } else {
      this.renderSong(view, song);
    }
    view.difficulties.forEach((item) => this.renderDifficulty(view, item));
  }

  private renderTab(view: SongSelectView, { filter, text, underline }: FilterTab): void {
    const selected = filter === this.state.filter;
    setTextColor(
      text,
      selected || view.hover.filter.isHovered(filter) ? COLORS.textPrimary : COLORS.textSecondary,
    );
    underline.setVisible(selected);
    if (selected && view.navigationStar !== null) {
      const bounds = text.getBounds();
      view.navigationStar.setPosition(bounds.left - NAVIGATION_STAR_GAP_PX, bounds.centerY);
    }
  }

  private renderRow(view: SongSelectView, row: SongRow, slot: number): void {
    const { background, thumbnail, thumbnailBorder, title, category, node } = row;
    const rowSong = this.state.songs[this.pageStart() + slot];
    const selected = this.isSelectedSlot(slot);
    background.setFillStyle(COLORS.surface, selected ? 1 : 0);
    thumbnail.setVisible(rowSong !== undefined);
    thumbnailBorder.setVisible(selected);
    title.setVisible(rowSong !== undefined);
    category.setVisible(rowSong !== undefined);
    node?.setVisible(rowSong !== undefined);
    this.shiftRow(row, selected);
    if (rowSong === undefined) {
      view.hover.row.release(slot);
      background.disableInteractive(true);
      return;
    }
    background.setInteractive();
    thumbnail.setSong(rowSong).setAlpha(selected ? 1 : UNSELECTED_THUMBNAIL_ALPHA);
    thumbnailBorder.setStrokeStyle(THUMBNAIL_BORDER_PX, rowSong.accentColor);
    title.setText(rowSong.title);
    const difficulty = getRowRecordDifficulty(rowSong, this.state.difficulty);
    row.record = difficulty === null ? null : this.save.loadRecord(rowSong.id, difficulty);
    this.renderRowHighlight(view, slot);
    category.setText(rowSong.category.toUpperCase());
  }

  /** 선택·hover 에 따른 제목 색과 node 상태. hover 만 바뀔 때도 이 행만 다시 그린다. */
  private renderRowHighlight(view: SongSelectView, slot: number): void {
    const row = view.rows[slot];
    if (row === undefined) {
      throw new Error(`Invalid song row slot: ${slot}`);
    }
    const isSelected = this.isSelectedSlot(slot);
    const isHovered = view.hover.row.isHovered(slot);
    setTextColor(row.title, isSelected || isHovered ? COLORS.textPrimary : COLORS.textSecondary);
    if (row.node !== null) {
      applyCelestialPresentation(
        row.node,
        getAtlasPresentation(this.celestial, getSongRowNodeId(row.record, isSelected, isHovered)),
      );
    }
  }

  /** 선택 곡이 있으면 그 행 node 위치에서 loop, 없으면 숨기고 멈춘다. */
  private renderSelectedHalo(view: SongSelectView): void {
    if (view.selectedHalo === null) {
      return;
    }
    const hasSelection = getCurrentSong(this.state) !== undefined;
    if (hasSelection) {
      const slot = this.state.songIndex - this.pageStart();
      view.selectedHalo.setPosition(ROW_NODE_X_PX, getRowCenterYPx(slot));
    }
    setCelestialLoopActive(view.selectedHalo, hasSelection);
  }

  private renderSong(view: SongSelectView, song: Song): void {
    view.jacket.setSong(song, true);
    view.orbitArc?.setVisible(true);
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

  private renderNoSong(view: SongSelectView): void {
    view.jacket.setSong(null, true);
    view.orbitArc?.setVisible(false);
    view.titleText.setText('');
    view.recordLabel.setVisible(false);
    view.recordValue.setVisible(false);
    view.noRecordText.setVisible(false);
    view.playButton.setEnabled(false).setFocused(false);
  }

  private renderDifficulty(view: SongSelectView, item: DifficultyItem): void {
    const { difficulty, text, underline } = item;
    const song = getCurrentSong(this.state);
    const enabled = song !== undefined && getAvailableDifficulties(song).includes(difficulty);
    const selected = enabled && difficulty === this.state.difficulty;
    underline.setVisible(selected);
    if (song !== undefined) {
      underline.setFillStyle(song.accentColor);
    }
    if (enabled) {
      text.setInteractive();
    } else {
      view.hover.difficulty.release(difficulty);
      text.disableInteractive(true);
    }
    this.applyDifficultyAppearance(
      item,
      getDifficultyAppearance(enabled, selected, view.hover.difficulty.isHovered(difficulty)),
    );
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

function getDifficultyAppearance(
  enabled: boolean,
  selected: boolean,
  hovered: boolean,
): DifficultyAppearance {
  if (!enabled) {
    return 'disabled';
  }
  if (selected) {
    return 'selected';
  }
  return hovered ? 'emphasized' : 'normal';
}

function getRowCenterYPx(slot: number): number {
  return ROW_Y_PX + ROW_HEIGHT_PX * slot + ROW_HEIGHT_PX / 2;
}

function getTab(view: SongSelectView, filter: SongFilter): FilterTab {
  const tab = view.tabs.find((candidate) => candidate.filter === filter);
  if (tab === undefined) {
    throw new Error(`Missing filter tab: ${filter}`);
  }
  return tab;
}

function getDifficultyItem(view: SongSelectView, difficulty: Difficulty): DifficultyItem {
  const item = view.difficulties.find((candidate) => candidate.difficulty === difficulty);
  if (item === undefined) {
    throw new Error(`Missing difficulty item: ${difficulty}`);
  }
  return item;
}
