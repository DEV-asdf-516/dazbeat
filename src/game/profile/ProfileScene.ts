import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { ACHIEVEMENTS, ACHIEVEMENT_SETS, findAchievement } from '../../data/achievements.js';
import type {
  AchievementCategory,
  AchievementDefinition,
  AchievementId,
  AchievementSet,
} from '../../data/achievements.js';
import { NICKNAME_MAX_LENGTH } from '../../data/nickname.js';
import type { AchievementStatus, ProfileStats } from '../../data/profile.js';
import { requireDefined } from '../../invariant.js';
import { isShallowEqual } from '../../shallowEqual.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import {
  addCelestialSprite,
  applyCelestialPresentation,
  queueCelestialTextures,
  setCelestialLoopActive,
} from '../celestial/celestialSprites.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../config.js';
import { SCENE_KEYS, exitScene } from '../sceneRoutes.js';
import type { SceneRequest } from '../sceneRoutes.js';
import { STAYING } from '../sceneExit.js';
import type { SceneExit } from '../sceneExit.js';
import { getAchievementEmblemTexture } from '../ui/achievementEmblem.js';
import { createHeaderAuxiliaryButtons } from '../ui/auxiliaryButton.js';
import { Button } from '../ui/Button.js';
import { MenuSceneChrome, getMenuSceneTextureUses } from '../ui/MenuSceneChrome.js';
import { readMenuAction } from '../ui/menuInput.js';
import type { MenuAction } from '../ui/menuInput.js';
import { HOVER_CURSOR } from '../ui/cursor.js';
import { queueImageLoads } from '../ui/imageLoad.js';
import { addHairline } from '../ui/hairline.js';
import { bindHoverTarget } from '../ui/hoverTarget.js';
import { SoundEffects, queueSoundEffects } from '../ui/soundEffects.js';
import { MENU_KEY_HINT_STYLE, addKeyHintRow } from '../ui/keyHintView.js';
import { TextInput } from '../ui/TextInput.js';
import { LOADING_STAR_ID } from '../ui/LoadingStar.js';
import { NoticeText } from '../ui/NoticeText.js';
import {
  CELESTIAL_COLORS,
  COLORS,
  LIST_ROW,
  MOTION,
  RADIUS,
  SCREEN_LAYOUT,
  STATUS_COLORS,
  TYPE_SCALE,
  setTextColor,
  setTextWeight,
  textStyle,
} from '../ui/theme.js';
import { TextTabs } from '../ui/TextTabs.js';
import type { TextTabsStyle } from '../ui/TextTabs.js';
import { ProfileController } from './ProfileController.js';
import type { ProfileDeps } from './ProfileController.js';
import { getChoiceAppearance, getCollectionRows, isEarned } from './profileState.js';
import type { LoadedProfileState, ProfileHover, ProfileState, SummaryTab } from './profileState.js';

// 획득 날짜와 대표 컬렉션은 시안의 champagne 으로 칭호처럼 보인다.
const FEATURED_COLOR = 0xe8d6b1;
const LOCKED_ALPHA = 0.22;
const LEFT_X_PX = SCREEN_LAYOUT.leftXPx;
const NOTICE_Y_PX = 184;
const NOTICE_LINE_GAP_PX = 48;
const NICKNAME_CENTER_Y_PX = 196;
const NICKNAME_FIELD_WIDTH_PX = 480;
const NICKNAME_FIELD_HEIGHT_PX = 56;
const NICKNAME_FIELD_TOP_Y_PX = NICKNAME_CENTER_Y_PX - NICKNAME_FIELD_HEIGHT_PX / 2;
const NICKNAME_FIELD_PADDING_X_PX = 20;
// 입력란이 글자 수를 덮지 않게 오른쪽을 비워 둔다.
const NICKNAME_COUNT_RESERVE_PX = 72;
const NICKNAME_FIELD_IDLE_FILL_ALPHA = 0.55;
const NICKNAME_FIELD_EDIT_FILL_ALPHA = 0.88;
type NicknameFieldLook = 'idle' | 'editing' | 'invalid';
const NICKNAME_FIELD_LOOKS: Record<
  NicknameFieldLook,
  { readonly fillAlpha: number; readonly borderColor: number; readonly borderAlpha: number }
