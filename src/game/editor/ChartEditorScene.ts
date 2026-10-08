import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { RhythmClock } from '../../audio/RhythmClock.js';
import { loadYouTubeIframeApi, YouTubePlayer } from '../../audio/YouTubePlayer.js';
import type { YouTubePlayerState } from '../../audio/YouTubePlayer.js';
import { YouTubeTimeSource } from '../../audio/YouTubeTimeSource.js';
import { DIFFICULTIES, getAvailableDifficulties } from '../../data/songs.js';
import type { Song, SongFilter } from '../../data/songs.js';
import { LANES, mapLanes } from '../../rhythm/lanes.js';
import { getNoteY } from '../../rhythm/notePosition.js';
import type { Chart, Difficulty, Lane, Note } from '../../rhythm/types.js';
import { DEFAULT_SETTINGS } from '../../storage/LocalSave.js';
import type { LocalSave, Settings } from '../../storage/LocalSave.js';
import { canCurrentUserOpenChartEditor } from '../accountState.js';
import type { AccountAuth } from '../accountState.js';
import { getAtlasPresentation } from '../celestial/celestialCatalog.js';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import {
  advancePlayback,
  applySelection,
  canSave,
  canStartPlayback,
  cancelPending,
  clearSelection,
  completeLoad,
  continueGesture,
  createEditorState,
  confirmPending,
  deleteSelected,
  endGesture,
  failLoad,
  failSave,
  finishSave,
  getEditorDecorations,
  getEditorStatus,
  getSelection,
  handlePlayerState,
  hasUnsavedChanges,
  pausePlayback,
  requestClearNotes,
  requestNavigation,
  requestPause,
  seek,
  selectTool,
  startGesture,
  startPlayback,
  startSave,
} from './chartEditorState.js';
import type { ChartEditorState, EditTool, Navigation, PendingAction } from './chartEditorState.js';
import {
  createEditorLayout,
  getLaneCenterXPx,
  getSeekTimeMs,
  getSeekXPx,
  toViewportRect,
} from './chartEditorLayout.js';
import type { PxRect } from './chartEditorLayout.js';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS, startScene } from '../config.js';
import type { ChartEditorSceneData } from '../config.js';
import {
  describeSelection,
  formatEditorTime,
  getGridTimesMs,
  getLaneAtX,
  getOpeningTimeMs,
  getTimeAtY,
  toVideoSec,
} from './editorTimeline.js';
import { clamp } from '../range.js';
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
import { setFittedText } from '../ui/fitText.js';
import { EDITOR_KEY_HINT_STYLE, addKeyHintColumn } from '../ui/keyHintView.js';
import { handleEachEventOnce, readMenuAction, requireKeyboard } from '../ui/menuInput.js';
import {
  EDITOR_COLORS,
  EDITOR_TYPE_SCALE,
  GAMEPLAY_DEPTH,
  INDICATOR,
  RADIUS,
  setTextColor,
  typeStyle,
} from '../ui/theme.js';

/** main.ts 가 곡 목록과 chart 로드·저장을 묶어 주입한다. */
export interface ChartCatalog {
  getSongs(): readonly Song[];
  loadChart(song: Song, difficulty: Difficulty): Promise<Chart>;
  /** 저장 뒤의 최신 곡을 돌려준다. 새 chart 를 만들었으면 곡 목록에도 이미 반영되어 있다. */
  saveChart(song: Song, chart: Chart): Promise<Song>;
}

interface Selection {
  song: Song;
  difficulty: Difficulty;
}

interface DifficultyItem {
  difficulty: Difficulty;
  text: Phaser.GameObjects.Text;
  underline: Phaser.GameObjects.Rectangle;
}

/** 현재 곡의 player. transport 는 준비 상태이고 draft 가 있을 때만 쓸 수 있다. */
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
  /** 저장하지 않은 변경이 있을 때 SAVE 오른쪽 위에 켜지는 점. */
  unsavedDot: Phaser.GameObjects.Arc;
  timeText: Phaser.GameObjects.Text;
  seekFill: Phaser.GameObjects.Rectangle;
  seekThumb: Phaser.GameObjects.Arc;
  seekMarks: Phaser.GameObjects.Graphics;
  playButton: Button;
  playerText: Phaser.GameObjects.Text;
  /** 보이는 구간의 시간 눈금. 시각이 바뀔 때마다 다시 그린다. */
  grid: Phaser.GameObjects.Graphics;
  /** 초 눈금 라벨. 보이는 구간에 들어가는 개수만큼 미리 만들어 두고 남는 것은 숨긴다. */
  gridLabels: Phaser.GameObjects.Text[];
  toolSwitch: SegmentedControl<EditTool>;
  selectionTitle: Phaser.GameObjects.Text;
  /** describeSelection 의 행 순서대로 둔 값 열 텍스트. */
  selectionValues: Phaser.GameObjects.Text[];
  deleteButton: Button;
  noteCountText: Phaser.GameObjects.Text;
  clearButton: Button;
  confirm: ConfirmDialog;
  /** 텍스처가 없으면 null 이고 그 장식은 생략한다. */
  dividerGlint: Phaser.GameObjects.Sprite | null;
}

