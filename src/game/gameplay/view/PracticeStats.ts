import type Phaser from 'phaser';
import { requireDefined } from '../../../invariant.js';
import { JUDGMENTS } from '../../../rhythm/judgment.js';
import type { Judgment } from '../../../rhythm/types.js';
import { formatAccuracy } from '../../ui/state/format.js';
import { COLORS, GAMEPLAY_DEPTH, JUDGMENT_COLORS, textStyle } from '../../ui/view/theme.js';
import { GlyphText } from '../../ui/view/widgets/GlyphText.js';
import { addHudText } from './hudObjects.js';

const ACCURACY_LINE_HEIGHT_PX = 36;
const COUNT_LINE_HEIGHT_PX = 28;
// 판정 라벨은 횟수 자릿수와 무관하게 같은 세로줄에 놓이도록 횟수 칸 너비만큼 띄운다.
const COUNT_COLUMN_WIDTH_PX = 72;
const ACCURACY_GLYPH_FONT_KEY = 'glyph:practiceAccuracy';
const COUNT_GLYPH_FONT_KEY = 'glyph:practiceCount';

export class PracticeStats {
  private readonly accuracyText: GlyphText;
  private readonly countRows: readonly {
    readonly judgment: Judgment;
    readonly text: GlyphText;
  }[];

  constructor(scene: Phaser.Scene, rightXPx: number, topYPx: number) {
    this.accuracyText = new GlyphText(scene, {
      fontKey: ACCURACY_GLYPH_FONT_KEY,
      style: textStyle('secondary', COLORS.textPrimary),
      chars: '0123456789.%',
      xPx: rightXPx,
      yPx: topYPx,
      originX: 1,
      originY: 0,
      text: formatAccuracy(0),
      depth: GAMEPLAY_DEPTH.text,
    });
    const countsTopYPx = topYPx + ACCURACY_LINE_HEIGHT_PX;
    this.countRows = JUDGMENTS.map((judgment, index) => {
      const yPx = countsTopYPx + COUNT_LINE_HEIGHT_PX * index;
      addHudText(
        scene,
        rightXPx - COUNT_COLUMN_WIDTH_PX,
        yPx,
        judgment.toUpperCase(),
        textStyle('meta', JUDGMENT_COLORS[judgment]),
      ).setOrigin(1, 0);
      return {
        judgment,
        text: new GlyphText(scene, {
          fontKey: COUNT_GLYPH_FONT_KEY,
          style: textStyle('meta', COLORS.textPrimary),
          chars: '0123456789',
          xPx: rightXPx,
          yPx,
          originX: 1,
          originY: 0,
          text: '0',
          depth: GAMEPLAY_DEPTH.text,
        }),
      };
    });
  }

  renderCount(judgment: Judgment, count: number): void {
    requireDefined(
      this.countRows.find((row) => row.judgment === judgment),
      'Missing practice count row',
      judgment,
    ).text.render(`${count}`);
  }

  renderAccuracy(accuracy: number): void {
    this.accuracyText.render(formatAccuracy(accuracy));
  }
}
