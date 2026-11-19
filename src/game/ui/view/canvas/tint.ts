import type Phaser from 'phaser';
import { getProgress, lerp } from '../../../../range.js';
import { PIXEL_CHANNEL, getPixelIndex } from '../textures/imagePixels.js';

// Phaser 타입 선언에는 Canvas 렌더러가 게임 객체마다 부르는 renderCanvas 가 없다.
export type CanvasRender<T> = (
  renderer: Phaser.Renderer.Canvas.CanvasRenderer,
  src: T,
  camera: Phaser.Cameras.Scene2D.Camera,
  parentMatrix?: Phaser.GameObjects.Components.TransformMatrix,
) => void;

export type TintCorners = Pick<
  Phaser.GameObjects.Components.Tint,
  'tintTopLeft' | 'tintTopRight' | 'tintBottomLeft' | 'tintBottomRight'
>;

interface PixelRect {
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
}

type FrameTinted = TintCorners & { isTinted: boolean; frame: Phaser.Textures.Frame };

// 칸 목록 배열 자체가 사본을 찾는 키라 프레임·글꼴마다 한 번만 만든다.
const frameRects = new WeakMap<Phaser.Textures.Frame, readonly PixelRect[]>();
const glyphRects = new WeakMap<Phaser.Textures.Frame, readonly PixelRect[]>();
const tintedCopies = new WeakMap<
  Phaser.Textures.TextureSource,
  Map<readonly PixelRect[], Map<string, HTMLCanvasElement>>
>();

function getFrameRects(frame: Phaser.Textures.Frame): readonly PixelRect[] {
  const cached = frameRects.get(frame);
  if (cached !== undefined) {
    return cached;
  }
  const rects = [
    {
      x: frame.cutX,
      y: frame.cutY,
      widthPx: frame.cutWidth,
      heightPx: frame.cutHeight,
    },
  ];
  frameRects.set(frame, rects);
  return rects;
}

function getGlyphRects(
  fontFrame: Phaser.Textures.Frame,
  fontData: Phaser.Types.GameObjects.BitmapText.BitmapFontData,
): readonly PixelRect[] {
  const cached = glyphRects.get(fontFrame);
  if (cached !== undefined) {
    return cached;
  }
  const rects = Object.values(fontData.chars)
    .filter((glyph) => glyph.width > 0 && glyph.height > 0)
    .map((glyph) => ({
      x: fontFrame.cutX + glyph.x,
      y: fontFrame.cutY + glyph.y,
      widthPx: glyph.width,
      heightPx: glyph.height,
    }));
  glyphRects.set(fontFrame, rects);
  return rects;
}

function multiplyRect(pixels: ImageData, rect: PixelRect, corners: TintCorners): void {
  const { width, height, data } = pixels;
  // Text 칸은 높이가 소수라 칸이 걸친 픽셀까지 곱하되 캔버스 밖은 건드리지 않는다. 보간 비율은 잘라낸 범위가 아니라 원래 칸 기준이다.
  const left = Math.max(0, Math.floor(rect.x));
  const top = Math.max(0, Math.floor(rect.y));
  const right = Math.min(width, Math.ceil(rect.x + rect.widthPx));
  const bottom = Math.min(height, Math.ceil(rect.y + rect.heightPx));
  for (let row = top; row < bottom; row++) {
    const t = getProgress(row + 0.5, rect.y, rect.y + rect.heightPx);
    for (let col = left; col < right; col++) {
      const s = getProgress(col + 0.5, rect.x, rect.x + rect.widthPx);
      const index = getPixelIndex(col, row, width);
      for (let channel = PIXEL_CHANNEL.red; channel <= PIXEL_CHANNEL.blue; channel++) {
        const shift = 16 - channel * 8;
        const tint = lerp(
          lerp((corners.tintTopLeft >> shift) & 0xff, (corners.tintTopRight >> shift) & 0xff, s),
          lerp(
            (corners.tintBottomLeft >> shift) & 0xff,
            (corners.tintBottomRight >> shift) & 0xff,
            s,
          ),
          t,
        );
        data[index + channel] = Math.round(((data[index + channel] ?? 0) * tint) / 255);
      }
    }
  }
}