> = {
  idle: {
    fillAlpha: NICKNAME_FIELD_IDLE_FILL_ALPHA,
    borderColor: CELESTIAL_COLORS.border,
    borderAlpha: 0.6,
  },
  editing: {
    fillAlpha: NICKNAME_FIELD_EDIT_FILL_ALPHA,
    borderColor: CELESTIAL_COLORS.selected,
    borderAlpha: 1,
  },
  invalid: {
    fillAlpha: NICKNAME_FIELD_EDIT_FILL_ALPHA,
    borderColor: STATUS_COLORS.danger,
    borderAlpha: 1,
  },
};
const NICKNAME_COUNT_ALPHA = 0.7;
const FEATURED_CENTER_Y_PX = 256;
const FEATURED_EMBLEM_SIZE_PX = 40;
const FEATURED_NAME_GAP_PX = 12;
const PEN_TEXTURE_KEY = 'ui:profile-pen';
const PEN_PATH = '/assets/ui/profile/pen.png';
const PEN_SIZE_PX = 24;
const GROUP_TITLE_WEIGHT = 700;
const SUMMARY_TABS: readonly SummaryTab[] = ['stats', 'collection'];
const SUMMARY_TAB_Y_PX = 332;
const ROWS_TOP_Y_PX = 380;
const ROW_HEIGHT_PX = 90;
const SET_ROW_WIDTH_PX = 900;
const VALUE_RIGHT_X_PX = LEFT_X_PX + 800;
const SET_NODE_X_PX = LEFT_X_PX - LIST_ROW.nodeOffsetXPx;
const SET_ROW_SHIFT_PX = 12;
const SET_FILL = {
  ...LIST_ROW.selectedFill,
  xPx: LEFT_X_PX - 72,
  widthPx: SET_ROW_WIDTH_PX + 72 + 16,
} as const;
const SET_NODE_IDLE_ID = 'R15';
const SET_NODE_HOVER_ID = 'R16';
const SET_NODE_SELECTED_ID = 'R17';
const CHEVRON_CENTER_X_PX = LEFT_X_PX + 884;
const CHEVRON_HALF_HEIGHT_PX = 9;
const CHEVRON_STROKE_PX = 2;
const FOCUS_STAR_ID = 'R49';
const FOCUS_STAR_GAP_PX = 24;
const SELECTED_HALO_ID = 'R29';
const DIVIDER_GLINT_ID = 'R48';
const TAB_Y_PX = 176;
const TAB_GAP_PX = 48;
const UNSELECTED_WEIGHT = 400;
const TAB_STYLE: TextTabsStyle = {
  type: {
    sizePx: TYPE_SCALE.primary.sizePx,
    weight: UNSELECTED_WEIGHT,
  },
  selectedWeight: TYPE_SCALE.primary.weight,
  gapPx: TAB_GAP_PX,
  normalColor: COLORS.textSecondary,
};
const SET_NODE_IDS = {
  selected: SET_NODE_SELECTED_ID,
  emphasized: SET_NODE_HOVER_ID,
  normal: SET_NODE_IDLE_ID,
} as const;
const ROW_LABEL_WEIGHT = 500;
const GRID_TOP_Y_PX = 256;
const GRID_EMBLEM_SIZE_PX = 68;
const GRID_CELL_PX = 82;
const GRID_CATEGORY_STRIDE_PX = 138;
const GRID_EMBLEM_OFFSET_Y_PX = 40;
const HALO_SIZE_PX = 100;
const NEW_LABEL_TYPE = {
  sizePx: 14,
  weight: 700,
} as const;
const DETAIL_X_PX = 1240;
const DETAIL_WIDTH_PX = 520;
const DETAIL_EMBLEM_SIZE_PX = 200;
const DETAIL_EMBLEM_CENTER_Y_PX = 330;
// 선택 후광 그림의 고리가 엠블럼 틀 바로 바깥을 돌게 하는 크기.
const DETAIL_FEATURED_HALO_SIZE_PX = 264;
const DETAIL_FEATURED_Y_PX = 444;
const DETAIL_NAME_Y_PX = 476;
const DETAIL_CONDITION_Y_PX = 536;
const DETAIL_PROGRESS_Y_PX = 610;
const DETAIL_STATUS_Y_PX = 652;
const DETAIL_NOTE_Y_PX = 694;
const DETAIL_RULE_Y_PX = 744;
const DETAIL_BUTTON_TOP_Y_PX = 768;
const DETAIL_BUTTON_HEIGHT_PX = 64;
// 테두리만 있으면 배경 위에서 비어 보여 키 안내 칸처럼 어두운 면을 채운다.
const UNEQUIP_BUTTON_COLORS = {
  fill: CELESTIAL_COLORS.surface,
  hoverFill: CELESTIAL_COLORS.surfaceHover,
  border: COLORS.textMuted,
} as const;
const DETAIL_FAILURE_GAP_PX = 16;
const STAT_FIELDS: readonly (keyof ProfileStats)[] = [
  'playCount',
  'clearedSongCount',
  'sChartCount',
  'fullComboChartCount',
  'allPerfectChartCount',
];

interface RowView {
  label: Phaser.GameObjects.Text;
  value: Phaser.GameObjects.Text;
}

interface SetRowView {
  set: AchievementSet;
  fill: Phaser.GameObjects.Rectangle;
  node: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
  hitArea: Phaser.GameObjects.Zone;
}

interface CellView {
  id: AchievementId;
  image: Phaser.GameObjects.Image;
  newLabel: Phaser.GameObjects.Text;
}

interface SetGridView {
  container: Phaser.GameObjects.Container;
  groupTitles: readonly {
    category: AchievementCategory;
    row: readonly AchievementDefinition[];
    text: Phaser.GameObjects.Text;
  }[];
  cells: readonly CellView[];
}

interface ProfileView {
  title: Phaser.GameObjects.Text;
  notice: Phaser.GameObjects.Container;
  noticeLines: readonly Phaser.GameObjects.Text[];
  loading: NoticeText;
  summary: Phaser.GameObjects.Container;
  nicknameField: Phaser.GameObjects.Graphics;
  nicknameHitArea: Phaser.GameObjects.Zone;
  nickname: Phaser.GameObjects.Text;
  nicknameCount: Phaser.GameObjects.Text;
  pen: Phaser.GameObjects.Image;
  featuredEmblem: Phaser.GameObjects.Image;
  featuredName: Phaser.GameObjects.Text;
  nicknameMessage: Phaser.GameObjects.Text;
  nicknameHint: Phaser.GameObjects.Container;
  summaryTabs: TextTabs<SummaryTab>;
  stats: Phaser.GameObjects.Container;
  statRows: readonly RowView[];
  earnedRow: RowView;
  sets: Phaser.GameObjects.Container;
  setRows: readonly SetRowView[];
  setHalo: Phaser.GameObjects.Sprite;
  focusStar: Phaser.GameObjects.Sprite;
  collection: Phaser.GameObjects.Container;
  tabs: TextTabs<AchievementSet>;
  tabStar: Phaser.GameObjects.Sprite;
  grids: Map<AchievementSet, SetGridView>;
  halo: Phaser.GameObjects.Sprite;
  detailEmblem: Phaser.GameObjects.Image;
  detailName: Phaser.GameObjects.Text;
  detailCondition: Phaser.GameObjects.Text;
  detailProgressLabel: Phaser.GameObjects.Text;
  detailProgressValue: Phaser.GameObjects.Text;
  detailNote: Phaser.GameObjects.Text;
  detailStatusLabel: Phaser.GameObjects.Text;
  detailStatus: Phaser.GameObjects.Text;
  featuredHalo: Phaser.GameObjects.Sprite;
  detailFeatured: Phaser.GameObjects.Text;
  detailRule: readonly (Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible)[];
  equipButton: Button;
  unequipButton: Button;
  detailFailure: Phaser.GameObjects.Text;
  input: TextInput;
}

interface ProfileViewActions {
  readonly select: () => void;
  readonly selectTab: (tab: SummaryTab) => void;
  readonly selectSet: (set: AchievementSet) => void;
  readonly hover: (hover: ProfileHover) => void;
  readonly unhover: (hover: ProfileHover) => void;
}

function formatNicknameCount(nickname: string): string {
  return `${Array.from(nickname).length}/${NICKNAME_MAX_LENGTH}`;
}

