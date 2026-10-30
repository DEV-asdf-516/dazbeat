import type Phaser from 'phaser';
import { requireDefined } from '../../../invariant.js';
import { JUDGMENTS } from '../../../rhythm/judgment.js';
import type { Judgment } from '../../../rhythm/types.js';
import { formatAccuracy } from '../../ui/state/format.js';
import { COLORS, JUDGMENT_COLORS, textStyle } from '../../ui/view/theme.js';
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

  renderCount(judgment: Judgment, count: number): void {
    requireDefined(
      this.countRows.find((row) => row.judgment === judgment),
      'Missing practice count row',
      judgment,
    ).text.setText(`${count}`);
  }

  renderAccuracy(accuracy: number): void {
    this.accuracyText.setText(formatAccuracy(accuracy));
  }
}
