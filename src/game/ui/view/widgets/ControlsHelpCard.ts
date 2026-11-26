import Phaser from 'phaser';
import { getProgress, lerp } from '../../../../range.js';
import { hasElapsed } from '../../../../time.js';
import { MOTION } from '../../state/motion.js';
import {
  HIT_BLOOM,
  HIT_SQUASH,
  HOLD_CONTACT,
  HOLD_RIBBON_EDGE_PX,
  HOLD_RIBBON_PENDING_ALPHA,
  HOLD_RIBBON_TAIL_ALPHA,
  HOLD_RIBBON_WIDTH_RATIO,
  NOTE_APPROACH_RANGE_PX,
  NOTE_FAR_ALPHA,
  NOTE_PLATE_WIDTH_RATIO,
  PLAYFIELD_JUDGE_LINE_WIDTH_PX,
} from '../../state/noteLook.js';
import { getBrushRectTexture } from '../textures/brushRect.js';
import { createCanvasTexture } from '../textures/canvasTexture.js';
import {
  addLight,
  ensureLightTextures,
  fillGradient,
  LIGHT_TEXTURES,
  rgba,
} from '../textures/lightTextures.js';
import {
  ensureHoldRibbonTextures,
  ensureJudgeLineTexture,
  ensureStarButtonTextures,
} from '../textures/noteTextures.js';
import type { HoldRibbonPart, StarButtonTextures } from '../textures/noteTextures.js';
import {
  CELESTIAL_COLORS,
  COLORS,
  JUDGMENT_COLORS,
  MODAL,
  cssColor,
  isReducedMotionPreferred,
  setTextColor,
  typeStyle,
} from '../theme.js';
import {
  createKeyCap,
  getKeyCapLook,
  getKeyCapObjects,
  getKeyCapWidthPx,
  placeKeyCap,
} from './keyHintView.js';
import type { KeyCap, KeyHintStyle } from './keyHintView.js';
import { ModalPanel, PANEL_GRAIN_ALPHA } from './ModalPanel.js';

