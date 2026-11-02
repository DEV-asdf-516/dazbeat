import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { ACHIEVEMENT_SETS } from '../../data/achievements.js';
import type {
  AchievementCatalog,
  AchievementDefinition,
  AchievementId,
  AchievementSet,
  NamedAchievementDefinition,
} from '../../data/achievements.js';
import { NICKNAME_MAX_LENGTH } from '../../data/nickname.js';
import type { AchievementStatus, ProfileStats } from '../../data/profile.js';
import { requireDefined } from '../../invariant.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import type { CelestialCatalog } from '../celestial/state/celestialCatalog.js';
import {
  addCelestialSprite,
  queueCelestialTextures,
  setCelestialLoopActive,
} from '../celestial/view/celestialSprites.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../app/config.js';
import { getControlsGuide } from '../app/controlsGuide.js';
import { SCENE_KEYS, exitScene } from '../app/sceneRoutes.js';
import type { SceneRequest } from '../app/sceneRoutes.js';
import { STAYING } from '../app/sceneExit.js';
import type { SceneExit } from '../app/sceneExit.js';
import { getAchievementName } from '../ui/state/achievementName.js';
import { getAchievementEmblemTexture } from '../ui/view/widgets/achievementEmblem.js';
import { createHeaderAuxiliaryButtons } from '../ui/view/widgets/auxiliaryButton.js';
import { Button, SURFACE_BUTTON_COLORS } from '../ui/view/widgets/Button.js';
import { MenuSceneChrome, getMenuSceneTextureUses } from '../ui/view/widgets/MenuSceneChrome.js';
import { readMenuAction } from '../ui/state/menuAction.js';
import type { MenuAction } from '../ui/state/menuAction.js';
import { HOVER_CURSOR } from '../ui/view/input/cursor.js';
import { queueImageLoads } from '../ui/view/textures/imageLoad.js';
import { addHairline } from '../ui/view/textures/hairline.js';
import { bindHoverTarget, pointButton } from '../ui/view/input/hoverTarget.js';
import type { ButtonPointer } from '../ui/view/input/hoverTarget.js';
import { SoundEffects, queueSoundEffects } from '../ui/view/soundEffects.js';
import { MENU_KEY_HINT_STYLE, addKeyHintRow } from '../ui/view/widgets/keyHintView.js';
import { TextInput } from '../ui/view/widgets/TextInput.js';
import { LOADING_STAR_ID } from '../ui/view/widgets/LoadingStar.js';
import { NoticeText } from '../ui/view/widgets/NoticeText.js';
import {
  CELESTIAL_COLORS,
  COLORS,
  LIST_ROW,
  RADIUS,
  SCREEN_LAYOUT,
  STATUS_COLORS,
  TYPE_SCALE,
  setTextColor,
  setTextWeight,
  textStyle,
} from '../ui/view/theme.js';
import { TextTabs } from '../ui/view/widgets/TextTabs.js';
import {
  ListRowMarker,
  SelectedRowHalo,
  slideSelectedRowContent,
} from '../ui/view/widgets/listRowFocus.js';
import type { TextTabsStyle } from '../ui/view/widgets/TextTabs.js';
import { ProfileController } from './ProfileController.js';
import type { ProfilePorts } from './ProfileController.js';
import {
  getAchievementCondition,
  getCellLook,
  getChangedRegions,
  getChoiceAppearance,
  getCollectionRows,
  getEarnedProgress,
  getEarnedSummary,
  getFeaturedAction,
  getFeaturedIdentity,
  getFocusedEarning,
  getLoadedScreen,
  getNicknameCountInput,
  getNicknameEdit,
  getNicknameLook,
  getPenAppearance,
  getProfileButtonView,
  getProfileControlsCloseView,
  getProfileNotice,
  getProfilePage,
  getProgressDisplay,
  getSummaryFocusKind,
  isFocusedFeatured,
  isProfileControlsEntryHovered,
} from './state/profileState.js';
import type {
  CollectionRegion,
  LoadedProfileState,
  LoadedScreen,
  NicknameEdit,
  NicknameLook,
  ProfileButton,
  ProfilePageKind,
  ProfileRegion,
  ProfileScreenState,
  ProfileState,
  ProfileTarget,
  SummaryRegion,
  SummaryTab,
} from './state/profileState.js';

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
const NICKNAME_FIELD_LOOKS: Record<
  NicknameLook['kind'],
  {
    readonly fillAlpha: number;
    readonly borderColor: number;
    readonly borderAlpha: number;
    readonly isNameShown: boolean;
    readonly isHintShown: boolean;
  }
