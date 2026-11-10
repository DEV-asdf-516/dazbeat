import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { findAchievement } from '../../data/achievements.js';
import type { AchievementCatalog } from '../../data/achievements.js';
import { getAvailableDifficulties } from '../../data/songs.js';
import type { Song } from '../../data/songs.js';
import type { Difficulty, LaneCount } from '../../rhythm/types.js';
import { requireDefined } from '../../invariant.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import { getControlsGuide } from '../app/controlsGuide.js';
import { STAYING } from '../app/sceneExit.js';
import type { SceneExit } from '../app/sceneExit.js';
import { SCENE_KEYS, exitScene } from '../app/sceneRoutes.js';
import type { RankingSceneData, SceneRequest } from '../app/sceneRoutes.js';
import type { CelestialCatalog } from '../celestial/state/celestialCatalog.js';
import { queueCelestialTextures } from '../celestial/view/celestialSprites.js';
import { renderZodiacFigure } from '../celestial/view/zodiacSign.js';
import { DIFFICULTY_TAB_ITEMS } from '../ui/state/difficultyAppearance.js';
import { formatAccuracy, formatScore } from '../ui/state/format.js';
import { MOTION } from '../ui/state/motion.js';
import { pointButton } from '../ui/view/input/hoverTarget.js';
import type { ButtonPointer } from '../ui/view/input/hoverTarget.js';
import {
  DETAIL_RIGHT_X_PX,
  DETAIL_X_PX,
  DIFFICULTY_TABS_LAYOUT,
  DIFFICULTY_TABS_STYLE,
  INFO_X_PX,
  JACKET_SIZE_PX,
  JACKET_Y_PX,
  LIST_PANEL,
  addGlassPanel,
  PAGE_X_PX,
  PAGE_Y_PX,
  ROW_HEIGHT_PX,
  ROW_Y_PX,
  TITLE_MAX_LINES,
  TITLE_Y_PX,
  ZODIAC_AREA_GAP_PX,
  ZODIAC_AREA_LEFT_X_PX,
  ZODIAC_MAX_SPAN_PX,
  LANE_STAR_ID,
  addLaneMarks,
  fitSongTitle,
  renderLaneMarks,
} from '../ui/view/widgets/songDetailLayout.js';
import type { LaneMarks } from '../ui/view/widgets/songDetailLayout.js';
import { SoundEffects, queueSoundEffects } from '../ui/view/soundEffects.js';
import {
  CATEGORY_COLORS,
  CELESTIAL_COLORS,
  COLORS,
  LIST_ROW,
  RADIUS,
  SCREEN_LAYOUT,
  setTextColor,
  textStyle,
  typeStyle,
} from '../ui/view/theme.js';
import { ConfirmDialog } from '../ui/view/widgets/ConfirmDialog.js';
import type { ConfirmDialogContent } from '../ui/view/widgets/ConfirmDialog.js';
import { getAccountPanelButtonView } from '../ui/state/accountIdentity.js';
import type { AccountSource } from '../ui/state/accountIdentity.js';
import { MenuSceneChrome, getMenuSceneTextureUses } from '../ui/view/widgets/MenuSceneChrome.js';
import { NoticeText } from '../ui/view/widgets/NoticeText.js';
import { setFittedText } from '../ui/view/widgets/fitText.js';
import { TextTabs } from '../ui/view/widgets/TextTabs.js';
import { TOP_RANK_GLINT_ID, TopRankBadge } from '../ui/view/widgets/TopRankBadge.js';
import {
  getAchievementEmblemTexture,
  queueAchievementEmblemLoads,
} from '../ui/view/widgets/achievementEmblem.js';
import { createFooterAuxiliaryButtons } from '../ui/view/widgets/auxiliaryButton.js';
import type { Button } from '../ui/view/widgets/Button.js';
import { JacketView, queueJacketLoads } from '../ui/view/widgets/jacket.js';
import { LOADING_STAR_ID } from '../ui/view/widgets/LoadingStar.js';
import { RankingController } from './RankingController.js';
import type { RankingPorts } from './RankingController.js';
import {
  RANKING_VISIBLE_ROWS,
  getChangedRegions,
  getMyRankView,
  getRankingBackView,
  getRankingControlsCloseView,
  getRankingDialogButtonViews,
  getRankingDifficultyAppearance,
  getRankingNotice,
  getRankingRowIndicator,
  getRankingRows,
  getRankingTotal,
  isRankingControlsEntryHovered,
} from './state/rankingState.js';
import type {
  RankingButton,
  RankingDialog,
  RankingRegion,
  RankingRow,
  RankingState,
} from './state/rankingState.js';