// (?) 에서 나온 말풍선이 CONTROLS 판 하나 더로 보이지 않게 큰 제목 없이 묶음 이름과 밑줄로만 나눈다.
const PADDING_PX = 24;
const DIVIDER_ALPHA = 0.35;
// TAP 레인 아래끝에서 HOLD 묶음 이름 위끝까지.
const GROUP_GAP_PX = 28;
const GROUP_TITLE_TYPE = {
  sizePx: 18,
  weight: 600,
} as const;
const GROUP_TITLE_LETTER_SPACING_PX = 2;
// 묶음 이름 아래끝에서 밑줄까지.
const GROUP_TITLE_UNDERLINE_GAP_PX = 8;
// 밑줄에서 레인 위끝까지.
const GROUP_UNDERLINE_LANE_GAP_PX = 16;
const LANE = {
  widthPx: 132,
  heightPx: 174,
  fill: 0x0c1424,
  edgeColor: 0xc8dcf0,
  edgeAlpha: 0.45,
  // 판정선은 그림 아래끝에서 이만큼 위에 있다.
  judgeFromBottomPx: 40,
  judgeOverhangPx: 10,
  // 노트가 레인 위끝에서 이만큼 내려오는 동안 어둠에서 떠오른다.
  emergePx: 36,
} as const;
const KEY_CAP_JUDGE_GAP_PX = 12;
const KEY_CAP_PRESS_OFFSET_PX = 2;
// 플레이 화면 4레인 한 칸을 레인 그림 폭으로 줄인 배율. 노트·리본·빛을 함께 줄여 실제 노트 모양 그대로 보인다.
const FIGURE_SCALE = LANE.widthPx / (PLAYFIELD_JUDGE_LINE_WIDTH_PX[4] / 4);
const NOTE_WIDTH_PX = LANE.widthPx * NOTE_PLATE_WIDTH_RATIO;
const RIBBON_WIDTH_PX = LANE.widthPx * HOLD_RIBBON_WIDTH_RATIO;
const FIGURE_APPROACH_RANGE_PX = NOTE_APPROACH_RANGE_PX * FIGURE_SCALE;
const RIBBON_SIDE_SIGNS = [-1, 1] as const;
const JUDGE_LINE_WIDTH_PX = LANE.widthPx + LANE.judgeOverhangPx * 2;
interface BloomLook {
  readonly widthPx: { readonly from: number; readonly to: number };
  readonly heightPx: { readonly from: number; readonly to: number };
  readonly alpha: number;
  readonly durationMs: number;
}
// 문구 칸을 덮지 않게 가로로 퍼지는 끝 폭은 판정선 폭을 넘기지 않는다.
const FIGURE_HIT_BLOOM: readonly BloomLook[] = Object.values(HIT_BLOOM).map(
  ({ widthPx, heightPx, alpha, durationMs }) => ({
    widthPx: {
      from: widthPx.from * FIGURE_SCALE,
      to: Math.min(widthPx.to * FIGURE_SCALE, JUDGE_LINE_WIDTH_PX),
    },
    heightPx: {
      from: heightPx.from * FIGURE_SCALE,
      to: heightPx.to * FIGURE_SCALE,
    },
    alpha,
    durationMs,
  }),
);
const PERFECT = {
  text: 'PERFECT',
  type: {
    sizePx: 16,
    weight: 800,
  },
  gapAboveJudgePx: 30,
  risePx: 8,
  fromScale: 1.15,
  // 판정 순간부터 잰 시간.
  fadeInMs: 80,
  riseMs: 300,
  settleMs: 200,
  fadeOutStartMs: 600,
  endMs: 850,
} as const;
const TEXT_COLUMN_GAP_PX = 18;
// 판정선 오른쪽에 동작어를 띄우고 판정선을 막대처럼 채운다. 하늘색이 차오르면 기다림, 흰색이면 지금 할 동작이다.
const PROMPT = {
  type: {
    sizePx: 14,
    weight: 800,
  },
  letterSpacingPx: 1.5,
  meterHeightPx: 3,
  // 노트가 판정선에 닿기 전 이만큼 동안 TAP 막대가 차오른다.
  leadMs: 700,
  waitAlpha: {
    from: 0.35,
    to: 0.85,
  },
  popScale: 1.25,
  popMs: 200,
  // 동작 순간부터 이만큼 지나면 사라지기 시작한다.
  fadeStartMs: 350,
} as const;
const TAP_WORD = 'TAP';
const HOLD_WORD = 'HOLD';
const RELEASE_WORD = 'RELEASE';
const TAIL = {
  widthPx: 18,
  halfHeightPx: 14,
} as const;
const LANE_FOG_TEXTURE_KEY = 'controlsHelp:laneFog';
const TAIL_TEXTURE_KEY = 'controlsHelp:tail';
const RIBBON_FRAME_PREFIX = 'controlsHelp:';
// TAP 2.0초·HOLD 3.2초 주기가 함께 처음으로 돌아오는 시간으로 한 번에 반복한다.
const LOOP_MS = 16_000;
// 노트는 1초 동안 레인 위끝에서 판정선까지 같은 속도로 내려온다. 홀드도 같은 속도라 리본 길이가 누르는 시간이다.
const FALL_MS = 1000;

const TAP_TIMING = {
  periodMs: 2000,
  hitMs: FALL_MS,
  pressMs: 140,
  promptEndMs: 1700,
} as const;
const HOLD_TIMING = {
  periodMs: 3200,
  pressMs: FALL_MS,
  releaseMs: 2200,
  promptEndMs: 2900,
} as const;
const STILL_HOLD_MS = 1700;

interface PromptLook {
  readonly text: string;
  readonly color: number;
  readonly alpha: number;
  readonly meter: number | null;
  readonly scale: number;
}

// 노트 자리는 판정선까지 남은 시간이고, squash 는 맞은 뒤 퍼지며 사라진 정도(0~1)다.
interface NoteLook {
  readonly untilJudgeMs: number;
  readonly squash: number;
}

// bloomMs·perfectMs 는 판정 순간부터 잰 시간이고 판정 전이면 null 이다.
interface FigureLook {
  readonly bloomMs: number | null;
  readonly perfectMs: number | null;
  readonly isKeyPressed: boolean;
  readonly prompt: PromptLook | null;
}

interface TapLook extends FigureLook {
  readonly note: NoteLook;
}

interface HoldLook extends FigureLook {
  readonly head: NoteLook;
  // 꼬리를 놓으면 null 이라 꼬리와 리본을 숨긴다.
  readonly tail: {
    readonly untilJudgeMs: number;
    readonly ribbonAlpha: number;
  } | null;
}

