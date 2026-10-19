import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { loadYouTubeIframeApi, YouTubePlayer } from '../../audio/YouTubePlayer.js';
import { YouTubeTimeSource } from '../../audio/YouTubeTimeSource.js';
import { DIFFICULTIES, getAvailableDifficulties } from '../../data/songs.js';
import type { Song, SongFilter } from '../../data/songs.js';
import { LANES, mapLanes } from '../../rhythm/lanes.js';
import { getNoteTimeAtY, getNoteY } from '../../rhythm/notePosition.js';
import type { Difficulty, Lane, Note } from '../../rhythm/types.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import { DEFAULT_SETTINGS } from '../../storage/settings.js';
import type { Settings } from '../../storage/settings.js';
import { canCurrentUserOpenChartEditor } from '../accountState.js';
import type { AccountAuth } from '../accountState.js';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import { ChartEditorController } from './ChartEditorController.js';
import type { ChartCatalog } from './ChartEditorController.js';
import {
  canClearNotes,
  canDeleteSelected,
  canSave,
  getEditorDecorations,
  getChangedRegions,
  getEditorStatus,
  getNotes,
  getPending,
  getSelection,
  getSession,
  getTransport,
  hasUnsavedChanges,
} from './chartEditorState.js';
import type {
  ChartEditorState,
  EditorRegion,
  PendingAction,
  Selection,
} from './chartEditorState.js';
import type { EditTool } from './chartGesture.js';
import {
  createEditorLayout,
  getLaneAtXPx,
  getLaneCenterXPx,
  getSeekTimeMs,
  getSeekXPx,
  toViewportRect,
} from './chartEditorLayout.js';
import type { PxRect } from './chartEditorLayout.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../config.js';
import { SCENE_KEYS, startScene } from '../sceneRoutes.js';
import type { ChartEditorSceneData } from '../sceneRoutes.js';
import { getGridTimesMs } from './editorTimeline.js';
import { describeSelection, formatEditorTime } from './selectionInfo.js';
import type { Button } from '../ui/Button.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.js';
import type { ConfirmTone } from '../ui/ConfirmDialog.js';
import { DRAG_CURSOR, HOVER_CURSOR } from '../ui/cursor.js';
import {
  addCelestialSprite,
  queueCelestialTextures,
  registerCelestialAnimations,
} from '../celestial/celestialSprites.js';
import { createAuxiliaryButton } from '../ui/auxiliaryButton.js';
import { createCenteredEditorButton, createEditorButton } from './editorButton.js';
import { EditorNoteLayer } from './EditorNoteLayer.js';
import { SegmentedControl } from './SegmentedControl.js';
import { TOOL_SEGMENTS } from './toolSegments.js';
import { setFittedText } from './fitText.js';
import { addKeyHintColumn } from '../ui/keyHintView.js';
import { handleEachEventOnce, readMenuAction, requireKeyboard } from '../ui/menuInput.js';
import {
  CELESTIAL_COLORS,
  GAMEPLAY_DEPTH,
  INDICATOR,
  RADIUS,
  setTextColor,
  typeStyle,
} from '../ui/theme.js';
import { EDITOR_KEY_HINT_STYLE, EDITOR_TYPE_SCALE } from './editorTheme.js';
import { addBarHairlines, addHairline, HAIRLINE_PX } from './hairline.js';
import { requireDefined } from '../../invariant.js';
import { msToSec, secToMs } from '../../time.js';

interface DifficultyItem {
  difficulty: Difficulty;
  text: Phaser.GameObjects.Text;
  underline: Phaser.GameObjects.Rectangle;
}

type PlayerStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly player: YouTubePlayer;
      readonly timeSource: YouTubeTimeSource;
    };

interface EditorView {
  songTitle: Phaser.GameObjects.Text;
  difficulties: DifficultyItem[];
  statusText: Phaser.GameObjects.Text;
  saveButton: Button;
  unsavedDot: Phaser.GameObjects.Arc;
  timeText: Phaser.GameObjects.Text;
  seekFill: Phaser.GameObjects.Rectangle;
  seekThumb: Phaser.GameObjects.Arc;
  seekMarks: Phaser.GameObjects.Graphics;
  playButton: Button;
  playerText: Phaser.GameObjects.Text;
  grid: Phaser.GameObjects.Graphics;
  gridLabels: Phaser.GameObjects.Text[];
  toolSwitch: SegmentedControl<EditTool>;
  selectionTitle: Phaser.GameObjects.Text;
  selectionValues: Phaser.GameObjects.Text[];
  deleteButton: Button;
  noteCountText: Phaser.GameObjects.Text;
  clearButton: Button;
  confirm: ConfirmDialog;
  dividerGlint: Phaser.GameObjects.Sprite;
}