> = {
  idle: {
    fillAlpha: NICKNAME_FIELD_IDLE_FILL_ALPHA,
    borderColor: CELESTIAL_COLORS.border,
    borderAlpha: 0.6,
    isNameShown: true,
    isHintShown: false,
  },
  editing: {
    fillAlpha: NICKNAME_FIELD_EDIT_FILL_ALPHA,
    borderColor: CELESTIAL_COLORS.selected,
    borderAlpha: 1,
    isNameShown: false,
    isHintShown: true,
  },
  invalid: {
    fillAlpha: NICKNAME_FIELD_EDIT_FILL_ALPHA,
    borderColor: STATUS_COLORS.danger,
    borderAlpha: 1,
    isNameShown: false,
    isHintShown: false,
  },
};
const NICKNAME_COUNT_ALPHA = 0.7;
const TITLE_KEYS = {
  guest: 'profile.title',
  loading: 'profile.title',
  failed: 'profile.title',
  summary: 'profile.title',
  collection: 'collection.title',
} as const satisfies Record<ProfilePageKind, string>;
const NOTICE_KEYS = {
  guest: ['profile.guestRecord', 'profile.guestSignIn'],
  failed: ['profile.loadFailed', 'profile.retry'],
} as const;
const PAGE_VISIBILITY: Readonly<
  Record<
    ProfilePageKind,
    {
      readonly isNoticeVisible: boolean;
      readonly isLoadingVisible: boolean;
      readonly isSummaryVisible: boolean;
      readonly isCollectionVisible: boolean;
    }
  >
> = {
  guest: {
    isNoticeVisible: true,
    isLoadingVisible: false,
    isSummaryVisible: false,
    isCollectionVisible: false,
  },
  loading: {
    isNoticeVisible: false,
    isLoadingVisible: true,
    isSummaryVisible: false,
    isCollectionVisible: false,
  },
  failed: {
    isNoticeVisible: true,
    isLoadingVisible: false,
    isSummaryVisible: false,
    isCollectionVisible: false,
  },
  summary: {
    isNoticeVisible: false,
    isLoadingVisible: false,
    isSummaryVisible: true,
    isCollectionVisible: false,
  },
  collection: {
    isNoticeVisible: false,
    isLoadingVisible: false,
    isSummaryVisible: false,
    isCollectionVisible: true,
  },
};
const CELL_ALPHAS: Readonly<Record<'earned' | 'locked', number>> = {
  earned: 1,
  locked: LOCKED_ALPHA,
};
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
const SET_FILL_X_PX = LEFT_X_PX - 72;
const SET_FILL_WIDTH_PX = SET_ROW_WIDTH_PX + 72 + 16;
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
const GRID_EMBLEM_SIZE_PX = 60;
const GRID_CELL_PX = 74;
const GRID_CATEGORY_STRIDE_PX = 116;
const GRID_EMBLEM_OFFSET_Y_PX = 40;
const HALO_SIZE_PX = 88;
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
const DETAIL_RULE_Y_PX = 744;
const DETAIL_BUTTON_TOP_Y_PX = 768;
const DETAIL_BUTTON_HEIGHT_PX = 64;
// 테두리만 있으면 배경 위에서 비어 보여 키 안내 칸처럼 어두운 면을 채운다.
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
  marker: ListRowMarker;
  label: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
  hitArea: Phaser.GameObjects.Zone;
}