interface FrameLooks {
  readonly tap: TapLook;
  readonly hold: HoldLook;
}

const AT_JUDGE: NoteLook = {
  untilJudgeMs: 0,
  squash: 0,
};

interface LaneFigure {
  readonly name: Phaser.GameObjects.Text;
  readonly underline: Phaser.GameObjects.Image;
  readonly fill: Phaser.GameObjects.Rectangle;
  readonly grain: Phaser.GameObjects.Image;
  readonly edges: readonly Phaser.GameObjects.Rectangle[];
  readonly judgeLine: Phaser.GameObjects.Image;
  readonly keyCap: KeyCap;
  readonly bloom: readonly HitBloom[];
  // 노트 위에 그려 레인 위끝을 덮는다.
  readonly fog: Phaser.GameObjects.Image;
  readonly promptLabel: Phaser.GameObjects.Text;
  readonly promptMeter: Phaser.GameObjects.Rectangle;
}

interface LaneGeometry {
  readonly laneTopYPx: number;
  readonly judgeYPx: number;
  readonly centerXPx: number;
}

interface HitBloom {
  readonly look: BloomLook;
  readonly image: Phaser.GameObjects.Image;
}

interface RibbonSide {
  readonly sign: -1 | 1;
  readonly edge: Phaser.GameObjects.Image;
  readonly glow: Phaser.GameObjects.Image;
}

interface RibbonImages {
  readonly glass: Phaser.GameObjects.Image;
  readonly sides: readonly RibbonSide[];
}

