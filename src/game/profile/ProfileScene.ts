import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { ACHIEVEMENT_SETS } from '../../data/achievements.js';
import type {
  AchievementCatalog,
  AchievementDefinition,
  AchievementSet,
  NamedAchievementDefinition,
} from '../../data/achievements.js';
import { NICKNAME_MAX_LENGTH } from '../../data/nickname.js';
import type { ProfileStats } from '../../data/profile.js';
import { RANKED_CHART_SORTS } from '../../data/ranking.js';
import { DIFFICULTIES } from '../../data/songs.js';
import { LANE_COUNTS } from '../../rhythm/lanes.js';
import type { Difficulty } from '../../rhythm/types.js';
import type { RankedChartSort } from '../../data/ranking.js';
import { requireDefined } from '../../invariant.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import type { CelestialCatalog } from '../celestial/state/celestialCatalog.js';
import {
  addCelestialSprite,
  queueCelestialTextures,
  setCelestialLoopActive,
} from '../celestial/view/celestialSprites.js';
import { renderZodiacFigure } from '../celestial/view/zodiacSign.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../app/config.js';
import {
  getControlsCloseView,
  getControlsGuide,
  getControlsHelpButtonView,
  isControlsEntryHovered,
  isControlsHelpShown,
  isControlsPanelOpen,
} from '../app/controlsGuide.js';
import { SCENE_KEYS, exitScene } from '../app/sceneRoutes.js';
import type { ProfileSceneData, SceneRequest } from '../app/sceneRoutes.js';
import { STAYING } from '../app/sceneExit.js';
import type { SceneExit } from '../app/sceneExit.js';
import { getAchievementName } from '../ui/state/achievementName.js';
import { isButtonHovered } from '../ui/state/buttonPointer.js';
import { formatLaneCount, formatScore } from '../ui/state/format.js';
import { getPlainRankValue } from '../ui/state/topRank.js';
import {
  getAchievementEmblemTexture,
  queueAchievementEmblemLoads,
} from '../ui/view/widgets/achievementEmblem.js';
import {
  AUXILIARY_LABEL_TYPE,
  FOOTER_AUXILIARY_ENTRY_GAP_PX,
  createFooterAuxiliaryButtons,
  getFooterAuxiliaryCenterYPx,
} from '../ui/view/widgets/auxiliaryButton.js';
import { Button, SURFACE_BUTTON_COLORS } from '../ui/view/widgets/Button.js';
import type { AccountSource } from '../ui/state/accountIdentity.js';
import { MenuSceneChrome, getMenuSceneTextureUses } from '../ui/view/widgets/MenuSceneChrome.js';
import { readMenuAction } from '../ui/state/menuAction.js';
import { HOVER_CURSOR } from '../ui/view/input/cursor.js';
import { queueImageLoads } from '../ui/view/textures/imageLoad.js';
import { addHairline } from '../ui/view/textures/hairline.js';
import { bindHoverTarget, bindPointer, pointButton } from '../ui/view/input/hoverTarget.js';
import { getBrushRectTexture } from '../ui/view/textures/brushRect.js';
import { addTextUnderline, placeTextUnderline } from '../ui/view/widgets/cometUnderline.js';
import { getSortIconTexture } from '../ui/view/widgets/listControlIcons.js';
import { SoundEffects, queueSoundEffects } from '../ui/view/soundEffects.js';
import { MENU_KEY_HINT_STYLE, addKeyHintRow } from '../ui/view/widgets/keyHintView.js';
import { TextInput } from '../ui/view/widgets/TextInput.js';
import { ConfirmDialog } from '../ui/view/widgets/ConfirmDialog.js';
import { setFittedText } from '../ui/view/widgets/fitText.js';
import { LOADING_STAR_ID } from '../ui/view/widgets/LoadingStar.js';
import { LoadFailurePanel } from '../ui/view/widgets/LoadFailurePanel.js';
import { NoticeText } from '../ui/view/widgets/NoticeText.js';
import { ScrollBar } from '../ui/view/widgets/ScrollBar.js';
import { TOP_RANK_GLINT_ID, TopRankBadge } from '../ui/view/widgets/TopRankBadge.js';
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
  typeStyle,
} from '../ui/view/theme.js';
import { TextTabs } from '../ui/view/widgets/TextTabs.js';
import {
  ListRowMarker,
  SelectedRowHalo,
  slideSelectedRowContent,
} from '../ui/view/widgets/listRowFocus.js';
import type { TextTabsStyle } from '../ui/view/widgets/TextTabs.js';
import { ProfileController } from './ProfileController.js';
import { ensureRowChevronTexture } from './view/profileTextures.js';
import type { ProfilePorts } from './ProfileController.js';
import {
  getAccountDeletion,
  PROFILE_RANKING_VISIBLE_ROWS,
  SUMMARY_TABS,
  getAchievementCondition,
  getCellLook,
  getChangedRegions,
  getChoiceAppearance,
  getCollectionRows,
  getDeletionButtonViews,
  getFeaturedAction,
  getFeaturedIdentity,
  getFocusedEarning,
  getLoadedScreen,
  getNicknameCountInput,
  getNicknameEdit,
  getNicknameLook,
  getPenAppearance,
  getProfileButtonView,
  getProfilePage,
  getProgressDisplay,
  getRankingRows,
  getRankingsNotice,
  getRankingsScroll,
  getSummaryFocusKind,
  isDeleteEntryShown,
  isFocusedFeatured,
} from './state/profileState.js';
import type {
  LoadedProfileState,
  NicknameLook,
  ProfilePageKind,
  ProfileTarget,
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
const DELETION_FAILURE_KEYS = {
  failed: {
    title: 'profile.deleteAccount.failedTitle',
    body: 'profile.deleteAccount.failedBody',
  },
  unknown: {
    title: 'profile.deleteAccount.unknownTitle',
    body: 'profile.deleteAccount.unknownBody',
  },
} as const;
const NOTICE_KEYS = {
  guest: ['profile.guestRecord', 'profile.guestSignIn'],
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
    isNoticeVisible: false,
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
const SUMMARY_TAB_LABEL_KEYS = {
  stats: 'profile.groups.records',
  collection: 'profile.groups.collection',
  ranking: 'profile.groups.ranking',
} as const satisfies Record<SummaryTab, string>;
const SUMMARY_TAB_Y_PX = 332;
const ROWS_TOP_Y_PX = 380;
const ROW_HEIGHT_PX = 90;
const SET_ROW_WIDTH_PX = 900;
const VALUE_RIGHT_X_PX = LEFT_X_PX + 800;
const RANKING_ROW_HEIGHT_PX = 60;
// 늦은 응답을 기다리는 동안 직전 목록이 지금 결과가 아님을 보인다.
const RANKING_DIMMED_ALPHA = 0.5;
const RANKING_ROWS_TOP_Y_PX = ROWS_TOP_Y_PX + 52;
const RANKING_CONTROL_CENTER_Y_PX = ROWS_TOP_Y_PX + 16;
const RANKING_CONTROL_HEIGHT_PX = 44;
const RANKING_CONTROL_ICON_SIZE_PX = 26;
const RANKING_CONTROL_ICON_GAP_PX = 8;
const RANKING_CONTROL_GAP_PX = 44;
const RANKING_FILTER_GAP_PX = 18;
const RANKING_FILTER_SEPARATOR_HEIGHT_PX = 18;
const RANKING_FILTER_SEPARATOR_ALPHA = 0.22;
const RANKING_SORT_LABEL_KEYS = {
  score: 'profile.rankingControls.score',
  achieved: 'profile.rankingControls.achieved',
} as const satisfies Record<RankedChartSort, string>;
const RANKING_DIFFICULTY_LABEL_KEYS = {
  easy: 'profile.rankingControls.easy',
  normal: 'profile.rankingControls.normal',
  hard: 'profile.rankingControls.hard',
  expert: 'profile.rankingControls.expert',
} as const satisfies Record<Difficulty, string>;
const RANKING_BADGE_X_PX = LEFT_X_PX;
// 가장 긴 TOP 100+ 표시가 별자리와 겹치지 않는 폭이다.
const RANKING_ZODIAC_LEFT_X_PX = RANKING_BADGE_X_PX + 134;
const RANKING_ZODIAC_RIGHT_X_PX = RANKING_ZODIAC_LEFT_X_PX + 44;
const RANKING_ZODIAC_INSET_Y_PX = 8;
// 별 크기에 하한이 있어 작은 크기로 바로 만들면 뭉개지므로 크게 만든 뒤 칸에 맞춰 줄인다.
const RANKING_ZODIAC_SOURCE_SPAN_PX = 140;
const RANKING_TITLE_X_PX = RANKING_ZODIAC_RIGHT_X_PX + 16;
const RANKING_RIGHT_X_PX = LEFT_X_PX + 1080;
const RANKINGS_NOTICE_CENTER_X_PX = (LEFT_X_PX + RANKING_RIGHT_X_PX) / 2;
const RANKINGS_NOTICE_CENTER_Y_PX = ROWS_TOP_Y_PX + 190;
const RANKING_CHART_X_PX = RANKING_RIGHT_X_PX - 286;
const RANKING_DETAIL_TYPE = {
  sizePx: 20,
  weight: 400,
} as const;
const RANKING_SCORE_WEIGHT = 500;
const RANKING_TITLE_CHART_GAP_PX = 24;
const RANKING_BADGE_NUMBER_SIZE_PX = 34;
const RANKING_SCROLLBAR_X_PX = RANKING_RIGHT_X_PX + 40;
const RANKING_SCROLLBAR_INSET_Y_PX = 10;
const SET_NODE_X_PX = LEFT_X_PX - LIST_ROW.nodeOffsetXPx;
const SET_FILL_X_PX = LEFT_X_PX - 72;
const SET_FILL_WIDTH_PX = SET_ROW_WIDTH_PX + 72 + 16;
const SET_FILL_INSET_Y_PX = 7;
const SET_NODE_IDLE_ID = 'R15';
const SET_NODE_HOVER_ID = 'R16';
const SET_NODE_SELECTED_ID = 'R17';
const CHEVRON_CENTER_X_PX = LEFT_X_PX + 884;
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
const DETAIL_NAME_Y_PX = 476;
const DETAIL_CONDITION_Y_PX = 536;
const DETAIL_PROGRESS_Y_PX = 610;
const DETAIL_EARNED_Y_PX = 652;
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

interface RankingControlView {
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  hit: Phaser.GameObjects.Zone;
}

interface RankingFilterView {
  target: Extract<
    ProfileTarget,
    { readonly kind: 'rankingAllOption' | 'rankingLaneOption' | 'rankingDifficultyOption' }
  >;
  label: Phaser.GameObjects.Text;
  underline: Phaser.GameObjects.Image;
  hit: Phaser.GameObjects.Zone;
  leftXPx: number;
}

interface RankingRowView {
  badge: TopRankBadge;
  zodiacStars: Phaser.GameObjects.Image;
  zodiacLines: Phaser.GameObjects.Image;
  title: Phaser.GameObjects.Text;
  chart: Phaser.GameObjects.Text;
  score: Phaser.GameObjects.Text;
  dividerLine: Phaser.GameObjects.Image;
  dividerGlint: Phaser.GameObjects.Sprite;
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
  loadFailure: LoadFailurePanel;
  summary: Phaser.GameObjects.Container;
  nicknameField: Phaser.GameObjects.Image;
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
  rankings: Phaser.GameObjects.Container;
  rankingRows: readonly RankingRowView[];
  rankingRowsLayer: Phaser.GameObjects.Container;
  rankingSortControl: RankingControlView;
  rankingFilters: readonly RankingFilterView[];
  rankingsScrollBar: ScrollBar;
  rankingsNotice: NoticeText;
  rankingsFailure: LoadFailurePanel;
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
  detailEarnedLabel: Phaser.GameObjects.Text;
  detailEarnedDate: Phaser.GameObjects.Text;
  featuredHalo: Phaser.GameObjects.Sprite;
  detailRule: readonly (Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible)[];
  equipButton: Button;
  unequipButton: Button;
  detailFailure: Phaser.GameObjects.Text;
  input: TextInput;
  deleteEntry: Phaser.GameObjects.Text;
  deleteDialog: ConfirmDialog;
}

function formatEarned({ earned, total }: { earned: number; total: number }): string {
  return `${earned} / ${total}`;
}

// 세트 이름은 여러 줄로 쌓인 고유 명칭이라 ALL CAPS 대신 Title Case 로 단어 모양을 살린다.
function setLabel(set: AchievementSet): string {
  const words = set.replace(/([A-Z])/g, ' $1');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export class ProfileScene extends Phaser.Scene {
  private returnTo: SceneRequest = {
    key: 'main',
    data: undefined,
  };
  private exit: SceneExit<SceneRequest> = STAYING;

  constructor(
    private readonly save: LocalSave,
    private readonly i18n: I18n,
    private readonly celestial: CelestialCatalog,
    private readonly ports: ProfilePorts,
    private readonly account: AccountSource,
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
    queueAchievementEmblemLoads(this);
    queueSoundEffects(this);
    queueCelestialTextures(this, this.celestial, [
      ...getMenuSceneTextureUses(this.celestial, 'result'),
      this.celestial.atlasPresentations[FOCUS_STAR_ID],
      this.celestial.atlasPresentations[SELECTED_HALO_ID],
      this.celestial.atlasPresentations[DIVIDER_GLINT_ID],
      this.celestial.atlasPresentations[LOADING_STAR_ID],
      this.celestial.atlasPresentations[SET_NODE_IDLE_ID],
      this.celestial.atlasPresentations[SET_NODE_HOVER_ID],
      this.celestial.atlasPresentations[SET_NODE_SELECTED_ID],
      this.celestial.atlasPresentations[TOP_RANK_GLINT_ID],
    ]);
  }

  create(data: ProfileSceneData): void {
    this.exit = STAYING;
    this.returnTo = data.returnTo;
    const controller = new ProfileController(
      this.ports,
      {
        render: (previous, screen) => {
          const regions = getChangedRegions(previous, screen);
          for (const region of regions.profile) {
            switch (region) {
              case 'controls':
                chrome.controls.render(
                  isControlsPanelOpen(screen)
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
              case 'retryButton':
                view.loadFailure.renderRetry(getProfileButtonView(screen, 'retry'));
                view.rankingsFailure.renderRetry(getProfileButtonView(screen, 'retry'));
                break;
              case 'controlsEntry':
                chrome.renderControlsEntry(isControlsEntryHovered(screen.hover));
                break;
              case 'controlsClose':
                chrome.controls.closeButton.render(getControlsCloseView(screen.hover));
                break;
              case 'controlsHelpCard':
                chrome.controls.helpCard.render(isControlsHelpShown(screen));
                break;
              case 'controlsHelpButton':
                chrome.controls.renderHelpButton(getControlsHelpButtonView(screen));
                break;
              case 'accountButton':
                chrome.accountCard.signOutButton.render(
                  getProfileButtonView(screen, 'accountSignOut'),
                );
                break;
              case 'deleteEntry':
                view.deleteEntry.setVisible(isDeleteEntryShown(screen));
                setTextColor(
                  view.deleteEntry,
                  isButtonHovered(screen.hover, 'deleteEntry')
                    ? COLORS.textSecondary
                    : COLORS.textMuted,
                );
                break;
              case 'deleteDialog': {
                const deletion = getAccountDeletion(screen);
                const dialog = view.deleteDialog;
                switch (deletion.kind) {
                  case 'closed':
                    dialog.render(null);
                    break;
                  case 'confirming':
                  case 'deleting':
                    dialog.render({
                      title: this.i18n.t('profile.deleteAccount.title'),
                      body: this.i18n.t('profile.deleteAccount.body'),
                      emphasis: this.i18n.t('profile.deleteAccount.emphasis'),
                      cancelLabel: this.i18n.t('profile.deleteAccount.cancel'),
                      acceptLabel: this.i18n.t(
                        deletion.kind === 'deleting'
                          ? 'profile.deleteAccount.deleting'
                          : 'profile.deleteAccount.accept',
                      ),
                      acceptTone: 'danger',
                    });
                    break;
                  case 'failed':
                  case 'unknown': {
                    const keys = DELETION_FAILURE_KEYS[deletion.kind];
                    dialog.render({
                      title: this.i18n.t(keys.title),
                      body: this.i18n.t(keys.body),
                      cancelLabel: this.i18n.t('profile.deleteAccount.close'),
                      acceptLabel: this.i18n.t('profile.deleteAccount.retry'),
                      acceptTone: 'danger',
                    });
                    break;
                  }
                }

                break;
              }
              case 'deleteButtons': {
                const { cancel, accept } = getDeletionButtonViews(screen);
                view.deleteDialog.renderButtons(cancel, accept);
                break;
              }
              default: {
                const state = screen.page;
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
                    // 로딩 별은 요약 컨테이너 밖에 있어 요약을 숨길 때 함께 숨긴다.
                    view.rankingsNotice.setVisible(
                      visibility.isSummaryVisible &&
                        state.kind === 'loaded' &&
                        state.summaryTab === 'ranking',
                    );
                    break;
                  }
                  case 'title':
                    view.title.setText(this.i18n.t(TITLE_KEYS[page]));
                    break;
                  case 'notice': {
                    view.loadFailure.render(
                      page === 'failed'
                        ? {
                            title: this.i18n.t('profile.loadFailed'),
                            body: this.i18n.t('loadFailure.body'),
                          }
                        : null,
                    );
                    if (page === 'guest') {
                      view.noticeLines.forEach((line, index) =>
                        line.setText(
                          this.i18n.t(
                            requireDefined(NOTICE_KEYS.guest[index], 'Missing notice key', index),
                          ),
                        ),
                      );
                    }
                    break;
                  }
                  case 'nicknameInput': {
                    const edit = getNicknameEdit(state);
                    switch (edit.kind) {
                      case 'idle':
                        view.input.blur();
                        view.input.setVisible(false);
                        break;
                      case 'editing':
                        view.input.setText(edit.input);
                        view.input.setVisible(true);
                        view.input.setEnabled(true);
                        view.input.focus();
                        break;
                      // 저장 중 입력은 응답이 오면 사라지므로 요청이 끝날 때까지 편집을 막는다.
                      case 'saving':
                        view.input.setText(edit.input);
                        view.input.setVisible(true);
                        view.input.setEnabled(false);
                        view.input.blur();
                        break;
                    }

                    break;
                  }
                }
              }
            }
          }
          const loaded = getLoadedScreen(screen);
          if (loaded === null) {
            return;
          }
          const state = loaded.page;
          const { profile, collection } = state;
          const id = collection.focusedId;
          for (const region of regions.summary) {
            switch (region) {
              case 'labels':
                for (const [index, field] of STAT_FIELDS.entries()) {
                  requireDefined(view.statRows[index], 'Missing stat row', field).label.setText(
                    this.i18n.t(`profile.stats.${field}`),
                  );
                }
                view.earnedRow.label.setText(this.i18n.t('profile.stats.earnedAchievements'));
                break;
              case 'identity': {
                const look = getNicknameLook(state);
                const { fillAlpha, borderColor, borderAlpha, isNameShown, isHintShown } =
                  NICKNAME_FIELD_LOOKS[look.kind];
                view.nicknameField.setTexture(
                  getBrushRectTexture(this, {
                    widthPx: NICKNAME_FIELD_WIDTH_PX,
                    heightPx: NICKNAME_FIELD_HEIGHT_PX,
                    radiusPx: RADIUS.mediumPx,
                    fillColor: CELESTIAL_COLORS.surface,
                    fillAlpha,
                    border: {
                      color: borderColor,
                      alpha: borderAlpha,
                      widthPx: 1,
                    },
                  }),
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
                if (featured.kind === 'none') {
                  view.featuredEmblem.setVisible(false);
                  view.featuredName.setText(this.i18n.t('profile.noFeatured')).setX(LEFT_X_PX);
                  setTextColor(view.featuredName, COLORS.textMuted);
                } else {
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
                }

                chrome.accountCard.render(this.account.getIdentity());
                break;
              }
              case 'pen': {
                const pen = getPenAppearance(loaded);
                view.pen
                  .setVisible(pen !== 'hidden')
                  .setTint(pen === 'emphasized' ? COLORS.textPrimary : COLORS.textSecondary);
                break;
              }
              case 'nicknameCount': {
                const input = getNicknameCountInput(state);
                view.nicknameCount.setVisible(input !== null);
                if (input !== null) {
                  view.nicknameCount.setText(`${Array.from(input).length}/${NICKNAME_MAX_LENGTH}`);
                }
                break;
              }
              case 'stats': {
                for (const [index, field] of STAT_FIELDS.entries()) {
                  requireDefined(view.statRows[index], 'Missing stat row', field).value.setText(
                    `${profile.stats[field]}`,
                  );
                }
                view.earnedRow.value.setText(formatEarned(state.earned.all));
                for (const { set, count } of view.setRows) {
                  count.setText(formatEarned(state.earned.bySet[set]));
                }
                break;
              }
              case 'summaryTab':
                view.stats.setVisible(state.summaryTab === 'stats');
                view.sets.setVisible(state.summaryTab === 'collection');
                view.rankings.setVisible(state.summaryTab === 'ranking');
                break;
              case 'tabs':
                view.summaryTabs.render(
                  (tab) =>
                    getChoiceAppearance(loaded, {
                      kind: 'summaryTab',
                      tab,
                    }),
                  COLORS.textPrimary,
                );
                break;
              case 'summaryFocus': {
                const focusKind = getSummaryFocusKind(loaded.page);
                view.focusStar.setVisible(focusKind === 'nickname');
                let selectedMarker: ListRowMarker | null = null;
                for (const { set, marker, label } of view.setRows) {
                  const isSelected =
                    getChoiceAppearance(loaded, {
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

                break;
              }
              case 'setMarkers':
                for (const { set, marker } of view.setRows) {
                  const appearance = getChoiceAppearance(loaded, {
                    kind: 'setRow',
                    set,
                  });
                  marker.render({
                    node: this.celestial.atlasPresentations[SET_NODE_IDS[appearance]],
                    isSelected: appearance === 'selected',
                  });
                }
                break;
              case 'rankings': {
                const { rows, isDimmed } = getRankingRows(state);
                for (const [index, row] of view.rankingRows.entries()) {
                  const entry = rows[index] ?? null;
                  const {
                    badge,
                    zodiacStars,
                    zodiacLines,
                    title,
                    chart,
                    score,
                    dividerLine,
                    dividerGlint,
                  } = row;
                  const isVisible = entry !== null;
                  zodiacStars.setVisible(isVisible);
                  zodiacLines.setVisible(isVisible);
                  title.setVisible(isVisible);
                  chart.setVisible(isVisible);
                  score.setVisible(isVisible);
                  dividerLine.setVisible(isVisible);
                  dividerGlint.setVisible(isVisible);
                  badge.render(entry?.rank ?? null);
                  const outsideTopRank = entry === null ? null : getPlainRankValue(entry.rank);
                  if (outsideTopRank !== null) {
                    badge.renderOutsideTop(outsideTopRank);
                  }
                  if (entry === null) {
                    continue;
                  }
                  chart.setText(
                    `${formatLaneCount(entry.laneCount)}   ${entry.difficulty.toUpperCase()}`,
                  );
                  renderZodiacFigure(
                    zodiacStars,
                    zodiacLines,
                    entry.constellation,
                    {
                      leftXPx: RANKING_ZODIAC_LEFT_X_PX,
                      rightXPx: RANKING_ZODIAC_RIGHT_X_PX,
                      topYPx: title.y - RANKING_ROW_HEIGHT_PX / 2 + RANKING_ZODIAC_INSET_Y_PX,
                      bottomYPx: title.y + RANKING_ROW_HEIGHT_PX / 2 - RANKING_ZODIAC_INSET_Y_PX,
                    },
                    RANKING_ZODIAC_SOURCE_SPAN_PX,
                  );
                  score.setText(formatScore(entry.score));
                  setFittedText(
                    title,
                    entry.songTitle,
                    chart.x - RANKING_TITLE_CHART_GAP_PX - title.x,
                  );
                }
                view.rankingRowsLayer.setAlpha(isDimmed ? RANKING_DIMMED_ALPHA : 1);
                break;
              }
              case 'rankingControls': {
                const sortColor =
                  getChoiceAppearance(loaded, { kind: 'rankingSort' }) === 'emphasized'
                    ? COLORS.textPrimary
                    : COLORS.textSecondary;
                view.rankingSortControl.label.setText(
                  this.i18n.t(RANKING_SORT_LABEL_KEYS[state.rankingSort]),
                );
                setTextColor(view.rankingSortControl.label, sortColor);
                view.rankingSortControl.icon.setTint(sortColor);
                for (const { target, label, underline } of view.rankingFilters) {
                  const appearance = getChoiceAppearance(loaded, target);
                  setTextWeight(
                    label,
                    appearance === 'selected' ? RANKING_SCORE_WEIGHT : RANKING_DETAIL_TYPE.weight,
                  );
                  setTextColor(
                    label,
                    appearance === 'normal' ? COLORS.textMuted : COLORS.textPrimary,
                  );
                  placeTextUnderline(underline, label).setVisible(appearance === 'selected');
                }

                break;
              }
              case 'rankingsScroll':
                view.rankingsScrollBar.render(getRankingsScroll(state), {
                  topYPx: RANKING_ROWS_TOP_Y_PX + RANKING_SCROLLBAR_INSET_Y_PX,
                  heightPx:
                    RANKING_ROW_HEIGHT_PX * PROFILE_RANKING_VISIBLE_ROWS -
                    RANKING_SCROLLBAR_INSET_Y_PX * 2,
                });
                break;
              case 'rankingsNotice': {
                const notice = getRankingsNotice(state);
                view.rankingsFailure.render(
                  notice === 'failed'
                    ? {
                        title: this.i18n.t('profile.rankingsFailed'),
                        body: this.i18n.t('loadFailure.body'),
                      }
                    : null,
                );
                switch (notice) {
                  case 'none':
                  case 'failed':
                    view.rankingsNotice.show({ kind: 'none' });
                    break;
                  case 'loading':
                    view.rankingsNotice.show({
                      kind: 'loading',
                      text: this.i18n.t('profile.rankingsLoading'),
                    });
                    break;
                  case 'empty':
                    view.rankingsNotice.show({
                      kind: 'text',
                      text: this.i18n.t('profile.rankingsEmpty'),
                    });
                    break;
                }

                break;
              }
            }
          }
          for (const region of regions.collection) {
            switch (region) {
              case 'tabs':
                view.tabs.render(
                  (set) =>
                    getChoiceAppearance(loaded, {
                      kind: 'collectionTab',
                      set,
                    }),
                  COLORS.textPrimary,
                );
                break;
              case 'tabStar': {
                const bounds = view.tabs.getBounds(collection.set);
                view.tabStar.setPosition(bounds.left - FOCUS_STAR_GAP_PX, bounds.centerY);
                break;
              }
              case 'grid': {
                const grid = this.requireGrid(view, state, controller);
                view.grids.forEach((shownGrid) =>
                  shownGrid.container.setVisible(shownGrid === grid),
                );
                for (const { row, text } of grid.groupTitles) {
                  const progress = requireDefined(
                    state.earned.rows.get(row[0].id),
                    'Missing collection row progress',
                    row[0].id,
                  );
                  const [definition] = row;
                  const title =
                    definition.category === 'album'
                      ? requireDefined(
                          profile.catalog.albums.get(definition.rule.album),
                          'Unknown album',
                          definition.rule.album,
                        ).name
                      : this.i18n.t(`achievements.categories.${definition.category}`);
                  text.setText(`${title}  ${formatEarned(progress)}`);
                }
                for (const { definition, image, newLabel } of grid.cells) {
                  image.setAlpha(CELL_ALPHAS[getCellLook(state, definition.id)]);
                  newLabel.setVisible(profile.newAchievements.has(definition));
                }
                break;
              }
              case 'halo': {
                const focusedCell = requireDefined(
                  this.requireGrid(view, state, controller).cells.find(
                    (cell) => cell.definition.id === id,
                  ),
                  'Focused achievement has no cell',
                  id,
                );
                view.halo.setPosition(focusedCell.image.x, focusedCell.image.y);
                break;
              }
              case 'detail': {
                const { definition } = requireDefined(
                  state.profile.achievements.find(
                    (status) => status.definition.id === state.collection.focusedId,
                  ),
                  'Missing achievement status',
                  state.collection.focusedId,
                );
                const earning = getFocusedEarning(state);
                view.detailEmblem
                  .setTexture(
                    getAchievementEmblemTexture(
                      this,
                      state.profile.catalog,
                      definition,
                      DETAIL_EMBLEM_SIZE_PX,
                    ),
                  )
                  .setAlpha(CELL_ALPHAS[earning.kind]);
                view.detailName.setText(getAchievementName(this.i18n, definition));
                const describeCondition = (
                  catalog: AchievementCatalog,
                  definition: AchievementDefinition,
                ): string => {
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
                        album: requireDefined(
                          catalog.albums.get(condition.album),
                          'Unknown album',
                          condition.album,
                        ).name,
                        mark: this.i18n.t(`achievements.marks.${condition.mark}`),
                      });
                  }
                };
                view.detailCondition.setText(describeCondition(state.profile.catalog, definition));
                const progress = getProgressDisplay(state);
                view.detailProgressLabel.setText(this.i18n.t('collection.progress'));
                view.detailProgressValue.setText(
                  progress.kind === 'ratio'
                    ? `${progress.current} / ${progress.target}`
                    : this.i18n.t('collection.noAssignedSongs'),
                );
                const isEarned = earning.kind === 'earned';
                view.detailEarnedLabel.setVisible(isEarned);
                view.detailEarnedDate.setVisible(isEarned);
                view.detailRule.forEach((object) => object.setVisible(isEarned));
                if (isEarned) {
                  const date = new Date(earning.earnedAtMs);
                  const pad = (value: number): string => `${value}`.padStart(2, '0');
                  view.detailEarnedDate.setText(
                    `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`,
                  );
                }

                break;
              }
              case 'featured': {
                const isFeatured = isFocusedFeatured(state);
                setCelestialLoopActive(view.featuredHalo, isFeatured);
                const featuredAction = getFeaturedAction(state);
                view.equipButton.setVisible(featuredAction === 'equip');
                view.unequipButton.setVisible(featuredAction === 'unequip');
                break;
              }
              case 'featuredSave':
                view.detailFailure
                  .setText(this.i18n.t('profile.featuredSaveFailed'))
                  .setVisible(state.featuredSave === 'failed');
                break;
              case 'equipButton':
                view.equipButton.render(getProfileButtonView(loaded, 'equip'));
                break;
              case 'unequipButton':
                view.unequipButton.render(getProfileButtonView(loaded, 'unequip'));
                break;
            }
          }
        },
        playSound: (sound) => soundEffects.play(sound),
        leave: () => {
          this.exit = exitScene(this, this.exit, this.returnTo);
        },
        leaveToMain: () => {
          this.exit = exitScene(this, this.exit, {
            key: 'main',
            data: undefined,
          });
        },
      },
      ROW_HEIGHT_PX,
    );
    const chrome = new MenuSceneChrome(
      this,
      {
        celestial: this.celestial,
        screen: 'result',
        account: {
          kind: 'card',
          catalog: this.account.catalog,
          pointer: controller,
        },
      },
      {
        isLeaving: () => this.exit.kind === 'leaving',
        captureKey: (event) => {
          const action = readMenuAction(event);
          return (
            controller.captureDeletionKey(action) ||
            controller.captureNicknameKey(action, view.input.text)
          );
        },
        handleControlsKey: (event) => controller.handleControlsKey(event),
        handleMenuKey: (action) => {
          switch (action) {
            case 'confirm':
              controller.confirm();
              return;
            case 'back':
              controller.back();
              return;
            case 'previousTab':
              controller.switchTab('previous');
              return;
            case 'nextTab':
              controller.switchTab('next');
              return;
            case null:
              return;
            default:
              controller.moveFocus(action);
          }
        },
      },
      controller,
    );
    chrome.accountCard.render(this.account.getIdentity());
    const soundEffects = new SoundEffects(this, this.save.loadSettings());
    const view = this.createView(controller);
    const backButton = requireDefined(
      createFooterAuxiliaryButtons(this, [
        {
          label: 'BACK',
          pointer: pointButton(controller, 'back'),
        },
      ])[0],
      'Missing profile header button',
      'BACK',
    );
    view.deleteEntry.setX(backButton.x - FOOTER_AUXILIARY_ENTRY_GAP_PX);
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
    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (_pointer: Phaser.Input.Pointer, _over: unknown, _deltaX: number, deltaY: number) => {
        controller.scrollByWheel(deltaY, this.time.now);
      },
    );
    // Phaser 가 캔버스 mousedown 의 기본 동작을 막아 브라우저가 스스로 포커스를 옮기지 않는다.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => view.input.blur());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      controller.close();
      view.input.destroy();
    });
    chrome.start(view.title.getBounds());
    controller.start();
  }

  private createView(controller: ProfileController): ProfileView {
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
    const retryPointer = pointButton(controller, 'retry');
    const loadFailure = new LoadFailurePanel(
      this,
      {
        leftXPx: LEFT_X_PX,
        centerYPx: GAME_HEIGHT / 2,
      },
      retryPointer,
    );
    const nicknameFieldRightXPx = LEFT_X_PX + NICKNAME_FIELD_WIDTH_PX;
    const nicknameField = this.add
      .image(LEFT_X_PX, NICKNAME_FIELD_TOP_Y_PX, '__DEFAULT')
      .setOrigin(0, 0);
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
        label: this.i18n.t(SUMMARY_TAB_LABEL_KEYS[tab]),
      })),
      {
        xPx: LEFT_X_PX,
        align: 'left',
        topYPx: SUMMARY_TAB_Y_PX,
      },
      TAB_STYLE,
      {
        onSelect: controller.selectTab.bind(controller),
        onHover: controller.hoverSummaryTab.bind(controller),
        onUnhover: controller.unhoverSummaryTab.bind(controller),
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
    const chevronTexture = ensureRowChevronTexture(this);
    const chevrons: Phaser.GameObjects.Image[] = [];
    const setRows = ACHIEVEMENT_SETS.map((set, index) => {
      const topYPx = ROWS_TOP_Y_PX + ROW_HEIGHT_PX * index;
      const centerYPx = topYPx + ROW_HEIGHT_PX / 2;
      chevrons.push(this.add.image(CHEVRON_CENTER_X_PX, centerYPx, chevronTexture));
      return {
        set,
        marker: new ListRowMarker(
          this,
          {
            topYPx: topYPx + SET_FILL_INSET_Y_PX,
            heightPx: ROW_HEIGHT_PX - SET_FILL_INSET_Y_PX * 2,
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
      ...chevrons,
      setHalo.sprite,
    ]);
    const focusStar = addCelestialSprite(
      this,
      this.celestial.atlasPresentations[FOCUS_STAR_ID],
      LEFT_X_PX - FOCUS_STAR_GAP_PX,
      NICKNAME_CENTER_Y_PX,
    );
    const rankingRows = Array.from({ length: PROFILE_RANKING_VISIBLE_ROWS }, (_, index) => {
      const topYPx = RANKING_ROWS_TOP_Y_PX + RANKING_ROW_HEIGHT_PX * index;
      const centerYPx = topYPx + RANKING_ROW_HEIGHT_PX / 2;
      const dividerYPx = topYPx + RANKING_ROW_HEIGHT_PX;
      return {
        badge: new TopRankBadge(this, this.celestial, {
          xPx: RANKING_BADGE_X_PX,
          yPx: centerYPx,
          align: 'left',
          hasWord: true,
          numberSizePx: RANKING_BADGE_NUMBER_SIZE_PX,
        }),
        zodiacStars: this.add.image(0, 0, '__DEFAULT').setBlendMode(Phaser.BlendModes.SCREEN),
        zodiacLines: this.add.image(0, 0, '__DEFAULT'),
        title: text(RANKING_TITLE_X_PX, centerYPx, 'primary', COLORS.textPrimary).setOrigin(0, 0.5),
        chart: this.add
          .text(RANKING_CHART_X_PX, centerYPx, '', typeStyle(RANKING_DETAIL_TYPE, COLORS.textMuted))
          .setOrigin(0, 0.5),
        score: text(
          RANKING_RIGHT_X_PX,
          centerYPx,
          'primary',
          COLORS.textPrimary,
          RANKING_SCORE_WEIGHT,
        ).setOrigin(1, 0.5),
        dividerLine: addHairline(this, LEFT_X_PX, dividerYPx, RANKING_RIGHT_X_PX),
        dividerGlint: addCelestialSprite(
          this,
          this.celestial.atlasPresentations[DIVIDER_GLINT_ID],
          RANKING_RIGHT_X_PX,
          dividerYPx,
        ),
      };
    });
    const addRankingFilter = (
      rightXPx: number,
      {
        text,
        target,
        onActivate,
      }: {
        text: string;
        target: RankingFilterView['target'];
        onActivate: () => void;
      },
    ): RankingFilterView => {
      const label = this.add
        .text(
          0,
          RANKING_CONTROL_CENTER_Y_PX,
          text,
          typeStyle(RANKING_DETAIL_TYPE, COLORS.textMuted),
        )
        .setOrigin(0.5);
      // 켜지면 글자가 굵어져 폭이 늘므로, 옆 항목이 밀리지 않게 굵은 폭으로 자리를 잡는다.
      setTextWeight(label, RANKING_SCORE_WEIGHT);
      const widthPx = label.width;
      setTextWeight(label, RANKING_DETAIL_TYPE.weight);
      const leftXPx = rightXPx - widthPx;
      label.setX(leftXPx + widthPx / 2);
      const hit = this.add
        .zone(
          leftXPx - RANKING_FILTER_GAP_PX / 2,
          RANKING_CONTROL_CENTER_Y_PX,
          widthPx + RANKING_FILTER_GAP_PX,
          RANKING_CONTROL_HEIGHT_PX,
        )
        .setOrigin(0, 0.5);
      bindHoverTarget(hit, {
        onOver: () => controller.hover(target),
        onOut: () => controller.unhover(target),
        onActivate,
      });
      return {
        target,
        label,
        underline: addTextUnderline(this, label, COLORS.textPrimary).setVisible(false),
        hit,
        leftXPx,
      };
    };
    const addRankingFilterGroup = (
      rightXPx: number,
      items: readonly Parameters<typeof addRankingFilter>[1][],
    ): readonly RankingFilterView[] => {
      let nextRightXPx = rightXPx;
      return items.toReversed().map((item) => {
        const filter = addRankingFilter(nextRightXPx, item);
        nextRightXPx = filter.leftXPx - RANKING_FILTER_GAP_PX;
        return filter;
      });
    };
    const addRankingFilterSeparator = (groupLeftXPx: number): Phaser.GameObjects.Rectangle =>
      this.add.rectangle(
        groupLeftXPx - RANKING_FILTER_GAP_PX,
        RANKING_CONTROL_CENTER_Y_PX,
        1,
        RANKING_FILTER_SEPARATOR_HEIGHT_PX,
        COLORS.textPrimary,
        RANKING_FILTER_SEPARATOR_ALPHA,
      );
    const groupLeftXPx = (filters: readonly RankingFilterView[]): number =>
      Math.min(...filters.map(({ leftXPx }) => leftXPx));
    const rankingDifficultyFilters = addRankingFilterGroup(
      RANKING_RIGHT_X_PX,
      DIFFICULTIES.map((filter) => ({
        text: this.i18n.t(RANKING_DIFFICULTY_LABEL_KEYS[filter]),
        target: {
          kind: 'rankingDifficultyOption',
          filter,
        },
        onActivate: () => controller.selectRankingDifficulty(filter),
      })),
    );
    const rankingDifficultySeparator = addRankingFilterSeparator(
      groupLeftXPx(rankingDifficultyFilters),
    );
    const rankingLaneFilters = addRankingFilterGroup(
      rankingDifficultySeparator.x - RANKING_FILTER_GAP_PX,
      LANE_COUNTS.map((filter) => ({
        text: formatLaneCount(filter),
        target: {
          kind: 'rankingLaneOption',
          filter,
        },
        onActivate: () => controller.selectRankingLane(filter),
      })),
    );
    const rankingLaneSeparator = addRankingFilterSeparator(groupLeftXPx(rankingLaneFilters));
    const rankingAllFilters = addRankingFilterGroup(
      rankingLaneSeparator.x - RANKING_FILTER_GAP_PX,
      [
        {
          text: this.i18n.t('profile.rankingControls.all'),
          target: { kind: 'rankingAllOption' },
          onActivate: controller.clearRankingFilters.bind(controller),
        },
      ],
    );
    const rankingFilters = [
      ...rankingAllFilters,
      ...rankingLaneFilters,
      ...rankingDifficultyFilters,
    ];
    const rankingFilterSeparators = [rankingLaneSeparator, rankingDifficultySeparator];
    const rankingSortRightXPx = groupLeftXPx(rankingAllFilters) - RANKING_CONTROL_GAP_PX;
    const rankingSortLabel = this.add
      .text(
        rankingSortRightXPx,
        RANKING_CONTROL_CENTER_Y_PX,
        '',
        typeStyle(RANKING_DETAIL_TYPE, COLORS.textSecondary),
      )
      .setOrigin(0, 0.5);
    // 값이 바뀌어도 아이콘이 흔들리지 않도록 가장 긴 글자 폭으로 자리를 잡는다.
    const rankingSortLabelWidthPx = Math.max(
      ...RANKED_CHART_SORTS.map(
        (sort) => rankingSortLabel.setText(this.i18n.t(RANKING_SORT_LABEL_KEYS[sort])).width,
      ),
    );
    rankingSortLabel.setX(rankingSortRightXPx - rankingSortLabelWidthPx);
    const rankingSortIconXPx =
      rankingSortLabel.x - RANKING_CONTROL_ICON_GAP_PX - RANKING_CONTROL_ICON_SIZE_PX / 2;
    const rankingSortIcon = this.add
      .image(
        rankingSortIconXPx,
        RANKING_CONTROL_CENTER_Y_PX,
        getSortIconTexture(this, RANKING_CONTROL_ICON_SIZE_PX),
      )
      .setTint(COLORS.textSecondary);
    const rankingSortLeftXPx = rankingSortIconXPx - RANKING_CONTROL_ICON_SIZE_PX / 2;
    const rankingSortHit = this.add
      .zone(
        rankingSortLeftXPx,
        RANKING_CONTROL_CENTER_Y_PX,
        rankingSortRightXPx - rankingSortLeftXPx,
        RANKING_CONTROL_HEIGHT_PX,
      )
      .setOrigin(0, 0.5);
    bindHoverTarget(rankingSortHit, {
      onOver: () => controller.hover({ kind: 'rankingSort' }),
      onOut: () => controller.unhover({ kind: 'rankingSort' }),
      onActivate: controller.toggleRankingSort.bind(controller),
    });
    const rankingSortControl: RankingControlView = {
      icon: rankingSortIcon,
      label: rankingSortLabel,
      hit: rankingSortHit,
    };
    const rankingsScrollBar = new ScrollBar(this, RANKING_SCROLLBAR_X_PX);
    const rankingsListCenterYPx =
      RANKING_ROWS_TOP_Y_PX + (RANKING_ROW_HEIGHT_PX * PROFILE_RANKING_VISIBLE_ROWS) / 2;
    const rankingsNoticeText = this.add
      .text(
        RANKINGS_NOTICE_CENTER_X_PX,
        RANKINGS_NOTICE_CENTER_Y_PX,
        '',
        textStyle('secondary', CELESTIAL_COLORS.textNeutral),
      )
      .setOrigin(0.5);
    const rankingsNotice = new NoticeText(this, this.celestial, rankingsNoticeText);
    const rankingsFailure = new LoadFailurePanel(
      this,
      {
        leftXPx: LEFT_X_PX,
        centerYPx: rankingsListCenterYPx,
      },
      retryPointer,
    );
    const rankingRowsLayer = this.add.container(
      0,
      0,
      rankingRows.flatMap(
        ({ badge, zodiacStars, zodiacLines, title, chart, score, dividerLine, dividerGlint }) => [
          ...badge.objects,
          zodiacLines,
          zodiacStars,
          title,
          chart,
          score,
          dividerLine,
          dividerGlint,
        ],
      ),
    );
    const rankings = this.add.container(0, 0, [
      rankingRowsLayer,
      ...rankingsScrollBar.objects,
      rankingsNoticeText,
      ...rankingsFailure.objects,
      rankingSortControl.icon,
      rankingSortControl.label,
      rankingSortControl.hit,
      ...rankingFilterSeparators,
      ...rankingFilters.flatMap(({ label, underline, hit }) => [label, underline, hit]),
    ]);
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
      rankings,
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
        onSelect: controller.selectSet.bind(controller),
        onHover: controller.hoverCollectionTab.bind(controller),
        onUnhover: controller.unhoverCollectionTab.bind(controller),
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
    const detailEarnedLabel = text(
      DETAIL_X_PX,
      DETAIL_EARNED_Y_PX,
      'secondary',
      COLORS.textSecondary,
    ).setText(this.i18n.t('collection.earned'));
    const detailEarnedDate = text(
      DETAIL_X_PX + DETAIL_WIDTH_PX,
      DETAIL_EARNED_Y_PX,
      'secondary',
      FEATURED_COLOR,
    ).setOrigin(1, 0);
    const featuredHalo = addCelestialSprite(
      this,
      this.celestial.atlasPresentations[SELECTED_HALO_ID],
      DETAIL_X_PX + DETAIL_WIDTH_PX / 2,
      DETAIL_EMBLEM_CENTER_Y_PX,
    ).setDisplaySize(DETAIL_FEATURED_HALO_SIZE_PX, DETAIL_FEATURED_HALO_SIZE_PX);
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
      pointer: pointButton(controller, 'equip'),
    });
    const unequipButton = new Button(this, DETAIL_X_PX, DETAIL_BUTTON_TOP_Y_PX, {
      variant: 'secondary',
      focus: 'glow',
      colors: SURFACE_BUTTON_COLORS,
      label: this.i18n.t('collection.unsetFeatured'),
      widthPx: DETAIL_WIDTH_PX,
      heightPx: DETAIL_BUTTON_HEIGHT_PX,
      pointer: pointButton(controller, 'unequip'),
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
      detailEarnedLabel,
      detailEarnedDate,
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
    // 되돌릴 수 없는 동작이라 프로필 내용과 떨어뜨려 설정 RESET 처럼 화면 우하단에 둔다.
    const deleteEntry = this.add
      .text(
        SCREEN_LAYOUT.rightXPx,
        getFooterAuxiliaryCenterYPx(this),
        this.i18n.t('profile.deleteAccount.entry'),
        typeStyle(AUXILIARY_LABEL_TYPE, COLORS.textMuted),
      )
      .setOrigin(1, 0.5)
      .setInteractive({ cursor: HOVER_CURSOR });
    bindPointer(deleteEntry, pointButton(controller, 'deleteEntry'));
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
      rankings,
      rankingRows,
      rankingRowsLayer,
      rankingSortControl,
      rankingFilters,
      rankingsScrollBar,
      rankingsNotice,
      rankingsFailure,
      loadFailure,
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
      detailEarnedLabel,
      detailEarnedDate,
      detailRule,
      equipButton,
      unequipButton,
      detailFailure,
      input,
      deleteEntry,
      deleteDialog: new ConfirmDialog(this, {
        cancel: pointButton(controller, 'deleteCancel'),
        accept: pointButton(controller, 'deleteAccept'),
      }),
    };
    return view;
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
}
