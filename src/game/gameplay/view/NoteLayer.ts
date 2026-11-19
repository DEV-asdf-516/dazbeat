import type Phaser from 'phaser';
import { requireDefined } from '../../../invariant.js';
import { lerp } from '../../../range.js';
import type { GameplaySession } from '../../../rhythm/GameplaySession.js';
import { getNoteY } from '../../../rhythm/notePosition.js';
import type { HoldNote, Lane, Note, TapNote } from '../../../rhythm/types.js';
import { GAME_HEIGHT } from '../../app/config.js';
import { getHoldRibbonSpans, getNoteEmphasis } from '../state/noteAppearance.js';
import type { FadingSpan } from '../state/noteAppearance.js';
import {
  ensureHoldRibbonTextures,
  ensureStarButtonTextures,
} from '../../ui/view/textures/noteTextures.js';
import type {
  HoldRibbonPart,
  HoldRibbonTextures,
  StarButtonTextures,
} from '../../ui/view/textures/noteTextures.js';
import {
  getHoldRibbonTrapezoid,
  getNotePlate,
  getPerspectiveYPx,
  getPlayfieldXAtY,
} from '../state/playfieldLayout.js';
import type { PlayfieldLayout, Trapezoid } from '../state/playfieldLayout.js';
import { LIGHT_TEXTURES, addLight } from '../../ui/view/textures/lightTextures.js';
import {
  FULL_FADE_ROWS,
  createStripIndices,
  createStripVertices,
  getStripRowVertex,
  writeMeshVertex,
  writeStripRow,
} from '../../ui/view/textures/meshGeometry.js';
import { COLORS, GAMEPLAY_DEPTH } from '../../ui/view/theme.js';
import { MOTION } from '../../ui/state/motion.js';
import {
  HIT_SQUASH,
  HOLD_CONTACT,
  HOLD_RIBBON_EDGE_PX,
  HOLD_RIBBON_PENDING_ALPHA,
} from '../../ui/state/noteLook.js';

const MISS_DRAIN_MS = 260;
interface NoteTrailLayer {
  readonly trailRatio: number;
  readonly alpha: number;
}
// 순서가 만드는 순서라 같은 depth 에서 앞 겹이 아래에 그려진다.
const NOTE_TRAIL_LAYERS: readonly NoteTrailLayer[] = [
  {
    trailRatio: 1 / 3,
    alpha: 0.4,
  },
  {
    trailRatio: 2 / 3,
    alpha: 0.25,
  },
  {
    trailRatio: 1,
    alpha: 0.12,
  },
];
const CAP_ROWS = 1;
const CAP_INDICES = createStripIndices(1, CAP_ROWS);
const RIBBON_ROWS = FULL_FADE_ROWS;
// 띠 부분마다 body·fade 구간의 줄 묶음(strip)을 하나씩 둔다. 인덱스 순서가 그리는 순서다.
const RIBBON_PARTS = ['glass', 'leftEdge', 'rightEdge', 'leftGlow', 'rightGlow'] as const;
type RibbonPart = (typeof RIBBON_PARTS)[number];
const RIBBON_SPANS = ['body', 'fade'] as const;
type RibbonSpan = (typeof RIBBON_SPANS)[number];
const RIBBON_INDICES = createStripIndices(RIBBON_PARTS.length * RIBBON_SPANS.length, RIBBON_ROWS);
interface TrailCap extends NoteTrailLayer {
  cap: Phaser.GameObjects.Mesh2D;
}

interface HoldView {
  ribbon: Phaser.GameObjects.Mesh2D;
  contact: Phaser.GameObjects.Image;
  tailTrail: readonly TrailCap[];
  tail: Phaser.GameObjects.Mesh2D;
}

type NoteView =
  | {
      kind: 'tap';
      note: TapNote;
      headTrail: readonly TrailCap[];
      head: Phaser.GameObjects.Mesh2D;
    }
  | {
      kind: 'hold';
      note: HoldNote;
      headTrail: readonly TrailCap[];
      head: Phaser.GameObjects.Mesh2D;
      hold: HoldView;
    };

export interface NoteLayerOptions {
  notes: readonly Note[];
  playfield: PlayfieldLayout;
  scrollSpeedPxPerSecond: number;
}