export class ControlsHelpCard {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly keyCapStyle: KeyHintStyle;
  private readonly notes: StarButtonTextures;
  private readonly noteHeightPx: number;
  readonly panel: ModalPanel;
  private readonly tap: LaneFigure;
  private readonly hold: LaneFigure;
  private readonly promptWidthPx: number;
  private readonly tapNote: Phaser.GameObjects.Image;
  private readonly tapPerfect: Phaser.GameObjects.Text;
  private readonly holdPerfect: Phaser.GameObjects.Text;
  private readonly holdHead: Phaser.GameObjects.Image;
  private readonly holdTail: Phaser.GameObjects.Image;
  private readonly holdContact: Phaser.GameObjects.Image;
  private readonly ribbon: RibbonImages;
  private playback: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, keyCapStyle: KeyHintStyle, tailYPx: number) {
    this.scene = scene;
    this.keyCapStyle = keyCapStyle;
    ensureLightTextures(scene);
    ensureHelpTextures(scene);
    this.panel = new ModalPanel(scene);
    const tail = scene.add.image(0, tailYPx, TAIL_TEXTURE_KEY).setOrigin(1, 0.5);
    this.notes = ensureStarButtonTextures(scene);
    this.noteHeightPx = NOTE_WIDTH_PX * this.notes.plateAspect;
    const ribbonTextures = ensureHoldRibbonTextures(scene);
    this.tap = this.createLaneFigure(TAP_WORD);
    this.hold = this.createLaneFigure(HOLD_WORD);
    // 동작어는 튀어나올 때 커지므로 가장 긴 낱말의 커진 폭까지 카드 폭에 넣는다.
    const probe = this.addPromptLabel().setText(RELEASE_WORD);
    this.promptWidthPx = probe.width * PROMPT.popScale;
    probe.destroy();
    const addRibbonPart = (name: string, part: HoldRibbonPart): Phaser.GameObjects.Image =>
      scene.add
        .image(0, 0, ribbonTextures.key, getRibbonFrame(scene, ribbonTextures.key, name, part))
        // 리본 텍스처는 위쪽 줄일수록 진하므로 뒤집어 머리 쪽을 진하게 둔다. 가로 모양은 좌우 대칭이다.
        .setOrigin(0.5, 0)
        .setAngle(180);
    this.ribbon = {
      glass: addRibbonPart('glass', ribbonTextures.glass),
      sides: RIBBON_SIDE_SIGNS.map((sign) => ({
        sign,
        edge: addRibbonPart('edge', ribbonTextures.edge),
        glow: addRibbonPart('glow', ribbonTextures.glow),
      })),
    };
    this.holdContact = addLight(scene, LIGHT_TEXTURES.glow, 0, 0)
      .setDisplaySize(LANE.widthPx * HOLD_CONTACT.widthRatio, HOLD_CONTACT.heightPx * FIGURE_SCALE)
      .setTint(COLORS.note)
      .setAlpha(HOLD_CONTACT.alpha);
    this.holdTail = this.addNote();
    this.holdHead = this.addNote();
    this.tapNote = this.addNote();
    const addPerfect = (): Phaser.GameObjects.Text =>
      scene.add
        .text(0, 0, PERFECT.text, typeStyle(PERFECT.type, JUDGMENT_COLORS.perfect))
        .setOrigin(0.5, 1);
    this.tapPerfect = addPerfect();
    this.holdPerfect = addPerfect();
    this.container = scene.add.container(0, 0, [
      ...this.panel.objects,
      tail,
      ...getLaneFigureObjects(this.tap),
      this.tapNote,
      this.tap.fog,
      this.tapPerfect,
      ...getLaneFigureObjects(this.hold),
      this.ribbon.glass,
      ...this.ribbon.sides.map(({ glow }) => glow),
      ...this.ribbon.sides.map(({ edge }) => edge),
      this.holdContact,
      this.holdTail,
      this.holdHead,
      this.hold.fog,
      this.holdPerfect,
    ]);
    this.container.setVisible(false);
  }

  /** 키가 바뀌면 키캡 폭이 달라지므로 다시 배치한다. */
  setGuide(key: string): { readonly widthPx: number; readonly heightPx: number } {
    for (const { keyCap } of [this.tap, this.hold]) {
      keyCap.key.setText(key);
      keyCap.cap.setTexture(
        getBrushRectTexture(
          this.scene,
          getKeyCapLook(this.keyCapStyle, getKeyCapWidthPx(keyCap.key, this.keyCapStyle)),
        ),
      );
    }
    const widthPx =
      PADDING_PX + LANE.widthPx + TEXT_COLUMN_GAP_PX + this.promptWidthPx + PADDING_PX;
    const yPx = this.placeLaneFigure(
      this.hold,
      this.placeLaneFigure(this.tap, PADDING_PX) + GROUP_GAP_PX,
    );
    const heightPx = yPx + PADDING_PX;
    const underlineTexture = getBrushRectTexture(this.scene, {
      widthPx: widthPx - PADDING_PX * 2,
      heightPx: 1,
      radiusPx: 0,
      fillColor: CELESTIAL_COLORS.border,
      fillAlpha: DIVIDER_ALPHA,
      border: null,
    });
    [this.tap, this.hold].forEach((figure) => figure.underline.setTexture(underlineTexture));
    return {
      widthPx,
      heightPx,
    };
  }

  hide(): void {
    this.playback?.remove();
    this.playback = null;
    this.container.setVisible(false);
  }

  render(isVisible: boolean): void {
    this.hide();
    if (!isVisible) {
      return;
    }
    this.container.setVisible(true);
    if (isReducedMotionPreferred()) {
      this.renderLooks({
        tap: getStillTapLook(),
        hold: getHoldLook(STILL_HOLD_MS),
      });
      return;
    }
    this.renderLooks(getLooksAt(0));
    this.playback = this.scene.tweens.addCounter({
      from: 0,
      to: LOOP_MS,
      duration: LOOP_MS,
      repeat: -1,
      onUpdate: (tween) => this.renderLooks(getLooksAt(tween.getValue() ?? 0)),
    });
  }

  private renderLooks({ tap, hold }: FrameLooks): void {
    const tapGeometry = getLaneGeometry(this.tap);
    const holdGeometry = getLaneGeometry(this.hold);
    this.renderNote(this.tapNote, tapGeometry, tap.note, HIT_SQUASH.tapScaleX);
    const headYPx = this.renderNote(this.holdHead, holdGeometry, hold.head, HIT_SQUASH.holdScaleX);
    if (hold.tail === null) {
      [this.holdTail, ...getRibbonObjects(this.ribbon)].forEach((image) => image.setVisible(false));
    } else {
      const tail = {
        untilJudgeMs: hold.tail.untilJudgeMs,
        squash: 0,
      };
      const tailYPx = this.renderNote(this.holdTail, holdGeometry, tail, HIT_SQUASH.holdScaleX);
      this.holdTail.setVisible(true);
      this.renderRibbon(holdGeometry, headYPx, tailYPx, hold.tail.ribbonAlpha);
    }
    this.holdContact
      .setPosition(holdGeometry.centerXPx, holdGeometry.judgeYPx)
      .setVisible(hold.isKeyPressed);
    for (const { figure, geometry, perfect, look } of [
      {
        figure: this.tap,
        geometry: tapGeometry,
        perfect: this.tapPerfect,
        look: tap,
      },
      {
        figure: this.hold,
        geometry: holdGeometry,
        perfect: this.holdPerfect,
        look: hold,
      },
    ]) {
      renderPerfect(perfect, geometry, look.perfectMs);
      renderBloom(figure, look.bloomMs);
      const { keyCap, promptLabel: label, promptMeter: meter } = figure;
      placeKeyCap(
        keyCap,
        geometry.centerXPx - keyCap.cap.width / 2,
        geometry.judgeYPx +
          KEY_CAP_JUDGE_GAP_PX +
          this.keyCapStyle.capHeightPx / 2 +
          (look.isKeyPressed ? KEY_CAP_PRESS_OFFSET_PX : 0),
      );
      setTextColor(
        keyCap.key,
        look.isKeyPressed ? CELESTIAL_COLORS.selected : this.keyCapStyle.keyColor,
      );
      const { prompt } = look;
      label.setVisible(prompt !== null);
      meter.setVisible((prompt?.meter ?? null) !== null);
      if (prompt === null) {
        continue;
      }
      if (label.text !== prompt.text) {
        label.setText(prompt.text);
      }
      setTextColor(label, prompt.color);
      label.setAlpha(prompt.alpha).setScale(prompt.scale);
      if (prompt.meter === null) {
        continue;
      }
      meter
        .setSize(JUDGE_LINE_WIDTH_PX * prompt.meter, PROMPT.meterHeightPx)
        .setAlpha(prompt.alpha);
    }
  }

  private renderRibbon(
    { centerXPx, laneTopYPx }: LaneGeometry,
    headYPx: number,
    tailYPx: number,
    alpha: number,
  ): void {
    const lengthPx = headYPx - tailYPx;
    const visiblePx = headYPx - Math.max(tailYPx, laneTopYPx);
    const halfWidthPx = RIBBON_WIDTH_PX / 2;
    const place = (image: Phaser.GameObjects.Image, xPx: number, widthPx: number): void => {
      image
        .setPosition(xPx, headYPx)
        .setDisplaySize(widthPx, lengthPx)
        .setCrop(0, 0, image.frame.width, (visiblePx / lengthPx) * image.frame.height)
        .setAlpha(alpha)
        .setVisible(visiblePx > 0);
    };
    place(this.ribbon.glass, centerXPx, RIBBON_WIDTH_PX - HOLD_RIBBON_EDGE_PX * 2);
    for (const { sign, edge, glow } of this.ribbon.sides) {
      const edgeXPx = centerXPx + sign * (halfWidthPx - HOLD_RIBBON_EDGE_PX / 2);
      place(edge, edgeXPx, HOLD_RIBBON_EDGE_PX);
      place(glow, edgeXPx, glow.frame.width);
    }
  }

  private addNote(): Phaser.GameObjects.Image {
    // 노트 시각 위치는 판 밑면이라 텍스처의 판 밑면을 기준점으로 둔다.
    const { heightScale } = this.notes;
    return this.scene.add
      .image(0, 0, this.notes.key)
      .setOrigin(0.5, (heightScale + 1) / (heightScale * 2));
  }

  private renderNote(
    note: Phaser.GameObjects.Image,
    { laneTopYPx, judgeYPx, centerXPx }: LaneGeometry,
    look: NoteLook,
    toScaleX: number,
  ): number {
    const speedPxPerMs = (LANE.heightPx - LANE.judgeFromBottomPx) / FALL_MS;
    const yPx = judgeYPx - look.untilJudgeMs * speedPxPerMs;
    const emergence = getProgress(yPx - this.noteHeightPx, laneTopYPx, laneTopYPx + LANE.emergePx);
    const approach = getProgress(yPx, judgeYPx - FIGURE_APPROACH_RANGE_PX, judgeYPx);
    note
      .setPosition(centerXPx, yPx)
      .setDisplaySize(
        NOTE_WIDTH_PX * this.notes.widthScale * lerp(1, toScaleX, look.squash),
        this.noteHeightPx * this.notes.heightScale * lerp(1, HIT_SQUASH.scaleY, look.squash),
      )
      .setAlpha(emergence * lerp(NOTE_FAR_ALPHA, 1, approach) * (1 - look.squash));
    return yPx;
  }

  private createLaneFigure(name: string): LaneFigure {
    const scene = this.scene;
    return {
      name: scene.add.text(PADDING_PX, 0, name, {
        ...typeStyle(GROUP_TITLE_TYPE, CELESTIAL_COLORS.selected),
        letterSpacing: GROUP_TITLE_LETTER_SPACING_PX,
      }),
      underline: scene.add.image(PADDING_PX, 0, '__DEFAULT').setOrigin(0, 0),
      fill: scene.add
        .rectangle(PADDING_PX, 0, LANE.widthPx, LANE.heightPx, LANE.fill)
        .setOrigin(0, 0),
      grain: scene.add
        .image(
          PADDING_PX,
          0,
          getBrushRectTexture(scene, {
            widthPx: LANE.widthPx,
            heightPx: LANE.heightPx,
            radiusPx: 0,
            fillColor: CELESTIAL_COLORS.highlight,
            fillAlpha: PANEL_GRAIN_ALPHA,
            border: null,
          }),
        )
        .setOrigin(0, 0),
      edges: [0, LANE.widthPx - 1].map((offsetPx) =>
        scene.add
          .rectangle(PADDING_PX + offsetPx, 0, 1, LANE.heightPx, LANE.edgeColor, LANE.edgeAlpha)
          .setOrigin(0, 0),
      ),
      judgeLine: scene.add
        .image(0, 0, ensureJudgeLineTexture(scene))
        .setDisplaySize(JUDGE_LINE_WIDTH_PX, 2),
      keyCap: createKeyCap(scene, '', this.keyCapStyle),
      bloom: FIGURE_HIT_BLOOM.map((look) => ({
        look,
        image: addLight(scene, LIGHT_TEXTURES.glow, 0, 0).setTint(COLORS.note).setAlpha(0),
      })),
      fog: scene.add
        .image(0, 0, LANE_FOG_TEXTURE_KEY)
        .setOrigin(0.5, 0)
        .setDisplaySize(LANE.widthPx - 2, LANE.emergePx),
      promptLabel: this.addPromptLabel(),
      promptMeter: scene.add.rectangle(0, 0, 0, PROMPT.meterHeightPx, CELESTIAL_COLORS.selected),
    };
  }

  private addPromptLabel(): Phaser.GameObjects.Text {
    return this.scene.add
      .text(0, 0, '', {
        ...typeStyle(PROMPT.type, CELESTIAL_COLORS.selected),
        letterSpacing: PROMPT.letterSpacingPx,
      })
      .setOrigin(0, 0.5);
  }

  private placeLaneFigure(figure: LaneFigure, topYPx: number): number {
    figure.name.setY(topYPx);
    const underlineYPx = topYPx + figure.name.height + GROUP_TITLE_UNDERLINE_GAP_PX;
    figure.underline.setY(underlineYPx);
    const laneTopYPx = underlineYPx + GROUP_UNDERLINE_LANE_GAP_PX;
    figure.fill.setY(laneTopYPx);
    figure.grain.setY(laneTopYPx);
    figure.edges.forEach((edge) => edge.setY(laneTopYPx));
    const judgeYPx = laneTopYPx + LANE.heightPx - LANE.judgeFromBottomPx;
    const centerXPx = PADDING_PX + LANE.widthPx / 2;
    figure.judgeLine.setPosition(centerXPx, judgeYPx);
    figure.bloom.forEach(({ image }) => image.setPosition(centerXPx, judgeYPx));
    figure.fog.setPosition(centerXPx, laneTopYPx);
    figure.promptLabel.setPosition(PADDING_PX + LANE.widthPx + TEXT_COLUMN_GAP_PX, judgeYPx);
    figure.promptMeter.setPosition(centerXPx, judgeYPx);
    return laneTopYPx + LANE.heightPx;
  }
}

