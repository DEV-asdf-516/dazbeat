import type Phaser from 'phaser';
import type { CelestialAtlasId, CelestialCatalog } from '../celestial/celestialCatalog.js';
import { addCelestialSprite, setCelestialLoopActive } from '../celestial/celestialSprites.js';

/** 씬 preload 목록에 넣어 텍스처를 미리 받는다. */
export const LOADING_STAR_ID: CelestialAtlasId = 'R47';
const LOADING_STAR_GAP_PX = 24;

export interface LoadingStarAnchor {
  readonly left: number;
  readonly centerY: number;
}

/** 로딩 중 문구나 버튼 글자의 왼쪽에서 도는 별. 화면마다 같은 별과 간격을 쓴다. */
export class LoadingStar {
  private readonly sprite: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene, celestial: CelestialCatalog) {
    this.sprite = addCelestialSprite(scene, celestial.atlasPresentations[LOADING_STAR_ID], 0, 0);
    setCelestialLoopActive(this.sprite, false);
  }

  /** anchor 가 있으면 그 왼쪽에서 돌리고, null 이면 멈추고 숨긴다. */
  show(anchor: LoadingStarAnchor | null): void {
    if (anchor !== null) {
      this.sprite.setPosition(anchor.left - LOADING_STAR_GAP_PX, anchor.centerY);
    }
    setCelestialLoopActive(this.sprite, anchor !== null);
  }

  setDepth(depth: number): this {
    this.sprite.setDepth(depth);
    return this;
  }
}
