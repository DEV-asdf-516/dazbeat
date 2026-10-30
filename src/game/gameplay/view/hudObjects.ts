import type Phaser from 'phaser';
import type { CelestialAtlasId, CelestialCatalog } from '../../celestial/state/celestialCatalog.js';
import { addCelestialSprite } from '../../celestial/view/celestialSprites.js';
import { rgba } from '../../ui/view/textures/lightTextures.js';
import { COLORS, GAMEPLAY_DEPTH } from '../../ui/view/theme.js';

export const HUD_SHADOW_COLOR = 0x04060c;
const HUD_OUTLINE_PX = 4;
const HUD_OUTLINE_ALPHA = 0.6;
const HUD_SHADOW_OFFSET_Y_PX = 2;
const HUD_SHADOW_BLUR_PX = 4;
const HUD_SHADOW_ALPHA = 0.7;

// 라벨을 회색으로 물리면 밝은 MV 와 일시정지 막 위에서 모두 묻혀, 색은 밝게 두고 굵기와 자간으로 숫자와 구분한다.
export const HUD_LABEL = {
  color: COLORS.noteShade,
  weight: 600,
  letterSpacingPx: 1.5,
} as const;

// 밝은 MV 위에서도 글자 가장자리가 읽히도록 어두운 외곽선과 아래로 비킨 그림자를 두른다.
export function withHudOutline(
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    ...style,
    stroke: rgba(HUD_SHADOW_COLOR, HUD_OUTLINE_ALPHA),
    strokeThickness: HUD_OUTLINE_PX,
    shadow: {
      offsetX: 0,
      offsetY: HUD_SHADOW_OFFSET_Y_PX,
      color: rgba(HUD_SHADOW_COLOR, HUD_SHADOW_ALPHA),
      blur: HUD_SHADOW_BLUR_PX,
      stroke: true,
      fill: false,
    },
  };
}

export function addHudText(
  scene: Phaser.Scene,
  xPx: number,
  yPx: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
  return scene.add.text(xPx, yPx, text, style).setOrigin(0.5).setDepth(GAMEPLAY_DEPTH.text);
}

export function addHudEffect(
  scene: Phaser.Scene,
  celestial: CelestialCatalog,
  id: CelestialAtlasId,
  xPx: number,
  yPx: number,
  phaseFraction?: number,
): Phaser.GameObjects.Sprite {
  return addCelestialSprite(
    scene,
    celestial.atlasPresentations[id],
    xPx,
    yPx,
    phaseFraction,
  ).setDepth(GAMEPLAY_DEPTH.text);
}
