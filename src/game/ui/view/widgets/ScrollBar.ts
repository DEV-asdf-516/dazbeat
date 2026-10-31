import type Phaser from 'phaser';
import type { ScrollBarScroll } from '../../state/scrollBarScroll.js';
import { CELESTIAL_COLORS } from '../theme.js';

const SCROLLBAR_WIDTH_PX = 3;
const SCROLLBAR_TRACK_ALPHA = 0.3;

export class ScrollBar {
  readonly objects: readonly [Phaser.GameObjects.Rectangle, Phaser.GameObjects.Rectangle];
  private readonly track: Phaser.GameObjects.Rectangle;
  private readonly thumb: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, xPx: number) {
    this.track = scene.add
      .rectangle(xPx, 0, SCROLLBAR_WIDTH_PX, 0, CELESTIAL_COLORS.border, SCROLLBAR_TRACK_ALPHA)
      .setOrigin(0, 0);
    this.thumb = scene.add
      .rectangle(xPx, 0, SCROLLBAR_WIDTH_PX, 0, CELESTIAL_COLORS.selected)
      .setOrigin(0, 0);
    this.objects = [this.track, this.thumb];
  }

  render(
    scroll: ScrollBarScroll,
    frame: { readonly topYPx: number; readonly heightPx: number },
  ): void {
    const { topYPx, heightPx } = frame;
    switch (scroll.kind) {
      case 'hidden':
        this.track.setVisible(false);
        this.thumb.setVisible(false);
        return;
      case 'track':
        this.track.setY(topYPx).setSize(SCROLLBAR_WIDTH_PX, heightPx).setVisible(true);
        this.thumb.setVisible(false);
        return;
      case 'thumb': {
        const { firstIndex, visibleCount, totalCount } = scroll;
        this.track.setY(topYPx).setSize(SCROLLBAR_WIDTH_PX, heightPx).setVisible(true);
        this.thumb
          .setY(topYPx + (heightPx * firstIndex) / totalCount)
          .setSize(SCROLLBAR_WIDTH_PX, (heightPx * visibleCount) / totalCount)
          .setVisible(true);
        return;
      }
    }
  }
}
