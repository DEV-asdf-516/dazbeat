import Phaser from 'phaser';
import { addBakedRoundedRect } from '../textures/bakedTexture.js';
import { getBrushRectTexture } from '../textures/brushRect.js';
import { CELESTIAL_COLORS, MODAL } from '../theme.js';

// 패널 색 위에 흰빛을 옅게 얹어 질감만 더한다. 그 아래 단색 패널이 뒤 화면을 가린다.
export const PANEL_GRAIN_ALPHA = 0.06;

export class ModalPanel {
  readonly objects: readonly Phaser.GameObjects.GameObject[];
  private readonly scene: Phaser.Scene;
  private readonly shadow: Phaser.GameObjects.NineSlice;
  private readonly panel: Phaser.GameObjects.NineSlice;
  private readonly grain: Phaser.GameObjects.Image;
  private readonly hitArea = new Phaser.Geom.Rectangle();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.shadow = addBakedRoundedRect(scene, MODAL.shadowOffsetXPx, MODAL.shadowOffsetYPx, {
      widthPx: 0,
      heightPx: 0,
      radiusPx: MODAL.panelRadiusPx,
      fillColor: MODAL.shadowColor,
      fillAlpha: MODAL.shadowAlpha,
      border: null,
    }).setOrigin(0, 0);
    // 판 안 클릭이 막으로 가 모달이 닫히지 않도록 판도 입력을 받는다.
    this.panel = addBakedRoundedRect(scene, 0, 0, {
      widthPx: 0,
      heightPx: 0,
      radiusPx: MODAL.panelRadiusPx,
      fillColor: MODAL.panelColor,
      fillAlpha: 1,
      border: null,
    })
      .setOrigin(0, 0)
      .setInteractive(this.hitArea, (hitArea: Phaser.Geom.Rectangle, x: number, y: number) =>
        Phaser.Geom.Rectangle.Contains(hitArea, x, y),
      );
    this.grain = scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0);
    this.objects = [this.shadow, this.panel, this.grain];
  }

  setSize(widthPx: number, heightPx: number): void {
    this.panel.setSize(widthPx, heightPx);
    this.grain.setTexture(
      getBrushRectTexture(this.scene, {
        widthPx,
        heightPx,
        radiusPx: MODAL.panelRadiusPx,
        fillColor: CELESTIAL_COLORS.highlight,
        fillAlpha: PANEL_GRAIN_ALPHA,
        border: null,
      }),
    );
    this.hitArea.setTo(0, 0, widthPx, heightPx);
    this.shadow.setSize(widthPx, heightPx);
  }
}
