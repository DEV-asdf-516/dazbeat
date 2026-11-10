import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { getControlsGuide } from '../app/controlsGuide.js';
import { SCENE_KEYS, exitScene } from '../app/sceneRoutes.js';
import type { ResultReport, ResultSceneData, SceneRequest } from '../app/sceneRoutes.js';
import type { CelestialCatalog } from '../celestial/state/celestialCatalog.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import {
  CONSTELLATION_LOOKS,
  getConstellationLines,
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
import { AchievementToasts, PENDING_MOTE_ID } from './view/AchievementToasts.js';
import type { ToastPresentation } from './view/AchievementToasts.js';
import { ResultController } from './ResultController.js';
import { RESULT_NODE_ID, planResultFinish } from './state/resultFinish.js';
import type { FinishAnchor, FinishCue } from './state/resultFinish.js';
import { STAYING } from '../app/sceneExit.js';
import type { SceneExit } from '../app/sceneExit.js';
import {
  getChangedRegions,
  getHoveredToastId,
  getMenuButtonView,
  getRankingNoticeCloseView,
  getResultControlsCloseView,
  getRetryTabAppearance,
  getToastChanges,
  isResultControlsEntryHovered,
  isResultFocused,
} from './state/resultState.js';
import type { ResultButton, ResultRegion, ResultState, ToastContent } from './state/resultState.js';
import { DIFFICULTY_TAB_ITEMS } from '../ui/state/difficultyAppearance.js';
import type { Song } from '../../data/songs.js';
import type { Difficulty, GameplayResult, LaneCount } from '../../rhythm/types.js';
import { JUDGMENTS } from '../../rhythm/judgment.js';
import { Button } from '../ui/view/widgets/Button.js';
import { ConfirmDialog } from '../ui/view/widgets/ConfirmDialog.js';
import { pointButton } from '../ui/view/input/hoverTarget.js';
import type { ButtonPointer } from '../ui/view/input/hoverTarget.js';
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
import { getAccountPanelButtonView } from '../ui/state/accountIdentity.js';
import type { AccountSource } from '../ui/state/accountIdentity.js';
import { MenuSceneChrome, getMenuSceneTextureUses } from '../ui/view/widgets/MenuSceneChrome.js';
import { GradeLetter } from '../ui/view/widgets/GradeLetter.js';
import { TOP_RANK_GLINT_ID } from '../ui/view/widgets/TopRankBadge.js';
import { COLORS, JUDGMENT_COLORS, SCREEN_LAYOUT, TYPE_SCALE, textStyle } from '../ui/view/theme.js';
import { MOTION } from '../ui/state/motion.js';
import { strokeGrainedLine } from '../ui/view/textures/grain.js';

interface ResultView {
  readonly chrome: MenuSceneChrome;
  readonly tabs: TextTabs<Difficulty>;
  readonly retryButton: Button;
  readonly songSelectButton: Button;
  readonly toasts: AchievementToasts;
  readonly presentToast: (content: ToastContent) => ToastPresentation;
  readonly rankingNotice: ConfirmDialog;
}

