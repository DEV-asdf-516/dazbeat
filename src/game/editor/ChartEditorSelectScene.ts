import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { SONG_FILTERS } from '../../data/songs.js';
import { canCurrentUserOpenChartEditor } from '../app/accountState.js';
import type { AccountAuth } from '../app/accountState.js';
import { createEditorLayout } from './state/chartEditorLayout.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../app/config.js';
import { SCENE_KEYS, exitScene, startScene } from '../app/sceneRoutes.js';
import type { ChartEditorSelectSceneData, SceneRequest } from '../app/sceneRoutes.js';
import { STAYING } from '../app/sceneExit.js';
import type { SceneExit } from '../app/sceneExit.js';
import { ChartEditorSelectController } from './ChartEditorSelectController.js';
import type { ChartEditorSelectScreen } from './ChartEditorSelectController.js';
import { pointButton } from '../ui/view/input/hoverTarget.js';
import type { ButtonPointer } from '../ui/view/input/hoverTarget.js';
import type { SongFeeds } from '../app/SongFeed.js';
import {
  getChangedRegions,
  getChangedRowIndexes,
  getEditorSelectButtonView,
  getFilterMotion,
  getFocusedRowIndex,
  getHoveredFilter,
  getListFrame,
  getNoticeKind,
} from './state/songListState.js';
import type { EditorSelectButton, SongListNotice } from './state/songListState.js';
import { getSegmentAppearance } from './state/segmentAppearance.js';
import { createAuxiliaryButton } from '../ui/view/widgets/auxiliaryButton.js';
import type { Button } from '../ui/view/widgets/Button.js';
import { handleEachEventOnce, requireKeyboard } from '../ui/view/input/menuInput.js';
import { SEGMENTED_CONTROL_HEIGHT_PX, SegmentedControl } from './view/SegmentedControl.js';
import { SongListPanel } from './view/SongListPanel.js';
import { TextInput } from '../ui/view/widgets/TextInput.js';
import { LOADING_STAR_ID } from '../ui/view/widgets/LoadingStar.js';
import { NoticeText } from '../ui/view/widgets/NoticeText.js';
import { ConfirmDialog } from '../ui/view/widgets/ConfirmDialog.js';
import type { CelestialCatalog } from '../celestial/state/celestialCatalog.js';
import {
  queueCelestialTextures,
  registerCelestialAnimations,
} from '../celestial/view/celestialSprites.js';
import { addKeyHintRow } from '../ui/view/widgets/keyHintView.js';
import type { SongListFrame } from './view/SongListPanel.js';
import { CELESTIAL_COLORS, typeStyle } from '../ui/view/theme.js';
import { EDITOR_KEY_HINT_STYLE, EDITOR_TYPE_SCALE } from './view/editorTheme.js';
import { addBarHairlines } from './view/hairline.js';

