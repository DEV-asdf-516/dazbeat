import type Phaser from 'phaser';
import type { EditTool } from './chartGesture.js';
import type { SegmentGlyph, SegmentOption } from './SegmentedControl.js';

const GLYPH_WIDTH_PX = 14;
const GLYPH_BAR_HEIGHT_PX = 4;
const GLYPH_RIBBON_WIDTH_PX = 6;
const GLYPH_RIBBON_HEIGHT_PX = 9;
const GLYPH_RIBBON_ALPHA = 0.55;

const TAP_GLYPH: SegmentGlyph = {
  widthPx: GLYPH_WIDTH_PX,
  draw: (graphics: Phaser.GameObjects.Graphics, color: number) => {
    graphics
      .fillStyle(color)
      .fillRect(0, -GLYPH_BAR_HEIGHT_PX / 2, GLYPH_WIDTH_PX, GLYPH_BAR_HEIGHT_PX);
  },
};

const HOLD_GLYPH: SegmentGlyph = {
  widthPx: GLYPH_WIDTH_PX,
  draw: (graphics: Phaser.GameObjects.Graphics, color: number) => {
    const barTopYPx = (GLYPH_RIBBON_HEIGHT_PX - GLYPH_BAR_HEIGHT_PX) / 2;
    graphics
      .fillStyle(color, GLYPH_RIBBON_ALPHA)
      .fillRect(
        (GLYPH_WIDTH_PX - GLYPH_RIBBON_WIDTH_PX) / 2,
        barTopYPx - GLYPH_RIBBON_HEIGHT_PX,
        GLYPH_RIBBON_WIDTH_PX,
        GLYPH_RIBBON_HEIGHT_PX,
      )
      .fillStyle(color)
      .fillRect(0, barTopYPx, GLYPH_WIDTH_PX, GLYPH_BAR_HEIGHT_PX);
  },
};

export const TOOL_SEGMENTS: readonly SegmentOption<EditTool>[] = [
  {
    value: 'tap',
    label: 'TAP',
    glyph: TAP_GLYPH,
  },
  {
    value: 'hold',
    label: 'HOLD',
    glyph: HOLD_GLYPH,
  },
];
