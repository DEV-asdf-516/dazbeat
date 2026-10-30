import type Phaser from 'phaser';
import { calculateAccuracy } from '../../rhythm/accuracy.js';
import { JUDGMENTS } from '../../rhythm/judgment.js';
import type { Judgment, JudgmentCounts } from '../../rhythm/types.js';
import { formatAccuracy } from '../ui/format.js';
import { COLORS, JUDGMENT_COLORS, textStyle } from '../ui/theme.js';
import { addHudText } from './hudObjects.js';

const ACCURACY_LINE_HEIGHT_PX = 36;
const COUNT_LINE_HEIGHT_PX = 28;
// 판정 라벨은 횟수 자릿수와 무관하게 같은 세로줄에 놓이도록 횟수 칸 너비만큼 띄운다.
const COUNT_COLUMN_WIDTH_PX = 72;

export class PracticeStats {
  private readonly accuracyText: Phaser.GameObjects.Text;
  private readonly countRows: readonly {
    readonly judgment: Judgment;
    readonly text: Phaser.GameObjects.Text;
  }[];
  private counts: JudgmentCounts = {
    perfect: 0,
    great: 0,
    good: 0,
    bad: 0,
    miss: 0,
  };

  constructor(scene: Phaser.Scene, rightXPx: number, topYPx: number) {
    this.accuracyText = addHudText(
      scene,
      rightXPx,
      topYPx,
      formatAccuracy(0),
      textStyle('secondary', COLORS.textPrimary),
    ).setOrigin(1, 0);
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
        text: addHudText(
          scene,
          rightXPx,
          yPx,
          '0',
          textStyle('meta', COLORS.textPrimary),
        ).setOrigin(1, 0),
      };
    });
  }

  setCounts(counts: JudgmentCounts): void {
    if (JUDGMENTS.every((judgment) => counts[judgment] === this.counts[judgment])) {
      return;
    }
    this.countRows.forEach(({ judgment, text }) => {
      if (counts[judgment] !== this.counts[judgment]) {
        text.setText(`${counts[judgment]}`);
      }
    });
    this.counts = { ...counts };
    this.accuracyText.setText(formatAccuracy(calculateAccuracy(counts)));
  }
}
