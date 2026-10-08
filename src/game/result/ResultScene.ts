import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { SCENE_KEYS, exitScene } from '../config.js';
import type { ResultSceneData, SceneRequest } from '../config.js';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import { getAtlasPresentation } from '../celestial/celestialCatalog.js';
import { getConstellationTier, planSongConstellation } from './resultConstellation.js';
import type {
  ConstellationBox,
  ConstellationPlan,
  ConstellationTier,
} from './resultConstellation.js';
import { DifficultyTabs } from './DifficultyTabs.js';
import { RESULT_NODE_ID, planResultFinish } from './resultFinish.js';
import { stepRetryDifficulty } from './retryDifficulty.js';
import type { FinishAnchor, FinishCue } from './resultFinish.js';
import { STAYING } from '../sceneExit.js';
import type { SceneExit } from '../sceneExit.js';
import { clamp } from '../range.js';
import { getAvailableDifficulties } from '../../data/songs.js';
import type { Song } from '../../data/songs.js';
import type { Difficulty } from '../../rhythm/types.js';
import { getRank } from '../../rhythm/rank.js';
import { isFullCombo } from '../../rhythm/score.js';
import type { Judgment } from '../../rhythm/types.js';
import { Button } from '../ui/Button.js';
import {
  addCelestialAtmosphere,
  playCelestialEntryTransition,
} from '../celestial/celestialAtmosphere.js';
import {
  addCelestialSprite,
  playCelestialOnce,
  queueCelestialTextures,
  registerCelestialAnimations,
} from '../celestial/celestialSprites.js';
import { formatAccuracy, formatScore } from '../ui/format.js';
import { JacketView, queueJacketLoads } from '../ui/jacket.js';
import { LIGHT_TEXTURES, addLight, ensureLightTextures } from '../ui/lightTextures.js';
import { MenuFocus } from '../ui/MenuFocus.js';
import { addMenuKeyHintRow } from '../ui/keyHintView.js';
import { handleEachEventOnce, readMenuAction, requireKeyboard } from '../ui/menuInput.js';
import { COLORS, JUDGMENT_COLORS, MOTION, SCREEN_LAYOUT, textStyle } from '../ui/theme.js';

type MenuItem = 'retry' | 'songSelect';

