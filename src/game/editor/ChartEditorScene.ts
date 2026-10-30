import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { loadYouTubeIframeApi, YouTubePlayer } from '../../audio/YouTubePlayer.js';
import { DIFFICULTIES } from '../../data/songs.js';
import { getLanes } from '../../rhythm/lanes.js';
import { getNoteTimeAtY, getNoteY } from '../../rhythm/notePosition.js';
import type { Difficulty, LaneCount } from '../../rhythm/types.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import { canCurrentUserOpenChartEditor } from '../app/accountState.js';
import type { AccountAuth } from '../app/accountState.js';
import type { CelestialCatalog } from '../celestial/state/celestialCatalog.js';
import { ChartEditorController } from './ChartEditorController.js';
import type { ChartCatalog } from './ChartEditorController.js';
import {
  getEditorButtonView,
  getEditorDecorations,
  getChangedRegions,
  getDifficultyLook,
  getHoveredLaneCount,
  getHoveredTool,
  getEditorStatus,
  getInitialDifficulty,
  getLaneCountMotion,
  getNotes,
  getPending,
  getPlayButtonLabel,
  getSelection,
  getSelectionPanel,
  getSession,
  getToolMotion,
  hasUnsavedChanges,
} from './state/chartEditorState.js';
import type {
  ChartEditorState,
  DifficultyLook,
  EditorButton,
  EditorPlayerStatus,
  EditorRegion,
  EditorStatus,
  PendingAction,
} from './state/chartEditorState.js';
import type { EditTool, TimelinePointer } from './state/chartGesture.js';
import {
  createEditorLayout,
  getLaneAtXPx,
  getLaneCenterXPx,
  getLaneWidthPx,
  getSeekTimeMs,
  getSeekXPx,
  toViewportRect,
} from './state/chartEditorLayout.js';
import type { PxRect } from './state/chartEditorLayout.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../app/config.js';
import { SCENE_KEYS, startScene } from '../app/sceneRoutes.js';
import type { ChartEditorSceneData } from '../app/sceneRoutes.js';
import { getGridTimesMs } from './state/editorTimeline.js';
import { describeSelection, formatEditorTime } from './state/selectionInfo.js';
import type { Button } from '../ui/view/widgets/Button.js';
import { ConfirmDialog } from '../ui/view/widgets/ConfirmDialog.js';
import type { ConfirmTone } from '../ui/view/widgets/ConfirmDialog.js';
import { DRAG_CURSOR, HOVER_CURSOR } from '../ui/view/input/cursor.js';
import {
  addCelestialSprite,
  queueCelestialTextures,
  registerCelestialAnimations,
} from '../celestial/view/celestialSprites.js';
import { createAuxiliaryButton } from '../ui/view/widgets/auxiliaryButton.js';
import { pointButton } from '../ui/view/input/hoverTarget.js';
import type { ButtonPointer, PointerActions } from '../ui/view/input/hoverTarget.js';
import { createCenteredEditorButton, createEditorButton } from './view/editorButton.js';
import { EditorNoteLayer } from './view/EditorNoteLayer.js';
import { SegmentedControl } from './view/SegmentedControl.js';
import { getSegmentAppearance } from './state/segmentAppearance.js';
import { LANE_COUNT_SEGMENTS, TOOL_SEGMENTS } from './view/toolSegments.js';
import { setFittedText } from '../ui/view/widgets/fitText.js';
import { LOADING_STAR_ID } from '../ui/view/widgets/LoadingStar.js';
import { NoticeText, type Notice } from '../ui/view/widgets/NoticeText.js';
import { addKeyHintColumn } from '../ui/view/widgets/keyHintView.js';
import {
  handleEachEventOnce,
  readMenuAction,
  requireKeyboard,
} from '../ui/view/input/menuInput.js';
import {
  CELESTIAL_COLORS,
  GAMEPLAY_DEPTH,
  RADIUS,
  addTextUnderline,
  setTextColor,
  typeStyle,
} from '../ui/view/theme.js';
import { EDITOR_KEY_HINT_STYLE, EDITOR_TYPE_SCALE } from './view/editorTheme.js';
import { addBarHairlines } from './view/hairline.js';
import { addHairline, HAIRLINE_PX } from '../ui/view/textures/hairline.js';
import { requireDefined } from '../../invariant.js';
import { msToSec, secToMs } from '../../time.js';

