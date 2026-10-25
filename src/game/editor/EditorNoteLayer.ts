import type Phaser from 'phaser';
import { requireDefined } from '../../invariant.js';
import { getNoteY } from '../../rhythm/notePosition.js';
import type { HoldNote, Lane, Note } from '../../rhythm/types.js';
import { ensureNoteTexture } from './editorTextures.js';
import { LIGHT_TEXTURES, addLight, ensureLightTextures } from '../ui/lightTextures.js';
import { CELESTIAL_COLORS, GAMEPLAY_DEPTH } from '../ui/theme.js';

const NOTE_WIDTH_PX = 108;
const NOTE_HEIGHT_PX = 24;
const HOLD_END_CAP_HEIGHT_PX = 10;
const HOLD_RIBBON_ALPHA = 0.5;
const SELECTION_PADDING_PX = 8;
const SELECTION_STROKE_PX = 1;
const SELECTION_FILL_ALPHA = 0.08;

type NoteView =
  | { kind: 'tap'; head: Phaser.GameObjects.Image }
  | {
      kind: 'hold';
      note: HoldNote;
      head: Phaser.GameObjects.Image;
      ribbon: Phaser.GameObjects.Image;
      endCap: Phaser.GameObjects.Image;
    };

interface RenderedInput {
  notes: readonly Note[];
  selected: Note | null;
  currentTimeMs: number;
}

/** 편집·되감기가 자유로우므로 판정 상태를 모른다. */
export class EditorNoteLayer {
  private readonly views = new Map<Note, NoteView>();
  private readonly textureKey: string;
  private readonly selectionOutline: Phaser.GameObjects.Rectangle;
  private rendered: RenderedInput | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: {
      laneCenterXPx: readonly number[];
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
      .rectangle(0, 0, 0, 0, CELESTIAL_COLORS.selected, SELECTION_FILL_ALPHA)
      .setOrigin(0.5, 1)
      .setStrokeStyle(SELECTION_STROKE_PX, CELESTIAL_COLORS.selected)
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
    const hasTimeChanged = last === null || last.currentTimeMs !== currentTimeMs;
    // 사라진 뷰는 배치 전에 지우고, 새 뷰는 만들면서 배치해서 불필요한 연산을 줄인다.
    if (hasNewNotes) {
      this.destroyRemovedViews(notes);
    }
    if (hasTimeChanged) {
      this.views.forEach((view, note) => this.place(note, view, currentTimeMs));
    }
    if (hasNewNotes) {
      this.createAddedViews(notes, currentTimeMs);
    }
    if (hasNewNotes || hasTimeChanged || last.selected !== selected) {
      this.highlight(selected, currentTimeMs);
    }
    this.rendered = {
      notes,
      selected,
      currentTimeMs,
    };
  }

  destroy(): void {
    this.views.forEach((view) => this.destroyView(view));
    this.views.clear();
    this.selectionOutline.destroy();
  }

  /** 노트는 불변 값이라 같은 객체면 같은 모양이다. */
  private destroyRemovedViews(notes: readonly Note[]): void {
    const present = new Set(notes);
    this.views.forEach((view, note) => {
      if (!present.has(note)) {
        this.destroyView(view);
        this.views.delete(note);
      }
    });
  }

  private createAddedViews(notes: readonly Note[], currentTimeMs: number): void {
    notes.forEach((note) => {
      if (!this.views.has(note)) {
        const view = this.createView(note);
        this.place(note, view, currentTimeMs);
        this.views.set(note, view);
      }
    });
  }

  private getY(noteTimeMs: number, currentTimeMs: number): number {
    const { playheadYPx, pxPerSecond } = this.options;
    return getNoteY(noteTimeMs, currentTimeMs, playheadYPx, pxPerSecond);
  }

  private getLaneCenterXPx(lane: Lane): number {
    return requireDefined(this.options.laneCenterXPx[lane], 'Unknown note lane', lane);
  }

  private isInArea(yPx: number): boolean {
    return yPx >= this.options.topYPx && yPx <= this.options.bottomYPx;
  }

  private createView(note: Note): NoteView {
    const xPx = this.getLaneCenterXPx(note.lane);
    const head = this.scene.add
      .image(xPx, 0, this.textureKey)
      .setDisplaySize(NOTE_WIDTH_PX, NOTE_HEIGHT_PX)
      .setDepth(GAMEPLAY_DEPTH.note);
    if (note.type === 'tap') {
      return {
        kind: 'tap',
        head,
      };
    }
    return {
      kind: 'hold',
      note,
      head,
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
    };
  }

  private place(note: Note, view: NoteView, currentTimeMs: number): void {
    const headYPx = this.getY(note.timeMs, currentTimeMs);
    view.head.setY(headYPx).setVisible(this.isInArea(headYPx));
    if (view.kind === 'hold') {
      const endYPx = this.getY(view.note.endTimeMs, currentTimeMs);
      const ribbonBottomPx = Math.min(headYPx, this.options.bottomYPx);
      const ribbonTopPx = Math.max(endYPx, this.options.topYPx);
      view.ribbon
        .setY(ribbonBottomPx)
        .setDisplaySize(NOTE_WIDTH_PX, Math.max(0, ribbonBottomPx - ribbonTopPx))
        .setVisible(ribbonBottomPx > ribbonTopPx);
      view.endCap.setY(endYPx).setVisible(this.isInArea(endYPx));
    }
  }

  private highlight(selected: Note | null, currentTimeMs: number): void {
    if (selected === null || !this.views.has(selected)) {
      this.selectionOutline.setVisible(false);
      return;
    }
    const note = selected;
    const headYPx = this.getY(note.timeMs, currentTimeMs);
    const endYPx = note.type === 'hold' ? this.getY(note.endTimeMs, currentTimeMs) : headYPx;
    const bottomPx = Math.min(
      headYPx + NOTE_HEIGHT_PX / 2 + SELECTION_PADDING_PX,
      this.options.bottomYPx,
    );
    const topPx = Math.max(endYPx - NOTE_HEIGHT_PX / 2 - SELECTION_PADDING_PX, this.options.topYPx);
    this.selectionOutline
      .setPosition(this.getLaneCenterXPx(note.lane), bottomPx)
      .setSize(NOTE_WIDTH_PX + SELECTION_PADDING_PX * 2, Math.max(0, bottomPx - topPx))
      .setVisible(bottomPx > topPx);
  }

  private destroyView(view: NoteView): void {
    view.head.destroy();
    if (view.kind === 'hold') {
      view.ribbon.destroy();
      view.endCap.destroy();
    }
  }
}