function getLaneGeometry(figure: LaneFigure): LaneGeometry {
  return {
    laneTopYPx: figure.fill.y,
    judgeYPx: figure.judgeLine.y,
    centerXPx: figure.judgeLine.x,
  };
}

function renderPerfect(
  perfect: Phaser.GameObjects.Text,
  { judgeYPx, centerXPx }: LaneGeometry,
  sinceHitMs: number | null,
): void {
  if (sinceHitMs === null || sinceHitMs >= PERFECT.endMs) {
    perfect.setVisible(false);
    return;
  }
  const easeOut = Phaser.Math.Easing.Cubic.Out;
  const rise = easeOut(getProgress(sinceHitMs, 0, PERFECT.riseMs));
  const settle = easeOut(getProgress(sinceHitMs, 0, PERFECT.settleMs));
  perfect
    .setPosition(centerXPx, judgeYPx - PERFECT.gapAboveJudgePx - PERFECT.risePx * rise)
    .setScale(lerp(PERFECT.fromScale, 1, settle))
    .setAlpha(
      getProgress(sinceHitMs, 0, PERFECT.fadeInMs) *
        (1 - getProgress(sinceHitMs, PERFECT.fadeOutStartMs, PERFECT.endMs)),
    )
    .setVisible(true);
}

function renderBloom(figure: LaneFigure, sinceHitMs: number | null): void {
  for (const {
    look: { widthPx, heightPx, alpha, durationMs },
    image,
  } of figure.bloom) {
    if (sinceHitMs === null || sinceHitMs >= durationMs) {
      image.setAlpha(0);
      continue;
    }
    const progress = Phaser.Math.Easing.Cubic.Out(getProgress(sinceHitMs, 0, durationMs));
    image
      .setDisplaySize(
        lerp(widthPx.from, widthPx.to, progress),
        lerp(heightPx.from, heightPx.to, progress),
      )
      .setAlpha(alpha * (1 - progress));
  }
}