const LAYOUT = createEditorLayout(GAME_WIDTH, GAME_HEIGHT);
const TIMELINE_HEIGHT_PX = LAYOUT.timeline.bottomYPx - LAYOUT.timeline.topYPx;
const BUTTON_GAP_PX = 4;
const DIFFICULTY_GAP_PX = 24;
const SAVE_WIDTH_PX = 88;
const SAVE_HEIGHT_PX = 38;
const STATUS_GAP_PX = 16;
const STATUS_MAX_LINES = 2;
const UNSAVED_DOT_RADIUS_PX = 5;
/** 점이 SAVE 테두리를 끊고 올라앉아 보이도록 바탕색 테두리를 두른다. */
const UNSAVED_DOT_RING_PX = 3;
const MV_FRAME_PROPERTIES: Record<keyof PxRect, string> = {
  leftPx: '--mv-frame-left',
  topPx: '--mv-frame-top',
  widthPx: '--mv-frame-width',
  heightPx: '--mv-frame-height',
};
const PLAYHEAD_THICKNESS_PX = 2;
const PLAYHEAD_GLOW_HEIGHT_PX = 18;
const PLAYHEAD_GLOW_ALPHA = 0.14;
const PX_PER_SECOND = 400;
const OPENING_LEAD_MS = 600;
const LANE_LINE_WIDTH_PX = 1;
const LANE_LINE_ALPHA = 0.22;
const LANE_EDGE_ALPHA = 0.55;
const GRID_MINOR_STEP_MS = 250;
const GRID_MAJOR_STEP_MS = 1000;
const GRID_MINOR_ALPHA = 0.07;
const GRID_MAJOR_ALPHA = 0.22;
const GRID_LABEL_RIGHT_X_PX = LAYOUT.lanes.leftPx - 16;
const GRID_LABEL_COUNT = Math.ceil(TIMELINE_HEIGHT_PX / PX_PER_SECOND) + 1;
const SEEK_TRACK_HEIGHT_PX = 2;
const SEEK_TRACK_ALPHA = 0.5;
const SEEK_THUMB_RADIUS_PX = 7;
const SEEK_HIT_HEIGHT_PX = 32;
const SEEK_MARK_HEIGHT_PX = 12;
const SEEK_MARK_ALPHA = 0.45;
const CONFIRM_LABELS: Record<
  PendingAction['kind'],
  {
    titleKey: 'chartEditor.discardTitle' | 'chartEditor.clearTitle';
    bodyKey: 'chartEditor.discardConfirm' | 'chartEditor.clearConfirm';
    accept: string;
    acceptTone: ConfirmTone;
  }
> = {
  select: {
    titleKey: 'chartEditor.discardTitle',
    bodyKey: 'chartEditor.discardConfirm',
    accept: 'DISCARD',
    acceptTone: 'default',
  },
  leave: {
    titleKey: 'chartEditor.discardTitle',
    bodyKey: 'chartEditor.discardConfirm',
    accept: 'DISCARD',
    acceptTone: 'default',
  },
  clearNotes: {
    titleKey: 'chartEditor.clearTitle',
    bodyKey: 'chartEditor.clearConfirm',
    accept: 'CLEAR',
    acceptTone: 'danger',
  },
};
const TOOLS_CONTENT_LEFT_PX = LAYOUT.tools.leftPx + LAYOUT.tools.paddingPx;
const TOOLS_CONTENT_RIGHT_PX = LAYOUT.tools.leftPx + LAYOUT.tools.widthPx - LAYOUT.tools.paddingPx;
const TOOLS_ITEM_GAP_PX = 8;
const TOOLS_SECTION_GAP_PX = 16;
const SELECTION_VALUE_OFFSET_PX = 56;
const SELECTION_ROW_HEIGHT_PX = 24;
const SELECTION_LINE_SPACING_PX = 6;
/** 열 폭을 넘는 hold TIME 이 두 줄이 되어도 아래 DELETE 가 움직이지 않도록 마지막 행에 두 줄 자리를 둔다. */
const SELECTION_LAST_ROW_MAX_LINES = 2;
const DIVIDER_GLINT_ID = 'R48';
const SNAP_THRESHOLD_PX = 8;
const PICK_TOLERANCE_PX = 12;
const SNAP_THRESHOLD_MS = secToMs(SNAP_THRESHOLD_PX / PX_PER_SECOND);
const PICK_TOLERANCE_MS = secToMs(PICK_TOLERANCE_PX / PX_PER_SECOND);

export class ChartEditorScene extends Phaser.Scene {
  private noteLayer: { songId: string; layer: EditorNoteLayer } | null = null;
  private seekMarkedNotes: readonly Note[] | null = null;
  private settings: Settings = DEFAULT_SETTINGS;
  /** player 이벤트와 늦은 API 로드 결과는 시작 때 잡은 토큰이 아직 현재일 때만 반영한다. */
  private playerToken: object | null = null;
  private player: YouTubePlayer | null = null;
  private playerStatus: PlayerStatus = { kind: 'loading' };
  private listFilter: SongFilter = 'all';

  constructor(
    private readonly save: LocalSave,
    private readonly mvLayer: HTMLElement,
    private readonly catalog: ChartCatalog,
    private readonly auth: AccountAuth,
    private readonly i18n: I18n,
    private readonly celestial: CelestialCatalog,
  ) {
    super(SCENE_KEYS.chartEditor);
  }

  preload(): void {
    queueCelestialTextures(this, this.celestial);
  }

