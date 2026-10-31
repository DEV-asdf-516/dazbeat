import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../app/config.js';
import { bindPointer } from '../input/hoverTarget.js';
import type { PointerActions } from '../input/hoverTarget.js';
import { CELESTIAL_COLORS, MODAL } from '../theme.js';
import { MOTION } from '../../state/motion.js';

export class ModalFrame {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly backdrop: Phaser.GameObjects.Rectangle;
  private readonly shadow: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly panelHitArea = new Phaser.Geom.Rectangle();
  private readonly backdropHitArea = new Phaser.Geom.Rectangle();

  constructor(scene: Phaser.Scene, backdropPointer: PointerActions | null) {
    this.scene = scene;
    this.backdrop = scene.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, CELESTIAL_COLORS.background, MODAL.backdropAlpha)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setInteractive(
        this.backdropHitArea,
        (hitArea: Phaser.Geom.Rectangle, x: number, y: number) =>
          Phaser.Geom.Rectangle.Contains(hitArea, x, y),
      )
      .setDepth(MODAL.depth);
    if (backdropPointer !== null) {
      bindPointer(this.backdrop, backdropPointer);
    }
    this.shadow = scene.add
      .rectangle(
        MODAL.shadowOffsetXPx,
        MODAL.shadowOffsetYPx,
        0,
        0,
        MODAL.shadowColor,
        MODAL.shadowAlpha,
      )
      .setOrigin(0, 0)
      .setRounded(MODAL.panelRadiusPx);
    // 패널 안 클릭이 막으로 가 닫히지 않도록 패널도 입력을 받는다.
    this.panel = scene.add
      .rectangle(0, 0, 0, 0, MODAL.panelColor)
      .setOrigin(0, 0)
      .setRounded(MODAL.panelRadiusPx)
      .setInteractive(this.panelHitArea, (hitArea: Phaser.Geom.Rectangle, x: number, y: number) =>
        Phaser.Geom.Rectangle.Contains(hitArea, x, y),
      );
    this.container = scene.add.container(0, 0, [this.shadow, this.panel]).setDepth(MODAL.depth);
    this.backdrop.setVisible(false);
    this.container.setVisible(false);
  }

  setPanelSize(widthPx: number, heightPx: number): void {
    this.panel.setSize(widthPx, heightPx);
    this.panelHitArea.setTo(0, 0, widthPx, heightPx);
    this.shadow.setSize(widthPx, heightPx);
    this.container.setPosition((GAME_WIDTH - widthPx) / 2, (GAME_HEIGHT - heightPx) / 2);
  }

  /** 부르는 쪽이 열림이 바뀔 때만 부른다. 열 때마다 페이드를 다시 건다. */
  render(isOpen: boolean): void {
    if (!isOpen) {
      this.scene.tweens.killTweensOf([this.backdrop, this.container]);
      this.backdrop.setVisible(false);
      this.container.setVisible(false);
      return;
    }
    // 플레이 화면은 창 비율에 따라 게임 폭이 기준 폭보다 넓어지므로 열 때의 화면 전체를 덮는다.
    const { width, height } = this.scene.scale;
    this.backdrop.setSize(width, height).setVisible(true);
    this.backdropHitArea.setTo(0, 0, width, height);
    this.container.setVisible(true);
    this.scene.tweens.add({
      targets: [this.backdrop, this.container],
      alpha: {
        from: 0,
        to: 1,
      },
      duration: MOTION.fastMs,
      ease: 'Sine.Out',
    });
  }
}