interface DifficultyItem {
  difficulty: Difficulty;
  text: Phaser.GameObjects.Text;
  underline: Phaser.GameObjects.Rectangle;
}

interface SegmentActions<T> {
  readonly onSelect: (value: T) => void;
  readonly onHover: (value: T) => void;
  readonly onUnhover: (value: T) => void;
}

interface EditorView {
  backButton: Button;
  previousSongButton: Button;
  nextSongButton: Button;
  songTitle: Phaser.GameObjects.Text;
  difficulties: DifficultyItem[];
  status: NoticeText;
  saveButton: Button;
  unsavedDot: Phaser.GameObjects.Arc;
  timeText: Phaser.GameObjects.Text;
  seekFill: Phaser.GameObjects.Rectangle;
  seekThumb: Phaser.GameObjects.Arc;
  seekMarks: Phaser.GameObjects.Graphics;
  playButton: Button;
  playerText: Phaser.GameObjects.Text;
  noteLayer: EditorNoteLayer;
  grid: Phaser.GameObjects.Graphics;
  gridLabels: Phaser.GameObjects.Text[];
  laneLines: Phaser.GameObjects.Graphics;
  laneCountSwitch: SegmentedControl<LaneCount>;
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
const DIFFICULTY_LOOKS: Readonly<
  Record<DifficultyLook, { readonly color: number; readonly isUnderlined: boolean }>
> = {
  selectedWithChart: {
    color: CELESTIAL_COLORS.textPrimary,
    isUnderlined: true,
  },
  selectedWithoutChart: {
    color: CELESTIAL_COLORS.textSecondary,
    isUnderlined: true,
  },
  withChart: {
    color: CELESTIAL_COLORS.textPrimary,
    isUnderlined: false,
  },
  withoutChart: {
    color: CELESTIAL_COLORS.textSecondary,
    isUnderlined: false,
  },
};
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
    queueCelestialTextures(this, this.celestial, [
      this.celestial.atlasPresentations[DIVIDER_GLINT_ID],
      this.celestial.atlasPresentations[LOADING_STAR_ID],
    ]);
  }

  create(data: ChartEditorSceneData): void {
    // 메뉴 노출과 별개로 직접 진입도 막아야 하므로, 화면·리스너를 만들기 전에 권한부터 판정한다.
    if (!canCurrentUserOpenChartEditor(this.auth)) {
      startScene(this, 'main');
      return;
    }
    registerCelestialAnimations(this, this.celestial);
    const keyboard = requireKeyboard(this);
    const settings = this.save.loadSettings();
    this.mvLayer.dataset.mvMode = 'normal';
    const onResize = (): void => this.placeVideoPreview();
    onResize();
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    const editor = new ChartEditorController(
      this.catalog,
      data.list,
      {
        players: {
          loadApi: loadYouTubeIframeApi,
          create: (videoId, handlers) => new YouTubePlayer(this.mvLayer, videoId, handlers),
        },
        now: () => performance.now(),
        volume: settings.masterVolume * settings.musicVolume,
      },
      {
        leave: (focusedSongId) =>
          startScene(this, 'chartEditorSelect', {
            kind: 'return',
            list: data.list,
            focusedSongId,
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
    const onUpdate = (): void => editor.advancePlayback();
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
    });

    // 곡 목록 화면이 같은 편집 목록에서 고른 곡이므로 없으면 진입 경로의 오류다.
    const song = requireDefined(
      data.list.songs.find((listed) => listed.id === data.songId),
      'Chart editor opened for a song not in the list',
      data.songId,
    );
    const { laneMode } = settings;
    editor.select(song, laneMode, getInitialDifficulty(song, laneMode));
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
    const pointer: ButtonPointer<EditorButton> = {
      pointerOver: (button) => editor.pointerOverButton(button),
      pointerOut: (button) => editor.pointerOutButton(button),
      pointerDown: (button) => editor.pointerDownButton(button),
      pointerUp: (button) => editor.pointerUpButton(button),
    };
    const topCenterYPx = LAYOUT.topBar.centerYPx;
    const backButton = createAuxiliaryButton(this, LAYOUT.video.leftPx, topCenterYPx, {
      label: 'BACK',
      pointer: pointButton(pointer, 'back'),
    });
    const songBackButton = createCenteredEditorButton(
      this,
      backButton.x + backButton.width + BUTTON_GAP_PX,
      topCenterYPx,
      {
        variant: 'quiet',
        label: '◀',
        pointer: pointButton(pointer, 'previousSong'),
      },
    );
    const nextSongButton = createCenteredEditorButton(
      this,
      songBackButton.x + songBackButton.width + BUTTON_GAP_PX,
      topCenterYPx,
      {
        variant: 'quiet',
        label: '▶',
        pointer: pointButton(pointer, 'nextSong'),
      },
    );
    const saveButton = createCenteredEditorButton(this, 0, topCenterYPx, {
      variant: 'secondary',
      label: 'SAVE',
      pointer: pointButton(pointer, 'save'),
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
      backButton,
      previousSongButton: songBackButton,
      nextSongButton,
      songTitle: this.add
        .text(
          LAYOUT.title.leftPx,
          topCenterYPx,
          '',
          typeStyle(EDITOR_TYPE_SCALE.title, CELESTIAL_COLORS.textPrimary),
        )
        .setOrigin(0, 0.5),
      difficulties,
      status: new NoticeText(
        this,
        this.celestial,
        this.add
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
      ),
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
        pointer: pointButton(pointer, 'play'),
      }),
      playerText: this.add.text(LAYOUT.playerText.leftPx, LAYOUT.playerText.topYPx, '', {
        ...typeStyle(EDITOR_TYPE_SCALE.meta, CELESTIAL_COLORS.textSecondary),
        wordWrap: {
          width: LAYOUT.playerText.widthPx,
          useAdvancedWrap: true,
        },
      }),
      noteLayer: new EditorNoteLayer(this, {
        playheadYPx: LAYOUT.timeline.playheadYPx,
        pxPerSecond: PX_PER_SECOND,
        topYPx: LAYOUT.timeline.topYPx,
        bottomYPx: LAYOUT.timeline.bottomYPx,
      }),
      grid: this.add.graphics().setDepth(GAMEPLAY_DEPTH.laneDivider),
      gridLabels: Array.from({ length: GRID_LABEL_COUNT }, () =>
        this.add
          .text(0, 0, '', typeStyle(EDITOR_TYPE_SCALE.meta, CELESTIAL_COLORS.textSecondary))
          .setOrigin(1, 0.5)
          .setDepth(GAMEPLAY_DEPTH.laneDivider)
          .setVisible(false),
      ),
      laneLines: this.add.graphics().setDepth(GAMEPLAY_DEPTH.laneDivider),
      ...this.createToolArea(toolSurface, {
        laneCount: {
          onSelect: (laneCount) => editor.selectLaneCount(laneCount),
          onHover: (laneCount) =>
            editor.hoverSegment({
              kind: 'laneCount',
              laneCount,
            }),
          onUnhover: (laneCount) =>
            editor.unhoverSegment({
              kind: 'laneCount',
              laneCount,
            }),
        },
        tool: {
          onSelect: (tool) => editor.selectTool(tool),
          onHover: (tool) =>
            editor.hoverSegment({
              kind: 'tool',
              tool,
            }),
          onUnhover: (tool) =>
            editor.unhoverSegment({
              kind: 'tool',
              tool,
            }),
        },
        deletePointer: pointButton(pointer, 'delete'),
        clearPointer: pointButton(pointer, 'clear'),
      }),
      confirm: new ConfirmDialog(this, {
        cancel: pointButton(pointer, 'confirmCancel'),
        accept: pointButton(pointer, 'confirmAccept'),
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
      laneCount: SegmentActions<LaneCount>;
      tool: SegmentActions<EditTool>;
      deletePointer: PointerActions;
      clearPointer: PointerActions;
    },
  ): Pick<
    EditorView,
    | 'laneCountSwitch'
    | 'toolSwitch'
    | 'selectionTitle'
    | 'selectionValues'
    | 'deleteButton'
    | 'noteCountText'
    | 'clearButton'
    | 'dividerGlint'
  > {
    const laneCountLabel = this.addSectionLabel(
      this.i18n.t('chartEditor.laneSection'),
      LAYOUT.tools.topYPx + LAYOUT.tools.paddingPx,
    );
    const laneCountsYPx = laneCountLabel.y + laneCountLabel.height + TOOLS_ITEM_GAP_PX;
    const laneCountSwitch = new SegmentedControl(
      this,
      {
        leftPx: TOOLS_CONTENT_LEFT_PX,
        topYPx: laneCountsYPx,
        widthPx: TOOLS_CONTENT_RIGHT_PX - TOOLS_CONTENT_LEFT_PX,
      },
      LANE_COUNT_SEGMENTS,
      actions.laneCount,
    );
    const toolRuleYPx = laneCountsYPx + laneCountSwitch.heightPx + TOOLS_SECTION_GAP_PX;
    addHairline(this, TOOLS_CONTENT_LEFT_PX, toolRuleYPx, TOOLS_CONTENT_RIGHT_PX);
    const toolLabel = this.addSectionLabel(
      this.i18n.t('chartEditor.toolSection'),
      toolRuleYPx + TOOLS_SECTION_GAP_PX,
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
      actions.tool,
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
        pointer: actions.deletePointer,
        widthPx: TOOLS_CONTENT_RIGHT_PX - TOOLS_CONTENT_LEFT_PX,
        heightPx: SAVE_HEIGHT_PX,
      },
    );
    const countRuleYPx = deleteButton.y + deleteButton.height + TOOLS_SECTION_GAP_PX;
    addHairline(this, TOOLS_CONTENT_LEFT_PX, countRuleYPx, TOOLS_CONTENT_RIGHT_PX);
    const clearButton = createEditorButton(this, 0, countRuleYPx + TOOLS_SECTION_GAP_PX, {
      variant: 'quiet',
      label: 'CLEAR',
      pointer: actions.clearPointer,
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
      laneCountSwitch,
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

  // TextTabs 와 달리 고른 난이도의 글자색이 채보 유무를 따르고, 고른 탭도 다시 누를 수 있으며, CELESTIAL_COLORS 를 쓴다.
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
      const underline = addTextUnderline(this, text, CELESTIAL_COLORS.selected);
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
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
        const timelinePointer = this.getTimelinePointer(editor, pointer);
        if (timelinePointer !== null) {
          editor.pointerDown(timelinePointer);
        }
      });
    // drag 중에는 pointer 가 timeline 밖으로 나가도 따라간다. lane·시각은 변환 함수가 제한한다.
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      const timelinePointer = this.getTimelinePointer(editor, pointer);
      if (timelinePointer !== null) {
        editor.pointerMove(timelinePointer);
      }
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      const timelinePointer = this.getTimelinePointer(editor, pointer);
      if (timelinePointer !== null) {
        editor.pointerUp(timelinePointer.timeMs);
      }
    });
  }

  private getTimelinePointer(
    editor: ChartEditorController,
    pointer: Phaser.Input.Pointer,
  ): TimelinePointer | null {
    const selection = getSelection(editor.state);
    if (selection === null) {
      return null;
    }
    return {
      lane: getLaneAtXPx(LAYOUT, selection.laneCount, pointer.x),
      timeMs: getNoteTimeAtY(
        pointer.y,
        editor.state.playhead.currentTimeMs,
        LAYOUT.timeline.playheadYPx,
        PX_PER_SECOND,
      ),
    };
  }

  private renderChanges(
    view: EditorView,
    previous: ChartEditorState,
    next: ChartEditorState,
  ): void {
    for (const region of getChangedRegions(previous, next)) {
      this.renderRegion(view, previous, next, region);
    }
  }

  private renderRegion(
    view: EditorView,
    previous: ChartEditorState,
    state: ChartEditorState,
    region: EditorRegion,
  ): void {
    switch (region) {
      case 'selection': {
        const selection = getSelection(state);
        this.renderSongTitle(view, selection?.song.title ?? '');
        view.difficulties.forEach((item) => this.renderDifficulty(item, state));
        return;
      }
      case 'laneCountIndicator': {
        const selection = getSelection(state);
        if (selection !== null) {
          view.laneCountSwitch.renderIndicator(selection.laneCount, getLaneCountMotion(previous));
        }
        return;
      }
      case 'laneCountSegments': {
        const selection = getSelection(state);
        if (selection !== null) {
          const hovered = getHoveredLaneCount(state);
          view.laneCountSwitch.renderSegments((laneCount) =>
            getSegmentAppearance(laneCount, selection.laneCount, hovered),
          );
        }
        return;
      }
      case 'toolIndicator':
        view.toolSwitch.renderIndicator(state.tool, getToolMotion(previous, state));
        return;
      case 'toolSegments': {
        const hovered = getHoveredTool(state);
        view.toolSwitch.renderSegments((tool) => getSegmentAppearance(tool, state.tool, hovered));
        return;
      }
      case 'laneLines':
        this.renderLaneLines(view, getSelection(state)?.laneCount ?? null);
        return;
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
      case 'playhead':
        this.renderPlayhead(view, state);
        return;
      case 'seekMarks':
        this.renderSeekMarks(view, state);
        return;
      case 'notes':
        this.renderNotes(view, state);
        return;
      case 'decorations':
        this.renderDecorations(view, state);
        return;
      case 'playerStatus':
        this.renderPlayerStatus(view, state.player);
        return;
      case 'backButton':
        view.backButton.render(getEditorButtonView(state, 'back'));
        return;
      case 'previousSongButton':
        view.previousSongButton.render(getEditorButtonView(state, 'previousSong'));
        return;
      case 'nextSongButton':
        view.nextSongButton.render(getEditorButtonView(state, 'nextSong'));
        return;
      case 'saveButton':
        view.saveButton.render(getEditorButtonView(state, 'save'));
        return;
      case 'deleteButton':
        view.deleteButton.render(getEditorButtonView(state, 'delete'));
        return;
      case 'clearButton':
        view.clearButton.render(getEditorButtonView(state, 'clear'));
        return;
      case 'confirmButtons':
        view.confirm.renderButtons(
          getEditorButtonView(state, 'confirmCancel'),
          getEditorButtonView(state, 'confirmAccept'),
        );
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

  private renderPlayButton(view: EditorView, state: ChartEditorState): void {
    view.playButton.setLabel(getPlayButtonLabel(state)).render(getEditorButtonView(state, 'play'));
  }

  private renderPlayerStatus(view: EditorView, player: EditorPlayerStatus): void {
    switch (player.kind) {
      case 'loading':
      case 'ready':
        view.playerText.setText('');
        return;
      case 'failed':
        view.playerText.setText(this.translatePlayerFailure(player.failure));
        return;
    }
  }

  private translatePlayerFailure(
    failure: Extract<EditorPlayerStatus, { kind: 'failed' }>['failure'],
  ): string {
    switch (failure.kind) {
      case 'loadFailed':
        return this.i18n.t('gameplay.playerLoadFailed');
      case 'videoError':
        return this.i18n.t('youtubeError.withCode', {
          message: this.i18n.t(`youtubeError.${failure.errorKind}`),
          code: failure.code,
        });
    }
  }

  private renderSongTitle(view: EditorView, title: string): void {
    setFittedText(view.songTitle, title, LAYOUT.title.maxWidthPx);
  }

  private renderStatus(view: EditorView, state: ChartEditorState): void {
    const status = getEditorStatus(state);
    view.status.show(this.getStatusMessage(status));
    view.unsavedDot.setVisible(hasUnsavedChanges(state));
  }

  private renderDecorations(view: EditorView, state: ChartEditorState): void {
    view.dividerGlint.setVisible(getEditorDecorations(state).isDividerGlintVisible);
  }

  private renderConfirm(view: EditorView, state: ChartEditorState): void {
    const pending = getPending(state);
    if (pending === null) {
      view.confirm.render(null);
      return;
    }
    const labels = CONFIRM_LABELS[pending.kind];
    view.confirm.render({
      title: this.i18n.t(labels.titleKey),
      body: this.i18n.t(labels.bodyKey, { noteCount: getNotes(state).length }),
      cancelLabel: 'CANCEL',
      acceptLabel: labels.accept,
      acceptTone: labels.acceptTone,
    });
  }

  private renderPanel(view: EditorView, state: ChartEditorState): void {
    const { titleKey, noteCount } = getSelectionPanel(state);
    view.selectionTitle.setText(this.i18n.t(titleKey));
    describeSelection(getSession(state)?.draft.selected ?? null).forEach(({ value }, index) => {
      requireDefined(
        view.selectionValues[index],
        'Missing selection value text for row',
        index,
      ).setText(value);
    });
    view.noteCountText.setText(
      noteCount === null ? '' : this.i18n.t('chartEditor.noteCount', { count: noteCount }),
    );
  }

  private renderDifficulty(
    { difficulty, text, underline }: DifficultyItem,
    state: ChartEditorState,
  ): void {
    const { color, isUnderlined } = DIFFICULTY_LOOKS[getDifficultyLook(state, difficulty)];
    setTextColor(text, color);
    underline.setVisible(isUnderlined);
  }

  private getStatusMessage(status: EditorStatus): Notice {
    switch (status.kind) {
      case 'noSongs':
        return {
          kind: 'text',
          text: this.i18n.t('chartEditor.noSongs'),
        };
      case 'loading':
        return {
          kind: 'loading',
          text: this.i18n.t('chartEditor.loading'),
        };
      case 'loadFailed':
        return {
          kind: 'text',
          text: this.i18n.t('chartEditor.chartLoadFailed'),
        };
      case 'saving':
        return {
          kind: 'text',
          text: this.i18n.t('chartEditor.saving'),
        };
      case 'saved':
        return {
          kind: 'text',
          text: this.i18n.t('chartEditor.saved'),
        };
      case 'saveFailed':
        return {
          kind: 'text',
          text: this.i18n.t('chartEditor.saveFailed'),
        };
      case 'invalid':
        return {
          kind: 'text',
          text: this.i18n.t('chartEditor.invalidChart', { reason: status.reason }),
        };
      // 미저장은 문장 대신 SAVE 의 점으로 알린다.
      case 'unsaved':
      case 'none':
        return { kind: 'none' };
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
      view.noteLayer.render({
        notes: [],
        selected: null,
        currentTimeMs: state.playhead.currentTimeMs,
        laneCenterXPx: [],
        accentColor: CELESTIAL_COLORS.textPrimary,
      });
      return;
    }
    const { song, laneCount } = selection;
    view.noteLayer.render({
      notes: getNotes(state),
      selected: getSession(state)?.draft.selected ?? null,
      currentTimeMs: state.playhead.currentTimeMs,
      laneCenterXPx: getLanes(laneCount).map((lane) => getLaneCenterXPx(LAYOUT, laneCount, lane)),
      accentColor: song.accentColor,
    });
  }

  private renderSeekMarks(view: EditorView, state: ChartEditorState): void {
    const { seekMarks } = view;
    seekMarks.clear();
    const selection = getSelection(state);
    if (selection === null) {
      return;
    }
    seekMarks.lineStyle(HAIRLINE_PX, CELESTIAL_COLORS.selected, SEEK_MARK_ALPHA);
    const { centerYPx: transportYPx } = LAYOUT.bottomBar;
    getNotes(state).forEach((note) => {
      const xPx = getSeekXPx(LAYOUT, note.timeMs, selection.song);
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

  private renderLaneLines(view: EditorView, laneCount: LaneCount | null): void {
    view.laneLines.clear();
    if (laneCount === null) {
      return;
    }
    const { lanes, timeline } = LAYOUT;
    const laneWidthPx = getLaneWidthPx(LAYOUT, laneCount);
    [...getLanes(laneCount), laneCount].forEach((boundary) => {
      const isEdge = boundary === 0 || boundary === laneCount;
      view.laneLines
        .fillStyle(CELESTIAL_COLORS.border, isEdge ? LANE_EDGE_ALPHA : LANE_LINE_ALPHA)
        .fillRect(
          lanes.leftPx + laneWidthPx * boundary - LANE_LINE_WIDTH_PX / 2,
          timeline.topYPx,
          LANE_LINE_WIDTH_PX,
          TIMELINE_HEIGHT_PX,
        );
    });
  }

  private handleKey(editor: ChartEditorController, event: KeyboardEvent): void {
    const action = readMenuAction(event);
    if (event.code === 'KeyZ' && (event.ctrlKey || event.metaKey) && !event.shiftKey) {
      editor.undo();
    } else if (action === 'confirm') {
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