  create(data: ChartEditorSceneData): void {
    // 메뉴 노출과 별개로 직접 진입도 막아야 하므로, 화면·리스너를 만들기 전에 권한부터 판정한다.
    if (!canCurrentUserOpenChartEditor(this.auth)) {
      startScene(this, 'main');
      return;
    }
    registerCelestialAnimations(this, this.celestial);
    const keyboard = requireKeyboard(this);
    this.settings = this.save.loadSettings();
    this.mvLayer.dataset.mvMode = this.settings.mvMode;
    this.noteLayer = null;
    this.seekMarkedNotes = null;
    this.playerStatus = { kind: 'loading' };
    this.listFilter = data.listFilter;
    const onResize = (): void => this.placeVideoPreview();
    onResize();
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    const editor = new ChartEditorController(
      this.catalog,
      {
        play: (fromSec) => {
          if (this.playerStatus.kind !== 'ready') {
            return null;
          }
          this.playerStatus.player.requestPlay(fromSec);
          return this.playerStatus.timeSource;
        },
        pause: () => {
          if (this.playerStatus.kind === 'ready') {
            this.playerStatus.player.pause();
          }
        },
      },
      {
        changeSong: (song) => this.replacePlayer(view, editor, song),
        leave: (focusedSongId) =>
          startScene(this, 'chartEditorSelect', {
            focusedSongId,
            filter: this.listFilter,
          }),
        render: (previous, next) => this.renderChanges(view, previous, next),
      },
      {
        openingLeadMs: OPENING_LEAD_MS,
        snapThresholdMs: SNAP_THRESHOLD_MS,
        pickToleranceMs: PICK_TOLERANCE_MS,
      },
    );
    const view = this.createView(editor);
    keyboard.on(
      'keydown',
      handleEachEventOnce((event: KeyboardEvent) => this.handleKey(editor, event)),
    );
    const onUpdate = (): void => {
      if (this.playerStatus.kind === 'ready') {
        this.playerStatus.timeSource.sync();
      }
      editor.advancePlayback();
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    // 새로고침·탭 닫기로 미저장 draft 를 잃지 않도록 그때의 draft 로 경고 여부를 정한다.
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (hasUnsavedChanges(editor.state)) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      this.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      delete this.mvLayer.dataset.mvFrame;
      Object.values(MV_FRAME_PROPERTIES).forEach((name) => this.mvLayer.style.removeProperty(name));
      editor.close();
      this.noteLayer = null;
      this.playerToken = null;
      this.player?.destroy();
      this.player = null;
    });

