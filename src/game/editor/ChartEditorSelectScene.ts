import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { SONG_FILTERS } from '../../data/songs.js';
import { canCurrentUserOpenChartEditor } from '../accountState.js';
import type { AccountAuth } from '../accountState.js';
import { createEditorLayout } from './chartEditorLayout.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../config.js';
import { SCENE_KEYS, exitScene, startScene } from '../sceneRoutes.js';
import type { ChartEditorSelectSceneData, SceneRequest } from '../sceneRoutes.js';
import { STAYING } from '../sceneExit.js';
import type { SceneExit } from '../sceneExit.js';
import { ChartEditorSelectController } from './ChartEditorSelectController.js';
import type {
  ChartEditorSelectScreen,
  ChartEditorSelectView,
} from './ChartEditorSelectController.js';
import type { SongFeeds } from '../SongFeed.js';
import { IDLE_WHEEL, readWheelRows } from '../wheelRows.js';
import type { SongListNotice, SongListStatus } from './songListState.js';
import { createAuxiliaryButton } from '../ui/auxiliaryButton.js';
import { handleEachEventOnce, requireKeyboard } from '../ui/menuInput.js';
import { SEGMENTED_CONTROL_HEIGHT_PX, SegmentedControl } from './SegmentedControl.js';
import { SongListPanel } from './SongListPanel.js';
import { SongSearchInput } from './SongSearchInput.js';
import { addKeyHintRow } from '../ui/keyHintView.js';
import type { SongListFrame } from './SongListPanel.js';
import { CELESTIAL_COLORS, typeStyle } from '../ui/theme.js';
import { EDITOR_KEY_HINT_STYLE, EDITOR_TYPE_SCALE } from './editorTheme.js';
import { addBarHairlines } from './hairline.js';

const LAYOUT = createEditorLayout(GAME_WIDTH, GAME_HEIGHT);
const LIST_WIDTH_PX = 720;
const LIST_ROW_HEIGHT_PX = 56;
const LIST_PADDING_PX = 16;
const LIST_MARGIN_PX = 24;
const LIST_LEFT_PX = (GAME_WIDTH - LIST_WIDTH_PX) / 2;
const FILTER_TOP_Y_PX = LAYOUT.topBar.heightPx + LIST_MARGIN_PX;
const FILTER_WIDTH_PX = 360;
const FILTER_LIST_GAP_PX = 16;
const LIST_TOP_Y_PX = FILTER_TOP_Y_PX + SEGMENTED_CONTROL_HEIGHT_PX + FILTER_LIST_GAP_PX;
const STATUS_RETRY_GAP_PX = 16;
const LIST_BOTTOM_Y_PX = LAYOUT.bottomBar.topYPx - LIST_MARGIN_PX;
const LIST_FRAME: SongListFrame = {
  leftPx: LIST_LEFT_PX,
  topYPx: LIST_TOP_Y_PX,
  widthPx: LIST_WIDTH_PX,
  paddingPx: LIST_PADDING_PX,
  rowHeightPx: LIST_ROW_HEIGHT_PX,
  visibleRowCount: Math.floor(
    (LIST_BOTTOM_Y_PX - LIST_TOP_Y_PX - LIST_PADDING_PX) / LIST_ROW_HEIGHT_PX,
  ),
};

export class ChartEditorSelectScene extends Phaser.Scene {
  private exit: SceneExit<SceneRequest> = STAYING;

  constructor(
    private readonly feeds: SongFeeds,
    private readonly auth: AccountAuth,
    private readonly i18n: I18n,
  ) {
    super(SCENE_KEYS.chartEditorSelect);
  }

