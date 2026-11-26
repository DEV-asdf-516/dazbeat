import type Phaser from 'phaser';
import { requireDefined } from '../../../invariant.js';
import { lerp } from '../../../range.js';
import type { GameplaySession } from '../../../rhythm/GameplaySession.js';
import { getNoteY } from '../../../rhythm/notePosition.js';
import type { HoldNote, Note, TapNote } from '../../../rhythm/types.js';
import { GAME_HEIGHT } from '../../app/config.js';
import {
  getHoldRibbonAlpha,
  getHoldRibbonSpanBottomYPx,
  getHoldRibbonSpanTopYPx,
  getNoteEmphasis,
} from '../state/noteAppearance.js';
import type { HoldRibbonSpan } from '../state/noteAppearance.js';
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
  getLaneBands,
  getNotePlateTopYPx,
  getPerspectiveYPx,
  getPlayfieldXAtY,
} from '../state/playfieldLayout.js';
import type { LaneBand, PlayfieldLayout } from '../state/playfieldLayout.js';
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
  HOLD_RIBBON_WIDTH_RATIO,
  NOTE_PLATE_WIDTH_RATIO,
} from '../../ui/state/noteLook.js';

const MISS_DRAIN_MS = 260;
const CAP_ROWS = 1;
const RIBBON_ROWS = FULL_FADE_ROWS;
// 띠 부분마다 body·fade 구간의 줄 묶음(strip)을 하나씩 둔다. 인덱스 순서가 그리는 순서다.
const RIBBON_PARTS = ['glass', 'leftEdge', 'rightEdge', 'leftGlow', 'rightGlow'] as const;
type RibbonPart = (typeof RIBBON_PARTS)[number];
const RIBBON_SPANS: readonly HoldRibbonSpan[] = ['body', 'fade'];
const RIBBON_INDICES = createStripIndices(RIBBON_PARTS.length * RIBBON_SPANS.length, RIBBON_ROWS);
// 띠의 위·아래 줄 왼쪽 꼭짓점 번호. 메시마다 같아 한 번만 구한다.
interface CapStrip {
  readonly topVertex: number;
  readonly bottomVertex: number;
}

interface TrailStrip extends CapStrip {
  readonly trailRatio: number;
}

// 캡 메시 하나가 잔상 띠들과 머리 띠를 함께 그린다.
interface HoldView {
  ribbonBand: LaneBand;
  ribbon: Phaser.GameObjects.Mesh2D;
  contact: Phaser.GameObjects.Image;
  tail: Phaser.GameObjects.Mesh2D;
}

