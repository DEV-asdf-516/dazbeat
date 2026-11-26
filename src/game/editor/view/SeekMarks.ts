import Phaser from 'phaser';
import { requireDefined } from '../../../invariant.js';
import { HAIRLINE_PX } from '../../ui/view/textures/hairline.js';
import { CELESTIAL_COLORS, GAMEPLAY_DEPTH } from '../../ui/view/theme.js';

const SEEK_MARK_HEIGHT_PX = 12;
const SEEK_MARK_ALPHA = 0.45;
const SEEK_MARKS_TEXTURE_KEY = 'editor:seekMarks';

export class SeekMarks {
  private readonly texture: Phaser.Textures.DynamicTexture;
  private readonly brush: Phaser.GameObjects.Graphics;
  private readonly leftPx: number;
  private readonly topPx: number;

  constructor(
    scene: Phaser.Scene,
    look: {
      readonly seekLeftPx: number;
      readonly seekWidthPx: number;
      readonly centerYPx: number;
    },
  ) {
    const { seekLeftPx, seekWidthPx, centerYPx } = look;
    this.leftPx = Math.floor(seekLeftPx - HAIRLINE_PX);
    this.topPx = centerYPx - SEEK_MARK_HEIGHT_PX / 2;
    this.texture = requireDefined(
      scene.textures.addDynamicTexture(
        SEEK_MARKS_TEXTURE_KEY,
        seekWidthPx + (seekLeftPx - this.leftPx) * 2,
        SEEK_MARK_HEIGHT_PX,
      ) ?? undefined,
      'Seek mark texture key in use',
      SEEK_MARKS_TEXTURE_KEY,
    );
    scene.add
      .image(this.leftPx, this.topPx, this.texture)
      .setOrigin(0, 0)
      .setDepth(GAMEPLAY_DEPTH.lanePanel);
    this.brush = scene.make.graphics(undefined, false);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.textures.remove(SEEK_MARKS_TEXTURE_KEY);
      this.brush.destroy();
    });
  }

  render(markXsPx: readonly number[]): void {
    const { brush, topPx } = this;
    brush.clear().lineStyle(HAIRLINE_PX, CELESTIAL_COLORS.selected, SEEK_MARK_ALPHA);
    for (const xPx of markXsPx) {
      brush.lineBetween(xPx, topPx, xPx, topPx + SEEK_MARK_HEIGHT_PX);
    }
    this.texture.clear().draw(brush, -this.leftPx, -topPx).render();
  }
}
