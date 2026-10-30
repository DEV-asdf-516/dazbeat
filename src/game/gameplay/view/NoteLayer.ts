import type Phaser from 'phaser';
import { requireDefined } from '../../invariant.js';
import type { GameplaySession } from '../../rhythm/GameplaySession.js';
import { getNoteY } from '../../rhythm/notePosition.js';
import type { HoldNote, Lane, Note, TapNote } from '../../rhythm/types.js';
import { GAME_HEIGHT } from '../config.js';
import { getHoldRibbonSpans, getNoteEmphasis } from './noteAppearance.js';
import { drainColor, ensureStarButtonTextures } from './gameplayTextures.js';
import type { StarButtonTextures } from './gameplayTextures.js';
import {
  getHoldRibbonTrapezoid,
  getNotePlate,
  getPerspectiveYPx,
  getPlayfieldXAtY,
} from './playfieldLayout.js';
import type { PlayfieldLayout, Trapezoid } from './playfieldLayout.js';
import { fillTrapezoid } from './trapezoidFill.js';
import { LIGHT_TEXTURES, addLight } from '../ui/lightTextures.js';
import { COLORS, GAMEPLAY_DEPTH, MOTION } from '../ui/theme.js';

const HOLD_RIBBON_PENDING_ALPHA = 0.75;
// 면은 어둡고 옅게 물려 캡과 판정선보다 뒤로 물러나 보이게 하고, 가장자리만 차가운 은빛 선으로 남긴다.
const HOLD_RIBBON_FILL_COLOR = 0x82a4c0;
const HOLD_RIBBON_FILL_ALPHA = 0.24;
const HOLD_RIBBON_EDGE_COLOR = 0xcfe4f0;
const HOLD_RIBBON_EDGE_ALPHA = 0.4;
const HOLD_RIBBON_EDGE_PX = 1;
const HOLD_CONTACT_WIDTH_RATIO = 132 / 120;
const HOLD_CONTACT_HEIGHT_PX = 30;
const HOLD_CONTACT_ALPHA = 0.55;
const TAP_HIT_FLASH_SCALE_X = 1.4;
const HOLD_HIT_FLASH_SCALE_X = 1.2;
const HIT_FLASH_SCALE_Y = 0.5;
const MISS_DRAIN_MS = 260;
// 꼭짓점은 왼쪽 위, 오른쪽 위, 왼쪽 아래, 오른쪽 아래 순이다. 텍스처는 그림 위쪽이 v = 1 이다.
const CAP_UVS = [
  [0, 1],
  [1, 1],
  [0, 0],
  [1, 0],
] as const;
const CAP_INDICES = [0, 1, 2, 0, 1, 2, 3, 0];
const CAP_VERTEX_STRIDE = 4;

interface RibbonColors {
  fill: number;
  edge: number;
}

const RIBBON_COLORS: RibbonColors = {
  fill: HOLD_RIBBON_FILL_COLOR,
  edge: HOLD_RIBBON_EDGE_COLOR,
};
const DRAINED_RIBBON_COLORS: RibbonColors = {
  fill: drainColor(HOLD_RIBBON_FILL_COLOR),
  edge: drainColor(HOLD_RIBBON_EDGE_COLOR),
};

interface HoldView {
  ribbon: Phaser.GameObjects.Graphics;
  contact: Phaser.GameObjects.Image;
  tail: Phaser.GameObjects.Mesh2D;
}

type NoteView =
  | { kind: 'tap'; note: TapNote; head: Phaser.GameObjects.Mesh2D }
  | { kind: 'hold'; note: HoldNote; head: Phaser.GameObjects.Mesh2D; hold: HoldView };

export interface NoteLayerOptions {
  notes: readonly Note[];
  playfield: PlayfieldLayout;
  scrollSpeedPxPerSecond: number;
}