    // 곡 목록 화면이 같은 catalog 목록에서 고른 곡이므로 없으면 진입 경로의 오류다.
    const song = requireDefined(
      this.catalog.getSongs().find((listed) => listed.id === data.songId),
      'Chart editor opened for a song not in the list',
      data.songId,
    );
    editor.select(song, getAvailableDifficulties(song)[0] ?? 'easy');
  }

  private placeVideoPreview(): void {
    const bounds = this.game.canvas.getBoundingClientRect();
    const rect = toViewportRect(
      LAYOUT.video,
      {
        leftPx: bounds.left,
        topPx: bounds.top,
        widthPx: bounds.width,
        heightPx: bounds.height,
      },
      GAME_WIDTH,
      GAME_HEIGHT,
    );
    const { style } = this.mvLayer;
    style.setProperty(MV_FRAME_PROPERTIES.leftPx, `${rect.leftPx}px`);
    style.setProperty(MV_FRAME_PROPERTIES.topPx, `${rect.topPx}px`);
    style.setProperty(MV_FRAME_PROPERTIES.widthPx, `${rect.widthPx}px`);
    style.setProperty(MV_FRAME_PROPERTIES.heightPx, `${rect.heightPx}px`);
    this.mvLayer.dataset.mvFrame = 'preview';
  }

  private createView(editor: ChartEditorController): EditorView {
    // 같은 depth 의 다른 요소보다 먼저 만들어 그 아래에 그린다.
    this.addBackdrop();
    addBarHairlines(this, LAYOUT, GAME_WIDTH);
    const toolSurface = this.add
      .rectangle(
        LAYOUT.tools.leftPx,
        LAYOUT.tools.topYPx,
        LAYOUT.tools.widthPx,
        0,
        CELESTIAL_COLORS.surface,
      )
      .setOrigin(0, 0)
      .setRounded(RADIUS.smallPx);
    const topCenterYPx = LAYOUT.topBar.centerYPx;
    const back = createAuxiliaryButton(this, LAYOUT.video.leftPx, topCenterYPx, {
      label: 'BACK',
      onActivate: () => editor.back(),
    });
    const previousSong = createCenteredEditorButton(
      this,
      back.x + back.width + BUTTON_GAP_PX,
      topCenterYPx,
      {
        variant: 'quiet',
        label: '◀',
        onActivate: () => editor.moveSong(-1),
      },
    );
    createCenteredEditorButton(
      this,
      previousSong.x + previousSong.width + BUTTON_GAP_PX,
      topCenterYPx,
      {
        variant: 'quiet',
        label: '▶',
        onActivate: () => editor.moveSong(1),
      },
    );
    const saveButton = createCenteredEditorButton(this, 0, topCenterYPx, {
      variant: 'secondary',
      label: 'SAVE',
      onActivate: () => void editor.save(),
      widthPx: SAVE_WIDTH_PX,
      heightPx: SAVE_HEIGHT_PX,
    }).alignX(LAYOUT.tools.leftPx + LAYOUT.tools.widthPx, 1);
    const statusRightXPx = saveButton.x - STATUS_GAP_PX;
    const difficulties = this.createDifficultyItems(topCenterYPx, (difficulty) =>
      editor.selectDifficulty(difficulty),
    );
    const lastDifficulty = requireDefined(
      difficulties[difficulties.length - 1],
      'Chart editor needs at least one difficulty',
    );
    const statusLeftXPx = lastDifficulty.text.x + lastDifficulty.text.width + STATUS_GAP_PX;
    const transportYPx = LAYOUT.bottomBar.centerYPx;
    const view: EditorView = {
      songTitle: this.add
        .text(
          LAYOUT.title.leftPx,
          topCenterYPx,
          '',
          typeStyle(EDITOR_TYPE_SCALE.title, CELESTIAL_COLORS.textPrimary),
        )
        .setOrigin(0, 0.5),
      difficulties,
      statusText: this.add
        .text(statusRightXPx, topCenterYPx, '', {
          ...typeStyle(EDITOR_TYPE_SCALE.meta, CELESTIAL_COLORS.textSecondary),
          align: 'right',
          wordWrap: {
            width: statusRightXPx - statusLeftXPx,
            useAdvancedWrap: true,
          },
          maxLines: STATUS_MAX_LINES,
        })
        .setOrigin(1, 0.5),
      saveButton,
      unsavedDot: this.add
        .circle(
          saveButton.x + saveButton.width,
          saveButton.y,
          UNSAVED_DOT_RADIUS_PX,
          CELESTIAL_COLORS.highlight,
        )
        .setStrokeStyle(UNSAVED_DOT_RING_PX, CELESTIAL_COLORS.background)
        .setVisible(false),
      timeText: this.add
        .text(
          LAYOUT.timeXPx,
          transportYPx,
          '',
          typeStyle(EDITOR_TYPE_SCALE.body, CELESTIAL_COLORS.textPrimary),
        )
        .setOrigin(0, 0.5),
      seekFill: this.add
        .rectangle(
          LAYOUT.seek.leftPx,
          transportYPx,
          0,
          SEEK_TRACK_HEIGHT_PX,
          CELESTIAL_COLORS.selected,
        )
        .setOrigin(0, 0.5)
        .setDepth(GAMEPLAY_DEPTH.text),
      seekMarks: this.add.graphics().setDepth(GAMEPLAY_DEPTH.lanePanel),
      seekThumb: this.add
        .circle(LAYOUT.seek.leftPx, transportYPx, SEEK_THUMB_RADIUS_PX, CELESTIAL_COLORS.highlight)
        .setDepth(GAMEPLAY_DEPTH.text),
      playButton: createCenteredEditorButton(this, LAYOUT.playLeftPx, transportYPx, {
        variant: 'quiet',
        label: 'PLAY',
        onActivate: () => editor.togglePlayback(),
      }),
      playerText: this.add.text(LAYOUT.playerText.leftPx, LAYOUT.playerText.topYPx, '', {
        ...typeStyle(EDITOR_TYPE_SCALE.meta, CELESTIAL_COLORS.textSecondary),
        wordWrap: {
          width: LAYOUT.playerText.widthPx,
          useAdvancedWrap: true,
        },
      }),
      grid: this.add.graphics().setDepth(GAMEPLAY_DEPTH.laneDivider),
      gridLabels: Array.from({ length: GRID_LABEL_COUNT }, () =>
        this.add
          .text(0, 0, '', typeStyle(EDITOR_TYPE_SCALE.meta, CELESTIAL_COLORS.textSecondary))
          .setOrigin(1, 0.5)
          .setDepth(GAMEPLAY_DEPTH.laneDivider)
          .setVisible(false),
      ),
      ...this.createToolArea(toolSurface, {
        onSelectTool: (tool) => editor.selectTool(tool),
        onDelete: () => editor.deleteSelected(),
        onClear: () => editor.requestClearNotes(),
      }),
      confirm: new ConfirmDialog(this, {
        onAccept: () => editor.confirmPending(),
        onCancel: () => editor.cancelPending(),
      }),
    };
    this.createTimeline(editor);
    this.createSeekBar(editor);
    addKeyHintColumn(
      this,
      this.i18n.t('chartEditor.hint'),
      EDITOR_KEY_HINT_STYLE,
      LAYOUT.hint.leftPx,
      LAYOUT.timeline.bottomYPx,
    );
    return view;
  }

  /** 비운 자리로 뒤의 DOM 영상만 보인다. */
  private addBackdrop(): void {
    const { video } = LAYOUT;
    const videoBottomYPx = video.topPx + video.heightPx;
    const videoRightXPx = video.leftPx + video.widthPx;
    const rects: readonly (readonly [number, number, number, number])[] = [
      [0, 0, GAME_WIDTH, video.topPx],
      [0, videoBottomYPx, GAME_WIDTH, GAME_HEIGHT - videoBottomYPx],
      [0, video.topPx, video.leftPx, video.heightPx],
      [videoRightXPx, video.topPx, GAME_WIDTH - videoRightXPx, video.heightPx],
    ];
    rects.forEach(([xPx, yPx, widthPx, heightPx]) => {
      this.add.rectangle(xPx, yPx, widthPx, heightPx, CELESTIAL_COLORS.background).setOrigin(0, 0);
    });
  }

  private addSectionLabel(label: string, yPx: number): Phaser.GameObjects.Text {
    return this.add.text(
      TOOLS_CONTENT_LEFT_PX,
      yPx,
      label,
      typeStyle(EDITOR_TYPE_SCALE.meta, CELESTIAL_COLORS.textSecondary),
    );
  }

  /** 선택 정보는 선택 유무와 무관하게 같은 높이를 잡아 두어, 선택이 바뀌어도 아래 요소가 움직이지 않는다. */
  private createToolArea(
    surface: Phaser.GameObjects.Rectangle,
    actions: {
      onSelectTool: (tool: EditTool) => void;
      onDelete: () => void;
      onClear: () => void;
    },
  ): Pick<
    EditorView,
    | 'toolSwitch'
    | 'selectionTitle'
    | 'selectionValues'
    | 'deleteButton'
    | 'noteCountText'
    | 'clearButton'
    | 'dividerGlint'
  > {
    const toolLabel = this.addSectionLabel(
      this.i18n.t('chartEditor.toolSection'),
      LAYOUT.tools.topYPx + LAYOUT.tools.paddingPx,
    );
    const toolsYPx = toolLabel.y + toolLabel.height + TOOLS_ITEM_GAP_PX;
    const toolSwitch = new SegmentedControl(
      this,
      {
        leftPx: TOOLS_CONTENT_LEFT_PX,
        topYPx: toolsYPx,
        widthPx: TOOLS_CONTENT_RIGHT_PX - TOOLS_CONTENT_LEFT_PX,
      },
      TOOL_SEGMENTS,
      actions.onSelectTool,
    );
    const selectionRuleYPx = toolsYPx + toolSwitch.heightPx + TOOLS_SECTION_GAP_PX;
    addHairline(this, TOOLS_CONTENT_LEFT_PX, selectionRuleYPx, TOOLS_CONTENT_RIGHT_PX);
    const selectionTitle = this.addSectionLabel('', selectionRuleYPx + TOOLS_SECTION_GAP_PX);
    const rowsTopYPx = selectionTitle.y + selectionTitle.height + TOOLS_ITEM_GAP_PX;
    const valueLeftXPx = TOOLS_CONTENT_LEFT_PX + SELECTION_VALUE_OFFSET_PX;
    const selectionValues = describeSelection(null).map(({ label }, index) => {
      const rowYPx = rowsTopYPx + SELECTION_ROW_HEIGHT_PX * index;
      this.add.text(
        TOOLS_CONTENT_LEFT_PX,
        rowYPx,
        label,
        typeStyle(EDITOR_TYPE_SCALE.body, CELESTIAL_COLORS.textSecondary),
      );
      return this.add.text(valueLeftXPx, rowYPx, '', {
        ...typeStyle(EDITOR_TYPE_SCALE.body, CELESTIAL_COLORS.textPrimary),
        lineSpacing: SELECTION_LINE_SPACING_PX,
        wordWrap: {
          width: TOOLS_CONTENT_RIGHT_PX - valueLeftXPx,
          useAdvancedWrap: true,
        },
      });
    });
    const lastValue = requireDefined(
      selectionValues[selectionValues.length - 1],
      'Selection info needs at least one row',
    );
    const lastValueHeightPx = lastValue.setText(
      '\n'.repeat(SELECTION_LAST_ROW_MAX_LINES - 1),
    ).height;
    lastValue.setText('');
    const deleteButton = createEditorButton(
      this,
      TOOLS_CONTENT_LEFT_PX,
      lastValue.y + lastValueHeightPx + TOOLS_SECTION_GAP_PX,
      {
        // 선택 노트에 대한 동작임이 보이도록 정보 열 폭 전체를 SAVE 와 같은 테두리 버튼으로 채운다.
        variant: 'secondary',
        label: 'DELETE',
        onActivate: actions.onDelete,
        widthPx: TOOLS_CONTENT_RIGHT_PX - TOOLS_CONTENT_LEFT_PX,
        heightPx: SAVE_HEIGHT_PX,
      },
    );
    const countRuleYPx = deleteButton.y + deleteButton.height + TOOLS_SECTION_GAP_PX;
    addHairline(this, TOOLS_CONTENT_LEFT_PX, countRuleYPx, TOOLS_CONTENT_RIGHT_PX);
    const clearButton = createEditorButton(this, 0, countRuleYPx + TOOLS_SECTION_GAP_PX, {
      variant: 'quiet',
      label: 'CLEAR',
      onActivate: actions.onClear,
    }).alignX(TOOLS_CONTENT_RIGHT_PX, 1);
    const noteCountText = this.add
      .text(
        TOOLS_CONTENT_LEFT_PX,
        clearButton.y + clearButton.height / 2,
        '',
        typeStyle(EDITOR_TYPE_SCALE.meta, CELESTIAL_COLORS.textSecondary),
      )
      .setOrigin(0, 0.5);
    surface.setSize(
      LAYOUT.tools.widthPx,
      clearButton.y + clearButton.height + LAYOUT.tools.paddingPx - LAYOUT.tools.topYPx,
    );
    return {
      toolSwitch,
      selectionTitle,
      selectionValues,
      deleteButton,
      noteCountText,
      clearButton,
      dividerGlint: addCelestialSprite(
        this,
        this.celestial.atlasPresentations[DIVIDER_GLINT_ID],
        TOOLS_CONTENT_RIGHT_PX,
        selectionRuleYPx,
      ),
    };
  }

  private createDifficultyItems(
    centerYPx: number,
    onSelect: (difficulty: Difficulty) => void,
  ): DifficultyItem[] {
    let xPx = LAYOUT.difficultiesLeftPx;
    return DIFFICULTIES.map((difficulty) => {
      const text = this.add
        .text(
          xPx,
          centerYPx,
          difficulty.toUpperCase(),
          typeStyle(EDITOR_TYPE_SCALE.control, CELESTIAL_COLORS.textPrimary),
        )
        .setOrigin(0, 0.5)
        .setInteractive({ cursor: HOVER_CURSOR });
      text.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => onSelect(difficulty));
      const underline = this.add
        .rectangle(
          xPx,
          centerYPx + text.height / 2 + INDICATOR.underlineOffsetPx,
          text.width,
          INDICATOR.underlineThicknessPx,
          CELESTIAL_COLORS.selected,
        )
        .setOrigin(0, 0);
      xPx += text.width + DIFFICULTY_GAP_PX;
      return {
        difficulty,
        text,
        underline,
      };
    });
  }

  private createTimeline(editor: ChartEditorController): void {
    const { lanes, timeline } = LAYOUT;
    [...LANES, LANES.length].forEach((boundary) => {
      const isEdge = boundary === 0 || boundary === LANES.length;
      this.add
        .rectangle(
          lanes.leftPx + lanes.laneWidthPx * boundary,
          timeline.topYPx,
          LANE_LINE_WIDTH_PX,
          TIMELINE_HEIGHT_PX,
          CELESTIAL_COLORS.border,
        )
        .setOrigin(0.5, 0)
        .setAlpha(isEdge ? LANE_EDGE_ALPHA : LANE_LINE_ALPHA)
        .setDepth(GAMEPLAY_DEPTH.laneDivider);
    });
    this.add
      .rectangle(
        lanes.leftPx,
        timeline.playheadYPx,
        lanes.widthPx,
        PLAYHEAD_GLOW_HEIGHT_PX,
        CELESTIAL_COLORS.selected,
        PLAYHEAD_GLOW_ALPHA,
      )
      .setOrigin(0, 0.5)
      .setDepth(GAMEPLAY_DEPTH.judgeLine);
    this.add
      .rectangle(
        lanes.leftPx,
        timeline.playheadYPx,
        lanes.widthPx,
        PLAYHEAD_THICKNESS_PX,
        CELESTIAL_COLORS.highlight,
      )
      .setOrigin(0, 0.5)
      .setDepth(GAMEPLAY_DEPTH.judgeLine);
    this.add
      .zone(lanes.leftPx, timeline.topYPx, lanes.widthPx, TIMELINE_HEIGHT_PX)
      .setOrigin(0, 0)
      .setInteractive()
      .on(
        Phaser.Input.Events.GAMEOBJECT_POINTER_WHEEL,
        (_pointer: Phaser.Input.Pointer, _deltaX: number, deltaY: number) => {
          // 아래로 굴린 px 만큼 timeline 이 내려오도록, playhead 보다 deltaY 위의 시각으로 옮긴다.
          editor.seek(
            getNoteTimeAtY(
              timeline.playheadYPx - deltaY,
              editor.state.playhead.currentTimeMs,
              timeline.playheadYPx,
              PX_PER_SECOND,
            ),
          );
        },
      )
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (pointer: Phaser.Input.Pointer) =>
        editor.pointerDown(this.getPointerLane(pointer), this.getPointerTimeMs(editor, pointer)),
      );
    // drag 중에는 pointer 가 timeline 밖으로 나가도 따라간다. lane·시각은 변환 함수가 제한한다.
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) =>
      editor.pointerMove(this.getPointerLane(pointer), this.getPointerTimeMs(editor, pointer)),
    );
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) =>
      editor.pointerUp(this.getPointerTimeMs(editor, pointer)),
    );
  }

  private getPointerLane(pointer: Phaser.Input.Pointer): Lane {
    return getLaneAtXPx(LAYOUT, pointer.x);
  }

  private getPointerTimeMs(editor: ChartEditorController, pointer: Phaser.Input.Pointer): number {
    return getNoteTimeAtY(
      pointer.y,
      editor.state.playhead.currentTimeMs,
      LAYOUT.timeline.playheadYPx,
      PX_PER_SECOND,
    );
  }

  private renderChanges(
    view: EditorView,
    previous: ChartEditorState,
    next: ChartEditorState,
  ): void {
    for (const region of getChangedRegions(previous, next)) {
      this.renderRegion(view, next, region);
    }
  }

  private renderRegion(view: EditorView, state: ChartEditorState, region: EditorRegion): void {
    switch (region) {
      case 'selection': {
        const selection = getSelection(state);
        this.renderSongTitle(view, selection?.song.title ?? '');
        view.difficulties.forEach((item) => this.renderDifficulty(item, selection));
        return;
      }
      case 'status':
        this.renderStatus(view, state);
        return;
      case 'confirm':
        this.renderConfirm(view, state);
        return;
      case 'panel':
        this.renderPanel(view, state);
        return;
      case 'playButton':
        this.renderPlayButton(view, state);
        return;
      case 'player':
        this.renderPlayerStatus(view);
        return;
      case 'playhead':
        this.renderPlayhead(view, state);
        return;
      case 'notes':
        this.renderNotes(view, state);
        return;
      case 'decorations':
        this.renderDecorations(view, state);
        return;
    }
  }

  private createSeekBar(editor: ChartEditorController): void {
    const { seek: seekBar, bottomBar } = LAYOUT;
    this.add
      .rectangle(
        seekBar.leftPx,
        bottomBar.centerYPx,
        seekBar.widthPx,
        SEEK_TRACK_HEIGHT_PX,
        CELESTIAL_COLORS.border,
        SEEK_TRACK_ALPHA,
      )
      .setOrigin(0, 0.5);
    const zone = this.add
      .zone(seekBar.leftPx, bottomBar.centerYPx, seekBar.widthPx, SEEK_HIT_HEIGHT_PX)
      .setOrigin(0, 0.5)
      .setInteractive({ cursor: DRAG_CURSOR });
    this.input.setDraggable(zone);
    const seekToPointer = (pointer: Phaser.Input.Pointer): void => {
      const selection = getSelection(editor.state);
      if (selection !== null) {
        editor.seek(getSeekTimeMs(LAYOUT, pointer.x, selection.song));
      }
    };
    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, seekToPointer);
    zone.on(Phaser.Input.Events.GAMEOBJECT_DRAG, seekToPointer);
  }

  private replacePlayer(view: EditorView, editor: ChartEditorController, song: Song): void {
    const token = {};
    this.playerToken = token;
    this.player?.destroy();
    this.player = null;
    this.playerStatus = { kind: 'loading' };
    void this.createPlayer(view, editor, song, token);
  }

  private async createPlayer(
    view: EditorView,
    editor: ChartEditorController,
    song: Song,
    token: object,
  ): Promise<void> {
    try {
      await loadYouTubeIframeApi();
    } catch (error) {
      if (this.playerToken === token) {
        this.failPlayer(view, this.i18n.t('gameplay.playerLoadFailed'), error);
      }
      return;
    }
    if (this.playerToken !== token) {
      return;
    }
    try {
      const player = new YouTubePlayer(this.mvLayer, song.youtubeVideoId, {
        onReady: () => {
          if (this.playerToken !== token) {
            return;
          }
          player.setVolume(this.settings.masterVolume * this.settings.musicVolume);
          this.playerStatus = {
            kind: 'ready',
            player,
            timeSource,
          };
          this.renderPlayerStatus(view);
        },
        onStateChange: (state) => {
          if (this.playerToken === token) {
            timeSource.handleStateChange(state);
            editor.handlePlayerState(state);
          }
        },
        onError: (kind, code) => {
          if (this.playerToken !== token) {
            return;
          }
          player.destroy();
          this.player = null;
          this.playerStatus = {
            kind: 'error',
            message: this.i18n.t('youtubeError.withCode', {
              message: this.i18n.t(`youtubeError.${kind}`),
              code,
            }),
          };
          editor.stopPlayback();
          this.renderPlayerStatus(view);
        },
      });
      const timeSource = new YouTubeTimeSource(player, () => performance.now());
      this.player = player;
    } catch (error) {
      this.failPlayer(view, this.i18n.t('gameplay.playerLoadFailed'), error);
    }
  }

  private failPlayer(view: EditorView, message: string, error: unknown): void {
    console.error('Failed to load YouTube player for chart editor', error);
    this.playerStatus = {
      kind: 'error',
      message,
    };
    this.renderPlayerStatus(view);
  }

  private renderPlayButton(view: EditorView, state: ChartEditorState): void {
    view.playButton.setLabel(getTransport(state).kind === 'paused' ? 'PLAY' : 'PAUSE');
  }

  private renderPlayerStatus(view: EditorView): void {
    view.playerText.setText(this.playerStatus.kind === 'error' ? this.playerStatus.message : '');
  }

  private renderSongTitle(view: EditorView, title: string): void {
    setFittedText(view.songTitle, title, LAYOUT.title.maxWidthPx);
  }

  private renderStatus(view: EditorView, state: ChartEditorState): void {
    view.statusText.setText(this.getStatusMessage(state));
    view.saveButton.setEnabled(canSave(state));
    view.unsavedDot.setVisible(hasUnsavedChanges(state));
  }

  private renderDecorations(view: EditorView, state: ChartEditorState): void {
    view.dividerGlint.setVisible(getEditorDecorations(state).isDividerGlintVisible);
  }

  private renderConfirm(view: EditorView, state: ChartEditorState): void {
    const pending = getPending(state);
    if (pending === null) {
      view.confirm.hide();
      return;
    }
    const labels = CONFIRM_LABELS[pending.kind];
    view.confirm.show({
      title: this.i18n.t(labels.titleKey),
      body: this.i18n.t(labels.bodyKey, { noteCount: getNotes(state).length }),
      cancelLabel: 'CANCEL',
      acceptLabel: labels.accept,
      acceptTone: labels.acceptTone,
    });
  }

  private renderPanel(view: EditorView, state: ChartEditorState): void {
    view.toolSwitch.render(state.tool);
    const draft = getSession(state)?.draft ?? null;
    const selected = draft?.selected ?? null;
    view.selectionTitle.setText(
      this.i18n.t(selected === null ? 'chartEditor.noSelection' : 'chartEditor.selectionSection'),
    );
    describeSelection(selected).forEach(({ value }, index) => {
      requireDefined(
        view.selectionValues[index],
        'Missing selection value text for row',
        index,
      ).setText(value);
    });
    view.deleteButton.setEnabled(canDeleteSelected(state));
    view.noteCountText.setText(
      draft === null ? '' : this.i18n.t('chartEditor.noteCount', { count: draft.notes.length }),
    );
    view.clearButton.setEnabled(canClearNotes(state));
  }

  private renderDifficulty(
    { difficulty, text, underline }: DifficultyItem,
    selection: Selection | null,
  ): void {
    const hasChart =
      selection !== null && getAvailableDifficulties(selection.song).includes(difficulty);
    setTextColor(text, hasChart ? CELESTIAL_COLORS.textPrimary : CELESTIAL_COLORS.textSecondary);
    underline.setVisible(selection?.difficulty === difficulty);
  }

  private getStatusMessage(state: ChartEditorState): string {
    const status = getEditorStatus(state);
    switch (status.kind) {
      case 'noSongs':
        return this.i18n.t('chartEditor.noSongs');
      case 'loading':
        return this.i18n.t('chartEditor.loading');
      case 'loadFailed':
        return this.i18n.t('chartEditor.chartLoadFailed');
      case 'saving':
        return this.i18n.t('chartEditor.saving');
      case 'saved':
        return this.i18n.t('chartEditor.saved');
      case 'saveFailed':
        return this.i18n.t('chartEditor.saveFailed');
      case 'invalid':
        return this.i18n.t('chartEditor.invalidChart', { reason: status.reason });
      // 미저장은 문장 대신 SAVE 의 점으로 알린다.
      case 'unsaved':
      case 'none':
        return '';
    }
  }

  private renderPlayhead(view: EditorView, state: ChartEditorState): void {
    const { currentTimeMs } = state.playhead;
    const selection = getSelection(state);
    if (selection === null) {
      view.timeText.setText('');
      view.seekFill.setSize(0, SEEK_TRACK_HEIGHT_PX);
      view.seekThumb.setVisible(false);
      view.grid.clear();
      view.gridLabels.forEach((label) => label.setVisible(false));
      return;
    }
    view.timeText.setText(
      `${formatEditorTime(currentTimeMs)} / ${formatEditorTime(selection.song.gameEndMs)}`,
    );
    const thumbXPx = getSeekXPx(LAYOUT, currentTimeMs, selection.song);
    view.seekFill.setSize(thumbXPx - LAYOUT.seek.leftPx, SEEK_TRACK_HEIGHT_PX);
    view.seekThumb.setX(thumbXPx).setVisible(true);
    this.renderGrid(view, currentTimeMs);
  }

  /** 노트는 playhead 기준 위치에 그리므로 시각이 바뀌어도 다시 그린다. */
  private renderNotes(view: EditorView, state: ChartEditorState): void {
    const selection = getSelection(state);
    if (selection === null) {
      view.seekMarks.clear();
      this.seekMarkedNotes = null;
      this.noteLayer?.layer.destroy();
      this.noteLayer = null;
      return;
    }
    const notes = getNotes(state);
    this.renderSeekMarks(view, notes, selection.song);
    this.getNoteLayer(selection.song).render(
      notes,
      getSession(state)?.draft.selected ?? null,
      state.playhead.currentTimeMs,
    );
  }

  private renderSeekMarks(view: EditorView, notes: readonly Note[], song: Song): void {
    if (notes === this.seekMarkedNotes) {
      return;
    }
    this.seekMarkedNotes = notes;
    const { seekMarks } = view;
    seekMarks.clear().lineStyle(HAIRLINE_PX, CELESTIAL_COLORS.selected, SEEK_MARK_ALPHA);
    const { centerYPx: transportYPx } = LAYOUT.bottomBar;
    notes.forEach((note) => {
      const xPx = getSeekXPx(LAYOUT, note.timeMs, song);
      seekMarks.lineBetween(
        xPx,
        transportYPx - SEEK_MARK_HEIGHT_PX / 2,
        xPx,
        transportYPx + SEEK_MARK_HEIGHT_PX / 2,
      );
    });
  }

  private renderGrid(view: EditorView, currentTimeMs: number): void {
    const { lanes, timeline } = LAYOUT;
    const toY = (timeMs: number): number =>
      getNoteY(timeMs, currentTimeMs, timeline.playheadYPx, PX_PER_SECOND);
    const fromMs = getNoteTimeAtY(
      timeline.bottomYPx,
      currentTimeMs,
      timeline.playheadYPx,
      PX_PER_SECOND,
    );
    const toMs = getNoteTimeAtY(
      timeline.topYPx,
      currentTimeMs,
      timeline.playheadYPx,
      PX_PER_SECOND,
    );
    const { grid } = view;
    grid.clear();
    for (const timeMs of getGridTimesMs(fromMs, toMs, GRID_MINOR_STEP_MS)) {
      const isMajor = timeMs % GRID_MAJOR_STEP_MS === 0;
      grid
        .lineStyle(
          HAIRLINE_PX,
          CELESTIAL_COLORS.selected,
          isMajor ? GRID_MAJOR_ALPHA : GRID_MINOR_ALPHA,
        )
        .lineBetween(lanes.leftPx, toY(timeMs), lanes.leftPx + lanes.widthPx, toY(timeMs));
    }
    const majorTimesMs = getGridTimesMs(fromMs, toMs, GRID_MAJOR_STEP_MS);
    view.gridLabels.forEach((label, index) => {
      const timeMs = majorTimesMs[index];
      if (timeMs === undefined) {
        label.setVisible(false);
        return;
      }
      label
        .setText(`${msToSec(timeMs)}s`)
        .setPosition(GRID_LABEL_RIGHT_X_PX, toY(timeMs))
        .setVisible(true);
    });
  }

  /** 노트 색이 곡 accent 를 따르므로 곡이 바뀌면 layer 를 새로 만든다. */
  private getNoteLayer(song: Song): EditorNoteLayer {
    if (this.noteLayer?.songId === song.id) {
      return this.noteLayer.layer;
    }
    this.noteLayer?.layer.destroy();
    const layer = new EditorNoteLayer(this, {
      laneCenterXPx: mapLanes((lane) => getLaneCenterXPx(LAYOUT, lane)),
      playheadYPx: LAYOUT.timeline.playheadYPx,
      pxPerSecond: PX_PER_SECOND,
      topYPx: LAYOUT.timeline.topYPx,
      bottomYPx: LAYOUT.timeline.bottomYPx,
      accentColor: song.accentColor,
    });
    this.noteLayer = {
      songId: song.id,
      layer,
    };
    return layer;
  }

  private handleKey(editor: ChartEditorController, event: KeyboardEvent): void {
    const action = readMenuAction(event);
    if (action === 'confirm') {
      editor.confirmPending();
    } else if (event.code === 'Space') {
      // 누르고 있는 동안의 반복 입력으로 재생과 일시정지가 번갈아 바뀌지 않게 한다.
      if (!event.repeat) {
        editor.togglePlayback();
      }
    } else if (event.code === 'Delete' || event.code === 'Backspace') {
      editor.deleteSelected();
    } else if (action === 'back') {
      editor.back();
    }
  }
}