export class NoteLayer {
  private readonly views = new Map<number, NoteView>();
  private readonly capTextures: StarButtonTextures;
  private readonly ribbonTextures: HoldRibbonTextures;
  // u 는 부분의 가로 모양 끝인 원본이다. v 는 매 프레임 alpha 로 고친다.
  private readonly ribbonVertexTemplate: readonly number[];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: NoteLayerOptions,
  ) {
    this.capTextures = ensureStarButtonTextures(scene);
    this.ribbonTextures = ensureHoldRibbonTextures(scene);
    const { glass, edge, glow } = this.ribbonTextures;
    const partUvs: Readonly<Record<RibbonPart, HoldRibbonPart>> = {
      glass,
      leftEdge: edge,
      rightEdge: edge,
      leftGlow: glow,
      rightGlow: glow,
    };
    this.ribbonVertexTemplate = RIBBON_PARTS.flatMap((part) =>
      RIBBON_SPANS.flatMap(() => createStripVertices(RIBBON_ROWS, partUvs[part])),
    );
  }

  hasEntered(noteTimeMs: number, songTimeMs: number): boolean {
    return this.options.playfield.judgeLineYPx - this.getY(noteTimeMs, songTimeMs) <= GAME_HEIGHT;
  }

  spawn({ fromIndex, toIndex }: { readonly fromIndex: number; readonly toIndex: number }): void {
    for (let noteIndex = fromIndex; noteIndex < toIndex; noteIndex += 1) {
      this.views.set(
        noteIndex,
        this.createView(requireDefined(this.options.notes[noteIndex], 'Unknown note', noteIndex)),
      );
    }
  }

  render(session: GameplaySession, songTimeMs: number, trailMs: number): void {
    const { judgeLineYPx } = this.options.playfield;
    this.views.forEach((view, noteIndex) => {
      const status = session.getNoteStatus(noteIndex);
      if (status === 'hit') {
        this.release(noteIndex, view);
        this.flashHit(view);
        return;
      }
      if (status === 'missed') {
        this.release(noteIndex, view);
        this.drain(view);
        return;
      }
      const isHolding = status === 'holding';
      const headY = isHolding ? judgeLineYPx : this.getY(view.note.timeMs, songTimeMs);
      const headEmphasis = isHolding ? 1 : getNoteEmphasis(headY, judgeLineYPx);
      const headPlate = this.placeCap(view.head, view.note.lane, headY);
      view.head.setAlpha(headEmphasis);
      // 누르는 동안 머리는 판정선에 멈춰 움직임이 없으므로 잔상을 끈다.
      if (isHolding) {
        view.headTrail.forEach(({ cap }) => cap.setVisible(false));
      } else {
        this.placeTrail(
          view.headTrail,
          view.note.lane,
          view.note.timeMs,
          songTimeMs,
          trailMs,
          headEmphasis,
        );
      }
      const outline =
        view.kind === 'hold'
          ? this.renderHold(view.hold, view.note, headY, songTimeMs, isHolding, trailMs)
          : headPlate;
      if (outline.topYPx > GAME_HEIGHT) {
        this.release(noteIndex, view);
        view.head.destroy();
        if (view.kind === 'hold') {
          this.destroyHold(view.hold);
        }
      }
    });
  }

  private renderHold(
    hold: HoldView,
    note: HoldNote,
    headY: number,
    songTimeMs: number,
    isHolding: boolean,
    trailMs: number,
  ): Trapezoid {
    const tailY = this.getY(note.endTimeMs, songTimeMs);
    // 누르기 전 배율은 면·가장자리·glow 에 똑같이 곱해지므로 메시 alpha 로 건다.
    hold.ribbon.setAlpha(isHolding ? 1 : HOLD_RIBBON_PENDING_ALPHA);
    this.placeRibbon(hold.ribbon, note.lane, headY, tailY);
    const tailPlate = this.placeCap(hold.tail, note.lane, tailY);
    const tailEmphasis = getNoteEmphasis(tailY, this.options.playfield.judgeLineYPx);
    hold.tail.setAlpha(tailEmphasis);
    this.placeTrail(hold.tailTrail, note.lane, note.endTimeMs, songTimeMs, trailMs, tailEmphasis);
    hold.contact.setVisible(isHolding);
    return tailPlate;
  }

  private placeTrail(
    trail: readonly TrailCap[],
    lane: Lane,
    noteTimeMs: number,
    songTimeMs: number,
    trailMs: number,
    emphasis: number,
  ): void {
    trail.forEach(({ cap, trailRatio, alpha }) => {
      this.placeCap(cap, lane, this.getY(noteTimeMs, songTimeMs - trailMs * trailRatio));
      cap.setAlpha(emphasis * alpha);
    });
  }

  private placeRibbon(
    ribbon: Phaser.GameObjects.Mesh2D,
    lane: Lane,
    headY: number,
    tailY: number,
  ): void {
    const { body, fade } = getHoldRibbonSpans(headY, tailY);
    this.placeRibbonSpan(ribbon.vertices, 'body', body, lane);
    this.placeRibbonSpan(ribbon.vertices, 'fade', fade, lane);
  }

  // 가장자리·glow 는 원근과 무관한 화면 px 폭이라 줄마다 띠 양 끝에서 px 로 떼어 놓는다.
  // 프레임마다 객체를 만들지 않도록 줄마다 꼭짓점 배열의 제자리 값만 고친다.
  private placeRibbonSpan(
    vertices: number[],
    spanName: RibbonSpan,
    span: FadingSpan,
    lane: Lane,
  ): void {
    const { glowLineWidthPx, glowHalfWidthPx } = this.ribbonTextures;
    const band = getHoldRibbonTrapezoid(this.options.playfield, lane, span.topYPx, span.bottomYPx);
    for (let row = 0; row <= RIBBON_ROWS; row += 1) {
      const t = row / RIBBON_ROWS;
      const yPx = lerp(band.topYPx, band.bottomYPx, t);
      const alpha = lerp(span.topAlpha, span.bottomAlpha, t);
      const leftXPx = lerp(band.topLeftXPx, band.bottomLeftXPx, t);
      const rightXPx = lerp(band.topRightXPx, band.bottomRightXPx, t);
      const leftGlowXPx = leftXPx + glowLineWidthPx / 2;
      const rightGlowXPx = rightXPx - glowLineWidthPx / 2;
      placeRibbonRow(
        vertices,
        getRibbonRowVertex('glass', spanName, row),
        leftXPx + HOLD_RIBBON_EDGE_PX,
        rightXPx - HOLD_RIBBON_EDGE_PX,
        yPx,
        alpha,
      );
      placeRibbonRow(
        vertices,
        getRibbonRowVertex('leftEdge', spanName, row),
        leftXPx,
        leftXPx + HOLD_RIBBON_EDGE_PX,
        yPx,
        alpha,
      );
      placeRibbonRow(
        vertices,
        getRibbonRowVertex('rightEdge', spanName, row),
        rightXPx - HOLD_RIBBON_EDGE_PX,
        rightXPx,
        yPx,
        alpha,
      );
      placeRibbonRow(
        vertices,
        getRibbonRowVertex('leftGlow', spanName, row),
        leftGlowXPx - glowHalfWidthPx,
        leftGlowXPx + glowHalfWidthPx,
        yPx,
        alpha,
      );
      placeRibbonRow(
        vertices,
        getRibbonRowVertex('rightGlow', spanName, row),
        rightGlowXPx - glowHalfWidthPx,
        rightGlowXPx + glowHalfWidthPx,
        yPx,
        alpha,
      );
    }
  }

  // 텍스처 본체가 판 사다리꼴에 오도록 판 가운데 기준으로 halo 여백 비율만큼 넓힌 점을 꼭짓점으로 쓴다.
  private placeCap(cap: Phaser.GameObjects.Mesh2D, lane: Lane, noteYPx: number): Trapezoid {
    const { playfield } = this.options;
    const { widthScale, heightScale } = this.capTextures;
    const plate = getNotePlate(playfield, lane, noteYPx);
    const centerYPx = (plate.topYPx + plate.bottomYPx) / 2;
    const laneXPx = requireDefined(playfield.laneCenterXPx[lane], 'Unknown note lane', lane);
    const centerXPx = getPlayfieldXAtY(playfield, laneXPx, centerYPx);
    const centerOffsetYPx = centerYPx - noteYPx;
    cap.setPosition(centerXPx, noteYPx);
    writeStripRow(
      cap.vertices,
      getStripRowVertex(CAP_ROWS, 0, 0),
      (plate.topLeftXPx - centerXPx) * widthScale,
      (plate.topRightXPx - centerXPx) * widthScale,
      centerOffsetYPx + (plate.topYPx - centerYPx) * heightScale,
    );
    writeStripRow(
      cap.vertices,
      getStripRowVertex(CAP_ROWS, 0, CAP_ROWS),
      (plate.bottomLeftXPx - centerXPx) * widthScale,
      (plate.bottomRightXPx - centerXPx) * widthScale,
      centerOffsetYPx + (plate.bottomYPx - centerYPx) * heightScale,
    );
    return plate;
  }

  private getY(noteTimeMs: number, songTimeMs: number): number {
    const { playfield, scrollSpeedPxPerSecond } = this.options;
    return getPerspectiveYPx(
      playfield,
      getNoteY(noteTimeMs, songTimeMs, playfield.judgeLineYPx, scrollSpeedPxPerSecond),
    );
  }

  private createView(note: Note): NoteView {
    const { playfield } = this.options;
    const headTrail = this.addTrail(GAMEPLAY_DEPTH.note);
    const head = this.addCap(GAMEPLAY_DEPTH.note);
    if (note.type === 'tap') {
      return {
        kind: 'tap',
        note,
        headTrail,
        head,
      };
    }
    const xPx = requireDefined(playfield.laneCenterXPx[note.lane], 'Unknown note lane', note.lane);
    // 같은 depth 에서는 만든 순서대로 그려지므로 ribbon → contact → tail 잔상 → tail 순으로 만든다.
    const hold: HoldView = {
      ribbon: this.scene.add
        .mesh2d(0, 0, this.ribbonTextures.key, [...this.ribbonVertexTemplate], [...RIBBON_INDICES])
        .buildOrderedIndices(1, true)
        .setDepth(GAMEPLAY_DEPTH.holdBody),
      contact: addLight(this.scene, LIGHT_TEXTURES.glow, xPx, playfield.judgeLineYPx)
        .setDisplaySize(playfield.laneWidthPx * HOLD_CONTACT.widthRatio, HOLD_CONTACT.heightPx)
        .setTint(COLORS.note)
        .setAlpha(HOLD_CONTACT.alpha)
        .setVisible(false)
        .setDepth(GAMEPLAY_DEPTH.holdBody),
      tailTrail: this.addTrail(GAMEPLAY_DEPTH.holdBody),
      tail: this.addCap(GAMEPLAY_DEPTH.holdBody),
    };
    return {
      kind: 'hold',
      note,
      headTrail,
      head,
      hold,
    };
  }

  private addCap(depth: number): Phaser.GameObjects.Mesh2D {
    return this.scene.add
      .mesh2d(0, 0, this.capTextures.key, createStripVertices(CAP_ROWS), [...CAP_INDICES])
      .buildOrderedIndices(1, true)
      .setAlpha(0)
      .setDepth(depth);
  }

  private addTrail(depth: number): readonly TrailCap[] {
    return NOTE_TRAIL_LAYERS.map((layer) => ({
      ...layer,
      cap: this.addCap(depth),
    }));
  }

  // HOLD 완료는 tail 이 판정선에 닿은 순간이므로 리본을 바로 지우고 더 작은 flash 로 끝낸다.
  private flashHit(view: NoteView): void {
    if (view.kind === 'hold') {
      this.destroyHold(view.hold);
    }
    const { head } = view;
    this.placeCap(head, view.note.lane, this.options.playfield.judgeLineYPx);
    head.setAlpha(1);
    this.scene.tweens.add({
      targets: head,
      scaleX: view.kind === 'tap' ? HIT_SQUASH.tapScaleX : HIT_SQUASH.holdScaleX,
      scaleY: HIT_SQUASH.scaleY,
      alpha: 0,
      duration: MOTION.fastMs,
      onComplete: () => head.destroy(),
    });
  }

  // 머리·꼬리 캡은 지금 놓인 자리에 남으므로 리본도 그 두 위치로 고정한다.
  private drain(view: NoteView): void {
    const { drainedKey } = this.capTextures;
    const parts: Phaser.GameObjects.Mesh2D[] = [view.head.setTexture(drainedKey)];
    if (view.kind === 'hold') {
      const { ribbon, contact, tailTrail, tail } = view.hold;
      contact.destroy();
      tailTrail.forEach(({ cap }) => cap.destroy());
      this.placeRibbon(ribbon, view.note.lane, view.head.y, tail.y);
      parts.push(ribbon.setTexture(this.ribbonTextures.drainedKey), tail.setTexture(drainedKey));
    }
    this.scene.tweens.add({
      targets: parts,
      alpha: 0,
      duration: MISS_DRAIN_MS,
      onComplete: () => parts.forEach((part) => part.destroy()),
    });
  }

  private release(noteIndex: number, view: NoteView): void {
    this.views.delete(noteIndex);
    view.headTrail.forEach(({ cap }) => cap.destroy());
  }

  private destroyHold(hold: HoldView): void {
    hold.ribbon.destroy();
    hold.contact.destroy();
    hold.tailTrail.forEach(({ cap }) => cap.destroy());
    hold.tail.destroy();
  }
}

function getRibbonRowVertex(part: RibbonPart, spanName: RibbonSpan, row: number): number {
  const strip = RIBBON_PARTS.indexOf(part) * RIBBON_SPANS.length + RIBBON_SPANS.indexOf(spanName);
  return getStripRowVertex(RIBBON_ROWS, strip, row);
}

// 꼭짓점 v 가 아틀라스의 alpha 단계라 줄의 alpha 를 그대로 v 에 놓는다.
function placeRibbonRow(
  vertices: number[],
  leftVertex: number,
  leftXPx: number,
  rightXPx: number,
  yPx: number,
  alpha: number,
): void {
  writeStripRow(vertices, leftVertex, leftXPx, rightXPx, yPx);
  writeMeshVertex(vertices, leftVertex, 'v', alpha);
  writeMeshVertex(vertices, leftVertex + 1, 'v', alpha);
}