const PANEL_RIGHT_X_PX = LIST_PANEL.xPx + LIST_PANEL.widthPx;
const TOTAL_LABEL_GAP_PX = 10;
const TOTAL_LABEL_TYPE = {
  sizePx: 16,
  weight: 500,
} as const;
const TOTAL_VALUE_TYPE = {
  sizePx: 22,
  weight: 600,
} as const;
const NICKNAME_TYPE = {
  sizePx: 27,
  weight: 500,
} as const;
const SCORE_TYPE = {
  sizePx: 22,
  weight: 500,
} as const;
const ACCURACY_TYPE = {
  sizePx: 20,
  weight: 500,
} as const;
const ROW_FILL_X_PX = LIST_PANEL.xPx + 8;
const ROW_FILL_WIDTH_PX = LIST_PANEL.widthPx - 16;
const BADGE_X_PX = 152;
const BADGE_NUMBER_SIZE_PX = 32;
const RANK_CENTER_X_PX = 212;
// 닉네임 길이와 상관없이 엠블럼 자리가 같도록 닉네임 앞에 둔다. 엠블럼이 없으면 닉네임을 그 자리로 당긴다.
const EMBLEM_X_PX = 254;
const MY_ROW_BADGE_GAP_PX = 14;
const EMBLEM_SIZE_PX = 36;
const EMBLEM_GAP_PX = 12;
const NICKNAME_AFTER_EMBLEM_X_PX = EMBLEM_X_PX + EMBLEM_SIZE_PX + EMBLEM_GAP_PX;
const SCORE_RIGHT_X_PX = 706;
// 오른쪽 정렬한 점수의 가장 긴 폭(170,000)과 사이 여백을 남기고 닉네임을 자른다.
const NICKNAME_RIGHT_X_PX = SCORE_RIGHT_X_PX - 120;
const ACCURACY_RIGHT_X_PX = 807;
const CATEGORY_GAP_PX = 8;
// 곡 선택의 BEST 기록 묶음과 같은 자리와 문법으로 MY RANK 를 둔다.
const MY_RANK_GAP_PX = 40;
const MY_RANK_VALUE_GAP_PX = 14;
const MY_RANK_DETAIL_GAP_PX = 8;
const MY_RANK_SIGN_IN_TYPE = {
  sizePx: 18,
  weight: 500,
};
// 곡 선택의 RANDOM, PLAY 위까지 남는 하늘과 같은 높이에서 별자리를 끝낸다.
const ZODIAC_BOTTOM_Y_PX = LIST_PANEL.yPx + LIST_PANEL.heightPx - ZODIAC_AREA_GAP_PX * 2;
// 마우스 휠 한 칸의 이동량(브라우저 기본 100px)에 한 줄씩 넘어가게 한다.
const WHEEL_STEP_PX = 100;

interface RowView {
  readonly fill: Phaser.GameObjects.Rectangle;
  readonly badge: TopRankBadge;
  readonly rank: Phaser.GameObjects.Text;
  readonly nickname: Phaser.GameObjects.Text;
  readonly emblem: Phaser.GameObjects.Image;
  readonly score: Phaser.GameObjects.Text;
  readonly accuracy: Phaser.GameObjects.Text;
}

interface RankingView {
  readonly chrome: MenuSceneChrome;
  readonly backButton: Button;
  readonly totalLabel: Phaser.GameObjects.Text;
  readonly totalValue: Phaser.GameObjects.Text;
  readonly rows: readonly RowView[];
  readonly rowIndicator: Phaser.GameObjects.Text;
  readonly notice: NoticeText;
  readonly jacket: JacketView;
  readonly titleText: Phaser.GameObjects.Text;
  readonly categoryText: Phaser.GameObjects.Text;
  readonly laneMarks: LaneMarks;
  readonly myRankLabel: Phaser.GameObjects.Text;
  readonly myRankValue: Phaser.GameObjects.Text;
  readonly myRankInfo: Phaser.GameObjects.Text;
  readonly myRankDetail: Phaser.GameObjects.Text;
  readonly myRankSignIn: Phaser.GameObjects.Text;
  readonly difficultyTabs: TextTabs<Difficulty>;
  readonly zodiacStars: Phaser.GameObjects.Image;
  readonly zodiacLines: Phaser.GameObjects.Graphics;
  readonly dialog: ConfirmDialog;
}

