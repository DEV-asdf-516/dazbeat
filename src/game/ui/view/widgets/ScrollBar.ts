import type Phaser from 'phaser';
import { CELESTIAL_COLORS } from './theme.js';

const SCROLLBAR_WIDTH_PX = 3;
const SCROLLBAR_TRACK_ALPHA = 0.3;

export interface ScrollBarView {
  readonly topYPx: number;
  readonly heightPx: number;
  readonly visibleCount: number;
  readonly totalCount: number;
  readonly firstIndex: number;
}

export class ScrollBar {
  readonly objects: readonly [Phaser.GameObjects.Rectangle, Phaser.GameObjects.Rectangle];
  private readonly track: Phaser.GameObjects.Rectangle;
  private readonly thumb: Phaser.GameObjects.Rectangle;
  private isVisible = true;
  private isOverflowing = false;

  constructor(scene: Phaser.Scene, xPx: number) {
    this.track = scene.add
      .rectangle(xPx, 0, SCROLLBAR_WIDTH_PX, 0, CELESTIAL_COLORS.border, SCROLLBAR_TRACK_ALPHA)
      .setOrigin(0, 0);
    this.thumb = scene.add
      .rectangle(xPx, 0, SCROLLBAR_WIDTH_PX, 0, CELESTIAL_COLORS.selected)
      .setOrigin(0, 0);
    this.objects = [this.track, this.thumb];
  }

  render(view: ScrollBarView): void {
    const { topYPx, heightPx, visibleCount, totalCount, firstIndex } = view;
    this.track.setY(topYPx).setSize(SCROLLBAR_WIDTH_PX, heightPx);
    this.isOverflowing = totalCount > visibleCount;
    this.thumb.setVisible(this.isVisible && this.isOverflowing);
    if (!this.isOverflowing) {
      return;
    }
    this.thumb
      .setY(topYPx + (heightPx * firstIndex) / totalCount)
      .setSize(SCROLLBAR_WIDTH_PX, (heightPx * visibleCount) / totalCount);
  }

  setVisible(isVisible: boolean): void {
    this.isVisible = isVisible;
    this.track.setVisible(isVisible);
    this.thumb.setVisible(isVisible && this.isOverflowing);
  }
}
