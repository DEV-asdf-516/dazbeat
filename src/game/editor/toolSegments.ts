import type Phaser from 'phaser';
import type { EditTool } from './chartEditorState.js';
import type { SegmentGlyph, SegmentOption } from './SegmentedControl.js';

/** 노트 모양 그림. 레인의 노트처럼 가로 막대이고, HOLD 는 위로 리본이 이어진다. */
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
    // 리본과 막대를 합친 높이가 세로 가운데에 오게 막대를 내린다.
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
  { value: 'tap', label: 'TAP', glyph: TAP_GLYPH },
  { value: 'hold', label: 'HOLD', glyph: HOLD_GLYPH },
];