function getLooksAt(elapsedMs: number): FrameLooks {
  return {
    tap: getTapLook(elapsedMs % TAP_TIMING.periodMs),
    hold: getHoldLook(elapsedMs % HOLD_TIMING.periodMs),
  };
}

function getTapLook(timeMs: number): TapLook {
  const t = TAP_TIMING;
  const sinceHitMs = timeMs - t.hitMs;
  if (timeMs < t.hitMs) {
    const progress = getProgress(timeMs, t.hitMs - PROMPT.leadMs, t.hitMs);
    return {
      note: {
        untilJudgeMs: -sinceHitMs,
        squash: 0,
      },
      bloomMs: null,
      perfectMs: null,
      isKeyPressed: false,
      prompt:
        progress === 0
          ? null
          : {
              text: TAP_WORD,
              color: CELESTIAL_COLORS.selected,
              alpha: lerp(PROMPT.waitAlpha.from, PROMPT.waitAlpha.to, progress),
              meter: progress,
              scale: 1,
            },
    };
  }
  return {
    note: {
      untilJudgeMs: 0,
      squash: getProgress(sinceHitMs, 0, MOTION.fastMs),
    },
    bloomMs: sinceHitMs,
    perfectMs: sinceHitMs,
    isKeyPressed: !hasElapsed(t.hitMs, timeMs, t.pressMs),
    prompt: getActionPrompt(TAP_WORD, sinceHitMs, t.promptEndMs - t.hitMs),
  };
}

