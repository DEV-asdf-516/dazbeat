import Phaser from 'phaser';
import { clamp, getProgress, lerp } from '../../range.js';
import { createCanvasTexture } from '../ui/canvasTexture.js';
import { LIGHT_TEXTURES, addLight, ensureLightTextures } from '../ui/lightTextures.js';

/** 좌표는 모두 선화(1122×1402) 픽셀 기준이고 크기만 화면 픽셀이다. */
const CORE_TEXTURE_KEY = 'main:constellation-core';
const HALO_TEXTURE_KEY = 'main:constellation-halo';
const BAND_TEXTURE_KEY = 'main:constellation-band';
const TRAIL_TEXTURE_KEY = 'main:constellation-trail';
const SPARKLE_TEXTURE_KEY = 'main:constellation-sparkle';

/** 로고·메뉴보다 앞서 보이지 않도록 선은 흰색이 아닌 옅은 별빛색으로, 불투명도를 낮춰 둔다. */
const CORE_TINT = 0xd4e0ff;
const CORE_ALPHA = 0.66;
const HALO_COLOR = 'rgba(110, 160, 255, 1)';
const HALO_BLUR_PX = 18;
const HALO_PASSES = 2;
const HALO_ALPHA = 0.9;
const GRAIN_CELL_PX = 3;
const GRAIN_MIN_ALPHA = 0.4;
const GRAIN_TILE_PX = 128;
const RANDOM_SEED = 'dazbee-constellation';
const DISSOLVE_START = 0.62;
const DISSOLVE_END_ALPHA = 0.08;

type Star = { x: number; y: number; sizePx: number; color: number };
const STAR_GOLD = 0xf3e2ae;
const STAR_WHITE = 0xe9f2fa;
const STAR_BLUE = 0xacd9f0;
const STAR_LILAC = 0xd9c4f2;
const STARS = {
  ahoge: {
    x: 455,
    y: 30,
    sizePx: 26,
    color: STAR_GOLD,
  },
  crown: {
    x: 592,
    y: 134,
    sizePx: 14,
    color: STAR_WHITE,
  },
  back: {
    x: 830,
    y: 232,
    sizePx: 16,
    color: STAR_BLUE,
  },
  right: {
    x: 987,
    y: 507,
    sizePx: 12,
    color: STAR_WHITE,
  },
  rightBottom: {
    x: 1045,
    y: 700,
    sizePx: 18,
    color: STAR_LILAC,
  },
  bangs: {
    x: 66,
    y: 460,
    sizePx: 14,
    color: STAR_BLUE,
  },
  lash: {
    x: 300,
    y: 636,
    sizePx: 12,
    color: STAR_WHITE,
  },
  nose: {
    x: 204,
    y: 667,
    sizePx: 30,
    color: STAR_GOLD,
  },
  lips: {
    x: 218,
    y: 721,
    sizePx: 10,
    color: STAR_WHITE,
  },
  chin: {
    x: 247,
    y: 799,
    sizePx: 14,
    color: STAR_BLUE,
  },
  ear: {
    x: 573,
    y: 699,
    sizePx: 22,
    color: STAR_LILAC,
  },
  neck: {
    x: 443,
    y: 829,
    sizePx: 12,
    color: STAR_WHITE,
  },
  knot1: {
    x: 420,
    y: 962,
    sizePx: 14,
    color: STAR_BLUE,
  },
  knot2: {
    x: 345,
    y: 1045,
    sizePx: 11,
    color: STAR_WHITE,
  },
  knot3: {
    x: 292,
    y: 1150,
    sizePx: 10,
    color: STAR_LILAC,
  },
  tip: {
    x: 252,
    y: 1360,
    sizePx: 8,
    color: STAR_BLUE,
  },
} as const satisfies Record<string, Star>;
type StarName = keyof typeof STARS;
/** 윤곽을 그대로 따라가지 않고 요점끼리 직선으로 이어 성도의 보조선처럼 보이게 한다. */
const CONSTELLATION_PATHS: readonly (readonly StarName[])[] = [
  ['bangs', 'ahoge', 'crown', 'back', 'right', 'rightBottom'],
  ['lash', 'nose', 'lips', 'chin', 'neck', 'knot1', 'knot2', 'knot3', 'tip'],
  ['crown', 'ear', 'neck'],
];
const LINE_COLOR = 0xbcd0ff;
const LINE_ALPHA = 0.28;
const LINE_WIDTH_PX = 1.5;