/** 렌더링·zone·pointer 변환·EditorNoteLayer 가 함께 쓰는 배치 값의 유일한 출처다. */
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
/** `#mv-layer` 미리보기 사각형을 정하는 CSS custom property. 값은 CSS px 이다. */
const MV_FRAME_PROPERTIES: Record<keyof PxRect, string> = {
  leftPx: '--mv-frame-left',
  topPx: '--mv-frame-top',
  widthPx: '--mv-frame-width',
  heightPx: '--mv-frame-height',
};
const HAIRLINE_PX = 1;
const HAIRLINE_ALPHA = 0.45;
const PLAYHEAD_THICKNESS_PX = 2;
const PLAYHEAD_GLOW_HEIGHT_PX = 18;
const PLAYHEAD_GLOW_ALPHA = 0.14;
const PX_PER_SECOND = 400;
/** 채보를 열면 첫 노트를 playhead 위 이만큼에 둔다. 보이는 구간 안쪽이다. */
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
/** 진행 막대 위 노트 분포 눈금. 채보가 어디까지 차 있는지 한눈에 보이게 한다. */
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
/** 같은 섹션 안 요소 사이 간격 */
const TOOLS_ITEM_GAP_PX = 8;
/** 섹션 구분선 위아래 간격 */
const TOOLS_SECTION_GAP_PX = 16;
const SELECTION_VALUE_OFFSET_PX = 56;
const SELECTION_ROW_HEIGHT_PX = 24;
/** 값이 줄바꿈될 때도 행 높이와 같은 간격으로 내려가게 한다. */
const SELECTION_LINE_SPACING_PX = 6;
/** 열 폭을 넘는 hold TIME 이 두 줄이 되어도 아래 DELETE 가 움직이지 않도록 마지막 행에 두 줄 자리를 둔다. */
const SELECTION_LAST_ROW_MAX_LINES = 2;
const DIVIDER_GLINT_ID = 'R48';
const SNAP_THRESHOLD_PX = 8;
const PICK_TOLERANCE_PX = 12;
const SNAP_THRESHOLD_MS = (SNAP_THRESHOLD_PX / PX_PER_SECOND) * 1000;
const PICK_TOLERANCE_MS = (PICK_TOLERANCE_PX / PX_PER_SECOND) * 1000;

const NO_NOTES: readonly Note[] = [];

