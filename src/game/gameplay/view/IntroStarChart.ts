import Phaser from 'phaser';
import { ZODIACS } from '../../../data/songs.js';
import type { Zodiac } from '../../../data/songs.js';
import { requireDefined } from '../../../invariant.js';
import { cycleItem, getDistance, getProgress, lerp } from '../../../range.js';
import type { CelestialCatalog } from '../../celestial/state/celestialCatalog.js';
import { requireCelestialTexture } from '../../celestial/view/celestialSprites.js';
import type { CelestialTextureUse } from '../../celestial/view/celestialSprites.js';
import { ZODIAC_FIGURES, fitZodiacFigure } from '../../celestial/state/zodiacFigures.js';
import type { FigurePoint } from '../../celestial/state/zodiacFigures.js';
import { getZodiacSign, strokeZodiacLine } from '../../celestial/view/zodiacSign.js';
import { GAMEPLAY_DEPTH } from '../../ui/view/theme.js';

// 곡 선택 화면과 같은 밤하늘·질감을 깔아 곡 선택에서 보던 하늘이 이어지게 한다.
const BACKDROP_ID = 'R02';
const GRAIN_ID = 'R50';
// 곡 제목(y 440) 위 하늘에 둔다. 진행 궤도(y 40)와 제목 사이에 들어가는 크기다.
const SPAN_PX = 380;
const CENTER_Y_PX = 240;
// 로딩 동안 성도가 황도 순서로 쉬지 않고 같은 속도로 천천히 흐르고, 가운데에 다가오는 별자리를 이어 그린다.
// 멈췄다 휙 넘어가면 급하게 보여 별자리 하나를 지나는 구간마다 등속으로 잇는다.
// 실제 황도처럼 하늘을 가로지르는 큰 원 위에 열두 별자리를 30도씩 두고 원을 돌린다.
// 이웃 별자리가 화면 양 끝 아래로 비켜 보일 만큼 크게 잡는다.
const ECLIPTIC_RADIUS_PX = 1600;
const SIGN_STEP_RAD = (Math.PI * 2) / ZODIACS.length;
const STEP_MS = 16000;
const LINK_DELAY_MS = 400;
// 다음 별자리가 가운데에 닿기 조금 전에 잇기 시작해 닿을 즈음 다 이어지게 한다.
const LINK_LEAD_FRACTION = 0.55;
const LINK_EDGE_MS = 220;
// 화면 가운데에서 멀어진 별자리는 성도의 다른 칸처럼 흐리게 남긴다.
const DIM_STAR_ALPHA = 0.3;
const DIM_LINE_ALPHA = 0.15;
const FADE_MS = 600;

interface ChartSign {
  order: number;
  angleRad: number;
  holder: Phaser.GameObjects.Container;
  stars: Phaser.GameObjects.Image;
  lines: Phaser.GameObjects.Graphics;
  points: readonly FigurePoint[];
  edges: readonly (readonly [from: number, to: number])[];
}

export function getIntroStarChartUses(catalog: CelestialCatalog): readonly CelestialTextureUse[] {
  return [catalog.imagePresentations[BACKDROP_ID], catalog.imagePresentations[GRAIN_ID]];
}