const BRIGHT_STAR_MIN_SIZE_PX = 20;
const SPARKLE_SCALE = 2.8;
const SPARKLE_TEXTURE_SIZE_PX = 64;
const DUST_COUNT = 70;
const DUST_SIZE_PX = {
  min: 3,
  max: 7,
} as const;
const DUST_COLORS = [0xe9f2fa, 0xacd9f0, 0xf3e2ae] as const;
const DUST_MIN_SOURCE_ALPHA = 200;
const DUST_MAX_TRIES = 20000;
const STAR_MIN_ALPHA = 0.35;
const STAR_TWINKLE_MS = {
  min: 1800,
  max: 3200,
} as const;
const ENTRY_FADE_MS = 1600;

/** 오른쪽 위에서 얼굴이 바라보는 왼쪽 아래로 흐른다. */
const PASS_DIRECTION = new Phaser.Math.Vector2(-1, 0.62).normalize();
const PASS_DURATION_MS = 2600;
const PASS_INTERVAL_MS = 11000;
const FIRST_PASS_DELAY_MS = 900;
const GLINT_TINT = 0xfff0cf;
const GLINT_ALPHA = 0.95;
const BAND_WIDTH_PX = 360;
const BAND_TEXTURE_SIZE_PX = 64;
const TRAIL_TEXTURE_WIDTH_PX = 256;
const TRAIL_TEXTURE_HEIGHT_PX = 6;
const TRAIL_LENGTH_PX = 320;
const TRAIL_HEAD_SIZE_PX = 22;
/** 유성 경로를 선화 바깥으로 늘여 화면 밖처럼 먼 곳에서 들어와 사라지게 한다. */
const TRAIL_PATH_MARGIN_PX = 260;
const STAR_FLARE_SCALE = 1.9;
const STAR_FLARE_MS = 520;