export class NoteLayer {
  private readonly views = new Map<number, NoteView>();
  private readonly capTextures: StarButtonTextures;
  private nextSpawnIndex = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: NoteLayerOptions,
  ) {
    this.capTextures = ensureStarButtonTextures(scene);
  }

  render(session: GameplaySession, songTimeMs: number): void {
    const { notes, playfield } = this.options;
    const { judgeLineYPx } = playfield;
    let nextNote = notes[this.nextSpawnIndex];
    while (
      nextNote !== undefined &&
      judgeLineYPx - this.getY(nextNote.timeMs, songTimeMs) <= GAME_HEIGHT
    ) {
      this.views.set(this.nextSpawnIndex, this.createView(nextNote));
      this.nextSpawnIndex += 1;
      nextNote = notes[this.nextSpawnIndex];
    }

    this.views.forEach((view, noteIndex) => {
      const status = session.getNoteStatus(noteIndex);
      if (status === 'hit') {
        this.views.delete(noteIndex);
        this.flashHit(view);
        return;
      }
      if (status === 'missed') {
        this.views.delete(noteIndex);
        this.drain(view);
        return;
      }
      const isHolding = status === 'holding';
      const headY = isHolding ? judgeLineYPx : this.getY(view.note.timeMs, songTimeMs);
      const headEmphasis = isHolding ? 1 : getNoteEmphasis(headY, judgeLineYPx);
      const headPlate = this.placeCap(view.head, view.note.lane, headY);
      view.head.setAlpha(headEmphasis);
      const outline =
        view.kind === 'hold'
          ? this.renderHold(view.hold, view.note, headY, songTimeMs, isHolding)
          : headPlate;
      if (outline.topYPx > GAME_HEIGHT) {
        this.remove(noteIndex, view);
      }
    });
  }

  private renderHold(
    hold: HoldView,
    note: HoldNote,
    headY: number,
    songTimeMs: number,
    isHolding: boolean,
  ): Trapezoid {
    const tailY = this.getY(note.endTimeMs, songTimeMs);
    // 누르기 전 배율은 면·가장자리에 똑같이 곱해지므로 Graphics alpha 로 건다.
    hold.ribbon.setAlpha(isHolding ? 1 : HOLD_RIBBON_PENDING_ALPHA);
    this.drawRibbon(hold.ribbon, note.lane, headY, tailY, RIBBON_COLORS);
    const tailPlate = this.placeCap(hold.tail, note.lane, tailY);
    hold.tail.setAlpha(getNoteEmphasis(tailY, this.options.playfield.judgeLineYPx));
    hold.contact.setVisible(isHolding);
    return tailPlate;
  }

  private drawRibbon(
    ribbon: Phaser.GameObjects.Graphics,
    lane: Lane,
    headY: number,
    tailY: number,
    colors: RibbonColors,
  ): void {
    const { playfield } = this.options;
    ribbon.clear();
    const { body, fade } = getHoldRibbonSpans(headY, tailY);
    [body, fade].forEach((span) => {
      if (span === null) {
        return;
      }
      const { topYPx, bottomYPx, topLeftXPx, topRightXPx, bottomLeftXPx, bottomRightXPx } =
        getHoldRibbonTrapezoid(playfield, lane, span.topYPx, span.bottomYPx);
      const fillBand = (color: number, alpha: number, band: Trapezoid): void => {
        const topAlpha = span.topAlpha * alpha;
        const bottomAlpha = span.bottomAlpha * alpha;
        fillTrapezoid(ribbon, band, color, {
          topLeft: topAlpha,
          topRight: topAlpha,
          bottomLeft: bottomAlpha,
          bottomRight: bottomAlpha,
        });
      };
      // 면과 가장자리를 겹치지 않게 칠해 가장자리 alpha 가 두 번 쌓이지 않게 한다.
      const edgePx = HOLD_RIBBON_EDGE_PX;
      fillBand(colors.fill, HOLD_RIBBON_FILL_ALPHA, {
        topYPx,
        bottomYPx,
        topLeftXPx: topLeftXPx + edgePx,
        topRightXPx: topRightXPx - edgePx,
        bottomLeftXPx: bottomLeftXPx + edgePx,
        bottomRightXPx: bottomRightXPx - edgePx,
      });
      fillBand(colors.edge, HOLD_RIBBON_EDGE_ALPHA, {
        topYPx,
        bottomYPx,
        topLeftXPx,
        topRightXPx: topLeftXPx + edgePx,
        bottomLeftXPx,
        bottomRightXPx: bottomLeftXPx + edgePx,
      });
      fillBand(colors.edge, HOLD_RIBBON_EDGE_ALPHA, {
        topYPx,
        bottomYPx,
        topLeftXPx: topRightXPx - edgePx,
        topRightXPx,
        bottomLeftXPx: bottomRightXPx - edgePx,
        bottomRightXPx,
      });
    });
  }

  // 텍스처 본체가 판 사다리꼴에 오도록 판 가운데 기준으로 halo 여백 비율만큼 넓힌 점을 꼭짓점으로 쓴다.
  private placeCap(cap: Phaser.GameObjects.Mesh2D, lane: Lane, noteYPx: number): Trapezoid {
    const { playfield } = this.options;
    const { widthScale, heightScale } = this.capTextures;
    const plate = getNotePlate(playfield, lane, noteYPx);
    const centerYPx = (plate.topYPx + plate.bottomYPx) / 2;
    const laneXPx = requireDefined(playfield.laneCenterXPx[lane], 'Unknown note lane', lane);
    const centerXPx = getPlayfieldXAtY(playfield, laneXPx, centerYPx);
    const { vertices } = cap;
    const centerOffsetYPx = centerYPx - noteYPx;
    const topYPx = centerOffsetYPx + (plate.topYPx - centerYPx) * heightScale;
    const bottomYPx = centerOffsetYPx + (plate.bottomYPx - centerYPx) * heightScale;
    cap.setPosition(centerXPx, noteYPx);
    vertices[0] = (plate.topLeftXPx - centerXPx) * widthScale;
    vertices[1] = topYPx;
    vertices[CAP_VERTEX_STRIDE] = (plate.topRightXPx - centerXPx) * widthScale;
    vertices[CAP_VERTEX_STRIDE + 1] = topYPx;
    vertices[CAP_VERTEX_STRIDE * 2] = (plate.bottomLeftXPx - centerXPx) * widthScale;
    vertices[CAP_VERTEX_STRIDE * 2 + 1] = bottomYPx;
    vertices[CAP_VERTEX_STRIDE * 3] = (plate.bottomRightXPx - centerXPx) * widthScale;
    vertices[CAP_VERTEX_STRIDE * 3 + 1] = bottomYPx;
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
    const head = this.addCap(GAMEPLAY_DEPTH.note);
    if (note.type === 'tap') {
      return {
        kind: 'tap',
        note,
        head,
      };
    }
    const xPx = requireDefined(playfield.laneCenterXPx[note.lane], 'Unknown note lane', note.lane);
    // 같은 depth 에서는 만든 순서대로 그려지므로 ribbon → contact → tail 순으로 만든다.
    const hold: HoldView = {
      ribbon: this.scene.add.graphics().setDepth(GAMEPLAY_DEPTH.holdBody),
      contact: addLight(this.scene, LIGHT_TEXTURES.glow, xPx, playfield.judgeLineYPx)
        .setDisplaySize(playfield.laneWidthPx * HOLD_CONTACT_WIDTH_RATIO, HOLD_CONTACT_HEIGHT_PX)
        .setTint(COLORS.note)
        .setAlpha(HOLD_CONTACT_ALPHA)
        .setVisible(false)
        .setDepth(GAMEPLAY_DEPTH.holdBody),
      tail: this.addCap(GAMEPLAY_DEPTH.holdBody),
    };
    return {
      kind: 'hold',
      note,
      head,
      hold,
    };
  }

  private addCap(depth: number): Phaser.GameObjects.Mesh2D {
    const vertices = CAP_UVS.flatMap(([u, v]) => [0, 0, u, v]);
    return this.scene.add
      .mesh2d(0, 0, this.capTextures.key, vertices, [...CAP_INDICES])
      .buildOrderedIndices(1, true)
      .setAlpha(0)
      .setDepth(depth);
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
      scaleX: view.kind === 'tap' ? TAP_HIT_FLASH_SCALE_X : HOLD_HIT_FLASH_SCALE_X,
      scaleY: HIT_FLASH_SCALE_Y,
      alpha: 0,
      duration: MOTION.fastMs,
      onComplete: () => head.destroy(),
    });
  }

  // 머리·꼬리 캡은 지금 놓인 자리에 남으므로 리본도 그 두 위치로 다시 그린다.
  private drain(view: NoteView): void {
    const { drainedKey } = this.capTextures;
    const parts: (Phaser.GameObjects.Mesh2D | Phaser.GameObjects.Graphics)[] = [
      view.head.setTexture(drainedKey),
    ];
    if (view.kind === 'hold') {
      const { ribbon, contact, tail } = view.hold;
      contact.destroy();
      this.drawRibbon(ribbon, view.note.lane, view.head.y, tail.y, DRAINED_RIBBON_COLORS);
      parts.push(ribbon, tail.setTexture(drainedKey));
    }
    this.scene.tweens.add({
      targets: parts,
      alpha: 0,
      duration: MISS_DRAIN_MS,
      onComplete: () => parts.forEach((part) => part.destroy()),
    });
  }

  private remove(noteIndex: number, view: NoteView): void {
    view.head.destroy();
    if (view.kind === 'hold') {
      this.destroyHold(view.hold);
    }
    this.views.delete(noteIndex);
  }

  private destroyHold(hold: HoldView): void {
    hold.ribbon.destroy();
    hold.contact.destroy();
    hold.tail.destroy();
  }
}