const LEFT_X_PX = SCREEN_LAYOUT.leftXPx;
const TITLE_Y_PX = 120;
const DIFFICULTY_Y_PX = 176;
const RANK_Y_PX = 230;
const SCORE_Y_PX = 420;
const STATS_Y_PX = 540;
const MAX_COMBO_VALUE_GAP_PX = 16;
/** 판정 내역은 세로 표 대신 한 줄의 열로 펼쳐 왼쪽 열 높이를 줄이고, 그만큼을 묶음 사이 여백으로 쓴다. */
const JUDGMENT_ROWS: readonly { judgment: Judgment; label: string }[] = [
  { judgment: 'perfect', label: 'PERFECT' },
  { judgment: 'great', label: 'GREAT' },
  { judgment: 'good', label: 'GOOD' },
  { judgment: 'bad', label: 'BAD' },
  { judgment: 'miss', label: 'MISS' },
];
const JUDGMENT_COLUMN_WIDTH_PX = 130;
const JUDGMENT_LABEL_Y_PX = 640;
const JUDGMENT_COUNT_Y_PX = 676;
/** MAX COMBO 를 판정 열의 세 번째 줄(GOOD)에 맞춰 두 줄이 같은 격자를 쓰게 한다. */
const MAX_COMBO_X_PX = LEFT_X_PX + JUDGMENT_COLUMN_WIDTH_PX * 2;
const JACKET_X_PX = 1400;
const JACKET_Y_PX = 160;
const JACKET_SIZE_PX = 400;
/** RETRY 바로 위 난이도 탭. 판정 표와는 넓게, RETRY 와는 좁게 띄워 한 묶음으로 보이게 한다. */
const DIFFICULTY_TABS_Y_PX = 840;
const BUTTON_Y_PX = 880;
/** quiet 버튼의 안쪽 가로 여백. 그만큼 당겨 RETRY 라벨을 탭·판정 표와 같은 왼쪽 선에 맞춘다. */
const QUIET_BUTTON_PADDING_X_PX = 16;
const BUTTON_GAP_PX = 48;
const HEADER_REVEAL_DELAY_MS = 150;
const RANK_REVEAL_DELAY_MS = 450;
const RANK_REVEAL_DURATION_MS = 280;
const RANK_REVEAL_SCALE = 1.25;
const SCORE_COUNT_DELAY_MS = 700;
const SCORE_COUNT_DURATION_MS = 700;
const STATS_REVEAL_DELAY_MS = 800;
const MENU_REVEAL_DELAY_MS = 950;
const FULL_COMBO_DELAY_MS = 1100;
// 왼쪽 정보 열과 재킷 사이의 빈 영역이다. 연출은 FULL COMBO 라벨과 같은 시각에 시작한다.
const CONSTELLATION_BOX: ConstellationBox = {
  leftPx: 740,
  topPx: 210,
  widthPx: 500,
  heightPx: 480,
};
const CONSTELLATION_DELAY_MS = FULL_COMBO_DELAY_MS;
const CONSTELLATION_DIM_SIZE_PX = 8;
const CONSTELLATION_DIM_ALPHA = 0.3;
const CONSTELLATION_CORE_SIZE_PX = 12;
const CONSTELLATION_ACCENT_CORE_SIZE_PX = 18;
const CONSTELLATION_HALO_SIZE_PX = 40;
const CONSTELLATION_ACCENT_HALO_SIZE_PX = 56;
const CONSTELLATION_LINE_CORE_WIDTH_PX = 1.5;
const CONSTELLATION_LINE_HALO_WIDTH_PX = 5;
const CONSTELLATION_SHIMMER_ALPHA = 0.15;
const CONSTELLATION_PULSE_SCALE = 1.6;
const CONSTELLATION_TIER_ALPHAS: Readonly<
  Record<
    ConstellationTier,
    { nodeCore: number; nodeHalo: number; lineCore: number; lineHalo: number }
  >
> = {
  faint: { nodeCore: 0.6, nodeHalo: 0, lineCore: 0.4, lineHalo: 0 },
  clear: { nodeCore: 0.85, nodeHalo: 0.14, lineCore: 0.55, lineHalo: 0.08 },
  bright: { nodeCore: 1, nodeHalo: 0.2, lineCore: 0.65, lineHalo: 0.12 },
  complete: { nodeCore: 1, nodeHalo: 0.26, lineCore: 0.75, lineHalo: 0.16 },
};
const FULL_COMBO_LABEL_GAP_PX = 32;
const FULL_COMBO_LABEL_BOTTOM_INSET_PX = 32;
// cleared node 는 재킷 왼쪽 아래, starfall 은 재킷 아래에 둔다.
const NODE_X_PX = JACKET_X_PX - 80;
const NODE_Y_PX = JACKET_Y_PX + JACKET_SIZE_PX + 86;
const STARFALL_X_PX = JACKET_X_PX + 260;
const STARFALL_Y_PX = JACKET_Y_PX + JACKET_SIZE_PX + 144;
// score 텍스트의 왼쪽 끝·아래 끝 기준 상대 위치.
const SCORE_SHIMMER_DX_PX = 128;
const SCORE_SHIMMER_DY_PX = 12;

export class ResultScene extends Phaser.Scene {
  private exit: SceneExit<SceneRequest> = STAYING;
  /** RETRY 로 플레이할 난이도의 유일한 원본. 처음에는 방금 플레이한 난이도다. 바꿀 때는 setRetryDifficulty 를 거친다. */
  private retryDifficulty: Difficulty = 'easy';

  constructor(
    private readonly songs: readonly Song[],
    private readonly i18n: I18n,
    private readonly celestial: CelestialCatalog,
  ) {
    super(SCENE_KEYS.result);
  }

