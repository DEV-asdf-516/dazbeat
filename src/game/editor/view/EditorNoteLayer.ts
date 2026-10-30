import type Phaser from 'phaser';
import { requireDefined } from '../../../invariant.js';
import { getNoteY } from '../../../rhythm/notePosition.js';
import type { HoldNote, Lane, Note } from '../../../rhythm/types.js';
import { ensureNoteTexture } from './editorTextures.js';
import {
  LIGHT_TEXTURES,
  addLight,
  ensureLightTextures,
} from '../../ui/view/textures/lightTextures.js';
import { CELESTIAL_COLORS, GAMEPLAY_DEPTH } from '../../ui/view/theme.js';

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

export interface EditorNotesView {
  readonly notes: readonly Note[];
  readonly selected: Note | null;
  readonly currentTimeMs: number;
  readonly laneCenterXPx: readonly number[];
  readonly accentColor: number;
}

/** 편집·되감기가 자유로우므로 판정 상태를 모른다. */
export class EditorNoteLayer {
  private readonly views = new Map<Note, NoteView>();
  private readonly selectionOutline: Phaser.GameObjects.Rectangle;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: {
      readonly playheadYPx: number;
      readonly pxPerSecond: number;
      readonly topYPx: number;
      readonly bottomYPx: number;
    },
  ) {
    ensureLightTextures(scene);
    this.selectionOutline = scene.add
      .rectangle(0, 0, 0, 0, CELESTIAL_COLORS.selected, SELECTION_FILL_ALPHA)
      .setOrigin(0.5, 1)
      .setStrokeStyle(SELECTION_STROKE_PX, CELESTIAL_COLORS.selected)
      .setDepth(GAMEPLAY_DEPTH.hitFx)
      .setVisible(false);
  }

  /** 노트는 불변 값이라 같은 객체면 같은 모양이다. 레인 수·accent 가 바뀌면 노트도 모두 새것이라 뷰가 다시 만들어진다. */
  render(view: EditorNotesView): void {
    const { notes, currentTimeMs } = view;
    const present = new Set(notes);
    this.views.forEach((noteView, note) => {
      if (!present.has(note)) {
        this.destroyView(noteView);
        this.views.delete(note);
      }
    });
    this.views.forEach((noteView, note) => this.place(note, noteView, currentTimeMs));
    notes.forEach((note) => {
      if (!this.views.has(note)) {
        const noteView = this.createView(note, view);
        this.place(note, noteView, currentTimeMs);
        this.views.set(note, noteView);
      }
    });
    this.highlight(view);
  }

  private getY(noteTimeMs: number, currentTimeMs: number): number {
    const { playheadYPx, pxPerSecond } = this.options;
    return getNoteY(noteTimeMs, currentTimeMs, playheadYPx, pxPerSecond);
  }

  private isInArea(yPx: number): boolean {
    return yPx >= this.options.topYPx && yPx <= this.options.bottomYPx;
  }

  private createView(note: Note, { laneCenterXPx, accentColor }: EditorNotesView): NoteView {
    const xPx = getLaneCenterXPx(laneCenterXPx, note.lane);
    const textureKey = ensureNoteTexture(this.scene, accentColor);
    const head = this.scene.add
      .image(xPx, 0, textureKey)
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
        .setTint(accentColor)
        .setAlpha(HOLD_RIBBON_ALPHA)
        .setDepth(GAMEPLAY_DEPTH.holdBody),
      endCap: this.scene.add
        .image(xPx, 0, textureKey)
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

  private highlight({ selected, currentTimeMs, laneCenterXPx }: EditorNotesView): void {
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
      .setPosition(getLaneCenterXPx(laneCenterXPx, note.lane), bottomPx)
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

function getLaneCenterXPx(laneCenterXPx: readonly number[], lane: Lane): number {
  return requireDefined(laneCenterXPx[lane], 'Unknown note lane', lane);
}