// 멈춘 그림은 노트 밑면이 판정선에 닿고 PERFECT 와 TAP 이 다 떠오른 뒤의 모습을 함께 보인다.
function getStillTapLook(): TapLook {
  const t = TAP_TIMING;
  return {
    note: AT_JUDGE,
    bloomMs: null,
    perfectMs: PERFECT.riseMs,
    isKeyPressed: false,
    prompt: getActionPrompt(TAP_WORD, PROMPT.popMs, t.promptEndMs - t.hitMs),
  };
}

function getHoldLook(timeMs: number): HoldLook {
  const t = HOLD_TIMING;
  const tail = {
    untilJudgeMs: t.releaseMs - timeMs,
    ribbonAlpha: 1,
  };
  if (timeMs < t.pressMs) {
    return {
      head: {
        untilJudgeMs: t.pressMs - timeMs,
        squash: 0,
      },
      tail: {
        ...tail,
        ribbonAlpha: HOLD_RIBBON_PENDING_ALPHA,
      },
      bloomMs: null,
      perfectMs: null,
      isKeyPressed: false,
      prompt: null,
    };
  }
  if (timeMs < t.releaseMs) {
    const sincePressMs = timeMs - t.pressMs;
    return {
      head: AT_JUDGE,
      tail,
      bloomMs: sincePressMs,
      perfectMs: sincePressMs,
      isKeyPressed: true,
      prompt: {
        text: HOLD_WORD,
        color: CELESTIAL_COLORS.selected,
        alpha: 1,
        meter: getProgress(timeMs, t.pressMs, t.releaseMs),
        scale: 1,
      },
    };
  }
  const sinceReleaseMs = timeMs - t.releaseMs;
  return {
    head: {
      untilJudgeMs: 0,
      squash: getProgress(sinceReleaseMs, 0, MOTION.fastMs),
    },
    tail: null,
    bloomMs: sinceReleaseMs,
    perfectMs: sinceReleaseMs,
    isKeyPressed: false,
    prompt: getActionPrompt(RELEASE_WORD, sinceReleaseMs, t.promptEndMs - t.releaseMs),
  };
}