export function addConstellationFigure(
  scene: Phaser.Scene,
  textureKey: string,
  centerXPx: number,
  centerYPx: number,
  scale: number,
): void {
  const source = scene.textures.get(textureKey).getSourceImage();
  if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) {
    throw new Error(`Line art texture ${textureKey} has no drawable source image`);
  }
  const widthPx = source.width;
  const heightPx = source.height;
  createFigureTextures(scene, source);
  ensureLightTextures(scene);

  const toScene = (xPx: number, yPx: number): Phaser.Math.Vector2 =>
    new Phaser.Math.Vector2(
      centerXPx + (xPx - widthPx / 2) * scale,
      centerYPx + (yPx - heightPx / 2) * scale,
    );

  const halo = scene.add
    .image(centerXPx, centerYPx, HALO_TEXTURE_KEY)
    .setScale(scale)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setAlpha(0);
  const core = scene.add
    .image(centerXPx, centerYPx, CORE_TEXTURE_KEY)
    .setScale(scale)
    .setTint(CORE_TINT)
    .setAlpha(0);
  const lines = scene.add.graphics().setAlpha(0);
  lines.lineStyle(LINE_WIDTH_PX, LINE_COLOR, LINE_ALPHA);
  for (const path of CONSTELLATION_PATHS) {
    lines.strokePoints(
      path.map((name) => toScene(STARS[name].x, STARS[name].y)),
      false,
      false,
    );
  }
  const starEntries = (Object.keys(STARS) as StarName[]).map((name) => {
    const star: Star = STARS[name];
    const position = toScene(star.x, star.y);
    const image = addLight(scene, LIGHT_TEXTURES.star, position.x, position.y)
      .setDisplaySize(star.sizePx, star.sizePx)
      .setTint(star.color);
    const sparkle =
      star.sizePx >= BRIGHT_STAR_MIN_SIZE_PX
        ? scene.add
            .image(position.x, position.y, SPARKLE_TEXTURE_KEY)
            .setBlendMode(Phaser.BlendModes.SCREEN)
            .setDisplaySize(star.sizePx * SPARKLE_SCALE, star.sizePx * SPARKLE_SCALE)
            .setTint(star.color)
        : null;
    return {
      star,
      images: sparkle === null ? [image] : [image, sparkle],
    };
  });
  const random = new Phaser.Math.RandomDataGenerator([RANDOM_SEED]);
  const dust = sampleLinePoints(scene, random).map((point) => {
    const position = toScene(point.x, point.y);
    const sizePx = random.between(DUST_SIZE_PX.min, DUST_SIZE_PX.max);
    return addLight(scene, LIGHT_TEXTURES.star, position.x, position.y)
      .setDisplaySize(sizePx, sizePx)
      .setTint(random.pick([...DUST_COLORS]));
  });
  const twinklers = [...starEntries.map(({ images }) => images), ...dust.map((image) => [image])];

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    halo.setAlpha(HALO_ALPHA);
    core.setAlpha(CORE_ALPHA);
    lines.setAlpha(1);
    return;
  }

  scene.tweens.add({
    targets: core,
    alpha: CORE_ALPHA,
    duration: ENTRY_FADE_MS,
    ease: 'Sine.easeOut',
  });
  scene.tweens.add({
    targets: halo,
    alpha: HALO_ALPHA,
    duration: ENTRY_FADE_MS,
    ease: 'Sine.easeOut',
  });
  scene.tweens.add({
    targets: lines,
    alpha: 1,
    duration: ENTRY_FADE_MS,
    ease: 'Sine.easeOut',
  });
  twinklers.forEach((targets) => {
    scene.tweens.add({
      targets,
      alpha: {
        from: 1,
        to: STAR_MIN_ALPHA,
      },
      duration: random.between(STAR_TWINKLE_MS.min, STAR_TWINKLE_MS.max),
      delay: random.between(0, STAR_TWINKLE_MS.max),
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  });

  // 지나간 자리만 밝히도록 금빛 선화 사본을 진행 방향에 수직인 빛 띠로 가린다.
  const glint = scene.add
    .image(centerXPx, centerYPx, CORE_TEXTURE_KEY)
    .setScale(scale)
    .setTint(GLINT_TINT)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setAlpha(GLINT_ALPHA)
    .setVisible(false);
  const diagonalPx = Math.hypot(widthPx, heightPx);
  // 띠는 가림판으로만 쓰므로 화면 목록에 올리지 않는다.
  // 내부 필터의 가림판은 선화 텍스처 해상도로 그려지므로 위치·크기를 선화 픽셀로 둔다.
  const band = new Phaser.GameObjects.Image(scene, 0, 0, BAND_TEXTURE_KEY)
    .setDisplaySize(BAND_WIDTH_PX, diagonalPx)
    .setRotation(PASS_DIRECTION.angle());
  glint.enableFilters().filters?.internal.addMask(band, false, scene.cameras.main);

  const trail = scene.add
    .image(0, 0, TRAIL_TEXTURE_KEY)
    .setBlendMode(Phaser.BlendModes.SCREEN)
    .setOrigin(1, 0.5)
    .setDisplaySize(TRAIL_LENGTH_PX * scale, TRAIL_TEXTURE_HEIGHT_PX)
    .setRotation(PASS_DIRECTION.angle())
    .setTint(GLINT_TINT)
    .setVisible(false);
  const trailHead = addLight(scene, LIGHT_TEXTURES.star, 0, 0)
    .setDisplaySize(TRAIL_HEAD_SIZE_PX, TRAIL_HEAD_SIZE_PX)
    .setTint(GLINT_TINT)
    .setVisible(false);

  const halfPathPx = diagonalPx / 2 + TRAIL_PATH_MARGIN_PX;
  const projectOnPath = (xPx: number, yPx: number): number =>
    getProgress(
      (xPx - widthPx / 2) * PASS_DIRECTION.x + (yPx - heightPx / 2) * PASS_DIRECTION.y,
      -halfPathPx,
      halfPathPx,
    );
  const passPoint = (progress: number): Phaser.Math.Vector2 => {
    const distancePx = lerp(-halfPathPx, halfPathPx, progress);
    return new Phaser.Math.Vector2(
      widthPx / 2 + PASS_DIRECTION.x * distancePx,
      heightPx / 2 + PASS_DIRECTION.y * distancePx,
    );
  };

  const placePass = (progress: number): void => {
    const point = passPoint(progress);
    band.setPosition(point.x, point.y);
    const scenePoint = toScene(point.x, point.y);
    trail.setPosition(scenePoint.x, scenePoint.y);
    trailHead.setPosition(scenePoint.x, scenePoint.y);
  };

  const playPass = (): void => {
    const pass = { progress: 0 };
    // 트윈의 첫 onUpdate 전에 보이면 빛 띠가 원점(머리 앞쪽)에 놓인 채 한 프레임 그려져 번쩍인다.
    placePass(0);
    glint.setVisible(true);
    trail.setVisible(true).setAlpha(1);
    trailHead.setVisible(true).setAlpha(1);
    scene.tweens.add({
      targets: pass,
      progress: 1,
      duration: PASS_DURATION_MS,
      ease: 'Sine.easeInOut',
      onUpdate: () => placePass(pass.progress),
      onComplete: () => {
        glint.setVisible(false);
        trail.setVisible(false);
        trailHead.setVisible(false);
      },
    });
    starEntries.forEach(({ star, images }) => {
      const delayMs = easeInOutSineInverse(projectOnPath(star.x, star.y)) * PASS_DURATION_MS;
      images.forEach((image) => {
        scene.tweens.add({
          targets: image,
          scale: image.scaleX * STAR_FLARE_SCALE,
          duration: STAR_FLARE_MS / 2,
          delay: delayMs,
          ease: 'Quad.easeOut',
          yoyo: true,
        });
      });
    });
  };
  scene.time.delayedCall(FIRST_PASS_DELAY_MS, () => {
    playPass();
    scene.time.addEvent({
      delay: PASS_INTERVAL_MS,
      loop: true,
      callback: playPass,
    });
  });
}

/** 유성이 Sine.easeInOut 으로 움직이므로, 경로상 위치에 닿는 시각 비율을 되돌려 구한다. */
function easeInOutSineInverse(progress: number): number {
  const clamped = clamp(progress, 0, 1);
  return Math.acos(1 - 2 * clamped) / Math.PI;
}

function createFigureTextures(
  scene: Phaser.Scene,
  source: HTMLImageElement | HTMLCanvasElement,
): void {
  const widthPx = source.width;
  const heightPx = source.height;
  createCanvasTexture(scene, CORE_TEXTURE_KEY, widthPx, heightPx, (context) => {
    context.drawImage(source, 0, 0);
    dissolveBottom(context, widthPx, heightPx);
    applyGrain(context, widthPx, heightPx);
  });
  createCanvasTexture(scene, HALO_TEXTURE_KEY, widthPx, heightPx, (context) => {
    // 선 자체는 캔버스 밖에 그리고 그림자만 제자리에 떨어뜨려 번짐만 남긴다.
    context.shadowColor = HALO_COLOR;
    context.shadowBlur = HALO_BLUR_PX;
    context.shadowOffsetX = widthPx;
    for (let pass = 0; pass < HALO_PASSES; pass++) {
      context.drawImage(source, -widthPx, 0);
    }
    dissolveBottom(context, widthPx, heightPx);
  });
  createCanvasTexture(
    scene,
    BAND_TEXTURE_KEY,
    BAND_TEXTURE_SIZE_PX,
    BAND_TEXTURE_SIZE_PX,
    (context) => {
      const gradient = context.createLinearGradient(0, 0, BAND_TEXTURE_SIZE_PX, 0);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
      gradient.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, BAND_TEXTURE_SIZE_PX, BAND_TEXTURE_SIZE_PX);
    },
  );
  createCanvasTexture(
    scene,
    SPARKLE_TEXTURE_KEY,
    SPARKLE_TEXTURE_SIZE_PX,
    SPARKLE_TEXTURE_SIZE_PX,
    (context) => {
      const center = SPARKLE_TEXTURE_SIZE_PX / 2;
      const ray = context.createLinearGradient(0, 0, SPARKLE_TEXTURE_SIZE_PX, 0);
      ray.addColorStop(0, 'rgba(255, 255, 255, 0)');
      ray.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
      ray.addColorStop(1, 'rgba(255, 255, 255, 0)');
      context.fillStyle = ray;
      context.fillRect(0, center - 1, SPARKLE_TEXTURE_SIZE_PX, 2);
      context.translate(center, center);
      context.rotate(Math.PI / 2);
      context.translate(-center, -center);
      context.fillRect(0, center - 1, SPARKLE_TEXTURE_SIZE_PX, 2);
    },
  );
  createCanvasTexture(
    scene,
    TRAIL_TEXTURE_KEY,
    TRAIL_TEXTURE_WIDTH_PX,
    TRAIL_TEXTURE_HEIGHT_PX,
    (context) => {
      const along = context.createLinearGradient(0, 0, TRAIL_TEXTURE_WIDTH_PX, 0);
      along.addColorStop(0, 'rgba(255, 255, 255, 0)');
      along.addColorStop(0.85, 'rgba(255, 255, 255, 0.55)');
      along.addColorStop(1, 'rgba(255, 255, 255, 1)');
      context.fillStyle = along;
      context.fillRect(0, 0, TRAIL_TEXTURE_WIDTH_PX, TRAIL_TEXTURE_HEIGHT_PX);
      const across = context.createLinearGradient(0, 0, 0, TRAIL_TEXTURE_HEIGHT_PX);
      across.addColorStop(0, 'rgba(255, 255, 255, 0)');
      across.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
      across.addColorStop(1, 'rgba(255, 255, 255, 0)');
      context.globalCompositeOperation = 'destination-in';
      context.fillStyle = across;
      context.fillRect(0, 0, TRAIL_TEXTURE_WIDTH_PX, TRAIL_TEXTURE_HEIGHT_PX);
    },
  );
}

