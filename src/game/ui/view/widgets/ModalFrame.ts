import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config.js';
import { bindPress } from './hoverTarget.js';
import type { PointerPress } from './hoverTarget.js';
import { CELESTIAL_COLORS, MODAL, MOTION } from './theme.js';

export class ModalFrame {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly backdrop: Phaser.GameObjects.Rectangle;
  private readonly shadow: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly panelHitArea = new Phaser.Geom.Rectangle();
  private readonly backdropPress: PointerPress | null;

  constructor(scene: Phaser.Scene, onBackdropClick: (() => void) | null) {
    this.scene = scene;
    this.backdrop = scene.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, CELESTIAL_COLORS.background, MODAL.backdropAlpha)
      .setOrigin(0, 0)
      .setInteractive()
      .setDepth(MODAL.depth);
    // 진입 클릭의 pointer up 이 열자마자 막을 닫지 않도록 막에서 누른 경우만 닫는다.
    this.backdropPress =
      onBackdropClick === null
        ? null
        : bindPress(this.backdrop, {
            onActivate: onBackdropClick,
          });
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

  get isOpen(): boolean {
    return this.container.visible;
  }

  setPanelSize(widthPx: number, heightPx: number): void {
    this.panel.setSize(widthPx, heightPx);
    this.panelHitArea.setTo(0, 0, widthPx, heightPx);
    this.shadow.setSize(widthPx, heightPx);
    this.container.setPosition((GAME_WIDTH - widthPx) / 2, (GAME_HEIGHT - heightPx) / 2);
  }

  open(): void {
    if (this.isOpen) {
      return;
    }
    this.backdrop.setVisible(true);
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

  close(): void {
    if (!this.isOpen) {
      return;
    }
    this.scene.tweens.killTweensOf([this.backdrop, this.container]);
    this.backdrop.setVisible(false);
    this.container.setVisible(false);
    this.backdropPress?.cancel();
  }
}
