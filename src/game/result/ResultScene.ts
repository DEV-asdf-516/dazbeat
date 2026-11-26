import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import {
  getControlsCloseView,
  getControlsGuide,
  getControlsHelpButtonView,
  isControlsEntryHovered,
  isControlsHelpShown,
  isControlsPanelOpen,
} from '../app/controlsGuide.js';
import { SCENE_KEYS, exitScene } from '../app/sceneRoutes.js';
import type { ResultReport, ResultSceneData, SceneRequest } from '../app/sceneRoutes.js';
import type { CelestialCatalog } from '../celestial/state/celestialCatalog.js';
import { requireDefined } from '../../invariant.js';
import { getProgress, lerp } from '../../range.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import {
  CONSTELLATION_LOOKS,
  getResultPresentation,
  planSongConstellation,
} from './state/resultConstellation.js';
import type {
  ConstellationBox,
  ConstellationPlan,
  ResultPresentation,
  ConstellationPoint,
} from './state/resultConstellation.js';
import type { AchievementCatalog } from '../../data/achievements.js';
import { getAchievementName } from '../ui/state/achievementName.js';
import { AchievementToasts, PENDING_MOTE_ID, TOAST_RANK_BADGE } from './view/AchievementToasts.js';
import type { ToastPresentation } from './view/AchievementToasts.js';
import { ResultController } from './ResultController.js';
import type { ResultScreen } from './ResultController.js';
import { RESULT_NODE_ID, planResultFinish } from './state/resultFinish.js';
import type { FinishAnchor, FinishCue } from './state/resultFinish.js';
import { STAYING } from '../app/sceneExit.js';
import type { SceneExit } from '../app/sceneExit.js';
import {
  getChangedRegions,
  getHoveredToastId,
  getMenuButtonView,
  getGuestNoticeButtonView,
  getRankingNoticeCloseView,
  getRetryTabAppearance,
  getToastChanges,
  isResultFocused,
} from './state/resultState.js';
import type { ToastContent } from './state/resultState.js';
import { DIFFICULTY_TAB_ITEMS } from '../ui/state/difficultyAppearance.js';
import type { Song } from '../../data/songs.js';
import type { Difficulty, GameplayResult, LaneCount } from '../../rhythm/types.js';
import { JUDGMENTS } from '../../rhythm/judgment.js';
import { Button } from '../ui/view/widgets/Button.js';
import { ConfirmDialog } from '../ui/view/widgets/ConfirmDialog.js';
import {
  addSignInFailureDialog,
  getSignInFailureDialog,
} from '../ui/view/widgets/SignInFailureDialog.js';
import { pointButton } from '../ui/view/input/hoverTarget.js';
import { TextTabs } from '../ui/view/widgets/TextTabs.js';
import type { TextTabItem, TextTabsLayout, TextTabsStyle } from '../ui/view/widgets/TextTabs.js';
import {
  addCelestialSprite,
  playCelestialOnce,
  queueCelestialTextures,
} from '../celestial/view/celestialSprites.js';
import {
  formatAccuracy,
  formatClockTime,
  formatLaneCount,
  formatScore,
} from '../ui/state/format.js';
import { JACKET_Y_PX } from '../ui/view/widgets/songDetailLayout.js';
import { JacketView, queueJacketLoads } from '../ui/view/widgets/jacket.js';
import { setFittedText } from '../ui/view/widgets/fitText.js';
import {
  LIGHT_TEXTURES,
  addLight,
  ensureLightTextures,
} from '../ui/view/textures/lightTextures.js';
import { SoundEffects, queueSoundEffects } from '../ui/view/soundEffects.js';
import { queueAchievementEmblemLoads } from '../ui/view/widgets/achievementEmblem.js';
import {
  getAccountPanelButtonView,
  getSignInFailureButtonView,
} from '../ui/state/accountIdentity.js';
import type { AccountSource } from '../ui/state/accountIdentity.js';
import type { AccountAuth } from '../app/accountState.js';
import { MenuSceneChrome, getMenuSceneTextureUses } from '../ui/view/widgets/MenuSceneChrome.js';
import { GradeLetter } from '../ui/view/widgets/GradeLetter.js';
import { LOADING_STAR_ID, LoadingStar } from '../ui/view/widgets/LoadingStar.js';
import { GlyphText } from '../ui/view/widgets/GlyphText.js';
import { TOP_RANK_GLINT_ID, TopRankBadge } from '../ui/view/widgets/TopRankBadge.js';
import { COLORS, JUDGMENT_COLORS, SCREEN_LAYOUT, TYPE_SCALE, textStyle } from '../ui/view/theme.js';
import { MOTION } from '../ui/state/motion.js';
import { strokeCanvasLine, strokeGrainedCanvasLine } from '../ui/view/textures/grain.js';

interface ResultView {
  readonly chrome: MenuSceneChrome;
  readonly tabs: TextTabs<Difficulty>;
  readonly retryButton: Button;
  readonly songSelectButton: Button;
  readonly toasts: AchievementToasts;
  readonly presentToast: (content: ToastContent) => ToastPresentation;
  readonly rankingNotice: ConfirmDialog;
  readonly guestNotice: ConfirmDialog;
  readonly signInFailure: ConfirmDialog;
  readonly recordStatusText: Phaser.GameObjects.Text;
  readonly recordStatusStar: LoadingStar;
}