  create(data: ChartEditorSelectSceneData): void {
    // 메뉴 노출과 별개로 직접 진입도 막아야 하므로, 화면·리스너를 만들기 전에 권한부터 판정한다.
    if (!canCurrentUserOpenChartEditor(this.auth)) {
      startScene(this, 'main');
      return;
    }
    this.exit = STAYING;
    this.createChrome();
    const centerYPx = LAYOUT.topBar.centerYPx;
    const filter = new SegmentedControl(
      this,
      {
        leftPx: LIST_LEFT_PX,
        topYPx: FILTER_TOP_Y_PX,
        widthPx: FILTER_WIDTH_PX,
      },
      SONG_FILTERS.map((value) => ({
        value,
        label: value.toUpperCase(),
      })),
      (category) => controller.selectCategory(category),
    );
    const search = new SongSearchInput(
      this,
      {
        leftPx: LIST_LEFT_PX + FILTER_WIDTH_PX + FILTER_LIST_GAP_PX,
        topYPx: FILTER_TOP_Y_PX,
        widthPx: LIST_WIDTH_PX - FILTER_WIDTH_PX - FILTER_LIST_GAP_PX,
        heightPx: SEGMENTED_CONTROL_HEIGHT_PX,
      },
      this.i18n.t('chartEditorSelect.searchPlaceholder'),
    );
    // Phaser 가 캔버스 mousedown 의 기본 동작을 막아 브라우저가 스스로 포커스를 옮기지 않는다.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => search.blur());
    let wheel = IDLE_WHEEL;
    const panel = new SongListPanel(this, LIST_FRAME, {
      onHoverRow: (rowIndex) => controller.hoverRow(rowIndex),
      onPickRow: (rowIndex) => controller.pickRow(rowIndex),
      onWheel: (deltaYPx) => {
        const read = readWheelRows(wheel, deltaYPx, this.time.now, LIST_FRAME.rowHeightPx);
        wheel = read.gesture;
        controller.scroll(read.rows);
      },
    });
    const noticeText = this.add
      .text(
        LIST_LEFT_PX + LIST_WIDTH_PX / 2,
        (LIST_TOP_Y_PX + LIST_BOTTOM_Y_PX) / 2,
        '',
        typeStyle(EDITOR_TYPE_SCALE.body, CELESTIAL_COLORS.textSecondary),
      )
      .setOrigin(0.5, 0.5);
    const retryButton = createAuxiliaryButton(this, 0, centerYPx, {
      label: 'RETRY',
      onActivate: () => controller.retry(),
    }).alignX(GAME_WIDTH - LAYOUT.video.leftPx, 1);
    const statusText = this.add
      .text(
        retryButton.x - STATUS_RETRY_GAP_PX,
        centerYPx,
        '',
        typeStyle(EDITOR_TYPE_SCALE.meta, CELESTIAL_COLORS.textSecondary),
      )
      .setAlign('right')
      .setOrigin(1, 0.5);
    const screen: ChartEditorSelectScreen = {
      render: (view: ChartEditorSelectView) => {
        filter.render(view.category);
        panel.render({
          rows: view.rows.map(({ song, isFocused }) => ({
            title: song.title,
            category: song.category,
            isFocused,
          })),
          topIndex: view.topIndex,
          songCount: view.songCount,
        });
        noticeText
          .setText(view.notice === null ? '' : this.translateNotice(view.notice))
          .setVisible(view.notice !== null);
        statusText
          .setText(view.status === null ? '' : this.translateStatus(view.status))
          .setVisible(view.status !== null);
        retryButton.setVisible(view.canRetry);
      },
      edit: (songId, list) =>
        this.leave({
          key: 'chartEditor',
          data: {
            songId,
            list,
          },
        }),
      leave: () =>
        this.leave({
          key: 'main',
          data: undefined,
        }),
      isSearchFocused: () => search.isFocused,
      readSearchText: () => search.text,
      showSearchText: (title) => search.setText(title),
      focusSearch: () => search.focus(),
      blurSearch: () => search.blur(),
    };
    const controller = new ChartEditorSelectController(
      this.feeds,
      screen,
      LIST_FRAME.visibleRowCount,
      data,
    );
    requireKeyboard(this).on(
      'keydown',
      handleEachEventOnce((event: KeyboardEvent) => {
        if (this.exit.kind === 'leaving') {
          return;
        }
        if (controller.handleKey(event)) {
          event.preventDefault();
        }
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => controller.close());
  }

  private createChrome(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, CELESTIAL_COLORS.background).setOrigin(0, 0);
    addBarHairlines(this, LAYOUT, GAME_WIDTH);
    const centerYPx = LAYOUT.topBar.centerYPx;
    createAuxiliaryButton(this, LAYOUT.video.leftPx, centerYPx, {
      label: 'BACK',
      onActivate: () =>
        this.leave({
          key: 'main',
          data: undefined,
        }),
    });
    this.add
      .text(
        LAYOUT.title.leftPx,
        centerYPx,
        this.i18n.t('chartEditorSelect.title'),
        typeStyle(EDITOR_TYPE_SCALE.title, CELESTIAL_COLORS.textPrimary),
      )
      .setOrigin(0, 0.5);
    addKeyHintRow(
      this,
      this.i18n.t('chartEditorSelect.hint'),
      EDITOR_KEY_HINT_STYLE,
      LAYOUT.hint.leftPx,
      LAYOUT.bottomBar.centerYPx,
    );
  }

  private translateNotice(notice: SongListNotice): string {
    switch (notice.kind) {
      case 'loading':
        return this.i18n.t('chartEditorSelect.loading');
      case 'loadFailed':
        return this.i18n.t('chartEditorSelect.loadFailed');
      case 'noSongs':
        return this.i18n.t('chartEditor.noSongs');
      case 'emptyCategory':
        return this.i18n.t('chartEditorSelect.emptyFilter');
      case 'noMatch':
        return this.i18n.t('chartEditorSelect.noMatch', { title: notice.title });
    }
  }

  private translateStatus(status: SongListStatus): string {
    switch (status) {
      case 'loadingMore':
        return this.i18n.t('chartEditorSelect.loadingMore');
      case 'loadMoreFailed':
        return this.i18n.t('chartEditorSelect.loadMoreFailed');
    }
  }

  private leave(request: SceneRequest): void {
    this.exit = exitScene(this, this.exit, request);
  }
}