function bakeTintedCopy(
  source: Phaser.Textures.TextureSource,
  rects: readonly PixelRect[],
  corners: TintCorners,
): HTMLCanvasElement {
  const image = source.image;
  if (image === null) {
    throw new Error('Tinted texture source has no image');
  }
  // Text 소스의 width·height 는 소수일 수 있어 원본 이미지의 정수 크기를 쓴다.
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('Failed to create tinted copy context');
  }
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  rects.forEach((rect) => multiplyRect(pixels, rect, corners));
  context.putImageData(pixels, 0, 0);
  return canvas;
}

export function getTintedImage(
  source: Phaser.Textures.TextureSource,
  rects: readonly PixelRect[],
  corners: TintCorners,
): HTMLCanvasElement {
  let byRects = tintedCopies.get(source);
  if (byRects === undefined) {
    byRects = new Map();
    tintedCopies.set(source, byRects);
  }
  let byCorners = byRects.get(rects);
  if (byCorners === undefined) {
    byCorners = new Map();
    byRects.set(rects, byCorners);
  }
  const cornersKey = `${corners.tintTopLeft},${corners.tintTopRight},${corners.tintBottomLeft},${corners.tintBottomRight}`;
  const cached = byCorners.get(cornersKey);
  if (cached !== undefined) {
    return cached;
  }
  const copy = bakeTintedCopy(source, rects, corners);
  byCorners.set(cornersKey, copy);
  return copy;
}

export function getTintedFrameImage(
  frame: Phaser.Textures.Frame,
  corners: TintCorners,
): HTMLCanvasElement {
  return getTintedImage(frame.source, getFrameRects(frame), corners);
}

// 원본 image 를 사본으로 잠깐 바꿔 Phaser 의 원래 Canvas 그리기(배치·뒤집기·자르기·글자 배치)를 그대로 쓴다.
function renderWithImage(
  source: Phaser.Textures.TextureSource,
  image: HTMLCanvasElement,
  render: () => void,
): void {
  const originalImage = source.image;
  source.image = image;
  try {
    render();
  } finally {
    source.image = originalImage;
  }
}

export function tintFrameRender<T extends FrameTinted>(original: CanvasRender<T>): CanvasRender<T> {
  return (renderer, src, camera, parentMatrix) => {
    if (!src.isTinted) {
      original(renderer, src, camera, parentMatrix);
      return;
    }
    const { frame } = src;
    renderWithImage(frame.source, getTintedFrameImage(frame, src), () =>
      original(renderer, src, camera, parentMatrix),
    );
  };
}

// WebGL 이 글자 사각형마다 꼭짓점 색을 거는 것과 같게 글자 칸마다 4색을 곱한다.
export function tintGlyphRender(
  original: CanvasRender<Phaser.GameObjects.BitmapText>,
): CanvasRender<Phaser.GameObjects.BitmapText> {
  return (renderer, src, camera, parentMatrix) => {
    if (!src.isTinted) {
      original(renderer, src, camera, parentMatrix);
      return;
    }
    const fontFrame = src.fromAtlas ? src.frame : src.texture.get('__BASE');
    const image = getTintedImage(fontFrame.source, getGlyphRects(fontFrame, src.fontData), src);
    renderWithImage(fontFrame.source, image, () => original(renderer, src, camera, parentMatrix));
  };
}

// Text 는 updateText 가 글자 캔버스와 프레임 크기를 다시 정하므로 그 소스의 사본과 칸을 버린다.
export function forgetTintOnTextUpdate(
  original: (this: Phaser.GameObjects.Text) => Phaser.GameObjects.Text,
): (this: Phaser.GameObjects.Text) => Phaser.GameObjects.Text {
  return function (this: Phaser.GameObjects.Text) {
    const text = original.call(this);
    tintedCopies.delete(this.frame.source);
    frameRects.delete(this.frame);
    return text;
  };
}