const LEFT_X_PX = SCREEN_LAYOUT.leftXPx;
const RIGHT_X_PX = SCREEN_LAYOUT.rightXPx;
const TITLE_Y_PX = 152;
const RECORD_CHECKING_CENTER_Y_PX = 172;
const DIFFICULTY_Y_PX = 208;
const PRACTICE_BADGE_GAP_PX = 24;
const RANK_Y_PX = 262;
const SCORE_Y_PX = 452;
const SCORE_GLYPH_FONT_KEY = 'glyph:resultScore';
const STATS_Y_PX = 572;
const SECTION_RANGE_Y_PX = 292;
const SECTION_ACCURACY_LABEL_Y_PX = 366;
const SECTION_ACCURACY_VALUE_Y_PX = 432;
const SECTION_COUNTS_Y_PX = 540;
const MAX_COMBO_VALUE_GAP_PX = 16;
const JUDGMENT_COLUMN_WIDTH_PX = 130;
const JUDGMENT_LABEL_Y_PX = 672;
const JUDGMENT_COUNT_Y_PX = 708;
/** MAX COMBO 를 판정 열의 세 번째 줄(GOOD)에 맞춰 두 줄이 같은 격자를 쓰게 한다. */
const MAX_COMBO_X_PX = LEFT_X_PX + JUDGMENT_COLUMN_WIDTH_PX * 2;
const JACKET_SIZE_PX = 480;
const JACKET_X_PX = RIGHT_X_PX - JACKET_SIZE_PX;
// 긴 제목은 이 크기까지 줄이고, 그래도 재킷에 닿으면 줄임표로 자른다.
const TITLE_MIN_SIZE_PX = 28;
const TITLE_MAX_WIDTH_PX = JACKET_X_PX - 48 - LEFT_X_PX;
/** 판정 표와는 넓게, RETRY 와는 좁게 띄워 한 묶음으로 보이게 한다. */
const DIFFICULTY_TABS_Y_PX = 808;
const DIFFICULTY_TABS_LAYOUT: TextTabsLayout = {
  xPx: RIGHT_X_PX,
  align: 'right',
  topYPx: DIFFICULTY_TABS_Y_PX,
};
const DIFFICULTY_TABS_STYLE: TextTabsStyle = {
  /** 버튼보다 한 단계 작은 글자로, RETRY 에 딸린 고르개임을 보이게 한다. */
  type: TYPE_SCALE.secondary,
  selectedWeight: 700,
  gapPx: 32,
  normalColor: COLORS.textSecondary,
};
const BUTTON_Y_PX = 880;
/** quiet 버튼의 안쪽 가로 여백만큼 밀어 TRACKS·RETRY 라벨을 정보 열 왼쪽 선·자켓 오른쪽 선에 맞춘다. */
const QUIET_BUTTON_PADDING_X_PX = 16;
const HEADER_REVEAL_DELAY_MS = 150;
const RANK_REVEAL_DELAY_MS = 450;
const RANK_REVEAL_DURATION_MS = 280;
const RANK_REVEAL_SCALE = 1.25;
const SCORE_COUNT_DELAY_MS = 700;
const SCORE_COUNT_DURATION_MS = 700;
const STATS_REVEAL_DELAY_MS = 800;
const MENU_REVEAL_DELAY_MS = 950;
const FULL_COMBO_DELAY_MS = 1100;
// 판정 표 오른쪽 끝과 자켓 사이 빈 칸에 둔다.
const CONSTELLATION_BOX: ConstellationBox = {
  leftPx: 800,
  topPx: 242,
  widthPx: 420,
  heightPx: 480,
};
const CONSTELLATION_DELAY_MS = FULL_COMBO_DELAY_MS;
const CONSTELLATION_DIM_SIZE_PX = 8;
const CONSTELLATION_DIM_ALPHA = 0.3;
const CONSTELLATION_ACCENT_SIZE = {
  corePx: 18,
  haloPx: 56,
};
const CONSTELLATION_LIT_SIZE = {
  corePx: 12,
  haloPx: 40,
};
const CONSTELLATION_LINE_CORE_WIDTH_PX = 1.5;
const CONSTELLATION_LINE_HALO_WIDTH_PX = 5;
const CONSTELLATION_LINES_TEXTURE_KEY = 'result:constellationLines';
const CONSTELLATION_TIP_TEXTURE_KEY = 'result:constellationTip';
const CONSTELLATION_SHIMMER_ALPHA = 0.15;
const CONSTELLATION_PULSE_SCALE = 1.6;
const FULL_COMBO_LABEL_GAP_PX = 32;
const FULL_COMBO_LABEL_BOTTOM_INSET_PX = 32;
const NODE_X_PX = JACKET_X_PX - 80;
const NODE_Y_PX = JACKET_Y_PX + JACKET_SIZE_PX + 10;
const STARFALL_X_PX = JACKET_X_PX + 260;
const STARFALL_Y_PX = JACKET_Y_PX + JACKET_SIZE_PX + 68;
const SCORE_SHIMMER_DX_PX = 128;
const SCORE_SHIMMER_DY_PX = 12;

interface ResultSummary {
  readonly metaLabels: readonly string[];
  readonly tabItems: readonly TextTabItem<Difficulty>[];
  readonly focalBounds: Phaser.Geom.Rectangle;
  readonly statTexts: readonly Phaser.GameObjects.Text[];
  readonly reveal: () => void;
}

