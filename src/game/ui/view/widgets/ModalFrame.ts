import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../app/config.js';
import { bindPointer } from '../input/hoverTarget.js';
import type { PointerActions } from '../input/hoverTarget.js';
import { CELESTIAL_COLORS, MODAL } from '../theme.js';
import { MOTION } from '../../state/motion.js';
import { ModalPanel } from './ModalPanel.js';

export class ModalFrame {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly backdrop: Phaser.GameObjects.Rectangle;
  readonly panel: ModalPanel;
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
    this.panel = new ModalPanel(scene);
    this.container = scene.add.container(0, 0, [...this.panel.objects]).setDepth(MODAL.depth);
    this.backdrop.setVisible(false);
    this.container.setVisible(false);
  }

  placePanel(widthPx: number, heightPx: number): void {
    this.container.setPosition((GAME_WIDTH - widthPx) / 2, (GAME_HEIGHT - heightPx) / 2);
  }

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