export class RankingScene extends Phaser.Scene {
  private exit: SceneExit<SceneRequest> = STAYING;
  private jacketSongs: readonly Song[] = [];

  constructor(
    private readonly save: LocalSave,
    private readonly i18n: I18n,
    private readonly celestial: CelestialCatalog,
    private readonly catalog: AchievementCatalog,
    private readonly ports: RankingPorts,
    private readonly account: AccountSource,
  ) {
    super(SCENE_KEYS.ranking);
  }

  init(data: RankingSceneData): void {
    this.jacketSongs = [data.chart.song];
  }

  preload(): void {
    queueJacketLoads(this, this.jacketSongs);
    queueAchievementEmblemLoads(this);
    queueSoundEffects(this);
    queueCelestialTextures(this, this.celestial, [
      ...getMenuSceneTextureUses(this.celestial, 'songSelect'),
      this.celestial.atlasPresentations[TOP_RANK_GLINT_ID],
      this.celestial.atlasPresentations[LOADING_STAR_ID],
      this.celestial.atlasPresentations[LANE_STAR_ID],
    ]);
  }

  create(data: RankingSceneData): void {
    this.exit = STAYING;
    const pointer: ButtonPointer<RankingButton> = {
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
        account: {
          kind: 'nameplate',
          catalog: this.account.catalog,
          pointer,
        },
      },
      {
        isLeaving: () => this.exit.kind === 'leaving',
        handleControlsKey: (event) => controller.handleControlsKey(event),
        handleMenuKey: (action) => controller.handleMenuKey(action),
      },
      pointer,
    );
    chrome.renderAccount(this.account.getIdentity());
    addGlassPanel(this, LIST_PANEL, RADIUS.smallPx);
    this.cameras.main.fadeIn(MOTION.mediumMs);
    const title = this.add.text(
      LIST_PANEL.xPx,
      SCREEN_LAYOUT.headerYPx,
      'RANKING',
      textStyle('primary', COLORS.textPrimary, 600),
    );
    const titleBaselineYPx = title.y + title.getTextMetrics().ascent;
    const [backButton] = createFooterAuxiliaryButtons(this, [
      {
        label: 'BACK',
        pointer: pointButton(pointer, 'back'),
      },
    ]);
    const totalLabel = this.add
      .text(0, 0, 'Players', typeStyle(TOTAL_LABEL_TYPE, CELESTIAL_COLORS.textNeutral))
      .setOrigin(1, 0);
    const totalValue = this.add
      .text(PANEL_RIGHT_X_PX, 0, '', typeStyle(TOTAL_VALUE_TYPE, COLORS.textPrimary))
      .setOrigin(1, 0);
    // 글자 크기가 달라 RANKING 과 기준선을 맞춰야 한 줄로 읽힌다.
    totalLabel.setY(titleBaselineYPx - totalLabel.getTextMetrics().ascent);
    totalValue.setY(titleBaselineYPx - totalValue.getTextMetrics().ascent);
    const chart = data.chart;
    const view: RankingView = {
      chrome,
      backButton: requireDefined(backButton, 'Missing ranking header button', 'BACK'),
      totalLabel,
      totalValue,
      rows: Array.from({ length: RANKING_VISIBLE_ROWS }, (_, index) => this.createRow(index)),
      rowIndicator: this.add.text(
        PAGE_X_PX,
        PAGE_Y_PX,
        '',
        textStyle('meta', CELESTIAL_COLORS.textNeutral),
      ),
      notice: new NoticeText(
        this,
        this.celestial,
        this.add
          .text(
            LIST_PANEL.xPx + LIST_PANEL.widthPx / 2,
            LIST_PANEL.yPx + LIST_PANEL.heightPx / 2,
            '',
            textStyle('secondary', CELESTIAL_COLORS.textNeutral),
          )
          .setOrigin(0.5),
      ),
      jacket: new JacketView(this, DETAIL_X_PX, JACKET_Y_PX, JACKET_SIZE_PX),
      titleText: this.add
        .text(INFO_X_PX, TITLE_Y_PX, '', textStyle('title', COLORS.textPrimary))
        .setMaxLines(TITLE_MAX_LINES),
      categoryText: this.add.text(
        INFO_X_PX,
        TITLE_Y_PX,
        '',
        textStyle('secondary', CELESTIAL_COLORS.textNeutral),
      ),
      laneMarks: addLaneMarks(this, this.celestial),
      myRankLabel: this.add.text(
        INFO_X_PX,
        TITLE_Y_PX,
        'MY RANK',
        textStyle('meta', CELESTIAL_COLORS.textNeutral),
      ),
      myRankValue: this.add.text(
        0,
        TITLE_Y_PX,
        '',
        textStyle('primary', CELESTIAL_COLORS.selected, 700),
      ),
      myRankInfo: this.add.text(
        0,
        TITLE_Y_PX,
        '',
        textStyle('secondary', CELESTIAL_COLORS.textNeutral),
      ),
      myRankDetail: this.add.text(
        INFO_X_PX,
        TITLE_Y_PX,
        '',
        textStyle('secondary', COLORS.textPrimary),
      ),
      myRankSignIn: this.add.text(
        INFO_X_PX,
        TITLE_Y_PX,
        this.i18n.t('ranking.signInForRank'),
        typeStyle(MY_RANK_SIGN_IN_TYPE, COLORS.textMuted),
      ),
      difficultyTabs: new TextTabs(
        this,
        DIFFICULTY_TAB_ITEMS.filter(({ key }) =>
          getAvailableDifficulties(chart.song, chart.laneCount).includes(key),
        ),
        DIFFICULTY_TABS_LAYOUT,
        DIFFICULTY_TABS_STYLE,
        {
          onSelect: (difficulty) => controller.selectDifficulty(difficulty),
          onHover: (difficulty) => controller.hoverDifficulty(difficulty),
          onUnhover: (difficulty) => controller.unhoverDifficulty(difficulty),
        },
      ),
      zodiacStars: this.add.image(0, 0, '__DEFAULT').setBlendMode(Phaser.BlendModes.SCREEN),
      zodiacLines: this.add.graphics(),
      // 버튼마다 눌렀을 때의 뜻은 상태가 대화상자 종류로 정한다.
      dialog: new ConfirmDialog(this, {
        cancel: pointButton(pointer, 'dialogCancel'),
        accept: pointButton(pointer, 'dialogAccept'),
      }),
    };
    chrome.start(title.getBounds());
    const soundEffects = new SoundEffects(this, this.save.loadSettings());
    const controller = new RankingController(
      this.ports,
      {
        render: (previous, next) => {
          for (const region of getChangedRegions(previous, next)) {
            this.renderRegion(view, next, region);
          }
        },
        playSound: (sound) => soundEffects.play(sound),
        openProfile: () => {
          this.exit = exitScene(this, this.exit, {
            key: 'profile',
            data: {
              returnTo: {
                key: 'ranking',
                data,
              },
            },
          });
        },
        back: () => {
          this.exit = exitScene(this, this.exit, {
            key: 'songSelect',
            data: {
              mode: data.mode,
              restore: data.restore,
            },
          });
        },
      },
      chart,
      WHEEL_STEP_PX,
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => controller.close());
    const panel = new Phaser.Geom.Rectangle(
      LIST_PANEL.xPx,
      LIST_PANEL.yPx,
      LIST_PANEL.widthPx,
      LIST_PANEL.heightPx,
    );
    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (pointer: Phaser.Input.Pointer, _over: unknown, _deltaX: number, deltaY: number) => {
        if (panel.contains(pointer.x, pointer.y)) {
          controller.scrollByWheel(deltaY, this.time.now);
        }
      },
    );
  }

  private renderRegion(view: RankingView, state: RankingState, region: RankingRegion): void {
    switch (region) {
      case 'songInfo':
        this.renderSongInfo(view, state.chart.song, state.chart.laneCount);
        return;
      case 'rows': {
        const rows = getRankingRows(state);
        view.rows.forEach((row, index) => this.renderRow(row, rows[index] ?? null));
        const indicator = getRankingRowIndicator(state);
        view.rowIndicator
          .setText(indicator.kind === 'text' ? indicator.text : '')
          .setVisible(indicator.kind === 'text');
        return;
      }
      case 'total': {
        const total = getRankingTotal(state);
        view.totalValue
          .setText(total.kind === 'count' ? String(total.count) : '')
          .setVisible(total.kind === 'count');
        view.totalLabel
          .setX(PANEL_RIGHT_X_PX - view.totalValue.width - TOTAL_LABEL_GAP_PX)
          .setVisible(total.kind === 'count');
        return;
      }
      case 'myRank':
        this.renderMyRank(view, state);
        return;
      case 'notice':
        switch (getRankingNotice(state)) {
          case 'loading':
            view.notice.show({
              kind: 'loading',
              text: this.i18n.t('ranking.loading'),
            });
            return;
          case 'empty':
            view.notice.show({
              kind: 'text',
              text: this.i18n.t('ranking.empty'),
            });
            return;
          case 'none':
            view.notice.show({ kind: 'none' });
            return;
        }
        return;
      case 'difficultyTabs':
        view.difficultyTabs.render(
          (difficulty) => getRankingDifficultyAppearance(state, difficulty),
          state.chart.song.accentColor,
        );
        return;
      case 'dialog':
        view.dialog.render(state.dialog === 'none' ? null : this.getDialogContent(state.dialog));
        return;
      case 'dialogButtons': {
        const { cancel, accept } = getRankingDialogButtonViews(state);
        view.dialog.renderButtons(cancel, accept);
        return;
      }
      case 'backButton':
        view.backButton.render(getRankingBackView(state));
        return;
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
      case 'controlsEntry':
        view.chrome.renderControlsEntry(isRankingControlsEntryHovered(state));
        return;
      case 'controlsClose':
        view.chrome.renderControlsClose(getRankingControlsCloseView(state));
        return;
      case 'accountButton':
        view.chrome.renderAccountButton(getAccountPanelButtonView(state.hover));
        return;
    }
  }

  private getDialogContent(dialog: RankingDialog): ConfirmDialogContent {
    switch (dialog) {
      case 'failed':
        return {
          title: this.i18n.t('ranking.failedTitle'),
          body: this.i18n.t('loadFailure.body'),
          cancelLabel: 'BACK',
          acceptLabel: 'RETRY',
          acceptTone: 'default',
        };
      case 'unavailable':
        return {
          title: this.i18n.t('ranking.unavailableTitle'),
          body: this.i18n.t('ranking.unavailableBody'),
          cancelLabel: null,
          acceptLabel: 'BACK',
          acceptTone: 'default',
        };
      case 'revised':
        return {
          title: this.i18n.t('ranking.revisedTitle'),
          body: this.i18n.t('ranking.revisedBody'),
          cancelLabel: null,
          acceptLabel: this.i18n.t('rankingNotice.close'),
          acceptTone: 'default',
        };
    }
  }

  /** 곡은 화면에 머무는 동안 바뀌지 않으므로 처음 한 번 그리고, MY RANK 와 별자리 자리도 여기서 정한다. */
  private renderSongInfo(view: RankingView, song: Song, laneCount: LaneCount): void {
    view.jacket.setSong(song);
    fitSongTitle(view.titleText, song.title);
    setTextColor(view.categoryText, CATEGORY_COLORS[song.category]);
    view.categoryText
      .setText(song.category.toUpperCase())
      .setY(view.titleText.y + view.titleText.height + CATEGORY_GAP_PX);
    renderLaneMarks(view.laneMarks, view.categoryText, laneCount);
    const myRankYPx = view.categoryText.y + view.categoryText.height + MY_RANK_GAP_PX;
    const valueXPx = INFO_X_PX + view.myRankLabel.width + MY_RANK_VALUE_GAP_PX;
    const lineCenterYPx = myRankYPx + view.myRankValue.height / 2;
    view.myRankLabel.setY(lineCenterYPx).setOrigin(0, 0.5);
    view.myRankValue.setPosition(valueXPx, lineCenterYPx).setOrigin(0, 0.5);
    view.myRankInfo.setPosition(valueXPx, lineCenterYPx).setOrigin(0, 0.5);
    view.myRankDetail.setY(myRankYPx + view.myRankValue.height + MY_RANK_DETAIL_GAP_PX);
    view.myRankSignIn.setY(view.myRankDetail.y);
    renderZodiacFigure(
      view.zodiacStars,
      view.zodiacLines,
      song.constellation,
      {
        leftXPx: ZODIAC_AREA_LEFT_X_PX,
        rightXPx: DETAIL_RIGHT_X_PX,
        topYPx: view.myRankDetail.y + view.myRankDetail.height + ZODIAC_AREA_GAP_PX,
        bottomYPx: ZODIAC_BOTTOM_Y_PX,
      },
      ZODIAC_MAX_SPAN_PX,
    );
  }

  private renderMyRank(view: RankingView, state: RankingState): void {
    const myRank = getMyRankView(state);
    view.myRankLabel.setVisible(myRank.kind !== 'hidden');
    view.myRankValue.setVisible(myRank.kind === 'ranked');
    view.myRankDetail.setVisible(myRank.kind === 'ranked');
    view.myRankInfo.setVisible(myRank.kind === 'none');
    view.myRankSignIn.setVisible(myRank.kind === 'guest');
    switch (myRank.kind) {
      case 'none':
        view.myRankInfo.setText('-');
        return;
      case 'ranked':
        view.myRankValue.setText(myRank.rank);
        view.myRankDetail.setText(
          `${formatScore(myRank.score)}   ${formatAccuracy(myRank.accuracy)}`,
        );
        return;
      case 'guest':
      case 'hidden':
        return;
    }
  }

  private renderRow(row: RowView, entry: RankingRow | null): void {
    const objects = [row.fill, row.rank, row.nickname, row.emblem, row.score, row.accuracy];
    if (entry === null) {
      objects.forEach((object) => object.setVisible(false));
      row.badge.render(null);
      return;
    }
    if (entry.outsideTopRank === null) {
      row.badge.render(entry.hasTopBadge ? entry.rank : null);
    } else {
      row.badge.renderOutsideTop(entry.outsideTopRank);
    }
    row.fill.setVisible(entry.isMe);
    setTextColor(row.rank, entry.isMe ? CELESTIAL_COLORS.selected : CELESTIAL_COLORS.textNeutral);
    row.rank.setText(String(entry.rank)).setVisible(!entry.hasTopBadge);
    setTextColor(row.nickname, entry.isMe ? CELESTIAL_COLORS.selected : COLORS.textPrimary);
    // 내 줄의 TOP 표시는 글자가 길어 닉네임 칸을 넘을 수 있으니 그만큼 민다.
    const emblemXPx = entry.isMe
      ? Math.max(EMBLEM_X_PX, row.badge.getRightXPx() + MY_ROW_BADGE_GAP_PX)
      : EMBLEM_X_PX;
    row.emblem.setX(emblemXPx);
    const featured =
      entry.featuredAchievement === null
        ? undefined
        : findAchievement(this.catalog, entry.featuredAchievement);
    if (featured === undefined) {
      row.emblem.setVisible(false);
    } else {
      row.emblem
        .setTexture(getAchievementEmblemTexture(this, this.catalog, featured, EMBLEM_SIZE_PX))
        .setVisible(true);
    }
    const nicknameXPx =
      featured === undefined ? emblemXPx : emblemXPx + NICKNAME_AFTER_EMBLEM_X_PX - EMBLEM_X_PX;
    setFittedText(
      row.nickname.setX(nicknameXPx),
      entry.nickname,
      NICKNAME_RIGHT_X_PX - nicknameXPx,
    ).setVisible(true);
    row.score.setText(formatScore(entry.score)).setVisible(true);
    row.accuracy.setText(formatAccuracy(entry.accuracy)).setVisible(true);
  }

  private createRow(index: number): RowView {
    const centerYPx = ROW_Y_PX + ROW_HEIGHT_PX * index + ROW_HEIGHT_PX / 2;
    const fill = this.add
      .rectangle(
        ROW_FILL_X_PX,
        centerYPx,
        ROW_FILL_WIDTH_PX,
        ROW_HEIGHT_PX - LIST_ROW.selectedFill.insetYPx * 2,
        LIST_ROW.selectedFill.color,
        LIST_ROW.selectedFill.alpha,
      )
      .setOrigin(0, 0.5);
    return {
      fill,
      badge: new TopRankBadge(this, this.celestial, {
        xPx: BADGE_X_PX,
        yPx: centerYPx,
        align: 'left',
        hasWord: true,
        numberSizePx: BADGE_NUMBER_SIZE_PX,
      }),
      rank: this.add
        .text(
          RANK_CENTER_X_PX,
          centerYPx,
          '',
          textStyle('primary', CELESTIAL_COLORS.textNeutral, 500),
        )
        .setOrigin(0.5),
      nickname: this.add
        .text(EMBLEM_X_PX, centerYPx, '', typeStyle(NICKNAME_TYPE, COLORS.textPrimary))
        .setOrigin(0, 0.5),
      emblem: this.add.image(EMBLEM_X_PX, centerYPx, '__DEFAULT').setOrigin(0, 0.5),
      score: this.add
        .text(SCORE_RIGHT_X_PX, centerYPx, '', typeStyle(SCORE_TYPE, COLORS.textPrimary))
        .setOrigin(1, 0.5),
      accuracy: this.add
        .text(
          ACCURACY_RIGHT_X_PX,
          centerYPx,
          '',
          typeStyle(ACCURACY_TYPE, CELESTIAL_COLORS.textNeutral),
        )
        .setOrigin(1, 0.5),
    };
  }
}