type NoteView =
  | {
      kind: 'tap';
      note: TapNote;
      plateBand: LaneBand;
      head: Phaser.GameObjects.Mesh2D;
    }
  | {
      kind: 'hold';
      note: HoldNote;
      plateBand: LaneBand;
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
  // 레인 가로 범위는 프레임마다 바뀌지 않으므로 레인마다 한 번만 구한다.
  private readonly plateBands: readonly LaneBand[];
  private readonly ribbonBands: readonly LaneBand[];
  private readonly capTextures: StarButtonTextures;
  private readonly ribbonTextures: HoldRibbonTextures;
  // u 는 부분의 가로 모양 끝인 원본이다. v 는 매 프레임 alpha 로 고친다.
  private readonly ribbonVertexTemplate: readonly number[];
  private readonly capVertexTemplate: readonly number[];
  private readonly capIndices: readonly number[];
  private readonly trailStrips: readonly TrailStrip[];
  private readonly headStrip: CapStrip;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: NoteLayerOptions,
  ) {
    this.plateBands = getLaneBands(options.playfield, NOTE_PLATE_WIDTH_RATIO);
    this.ribbonBands = getLaneBands(options.playfield, HOLD_RIBBON_WIDTH_RATIO);
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
    // 인덱스 순서가 그리는 순서라 잔상 띠를 앞에 두어 머리 띠가 그 위에 그려진다.
    const { head, trails } = this.capTextures;
    this.capVertexTemplate = [...trails, head].flatMap((part) =>
      createStripVertices(CAP_ROWS, part),
    );
    this.capIndices = createStripIndices(trails.length + 1, CAP_ROWS);
    const toCapStrip = (strip: number): CapStrip => ({
      topVertex: getStripRowVertex(CAP_ROWS, strip, 0),
      bottomVertex: getStripRowVertex(CAP_ROWS, strip, CAP_ROWS),
    });
    this.trailStrips = trails.map(({ trailRatio }, strip) => ({
      trailRatio,
      ...toCapStrip(strip),
    }));
    this.headStrip = toCapStrip(trails.length);
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
    for (const noteIndex of this.views.keys()) {
      const view = requireDefined(this.views.get(noteIndex), 'Unknown note view', noteIndex);
      const status = session.getNoteStatus(noteIndex);
      if (status === 'hit') {
        this.release(noteIndex, view);
        this.placeCap(view.head, view.plateBand, judgeLineYPx);
        this.flashHit(view);
        continue;
      }
      if (status === 'missed') {
        this.release(noteIndex, view);
        // 머리·꼬리 캡은 지금 놓인 자리에 남으므로 리본도 그 두 위치로 고정한다.
        if (view.kind === 'hold') {
          this.placeRibbon(view.hold.ribbon, view.hold.ribbonBand, view.head.y, view.hold.tail.y);
        }
        this.drain(view);
        continue;
      }
      const { head } = view;
      const { plateBand } = view;
      const { timeMs } = view.note;
      const isHolding = status === 'holding';
      const headY = isHolding ? judgeLineYPx : this.getY(timeMs, songTimeMs);
      const headTopYPx = this.placeCap(head, plateBand, headY);
      // 누르는 동안 머리는 판정선에 멈춰 움직임이 없으므로 잔상을 끈다.
      // 잔상 띠의 겹 alpha 는 텍스처에 구워 있어 메시 alpha 가 머리와 잔상에 같은 강조를 곱한다.
      if (isHolding) {
        head.setAlpha(1);
        this.collapseTrail(head);
      } else {
        head.setAlpha(getNoteEmphasis(headY, judgeLineYPx));
        this.placeTrail(head, plateBand, timeMs, songTimeMs, trailMs);
      }
      if (view.kind === 'tap') {
        if (headTopYPx > GAME_HEIGHT) {
          this.release(noteIndex, view);
          head.destroy();
        }
        continue;
      }
      const { hold } = view;
      const { endTimeMs } = view.note;
      const tailY = this.getY(endTimeMs, songTimeMs);
      // 누르기 전 배율은 면·가장자리·glow 에 똑같이 곱해지므로 메시 alpha 로 건다.
      hold.ribbon.setAlpha(isHolding ? 1 : HOLD_RIBBON_PENDING_ALPHA);
      this.placeRibbon(hold.ribbon, hold.ribbonBand, headY, tailY);
      const tailTopYPx = this.placeCap(hold.tail, plateBand, tailY);
      hold.tail.setAlpha(getNoteEmphasis(tailY, judgeLineYPx));
      this.placeTrail(hold.tail, plateBand, endTimeMs, songTimeMs, trailMs);
      hold.contact.setVisible(isHolding);
      if (tailTopYPx > GAME_HEIGHT) {
        this.release(noteIndex, view);
        head.destroy();
        this.destroyHold(hold);
      }
    }
  }

  // 가장자리·glow 는 원근과 무관한 화면 px 폭이라 줄마다 띠 양 끝에서 px 로 떼어 놓는다.
  // 프레임마다 객체를 만들지 않도록 줄마다 꼭짓점 배열의 제자리 값만 고친다.
  // 꼭짓점 v 가 아틀라스의 alpha 단계라 줄의 alpha 를 그대로 v 에 놓는다.
  private placeRibbon(
    ribbon: Phaser.GameObjects.Mesh2D,
    band: LaneBand,
    headYPx: number,
    tailYPx: number,
  ): void {
    const { glowLineWidthPx, glowHalfWidthPx } = this.ribbonTextures;
    const { playfield } = this.options;
    const { vertices } = ribbon;
    for (const spanName of RIBBON_SPANS) {
      const topYPx = getHoldRibbonSpanTopYPx(spanName, headYPx, tailYPx);
      const bottomYPx = getHoldRibbonSpanBottomYPx(spanName, headYPx);
      const topAlpha = getHoldRibbonAlpha(topYPx, headYPx, tailYPx);
      const bottomAlpha = getHoldRibbonAlpha(bottomYPx, headYPx, tailYPx);
      const topLeftXPx = getPlayfieldXAtY(playfield, band.leftXPx, topYPx);
      const topRightXPx = getPlayfieldXAtY(playfield, band.rightXPx, topYPx);
      const bottomLeftXPx = getPlayfieldXAtY(playfield, band.leftXPx, bottomYPx);
      const bottomRightXPx = getPlayfieldXAtY(playfield, band.rightXPx, bottomYPx);
      const glassStrip = getRibbonStrip('glass', spanName);
      const leftEdgeStrip = getRibbonStrip('leftEdge', spanName);
      const rightEdgeStrip = getRibbonStrip('rightEdge', spanName);
      const leftGlowStrip = getRibbonStrip('leftGlow', spanName);
      const rightGlowStrip = getRibbonStrip('rightGlow', spanName);
      for (let row = 0; row <= RIBBON_ROWS; row += 1) {
        const t = row / RIBBON_ROWS;
        const yPx = lerp(topYPx, bottomYPx, t);
        const alpha = lerp(topAlpha, bottomAlpha, t);
        const leftXPx = lerp(topLeftXPx, bottomLeftXPx, t);
        const rightXPx = lerp(topRightXPx, bottomRightXPx, t);
        const leftGlowXPx = leftXPx + glowLineWidthPx / 2;
        const rightGlowXPx = rightXPx - glowLineWidthPx / 2;
        const glassVertex = getStripRowVertex(RIBBON_ROWS, glassStrip, row);
        writeStripRow(
          vertices,
          glassVertex,
          leftXPx + HOLD_RIBBON_EDGE_PX,
          rightXPx - HOLD_RIBBON_EDGE_PX,
          yPx,
        );
        writeMeshVertex(vertices, glassVertex, 'v', alpha);
        writeMeshVertex(vertices, glassVertex + 1, 'v', alpha);
        const leftEdgeVertex = getStripRowVertex(RIBBON_ROWS, leftEdgeStrip, row);
        writeStripRow(vertices, leftEdgeVertex, leftXPx, leftXPx + HOLD_RIBBON_EDGE_PX, yPx);
        writeMeshVertex(vertices, leftEdgeVertex, 'v', alpha);
        writeMeshVertex(vertices, leftEdgeVertex + 1, 'v', alpha);
        const rightEdgeVertex = getStripRowVertex(RIBBON_ROWS, rightEdgeStrip, row);
        writeStripRow(vertices, rightEdgeVertex, rightXPx - HOLD_RIBBON_EDGE_PX, rightXPx, yPx);
        writeMeshVertex(vertices, rightEdgeVertex, 'v', alpha);
        writeMeshVertex(vertices, rightEdgeVertex + 1, 'v', alpha);
        const leftGlowVertex = getStripRowVertex(RIBBON_ROWS, leftGlowStrip, row);
        writeStripRow(
          vertices,
          leftGlowVertex,
          leftGlowXPx - glowHalfWidthPx,
          leftGlowXPx + glowHalfWidthPx,
          yPx,
        );
        writeMeshVertex(vertices, leftGlowVertex, 'v', alpha);
        writeMeshVertex(vertices, leftGlowVertex + 1, 'v', alpha);
        const rightGlowVertex = getStripRowVertex(RIBBON_ROWS, rightGlowStrip, row);
        writeStripRow(
          vertices,
          rightGlowVertex,
          rightGlowXPx - glowHalfWidthPx,
          rightGlowXPx + glowHalfWidthPx,
          yPx,
        );
        writeMeshVertex(vertices, rightGlowVertex, 'v', alpha);
        writeMeshVertex(vertices, rightGlowVertex + 1, 'v', alpha);
      }
    }
  }

  // 판정 flash 가 머리 판 가운데 아래 끝을 축으로 줄어들도록 메시 위치를 머리 판에 둔다.
  private placeCap(cap: Phaser.GameObjects.Mesh2D, band: LaneBand, noteYPx: number): number {
    const topYPx = getNotePlateTopYPx(noteYPx);
    cap.setPosition(
      getPlayfieldXAtY(this.options.playfield, band.centerXPx, (topYPx + noteYPx) / 2),
      noteYPx,
    );
    this.placeCapStrip(cap, this.headStrip, band, noteYPx);
    return topYPx;
  }

  private placeTrail(
    cap: Phaser.GameObjects.Mesh2D,
    band: LaneBand,
    noteTimeMs: number,
    songTimeMs: number,
    trailMs: number,
  ): void {
    for (const trailStrip of this.trailStrips) {
      this.placeCapStrip(
        cap,
        trailStrip,
        band,
        this.getY(noteTimeMs, songTimeMs - trailMs * trailStrip.trailRatio),
      );
    }
  }

  // 텍스처 본체가 판 사다리꼴에 오도록 판 가운데 기준으로 halo 여백 비율만큼 넓힌 점을 꼭짓점으로 쓴다.
  // 꼭짓점은 메시 위치(머리 판) 기준이라 잔상 띠는 그만큼 떨어진 자리에 놓인다.
  private placeCapStrip(
    cap: Phaser.GameObjects.Mesh2D,
    { topVertex, bottomVertex }: CapStrip,
    band: LaneBand,
    noteYPx: number,
  ): void {
    const { playfield } = this.options;
    const { widthScale, heightScale } = this.capTextures;
    const topYPx = getNotePlateTopYPx(noteYPx);
    const centerYPx = (topYPx + noteYPx) / 2;
    const centerXPx = getPlayfieldXAtY(playfield, band.centerXPx, centerYPx);
    const offsetXPx = centerXPx - cap.x;
    const offsetYPx = centerYPx - cap.y;
    writeStripRow(
      cap.vertices,
      topVertex,
      offsetXPx + (getPlayfieldXAtY(playfield, band.leftXPx, topYPx) - centerXPx) * widthScale,
      offsetXPx + (getPlayfieldXAtY(playfield, band.rightXPx, topYPx) - centerXPx) * widthScale,
      offsetYPx + (topYPx - centerYPx) * heightScale,
    );
    writeStripRow(
      cap.vertices,
      bottomVertex,
      offsetXPx + (getPlayfieldXAtY(playfield, band.leftXPx, noteYPx) - centerXPx) * widthScale,
      offsetXPx + (getPlayfieldXAtY(playfield, band.rightXPx, noteYPx) - centerXPx) * widthScale,
      offsetYPx + (noteYPx - centerYPx) * heightScale,
    );
  }

  // 네 꼭짓점을 한 점에 모아 넓이 0 인 띠는 그리지 않는다.
  private collapseTrail(cap: Phaser.GameObjects.Mesh2D): void {
    for (const { topVertex, bottomVertex } of this.trailStrips) {
      writeStripRow(cap.vertices, topVertex, 0, 0, 0);
      writeStripRow(cap.vertices, bottomVertex, 0, 0, 0);
    }
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
    const plateBand = requireDefined(this.plateBands[note.lane], 'Unknown note lane', note.lane);
    if (note.type === 'tap') {
      return {
        kind: 'tap',
        note,
        plateBand,
        head,
      };
    }
    // 같은 depth 에서는 만든 순서대로 그려지므로 ribbon → contact → tail 순으로 만든다.
    const hold: HoldView = {
      ribbonBand: requireDefined(this.ribbonBands[note.lane], 'Unknown note lane', note.lane),
      ribbon: this.scene.add
        .mesh2d(0, 0, this.ribbonTextures.key, [...this.ribbonVertexTemplate], [...RIBBON_INDICES])
        .buildOrderedIndices(1, true)
        .setDepth(GAMEPLAY_DEPTH.holdBody),
      contact: addLight(
        this.scene,
        LIGHT_TEXTURES.glow,
        plateBand.centerXPx,
        playfield.judgeLineYPx,
      )
        .setDisplaySize(playfield.laneWidthPx * HOLD_CONTACT.widthRatio, HOLD_CONTACT.heightPx)
        .setTint(COLORS.note)
        .setAlpha(HOLD_CONTACT.alpha)
        .setVisible(false)
        .setDepth(GAMEPLAY_DEPTH.holdBody),
      tail: this.addCap(GAMEPLAY_DEPTH.holdBody),
    };
    return {
      kind: 'hold',
      note,
      plateBand,
      head,
      hold,
    };
  }

  private addCap(depth: number): Phaser.GameObjects.Mesh2D {
    return this.scene.add
      .mesh2d(0, 0, this.capTextures.atlasKey, [...this.capVertexTemplate], [...this.capIndices])
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

  private drain(view: NoteView): void {
    const { drainedAtlasKey } = this.capTextures;
    const parts: Phaser.GameObjects.Mesh2D[] = [view.head.setTexture(drainedAtlasKey)];
    if (view.kind === 'hold') {
      const { ribbon, contact, tail } = view.hold;
      contact.destroy();
      this.collapseTrail(tail);
      parts.push(
        ribbon.setTexture(this.ribbonTextures.drainedKey),
        tail.setTexture(drainedAtlasKey),
      );
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
    this.collapseTrail(view.head);
  }

  private destroyHold(hold: HoldView): void {
    hold.ribbon.destroy();
    hold.contact.destroy();
    hold.tail.destroy();
  }
}

// 부분마다 RIBBON_SPANS 순서로 띠가 이어진다(ribbonVertexTemplate 와 같은 순서).
function getRibbonStrip(part: RibbonPart, spanName: HoldRibbonSpan): number {
  return RIBBON_PARTS.indexOf(part) * RIBBON_SPANS.length + RIBBON_SPANS.indexOf(spanName);
}