function formatDate(atMs: number): string {
  const date = new Date(atMs);
  const pad = (value: number): string => `${value}`.padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function getStatus(
  achievements: readonly AchievementStatus[],
  id: AchievementId,
): AchievementStatus {
  return requireDefined(
    achievements.find((status) => status.id === id),
    'Missing achievement status',
    id,
  );
}

function countEarned(
  state: LoadedProfileState,
  definitions: readonly AchievementDefinition[],
): number {
  return definitions.filter(({ id }) => isEarned(state, id)).length;
}

// 세트 이름은 여러 줄로 쌓인 고유 명칭이라 ALL CAPS 대신 Title Case 로 단어 모양을 살린다.
function setLabel(set: AchievementSet): string {
  const words = set.replace(/([A-Z])/g, ' $1');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export class ProfileScene extends Phaser.Scene {
  private exit: SceneExit<SceneRequest> = STAYING;

  constructor(
    private readonly save: LocalSave,
    private readonly i18n: I18n,
    private readonly celestial: CelestialCatalog,
    private readonly deps: ProfileDeps,
  ) {
    super(SCENE_KEYS.profile);
  }

  preload(): void {
    queueImageLoads(
      this,
      [
        {
          key: PEN_TEXTURE_KEY,
          url: PEN_PATH,
        },
      ],
      'profile scene image',
    );
    queueSoundEffects(this);
    queueCelestialTextures(this, this.celestial, [
      ...getMenuSceneTextureUses(this.celestial, 'songSelect'),
      this.celestial.atlasPresentations[FOCUS_STAR_ID],
      this.celestial.atlasPresentations[SELECTED_HALO_ID],
      this.celestial.atlasPresentations[DIVIDER_GLINT_ID],
      this.celestial.atlasPresentations[LOADING_STAR_ID],
      this.celestial.atlasPresentations[SET_NODE_IDLE_ID],
      this.celestial.atlasPresentations[SET_NODE_HOVER_ID],
      this.celestial.atlasPresentations[SET_NODE_SELECTED_ID],
    ]);
  }

  create(): void {
    this.exit = STAYING;
    const chrome = new MenuSceneChrome(this, {
      celestial: this.celestial,
      screen: 'songSelect',
      readControlsMessages: () => this.i18n.t('controls', { returnObjects: true }),
      readSettings: () => this.save.loadSettings(),
    });
    const soundEffects = new SoundEffects(this, this.save.loadSettings());
    const view = this.createView({
      select: () => controller.select(),
      selectTab: (tab) => controller.selectTab(tab),
      selectSet: (set) => controller.selectSet(set),
      hover: (hover) => controller.hover(hover),
      unhover: (hover) => controller.unhover(hover),
    });
    const controller = new ProfileController(this.deps, {
      render: (state, previous) => this.render(view, state, previous, controller),
      playFocusSound: () => soundEffects.play('menuFocus'),
      leaveToMain: () => {
        this.exit = exitScene(this, this.exit, {
          key: 'main',
          data: undefined,
        });
      },
    });
    createHeaderAuxiliaryButtons(this, [
      {
        label: 'BACK',
        onActivate: () => controller.back(),
      },
    ]);
    const bindHover = (
      target: Phaser.GameObjects.GameObject,
      hover: ProfileHover,
      onActivate: () => void,
    ): void =>
      bindHoverTarget(target, {
        onOver: () => controller.hover(hover),
        onOut: () => controller.unhover(hover),
        onActivate,
      });
    bindHover(view.nicknameHitArea, { kind: 'nickname' }, () => controller.select('nickname'));
    view.setRows.forEach(({ set, hitArea }) =>
      bindHover(
        hitArea,
        {
          kind: 'setRow',
          set,
        },
        () => controller.select(set),
      ),
    );
    view.input.onInput((value) => {
      view.nicknameCount.setText(formatNicknameCount(value));
      controller.changeNicknameInput(value);
    });
    // Phaser 가 캔버스 mousedown 의 기본 동작을 막아 브라우저가 스스로 포커스를 옮기지 않는다.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => view.input.blur());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      controller.close();
      view.input.destroy();
    });
    controller.start();
    chrome.start(view.title.getBounds(), {
      isLeaving: () => this.exit.kind === 'leaving',
      captureKey: (event) => controller.captureNicknameKey(readMenuAction(event), view.input.text),
      handleMenuKey: (action) => this.handleMenuKey(action, controller),
    });
  }

  private handleMenuKey(action: MenuAction | null, controller: ProfileController): void {
    switch (action) {
      case 'confirm':
        // 두 동작은 각자 자기 상태에서만 반응하므로 Enter 하나로 실패 화면의 다시 시도와 선택을 함께 넘긴다.
        controller.retry();
        controller.select();
        return;
      case 'back':
        controller.back();
        return;
      case 'previousTab':
        controller.switchSet(-1);
        return;
      case 'nextTab':
        controller.switchSet(1);
        return;
      case null:
        return;
      default:
        controller.moveFocus(action);
    }
  }

  private createView(actions: ProfileViewActions): ProfileView {
    const text = (
      xPx: number,
      yPx: number,
      role: Parameters<typeof textStyle>[0],
      color: number,
      weight?: number,
    ): Phaser.GameObjects.Text => this.add.text(xPx, yPx, '', textStyle(role, color, weight));
    const row = (index: number): RowView => {
      const centerYPx = ROWS_TOP_Y_PX + ROW_HEIGHT_PX * index + ROW_HEIGHT_PX / 2;
      return {
        label: text(
          LEFT_X_PX,
          centerYPx,
          'primary',
          COLORS.textPrimary,
          ROW_LABEL_WEIGHT,
        ).setOrigin(0, 0.5),
        value: text(
          VALUE_RIGHT_X_PX,
          centerYPx,
          'primary',
          COLORS.textPrimary,
          UNSELECTED_WEIGHT,
        ).setOrigin(1, 0.5),
      };
    };

    const title = text(
      SCREEN_LAYOUT.leftXPx,
      SCREEN_LAYOUT.headerYPx,
      'heading',
      COLORS.textPrimary,
    );
    const noticeLines = [
      text(LEFT_X_PX, NOTICE_Y_PX, 'primary', COLORS.textPrimary),
      text(LEFT_X_PX, NOTICE_Y_PX + NOTICE_LINE_GAP_PX, 'secondary', COLORS.textSecondary),
    ];
    const loading = new NoticeText(
      this,
      this.celestial,
      this.add
        .text(
          GAME_WIDTH / 2,
          GAME_HEIGHT / 2,
          '',
          textStyle('secondary', CELESTIAL_COLORS.textNeutral),
        )
        .setOrigin(0.5),
    );
    const nicknameFieldRightXPx = LEFT_X_PX + NICKNAME_FIELD_WIDTH_PX;
    const nicknameField = this.add.graphics();
    const nicknameHitArea = this.add
      .zone(LEFT_X_PX, NICKNAME_FIELD_TOP_Y_PX, NICKNAME_FIELD_WIDTH_PX, NICKNAME_FIELD_HEIGHT_PX)
      .setOrigin(0, 0);
    const nickname = text(
      LEFT_X_PX + NICKNAME_FIELD_PADDING_X_PX,
      NICKNAME_CENTER_Y_PX,
      'primary',
      COLORS.textPrimary,
    ).setOrigin(0, 0.5);
    const nicknameCount = text(
      nicknameFieldRightXPx - NICKNAME_FIELD_PADDING_X_PX,
      NICKNAME_CENTER_Y_PX,
      'meta',
      CELESTIAL_COLORS.textSecondary,
    )
      .setOrigin(1, 0.5)
      .setAlpha(NICKNAME_COUNT_ALPHA);
    const pen = this.add
      .image(
        nicknameFieldRightXPx - NICKNAME_FIELD_PADDING_X_PX,
        NICKNAME_CENTER_Y_PX,
        PEN_TEXTURE_KEY,
      )
      .setOrigin(1, 0.5)
      .setDisplaySize(PEN_SIZE_PX, PEN_SIZE_PX)
      .setTint(COLORS.textSecondary);
    // 엠블럼 텍스처는 표시 크기로 그려진다. 기본 텍스처에 크기를 맞추면 그 배율이 교체 뒤에도 남는다.
    const featuredEmblem = this.add
      .image(LEFT_X_PX, FEATURED_CENTER_Y_PX, '__DEFAULT')
      .setOrigin(0, 0.5);
    const featuredName = text(
      LEFT_X_PX,
      FEATURED_CENTER_Y_PX,
      'secondary',
      FEATURED_COLOR,
    ).setOrigin(0, 0.5);
    const nicknameMessage = text(
      LEFT_X_PX,
      FEATURED_CENTER_Y_PX,
      'meta',
      STATUS_COLORS.danger,
    ).setOrigin(0, 0.5);
    const nicknameHint = addKeyHintRow(
      this,
      this.i18n.t('profile.nicknameEditHint'),
      MENU_KEY_HINT_STYLE,
      LEFT_X_PX,
      FEATURED_CENTER_Y_PX,
    );
    const summaryTabs = new TextTabs(
      this,
      SUMMARY_TABS.map((tab) => ({
        key: tab,
        label: this.i18n.t(
          tab === 'stats' ? 'profile.groups.records' : 'profile.groups.collection',
        ),
      })),
      {
        xPx: LEFT_X_PX,
        align: 'left',
        topYPx: SUMMARY_TAB_Y_PX,
      },
      TAB_STYLE,
      {
        onSelect: actions.selectTab,
        onHover: (tab) =>
          actions.hover({
            kind: 'summaryTab',
            tab,
          }),
        onUnhover: (tab) =>
          actions.unhover({
            kind: 'summaryTab',
            tab,
          }),
      },
    );
    const statRows = STAT_FIELDS.map((_, index) => row(index));
    const earnedRow = row(STAT_FIELDS.length);
    const statDividers = statRows.flatMap((_, index) => {
      const yPx = ROWS_TOP_Y_PX + ROW_HEIGHT_PX * (index + 1);
      return [
        addHairline(this, LEFT_X_PX, yPx, VALUE_RIGHT_X_PX),
        addCelestialSprite(
          this,
          this.celestial.atlasPresentations[DIVIDER_GLINT_ID],
          VALUE_RIGHT_X_PX,
          yPx,
        ),
      ];
    });
    const stats = this.add.container(0, 0, [
      ...[...statRows, earnedRow].flatMap(({ label, value }) => [label, value]),
      ...statDividers,
    ]);
    const chevrons = this.add.graphics().lineStyle(CHEVRON_STROKE_PX, COLORS.textSecondary);
    const setRows = ACHIEVEMENT_SETS.map((set, index) => {
      const topYPx = ROWS_TOP_Y_PX + ROW_HEIGHT_PX * index;
      const centerYPx = topYPx + ROW_HEIGHT_PX / 2;
      chevrons.strokePoints(
        [
          new Phaser.Math.Vector2(
            CHEVRON_CENTER_X_PX - CHEVRON_HALF_HEIGHT_PX / 2,
            centerYPx - CHEVRON_HALF_HEIGHT_PX,
          ),
          new Phaser.Math.Vector2(CHEVRON_CENTER_X_PX + CHEVRON_HALF_HEIGHT_PX / 2, centerYPx),
          new Phaser.Math.Vector2(
            CHEVRON_CENTER_X_PX - CHEVRON_HALF_HEIGHT_PX / 2,
            centerYPx + CHEVRON_HALF_HEIGHT_PX,
          ),
        ],
        false,
        false,
      );
      return {
        set,
        fill: this.add
          .rectangle(
            SET_FILL.xPx,
            topYPx + SET_FILL.insetYPx,
            SET_FILL.widthPx,
            ROW_HEIGHT_PX - SET_FILL.insetYPx * 2,
            SET_FILL.color,
            SET_FILL.alpha,
          )
          .setOrigin(0, 0)
          .setRounded(RADIUS.smallPx)
          .setVisible(false),
        node: addCelestialSprite(
          this,
          this.celestial.atlasPresentations[SET_NODE_IDLE_ID],
          SET_NODE_X_PX,
          centerYPx,
        ),
        label: text(LEFT_X_PX, centerYPx, 'primary', COLORS.textPrimary)
          .setOrigin(0, 0.5)
          .setText(setLabel(set)),
        count: text(
          VALUE_RIGHT_X_PX,
          centerYPx,
          'primary',
          COLORS.textPrimary,
          UNSELECTED_WEIGHT,
        ).setOrigin(1, 0.5),
        hitArea: this.add.zone(LEFT_X_PX, topYPx, SET_ROW_WIDTH_PX, ROW_HEIGHT_PX).setOrigin(0, 0),
      };
    });
    const setHalo = addCelestialSprite(
      this,
      this.celestial.atlasPresentations[SELECTED_HALO_ID],
      SET_NODE_X_PX,
      0,
    );
    const sets = this.add.container(0, 0, [
      ...setRows.map(({ fill }) => fill),
      chevrons,
      ...setRows.flatMap(({ node, label, count, hitArea }) => [node, label, count, hitArea]),
      setHalo,
    ]);
    const focusStar = addCelestialSprite(
      this,
      this.celestial.atlasPresentations[FOCUS_STAR_ID],
      LEFT_X_PX - FOCUS_STAR_GAP_PX,
      NICKNAME_CENTER_Y_PX,
    );
    const summary = this.add.container(0, 0, [
      nicknameField,
      nicknameHitArea,
      nickname,
      nicknameCount,
      pen,
      featuredEmblem,
      featuredName,
      nicknameMessage,
      nicknameHint,
      ...summaryTabs.getVisuals(),
      stats,
      sets,
      focusStar,
    ]);

    const tabs = new TextTabs(
      this,
      ACHIEVEMENT_SETS.map((set) => ({
        key: set,
        label: setLabel(set),
      })),
      {
        xPx: LEFT_X_PX,
        align: 'left',
        topYPx: TAB_Y_PX,
      },
      TAB_STYLE,
      {
        onSelect: actions.selectSet,
        onHover: (set) =>
          actions.hover({
            kind: 'collectionTab',
            set,
          }),
        onUnhover: (set) =>
          actions.unhover({
            kind: 'collectionTab',
            set,
          }),
      },
    );
    const tabStar = addCelestialSprite(
      this,
      this.celestial.atlasPresentations[FOCUS_STAR_ID],
      0,
      0,
    );
    const halo = addCelestialSprite(
      this,
      this.celestial.atlasPresentations[SELECTED_HALO_ID],
      0,
      0,
    ).setDisplaySize(HALO_SIZE_PX, HALO_SIZE_PX);
    const detailEmblem = this.add.image(
      DETAIL_X_PX + DETAIL_WIDTH_PX / 2,
      DETAIL_EMBLEM_CENTER_Y_PX,
      '__DEFAULT',
    );
    const detailName = text(DETAIL_X_PX, DETAIL_NAME_Y_PX, 'heading', COLORS.textPrimary);
    const detailCondition = text(
      DETAIL_X_PX,
      DETAIL_CONDITION_Y_PX,
      'secondary',
      COLORS.textSecondary,
    ).setWordWrapWidth(DETAIL_WIDTH_PX);
    const detailProgressLabel = text(
      DETAIL_X_PX,
      DETAIL_PROGRESS_Y_PX,
      'secondary',
      COLORS.textSecondary,
    );
    const detailProgressValue = text(
      DETAIL_X_PX + DETAIL_WIDTH_PX,
      DETAIL_PROGRESS_Y_PX,
      'secondary',
      COLORS.textPrimary,
    ).setOrigin(1, 0);
    const detailNote = text(
      DETAIL_X_PX,
      DETAIL_NOTE_Y_PX,
      'meta',
      COLORS.textMuted,
    ).setWordWrapWidth(DETAIL_WIDTH_PX);
    const detailStatusLabel = text(
      DETAIL_X_PX,
      DETAIL_STATUS_Y_PX,
      'secondary',
      COLORS.textSecondary,
    );
    const detailStatus = text(
      DETAIL_X_PX + DETAIL_WIDTH_PX,
      DETAIL_STATUS_Y_PX,
      'secondary',
      COLORS.textMuted,
    ).setOrigin(1, 0);
    const featuredHalo = addCelestialSprite(
      this,
      this.celestial.atlasPresentations[SELECTED_HALO_ID],
      DETAIL_X_PX + DETAIL_WIDTH_PX / 2,
      DETAIL_EMBLEM_CENTER_Y_PX,
    ).setDisplaySize(DETAIL_FEATURED_HALO_SIZE_PX, DETAIL_FEATURED_HALO_SIZE_PX);
    const detailFeatured = text(
      DETAIL_X_PX,
      DETAIL_FEATURED_Y_PX,
      'meta',
      FEATURED_COLOR,
      ROW_LABEL_WEIGHT,
    ).setText(this.i18n.t('collection.featured'));
    const detailRule = [
      addHairline(this, DETAIL_X_PX, DETAIL_RULE_Y_PX, DETAIL_X_PX + DETAIL_WIDTH_PX),
      addCelestialSprite(
        this,
        this.celestial.atlasPresentations[DIVIDER_GLINT_ID],
        DETAIL_X_PX + DETAIL_WIDTH_PX,
        DETAIL_RULE_Y_PX,
      ),
    ];
    const equipButton = new Button(this, DETAIL_X_PX, DETAIL_BUTTON_TOP_Y_PX, {
      variant: 'primary',
      label: this.i18n.t('collection.setFeatured'),
      widthPx: DETAIL_WIDTH_PX,
      heightPx: DETAIL_BUTTON_HEIGHT_PX,
      onActivate: actions.select,
    });
    const unequipButton = new Button(this, DETAIL_X_PX, DETAIL_BUTTON_TOP_Y_PX, {
      variant: 'secondary',
      focus: 'glow',
      colors: UNEQUIP_BUTTON_COLORS,
      label: this.i18n.t('collection.unsetFeatured'),
      widthPx: DETAIL_WIDTH_PX,
      heightPx: DETAIL_BUTTON_HEIGHT_PX,
      onActivate: actions.select,
    });
    const detailFailure = text(
      DETAIL_X_PX,
      DETAIL_BUTTON_TOP_Y_PX + DETAIL_BUTTON_HEIGHT_PX + DETAIL_FAILURE_GAP_PX,
      'meta',
      COLORS.textSecondary,
    );
    const collection = this.add.container(0, 0, [
      ...tabs.getVisuals(),
      tabStar,
      halo,
      featuredHalo,
      detailEmblem,
      detailName,
      detailCondition,
      detailProgressLabel,
      detailProgressValue,
      detailNote,
      detailStatusLabel,
      detailStatus,
      detailFeatured,
      ...detailRule,
      equipButton,
      unequipButton,
      detailFailure,
    ]);

    const input = new TextInput(
      this,
      {
        leftPx: LEFT_X_PX + NICKNAME_FIELD_PADDING_X_PX,
        topYPx: NICKNAME_FIELD_TOP_Y_PX,
        widthPx:
          NICKNAME_FIELD_WIDTH_PX - NICKNAME_FIELD_PADDING_X_PX * 2 - NICKNAME_COUNT_RESERVE_PX,
        heightPx: NICKNAME_FIELD_HEIGHT_PX,
      },
      {
        label: this.i18n.t('profile.nicknamePlaceholder'),
        maxLength: NICKNAME_MAX_LENGTH,
        type: TYPE_SCALE.primary,
        enterKeyHint: 'done',
        isBare: true,
      },
    );
    input.setVisible(false);
    const view: ProfileView = {
      title,
      notice: this.add.container(0, 0, noticeLines),
      noticeLines,
      loading,
      summary,
      nicknameField,
      nicknameHitArea,
      nickname,
      nicknameCount,
      pen,
      featuredEmblem,
      featuredName,
      nicknameMessage,
      nicknameHint,
      summaryTabs,
      stats,
      statRows,
      earnedRow,
      sets,
      setRows,
      setHalo,
      focusStar,
      collection,
      tabs,
      tabStar,
      grids: new Map(),
      halo,
      featuredHalo,
      detailEmblem,
      detailName,
      detailCondition,
      detailProgressLabel,
      detailProgressValue,
      detailNote,
      detailStatusLabel,
      detailStatus,
      detailFeatured,
      detailRule,
      equipButton,
      unequipButton,
      detailFailure,
      input,
    };
    return view;
  }

  private render(
    view: ProfileView,
    state: ProfileState,
    previous: ProfileState | null,
    controller: ProfileController,
  ): void {
    // hover 만 바뀌면 hover 표시만 칠한다. 편집 중 hover 가 입력란 포커스를 되살리지 않게 한다.
    if (
      previous?.kind === 'loaded' &&
      state.kind === 'loaded' &&
      isShallowEqual(previous, state, ['hover'])
    ) {
      this.paintHover(view, state);
      return;
    }
    const isLoaded = state.kind === 'loaded';
    const shownView = isLoaded ? state.view : null;
    const previousView = previous?.kind === 'loaded' ? previous.view : null;
    if (previous?.kind !== state.kind || previousView !== shownView) {
      view.notice.setVisible(state.kind === 'guest' || state.kind === 'failed');
      const isLoading = state.kind === 'loading';
      view.loading.show(isLoading ? this.i18n.t('profile.loading') : '', isLoading);
      view.summary.setVisible(shownView === 'summary');
      view.collection.setVisible(shownView === 'collection');
      view.grids.forEach((grid) => grid.container.setVisible(false));
    }
    // 같은 보기를 이어 그릴 때만 이전 상태와 비교하고, 보기가 바뀌면 처음부터 그린다.
    const before = previous?.kind === 'loaded' && previousView === shownView ? previous : null;
    switch (state.kind) {
      case 'guest':
        if (previous?.kind !== state.kind) {
          this.renderNotice(view, 'profile.guestRecord', 'profile.guestSignIn');
        }
        break;
      case 'loading':
        if (previous?.kind !== state.kind) {
          view.title.setText(this.i18n.t('profile.title'));
        }
        break;
      case 'failed':
        if (previous?.kind !== state.kind) {
          this.renderNotice(view, 'profile.loadFailed', 'profile.retry');
        }
        break;
      case 'loaded':
        if (state.view === 'summary') {
          this.renderSummary(view, before, state);
        } else {
          this.renderCollection(view, before, state, controller);
        }
        if (before !== null && before.hover !== state.hover) {
          this.paintHover(view, state);
        }
        break;
    }
    this.renderNicknameInput(view, previous, state);
  }

  private renderNotice(
    view: ProfileView,
    firstKey: 'profile.guestRecord' | 'profile.loadFailed',
    secondKey: 'profile.guestSignIn' | 'profile.retry',
  ): void {
    view.title.setText(this.i18n.t('profile.title'));
    const [first, second] = view.noticeLines;
    requireDefined(first, 'Missing first notice line').setText(this.i18n.t(firstKey));
    requireDefined(second, 'Missing second notice line').setText(this.i18n.t(secondKey));
  }

  private renderNicknameInput(
    view: ProfileView,
    previous: ProfileState | null,
    state: ProfileState,
  ): void {
    const before = previous?.kind === 'loaded' ? previous.nickname.kind : 'idle';
    if (state.kind !== 'loaded' || state.nickname.kind === 'idle') {
      if (before !== 'idle') {
        view.input.blur();
        view.input.setVisible(false);
      }
      return;
    }
    if (before === 'idle') {
      view.input.setText(state.profile.nickname);
      view.nicknameCount.setText(formatNicknameCount(state.profile.nickname));
      view.input.setVisible(true);
    }
    // 저장 중 입력은 응답이 오면 사라지므로 요청이 끝날 때까지 편집을 막는다.
    const isEditing = state.nickname.kind === 'editing';
    view.input.setEnabled(isEditing);
    if (isEditing) {
      view.input.focus();
    } else {
      view.input.blur();
    }
  }

  private renderSummary(
    view: ProfileView,
    before: LoadedProfileState | null,
    state: LoadedProfileState,
  ): void {
    const { profile, nickname } = state;
    if (before === null) {
      view.title.setText(this.i18n.t('profile.title'));
      STAT_FIELDS.forEach((field, index) => {
        requireDefined(view.statRows[index], 'Missing stat row', field).label.setText(
          this.i18n.t(`profile.stats.${field}`),
        );
      });
      view.earnedRow.label.setText(this.i18n.t('profile.stats.earnedAchievements'));
    }
    // 구역마다 그 구역이 읽는 필드만 골라 비교해, 다른 구역의 변경으로 다시 그리지 않는다.
    if (
      before === null ||
      before.nickname !== nickname ||
      before.profile.nickname !== profile.nickname ||
      before.profile.featuredAchievement !== profile.featuredAchievement
    ) {
      this.renderIdentity(view, state);
    }
    if (
      before === null ||
      before.profile.stats !== profile.stats ||
      before.profile.achievements !== profile.achievements
    ) {
      STAT_FIELDS.forEach((field, index) => {
        requireDefined(view.statRows[index], 'Missing stat row', field).value.setText(
          `${profile.stats[field]}`,
        );
      });
      view.earnedRow.value.setText(`${countEarned(state, ACHIEVEMENTS)} / ${ACHIEVEMENTS.length}`);
      view.setRows.forEach(({ set, count }) => {
        const inSet = ACHIEVEMENTS.filter((achievement) => achievement.set === set);
        count.setText(`${countEarned(state, inSet)} / ${inSet.length}`);
      });
    }
    const tab = state.summaryTab;
    if (before === null || before.summaryTab !== tab) {
      this.paintSummaryTabs(view, state);
      view.stats.setVisible(tab === 'stats');
      view.sets.setVisible(tab === 'collection');
    }
    const focus = state.summaryFocus;
    if (before !== null && before.summaryFocus === focus) {
      return;
    }
    view.focusStar.setVisible(focus === 'nickname');
    view.setRows.forEach(({ set, fill, label }) => {
      const isSelected = set === focus;
      fill.setVisible(isSelected);
      setTextWeight(label, isSelected ? TYPE_SCALE.primary.weight : ROW_LABEL_WEIGHT);
      this.tweens.killTweensOf(label);
      this.tweens.add({
        targets: label,
        x: LEFT_X_PX + (isSelected ? SET_ROW_SHIFT_PX : 0),
        duration: MOTION.fastMs,
        ease: 'Cubic.Out',
      });
      if (isSelected) {
        view.setHalo.setY(label.y);
      }
    });
    setCelestialLoopActive(view.setHalo, focus !== 'nickname');
    this.paintSetNodes(view, state);
  }

  private paintHover(view: ProfileView, state: LoadedProfileState): void {
    if (state.view === 'summary') {
      view.pen.setTint(
        state.hover?.kind === 'nickname' ? COLORS.textPrimary : COLORS.textSecondary,
      );
      this.paintSummaryTabs(view, state);
      this.paintSetNodes(view, state);
    } else {
      this.paintCollectionTabs(view, state);
    }
  }

  private paintSummaryTabs(view: ProfileView, state: LoadedProfileState): void {
    view.summaryTabs.render(
      (tab) =>
        getChoiceAppearance(state, {
          kind: 'summaryTab',
          tab,
        }),
      COLORS.textPrimary,
    );
  }

  private paintSetNodes(view: ProfileView, state: LoadedProfileState): void {
    view.setRows.forEach(({ set, node }) =>
      applyCelestialPresentation(
        node,
        this.celestial.atlasPresentations[
          SET_NODE_IDS[
            getChoiceAppearance(state, {
              kind: 'setRow',
              set,
            })
          ]
        ],
      ),
    );
  }

  private paintCollectionTabs(view: ProfileView, state: LoadedProfileState): void {
    view.tabs.render(
      (set) =>
        getChoiceAppearance(state, {
          kind: 'collectionTab',
          set,
        }),
      COLORS.textPrimary,
    );
  }

  private renderIdentity(view: ProfileView, state: LoadedProfileState): void {
    const { profile, nickname } = state;
    const error = nickname.kind === 'editing' ? nickname.error : null;
    let look: NicknameFieldLook = 'editing';
    if (nickname.kind === 'idle') {
      look = 'idle';
    } else if (error !== null) {
      look = 'invalid';
    }
    const isIdle = look === 'idle';
    const { fillAlpha, borderColor, borderAlpha } = NICKNAME_FIELD_LOOKS[look];
    view.nicknameField
      .clear()
      .fillStyle(CELESTIAL_COLORS.surface, fillAlpha)
      .fillRoundedRect(
        LEFT_X_PX,
        NICKNAME_FIELD_TOP_Y_PX,
        NICKNAME_FIELD_WIDTH_PX,
        NICKNAME_FIELD_HEIGHT_PX,
        RADIUS.mediumPx,
      )
      .lineStyle(1, borderColor, borderAlpha)
      .strokeRoundedRect(
        LEFT_X_PX,
        NICKNAME_FIELD_TOP_Y_PX,
        NICKNAME_FIELD_WIDTH_PX,
        NICKNAME_FIELD_HEIGHT_PX,
        RADIUS.mediumPx,
      );
    view.nickname.setText(profile.nickname).setVisible(isIdle);
    view.pen.setVisible(isIdle);
    view.nicknameCount.setVisible(!isIdle);
    view.nicknameHint.setVisible(look === 'editing');
    view.nicknameMessage.setVisible(look === 'invalid');
    if (error !== null) {
      view.nicknameMessage.setText(this.i18n.t(`profile.nicknameErrors.${error}`));
    }
    const featured = profile.featuredAchievement;
    view.featuredEmblem.setVisible(isIdle && featured !== null);
    view.featuredName.setVisible(isIdle);
    if (featured === null) {
      view.featuredName.setText(this.i18n.t('profile.noFeatured')).setX(LEFT_X_PX);
      setTextColor(view.featuredName, COLORS.textMuted);
    } else {
      view.featuredEmblem.setTexture(
        getAchievementEmblemTexture(this, featured, FEATURED_EMBLEM_SIZE_PX),
      );
      view.featuredName
        .setText(this.i18n.t(`achievements.names.${featured}`))
        .setX(LEFT_X_PX + FEATURED_EMBLEM_SIZE_PX + FEATURED_NAME_GAP_PX);
      setTextColor(view.featuredName, FEATURED_COLOR);
    }
  }

  private renderCollection(
    view: ProfileView,
    before: LoadedProfileState | null,
    state: LoadedProfileState,
    controller: ProfileController,
  ): void {
    const { profile, collection } = state;
    const isSetChanged = before === null || before.collection.set !== collection.set;
    // 획득 표시가 읽는 필드만 골라 비교해, 닉네임 같은 다른 프로필 변경으로 격자를 다시 그리지 않는다.
    const isEarnedChanged =
      before === null ||
      before.profile.achievements !== profile.achievements ||
      before.profile.newAchievements !== profile.newAchievements;
    const isFocusChanged = isSetChanged || before.collection.focusedId !== collection.focusedId;
    if (before === null) {
      view.title.setText(this.i18n.t('collection.title'));
    }
    if (isSetChanged) {
      this.paintCollectionTabs(view, state);
      const bounds = view.tabs.getBounds(collection.set);
      view.tabStar.setPosition(bounds.left - FOCUS_STAR_GAP_PX, bounds.centerY);
      view.grids.forEach((shownGrid) => shownGrid.container.setVisible(false));
    }

    const grid = this.requireGrid(view, collection.set, controller);
    if (isSetChanged) {
      grid.container.setVisible(true);
    }
    if (isSetChanged || isEarnedChanged) {
      grid.groupTitles.forEach(({ category, row, text }) => {
        text.setText(
          `${this.i18n.t(`achievements.categories.${category}`)}  ${countEarned(state, row)} / ${row.length}`,
        );
      });
      grid.cells.forEach(({ id, image, newLabel }) => {
        image.setAlpha(isEarned(state, id) ? 1 : LOCKED_ALPHA);
        newLabel.setVisible(profile.newAchievements.has(id));
      });
    }

    const id = collection.focusedId;
    const status = getStatus(profile.achievements, id);
    const isFocusedEarned = isEarned(state, id);
    if (isFocusChanged) {
      const focusedCell = requireDefined(
        grid.cells.find((cell) => cell.id === id),
        'Focused achievement has no cell',
        id,
      );
      view.halo.setPosition(focusedCell.image.x, focusedCell.image.y);
    }
    if (isFocusChanged || isEarnedChanged) {
      const definition = requireDefined(findAchievement(id), 'Unknown achievement', id);
      view.detailEmblem
        .setTexture(getAchievementEmblemTexture(this, id, DETAIL_EMBLEM_SIZE_PX))
        .setAlpha(isFocusedEarned ? 1 : LOCKED_ALPHA);
      view.detailName.setText(this.i18n.t(`achievements.names.${id}`));
      view.detailCondition.setText(this.describeCondition(definition));
      const isCurrentSongs = definition.rule.kind === 'zodiacComplete';
      view.detailProgressLabel.setText(
        this.i18n.t(isCurrentSongs ? 'collection.currentSongs' : 'collection.progress'),
      );
      view.detailProgressValue.setText(
        isCurrentSongs && status.target === 0
          ? this.i18n.t('collection.noAssignedSongs')
          : `${status.current} / ${status.target}`,
      );
      view.detailNote
        .setText(this.i18n.t('collection.currentSongsNote'))
        .setVisible(isCurrentSongs);
      if (status.earnedAtMs === null) {
        view.detailStatusLabel.setText(this.i18n.t('collection.status'));
        view.detailStatus.setText(this.i18n.t('collection.locked'));
        setTextColor(view.detailStatus, COLORS.textMuted);
      } else {
        view.detailStatusLabel.setText(this.i18n.t('collection.earned'));
        view.detailStatus.setText(formatDate(status.earnedAtMs));
        setTextColor(view.detailStatus, FEATURED_COLOR);
      }
      view.detailRule.forEach((object) => object.setVisible(isFocusedEarned));
    }
    if (
      isFocusChanged ||
      isEarnedChanged ||
      before.profile.featuredAchievement !== profile.featuredAchievement
    ) {
      const isFeatured = profile.featuredAchievement === id;
      setCelestialLoopActive(view.featuredHalo, isFeatured);
      view.detailFeatured.setVisible(isFeatured);
      view.equipButton.setVisible(isFocusedEarned && !isFeatured);
      view.unequipButton.setVisible(isFocusedEarned && isFeatured);
    }
    if (before === null || before.featuredSave !== state.featuredSave) {
      view.detailFailure
        .setText(this.i18n.t('profile.featuredSaveFailed'))
        .setVisible(state.featuredSave === 'failed');
    }
  }

  private requireGrid(
    view: ProfileView,
    set: AchievementSet,
    controller: ProfileController,
  ): SetGridView {
    const existing = view.grids.get(set);
    if (existing !== undefined) {
      return existing;
    }
    const rows = getCollectionRows(set);
    const groupTitles = rows.map((row, rowIndex) => ({
      category: requireDefined(row[0], 'Collection row is empty').category,
      row,
      text: this.add.text(
        LEFT_X_PX,
        GRID_TOP_Y_PX + GRID_CATEGORY_STRIDE_PX * rowIndex,
        '',
        textStyle('secondary', COLORS.textSecondary, GROUP_TITLE_WEIGHT),
      ),
    }));
    const cells = rows.flatMap((row, rowIndex) =>
      row.map(({ id }, columnIndex) => {
        const xPx = LEFT_X_PX + GRID_EMBLEM_SIZE_PX / 2 + GRID_CELL_PX * columnIndex;
        const yPx =
          GRID_TOP_Y_PX +
          GRID_CATEGORY_STRIDE_PX * rowIndex +
          GRID_EMBLEM_OFFSET_Y_PX +
          GRID_EMBLEM_SIZE_PX / 2;
        const image = this.add.image(
          xPx,
          yPx,
          getAchievementEmblemTexture(this, id, GRID_EMBLEM_SIZE_PX),
        );
        image
          .setInteractive({ cursor: HOVER_CURSOR })
          .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => controller.focusAchievement(id));
        const newLabel = this.add
          .text(xPx + GRID_EMBLEM_SIZE_PX / 2, yPx - GRID_EMBLEM_SIZE_PX / 2, 'NEW', {
            ...textStyle('meta', FEATURED_COLOR),
            fontSize: `${NEW_LABEL_TYPE.sizePx}px`,
            fontStyle: `${NEW_LABEL_TYPE.weight}`,
          })
          .setOrigin(1, 1);
        return {
          id,
          image,
          newLabel,
        };
      }),
    );
    const grid: SetGridView = {
      container: this.add.container(0, 0, [
        ...groupTitles.map(({ text }) => text),
        ...cells.flatMap(({ image, newLabel }) => [image, newLabel]),
      ]),
      groupTitles,
      cells,
    };
    view.grids.set(set, grid);
    return grid;
  }

  private describeCondition({ rule }: AchievementDefinition): string {
    switch (rule.kind) {
      case 'plays':
        return rule.target === 1
          ? this.i18n.t('achievements.conditions.playsOne')
          : this.i18n.t('achievements.conditions.plays', { n: rule.target });
      case 'songs':
        return rule.target === 1
          ? this.i18n.t('achievements.conditions.songsOne')
          : this.i18n.t('achievements.conditions.songs', { n: rule.target });
      case 'charts': {
        const mark = this.i18n.t(`achievements.marks.${rule.mark}`);
        if (rule.difficulty === 'expert') {
          return rule.target === 1
            ? this.i18n.t('achievements.conditions.expertChartsOne', { mark })
            : this.i18n.t('achievements.conditions.expertCharts', {
                n: rule.target,
                mark,
              });
        }
        return rule.target === 1
          ? this.i18n.t('achievements.conditions.chartsOne', { mark })
          : this.i18n.t('achievements.conditions.charts', {
              n: rule.target,
              mark,
            });
      }
      case 'masteries': {
        const mark = this.i18n.t(`achievements.marks.${rule.mark}`);
        return rule.target === 1
          ? this.i18n.t('achievements.conditions.masteriesOne', { mark })
          : this.i18n.t('achievements.conditions.masteries', {
              n: rule.target,
              mark,
            });
      }
      case 'zodiacVisits':
        return this.i18n.t('achievements.conditions.zodiacVisits', {
          n: rule.target,
          mark: this.i18n.t(`achievements.marks.${rule.mark}`),
        });
      case 'zodiacComplete':
        return this.i18n.t('achievements.conditions.zodiacComplete', {
          zodiac: this.i18n.t(`achievements.zodiacs.${rule.zodiac}`),
          mark: this.i18n.t(`achievements.marks.${rule.mark}`),
        });
      case 'zodiacCompletions':
        return rule.target === 1
          ? this.i18n.t('achievements.conditions.zodiacCompletionsOne')
          : this.i18n.t('achievements.conditions.zodiacCompletions', { n: rule.target });
    }
  }
}
