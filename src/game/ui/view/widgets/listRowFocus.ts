import type Phaser from 'phaser';
import type {
  CelestialAtlasPresentation,
  CelestialStaticPresentation,
} from '../../../celestial/state/celestialCatalog.js';
import {
  addCelestialSprite,
  applyCelestialPresentation,
  setCelestialLoopActive,
} from '../../../celestial/view/celestialSprites.js';
import { MOTION } from '../../state/motion.js';
import { LIST_ROW, RADIUS } from '../theme.js';

export interface ListRowMarkerLayout {
  readonly topYPx: number;
  readonly heightPx: number;
  readonly nodeXPx: number;
  readonly fillXPx: number;
  readonly fillWidthPx: number;
}

export interface ListRowMarkerView {
  readonly node: CelestialStaticPresentation;
  readonly isSelected: boolean;
}

export class ListRowMarker {
  readonly nodeXPx: number;
  readonly nodeYPx: number;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly node: Phaser.GameObjects.Sprite;

  constructor(
    scene: Phaser.Scene,
    layout: ListRowMarkerLayout,
    initialNode: CelestialAtlasPresentation,
  ) {
    const { insetYPx, color, alpha } = LIST_ROW.selectedFill;
    this.nodeXPx = layout.nodeXPx;
    this.nodeYPx = layout.topYPx + layout.heightPx / 2;
    this.fill = scene.add
      .rectangle(
        layout.fillXPx,
        layout.topYPx + insetYPx,
        layout.fillWidthPx,
        layout.heightPx - insetYPx * 2,
        color,
        alpha,
      )
      .setOrigin(0, 0)
      .setRounded(RADIUS.smallPx)
      .setVisible(false);
    this.node = addCelestialSprite(scene, initialNode, this.nodeXPx, this.nodeYPx);
  }

  render(view: ListRowMarkerView | null): void {
    this.fill.setVisible(view?.isSelected === true);
    this.node.setVisible(view !== null);
    if (view !== null) {
      applyCelestialPresentation(this.node, view.node);
    }
  }

  getVisuals(): readonly Phaser.GameObjects.GameObject[] {
    return [this.fill, this.node];
  }
}

export class SelectedRowHalo {
  readonly sprite: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene, presentation: CelestialAtlasPresentation) {
    this.sprite = addCelestialSprite(scene, presentation, 0, 0);
  }

  render(marker: ListRowMarker | null): void {
    if (marker !== null) {
      this.sprite.setPosition(marker.nodeXPx, marker.nodeYPx);
    }
    setCelestialLoopActive(this.sprite, marker !== null);
  }
}

export function slideSelectedRowContent(
  scene: Phaser.Scene,
  content: Phaser.GameObjects.Components.Transform,
  restXPx: number,
  isSelected: boolean,
): void {
  scene.tweens.killTweensOf(content);
  scene.tweens.add({
    targets: content,
    x: restXPx + (isSelected ? LIST_ROW.selectedShiftPx : 0),
    duration: MOTION.fastMs,
    ease: 'Cubic.Out',
  });
}
