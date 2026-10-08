import type Phaser from 'phaser';
import { getNoteY } from '../../rhythm/notePosition.js';
import type { Lane, Note } from '../../rhythm/types.js';
import {
  LIGHT_TEXTURES,
  addLight,
  ensureLightTextures,
  ensureNoteTexture,
} from '../ui/lightTextures.js';
import { EDITOR_COLORS, GAMEPLAY_DEPTH } from '../ui/theme.js';

const NOTE_WIDTH_PX = 108;
const NOTE_HEIGHT_PX = 24;
const HOLD_END_CAP_HEIGHT_PX = 10;
const HOLD_RIBBON_ALPHA = 0.5;
const SELECTION_PADDING_PX = 8;
const SELECTION_STROKE_PX = 1;
const SELECTION_FILL_ALPHA = 0.08;

interface NoteView {
  note: Note;
  head: Phaser.GameObjects.Image;
  hold: { ribbon: Phaser.GameObjects.Image; endCap: Phaser.GameObjects.Image } | null;
}

interface RenderedInput {
  notes: readonly Note[];
  selected: Note | null;
  currentTimeMs: number;
}

/** Gameplay 노트와 같은 모양으로 draft 의 노트를 그린다. 편집·되감기가 자유로우므로 판정 상태를 모른다. */
export class EditorNoteLayer {
  private views: NoteView[] = [];
  private readonly textureKey: string;
  private readonly selectionOutline: Phaser.GameObjects.Rectangle;
  private rendered: RenderedInput | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: {
      laneCenterXPx: Record<Lane, number>;
      playheadYPx: number;
      pxPerSecond: number;
      topYPx: number;
      bottomYPx: number;
      accentColor: number;
    },
  ) {
    ensureLightTextures(scene);
    this.textureKey = ensureNoteTexture(scene, options.accentColor);
    this.selectionOutline = scene.add
      .rectangle(0, 0, 0, 0, EDITOR_COLORS.selected, SELECTION_FILL_ALPHA)
      .setOrigin(0.5, 1)
      .setStrokeStyle(SELECTION_STROKE_PX, EDITOR_COLORS.selected)
      .setDepth(GAMEPLAY_DEPTH.hitFx)
      .setVisible(false);
  }

  render(notes: readonly Note[], selected: Note | null, currentTimeMs: number): void {
    const last = this.rendered;
    if (
      last !== null &&
      last.notes === notes &&
      last.selected === selected &&
      last.currentTimeMs === currentTimeMs
    ) {
      return;
    }
    const hasNewNotes = last === null || last.notes !== notes;
    if (hasNewNotes) {
      this.destroyViews();
      this.views = notes.map((note) => this.createView(note));
    }
    if (hasNewNotes || last.currentTimeMs !== currentTimeMs) {
      this.views.forEach((view) => this.place(view, currentTimeMs));
    }
    this.rendered = { notes, selected, currentTimeMs };
    this.highlight(selected, currentTimeMs);
  }

  destroy(): void {
    this.destroyViews();
    this.selectionOutline.destroy();
  }

  private getY(noteTimeMs: number, currentTimeMs: number): number {
    const { playheadYPx, pxPerSecond } = this.options;
    return getNoteY(noteTimeMs, currentTimeMs, playheadYPx, pxPerSecond);
  }

  private isInArea(yPx: number): boolean {
    return yPx >= this.options.topYPx && yPx <= this.options.bottomYPx;
  }

  private createView(note: Note): NoteView {
    const xPx = this.options.laneCenterXPx[note.lane];
    const head = this.scene.add
      .image(xPx, 0, this.textureKey)
      .setDisplaySize(NOTE_WIDTH_PX, NOTE_HEIGHT_PX)
      .setDepth(GAMEPLAY_DEPTH.note);
    const hold =
      note.type === 'hold'
        ? {
            ribbon: addLight(this.scene, LIGHT_TEXTURES.ribbon, xPx, 0)
              .setOrigin(0.5, 1)
              .setDisplaySize(NOTE_WIDTH_PX, 0)
              .setTint(this.options.accentColor)
              .setAlpha(HOLD_RIBBON_ALPHA)
              .setDepth(GAMEPLAY_DEPTH.holdBody),
            endCap: this.scene.add
              .image(xPx, 0, this.textureKey)
              .setDisplaySize(NOTE_WIDTH_PX, HOLD_END_CAP_HEIGHT_PX)
              .setDepth(GAMEPLAY_DEPTH.holdBody),
          }
        : null;
    return { note, head, hold };
  }

  private place({ note, head, hold }: NoteView, currentTimeMs: number): void {
    const headYPx = this.getY(note.timeMs, currentTimeMs);
    head.setY(headYPx).setVisible(this.isInArea(headYPx));
    if (note.type === 'hold' && hold !== null) {
      const endYPx = this.getY(note.endTimeMs, currentTimeMs);
      // 리본은 표시 영역 안의 구간만 그린다.
      const ribbonBottomPx = Math.min(headYPx, this.options.bottomYPx);
      const ribbonTopPx = Math.max(endYPx, this.options.topYPx);
      hold.ribbon
        .setY(ribbonBottomPx)
        .setDisplaySize(NOTE_WIDTH_PX, Math.max(0, ribbonBottomPx - ribbonTopPx))
        .setVisible(ribbonBottomPx > ribbonTopPx);
      hold.endCap.setY(endYPx).setVisible(this.isInArea(endYPx));
    }
  }

  private highlight(selected: Note | null, currentTimeMs: number): void {
    const view = selected === null ? undefined : this.views.find(({ note }) => note === selected);
    if (view === undefined) {
      this.selectionOutline.setVisible(false);
      return;
    }
    const { note } = view;
    const headYPx = this.getY(note.timeMs, currentTimeMs);
    const endYPx = note.type === 'hold' ? this.getY(note.endTimeMs, currentTimeMs) : headYPx;
    const bottomPx = Math.min(
      headYPx + NOTE_HEIGHT_PX / 2 + SELECTION_PADDING_PX,
      this.options.bottomYPx,
    );
    const topPx = Math.max(endYPx - NOTE_HEIGHT_PX / 2 - SELECTION_PADDING_PX, this.options.topYPx);
    this.selectionOutline
      .setPosition(this.options.laneCenterXPx[note.lane], bottomPx)
      .setSize(NOTE_WIDTH_PX + SELECTION_PADDING_PX * 2, Math.max(0, bottomPx - topPx))
      .setVisible(bottomPx > topPx);
  }

  private destroyViews(): void {
    this.views.forEach(({ head, hold }) => {
      head.destroy();
      hold?.ribbon.destroy();
      hold?.endCap.destroy();
    });
    this.views = [];
  }
}
