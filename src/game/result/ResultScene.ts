import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { SCENE_KEYS, exitScene } from '../sceneRoutes.js';
import type { PlayMode, ResultSceneData, SceneRequest, SongSelectRestore } from '../sceneRoutes.js';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import { getControlsGuide } from '../controlsGuide.js';
import {
  CONSTELLATION_LOOKS,
  getConstellationLines,
  getResultPresentation,
  planSongConstellation,
} from './resultConstellation.js';
import type {
  ConstellationBox,
  ConstellationPlan,
  ConstellationPoint,
} from './resultConstellation.js';
import { DifficultyTabs } from './DifficultyTabs.js';
import { RESULT_NODE_ID, planResultFinish } from './resultFinish.js';
import type { FinishAnchor, FinishCue } from './resultFinish.js';
import { STAYING } from '../sceneExit.js';
import type { SceneExit } from '../sceneExit.js';
import { stepChart } from '../../data/songs.js';
import type { ChartRef, Song } from '../../data/songs.js';
import { getRank } from '../../rhythm/rank.js';
import { JUDGMENTS } from '../../rhythm/judgment.js';
import { Button } from '../ui/Button.js';
import {
  addCelestialAtmosphere,
  getCelestialAtmosphereUses,
  getCelestialEntryTransitionUses,
  playCelestialEntryTransition,
} from '../celestial/celestialAtmosphere.js';
import {
  addCelestialSprite,
  playCelestialOnce,
  queueCelestialTextures,
} from '../celestial/celestialSprites.js';
import { formatAccuracy, formatScore } from '../ui/format.js';
import { JacketView, queueJacketLoads } from '../ui/jacket.js';
import { LIGHT_TEXTURES, addLight, ensureLightTextures } from '../ui/lightTextures.js';
import { MenuFocus } from '../ui/MenuFocus.js';
import { ControlsOverlay, addControlsEntry } from '../ui/ControlsOverlay.js';
import { handleEachEventOnce, readMenuAction, requireKeyboard } from '../ui/menuInput.js';
import {
  COLORS,
  JUDGMENT_COLORS,
  MOTION,
  SCREEN_LAYOUT,
  TYPE_SCALE,
  textStyle,
} from '../ui/theme.js';

type MenuItem = 'retry' | 'songSelect';

const LEFT_X_PX = SCREEN_LAYOUT.leftXPx;
const RIGHT_X_PX = SCREEN_LAYOUT.rightXPx;
const TITLE_Y_PX = 120;
const DIFFICULTY_Y_PX = 176;
const PRACTICE_BADGE_GAP_PX = 24;
const RANK_Y_PX = 230;
const SCORE_Y_PX = 420;
const STATS_Y_PX = 540;
const MAX_COMBO_VALUE_GAP_PX = 16;
const JUDGMENT_COLUMN_WIDTH_PX = 130;
const JUDGMENT_LABEL_Y_PX = 640;
const JUDGMENT_COUNT_Y_PX = 676;
/** MAX COMBO 를 판정 열의 세 번째 줄(GOOD)에 맞춰 두 줄이 같은 격자를 쓰게 한다. */
const MAX_COMBO_X_PX = LEFT_X_PX + JUDGMENT_COLUMN_WIDTH_PX * 2;
// 자켓 윗변을 곡명에 맞춰 왼쪽 정보 열과 오른쪽 자켓이 한 줄에서 시작하게 한다.
const JACKET_SIZE_PX = 480;
const JACKET_X_PX = RIGHT_X_PX - JACKET_SIZE_PX;
const JACKET_Y_PX = TITLE_Y_PX;
/** 판정 표와는 넓게, RETRY 와는 좁게 띄워 한 묶음으로 보이게 한다. */
const DIFFICULTY_TABS_Y_PX = 808;
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
  topPx: 210,
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
const NODE_Y_PX = JACKET_Y_PX + JACKET_SIZE_PX + 86;
const STARFALL_X_PX = JACKET_X_PX + 260;
const STARFALL_Y_PX = JACKET_Y_PX + JACKET_SIZE_PX + 144;
const SCORE_SHIMMER_DX_PX = 128;
const SCORE_SHIMMER_DY_PX = 12;