export class IntroStarChart {
  private readonly backdrop: Phaser.GameObjects.Image;
  private readonly backdropOpacity: number;
  private readonly grain: Phaser.GameObjects.TileSprite;
  private readonly grainOpacity: number;
  private readonly chart: Phaser.GameObjects.Container;
  private readonly signs: ChartSign[] = [];
  // 게임 오브젝트 rotation 은 ±180도로 감겨 반 바퀴를 넘으면 tween 이 반대로 휙 돌므로 감기지 않은 각도를 따로 든다.
  private readonly turn = { rad: 0 };
  private readonly visibility = { value: 0 };
  private fade: Phaser.Tweens.Tween | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    catalog: CelestialCatalog,
    private readonly zodiac: Zodiac,
    centerXPx: number,
  ) {
    const backdropLook = catalog.imagePresentations[BACKDROP_ID];
    requireCelestialTexture(scene, backdropLook.textureKey);
    this.backdropOpacity = backdropLook.opacity;
    this.backdrop = scene.add
      .image(0, 0, backdropLook.textureKey)
      .setScrollFactor(0)
      .setDepth(GAMEPLAY_DEPTH.world);
    const grainLook = catalog.imagePresentations[GRAIN_ID];
    requireCelestialTexture(scene, grainLook.textureKey);
    this.grainOpacity = grainLook.opacity;
    this.grain = scene.add
      .tileSprite(0, 0, scene.scale.width, scene.scale.height, grainLook.textureKey)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(GAMEPLAY_DEPTH.world);

    this.chart = scene.add
      .container(centerXPx, CENTER_Y_PX + ECLIPTIC_RADIUS_PX)
      .setDepth(GAMEPLAY_DEPTH.world);
    const first = this.addSign(0);
    this.addSign(1);

    // 게임 화면 폭이 창 비율을 따라 바뀌므로 밤하늘도 그때마다 화면을 덮게 다시 맞춘다.
    const fitToView = (): void => this.fitToView();
    fitToView();
    scene.scale.on(Phaser.Scale.Events.RESIZE, fitToView);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      scene.scale.off(Phaser.Scale.Events.RESIZE, fitToView),
    );
    this.applyVisibility();

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      drawLines(first, first.edges.length);
      return;
    }
    scene.time.delayedCall(LINK_DELAY_MS, () => this.link(first));
    this.driftPast(first);
  }

  render(isShown: boolean): void {
    this.fade?.stop();
    this.fade = this.scene.tweens.add({
      targets: this.visibility,
      value: isShown ? 1 : 0,
      duration: FADE_MS,
      ease: 'Sine.InOut',
      onUpdate: () => this.applyVisibility(),
    });
  }

  private addSign(order: number): ChartSign {
    const zodiac = cycleItem(ZODIACS, this.zodiac, order);
    const figure = ZODIAC_FIGURES[zodiac];
    const angleRad = order * SIGN_STEP_RAD;
    const sign: ChartSign = {
      order,
      angleRad,
      holder: this.scene.add
        .container(
          Math.sin(angleRad) * ECLIPTIC_RADIUS_PX,
          -Math.cos(angleRad) * ECLIPTIC_RADIUS_PX,
        )
        .setRotation(angleRad),
      stars: this.scene.add
        .image(0, 0, getZodiacSign(this.scene, zodiac, SPAN_PX).textureKey)
        .setBlendMode(Phaser.BlendModes.SCREEN),
      lines: this.scene.add.graphics(),
      points: fitZodiacFigure(figure, 0, 0, SPAN_PX),
      edges: figure.edges,
    };
    sign.holder.add([sign.stars, sign.lines]);
    this.chart.add(sign.holder);
    this.signs.push(sign);
    this.applyPan();
    return sign;
  }

  private link(sign: ChartSign): void {
    this.scene.tweens.addCounter({
      from: 0,
      to: sign.edges.length,
      duration: sign.edges.length * LINK_EDGE_MS,
      onUpdate: (_tween, _target, _key, linked: number) => drawLines(sign, linked),
      onComplete: () => drawLines(sign, sign.edges.length),
    });
  }

  private driftPast(sign: ChartSign): void {
    const next = requireDefined(
      this.signs.find(({ order }) => order === sign.order + 1),
      'Missing next zodiac sign',
      sign.order + 1,
    );
    // 오른쪽에서 흘러 들어올 별자리를 미리 두고, 왼쪽 밖으로 나간 별자리는 치웠다가 한 바퀴 돌아오면 다시 둔다.
    this.addSign(next.order + 1);
    this.signs
      .splice(
        0,
        this.signs.findIndex(({ order }) => order >= sign.order - 1),
      )
      .forEach(({ holder }) => holder.destroy());
    this.scene.time.delayedCall(STEP_MS * LINK_LEAD_FRACTION, () => this.link(next));
    this.scene.tweens.add({
      targets: this.turn,
      rad: next.angleRad,
      duration: STEP_MS,
      ease: 'Linear',
      onUpdate: () => this.applyPan(),
      onComplete: () => this.driftPast(next),
    });
  }

  private fitToView(): void {
    const { width, height } = this.scene.scale;
    const frame = this.backdrop.frame;
    this.backdrop
      .setPosition(width / 2, height / 2)
      .setScale(Math.max(width / frame.width, height / frame.height));
    this.grain.setSize(width, height);
  }

  private applyPan(): void {
    this.chart.setRotation(-this.turn.rad);
    this.signs.forEach(({ angleRad, stars, lines }) => {
      const focus = 1 - getProgress(getDistance(angleRad, this.turn.rad), 0, SIGN_STEP_RAD);
      stars.setAlpha(lerp(DIM_STAR_ALPHA, 1, focus));
      lines.setAlpha(lerp(DIM_LINE_ALPHA, 1, focus));
    });
  }

  private applyVisibility(): void {
    const { value } = this.visibility;
    this.backdrop.setAlpha(this.backdropOpacity * value);
    this.grain.setAlpha(this.grainOpacity * value);
    this.chart.setAlpha(value);
  }
}

// edge 는 앞에서 나온 별에서 이어지는 순서라 앞에서부터 차례로 그으면 한 붓으로 이어지듯 보인다.
function drawLines(sign: ChartSign, linked: number): void {
  sign.lines.clear();
  sign.edges.forEach(([from, to], index) => {
    const reach = getProgress(linked, index, index + 1);
    if (reach === 0) {
      return;
    }
    const [fromXPx, fromYPx] = requireDefined(
      sign.points[from],
      'Zodiac edge outside the figure',
      from,
    );
    const [toXPx, toYPx] = requireDefined(sign.points[to], 'Zodiac edge outside the figure', to);
    strokeZodiacLine(
      sign.lines,
      fromXPx,
      fromYPx,
      lerp(fromXPx, toXPx, reach),
      lerp(fromYPx, toYPx, reach),
    );
  });
}
