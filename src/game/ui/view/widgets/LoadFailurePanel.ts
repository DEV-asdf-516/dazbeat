import type Phaser from 'phaser';
import type { ButtonView } from '../../state/buttonPointer.js';
import type { PointerActions } from '../input/hoverTarget.js';
import { COLORS, textStyle } from '../theme.js';
import { Button } from './Button.js';

// 제목과 안내는 붙여 한 덩어리로 읽히게 하고, 버튼은 그 덩어리에서 떨어뜨린다.
const TITLE_OFFSET_Y_PX = -72;
const BODY_OFFSET_Y_PX = -32;
const RETRY_TOP_OFFSET_Y_PX = 32;
const RETRY_WIDTH_PX = 220;
const RETRY_HEIGHT_PX = 56;

export class LoadFailurePanel {
  readonly objects: readonly Phaser.GameObjects.GameObject[];
  private readonly title: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private readonly retry: Button;

  constructor(
    scene: Phaser.Scene,
    area: { readonly leftXPx: number; readonly centerYPx: number },
    pointer: PointerActions,
  ) {
    const { leftXPx, centerYPx } = area;
    this.title = scene.add
      .text(leftXPx, centerYPx + TITLE_OFFSET_Y_PX, '', textStyle('primary', COLORS.textPrimary))
      .setOrigin(0, 0.5);
    this.body = scene.add
      .text(leftXPx, centerYPx + BODY_OFFSET_Y_PX, '', textStyle('secondary', COLORS.textSecondary))
      .setOrigin(0, 0.5);
    this.retry = new Button(scene, leftXPx, centerYPx + RETRY_TOP_OFFSET_Y_PX, {
      variant: 'primary',
      label: 'RETRY',
      widthPx: RETRY_WIDTH_PX,
      heightPx: RETRY_HEIGHT_PX,
      pointer,
    });
    this.objects = [this.title, this.body, this.retry];
    this.render(null);
  }

  render(copy: { readonly title: string; readonly body: string } | null): void {
    [this.title, this.body, this.retry].forEach((part) => part.setVisible(copy !== null));
    if (copy !== null) {
      this.title.setText(copy.title);
      this.body.setText(copy.body);
    }
  }

  renderRetry(view: ButtonView): void {
    this.retry.render(view);
  }
}