export class ResultScene extends Phaser.Scene {
  private exit: SceneExit<SceneRequest> = STAYING;
  private jacketSongs: readonly Song[] = [];

  constructor(
    private readonly save: LocalSave,
    private readonly i18n: I18n,
    private readonly celestial: CelestialCatalog,
  ) {
    super(SCENE_KEYS.result);
  }

  init(data: ResultSceneData): void {
    this.jacketSongs = [data.song];
  }

  preload(): void {
    queueJacketLoads(this, this.jacketSongs);
    queueCelestialTextures(this, this.celestial, [
      ...getCelestialAtmosphereUses(this.celestial, 'result'),
      ...getCelestialEntryTransitionUses(this.celestial),
      this.celestial.atlasPresentations[RESULT_NODE_ID],
      ...this.celestial.nodeOnlyFinish.map((step) => step.presentation),
    ]);
  }

  create(data: ResultSceneData): void {
    this.exit = STAYING;
    addCelestialAtmosphere(this, this.celestial, 'result');
    const keyboard = requireKeyboard(this);
    const { song, laneCount, difficulty, chartId, mode, result, restore } = data;
    let retryChart: ChartRef = {
      song,
      laneCount,
      difficulty,
      chartId,
    };
    const activate = (item: MenuItem): void => this.activate(item, retryChart, mode, restore);
    this.cameras.main.fadeIn(MOTION.mediumMs);

    const titleText = this.add.text(
      LEFT_X_PX,
      TITLE_Y_PX,
      song.title,
      textStyle('heading', COLORS.textPrimary),
    );
    const difficultyText = this.add.text(
      LEFT_X_PX,
      DIFFICULTY_Y_PX,
      difficulty.toUpperCase(),
      textStyle('meta', COLORS.textMuted),
    );
    const headerTexts: Phaser.GameObjects.Text[] = [titleText, difficultyText];
    if (mode === 'practice') {
      headerTexts.push(
        this.add.text(
          difficultyText.x + difficultyText.width + PRACTICE_BADGE_GAP_PX,
          DIFFICULTY_Y_PX,
          'PRACTICE',
          textStyle('meta', COLORS.textMuted),
        ),
      );
    }
    // 랭크용 display 서체는 별자리 영역과 겹치므로 FAILED 는 더 작은 title 서체로 같은 자리에 둔다.
    const rank =
      result.outcome === 'failed'
        ? {
            label: 'FAILED',
            style: textStyle('title', JUDGMENT_COLORS.miss),
          }
        : {
            label: getRank(result.accuracy),
            style: textStyle('display', COLORS.textPrimary),
          };
    const rankText = this.add.text(LEFT_X_PX, RANK_Y_PX, rank.label, rank.style);
    const rankBounds = rankText.getBounds();
    // scale 강조가 글자 중심에서 일어나도록 원점만 중심으로 옮긴다. 표시 위치는 그대로다.
    rankText.setOrigin(0.5).setPosition(rankBounds.centerX, rankBounds.centerY);
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
    const statTexts: Phaser.GameObjects.Text[] = [accuracyText, maxComboLabel, maxComboValue];
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
      onActivate: () => activate('retry'),
    });
    retryButton.setX(RIGHT_X_PX + QUIET_BUTTON_PADDING_X_PX - retryButton.width);
    const selectRetryChart = (next: ChartRef): void => {
      if (this.exit.kind === 'leaving' || next.difficulty === retryChart.difficulty) {
        return;
      }
      retryChart = next;
      tabs.render({
        selected: next.difficulty,
        song,
        laneCount,
      });
    };
    const tabs = new DifficultyTabs(
      this,
      RIGHT_X_PX,
      DIFFICULTY_TABS_Y_PX,
      {
        selected: difficulty,
        song,
        laneCount,
      },
      selectRetryChart,
    );
    const songSelectButton = new Button(this, LEFT_X_PX - QUIET_BUTTON_PADDING_X_PX, 0, {
      variant: 'quiet',
      focus: 'slide',
      label: 'TRACKS',
      onActivate: () => activate('songSelect'),
    });
    // 글자 크기가 달라 아랫변을 맞춰야 RETRY 와 한 줄로 읽힌다.
    songSelectButton.setY(retryButton.y + retryButton.height - songSelectButton.height);
    const menu = new MenuFocus<MenuItem>([
      {
        item: 'retry',
        button: retryButton,
      },
      {
        item: 'songSelect',
        button: songSelectButton,
      },
    ]);
    const overlay = new ControlsOverlay(this, () =>
      getControlsGuide(this.i18n.t('controls', { returnObjects: true }), this.save.loadSettings()),
    );
    addControlsEntry(this, LEFT_X_PX, SCREEN_LAYOUT.hintYPx, () => overlay.open());
    playCelestialEntryTransition(this, this.celestial, rankBounds);
    const presentation = getResultPresentation(mode, result);
    this.playFinish(
      planResultFinish(
        presentation.hasFinish,
        this.celestial.nodeOnlyFinish,
        SCORE_COUNT_DELAY_MS + SCORE_COUNT_DURATION_MS,
      ),
      rankBounds,
      scoreText.getBounds(),
    );

    this.fadeInAt([jacket, ...headerTexts], 1, HEADER_REVEAL_DELAY_MS);
    rankText.setAlpha(0).setScale(RANK_REVEAL_SCALE);
    this.tweens.add({
      targets: rankText,
      alpha: 1,
      scale: 1,
      delay: RANK_REVEAL_DELAY_MS,
      duration: RANK_REVEAL_DURATION_MS,
      ease: 'Cubic.Out',
    });
    scoreText.setAlpha(0);
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
    this.fadeInAt(statTexts, 1, STATS_REVEAL_DELAY_MS);
    this.fadeInAt([...tabs.getVisuals(), retryButton, songSelectButton], 1, MENU_REVEAL_DELAY_MS);
    this.revealConstellation(
      planSongConstellation(song.id, song.constellation, presentation.tier, CONSTELLATION_BOX),
      song.accentColor,
    );
    if (presentation.hasFullComboLabel) {
      this.revealFullCombo(rankBounds, song.accentColor);
    }
    keyboard.on(
      'keydown',
      handleEachEventOnce((event: KeyboardEvent) =>
        this.handleKey(event, menu, overlay, activate, (delta) =>
          selectRetryChart(stepChart(retryChart, delta)),
        ),
      ),
    );
  }

  private handleKey(
    event: KeyboardEvent,
    menu: MenuFocus<MenuItem>,
    overlay: ControlsOverlay,
    activate: (item: MenuItem) => void,
    stepRetryChart: (delta: 1 | -1) => void,
  ): void {
    if (this.exit.kind === 'leaving') {
      return;
    }
    if (overlay.handleKey(event)) {
      return;
    }
    // 곡 선택 화면처럼 ←→ 는 난이도, 메뉴 이동은 ↑↓ 다.
    const action = readMenuAction(event);
    switch (action) {
      case 'left':
      case 'right':
        stepRetryChart(action === 'left' ? -1 : 1);
        break;
      case 'up':
        menu.move(-1);
        break;
      case 'down':
        menu.move(1);
        break;
      case 'confirm':
        activate(menu.getFocused());
        break;
      case 'back':
        activate('songSelect');
        break;
      default:
        break;
    }
  }

  private activate(
    item: MenuItem,
    retryChart: ChartRef,
    mode: PlayMode,
    restore: SongSelectRestore | undefined,
  ): void {
    if (this.exit.kind === 'leaving') {
      return;
    }
    const restoreData =
      restore === undefined
        ? {}
        : {
            restore: {
              ...restore,
              difficulty: retryChart.difficulty,
            },
          };
    switch (item) {
      case 'retry':
        this.exit = exitScene(this, this.exit, {
          key: 'gameplay',
          data: {
            ...retryChart,
            mode,
            ...restoreData,
          },
        });
        return;
      case 'songSelect':
        this.exit = exitScene(this, this.exit, {
          key: 'songSelect',
          data: {
            mode,
            ...restoreData,
          },
        });
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
        lines
          .lineStyle(CONSTELLATION_LINE_CORE_WIDTH_PX, COLORS.note, lineCore)
          .lineBetween(fromXPx, fromYPx, toXPx, toYPx);
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
