import Phaser from 'phaser';
import { LIGHT_TEXTURES, addLight, ensureLightTextures } from '../ui/lightTextures.js';

/**
 * 기도하는 캐릭터의 얼굴에 내려앉는 우주빛.
 * 둥근 glow 를 덮으면 원화가 뿌옇게 흐려지므로, 원화 픽셀 자체에 색을 입혀 붓터치를 따라 빛이 맺히게 하고
 * 앞쪽 윤곽에 가는 림 라이트를 더한다. 빛은 얼굴에서 가장 밝고 몸통으로 내려가며 옅어진다.
 * 좌표는 모두 원화(1280×1600) 픽셀 기준이다.
 */
const FACE_LIGHT_TEXTURE_KEY = 'main:character-face-light';
const RIM_LIGHT_TEXTURE_KEY = 'main:character-rim-light';
/** 머리부터 화면에 보이는 몸통 아래까지만 잘라 빛 텍스처를 작게 만든다. */
const LIGHT_REGION_PX = { x: 160, y: 120, width: 840, height: 1400 } as const;
/** 얼굴이 바라보는 왼쪽 위 하늘에서 빛이 오는 것처럼 이마 앞쪽에 중심을 둔다. */
const LIGHT_CENTER_PX = { x: 430, y: 330 } as const;
const LIGHT_RADIUS_PX = 360;
/** 가로 번짐은 얼굴 둘레에 두고 세로로만 늘여 빛이 끊기지 않고 몸통까지 흘러내리게 한다. */
const LIGHT_VERTICAL_STRETCH = 2.6;
type GradientStops = readonly (readonly [offset: number, color: string])[];
const FACE_LIGHT_STOPS: GradientStops = [
  [0, 'rgba(150, 195, 255, 0.3)'],
  [0.4, 'rgba(105, 155, 255, 0.2)'],
  [0.75, 'rgba(90, 115, 240, 0.08)'],
  [1, 'rgba(90, 115, 240, 0)'],
];
/** 윤곽을 이만큼 밀어 빼면 빛을 받는 앞쪽(왼쪽 위) 가장자리만 남는다. */
const RIM_SHIFT_PX = { x: 7, y: 4 } as const;
const RIM_LIGHT_STOPS: GradientStops = [
  [0, 'rgba(170, 215, 255, 0.85)'],
  [0.55, 'rgba(115, 175, 255, 0.65)'],
  [1, 'rgba(115, 175, 255, 0)'],
];
const FACE_LIGHT_BREATH_MS = 4200;
const FACE_LIGHT_MIN_ALPHA = 0.7;
/** 시선 앞 공간에 고정해 둔 별가루. 위치는 원화 픽셀, 크기는 화면 픽셀이다. */
const STARDUST = [
  { x: 300, y: 150, sizePx: 14, color: 0xf3e2ae },
  { x: 190, y: 250, sizePx: 9, color: 0xe9f2fa },
  { x: 260, y: 330, sizePx: 18, color: 0xacd9f0 },
  { x: 140, y: 410, sizePx: 8, color: 0xd9c4f2 },
  { x: 230, y: 500, sizePx: 11, color: 0xe9f2fa },
  { x: 120, y: 160, sizePx: 7, color: 0xacd9f0 },
] as const;
const STARDUST_MIN_ALPHA = 0.25;
const STARDUST_TWINKLE_MS = { min: 1600, max: 2800 } as const;