export class ResultScene extends Phaser.Scene {
  private exit: SceneExit<SceneRequest> = STAYING;
  private jacketSongs: readonly Song[] = [];

  constructor(
    private readonly save: LocalSave,
    private readonly i18n: I18n,
    private readonly celestial: CelestialCatalog,
    private readonly catalog: AchievementCatalog,
    private readonly account: AccountSource,
    private readonly auth: AccountAuth,
  ) {
    super(SCENE_KEYS.result);
  }

  init(data: ResultSceneData): void {
    this.jacketSongs = [data.song];
  }

  preload(): void {
    queueJacketLoads(this, this.jacketSongs);
    queueAchievementEmblemLoads(this);
    queueSoundEffects(this);
    queueCelestialTextures(this, this.celestial, [
      ...getMenuSceneTextureUses(this.celestial, 'result'),
      this.celestial.atlasPresentations[RESULT_NODE_ID],
      this.celestial.atlasPresentations[TOP_RANK_GLINT_ID],
      this.celestial.atlasPresentations[PENDING_MOTE_ID],
      this.celestial.atlasPresentations[LOADING_STAR_ID],
      ...this.celestial.nodeOnlyFinish.map((step) => step.presentation),
    ]);
  }

  create(data: ResultSceneData): void {
    this.exit = STAYING;
    const { song, laneCount, difficulty, chartId, level, origin, report, result, ranking } = data;
    const screen: ResultScreen = {
      render: (previous, next) => {
        for (const region of getChangedRegions(previous, next)) {
          switch (region) {
            case 'tabs':
              view.tabs.render(
                (tabDifficulty) => getRetryTabAppearance(next, tabDifficulty),
                next.retryChart.song.accentColor,
              );
              break;
            case 'retryButton':
              view.retryButton.render(getMenuButtonView(next, 'retry'));
              break;
            case 'songSelectButton':
              view.songSelectButton.render(getMenuButtonView(next, 'songSelect'));
              break;
            case 'menuFocusMotion':
              view.retryButton.playFocus(isResultFocused(next, 'retry'));
              view.songSelectButton.playFocus(isResultFocused(next, 'songSelect'));
              break;
            case 'controlsEntry':
              view.chrome.renderControlsEntry(isControlsEntryHovered(next.hover));
              break;
            case 'controlsClose':
              view.chrome.controls.closeButton.render(getControlsCloseView(next.hover));
              break;
            case 'controlsHelpCard':
              view.chrome.controls.helpCard.render(isControlsHelpShown(next));
              break;
            case 'controlsHelpButton':
              view.chrome.controls.renderHelpButton(getControlsHelpButtonView(next));
              break;
            case 'accountButton': {
              const views = getAccountPanelButtonView(next.hover);
              view.chrome.accountCorner.nameplate.renderButton(views.accountProfile);
              view.chrome.accountCorner.signInButton.render(views.accountSignIn);
              break;
            }
            case 'toasts': {
              const changes = getToastChanges(previous, next);
              for (const toast of changes.entered) {
                const { content } = toast;
                let badge: TopRankBadge | null = null;
                if (content.kind === 'ranking') {
                  badge = new TopRankBadge(this, this.celestial, TOAST_RANK_BADGE);
                  badge.render(content.rank);
                }
                view.toasts.enter(toast, view.presentToast(content), badge);
              }
              changes.moved.forEach(({ id, slot }) => view.toasts.move(id, slot));
              changes.leaving.forEach((id) => view.toasts.leave(id));
              break;
            }
            case 'toastClose':
              view.toasts.renderCloseHover(getHoveredToastId(next));
              break;
            case 'rankingNotice':
              view.rankingNotice.render(
                next.rankingNotice === null
                  ? null
                  : {
                      title: this.i18n.t(`rankingNotice.${next.rankingNotice}.title`),
                      body: this.i18n.t(`rankingNotice.${next.rankingNotice}.body`),
                      cancelLabel: null,
                      acceptLabel: this.i18n.t('rankingNotice.close'),
                      acceptTone: 'default',
                    },
              );
              break;
            case 'recordStatus':
              if (next.recordStatus === 'checking') {
                view.recordStatusText
                  .setText(this.i18n.t('result.checkingRecord'))
                  .setY(RECORD_CHECKING_CENTER_Y_PX)
                  .setVisible(true);
                view.recordStatusStar.show(view.recordStatusText.getBounds());
              } else {
                view.recordStatusText.setVisible(false);
                view.recordStatusStar.show(null);
              }
              break;
            case 'rankingNoticeButtons': {
              const close = getRankingNoticeCloseView(next);
              view.rankingNotice.renderButtons(close, close);
              break;
            }
            case 'guestNotice':
              view.guestNotice.render(
                next.isGuestNoticeOpen
                  ? {
                      title: this.i18n.t('localRecord.signInPrompt.title'),
                      body: this.i18n.t('localRecord.signInPrompt.body'),
                      cancelLabel: this.i18n.t('localRecord.signInPrompt.later'),
                      acceptLabel: this.i18n.t('localRecord.signInPrompt.signIn'),
                      acceptTone: 'default',
                    }
                  : null,
              );
              break;
            case 'guestNoticeButtons':
              view.guestNotice.renderButtons(
                getGuestNoticeButtonView(next, 'guestNoticeLater'),
                getGuestNoticeButtonView(next, 'guestNoticeSignIn'),
              );
              break;
            case 'signInFailure':
              view.signInFailure.render(
                getSignInFailureDialog(
                  this.i18n.t('account.signInFailure', { returnObjects: true }),
                  next.signInFailure,
                ),
              );
              break;
            case 'signInFailureButtons': {
              const buttonView = getSignInFailureButtonView(next.hover);
              view.signInFailure.renderButtons(buttonView, buttonView);
              break;
            }
            case 'controls':
              view.chrome.controls.render(
                isControlsPanelOpen(next)
                  ? getControlsGuide(
                      this.i18n.t('controls', { returnObjects: true }),
                      this.save.loadSettings(),
                    )
                  : null,
              );
              break;
          }
        }
      },
      playSound: (sound) => soundEffects.play(sound),
      leave: (request) => {
        this.exit = exitScene(this, this.exit, request);
      },
      openProfile: (ranking) => {
        this.exit = exitScene(this, this.exit, {
          key: 'profile',
          data: {
            returnTo: {
              key: 'result',
              // 이미 보여 준 알림과 안내 팝업은 다시 뜨지 않고, 아직 응답을 못 받은 제출의 알림만 돌아와서 뜬다.
              data: {
                ...data,
                ranking,
              },
            },
          },
        });
      },
      renderAccount: () => {
        const identity = this.account.getIdentity();
        view.chrome.accountCorner.nameplate.render(identity);
        view.chrome.accountCorner.renderSignIn(identity);
      },
      isLeaving: () => this.exit.kind === 'leaving',
    };
    const controller = new ResultController(
      screen,
      {
        song,
        laneCount,
        difficulty,
        chartId,
        level,
      },
      origin,
      ranking,
      report,
      {
        isShown: () => this.save.isGuestNoticeShown(),
        markShown: () => this.save.markGuestNoticeShown(),
        signIn: () => this.auth.signIn(),
      },
    );
    const chrome = new MenuSceneChrome(
      this,
      {
        celestial: this.celestial,
        screen: 'result',
        account: {
          kind: 'corner',
          catalog: this.account.catalog,
          pointer: controller,
        },
      },
      {
        isLeaving: () => this.exit.kind === 'leaving',
        captureKey: (event) => controller.captureKey(event),
        handleControlsKey: (event) => controller.handleControlsKey(event),
        handleMenuKey: (action) => {
          // 곡 선택 화면처럼 ←→ 는 난이도, 메뉴 이동은 ↑↓ 다.
          switch (action) {
            case 'left':
            case 'right':
              controller.stepDifficulty(action === 'left' ? 'previous' : 'next');
              return;
            case 'up':
              controller.moveFocus('previous');
              return;
            case 'down':
              controller.moveFocus('next');
              return;
            case 'confirm':
              controller.confirm();
              return;
            case 'back':
              controller.back();
              return;
            default:
              return;
          }
        },
      },
      controller,
    );
    const identity = this.account.getIdentity();
    chrome.accountCorner.nameplate.render(identity);
    chrome.accountCorner.renderSignIn(identity);
    const soundEffects = new SoundEffects(this, this.save.loadSettings());
    const presentation = getResultPresentation(origin.mode, result);
    this.cameras.main.fadeIn(MOTION.mediumMs);

    const titleText = this.add.text(
      LEFT_X_PX,
      TITLE_Y_PX,
      song.title,
      textStyle('heading', COLORS.textPrimary),
    );
    let titleSizePx = TYPE_SCALE.heading.sizePx;
    while (titleText.width > TITLE_MAX_WIDTH_PX && titleSizePx > TITLE_MIN_SIZE_PX) {
      titleSizePx -= 1;
      titleText.setFontSize(titleSizePx);
    }
    setFittedText(titleText, song.title, TITLE_MAX_WIDTH_PX);
    const summary =
      report.kind === 'section'
        ? this.createSectionSummary(report, result, laneCount, difficulty)
        : this.createGradedSummary(presentation, result, difficulty, song.accentColor);
    const headerTexts: Phaser.GameObjects.Text[] = [titleText];
    let metaXPx = LEFT_X_PX;
    for (const label of summary.metaLabels) {
      const metaText = this.add.text(
        metaXPx,
        DIFFICULTY_Y_PX,
        label,
        textStyle('meta', COLORS.textMuted),
      );
      headerTexts.push(metaText);
      metaXPx += metaText.width + PRACTICE_BADGE_GAP_PX;
    }
    const statTexts: Phaser.GameObjects.Text[] = [...summary.statTexts];
    // 판정 내역은 세로 표 대신 한 줄의 열로 펼쳐 왼쪽 열 높이를 줄이고, 그만큼을 묶음 사이 여백으로 쓴다.
    for (const [index, judgment] of JUDGMENTS.entries()) {
      const xPx = LEFT_X_PX + JUDGMENT_COLUMN_WIDTH_PX * index;
      statTexts.push(
        this.add.text(
          xPx,
          JUDGMENT_LABEL_Y_PX,
          judgment.toUpperCase(),
          textStyle('secondary', JUDGMENT_COLORS[judgment]),
        ),
        this.add.text(
          xPx,
          JUDGMENT_COUNT_Y_PX,
          `${result.counts[judgment]}`,
          textStyle('primary', COLORS.textPrimary),
        ),
      );
    }
    const jacket = new JacketView(this, JACKET_X_PX, JACKET_Y_PX, JACKET_SIZE_PX).setSong(song);

    const retryButton = new Button(this, 0, BUTTON_Y_PX, {
      variant: 'quiet',
      focus: 'slide',
      label: 'RETRY',
      // 화면의 기본 동작(Enter)이므로 TRACKS 보다 한 단계 크게 둔다.
      labelType: TYPE_SCALE.heading,
      isHoverUnderlined: true,
      pointer: pointButton(controller, 'retry'),
    });
    retryButton.setX(RIGHT_X_PX + QUIET_BUTTON_PADDING_X_PX - retryButton.width);
    const tabs = new TextTabs(
      this,
      summary.tabItems,
      DIFFICULTY_TABS_LAYOUT,
      DIFFICULTY_TABS_STYLE,
      {
        onSelect: controller.selectDifficulty.bind(controller),
        onHover: controller.hoverDifficulty.bind(controller),
        onUnhover: controller.unhoverDifficulty.bind(controller),
      },
    );
    const songSelectButton = new Button(this, LEFT_X_PX - QUIET_BUTTON_PADDING_X_PX, 0, {
      variant: 'quiet',
      focus: 'slide',
      label: origin.kind === 'chartEditor' ? 'EDITOR' : 'TRACKS',
      isHoverUnderlined: true,
      pointer: pointButton(controller, 'songSelect'),
    });
    // 글자 크기가 달라 아랫변을 맞춰야 RETRY 와 한 줄로 읽힌다.
    songSelectButton.setY(retryButton.y + retryButton.height - songSelectButton.height);
    chrome.start(summary.focalBounds);
    summary.reveal();

    this.fadeInAt([jacket, ...headerTexts], 1, HEADER_REVEAL_DELAY_MS);
    this.fadeInAt(statTexts, 1, STATS_REVEAL_DELAY_MS);
    this.fadeInAt([...tabs.getVisuals(), retryButton, songSelectButton], 1, MENU_REVEAL_DELAY_MS);
    this.revealConstellation(
      planSongConstellation(song.id, song.constellation, presentation.tier, CONSTELLATION_BOX),
      song.accentColor,
    );
    const view: ResultView = {
      chrome,
      tabs,
      retryButton,
      songSelectButton,
      toasts: new AchievementToasts({
        scene: this,
        catalog: this.catalog,
        celestial: this.celestial,
        onClose: controller.closeToast.bind(controller),
        onHover: controller.hoverToastClose.bind(controller),
        onUnhover: controller.unhoverToastClose.bind(controller),
        onExpire: controller.dismissToast.bind(controller),
        onRemoved: controller.removeToast.bind(controller),
      }),
      // 순위 알림의 곡과 난이도는 재시도 탭이 아니라 방금 플레이한 채보다.
      presentToast: (content) => {
        switch (content.kind) {
          case 'achievement':
            return {
              label: this.i18n.t('achievements.unlocked'),
              name: getAchievementName(this.i18n, content.achievement),
              difficulty: null,
            };
          case 'ranking':
            return {
              label: this.i18n.t('ranking.toastRegistered'),
              name: song.title,
              difficulty: difficulty.toUpperCase(),
            };
          case 'rankingPending':
            return {
              label: 'RANKING',
              name: this.i18n.t('ranking.toastPending'),
              difficulty: null,
            };
        }
      },
      rankingNotice: new ConfirmDialog(this, {
        cancel: pointButton(controller, 'noticeClose'),
        accept: pointButton(controller, 'noticeClose'),
      }),
      guestNotice: new ConfirmDialog(this, {
        cancel: pointButton(controller, 'guestNoticeLater'),
        accept: pointButton(controller, 'guestNoticeSignIn'),
      }),
      // 순위 알림·게스트 안내 위에 오도록 나중에 만든다.
      signInFailure: addSignInFailureDialog(this, pointButton(controller, 'signInFailureClose')),
      recordStatusText: this.add
        .text(RIGHT_X_PX, 0, '', textStyle('meta', COLORS.textSecondary))
        .setOrigin(1, 0.5),
      recordStatusStar: new LoadingStar(this, this.celestial),
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => controller.close());
    controller.start();
  }

