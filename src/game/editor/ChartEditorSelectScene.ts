import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { SONG_FILTERS } from '../../data/songs.js';
import type { Song, SongFilter } from '../../data/songs.js';
import { canCurrentUserOpenChartEditor } from '../accountState.js';
import type { AccountAuth } from '../accountState.js';
import { createEditorLayout } from './chartEditorLayout.js';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS, exitScene, startScene } from '../config.js';
import type { ChartEditorSelectSceneData, SceneRequest } from '../config.js';
import { STAYING } from '../sceneExit.js';
import type { SceneExit } from '../sceneExit.js';
import {
  createSongList,
  cycleSongListFilter,
  focusSongListRow,
  getFocusedSong,
  getSongListRows,
  moveSongListFocus,
  scrollSongList,
  selectSongListFilter,
  toWheelRows,
} from './songListState.js';
import type { SongListState } from './songListState.js';
import { createAuxiliaryButton } from '../ui/auxiliaryButton.js';
import { handleEachEventOnce, readMenuAction, requireKeyboard } from '../ui/menuInput.js';
import { SegmentedControl } from './SegmentedControl.js';
import { SongListPanel } from './SongListPanel.js';
import { EDITOR_KEY_HINT_STYLE, addKeyHintRow } from '../ui/keyHintView.js';
import type { SongListFrame } from './SongListPanel.js';
import { EDITOR_COLORS, EDITOR_TYPE_SCALE, typeStyle } from '../ui/theme.js';

/** 상단·하단 바는 에디터와 같은 자리를 쓴다. */
const LAYOUT = createEditorLayout(GAME_WIDTH, GAME_HEIGHT);
const LIST_WIDTH_PX = 720;
const LIST_ROW_HEIGHT_PX = 56;
const LIST_PADDING_PX = 16;
const LIST_MARGIN_PX = 24;
const LIST_LEFT_PX = (GAME_WIDTH - LIST_WIDTH_PX) / 2;
const FILTER_TOP_Y_PX = LAYOUT.topBar.heightPx + LIST_MARGIN_PX;
/** 세 칸이 ORIGINAL 을 담고도 넉넉한 폭 */
const FILTER_WIDTH_PX = 360;
/** SegmentedControl 높이와 같다. 목록 윗선을 정하려고 상수로 둔다. */
const FILTER_HEIGHT_PX = 44;
const FILTER_LIST_GAP_PX = 16;
const LIST_TOP_Y_PX = FILTER_TOP_Y_PX + FILTER_HEIGHT_PX + FILTER_LIST_GAP_PX;
const EMPTY_TEXT_OFFSET_Y_PX = 48;
const LIST_FRAME: SongListFrame = {
  leftPx: LIST_LEFT_PX,
  topYPx: LIST_TOP_Y_PX,
  widthPx: LIST_WIDTH_PX,
  paddingPx: LIST_PADDING_PX,
  rowHeightPx: LIST_ROW_HEIGHT_PX,
  visibleRowCount: Math.floor(
    (LAYOUT.bottomBar.topYPx - LIST_MARGIN_PX - LIST_TOP_Y_PX - LIST_PADDING_PX) /
      LIST_ROW_HEIGHT_PX,
  ),
};
const HAIRLINE_PX = 1;
const HAIRLINE_ALPHA = 0.45;

interface ListView {
  panel: SongListPanel;
  filter: SegmentedControl<SongFilter>;
  /** 고른 카테고리에 곡이 없을 때만 보인다. */
  emptyText: Phaser.GameObjects.Text;
}

/** 채보를 편집할 곡을 고르는 화면. 고르면 그 곡으로 에디터를 연다. */
export class ChartEditorSelectScene extends Phaser.Scene {
  /** 목록 포커스·스크롤의 유일한 원본. 바꿀 때는 setList 를 거친다. */
  private list: SongListState = createSongList([], null, LIST_FRAME.visibleRowCount, 'all');
  private exit: SceneExit<SceneRequest> = STAYING;

