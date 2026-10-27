import type Phaser from 'phaser';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import { LoadingStar } from './LoadingStar.js';

/** 씬이 만든 안내 Text 와 로딩 중일 때 그 왼쪽에서 도는 별을 함께 다룬다. */
export class NoticeText {
  private readonly star: LoadingStar;
  private isLoading = false;

  constructor(
    scene: Phaser.Scene,
    celestial: CelestialCatalog,
    private readonly text: Phaser.GameObjects.Text,
  ) {
    this.star = new LoadingStar(scene, celestial).setDepth(text.depth);
  }

  show(message: string, isLoading: boolean): void {
    this.text.setText(message);
    this.isLoading = isLoading;
    this.renderStar();
  }

  setPosition(xPx: number, yPx: number, originX: number): void {
    this.text.setPosition(xPx, yPx).setOrigin(originX, 0.5);
    this.renderStar();
  }

  setVisible(isVisible: boolean): void {
    this.text.setVisible(isVisible);
    this.renderStar();
  }

  private renderStar(): void {
    const isSpinning = this.text.visible && this.isLoading && this.text.text !== '';
    this.star.show(isSpinning ? this.text.getBounds() : null);
  }
}