function getActionPrompt(text: string, sinceMs: number, durationMs: number): PromptLook {
  const pop = Phaser.Math.Easing.Cubic.Out(getProgress(sinceMs, 0, PROMPT.popMs));
  return {
    text,
    color: CELESTIAL_COLORS.textPrimary,
    alpha: 1 - getProgress(sinceMs, PROMPT.fadeStartMs, durationMs),
    // 동작 순간은 판정 빛이 터지므로 막대를 따로 칠하지 않는다.
    meter: null,
    scale: lerp(PROMPT.popScale, 1, pop),
  };
}

function getRibbonObjects(ribbon: RibbonImages): Phaser.GameObjects.Image[] {
  return [ribbon.glass, ...ribbon.sides.flatMap(({ edge, glow }) => [edge, glow])];
}

function getLaneFigureObjects(figure: LaneFigure): Phaser.GameObjects.GameObject[] {
  return [
    figure.name,
    figure.underline,
    figure.fill,
    figure.grain,
    ...figure.edges,
    ...figure.bloom.map(({ image }) => image),
    figure.judgeLine,
    figure.promptMeter,
    ...getKeyCapObjects(figure.keyCap),
    figure.promptLabel,
  ];
}

// 리본 텍스처는 위끝 줄 alpha 1 에서 아래로 0 까지 옅어진다. 꼬리 alpha 까지의 줄만 잘라 머리→꼬리 띠로 쓴다.
function getRibbonFrame(
  scene: Phaser.Scene,
  key: string,
  name: string,
  part: HoldRibbonPart,
): string {
  const frameName = `${RIBBON_FRAME_PREFIX}${name}`;
  const texture = scene.textures.get(key);
  if (!texture.has(frameName)) {
    const source = texture.getSourceImage();
    const leftPx = Math.floor(part.fromU * source.width);
    const widthPx = Math.max(1, Math.ceil(part.toU * source.width) - leftPx);
    const heightPx = Math.round((1 - HOLD_RIBBON_TAIL_ALPHA) * source.height);
    texture.add(frameName, 0, leftPx, 0, widthPx, heightPx);
  }
  return frameName;
}

function ensureHelpTextures(scene: Phaser.Scene): void {
  // 레인 위끝을 레인 면 색으로 덮어 리본이 잘린 자리 없이 어둠에서 내려오게 한다.
  createCanvasTexture(
    scene,
    {
      key: LANE_FOG_TEXTURE_KEY,
      widthPx: 4,
      heightPx: LANE.emergePx,
    },
    (context) =>
      fillGradient(
        context,
        context.createLinearGradient(0, 0, 0, LANE.emergePx),
        [
          [0, rgba(LANE.fill, 1)],
          [1, rgba(LANE.fill, 0)],
        ],
        4,
        LANE.emergePx,
      ),
  );
  // 꼬리를 판 쪽 가장자리에 붙여 (?) 를 가리킨다. 맨 판 색이면 입자 결을 얹은 판보다 어두워 배경에 묻히므로 결 밝기를 한 번 더 칠한다.
  createCanvasTexture(
    scene,
    {
      key: TAIL_TEXTURE_KEY,
      widthPx: TAIL.widthPx,
      heightPx: TAIL.halfHeightPx * 2,
    },
    (context) => {
      context.beginPath();
      context.moveTo(TAIL.widthPx, 0);
      context.lineTo(0, TAIL.halfHeightPx);
      context.lineTo(TAIL.widthPx, TAIL.halfHeightPx * 2);
      context.closePath();
      context.fillStyle = cssColor(MODAL.panelColor);
      context.fill();
      context.fillStyle = rgba(CELESTIAL_COLORS.highlight, PANEL_GRAIN_ALPHA);
      context.fill();
    },
  );
}