  constructor(
    private readonly getSongs: () => readonly Song[],
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
    const songs = this.getSongs();
    this.list = createSongList(songs, data.focusedSongId, LIST_FRAME.visibleRowCount, data.filter);
    this.createChrome();
    const keyboard = requireKeyboard(this);
    if (songs.length === 0) {
      this.add
        .text(
          GAME_WIDTH / 2,
          GAME_HEIGHT / 2,
          this.i18n.t('chartEditor.noSongs'),
          typeStyle(EDITOR_TYPE_SCALE.body, EDITOR_COLORS.textSecondary),
        )
        .setOrigin(0.5, 0.5);
      keyboard.on(
        'keydown',
        handleEachEventOnce((event: KeyboardEvent) => {
          if (readMenuAction(event) === 'back') {
            this.leave({ key: 'main', data: undefined });
          }
        }),
      );
      return;
    }
    const view: ListView = {
      filter: new SegmentedControl(
        this,
        { leftPx: LIST_LEFT_PX, topYPx: FILTER_TOP_Y_PX, widthPx: FILTER_WIDTH_PX },
        SONG_FILTERS.map((filter) => ({ value: filter, label: filter.toUpperCase() })),
        (filter) => this.setList(view, selectSongListFilter(this.list, this.getSongs(), filter)),
      ),
      panel: new SongListPanel(this, LIST_FRAME, {
        onHoverRow: (rowIndex) => this.setList(view, focusSongListRow(this.list, rowIndex)),
        onPickRow: (rowIndex) => {
          this.setList(view, focusSongListRow(this.list, rowIndex));
          this.pick();
        },
        onWheel: (deltaYPx) =>
          this.setList(
            view,
            scrollSongList(this.list, toWheelRows(deltaYPx, LIST_FRAME.rowHeightPx)),
          ),
      }),
      emptyText: this.add
        .text(
          LIST_LEFT_PX + LIST_WIDTH_PX / 2,
          LIST_TOP_Y_PX + EMPTY_TEXT_OFFSET_Y_PX,
          this.i18n.t('chartEditorSelect.emptyFilter'),
          typeStyle(EDITOR_TYPE_SCALE.body, EDITOR_COLORS.textSecondary),
        )
        .setOrigin(0.5, 0.5),
    };
    this.render(view);
    keyboard.on(
      'keydown',
      handleEachEventOnce((event: KeyboardEvent) => this.handleKey(view, event)),
    );
  }

  private createChrome(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, EDITOR_COLORS.background).setOrigin(0, 0);
    this.add
      .rectangle(0, LAYOUT.topBar.heightPx, GAME_WIDTH, HAIRLINE_PX, EDITOR_COLORS.border)
      .setOrigin(0, 0.5)
      .setAlpha(HAIRLINE_ALPHA);
    this.add
      .rectangle(0, LAYOUT.bottomBar.topYPx, GAME_WIDTH, HAIRLINE_PX, EDITOR_COLORS.border)
      .setOrigin(0, 0.5)
      .setAlpha(HAIRLINE_ALPHA);
    const centerYPx = LAYOUT.topBar.centerYPx;
    createAuxiliaryButton(this, LAYOUT.video.leftPx, centerYPx, {
      label: 'BACK',
      onActivate: () => this.leave({ key: 'main', data: undefined }),
    });
    this.add
      .text(
        LAYOUT.title.leftPx,
        centerYPx,
        this.i18n.t('chartEditorSelect.title'),
        typeStyle(EDITOR_TYPE_SCALE.title, EDITOR_COLORS.textPrimary),
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

  /** 목록 상태 반영의 유일한 경로. 바뀐 게 없으면 다시 그리지 않는다. */
  private setList(view: ListView, next: SongListState): void {
    if (next === this.list) {
      return;
    }
    this.list = next;
    this.render(view);
  }

  /** 곡 목록은 에디터 저장으로 바뀔 수 있으므로 그릴 때마다 현재 목록을 읽는다. */
  private render(view: ListView): void {
    view.filter.render(this.list.filter);
    view.emptyText.setVisible(this.list.songCount === 0);
    view.panel.render({
      rows: getSongListRows(this.list, this.getSongs()).map(({ song, isFocused }) => ({
        title: song.title,
        category: song.category,
        isFocused,
      })),
      topIndex: this.list.topIndex,
      songCount: this.list.songCount,
    });
  }

  private pick(): void {
    const song = getFocusedSong(this.list, this.getSongs());
    if (song === undefined) {
      return;
    }
    this.leave({ key: 'chartEditor', data: { songId: song.id, listFilter: this.list.filter } });
  }

  private leave(request: SceneRequest): void {
    this.exit = exitScene(this, this.exit, request);
  }

  private handleKey(view: ListView, event: KeyboardEvent): void {
    if (this.exit.kind === 'leaving') {
      return;
    }
    // 곡 선택 화면과 같은 Q/E 로 카테고리를 돌린다.
    if (event.code === 'KeyQ' || event.code === 'KeyE') {
      const delta = event.code === 'KeyQ' ? -1 : 1;
      this.setList(view, cycleSongListFilter(this.list, this.getSongs(), delta));
      return;
    }
    switch (readMenuAction(event)) {
      case 'up':
        this.setList(view, moveSongListFocus(this.list, -1));
        return;
      case 'down':
        this.setList(view, moveSongListFocus(this.list, 1));
        return;
      case 'confirm':
        this.pick();
        return;
      case 'back':
        this.leave({ key: 'main', data: undefined });
        return;
      case 'left':
      case 'right':
      case null:
        return;
    }
  }
}
