import type Phaser from 'phaser';
import type { GameplaySession } from '../../rhythm/GameplaySession.js';
import { getNoteY } from '../../rhythm/notePosition.js';
import type { HoldNote, Lane, Note, TapNote } from '../../rhythm/types.js';
import { GAME_HEIGHT } from '../config.js';
import { getHoldRibbonSpans, getNoteEmphasis } from './noteAppearance.js';
import type { FadingSpan } from './noteAppearance.js';
import { ensureHoldRibbonTexture, ensureStarButtonTexture } from './gameplayTextures.js';
import { LIGHT_TEXTURES, addLight } from '../ui/lightTextures.js';
import { COLORS, GAMEPLAY_DEPTH, MOTION } from '../ui/theme.js';

const HOLD_RIBBON_PENDING_ALPHA = 0.75;
const HOLD_CONTACT_WIDTH_PX = 132;
const HOLD_CONTACT_HEIGHT_PX = 30;
const HOLD_CONTACT_ALPHA = 0.55;
const TAP_HIT_FLASH_SCALE_X = 1.4;
const HOLD_HIT_FLASH_SCALE_X = 1.2;
const HIT_FLASH_SCALE_Y = 0.5;
const MISS_DRAIN_MS = 260;

interface HoldView {
  ribbon: Phaser.GameObjects.Image;
  ribbonFade: Phaser.GameObjects.Image;
  contact: Phaser.GameObjects.Image;
  tail: Phaser.GameObjects.Image;
}

type NoteView =
  | { kind: 'tap'; note: TapNote; head: Phaser.GameObjects.Image }
  | { kind: 'hold'; note: HoldNote; head: Phaser.GameObjects.Image; hold: HoldView };

export interface NoteLayerOptions {
  notes: readonly Note[];
  laneCenterXPx: Record<Lane, number>;
  judgeLineYPx: number;
  scrollSpeedPxPerSecond: number;
}

export class NoteLayer {
  private readonly views = new Map<number, NoteView>();
  private readonly capTextureKey: string;
  private readonly ribbonTextureKey: string;
  private nextSpawnIndex = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: NoteLayerOptions,
  ) {
    this.capTextureKey = ensureStarButtonTexture(scene);
    this.ribbonTextureKey = ensureHoldRibbonTexture(scene);
  }

  render(session: GameplaySession, songTimeMs: number): void {
    const { notes, judgeLineYPx } = this.options;
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
      view.head.setY(headY).setAlpha(headEmphasis);
      if (view.kind === 'hold') {
        this.renderHold(view.hold, headY, view.note.endTimeMs, songTimeMs, isHolding);
      }
      const outline = view.kind === 'hold' ? view.hold.tail : view.head;
      if (outline.y - outline.displayHeight / 2 > GAME_HEIGHT) {
        this.remove(noteIndex, view);
      }
    });
  }

  private renderHold(
    hold: HoldView,
    headY: number,
    endTimeMs: number,
    songTimeMs: number,
    isHolding: boolean,
  ): void {
    const { judgeLineYPx } = this.options;
    const tailY = this.getY(endTimeMs, songTimeMs);
    const ribbonAlpha = isHolding ? 1 : HOLD_RIBBON_PENDING_ALPHA;
    const { body, fade } = getHoldRibbonSpans(headY, tailY);
    this.placeRibbonPart(hold.ribbon, body, ribbonAlpha);
    this.placeRibbonPart(hold.ribbonFade, fade, ribbonAlpha);
    hold.tail.setY(tailY).setAlpha(getNoteEmphasis(tailY, judgeLineYPx));
    hold.contact.setVisible(isHolding);
  }

  private placeRibbonPart(
    part: Phaser.GameObjects.Image,
    span: FadingSpan | null,
    ribbonAlpha: number,
  ): void {
    part.setVisible(span !== null);
    if (span === null) {
      return;
    }
    const topAlpha = span.topAlpha * ribbonAlpha;
    const bottomAlpha = span.bottomAlpha * ribbonAlpha;
    part
      .setY(span.bottomYPx)
      .setDisplaySize(part.width, span.bottomYPx - span.topYPx)
      .setAlpha(topAlpha, topAlpha, bottomAlpha, bottomAlpha);
  }

  private getY(noteTimeMs: number, songTimeMs: number): number {
    const { judgeLineYPx, scrollSpeedPxPerSecond } = this.options;
    return getNoteY(noteTimeMs, songTimeMs, judgeLineYPx, scrollSpeedPxPerSecond);
  }

  private createView(note: Note): NoteView {
    const xPx = this.options.laneCenterXPx[note.lane];
    const head = this.scene.add
      .image(xPx, 0, this.capTextureKey)
      .setAlpha(0)
      .setDepth(GAMEPLAY_DEPTH.note);
    if (note.type === 'tap') {
      return {
        kind: 'tap',
        note,
        head,
      };
    }
    // 같은 depth 에서는 만든 순서대로 그려지므로 ribbon → tail 순으로 만든다.
    const hold: HoldView = {
      ribbon: this.addRibbonPart(xPx),
      ribbonFade: this.addRibbonPart(xPx),
      contact: addLight(this.scene, LIGHT_TEXTURES.glow, xPx, this.options.judgeLineYPx)
        .setDisplaySize(HOLD_CONTACT_WIDTH_PX, HOLD_CONTACT_HEIGHT_PX)
        .setTint(COLORS.note)
        .setAlpha(HOLD_CONTACT_ALPHA)
        .setVisible(false)
        .setDepth(GAMEPLAY_DEPTH.holdBody),
      tail: this.scene.add
        .image(xPx, 0, this.capTextureKey)
        .setAlpha(0)
        .setDepth(GAMEPLAY_DEPTH.holdBody),
    };
    return {
      kind: 'hold',
      note,
      head,
      hold,
    };
  }

  private addRibbonPart(xPx: number): Phaser.GameObjects.Image {
    return this.scene.add
      .image(xPx, 0, this.ribbonTextureKey)
      .setOrigin(0.5, 1)
      .setVisible(false)
      .setDepth(GAMEPLAY_DEPTH.holdBody);
  }

  // HOLD 완료는 tail 이 판정선에 닿은 순간이므로 리본을 바로 지우고 더 작은 flash 로 끝낸다.
  private flashHit(view: NoteView): void {
    if (view.kind === 'hold') {
      this.destroyHold(view.hold);
    }
    const { head } = view;
    head.setY(this.options.judgeLineYPx).setAlpha(1);
    this.scene.tweens.add({
      targets: head,
      scaleX: view.kind === 'tap' ? TAP_HIT_FLASH_SCALE_X : HOLD_HIT_FLASH_SCALE_X,
      scaleY: HIT_FLASH_SCALE_Y,
      alpha: 0,
      duration: MOTION.fastMs,
      onComplete: () => head.destroy(),
    });
  }

  private drain(view: NoteView): void {
    const parts = [view.head];
    if (view.kind === 'hold') {
      parts.push(view.hold.ribbon, view.hold.ribbonFade, view.hold.tail);
      view.hold.contact.destroy();
    }
    parts.forEach((part) => part.setTint(COLORS.nightTrace));
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
    hold.ribbonFade.destroy();
    hold.contact.destroy();
    hold.tail.destroy();
  }
}