export function addCosmicLight(scene: Phaser.Scene, character: Phaser.GameObjects.Image): void {
  const source = scene.textures.get(character.texture.key).getSourceImage();
  if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) {
    throw new Error(`Character texture ${character.texture.key} has no drawable source image`);
  }
  createRegionTexture(scene, FACE_LIGHT_TEXTURE_KEY, (context) => {
    context.drawImage(source, -LIGHT_REGION_PX.x, -LIGHT_REGION_PX.y);
    fillLightGradient(context, FACE_LIGHT_STOPS);
  });
  createRegionTexture(scene, RIM_LIGHT_TEXTURE_KEY, (context) => {
    context.drawImage(source, -LIGHT_REGION_PX.x, -LIGHT_REGION_PX.y);
    context.globalCompositeOperation = 'destination-out';
    context.drawImage(
      source,
      RIM_SHIFT_PX.x - LIGHT_REGION_PX.x,
      RIM_SHIFT_PX.y - LIGHT_REGION_PX.y,
    );
    fillLightGradient(context, RIM_LIGHT_STOPS);
  });

  const toScene = (xPx: number, yPx: number): Phaser.Math.Vector2 =>
    new Phaser.Math.Vector2(
      character.x + (xPx - character.width * character.originX) * character.scaleX,
      character.y + (yPx - character.height * character.originY) * character.scaleY,
    );
  const regionOrigin = toScene(LIGHT_REGION_PX.x, LIGHT_REGION_PX.y);
  const addRegionLight = (key: string): Phaser.GameObjects.Image =>
    scene.add
      .image(regionOrigin.x, regionOrigin.y, key)
      .setOrigin(0, 0)
      .setScale(character.scaleX, character.scaleY)
      .setBlendMode(Phaser.BlendModes.ADD);
  const faceLight = addRegionLight(FACE_LIGHT_TEXTURE_KEY);
  addRegionLight(RIM_LIGHT_TEXTURE_KEY);

  ensureLightTextures(scene);
  const stars = STARDUST.map((dust) => {
    const position = toScene(dust.x, dust.y);
    return addLight(scene, LIGHT_TEXTURES.star, position.x, position.y)
      .setDisplaySize(dust.sizePx, dust.sizePx)
      .setTint(dust.color);
  });

  // 움직임 줄이기를 켠 사용자에게는 빛을 고정된 밝기로만 보여 준다.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  scene.tweens.add({
    targets: faceLight,
    alpha: { from: 1, to: FACE_LIGHT_MIN_ALPHA },
    duration: FACE_LIGHT_BREATH_MS,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
  });
  stars.forEach((star, index) => {
    scene.tweens.add({
      targets: star,
      alpha: { from: 1, to: STARDUST_MIN_ALPHA },
      duration: Phaser.Math.Between(STARDUST_TWINKLE_MS.min, STARDUST_TWINKLE_MS.max),
      // 별마다 반짝임 시작을 엇갈려 한꺼번에 깜빡이지 않게 한다.
      delay: (STARDUST_TWINKLE_MS.max / STARDUST.length) * index,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  });
}

/** 원화에서 LIGHT_REGION_PX 만큼 잘라 그린 캔버스 텍스처를 한 번만 만든다. */
function createRegionTexture(
  scene: Phaser.Scene,
  key: string,
  paint: (context: CanvasRenderingContext2D) => void,
): void {
  if (scene.textures.exists(key)) {
    return;
  }
  const texture = scene.textures.createCanvas(key, LIGHT_REGION_PX.width, LIGHT_REGION_PX.height);
  if (texture === null) {
    throw new Error(`Failed to create canvas texture ${key}`);
  }
  paint(texture.getContext());
  texture.refresh();
}

/** 이미 그려진 픽셀 모양 그대로 빛 색을 입힌다. */
function fillLightGradient(context: CanvasRenderingContext2D, stops: GradientStops): void {
  const centerX = LIGHT_CENTER_PX.x - LIGHT_REGION_PX.x;
  const centerY = LIGHT_CENTER_PX.y - LIGHT_REGION_PX.y;
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, LIGHT_RADIUS_PX);
  for (const [offset, color] of stops) {
    gradient.addColorStop(offset, color);
  }
  context.save();
  context.translate(centerX, centerY);
  context.scale(1, LIGHT_VERTICAL_STRETCH);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = gradient;
  // 늘인 좌표계에서도 캔버스 전체를 덮어야 source-in 이 그라데이션 밖 픽셀을 남기지 않는다.
  context.fillRect(
    -centerX,
    -centerY / LIGHT_VERTICAL_STRETCH,
    LIGHT_REGION_PX.width,
    LIGHT_REGION_PX.height / LIGHT_VERTICAL_STRETCH,
  );
  context.restore();
}