const LAYOUT = createEditorLayout(GAME_WIDTH, GAME_HEIGHT);
const LIST_WIDTH_PX = 720;
const LIST_ROW_HEIGHT_PX = 56;
const LIST_PADDING_PX = 16;
const LIST_MARGIN_PX = 24;
const LIST_LEFT_PX = (GAME_WIDTH - LIST_WIDTH_PX) / 2;
const FILTER_TOP_Y_PX = LAYOUT.topBar.heightPx + LIST_MARGIN_PX;
const FILTER_WIDTH_PX = 360;
const FILTER_LIST_GAP_PX = 16;
const SEARCH_MAX_LENGTH = 100;
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
    private readonly celestial: CelestialCatalog,
  ) {
    super(SCENE_KEYS.chartEditorSelect);
  }

  preload(): void {
    queueCelestialTextures(this, this.celestial, [
      this.celestial.atlasPresentations[LOADING_STAR_ID],
    ]);
  }

  create(data: ChartEditorSelectSceneData): void {
    // 메뉴 노출과 별개로 직접 진입도 막아야 하므로, 화면·리스너를 만들기 전에 권한부터 판정한다.
    if (!canCurrentUserOpenChartEditor(this.auth)) {
      startScene(this, 'main');
      return;
    }
    registerCelestialAnimations(this, this.celestial);
    this.exit = STAYING;
    const screen: ChartEditorSelectScreen = {
      render: (previous, next) => {
        for (const region of getChangedRegions(previous, next)) {
          switch (region) {
            case 'filterIndicator':
              filter.renderIndicator(next.category, getFilterMotion(previous));
              break;
            case 'filterSegments': {
              const hovered = getHoveredFilter(next);
              filter.renderSegments((category) =>
                getSegmentAppearance(category, next.category, hovered),
              );
              break;
            }
            case 'listRows':
              for (const rowIndex of getChangedRowIndexes(previous, next)) {
                const row = next.rows[rowIndex];
                panel.renderRow(
                  rowIndex,
                  row === undefined
                    ? null
                    : {
                        title: row.song.title,
                        category: row.song.category,
                      },
                );
              }
              break;
            case 'listFocus':
              panel.renderFocus(getFocusedRowIndex(next));
              break;
            case 'listFrame':
              panel.renderFrame(getListFrame(next), next.rows.length);
              break;
            case 'notice': {
              const translateNotice = (notice: SongListNotice): string => {
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
              };
              notice.show(
                next.notice === null
                  ? { kind: 'none' }
                  : {
                      kind: getNoticeKind(next.notice),
                      text: translateNotice(next.notice),
                    },
              );
              break;
            }
            case 'status':
              // 실패는 팝업이 알린다.
              status.show(
                next.status === 'loadingMore'
                  ? {
                      kind: 'loading',
                      text: this.i18n.t('chartEditorSelect.loadingMore'),
                    }
                  : { kind: 'none' },
              );
              break;
            case 'backButton':
              backButton.render(getEditorSelectButtonView(next, 'back'));
              break;
            case 'retryButton':
              retryButton
                .setVisible(next.canRetry)
                .render(getEditorSelectButtonView(next, 'retry'));
              break;
            case 'loadMoreFailure':
              loadMoreFailure.render(
                next.isLoadMoreFailureOpen
                  ? {
                      title: this.i18n.t('chartEditorSelect.loadMoreFailed'),
                      body: this.i18n.t('chartEditorSelect.loadMoreFailedBody'),
                      cancelLabel: 'CANCEL',
                      acceptLabel: 'RETRY',
                      acceptTone: 'default',
                    }
                  : null,
              );
              break;
            case 'loadMoreFailureButtons':
              loadMoreFailure.renderButtons(
                getEditorSelectButtonView(next, 'failureCancel'),
                getEditorSelectButtonView(next, 'failureRetry'),
              );
              break;
          }
        }
      },
      edit: (songId, list) => {
        this.exit = exitScene(this, this.exit, {
          key: 'chartEditor',
          data: {
            songId,
            list,
          },
        });
      },
      leave: () => {
        this.exit = exitScene(this, this.exit, {
          key: 'main',
          data: undefined,
        });
      },
      isSearchFocused: () => search.isFocused,
      readSearchText: () => search.text,
      showSearchText: (title) => search.setText(title),
      focusSearch: () => search.focus(),
      blurSearch: () => search.blur(),
    };
    // 위젯이 Controller 를 받으므로 Controller 를 먼저 만들고, 위젯을 다 만든 뒤 start 로 처음 그린다.
    const controller = new ChartEditorSelectController(
      {
        feeds: this.feeds,
        now: () => this.time.now,
      },
      screen,
      {
        visibleRowCount: LIST_FRAME.visibleRowCount,
        rowHeightPx: LIST_FRAME.rowHeightPx,
      },
      data,
    );
    const backButton = this.createChrome(controller);
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
      {
        onSelect: (category) => controller.selectCategory(category),
        onHover: (category) => controller.hoverFilter(category),
        onUnhover: (category) => controller.unhoverFilter(category),
      },
    );
    const search = new TextInput(
      this,
      {
        leftPx: LIST_LEFT_PX + FILTER_WIDTH_PX + FILTER_LIST_GAP_PX,
        topYPx: FILTER_TOP_Y_PX,
        widthPx: LIST_WIDTH_PX - FILTER_WIDTH_PX - FILTER_LIST_GAP_PX,
        heightPx: SEGMENTED_CONTROL_HEIGHT_PX,
      },
      {
        label: this.i18n.t('chartEditorSelect.searchPlaceholder'),
        maxLength: SEARCH_MAX_LENGTH,
        type: EDITOR_TYPE_SCALE.body,
        enterKeyHint: 'search',
      },
    );
    // Phaser 가 캔버스 mousedown 의 기본 동작을 막아 브라우저가 스스로 포커스를 옮기지 않는다.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => search.blur());
    const panel = new SongListPanel(this, LIST_FRAME, controller);
    const notice = new NoticeText(
      this,
      this.celestial,
      this.add
        .text(
          LIST_LEFT_PX + LIST_WIDTH_PX / 2,
          (LIST_TOP_Y_PX + LIST_BOTTOM_Y_PX) / 2,
          '',
          typeStyle(EDITOR_TYPE_SCALE.body, CELESTIAL_COLORS.textSecondary),
        )
        .setOrigin(0.5, 0.5),
    );
    const retryButton = createAuxiliaryButton(this, 0, centerYPx, {
      label: 'RETRY',
      pointer: pointButton(controller, 'retry'),
    }).alignX(GAME_WIDTH - LAYOUT.video.leftPx, 1);
    const status = new NoticeText(
      this,
      this.celestial,
      this.add
        .text(
          retryButton.x - STATUS_RETRY_GAP_PX,
          centerYPx,
          '',
          typeStyle(EDITOR_TYPE_SCALE.meta, CELESTIAL_COLORS.textSecondary),
        )
        .setAlign('right')
        .setOrigin(1, 0.5),
    );
    const loadMoreFailure = new ConfirmDialog(this, {
      cancel: pointButton(controller, 'failureCancel'),
      accept: pointButton(controller, 'failureRetry'),
    });
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
    controller.start();
  }

  private createChrome(pointer: ButtonPointer<EditorSelectButton>): Button {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, CELESTIAL_COLORS.background).setOrigin(0, 0);
    addBarHairlines(this, LAYOUT, GAME_WIDTH);
    const centerYPx = LAYOUT.topBar.centerYPx;
    const backButton = createAuxiliaryButton(this, LAYOUT.video.leftPx, centerYPx, {
      label: 'BACK',
      pointer: pointButton(pointer, 'back'),
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
    return backButton;
  }
}
