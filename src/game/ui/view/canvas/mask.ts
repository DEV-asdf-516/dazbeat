import Phaser from 'phaser';
import { getTintedFrameImage } from './tint.js';

function requireSourceImage(
  frame: Phaser.Textures.Frame,
): Phaser.Types.Textures.TextureSourceElement {
  const { image } = frame.source;
  if (image === null) {
    throw new Error('Mask texture source has no image');
  }
  return image;
}

// WebGL 렌더러는 renderCanvas 를 부르지 않고 Canvas 렌더러에서는 enableFilters 가 아무것도 하지 않으므로 렌더러를 묻지 않고 둘 다 건다.
// 마스크는 이미지의 텍스처 픽셀 좌표에 놓이고 원점은 가운데다(WebGL 내부 필터 마스크와 같은 의미).
export function maskImage(
  image: Phaser.GameObjects.Image,
  mask: Phaser.GameObjects.Image,
  camera: Phaser.Cameras.Scene2D.Camera,
): void {
  image.enableFilters().filters?.internal.addMask(mask, false, camera);
  if (!('renderCanvas' in image)) {
    throw new Error('Phaser image has no renderCanvas');
  }
  let buffer: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null = null;
  image.renderCanvas = (
    renderer: Phaser.Renderer.Canvas.CanvasRenderer,
    src: Phaser.GameObjects.Image,
    renderCamera: Phaser.Cameras.Scene2D.Camera,
    parentMatrix?: Phaser.GameObjects.Components.TransformMatrix,
  ): void => {
    const ctx = renderer.currentContext;
    if (!Phaser.Renderer.Canvas.SetTransform(renderer, ctx, src, renderCamera, parentMatrix)) {
      return;
    }
    renderCamera.addToRenderList(src);
    const { frame } = src;
    const source = src.isTinted ? getTintedFrameImage(frame, src) : requireSourceImage(frame);
    const maskWidthPx = Math.ceil(mask.displayWidth);
    const maskHeightPx = Math.ceil(mask.displayHeight);
    if (buffer === null) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (context === null) {
        throw new Error('Failed to create mask buffer context');
      }
      buffer = {
        canvas,
        context,
      };
    }
    const { canvas, context } = buffer;
    if (canvas.width !== maskWidthPx || canvas.height !== maskHeightPx) {
      canvas.width = maskWidthPx;
      canvas.height = maskHeightPx;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'copy';
    context.drawImage(
      requireSourceImage(mask.frame),
      mask.frame.cutX,
      mask.frame.cutY,
      mask.frame.cutWidth,
      mask.frame.cutHeight,
      0,
      0,
      maskWidthPx,
      maskHeightPx,
    );
    context.globalCompositeOperation = 'source-in';
    // 이미지 텍스처 픽셀 → 마스크 좌표: 마스크 가운데로 옮기고 마스크 회전을 되돌린다.
    context.translate(maskWidthPx / 2, maskHeightPx / 2);
    context.rotate(-mask.rotation);
    context.translate(-mask.x, -mask.y);
    context.drawImage(
      source,
      frame.cutX,
      frame.cutY,
      frame.cutWidth,
      frame.cutHeight,
      0,
      0,
      frame.cutWidth,
      frame.cutHeight,
    );
    ctx.translate(-src.displayOriginX, -src.displayOriginY);
    ctx.translate(mask.x, mask.y);
    ctx.rotate(mask.rotation);
    ctx.drawImage(canvas, -maskWidthPx / 2, -maskHeightPx / 2);
    ctx.restore();
  };
}