export class ChartEditorScene extends Phaser.Scene {
  /** 화면 상태의 유일한 원본. 바꿀 때는 setState 를 거친다. */
  private state: ChartEditorState = createEditorState();
  private noteLayer: { songId: string; layer: EditorNoteLayer } | null = null;
  /** 진행 막대 눈금을 마지막으로 그린 notes. 같은 배열이면 다시 그리지 않는다. */
  private seekMarkedNotes: readonly Note[] | null = null;
  private settings: Settings = DEFAULT_SETTINGS;
  /** 곡이 바뀔 때마다 새로 만든다. player 이벤트와 늦은 API 로드 결과는 시작 때 잡은 토큰이 아직 현재일 때만 반영한다. */
  private playerToken: object | null = null;
  private player: YouTubePlayer | null = null;
  private playerStatus: PlayerStatus = { kind: 'loading' };
  /** 곡 목록에서 들어올 때의 카테고리. 돌아갈 때 그대로 넘긴다. */
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
    this.state = createEditorState();
    this.noteLayer = null;
    this.seekMarkedNotes = null;
    this.playerStatus = { kind: 'loading' };
    this.listFilter = data.listFilter;
    // 같은 player 의 표시 사각형만 왼쪽 미리보기로 옮긴다. 창 크기가 바뀌면 캔버스를 따라간다.
    const onResize = (): void => this.placeVideoPreview();
    onResize();
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    const view = this.createView();
    keyboard.on(
      'keydown',
      handleEachEventOnce((event: KeyboardEvent) => this.handleKey(view, event)),
    );
    const onUpdate = (): void => this.advancePlayback(view);
    this.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    // 새로고침·탭 닫기로 미저장 draft 를 잃지 않도록 그때의 draft 로 경고 여부를 정한다.
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (hasUnsavedChanges(this.state)) {
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
      this.state = createEditorState();
      this.noteLayer = null;
      this.playerToken = null;
      this.player?.destroy();
      this.player = null;
    });

    // 곡 목록 화면이 같은 catalog 목록에서 고른 곡이므로 없으면 진입 경로의 오류다.
    const song = this.catalog.getSongs().find((listed) => listed.id === data.songId);
    if (song === undefined) {
      throw new Error(`Chart editor opened for a song not in the list: ${data.songId}`);
    }
    this.select(view, song, getAvailableDifficulties(song)[0] ?? 'easy');
  }

  /** 논리 좌표의 미리보기 사각형을 지금 캔버스가 보이는 위치·배율로 옮겨 `#mv-layer` 에 쓴다. */
  private placeVideoPreview(): void {
    const bounds = this.game.canvas.getBoundingClientRect();
    const rect = toViewportRect(
      LAYOUT.video,
      { leftPx: bounds.left, topPx: bounds.top, widthPx: bounds.width, heightPx: bounds.height },
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

  private createView(): EditorView {
    // 같은 depth 의 다른 요소보다 먼저 만들어 그 아래에 그린다.
    this.addBackdrop();
    this.addRule(0, LAYOUT.topBar.heightPx, GAME_WIDTH);
    this.addRule(0, LAYOUT.bottomBar.topYPx, GAME_WIDTH);
    // 높이는 내용을 쌓은 뒤 createToolArea 가 정한다.
    const toolSurface = this.add
      .rectangle(
        LAYOUT.tools.leftPx,
        LAYOUT.tools.topYPx,
        LAYOUT.tools.widthPx,
        0,
        EDITOR_COLORS.surface,
      )
      .setOrigin(0, 0)
      .setRounded(RADIUS.smallPx);
    const topCenterYPx = LAYOUT.topBar.centerYPx;
    const back = createAuxiliaryButton(this, LAYOUT.video.leftPx, topCenterYPx, {
      label: 'BACK',
      onActivate: () => this.navigate(view, { kind: 'leave' }),
    });
    const previousSong = createCenteredEditorButton(
      this,
      back.x + back.width + BUTTON_GAP_PX,
      topCenterYPx,
      { variant: 'quiet', label: '◀', onActivate: () => this.moveSong(view, -1) },
    );
    createCenteredEditorButton(
      this,
      previousSong.x + previousSong.width + BUTTON_GAP_PX,
      topCenterYPx,
      {
        variant: 'quiet',
        label: '▶',
        onActivate: () => this.moveSong(view, 1),
      },
    );
    const saveButton = createCenteredEditorButton(this, 0, topCenterYPx, {
      variant: 'secondary',
      label: 'SAVE',
      onActivate: () => this.saveDraft(view),
      widthPx: SAVE_WIDTH_PX,
      heightPx: SAVE_HEIGHT_PX,
    }).alignX(LAYOUT.tools.leftPx + LAYOUT.tools.widthPx, 1);
    const statusRightXPx = saveButton.x - STATUS_GAP_PX;
    const difficulties = this.createDifficultyItems(topCenterYPx, (difficulty) =>
      this.selectDifficulty(view, difficulty),
    );
    const lastDifficulty = difficulties[difficulties.length - 1];
    if (lastDifficulty === undefined) {
      throw new Error('Chart editor needs at least one difficulty');
    }
    const statusLeftXPx = lastDifficulty.text.x + lastDifficulty.text.width + STATUS_GAP_PX;
    const transportYPx = LAYOUT.bottomBar.centerYPx;
    const view: EditorView = {
      songTitle: this.add
        .text(
          LAYOUT.title.leftPx,
          topCenterYPx,
          '',
          typeStyle(EDITOR_TYPE_SCALE.title, EDITOR_COLORS.textPrimary),
        )
        .setOrigin(0, 0.5),
      difficulties,
      statusText: this.add
        .text(statusRightXPx, topCenterYPx, '', {
          ...typeStyle(EDITOR_TYPE_SCALE.meta, EDITOR_COLORS.textSecondary),
          align: 'right',
          wordWrap: { width: statusRightXPx - statusLeftXPx, useAdvancedWrap: true },
          maxLines: STATUS_MAX_LINES,
        })
        .setOrigin(1, 0.5),
      saveButton,
      unsavedDot: this.add
        .circle(
          saveButton.x + saveButton.width,
          saveButton.y,
          UNSAVED_DOT_RADIUS_PX,
          EDITOR_COLORS.highlight,
        )
        .setStrokeStyle(UNSAVED_DOT_RING_PX, EDITOR_COLORS.background)
        .setVisible(false),
      timeText: this.add
        .text(
          LAYOUT.timeXPx,
          transportYPx,
          '',
          typeStyle(EDITOR_TYPE_SCALE.body, EDITOR_COLORS.textPrimary),
        )
        .setOrigin(0, 0.5),
      seekFill: this.add
        .rectangle(
          LAYOUT.seek.leftPx,
          transportYPx,
          0,
          SEEK_TRACK_HEIGHT_PX,
          EDITOR_COLORS.selected,
        )
        .setOrigin(0, 0.5)
        .setDepth(GAMEPLAY_DEPTH.text),
      seekMarks: this.add.graphics().setDepth(GAMEPLAY_DEPTH.lanePanel),
      seekThumb: this.add
        .circle(LAYOUT.seek.leftPx, transportYPx, SEEK_THUMB_RADIUS_PX, EDITOR_COLORS.highlight)
        .setDepth(GAMEPLAY_DEPTH.text),
      playButton: createCenteredEditorButton(this, LAYOUT.playLeftPx, transportYPx, {
        variant: 'quiet',
        label: 'PLAY',
        onActivate: () => this.togglePlayback(view),
      }),
      playerText: this.add.text(LAYOUT.playerText.leftPx, LAYOUT.playerText.topYPx, '', {
        ...typeStyle(EDITOR_TYPE_SCALE.meta, EDITOR_COLORS.textSecondary),
        wordWrap: { width: LAYOUT.playerText.widthPx, useAdvancedWrap: true },
      }),
      grid: this.add.graphics().setDepth(GAMEPLAY_DEPTH.laneDivider),
      gridLabels: Array.from({ length: GRID_LABEL_COUNT }, () =>
        this.add
          .text(0, 0, '', typeStyle(EDITOR_TYPE_SCALE.meta, EDITOR_COLORS.textSecondary))
          .setOrigin(1, 0.5)
          .setDepth(GAMEPLAY_DEPTH.laneDivider)
          .setVisible(false),
      ),
      ...this.createToolArea(toolSurface, {
        onSelectTool: (tool) => this.setState(view, selectTool(this.state, tool)),
        onDelete: () => this.setState(view, deleteSelected(this.state)),
        onClear: () => this.setState(view, requestClearNotes(this.state)),
      }),
      confirm: new ConfirmDialog(this, {
        onAccept: () => this.confirm(view),
        onCancel: () => this.setState(view, cancelPending(this.state)),
      }),
    };
    this.createTimeline(view);
    this.createSeekBar(view);
    // 영상 아래 빈 열의 바닥에 단축키 목록을 레인 바닥선과 맞춰 둔다.
    addKeyHintColumn(
      this,
      this.i18n.t('chartEditor.hint'),
      EDITOR_KEY_HINT_STYLE,
      LAYOUT.hint.leftPx,
      LAYOUT.timeline.bottomYPx,
    );
    return view;
  }

  /**
   * 캔버스에서 영상 미리보기 사각형만 비우고 나머지를 불투명 바탕으로 칠한다.
   * 비운 자리로 뒤의 DOM 영상만 보인다.
   */
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
      this.add.rectangle(xPx, yPx, widthPx, heightPx, EDITOR_COLORS.background).setOrigin(0, 0);
    });
  }

  /** 입력을 받지 않는 얇은 구획선이다. */
  private addRule(leftXPx: number, yPx: number, rightXPx: number): void {
    this.add
      .rectangle(
        leftXPx,
        yPx,
        rightXPx - leftXPx,
        HAIRLINE_PX,
        EDITOR_COLORS.border,
        HAIRLINE_ALPHA,
      )
      .setOrigin(0, 0.5);
  }

  private addSectionLabel(label: string, yPx: number): Phaser.GameObjects.Text {
    return this.add.text(
      TOOLS_CONTENT_LEFT_PX,
      yPx,
      label,
      typeStyle(EDITOR_TYPE_SCALE.meta, EDITOR_COLORS.textSecondary),
    );
  }

  /**
   * 레인 옆 도구 영역을 입력 도구 → 선택 노트 정보 + DELETE → 노트 개수 + CLEAR 순으로
   * 위에서부터 실제 높이로 쌓고 표면 높이를 내용에 맞춘다.
   * 선택 정보는 선택 유무와 무관하게 같은 높이를 잡아 두어, 선택이 바뀌어도 아래 요소가 움직이지 않는다.
   */
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
    this.addRule(TOOLS_CONTENT_LEFT_PX, selectionRuleYPx, TOOLS_CONTENT_RIGHT_PX);
    // 제목 문구(선택한 노트 / 선택된 노트 없음)는 renderPanel 이 넣는다.
    const selectionTitle = this.addSectionLabel('', selectionRuleYPx + TOOLS_SECTION_GAP_PX);
    const rowsTopYPx = selectionTitle.y + selectionTitle.height + TOOLS_ITEM_GAP_PX;
    const valueLeftXPx = TOOLS_CONTENT_LEFT_PX + SELECTION_VALUE_OFFSET_PX;
    const selectionValues = describeSelection(null).map(({ label }, index) => {
      const rowYPx = rowsTopYPx + SELECTION_ROW_HEIGHT_PX * index;
      this.add.text(
        TOOLS_CONTENT_LEFT_PX,
        rowYPx,
        label,
        typeStyle(EDITOR_TYPE_SCALE.body, EDITOR_COLORS.textSecondary),
      );
      return this.add.text(valueLeftXPx, rowYPx, '', {
        ...typeStyle(EDITOR_TYPE_SCALE.body, EDITOR_COLORS.textPrimary),
        lineSpacing: SELECTION_LINE_SPACING_PX,
        wordWrap: { width: TOOLS_CONTENT_RIGHT_PX - valueLeftXPx, useAdvancedWrap: true },
      });
    });
    const lastValue = selectionValues[selectionValues.length - 1];
    if (lastValue === undefined) {
      throw new Error('Selection info needs at least one row');
    }
    // 같은 style 의 최대 줄 수 높이를 재고 비워 둔다. 실제 문구는 renderPanel 이 넣는다.
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
    this.addRule(TOOLS_CONTENT_LEFT_PX, countRuleYPx, TOOLS_CONTENT_RIGHT_PX);
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
        typeStyle(EDITOR_TYPE_SCALE.meta, EDITOR_COLORS.textSecondary),
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
        getAtlasPresentation(this.celestial, DIVIDER_GLINT_ID),
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
          typeStyle(EDITOR_TYPE_SCALE.control, EDITOR_COLORS.textPrimary),
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
          EDITOR_COLORS.selected,
        )
        .setOrigin(0, 0);
      xPx += text.width + DIFFICULTY_GAP_PX;
      return { difficulty, text, underline };
    });
  }

  private createTimeline(view: EditorView): void {
    const { lanes, timeline } = LAYOUT;
    [...LANES, LANES.length].forEach((boundary) => {
      const isEdge = boundary === 0 || boundary === LANES.length;
      this.add
        .rectangle(
          lanes.leftPx + lanes.laneWidthPx * boundary,
          timeline.topYPx,
          LANE_LINE_WIDTH_PX,
          TIMELINE_HEIGHT_PX,
          EDITOR_COLORS.border,
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
        EDITOR_COLORS.selected,
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
        EDITOR_COLORS.highlight,
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
          const targetMs = getTimeAtY(
            timeline.playheadYPx - deltaY,
            this.state.currentTimeMs,
            timeline.playheadYPx,
            PX_PER_SECOND,
          );
          this.setState(view, seek(this.state, targetMs));
        },
      )
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (pointer: Phaser.Input.Pointer) =>
        this.setState(
          view,
          startGesture(this.state, this.getPointerLane(pointer), this.getPointerTimeMs(pointer), {
            snapThresholdMs: SNAP_THRESHOLD_MS,
            pickToleranceMs: PICK_TOLERANCE_MS,
          }),
        ),
      );
    // drag 중에는 pointer 가 timeline 밖으로 나가도 따라간다. lane·시각은 변환 함수가 제한한다.
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) =>
      this.setState(
        view,
        continueGesture(
          this.state,
          this.getPointerLane(pointer),
          this.getPointerTimeMs(pointer),
          SNAP_THRESHOLD_MS,
        ),
      ),
    );
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) =>
      this.setState(view, endGesture(this.state, this.getPointerTimeMs(pointer))),
    );
  }

  private getPointerLane(pointer: Phaser.Input.Pointer): Lane {
    return getLaneAtX(pointer.x, LAYOUT.lanes.leftPx, LAYOUT.lanes.laneWidthPx);
  }

  private getPointerTimeMs(pointer: Phaser.Input.Pointer): number {
    return getTimeAtY(
      pointer.y,
      this.state.currentTimeMs,
      LAYOUT.timeline.playheadYPx,
      PX_PER_SECOND,
    );
  }

  /**
   * 화면 상태 반영의 유일한 경로. 재생이 멈추는 전이는 어떤 입력에서 왔든 player 도 멈춘다.
   * player 가 스스로 알린 정지 뒤에 다시 부르는 pause 는 무해하다.
   */
  private setState(view: EditorView, next: ChartEditorState): void {
    const previous = this.state;
    if (next === previous) {
      return;
    }
    this.state = next;
    if (
      previous.transport.kind !== 'paused' &&
      next.transport.kind === 'paused' &&
      this.playerStatus.kind === 'ready'
    ) {
      this.playerStatus.player.pause();
    }
    if (previous.phase !== next.phase) {
      this.render(view);
      return;
    }
    if (previous.saveResult !== next.saveResult) {
      this.renderStatus(view);
    }
    if (previous.pending !== next.pending) {
      this.renderConfirm(view);
    }
    if (previous.saveResult !== next.saveResult || previous.pending !== next.pending) {
      this.renderDecorations(view);
    }
    if (previous.tool !== next.tool) {
      this.renderPanel(view);
    }
    if (previous.transport !== next.transport) {
      this.renderTransport(view);
    }
    if (previous.currentTimeMs !== next.currentTimeMs) {
      this.renderTimeline(view);
    }
  }

  private saveDraft(view: EditorView): void {
    const { state, request } = startSave(this.state);
    this.setState(view, state);
    if (request === null) {
      return;
    }
    void this.catalog.saveChart(request.song, request.chart).then(
      (song) => this.setState(view, finishSave(this.state, request, song)),
      (error: unknown) => {
        console.error(
          `Failed to save chart for song ${request.song.id} difficulty ${request.chart.difficulty}`,
          error,
        );
        this.setState(view, failSave(this.state, request.token));
      },
    );
  }

  private createSeekBar(view: EditorView): void {
    const { seek: seekBar, bottomBar } = LAYOUT;
    this.add
      .rectangle(
        seekBar.leftPx,
        bottomBar.centerYPx,
        seekBar.widthPx,
        SEEK_TRACK_HEIGHT_PX,
        EDITOR_COLORS.border,
        SEEK_TRACK_ALPHA,
      )
      .setOrigin(0, 0.5);
    const zone = this.add
      .zone(seekBar.leftPx, bottomBar.centerYPx, seekBar.widthPx, SEEK_HIT_HEIGHT_PX)
      .setOrigin(0, 0.5)
      .setInteractive({ cursor: DRAG_CURSOR });
    this.input.setDraggable(zone);
    const seekToPointer = (pointer: Phaser.Input.Pointer): void => {
      const selection = getSelection(this.state);
      if (selection === null) {
        return;
      }
      this.setState(view, seek(this.state, getSeekTimeMs(LAYOUT, pointer.x, selection.song)));
    };
    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, seekToPointer);
    zone.on(Phaser.Input.Events.GAMEOBJECT_DRAG, seekToPointer);
  }

  /** 곡 목록은 바뀔 수 있으므로 고를 때마다 다시 읽는다. */
  private moveSong(view: EditorView, delta: number): void {
    const selection = getSelection(this.state);
    if (this.state.pending !== null || selection === null) {
      return;
    }
    const song = this.findListedSong(selection.song, delta);
    if (song === undefined) {
      this.setState(view, clearSelection(this.state));
      return;
    }
    this.navigate(view, { kind: 'select', song, difficulty: selection.difficulty });
  }

  private selectDifficulty(view: EditorView, difficulty: Difficulty): void {
    const selection = getSelection(this.state);
    if (this.state.pending !== null || selection === null) {
      return;
    }
    const song = this.findListedSong(selection.song, 0);
    if (song === undefined) {
      this.setState(view, clearSelection(this.state));
      return;
    }
    this.navigate(view, { kind: 'select', song, difficulty });
  }

  /** 현재 곡에서 delta 만큼 떨어진 목록의 곡. 끝에서 멈추며, 목록이 비면 없다. */
  private findListedSong(current: Song, delta: number): Song | undefined {
    const songs = this.catalog.getSongs();
    if (songs.length === 0) {
      return undefined;
    }
    const index = songs.findIndex((song) => song.id === current.id);
    if (index === -1) {
      throw new Error(`Selected song is not in the song list: ${current.id}`);
    }
    return songs[clamp(index + delta, 0, songs.length - 1)];
  }

  /** 곡·난이도 변경과 나가기는 모두 여기를 거친다. 미저장 변경이 있으면 확인 바가 대신 열린다. */
  private navigate(view: EditorView, navigation: Navigation): void {
    const { state, proceed } = requestNavigation(this.state, navigation);
    this.setState(view, state);
    if (proceed !== null) {
      this.proceed(view, proceed);
    }
  }

  private confirm(view: EditorView): void {
    // 보류한 선택을 적용하며 다시 그릴 때 확인 팝업이 닫혀 보이도록 먼저 비운다.
    const { state, proceed } = confirmPending(this.state);
    this.setState(view, state);
    if (proceed !== null) {
      this.proceed(view, proceed);
    }
  }

  private proceed(view: EditorView, navigation: Navigation): void {
    if (navigation.kind === 'leave') {
      startScene(this, 'chartEditorSelect', {
        focusedSongId: getSelection(this.state)?.song.id ?? null,
        filter: this.listFilter,
      });
      return;
    }
    this.select(view, navigation.song, navigation.difficulty);
  }

  private select(view: EditorView, song: Song, difficulty: Difficulty): void {
    // 난이도만 바뀌면 같은 음원이므로 player 를 유지한다.
    if (getSelection(this.state)?.song.id !== song.id) {
      this.replacePlayer(view, song);
    }
    this.setState(view, applySelection(this.state, song, difficulty));
    const { phase, selectionToken: token } = this.state;
    if (phase.kind !== 'loading') {
      return;
    }
    if (token === null) {
      throw new Error('Loading a chart without a selection token');
    }
    void this.catalog.loadChart(song, difficulty).then(
      (chart) => {
        const loaded = completeLoad(this.state, token, chart);
        if (loaded === this.state || loaded.phase.kind !== 'editing') {
          return;
        }
        this.setState(
          view,
          seek(loaded, getOpeningTimeMs(loaded.phase.draft.notes, OPENING_LEAD_MS, song)),
        );
      },
      (error: unknown) => {
        console.error(`Failed to load chart for song ${song.id} difficulty ${difficulty}`, error);
        this.setState(view, failLoad(this.state, token));
      },
    );
  }

  private replacePlayer(view: EditorView, song: Song): void {
    const token = {};
    this.playerToken = token;
    this.player?.destroy();
    this.player = null;
    this.playerStatus = { kind: 'loading' };
    void this.createPlayer(view, song, token);
  }

  private async createPlayer(view: EditorView, song: Song, token: object): Promise<void> {
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
          this.playerStatus = { kind: 'ready', player, timeSource };
          this.renderTransport(view);
        },
        onStateChange: (state) => {
          if (this.playerToken === token) {
            this.handlePlayerStateChange(view, timeSource, state);
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
          this.setState(view, pausePlayback(this.state));
          this.renderTransport(view);
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
    this.playerStatus = { kind: 'error', message };
    this.renderTransport(view);
  }

  private handlePlayerStateChange(
    view: EditorView,
    timeSource: YouTubeTimeSource,
    state: YouTubePlayerState,
  ): void {
    timeSource.handleStateChange(state);
    this.setState(view, handlePlayerState(this.state, state));
  }

  /** PLAY/PAUSE 버튼과 Space 가 함께 쓴다. */
  private togglePlayback(view: EditorView): void {
    if (this.state.transport.kind !== 'paused') {
      this.setState(view, requestPause(this.state));
      return;
    }
    if (!canStartPlayback(this.state) || this.playerStatus.kind !== 'ready') {
      return;
    }
    const { phase } = this.state;
    if (phase.kind !== 'editing') {
      throw new Error('Playback can start only while editing a draft');
    }
    const { player, timeSource } = this.playerStatus;
    const { offsetMs } = phase.draft;
    const clock = new RhythmClock(timeSource, 0, offsetMs);
    clock.start(0, 0);
    const next = startPlayback(this.state, clock);
    player.requestPlay(toVideoSec(next.currentTimeMs, offsetMs));
    this.setState(view, next);
  }

  private advancePlayback(view: EditorView): void {
    const { transport } = this.state;
    if (transport.kind !== 'playing') {
      return;
    }
    if (this.playerStatus.kind !== 'ready') {
      throw new Error('Transport is playing without a ready player');
    }
    this.playerStatus.timeSource.sync();
    this.setState(view, advancePlayback(this.state, transport.clock.getTimeMs()));
  }

  private renderTransport(view: EditorView): void {
    view.playButton.setLabel(this.state.transport.kind === 'paused' ? 'PLAY' : 'PAUSE');
    view.playerText.setText(this.playerStatus.kind === 'error' ? this.playerStatus.message : '');
  }

  private render(view: EditorView): void {
    const selection = getSelection(this.state);
    this.renderSongTitle(view, selection?.song.title ?? '');
    view.difficulties.forEach((item) => this.renderDifficulty(item, selection));
    this.renderStatus(view);
    this.renderConfirm(view);
    this.renderPanel(view);
    this.renderTransport(view);
    this.renderTimeline(view);
    this.renderDecorations(view);
  }

  /** 표시 폭을 넘는 곡명은 끝을 줄인다. 표시 문자열만 바꾸며 곡 데이터는 그대로다. */
  private renderSongTitle(view: EditorView, title: string): void {
    setFittedText(view.songTitle, title, LAYOUT.title.maxWidthPx);
  }

  private renderStatus(view: EditorView): void {
    view.statusText.setText(this.getStatusMessage());
    view.saveButton.setEnabled(canSave(this.state));
    view.unsavedDot.setVisible(hasUnsavedChanges(this.state));
  }

  private renderDecorations(view: EditorView): void {
    view.dividerGlint?.setVisible(getEditorDecorations(this.state).isDividerGlintVisible);
  }

  private renderConfirm(view: EditorView): void {
    const { pending, phase } = this.state;
    if (pending === null) {
      view.confirm.hide();
      return;
    }
    const labels = CONFIRM_LABELS[pending.kind];
    const noteCount = phase.kind === 'editing' ? phase.draft.notes.length : 0;
    view.confirm.show({
      title: this.i18n.t(labels.titleKey),
      body: this.i18n.t(labels.bodyKey, { noteCount }),
      cancelLabel: 'CANCEL',
      acceptLabel: labels.accept,
      acceptTone: labels.acceptTone,
    });
  }

  private renderPanel(view: EditorView): void {
    const { phase, tool } = this.state;
    view.toolSwitch.render(tool);
    const draft = phase.kind === 'editing' ? phase.draft : null;
    const selected = draft?.selected ?? null;
    view.selectionTitle.setText(
      this.i18n.t(selected === null ? 'chartEditor.noSelection' : 'chartEditor.selectionSection'),
    );
    describeSelection(selected).forEach(({ value }, index) => {
      const valueText = view.selectionValues[index];
      if (valueText === undefined) {
        throw new Error(`Missing selection value text for row ${index}`);
      }
      valueText.setText(value);
    });
    view.deleteButton.setEnabled(selected !== null);
    view.noteCountText.setText(
      draft === null ? '' : this.i18n.t('chartEditor.noteCount', { count: draft.notes.length }),
    );
    view.clearButton.setEnabled(draft !== null && draft.notes.length > 0);
  }

  private renderDifficulty(
    { difficulty, text, underline }: DifficultyItem,
    selection: Selection | null,
  ): void {
    const hasChart =
      selection !== null && getAvailableDifficulties(selection.song).includes(difficulty);
    setTextColor(text, hasChart ? EDITOR_COLORS.textPrimary : EDITOR_COLORS.textSecondary);
    underline.setVisible(selection?.difficulty === difficulty);
  }

  private getStatusMessage(): string {
    const status = getEditorStatus(this.state);
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

  private renderTimeline(view: EditorView): void {
    const { phase, currentTimeMs } = this.state;
    const selection = getSelection(this.state);
    if (selection === null) {
      view.timeText.setText('');
      view.seekFill.setSize(0, SEEK_TRACK_HEIGHT_PX);
      view.seekThumb.setVisible(false);
      view.grid.clear();
      view.gridLabels.forEach((label) => label.setVisible(false));
      view.seekMarks.clear();
      this.seekMarkedNotes = null;
      this.noteLayer?.layer.destroy();
      this.noteLayer = null;
      return;
    }
    view.timeText.setText(
      `${formatEditorTime(currentTimeMs)} / ${formatEditorTime(selection.song.gameEndMs)}`,
    );
    const thumbXPx = getSeekXPx(LAYOUT, currentTimeMs, selection.song);
    view.seekFill.setSize(thumbXPx - LAYOUT.seek.leftPx, SEEK_TRACK_HEIGHT_PX);
    view.seekThumb.setX(thumbXPx).setVisible(true);
    this.renderGrid(view, currentTimeMs);
    const notes = phase.kind === 'editing' ? phase.draft.notes : NO_NOTES;
    this.renderSeekMarks(view, notes, selection.song);
    this.getNoteLayer(selection.song).render(
      notes,
      phase.kind === 'editing' ? phase.draft.selected : null,
      currentTimeMs,
    );
  }

  private renderSeekMarks(view: EditorView, notes: readonly Note[], song: Song): void {
    if (notes === this.seekMarkedNotes) {
      return;
    }
    this.seekMarkedNotes = notes;
    const { seekMarks } = view;
    seekMarks.clear().lineStyle(HAIRLINE_PX, EDITOR_COLORS.selected, SEEK_MARK_ALPHA);
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

  /** 보이는 구간의 0.25초 눈금선과 초 라벨. 초 눈금은 더 밝게 그린다. */
  private renderGrid(view: EditorView, currentTimeMs: number): void {
    const { lanes, timeline } = LAYOUT;
    const toY = (timeMs: number): number =>
      getNoteY(timeMs, currentTimeMs, timeline.playheadYPx, PX_PER_SECOND);
    const fromMs = getTimeAtY(
      timeline.bottomYPx,
      currentTimeMs,
      timeline.playheadYPx,
      PX_PER_SECOND,
    );
    const toMs = getTimeAtY(timeline.topYPx, currentTimeMs, timeline.playheadYPx, PX_PER_SECOND);
    const { grid } = view;
    grid.clear();
    for (const timeMs of getGridTimesMs(fromMs, toMs, GRID_MINOR_STEP_MS)) {
      const isMajor = timeMs % GRID_MAJOR_STEP_MS === 0;
      grid
        .lineStyle(
          HAIRLINE_PX,
          EDITOR_COLORS.selected,
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
        .setText(`${timeMs / 1000}s`)
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
    this.noteLayer = { songId: song.id, layer };
    return layer;
  }

  private handleKey(view: EditorView, event: KeyboardEvent): void {
    const action = readMenuAction(event);
    if (this.state.pending !== null && action === 'confirm') {
      this.confirm(view);
    } else if (event.code === 'Space') {
      // 누르고 있는 동안의 반복 입력으로 재생과 일시정지가 번갈아 바뀌지 않게 한다.
      if (!event.repeat) {
        this.togglePlayback(view);
      }
    } else if (event.code === 'Delete' || event.code === 'Backspace') {
      this.setState(view, deleteSelected(this.state));
    } else if (action === 'back') {
      if (this.state.pending === null) {
        this.navigate(view, { kind: 'leave' });
      } else {
        this.setState(view, cancelPending(this.state));
      }
    }
  }
}