function sampleLinePoints(
  scene: Phaser.Scene,
  random: Phaser.Math.RandomDataGenerator,
): Phaser.Math.Vector2[] {
  const canvas = scene.textures.get(CORE_TEXTURE_KEY).getSourceImage();
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`Texture ${CORE_TEXTURE_KEY} is not a canvas`);
  }
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error(`Texture ${CORE_TEXTURE_KEY} has no 2D context`);
  }
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  const maxYPx = Math.floor(height * DISSOLVE_START);
  const points: Phaser.Math.Vector2[] = [];
  for (let tries = 0; tries < DUST_MAX_TRIES && points.length < DUST_COUNT; tries++) {
    const xPx = random.between(0, width - 1);
    const yPx = random.between(0, maxYPx);
    const alpha = pixels[(yPx * width + xPx) * 4 + 3] ?? 0;
    if (alpha >= DUST_MIN_SOURCE_ALPHA) {
      points.push(new Phaser.Math.Vector2(xPx, yPx));
    }
  }
  return points;
}

function applyGrain(context: CanvasRenderingContext2D, widthPx: number, heightPx: number): void {
  const random = new Phaser.Math.RandomDataGenerator([RANDOM_SEED]);
  const tile = document.createElement('canvas');
  tile.width = GRAIN_TILE_PX;
  tile.height = GRAIN_TILE_PX;
  const tileContext = tile.getContext('2d');
  if (tileContext === null) {
    throw new Error('Failed to create grain tile context');
  }
  const noise = tileContext.createImageData(GRAIN_TILE_PX, GRAIN_TILE_PX);
  for (let index = 0; index < GRAIN_TILE_PX * GRAIN_TILE_PX; index++) {
    noise.data.set(
      [255, 255, 255, Math.round(random.realInRange(GRAIN_MIN_ALPHA, 1) * 255)],
      index * 4,
    );
  }
  tileContext.putImageData(noise, 0, 0);
  const pattern = context.createPattern(tile, 'repeat');
  if (pattern === null) {
    throw new Error('Failed to create grain pattern');
  }
  context.save();
  context.globalCompositeOperation = 'destination-in';
  context.scale(GRAIN_CELL_PX, GRAIN_CELL_PX);
  context.imageSmoothingEnabled = false;
  context.fillStyle = pattern;
  context.fillRect(0, 0, widthPx / GRAIN_CELL_PX, heightPx / GRAIN_CELL_PX);
  context.restore();
}

function dissolveBottom(
  context: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
): void {
  const gradient = context.createLinearGradient(0, 0, 0, heightPx);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(DISSOLVE_START, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(1, `rgba(255, 255, 255, ${DISSOLVE_END_ALPHA})`);
  context.save();
  context.globalCompositeOperation = 'destination-in';
  context.fillStyle = gradient;
  context.fillRect(0, 0, widthPx, heightPx);
  context.restore();
}