  private createGradedSummary(
    presentation: ResultPresentation,
    result: GameplayResult,
    difficulty: Difficulty,
    accentColor: number,
  ): ResultSummary {
    const rank = this.createRank(presentation.rank);
    const rankBounds = rank.bounds;
    const scoreText = new GlyphText(this, {
      fontKey: SCORE_GLYPH_FONT_KEY,
      style: textStyle('number', COLORS.textPrimary),
      chars: '0123456789,',
      xPx: LEFT_X_PX,
      yPx: SCORE_Y_PX,
      originX: 0,
      originY: 0,
      text: formatScore(0),
      depth: 0,
    });
    // 결과 점수 스타일은 외곽선이 없어 레이어가 하나다.
    const scoreLayer = requireDefined(scoreText.layers[0], 'Missing result score glyph layer');
    const accuracyText = this.add.text(
      LEFT_X_PX,
      STATS_Y_PX,
      formatAccuracy(result.accuracy),
      textStyle('primary', COLORS.textPrimary),
    );
    const maxComboValue = this.add.text(
      0,
      STATS_Y_PX,
      `${result.maxCombo}`,
      textStyle('primary', COLORS.textPrimary),
    );
    const maxComboLabel = this.add
      .text(
        MAX_COMBO_X_PX,
        maxComboValue.getCenter().y,
        'MAX COMBO',
        textStyle('meta', COLORS.textMuted),
      )
      .setOrigin(0, 0.5);
    maxComboValue.setX(maxComboLabel.x + maxComboLabel.width + MAX_COMBO_VALUE_GAP_PX);
    rank.targets.forEach((text) => text.setAlpha(0).setScale(RANK_REVEAL_SCALE));
    scoreLayer.setAlpha(0);
    return {
      metaLabels: [
        difficulty.toUpperCase(),
        ...(presentation.hasPracticeBadge ? ['PRACTICE'] : []),
      ],
      tabItems: DIFFICULTY_TAB_ITEMS,
      focalBounds: rankBounds,
      statTexts: [accuracyText, maxComboLabel, maxComboValue],
      reveal: () => {
        this.playFinish(
          planResultFinish(
            presentation.hasFinish,
            this.celestial.nodeOnlyFinish,
            SCORE_COUNT_DELAY_MS + SCORE_COUNT_DURATION_MS,
          ),
          rankBounds,
          scoreLayer.getBounds(),
        );
        this.tweens.add({
          targets: rank.targets,
          alpha: 1,
          scale: 1,
          delay: RANK_REVEAL_DELAY_MS,
          duration: RANK_REVEAL_DURATION_MS,
          ease: 'Cubic.Out',
          onComplete: () => rank.grade?.playSheen(),
        });
        this.tweens.addCounter({
          from: 0,
          to: result.score,
          duration: SCORE_COUNT_DURATION_MS,
          delay: SCORE_COUNT_DELAY_MS,
          ease: 'Cubic.Out',
          onStart: () => scoreLayer.setAlpha(1),
          onUpdate: (_tween, _target, _key, current: number) =>
            scoreText.render(formatScore(Math.round(current))),
          onComplete: () => scoreText.render(formatScore(result.score)),
        });
        if (presentation.hasFullComboLabel) {
          this.revealFullCombo(rankBounds, accentColor);
        }
      },
    };
  }