  preload(): void {
    queueJacketLoads(this, this.songs);
    queueCelestialTextures(this, this.celestial);
  }

  create(data: ResultSceneData): void {
    this.exit = STAYING;
    this.retryDifficulty = data.difficulty;
    registerCelestialAnimations(this, this.celestial);
    addCelestialAtmosphere(this, this.celestial, 'result');
    const keyboard = requireKeyboard(this);
    const { song, difficulty, result } = data;
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
    // 랭크용 display 서체는 별자리 영역과 겹치므로 FAILED 는 더 작은 title 서체로 같은 자리에 둔다.
    const rankText =
      result.outcome === 'failed'
        ? this.add.text(LEFT_X_PX, RANK_Y_PX, 'FAILED', textStyle('title', JUDGMENT_COLORS.miss))
        : this.add.text(
            LEFT_X_PX,
            RANK_Y_PX,
            getRank(result.accuracy),
            textStyle('display', COLORS.textPrimary),
          );
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
    JUDGMENT_ROWS.forEach(({ judgment, label }, index) => {
      const xPx = LEFT_X_PX + JUDGMENT_COLUMN_WIDTH_PX * index;
      statTexts.push(
        this.add.text(
          xPx,
          JUDGMENT_LABEL_Y_PX,
          label,
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

    const retryButton = new Button(this, LEFT_X_PX - QUIET_BUTTON_PADDING_X_PX, BUTTON_Y_PX, {
      variant: 'quiet',
      label: 'RETRY',
      onActivate: () => this.activate('retry', data),
    });
    const tabs = new DifficultyTabs(this, LEFT_X_PX, DIFFICULTY_TABS_Y_PX, (difficulty) =>
      this.setRetryDifficulty(tabs, song, difficulty),
    );
    this.renderTabs(tabs, song);
    const songSelectButton = new Button(
      this,
      retryButton.x + retryButton.width + BUTTON_GAP_PX,
      BUTTON_Y_PX,
      {
        variant: 'quiet',
        label: 'TRACKS',
        onActivate: () => this.activate('songSelect', data),
      },
    );
    const menu = new MenuFocus<MenuItem>([
      { item: 'retry', button: retryButton },
      { item: 'songSelect', button: songSelectButton },
    ]);
    const hint = addMenuKeyHintRow(this, this.i18n.t('result.hint'), LEFT_X_PX);
    playCelestialEntryTransition(this, this.celestial, rankBounds);
    this.playFinish(
      planResultFinish(
        result.cleared,
        this.celestial.nodeOnlyFinish,
        SCORE_COUNT_DELAY_MS + SCORE_COUNT_DURATION_MS,
      ),
      rankBounds,
      scoreText.getBounds(),
    );

    this.fadeInAt([jacket, titleText, difficultyText], 1, HEADER_REVEAL_DELAY_MS);
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
    this.fadeInAt(
      [...tabs.getVisuals(), retryButton, songSelectButton, hint],
      1,
      MENU_REVEAL_DELAY_MS,
    );
    this.revealConstellation(
      planSongConstellation(
        song.id,
        song.constellation,
        getConstellationTier(result),
        CONSTELLATION_BOX,
      ),
      song.accentColor,
    );
    if (isFullCombo(result.counts)) {
      this.revealFullCombo(rankBounds, song.accentColor);
    }
    keyboard.on(
      'keydown',
      handleEachEventOnce((event: KeyboardEvent) => this.handleKey(event, data, menu, tabs)),
    );
  }

  private handleKey(
    event: KeyboardEvent,
    data: ResultSceneData,
    menu: MenuFocus<MenuItem>,
    tabs: DifficultyTabs,
  ): void {
    if (this.exit.kind === 'leaving') {
      return;
    }
    // 곡 선택 화면처럼 ←→ 는 난이도, 메뉴 이동은 ↑↓ 다.
    switch (readMenuAction(event)) {
      case 'left':
        this.setRetryDifficulty(
          tabs,
          data.song,
          stepRetryDifficulty(data.song, this.retryDifficulty, -1),
        );
        break;
      case 'right':
        this.setRetryDifficulty(
          tabs,
          data.song,
          stepRetryDifficulty(data.song, this.retryDifficulty, 1),
        );
        break;
      case 'up':
        menu.move(-1);
        break;
      case 'down':
        menu.move(1);
        break;
      case 'confirm':
        this.activate(menu.getFocused(), data);
        break;
      case 'back':
        this.activate('songSelect', data);
        break;
      default:
        break;
    }
  }

  private activate(item: MenuItem, data: ResultSceneData): void {
    if (this.exit.kind === 'leaving') {
      return;
    }
    switch (item) {
      case 'retry':
        this.exit = exitScene(this, this.exit, {
          key: 'gameplay',
          data: { song: data.song, difficulty: this.retryDifficulty },
        });
        return;
      case 'songSelect':
        this.exit = exitScene(this, this.exit, { key: 'songSelect', data: undefined });
        return;
    }
  }

  private setRetryDifficulty(tabs: DifficultyTabs, song: Song, next: Difficulty): void {
    if (this.exit.kind === 'leaving' || next === this.retryDifficulty) {
      return;
    }
    this.retryDifficulty = next;
    this.renderTabs(tabs, song);
  }

  private renderTabs(tabs: DifficultyTabs, song: Song): void {
    tabs.render({ selected: this.retryDifficulty, available: getAvailableDifficulties(song) });
  }

  private fadeInAt(
    targets: Phaser.GameObjects.Components.AlphaSingle[],
    alpha: number,
    delayMs: number,
    durationMs: number = MOTION.mediumMs,
  ): void {
    targets.forEach((target) => target.setAlpha(0));
    this.tweens.add({ targets, alpha, delay: delayMs, duration: durationMs });
  }

  /** finish 계획대로 sprite 를 만들고 각 cue 시각에 1회 재생한다. 계획이 비면 아무것도 만들지 않는다. */
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
      getAtlasPresentation(this.celestial, RESULT_NODE_ID),
      NODE_X_PX,
      NODE_Y_PX,
    )?.setVisible(false);
    cues.forEach((cue) => {
      const { xPx, yPx } = getFinishAnchorPosition(cue.anchor, rankBounds, scoreBounds);
      const sprite = addCelestialSprite(this, cue.step.presentation, xPx, yPx);
      if (sprite === null) {
        return;
      }
      if (cue.isNodeIgnite) {
        sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => node?.setVisible(true));
      }
      this.time.delayedCall(cue.playAtMs, () => playCelestialOnce(sprite));
    });
  }

  /** 어두운 silhouette 을 띄운 뒤 계획 시각대로 node 를 점등하고 edge 를 이어 그린다. */
  private revealConstellation(plan: ConstellationPlan, accent: number): void {
    ensureLightTextures(this);
    const alphas = CONSTELLATION_TIER_ALPHAS[plan.tier];
    const lights = plan.nodes.map((node) => {
      const star = addLight(this, LIGHT_TEXTURES.star, node.xPx, node.yPx).setDisplaySize(
        CONSTELLATION_DIM_SIZE_PX,
        CONSTELLATION_DIM_SIZE_PX,
      );
      this.fadeInAt([star], CONSTELLATION_DIM_ALPHA, CONSTELLATION_DELAY_MS, MOTION.fastMs);
      if (node.igniteAtMs === null) {
        return { node, star, halo: null };
      }
      const coreSizePx = node.isAccent
        ? CONSTELLATION_ACCENT_CORE_SIZE_PX
        : CONSTELLATION_CORE_SIZE_PX;
      const igniteAtMs = CONSTELLATION_DELAY_MS + node.igniteAtMs;
      // dim fade-in 과 alpha tween 이 겹치지 않도록 그 node 의 tween 을 끊고 점등한다.
      this.time.delayedCall(igniteAtMs, () => {
        this.tweens.killTweensOf(star);
        this.tweens.add({
          targets: star,
          alpha: alphas.nodeCore,
          displayWidth: coreSizePx,
          displayHeight: coreSizePx,
          duration: MOTION.fastMs,
        });
      });
      if (alphas.nodeHalo === 0) {
        return { node, star, halo: null };
      }
      const haloSizePx = node.isAccent
        ? CONSTELLATION_ACCENT_HALO_SIZE_PX
        : CONSTELLATION_HALO_SIZE_PX;
      const halo = addLight(this, LIGHT_TEXTURES.glow, node.xPx, node.yPx)
        .setDisplaySize(haloSizePx, haloSizePx)
        .setTint(accent);
      this.fadeInAt([halo], alphas.nodeHalo, igniteAtMs, MOTION.fastMs);
      return { node, star, halo };
    });

    const lines = this.add.graphics();
    // 각 edge 는 자기 시간 구간 안의 진행도만큼 from 에서 to 로 그린다.
    const drawLines = (elapsedMs: number): void => {
      lines.clear();
      plan.edges.forEach(({ fromIndex, toIndex, startMs, endMs }) => {
        const from = plan.nodes[fromIndex];
        const to = plan.nodes[toIndex];
        if (from === undefined || to === undefined) {
          throw new Error(`Invalid constellation edge: ${fromIndex}-${toIndex}`);
        }
        const segment = clamp((elapsedMs - startMs) / (endMs - startMs), 0, 1);
        if (segment === 0) {
          return;
        }
        const endXPx = from.xPx + (to.xPx - from.xPx) * segment;
        const endYPx = from.yPx + (to.yPx - from.yPx) * segment;
        if (alphas.lineHalo > 0) {
          lines
            .lineStyle(CONSTELLATION_LINE_HALO_WIDTH_PX, accent, alphas.lineHalo)
            .lineBetween(from.xPx, from.yPx, endXPx, endYPx);
        }
        lines
          .lineStyle(CONSTELLATION_LINE_CORE_WIDTH_PX, COLORS.note, alphas.lineCore)
          .lineBetween(from.xPx, from.yPx, endXPx, endYPx);
      });
    };
    const lastEdge = plan.edges.at(-1);
    if (lastEdge === undefined) {
      throw new Error('Constellation plan has no connected edge');
    }
    this.tweens.addCounter({
      from: 0,
      to: lastEdge.endMs,
      duration: lastEdge.endMs,
      delay: CONSTELLATION_DELAY_MS,
      onUpdate: (_tween, _target, _key, current: number) => drawLines(current),
      onComplete: () => drawLines(lastEdge.endMs),
    });

    if (plan.finale === null) {
      return;
    }
    const accentLight = lights.find(({ node }) => node.isAccent);
    if (accentLight === undefined || accentLight.halo === null) {
      throw new Error('Constellation finale needs a lit accent halo');
    }
    const { star, halo } = accentLight;
    const { kind, atMs } = plan.finale;
    // 점등 시 그 node 의 tween 을 끊으므로 finale tween 은 그 시각에 만든다.
    this.time.delayedCall(CONSTELLATION_DELAY_MS + atMs, () => {
      this.tweens.add({
        targets: halo,
        alpha: alphas.nodeHalo + CONSTELLATION_SHIMMER_ALPHA,
        duration: MOTION.fastMs,
        yoyo: true,
        repeat: 0,
      });
      if (kind === 'pulse') {
        const pulseSizePx = CONSTELLATION_ACCENT_CORE_SIZE_PX * CONSTELLATION_PULSE_SCALE;
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
      return { xPx: NODE_X_PX, yPx: NODE_Y_PX };
    case 'rank':
      return { xPx: rankBounds.centerX, yPx: rankBounds.centerY };
    case 'jacket':
      return { xPx: STARFALL_X_PX, yPx: STARFALL_Y_PX };
    case 'score':
      return {
        xPx: scoreBounds.left + SCORE_SHIMMER_DX_PX,
        yPx: scoreBounds.bottom + SCORE_SHIMMER_DY_PX,
      };
  }
}