const LEFT_X_PX = SCREEN_LAYOUT.leftXPx;
const RIGHT_X_PX = SCREEN_LAYOUT.rightXPx;
const TITLE_Y_PX = 152;
const DIFFICULTY_Y_PX = 208;
const PRACTICE_BADGE_GAP_PX = 24;
const RANK_Y_PX = 262;
const SCORE_Y_PX = 452;
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
      ...this.celestial.nodeOnlyFinish.map((step) => step.presentation),
    ]);
  }

  create(data: ResultSceneData): void {
    this.exit = STAYING;
    const pointer: ButtonPointer<ResultButton> = {
      pointerOver: (button) => controller.pointerOver(button),
      pointerOut: (button) => controller.pointerOut(button),
      pointerDown: (button) => controller.pointerDown(button),
      pointerUp: (button) => controller.pointerUp(button),
    };
    const chrome = new MenuSceneChrome(
      this,
      {
        celestial: this.celestial,
        screen: 'result',
        account: {
          kind: 'nameplate',
          catalog: this.account.catalog,
          pointer,
        },
      },
      {
        isLeaving: () => this.exit.kind === 'leaving',
        handleControlsKey: (event) => controller.handleControlsKey(event),
        handleMenuKey: (action) => {
          // 곡 선택 화면처럼 ←→ 는 난이도, 메뉴 이동은 ↑↓ 다.
          switch (action) {
            case 'left':
            case 'right':
              controller.stepDifficulty(action === 'left' ? -1 : 1);
              return;
            case 'up':
              controller.moveFocus(-1);
              return;
            case 'down':
              controller.moveFocus(1);
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
      pointer,
    );
    chrome.renderAccount(this.account.getIdentity());
    const soundEffects = new SoundEffects(this, this.save.loadSettings());
    const { song, laneCount, difficulty, chartId, origin, report, result, ranking } = data;
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
    summary.metaLabels.forEach((label) => {
      const metaText = this.add.text(
        metaXPx,
        DIFFICULTY_Y_PX,
        label,
        textStyle('meta', COLORS.textMuted),
      );
      headerTexts.push(metaText);
      metaXPx += metaText.width + PRACTICE_BADGE_GAP_PX;
    });
    const statTexts: Phaser.GameObjects.Text[] = [...summary.statTexts];
    // 판정 내역은 세로 표 대신 한 줄의 열로 펼쳐 왼쪽 열 높이를 줄이고, 그만큼을 묶음 사이 여백으로 쓴다.
    JUDGMENTS.forEach((judgment, index) => {
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
    });
    const jacket = new JacketView(this, JACKET_X_PX, JACKET_Y_PX, JACKET_SIZE_PX).setSong(song);

    const retryButton = new Button(this, 0, BUTTON_Y_PX, {
      variant: 'quiet',
      focus: 'slide',
      label: 'RETRY',
      // 화면의 기본 동작(Enter)이므로 TRACKS 보다 한 단계 크게 둔다.
      labelType: TYPE_SCALE.heading,
      isHoverUnderlined: true,
      pointer: pointButton(pointer, 'retry'),
    });
    retryButton.setX(RIGHT_X_PX + QUIET_BUTTON_PADDING_X_PX - retryButton.width);
    const tabs = new TextTabs(
      this,
      summary.tabItems,
      DIFFICULTY_TABS_LAYOUT,
      DIFFICULTY_TABS_STYLE,
      {
        onSelect: (tabDifficulty) => {
          if (this.exit.kind !== 'leaving') {
            controller.selectDifficulty(tabDifficulty);
          }
        },
        onHover: (tabDifficulty) => controller.hoverDifficulty(tabDifficulty),
        onUnhover: (tabDifficulty) => controller.unhoverDifficulty(tabDifficulty),
      },
    );
    const songSelectButton = new Button(this, LEFT_X_PX - QUIET_BUTTON_PADDING_X_PX, 0, {
      variant: 'quiet',
      focus: 'slide',
      label: origin.kind === 'chartEditor' ? 'EDITOR' : 'TRACKS',
      isHoverUnderlined: true,
      pointer: pointButton(pointer, 'songSelect'),
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
        onClose: (id) => controller.closeToast(id),
        onHover: (id) => controller.hoverToastClose(id),
        onUnhover: (id) => controller.unhoverToastClose(id),
        onExpire: (id) => controller.dismissToast(id),
        onRemoved: (id) => controller.removeToast(id),
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
      // 확인 버튼 하나뿐이라 숨긴 취소 버튼도 같은 닫기로 잇는다.
      rankingNotice: new ConfirmDialog(this, {
        cancel: pointButton(pointer, 'noticeClose'),
        accept: pointButton(pointer, 'noticeClose'),
      }),
    };
    const controller = new ResultController(
      {
        render: (previous, next) => {
          for (const region of getChangedRegions(previous, next)) {
            this.renderRegion(view, previous, next, region);
          }
        },
        playSound: (sound) => soundEffects.play(sound),
        leave: (request) => {
          this.exit = exitScene(this, this.exit, request);
        },
        openProfile: (awaitedRanking) => {
          this.exit = exitScene(this, this.exit, {
            key: 'profile',
            data: {
              returnTo: {
                key: 'result',
                // 이미 보여 준 알림과 안내 팝업은 다시 뜨지 않고, 아직 응답을 못 받은 제출의 알림만 돌아와서 뜬다.
                data: {
                  ...data,
                  ranking: awaitedRanking,
                },
              },
            },
          });
        },
      },
      {
        song,
        laneCount,
        difficulty,
        chartId,
      },
      origin,
      ranking,
      report,
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => controller.close());
  }

  private createGradedSummary(
    presentation: ResultPresentation,
    result: GameplayResult,
    difficulty: Difficulty,
    accentColor: number,
  ): ResultSummary {
    const rank = this.createRank(presentation.rank);
    const rankBounds = rank.bounds;
    const scoreText = this.add.text(
      LEFT_X_PX,
      SCORE_Y_PX,
      formatScore(0),
      textStyle('number', COLORS.textPrimary),
    );
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
    scoreText.setAlpha(0);
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
          scoreText.getBounds(),
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
          onStart: () => scoreText.setAlpha(1),
          onUpdate: (_tween, _target, _key, current: number) =>
            scoreText.setText(formatScore(Math.round(current))),
          onComplete: () => scoreText.setText(formatScore(result.score)),
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

  private renderRegion(
    view: ResultView,
    previous: ResultState | null,
    state: ResultState,
    region: ResultRegion,
  ): void {
    switch (region) {
      case 'tabs':
        view.tabs.render(
          (tabDifficulty) => getRetryTabAppearance(state, tabDifficulty),
          state.retryChart.song.accentColor,
        );
        return;
      case 'retryButton':
        view.retryButton.render(getMenuButtonView(state, 'retry'));
        return;
      case 'songSelectButton':
        view.songSelectButton.render(getMenuButtonView(state, 'songSelect'));
        return;
      case 'menuFocusMotion':
        view.retryButton.playFocus(isResultFocused(state, 'retry'));
        view.songSelectButton.playFocus(isResultFocused(state, 'songSelect'));
        return;
      case 'controlsEntry':
        view.chrome.renderControlsEntry(isResultControlsEntryHovered(state));
        return;
      case 'controlsClose':
        view.chrome.renderControlsClose(getResultControlsCloseView(state));
        return;
      case 'accountButton':
        view.chrome.renderAccountButton(getAccountPanelButtonView(state.hover));
        return;
      case 'toasts':
        view.toasts.apply(getToastChanges(previous, state), view.presentToast);
        return;
      case 'toastClose':
        view.toasts.renderCloseHover(getHoveredToastId(state));
        return;
      case 'rankingNotice':
        view.rankingNotice.render(
          state.rankingNotice === null
            ? null
            : {
                title: this.i18n.t(`rankingNotice.${state.rankingNotice}.title`),
                body: this.i18n.t(`rankingNotice.${state.rankingNotice}.body`),
                cancelLabel: null,
                acceptLabel: this.i18n.t('rankingNotice.close'),
                acceptTone: 'default',
              },
        );
        return;
      case 'rankingNoticeButtons': {
        const close = getRankingNoticeCloseView(state);
        view.rankingNotice.renderButtons(close, close);
        return;
      }
      case 'controls':
        view.chrome.renderControls(
          state.isControlsOpen
            ? getControlsGuide(
                this.i18n.t('controls', { returnObjects: true }),
                this.save.loadSettings(),
              )
            : null,
        );
        return;
    }
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
    cues.forEach((cue) => {
      const { xPx, yPx } = getFinishAnchorPosition(cue.anchor, rankBounds, scoreBounds);
      const sprite = addCelestialSprite(this, cue.step.presentation, xPx, yPx);
      if (cue.isNodeIgnite) {
        sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => node.setVisible(true));
      }
      this.time.delayedCall(cue.playAtMs, () => playCelestialOnce(sprite));
    });
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

    const lines = this.add.graphics();
    const drawLines = (elapsedMs: number): void => {
      lines.clear();
      getConstellationLines(plan, elapsedMs).forEach(({ fromXPx, fromYPx, toXPx, toYPx }) => {
        if (glow !== null) {
          lines
            .lineStyle(CONSTELLATION_LINE_HALO_WIDTH_PX, accent, glow.lineHalo)
            .lineBetween(fromXPx, fromYPx, toXPx, toYPx);
        }
        strokeGrainedLine(
          lines,
          {
            fromXPx,
            fromYPx,
            toXPx,
            toYPx,
          },
          {
            widthPx: CONSTELLATION_LINE_CORE_WIDTH_PX,
            color: COLORS.note,
            alpha: lineCore,
          },
        );
      });
    };
    this.tweens.addCounter({
      from: 0,
      to: plan.drawEndMs,
      duration: plan.drawEndMs,
      delay: CONSTELLATION_DELAY_MS,
      onUpdate: (_tween, _target, _key, current: number) => drawLines(current),
      onComplete: () => drawLines(plan.drawEndMs),
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