  private createSectionSummary(
    report: Extract<ResultReport, { readonly kind: 'section' }>,
    result: GameplayResult,
    laneCount: LaneCount,
    difficulty: Difficulty,
  ): ResultSummary {
    const addLabeledValue = (
      xPx: number,
      centerYPx: number,
      labelText: string,
      valueText: string,
    ): readonly Phaser.GameObjects.Text[] => {
      const label = this.add
        .text(xPx, centerYPx, labelText, textStyle('meta', COLORS.textMuted))
        .setOrigin(0, 0.5);
      const value = this.add
        .text(
          label.x + label.width + MAX_COMBO_VALUE_GAP_PX,
          centerYPx,
          valueText,
          textStyle('primary', COLORS.textPrimary),
        )
        .setOrigin(0, 0.5);
      return [label, value];
    };
    const accuracyLabel = this.add
      .text(LEFT_X_PX, SECTION_ACCURACY_LABEL_Y_PX, 'ACCURACY', textStyle('meta', COLORS.textMuted))
      .setOrigin(0, 0.5);
    const accuracyValue = this.add
      .text(
        LEFT_X_PX,
        SECTION_ACCURACY_VALUE_Y_PX,
        formatAccuracy(result.accuracy),
        textStyle('number', COLORS.textPrimary),
      )
      .setOrigin(0, 0.5);
    return {
      metaLabels: [formatLaneCount(laneCount), difficulty.toUpperCase(), 'TEST PLAY'],
      // 난이도는 에디터에서 고르므로 이 화면에서 바꾸지 않는다.
      tabItems: [],
      focalBounds: accuracyValue.getBounds(),
      statTexts: [
        ...addLabeledValue(
          LEFT_X_PX,
          SECTION_RANGE_Y_PX,
          'SECTION',
          `${formatClockTime(report.startTimeMs)} ~ ${formatClockTime(report.endTimeMs)}`,
        ),
        accuracyLabel,
        accuracyValue,
        ...addLabeledValue(
          LEFT_X_PX,
          SECTION_COUNTS_Y_PX,
          'NOTES',
          `${report.noteCount} / ${report.totalNoteCount}`,
        ),
        ...addLabeledValue(MAX_COMBO_X_PX, SECTION_COUNTS_Y_PX, 'MAX COMBO', `${result.maxCombo}`),
      ],
      reveal: () => undefined,
    };
  }

