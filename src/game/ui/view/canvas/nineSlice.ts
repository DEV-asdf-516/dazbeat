import Phaser from 'phaser';

interface AxisSlice {
  readonly sourcePx: number;
  readonly sourceSizePx: number;
  readonly targetPx: number;
  readonly targetSizePx: number;
}

function sliceAxis(
  startPx: number,
  endPx: number,
  sourceTotalPx: number,
  targetTotalPx: number,
): readonly AxisSlice[] {
  const start = {
    sourcePx: 0,
    sourceSizePx: startPx,
    targetPx: 0,
    targetSizePx: startPx,
  };
  const middle = {
    sourcePx: startPx,
    sourceSizePx: sourceTotalPx - startPx - endPx,
    targetPx: startPx,
    targetSizePx: targetTotalPx - startPx - endPx,
  };
  const end = {
    sourcePx: sourceTotalPx - endPx,
    sourceSizePx: endPx,
    targetPx: targetTotalPx - endPx,
    targetSizePx: endPx,
  };
  return [start, middle, end];
}

export function renderNineSliceCanvas(
  renderer: Phaser.Renderer.Canvas.CanvasRenderer,
  src: Phaser.GameObjects.NineSlice,
  camera: Phaser.Cameras.Scene2D.Camera,
  parentMatrix?: Phaser.GameObjects.Components.TransformMatrix,
): void {
  const ctx = renderer.currentContext;
  if (!Phaser.Renderer.Canvas.SetTransform(renderer, ctx, src, camera, parentMatrix)) {
    return;
  }
  camera.addToRenderList(src);
  const { frame, leftWidth, rightWidth, width, height } = src;
  const image = frame.source.image;
  if (image === null) {
    throw new Error('NineSlice texture source has no image');
  }
  const topHeight = src.is3Slice ? 0 : src.topHeight;
  const bottomHeight = src.is3Slice ? 0 : src.bottomHeight;
  const { cutX, cutY, cutWidth, cutHeight } = frame;
  ctx.translate(-src.displayOriginX, -src.displayOriginY);
  const rows = sliceAxis(topHeight, bottomHeight, cutHeight, height);
  const cols = sliceAxis(leftWidth, rightWidth, cutWidth, width);
  for (const row of rows) {
    for (const col of cols) {
      if (
        col.sourceSizePx <= 0 ||
        row.sourceSizePx <= 0 ||
        col.targetSizePx <= 0 ||
        row.targetSizePx <= 0
      ) {
        continue;
      }
      ctx.drawImage(
        image,
        cutX + col.sourcePx,
        cutY + row.sourcePx,
        col.sourceSizePx,
        row.sourceSizePx,
        col.targetPx,
        row.targetPx,
        col.targetSizePx,
        row.targetSizePx,
      );
    }
  }
  ctx.restore();
}