interface CellView {
  definition: NamedAchievementDefinition;
  image: Phaser.GameObjects.Image;
  newLabel: Phaser.GameObjects.Text;
}

interface SetGridView {
  container: Phaser.GameObjects.Container;
  groupTitles: readonly {
    row: readonly [NamedAchievementDefinition, ...NamedAchievementDefinition[]];
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
  setHalo: SelectedRowHalo;
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
  readonly selectTab: (tab: SummaryTab) => void;
  readonly selectSet: (set: AchievementSet) => void;
  readonly hover: (hover: ProfileTarget) => void;
  readonly unhover: (hover: ProfileTarget) => void;
  readonly pointer: ButtonPointer<ProfileButton>;
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
    achievements.find((status) => status.definition.id === id),
    'Missing achievement status',
    id,
  );
}

function formatEarned({ earned, total }: { earned: number; total: number }): string {
  return `${earned} / ${total}`;
}

function getAlbumName(catalog: AchievementCatalog, album: string): string {
  return requireDefined(catalog.albumNames.get(album), 'Unknown album', album);
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
    private readonly ports: ProfilePorts,
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
    const pointer: ButtonPointer<ProfileButton> = {
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
      },
      {
        isLeaving: () => this.exit.kind === 'leaving',
        captureKey: (event) =>
          controller.captureNicknameKey(readMenuAction(event), view.input.text),
        handleControlsKey: (event) => controller.handleControlsKey(event),
        handleMenuKey: (action) => this.handleMenuKey(action, controller),
      },
      pointer,
    );
    const soundEffects = new SoundEffects(this, this.save.loadSettings());
    const view = this.createView({
      selectTab: (tab) => controller.selectTab(tab),
      selectSet: (set) => controller.selectSet(set),
      hover: (hover) => controller.hover(hover),
      unhover: (hover) => controller.unhover(hover),
      pointer,
    });
    const controller = new ProfileController(this.ports, {
      render: (previous, next) => this.render(view, chrome, backButton, next, previous, controller),
      playFocusSound: () => soundEffects.play('menuFocus'),
      leaveToMain: () => {
        this.exit = exitScene(this, this.exit, {
          key: 'main',
          data: undefined,
        });
      },
    });
    const backButton = requireDefined(
      createHeaderAuxiliaryButtons(this, [
        {
          label: 'BACK',
          pointer: pointButton(pointer, 'back'),
        },
      ])[0],
      'Missing profile header button',
      'BACK',
    );
    const bindHover = (
      target: Phaser.GameObjects.GameObject,
      hover: ProfileTarget,
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
    view.input.onInput((value) => controller.changeNicknameInput(value));
    // Phaser 가 캔버스 mousedown 의 기본 동작을 막아 브라우저가 스스로 포커스를 옮기지 않는다.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => view.input.blur());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      controller.close();
      view.input.destroy();
    });
    chrome.start(view.title.getBounds());
    controller.start();
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
        marker: new ListRowMarker(
          this,
          {
            topYPx,
            heightPx: ROW_HEIGHT_PX,
            nodeXPx: SET_NODE_X_PX,
            fillXPx: SET_FILL_X_PX,
            fillWidthPx: SET_FILL_WIDTH_PX,
          },
          this.celestial.atlasPresentations[SET_NODE_IDLE_ID],
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
    const setHalo = new SelectedRowHalo(this, this.celestial.atlasPresentations[SELECTED_HALO_ID]);
    const sets = this.add.container(0, 0, [
      ...setRows.flatMap(({ marker, label, count, hitArea }) => [
        ...marker.getVisuals(),
        label,
        count,
        hitArea,
      ]),
      chevrons,
      setHalo.sprite,
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
      pointer: pointButton(actions.pointer, 'equip'),
    });
    const unequipButton = new Button(this, DETAIL_X_PX, DETAIL_BUTTON_TOP_Y_PX, {
      variant: 'secondary',
      focus: 'glow',
      colors: SURFACE_BUTTON_COLORS,
      label: this.i18n.t('collection.unsetFeatured'),
      widthPx: DETAIL_WIDTH_PX,
      heightPx: DETAIL_BUTTON_HEIGHT_PX,
      pointer: pointButton(actions.pointer, 'unequip'),
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
    chrome: MenuSceneChrome,
    backButton: Button,
    screen: ProfileScreenState,
    previous: ProfileScreenState | null,
    controller: ProfileController,
  ): void {
    const regions = getChangedRegions(previous, screen);
    for (const region of regions.profile) {
      switch (region) {
        case 'controls':
          chrome.renderControls(
            screen.isControlsOpen
              ? getControlsGuide(
                  this.i18n.t('controls', { returnObjects: true }),
                  this.save.loadSettings(),
                )
              : null,
          );
          break;
        case 'backButton':
          backButton.render(getProfileButtonView(screen, 'back'));
          break;
        case 'controlsEntry':
          chrome.renderControlsEntry(isProfileControlsEntryHovered(screen));
          break;
        case 'controlsClose':
          chrome.renderControlsClose(getProfileControlsCloseView(screen));
          break;
        default:
          this.renderProfile(view, screen.page, region);
      }
    }
    const loaded = getLoadedScreen(screen);
    if (loaded === null) {
      return;
    }
    for (const region of regions.summary) {
      this.renderSummary(view, loaded, region);
    }
    for (const region of regions.collection) {
      this.renderCollection(view, loaded, region, controller);
    }
  }

  private renderProfile(
    view: ProfileView,
    state: ProfileState,
    region: Exclude<ProfileRegion, 'controls' | 'backButton' | 'controlsEntry' | 'controlsClose'>,
  ): void {
    const page = getProfilePage(state);
    switch (region) {
      case 'pages': {
        const visibility = PAGE_VISIBILITY[page];
        view.notice.setVisible(visibility.isNoticeVisible);
        view.loading.show(
          visibility.isLoadingVisible
            ? {
                kind: 'loading',
                text: this.i18n.t('profile.loading'),
              }
            : { kind: 'none' },
        );
        view.summary.setVisible(visibility.isSummaryVisible);
        view.collection.setVisible(visibility.isCollectionVisible);
        return;
      }
      case 'title':
        view.title.setText(this.i18n.t(TITLE_KEYS[page]));
        return;
      case 'notice': {
        const notice = getProfileNotice(page);
        if (notice !== null) {
          view.noticeLines.forEach((line, index) =>
            line.setText(
              this.i18n.t(requireDefined(NOTICE_KEYS[notice][index], 'Missing notice key', index)),
            ),
          );
        }
        return;
      }
      case 'nicknameInput':
        this.renderNicknameInput(view, getNicknameEdit(state));
        return;
    }
  }

  private renderNicknameInput(view: ProfileView, edit: NicknameEdit): void {
    switch (edit.kind) {
      case 'idle':
        view.input.blur();
        view.input.setVisible(false);
        return;
      case 'editing':
        view.input.setText(edit.input);
        view.input.setVisible(true);
        view.input.setEnabled(true);
        view.input.focus();
        return;
      // 저장 중 입력은 응답이 오면 사라지므로 요청이 끝날 때까지 편집을 막는다.
      case 'saving':
        view.input.setText(edit.input);
        view.input.setVisible(true);
        view.input.setEnabled(false);
        view.input.blur();
        return;
    }
  }

  private renderSummary(view: ProfileView, screen: LoadedScreen, region: SummaryRegion): void {
    const state = screen.page;
    const { profile } = state;
    switch (region) {
      case 'labels':
        STAT_FIELDS.forEach((field, index) => {
          requireDefined(view.statRows[index], 'Missing stat row', field).label.setText(
            this.i18n.t(`profile.stats.${field}`),
          );
        });
        view.earnedRow.label.setText(this.i18n.t('profile.stats.earnedAchievements'));
        return;
      case 'identity':
        this.renderIdentity(view, state);
        return;
      case 'pen': {
        const pen = getPenAppearance(screen);
        view.pen
          .setVisible(pen !== 'hidden')
          .setTint(pen === 'emphasized' ? COLORS.textPrimary : COLORS.textSecondary);
        return;
      }
      case 'nicknameCount': {
        const input = getNicknameCountInput(state);
        view.nicknameCount.setVisible(input !== null);
        if (input !== null) {
          view.nicknameCount.setText(formatNicknameCount(input));
        }
        return;
      }
      case 'stats': {
        STAT_FIELDS.forEach((field, index) => {
          requireDefined(view.statRows[index], 'Missing stat row', field).value.setText(
            `${profile.stats[field]}`,
          );
        });
        const earned = getEarnedSummary(state);
        view.earnedRow.value.setText(formatEarned(earned.all));
        view.setRows.forEach(({ set, count }) => {
          count.setText(formatEarned(earned.bySet[set]));
        });
        return;
      }
      case 'summaryTab':
        view.stats.setVisible(state.summaryTab === 'stats');
        view.sets.setVisible(state.summaryTab === 'collection');
        return;
      case 'tabs':
        view.summaryTabs.render(
          (tab) =>
            getChoiceAppearance(screen, {
              kind: 'summaryTab',
              tab,
            }),
          COLORS.textPrimary,
        );
        return;
      case 'summaryFocus':
        this.renderSummaryFocus(view, screen);
        return;
      case 'setMarkers':
        view.setRows.forEach(({ set, marker }) => {
          const appearance = getChoiceAppearance(screen, {
            kind: 'setRow',
            set,
          });
          marker.render({
            node: this.celestial.atlasPresentations[SET_NODE_IDS[appearance]],
            isSelected: appearance === 'selected',
          });
        });
        return;
    }
  }

  private renderSummaryFocus(view: ProfileView, screen: LoadedScreen): void {
    const focusKind = getSummaryFocusKind(screen.page);
    view.focusStar.setVisible(focusKind === 'nickname');
    let selectedMarker: ListRowMarker | null = null;
    for (const { set, marker, label } of view.setRows) {
      const isSelected =
        getChoiceAppearance(screen, {
          kind: 'setRow',
          set,
        }) === 'selected';
      setTextWeight(label, isSelected ? TYPE_SCALE.primary.weight : ROW_LABEL_WEIGHT);
      slideSelectedRowContent(this, label, LEFT_X_PX, isSelected);
      if (isSelected) {
        selectedMarker = marker;
      }
    }
    view.setHalo.render(focusKind === 'set' ? selectedMarker : null);
  }

  private renderIdentity(view: ProfileView, state: LoadedProfileState): void {
    const { profile } = state;
    const look = getNicknameLook(state);
    const { fillAlpha, borderColor, borderAlpha, isNameShown, isHintShown } =
      NICKNAME_FIELD_LOOKS[look.kind];
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
    view.nickname.setText(profile.nickname).setVisible(isNameShown);
    view.nicknameHint.setVisible(isHintShown);
    switch (look.kind) {
      case 'idle':
      case 'editing':
        view.nicknameMessage.setVisible(false);
        break;
      case 'invalid':
        view.nicknameMessage
          .setText(this.i18n.t(`profile.nicknameErrors.${look.error}`))
          .setVisible(true);
        break;
    }
    view.featuredName.setVisible(isNameShown);
    const featured = getFeaturedIdentity(state);
    switch (featured.kind) {
      case 'none':
        view.featuredEmblem.setVisible(false);
        view.featuredName.setText(this.i18n.t('profile.noFeatured')).setX(LEFT_X_PX);
        setTextColor(view.featuredName, COLORS.textMuted);
        return;
      case 'equipped':
        view.featuredEmblem
          .setTexture(
            getAchievementEmblemTexture(
              this,
              profile.catalog,
              featured.achievement,
              FEATURED_EMBLEM_SIZE_PX,
            ),
          )
          .setVisible(featured.isEmblemShown);
        view.featuredName
          .setText(getAchievementName(this.i18n, featured.achievement))
          .setX(LEFT_X_PX + FEATURED_EMBLEM_SIZE_PX + FEATURED_NAME_GAP_PX);
        setTextColor(view.featuredName, FEATURED_COLOR);
        return;
    }
  }

  private renderCollection(
    view: ProfileView,
    screen: LoadedScreen,
    region: CollectionRegion,
    controller: ProfileController,
  ): void {
    const state = screen.page;
    const { profile, collection } = state;
    const id = collection.focusedId;
    switch (region) {
      case 'tabs':
        view.tabs.render(
          (set) =>
            getChoiceAppearance(screen, {
              kind: 'collectionTab',
              set,
            }),
          COLORS.textPrimary,
        );
        return;
      case 'tabStar': {
        const bounds = view.tabs.getBounds(collection.set);
        view.tabStar.setPosition(bounds.left - FOCUS_STAR_GAP_PX, bounds.centerY);
        return;
      }
      case 'grid': {
        const grid = this.requireGrid(view, state, controller);
        view.grids.forEach((shownGrid) => shownGrid.container.setVisible(shownGrid === grid));
        grid.groupTitles.forEach(({ row, text }) => {
          text.setText(
            `${this.getRowTitle(profile.catalog, row[0])}  ${formatEarned(getEarnedProgress(state, row))}`,
          );
        });
        grid.cells.forEach(({ definition, image, newLabel }) => {
          image.setAlpha(CELL_ALPHAS[getCellLook(state, definition.id)]);
          newLabel.setVisible(profile.newAchievements.has(definition));
        });
        return;
      }
      case 'halo': {
        const focusedCell = requireDefined(
          this.requireGrid(view, state, controller).cells.find((cell) => cell.definition.id === id),
          'Focused achievement has no cell',
          id,
        );
        view.halo.setPosition(focusedCell.image.x, focusedCell.image.y);
        return;
      }
      case 'detail':
        this.renderDetail(view, state);
        return;
      case 'featured': {
        const isFeatured = isFocusedFeatured(state);
        setCelestialLoopActive(view.featuredHalo, isFeatured);
        view.detailFeatured.setVisible(isFeatured);
        const featuredAction = getFeaturedAction(state);
        view.equipButton.setVisible(featuredAction === 'equip');
        view.unequipButton.setVisible(featuredAction === 'unequip');
        return;
      }
      case 'featuredSave':
        view.detailFailure
          .setText(this.i18n.t('profile.featuredSaveFailed'))
          .setVisible(state.featuredSave === 'failed');
        return;
      case 'equipButton':
        view.equipButton.render(getProfileButtonView(screen, 'equip'));
        return;
      case 'unequipButton':
        view.unequipButton.render(getProfileButtonView(screen, 'unequip'));
        return;
    }
  }

  private renderDetail(view: ProfileView, state: LoadedProfileState): void {
    const { definition } = getStatus(state.profile.achievements, state.collection.focusedId);
    const earning = getFocusedEarning(state);
    view.detailEmblem
      .setTexture(
        getAchievementEmblemTexture(this, state.profile.catalog, definition, DETAIL_EMBLEM_SIZE_PX),
      )
      .setAlpha(CELL_ALPHAS[earning.kind]);
    view.detailName.setText(getAchievementName(this.i18n, definition));
    view.detailCondition.setText(this.describeCondition(state.profile.catalog, definition));
    const progress = getProgressDisplay(state);
    view.detailProgressLabel.setText(this.i18n.t(progress.labelKey));
    switch (progress.value.kind) {
      case 'ratio':
        view.detailProgressValue.setText(`${progress.value.current} / ${progress.value.target}`);
        break;
      case 'noAssignedSongs':
        view.detailProgressValue.setText(this.i18n.t('collection.noAssignedSongs'));
        break;
    }
    switch (earning.kind) {
      case 'locked':
        view.detailStatusLabel.setText(this.i18n.t('collection.status'));
        view.detailStatus.setText(this.i18n.t('collection.locked'));
        setTextColor(view.detailStatus, COLORS.textMuted);
        view.detailRule.forEach((object) => object.setVisible(false));
        return;
      case 'earned':
        view.detailStatusLabel.setText(this.i18n.t('collection.earned'));
        view.detailStatus.setText(formatDate(earning.earnedAtMs));
        setTextColor(view.detailStatus, FEATURED_COLOR);
        view.detailRule.forEach((object) => object.setVisible(true));
        return;
    }
  }

  private requireGrid(
    view: ProfileView,
    state: LoadedProfileState,
    controller: ProfileController,
  ): SetGridView {
    const { set } = state.collection;
    const existing = view.grids.get(set);
    if (existing !== undefined) {
      return existing;
    }
    const rows = getCollectionRows(state.profile.achievements, set);
    const groupTitles = rows.map((row, rowIndex) => ({
      row,
      text: this.add.text(
        LEFT_X_PX,
        GRID_TOP_Y_PX + GRID_CATEGORY_STRIDE_PX * rowIndex,
        '',
        textStyle('secondary', COLORS.textSecondary, GROUP_TITLE_WEIGHT),
      ),
    }));
    const cells = rows.flatMap((row, rowIndex) =>
      row.map((definition, columnIndex) => {
        const { id } = definition;
        const xPx = LEFT_X_PX + GRID_EMBLEM_SIZE_PX / 2 + GRID_CELL_PX * columnIndex;
        const yPx =
          GRID_TOP_Y_PX +
          GRID_CATEGORY_STRIDE_PX * rowIndex +
          GRID_EMBLEM_OFFSET_Y_PX +
          GRID_EMBLEM_SIZE_PX / 2;
        const image = this.add.image(
          xPx,
          yPx,
          getAchievementEmblemTexture(this, state.profile.catalog, definition, GRID_EMBLEM_SIZE_PX),
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
          definition,
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
    view.collection.add(grid.container);
    view.grids.set(set, grid);
    return grid;
  }

  private getRowTitle(catalog: AchievementCatalog, definition: AchievementDefinition): string {
    return definition.category === 'album'
      ? getAlbumName(catalog, definition.rule.album)
      : this.i18n.t(`achievements.categories.${definition.category}`);
  }

  private describeCondition(
    catalog: AchievementCatalog,
    definition: AchievementDefinition,
  ): string {
    const condition = getAchievementCondition(definition);
    switch (condition.kind) {
      case 'count':
        return this.i18n.t(`achievements.conditions.${condition.key}`, {
          n: condition.target,
          mark:
            condition.mark === null
              ? undefined
              : this.i18n.t(`achievements.marks.${condition.mark}`),
        });
      case 'zodiacVisits':
        return this.i18n.t('achievements.conditions.zodiacVisits', {
          n: condition.target,
          mark: this.i18n.t(`achievements.marks.${condition.mark}`),
        });
      case 'zodiacComplete':
        return this.i18n.t('achievements.conditions.zodiacComplete', {
          zodiac: this.i18n.t(`achievements.zodiacs.${condition.zodiac}`),
          mark: this.i18n.t(`achievements.marks.${condition.mark}`),
        });
      case 'album':
        return this.i18n.t('achievements.conditions.album', {
          album: getAlbumName(catalog, condition.album),
          mark: this.i18n.t(`achievements.marks.${condition.mark}`),
        });
    }
  }
}