  private createRank(rank: ResultPresentation['rank']): {
    readonly bounds: Phaser.Geom.Rectangle;
    readonly targets: readonly Phaser.GameObjects.Text[];
    readonly grade: GradeLetter | null;
  } {
    if (rank.kind === 'grade') {
      const grade = new GradeLetter(this, this.celestial, { role: 'display' });
      grade.render(rank.grade);
      grade.place(LEFT_X_PX, RANK_Y_PX);
      return {
        bounds: grade.getBounds(),
        targets: grade.revealTargets,
        grade,
      };
    }
    // 랭크용 display 서체는 별자리 영역과 겹치므로 FAILED 는 더 작은 title 서체로 같은 자리에 둔다.
    const failed = this.add.text(
      LEFT_X_PX,
      RANK_Y_PX,
      'FAILED',
      textStyle('title', JUDGMENT_COLORS.miss),
    );
    const bounds = failed.getBounds();
    // scale 강조가 글자 중심에서 일어나도록 원점만 중심으로 옮긴다. 표시 위치는 그대로다.
    failed.setOrigin(0.5).setPosition(bounds.centerX, bounds.centerY);
    return {
      bounds,
      targets: [failed],
      grade: null,
    };
  }

  private fadeInAt(
    targets: Phaser.GameObjects.Components.AlphaSingle[],
    alpha: number,
    delayMs: number,
    durationMs: number = MOTION.mediumMs,
  ): void {
    targets.forEach((target) => target.setAlpha(0));
    this.tweens.add({
      targets,
      alpha,
      delay: delayMs,
      duration: durationMs,
    });
  }

  private playFinish(
    cues: readonly FinishCue[],
    rankBounds: Phaser.Geom.Rectangle,
    scoreBounds: Phaser.Geom.Rectangle,
  ): void {
    if (cues.length === 0) {
      return;
    }
    const node = addCelestialSprite(
      this,
      this.celestial.atlasPresentations[RESULT_NODE_ID],
      NODE_X_PX,
      NODE_Y_PX,
    ).setVisible(false);
    for (const cue of cues) {
      const { xPx, yPx } = getFinishAnchorPosition(cue.anchor, rankBounds, scoreBounds);
      const sprite = addCelestialSprite(this, cue.step.presentation, xPx, yPx);
      if (cue.isNodeIgnite) {
        sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => node.setVisible(true));
      }
      this.time.delayedCall(cue.playAtMs, () => playCelestialOnce(sprite));
    }
  }

  private revealConstellation(plan: ConstellationPlan, accent: number): void {
    ensureLightTextures(this);
    const { nodeCore, lineCore, glow } = CONSTELLATION_LOOKS[plan.tier];
    const addStar = ({ xPx, yPx }: ConstellationPoint): Phaser.GameObjects.Image => {
      const star = addLight(this, LIGHT_TEXTURES.star, xPx, yPx).setDisplaySize(
        CONSTELLATION_DIM_SIZE_PX,
        CONSTELLATION_DIM_SIZE_PX,
      );
      this.fadeInAt([star], CONSTELLATION_DIM_ALPHA, CONSTELLATION_DELAY_MS, MOTION.fastMs);
      return star;
    };
    const ignite = (
      star: Phaser.GameObjects.Image,
      nodeIgniteAtMs: number,
      corePx: number,
    ): void => {
      // dim fade-in 과 alpha tween 이 겹치지 않도록 그 node 의 tween 을 끊고 점등한다.
      this.time.delayedCall(CONSTELLATION_DELAY_MS + nodeIgniteAtMs, () => {
        this.tweens.killTweensOf(star);
        this.tweens.add({
          targets: star,
          alpha: nodeCore,
          displayWidth: corePx,
          displayHeight: corePx,
          duration: MOTION.fastMs,
        });
      });
    };
    const addHalo = (
      { xPx, yPx }: ConstellationPoint,
      nodeIgniteAtMs: number,
      haloPx: number,
      alpha: number,
    ): Phaser.GameObjects.Image => {
      const halo = addLight(this, LIGHT_TEXTURES.glow, xPx, yPx)
        .setDisplaySize(haloPx, haloPx)
        .setTint(accent);
      this.fadeInAt([halo], alpha, CONSTELLATION_DELAY_MS + nodeIgniteAtMs, MOTION.fastMs);
      return halo;
    };

    // 별빛은 모두 SCREEN 합성이라 만드는 순서가 겹친 모습에 영향을 주지 않는다. 선만 그 위에 둔다.
    const accentStar = addStar(plan.accent);
    ignite(accentStar, 0, CONSTELLATION_ACCENT_SIZE.corePx);
    const litNodes = plan.others.flatMap((node) => {
      const star = addStar(node);
      if (node.kind === 'dark') {
        return [];
      }
      ignite(star, node.igniteAtMs, CONSTELLATION_LIT_SIZE.corePx);
      return [node];
    });
    if (glow !== null) {
      const accentHalo = addHalo(plan.accent, 0, CONSTELLATION_ACCENT_SIZE.haloPx, glow.nodeHalo);
      litNodes.forEach((node) =>
        addHalo(node, node.igniteAtMs, CONSTELLATION_LIT_SIZE.haloPx, glow.nodeHalo),
      );
      if (glow.finale !== null) {
        this.playConstellationFinale(
          accentStar,
          accentHalo,
          glow.nodeHalo,
          glow.finale,
          plan.drawEndMs,
        );
      }
    }

    // 매 프레임 전체를 다시 긋지 않도록 다 이은 edge 는 lines 에 한 번만 남기고, 잇는 중인 edge 는 tip 에 새 조각만 덧붙인다.
    // 선의 질감 결은 그리는 좌표로 정해지므로 두 텍스처를 같은 정수 px 자리에 겹쳐 결이 이어지게 한다.
    let minXPx = Infinity;
    let minYPx = Infinity;
    let maxXPx = -Infinity;
    let maxYPx = -Infinity;
    for (const { xPx, yPx } of [plan.accent, ...plan.others]) {
      minXPx = Math.min(minXPx, xPx);
      minYPx = Math.min(minYPx, yPx);
      maxXPx = Math.max(maxXPx, xPx);
      maxYPx = Math.max(maxYPx, yPx);
    }
    const leftPx = Math.floor(minXPx - CONSTELLATION_LINE_HALO_WIDTH_PX);
    const topPx = Math.floor(minYPx - CONSTELLATION_LINE_HALO_WIDTH_PX);
    const widthPx = Math.ceil(maxXPx + CONSTELLATION_LINE_HALO_WIDTH_PX) - leftPx;
    const heightPx = Math.ceil(maxYPx + CONSTELLATION_LINE_HALO_WIDTH_PX) - topPx;
    const addLineTexture = (key: string): Phaser.Textures.CanvasTexture => {
      const texture = requireDefined(
        this.textures.createCanvas(key, widthPx, heightPx) ?? undefined,
        'Constellation line texture key in use',
        key,
      );
      this.add.image(leftPx, topPx, texture).setOrigin(0, 0);
      return texture;
    };
    const lines = addLineTexture(CONSTELLATION_LINES_TEXTURE_KEY);
    const tip = addLineTexture(CONSTELLATION_TIP_TEXTURE_KEY);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.textures.remove(CONSTELLATION_LINES_TEXTURE_KEY);
      this.textures.remove(CONSTELLATION_TIP_TEXTURE_KEY);
    });
    const strokeLine = (
      texture: Phaser.Textures.CanvasTexture,
      fromXPx: number,
      fromYPx: number,
      toXPx: number,
      toYPx: number,
    ): void => {
      const context = texture.getContext();
      const line = {
        fromXPx: fromXPx - leftPx,
        fromYPx: fromYPx - topPx,
        toXPx: toXPx - leftPx,
        toYPx: toYPx - topPx,
      };
      if (glow !== null) {
        strokeCanvasLine(context, line, {
          widthPx: CONSTELLATION_LINE_HALO_WIDTH_PX,
          color: accent,
          alpha: glow.lineHalo,
        });
      }
      strokeGrainedCanvasLine(context, line, {
        widthPx: CONSTELLATION_LINE_CORE_WIDTH_PX,
        color: COLORS.note,
        alpha: lineCore,
      });
      texture.refresh();
    };
    const extendLines = (fromElapsedMs: number, toElapsedMs: number): void => {
      for (const { from, to, startMs, endMs } of plan.edges) {
        const startReach = getProgress(fromElapsedMs, startMs, endMs);
        const endReach = getProgress(toElapsedMs, startMs, endMs);
        const isFinishedNow = startReach < 1 && endReach === 1;
        if (isFinishedNow) {
          tip.clear();
          strokeLine(lines, from.xPx, from.yPx, to.xPx, to.yPx);
        } else if (endReach > startReach) {
          strokeLine(
            tip,
            lerp(from.xPx, to.xPx, startReach),
            lerp(from.yPx, to.yPx, startReach),
            lerp(from.xPx, to.xPx, endReach),
            lerp(from.yPx, to.yPx, endReach),
          );
        }
      }
    };
    let drawnElapsedMs = 0;
    this.tweens.addCounter({
      from: 0,
      to: plan.drawEndMs,
      duration: plan.drawEndMs,
      delay: CONSTELLATION_DELAY_MS,
      onUpdate: (_tween, _target, _key, current: number) => {
        extendLines(drawnElapsedMs, current);
        drawnElapsedMs = current;
      },
      onComplete: () => extendLines(drawnElapsedMs, plan.drawEndMs),
    });
  }

  private playConstellationFinale(
    star: Phaser.GameObjects.Image,
    halo: Phaser.GameObjects.Image,
    haloAlpha: number,
    kind: 'shimmer' | 'pulse',
    atMs: number,
  ): void {
    // 점등 시 그 node 의 tween 을 끊으므로 finale tween 은 그 시각에 만든다.
    this.time.delayedCall(CONSTELLATION_DELAY_MS + atMs, () => {
      this.tweens.add({
        targets: halo,
        alpha: haloAlpha + CONSTELLATION_SHIMMER_ALPHA,
        duration: MOTION.fastMs,
        yoyo: true,
        repeat: 0,
      });
      if (kind === 'pulse') {
        const pulseSizePx = CONSTELLATION_ACCENT_SIZE.corePx * CONSTELLATION_PULSE_SCALE;
        this.tweens.add({
          targets: star,
          displayWidth: pulseSizePx,
          displayHeight: pulseSizePx,
          duration: MOTION.fastMs,
          yoyo: true,
          repeat: 0,
        });
      }
    });
  }

  private revealFullCombo(rankBounds: Phaser.Geom.Rectangle, accent: number): void {
    const label = this.add
      .text(
        rankBounds.right + FULL_COMBO_LABEL_GAP_PX,
        rankBounds.bottom - FULL_COMBO_LABEL_BOTTOM_INSET_PX,
        'FULL COMBO',
        textStyle('meta', accent),
      )
      .setOrigin(0, 1);
    this.fadeInAt([label], 1, FULL_COMBO_DELAY_MS);
  }
}

function getFinishAnchorPosition(
  anchor: FinishAnchor,
  rankBounds: Phaser.Geom.Rectangle,
  scoreBounds: Phaser.Geom.Rectangle,
): { xPx: number; yPx: number } {
  switch (anchor) {
    case 'node':
      return {
        xPx: NODE_X_PX,
        yPx: NODE_Y_PX,
      };
    case 'rank':
      return {
        xPx: rankBounds.centerX,
        yPx: rankBounds.centerY,
      };
    case 'jacket':
      return {
        xPx: STARFALL_X_PX,
        yPx: STARFALL_Y_PX,
      };
    case 'score':
      return {
        xPx: scoreBounds.left + SCORE_SHIMMER_DX_PX,
        yPx: scoreBounds.bottom + SCORE_SHIMMER_DY_PX,
      };
  }
}
