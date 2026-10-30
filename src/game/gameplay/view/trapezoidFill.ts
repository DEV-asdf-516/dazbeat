import type Phaser from 'phaser';
import { lerp } from '../../range.js';
import type { Trapezoid } from './playfieldLayout.js';

// 조각 하나 안에서 위아래 alpha 가 이보다 크게 바뀌지 않도록 나눈다.
const MAX_SLICE_ALPHA_STEP = 0.04;

export interface CornerAlphas {
  readonly topLeft: number;
  readonly topRight: number;
  readonly bottomLeft: number;
  readonly bottomRight: number;
}

// 삼각형은 가로·세로 감쇠의 곱을 표현하지 못해 가로로 흐려지는 띠가 대각선 쪽으로 쏠리므로,
// 세로로 얇게 잘라 조각마다 세로 alpha 를 거의 일정하게 두고 가로 감쇠만 삼각형 보간에 맡긴다.
// fillTriangle 은 세 꼭짓점에 그러데이션 스타일의 topLeft·topRight·bottomLeft 값을 순서대로 붙이므로
// 두 번째 삼각형은 그 순서에 맞춰 alpha 를 바꿔 건다.
export function fillTrapezoid(
  graphics: Phaser.GameObjects.Graphics,
  trapezoid: Trapezoid,
  color: number,
  alphas: CornerAlphas,
): void {
  const { topYPx, bottomYPx, topLeftXPx, topRightXPx, bottomLeftXPx, bottomRightXPx } = trapezoid;
  const { topLeft, topRight, bottomLeft, bottomRight } = alphas;
  const sliceCount = Math.max(
    1,
    Math.ceil(
      Math.max(Math.abs(bottomLeft - topLeft), Math.abs(bottomRight - topRight)) /
        MAX_SLICE_ALPHA_STEP,
    ),
  );
  for (let slice = 0; slice < sliceCount; slice += 1) {
    const top = slice / sliceCount;
    const bottom = (slice + 1) / sliceCount;
    const sliceTopYPx = lerp(topYPx, bottomYPx, top);
    const sliceBottomYPx = lerp(topYPx, bottomYPx, bottom);
    const sliceTopLeftXPx = lerp(topLeftXPx, bottomLeftXPx, top);
    const sliceTopRightXPx = lerp(topRightXPx, bottomRightXPx, top);
    const sliceBottomLeftXPx = lerp(topLeftXPx, bottomLeftXPx, bottom);
    const sliceBottomRightXPx = lerp(topRightXPx, bottomRightXPx, bottom);
    const sliceTopLeft = lerp(topLeft, bottomLeft, top);
    const sliceTopRight = lerp(topRight, bottomRight, top);
    const sliceBottomLeft = lerp(topLeft, bottomLeft, bottom);
    const sliceBottomRight = lerp(topRight, bottomRight, bottom);
    graphics
      .fillGradientStyle(
        color,
        color,
        color,
        color,
        sliceTopLeft,
        sliceTopRight,
        sliceBottomLeft,
        sliceBottomLeft,
      )
      .fillTriangle(
        sliceTopLeftXPx,
        sliceTopYPx,
        sliceTopRightXPx,
        sliceTopYPx,
        sliceBottomLeftXPx,
        sliceBottomYPx,
      )
      .fillGradientStyle(
        color,
        color,
        color,
        color,
        sliceTopRight,
        sliceBottomRight,
        sliceBottomLeft,
        sliceBottomLeft,
      )
      .fillTriangle(
        sliceTopRightXPx,
        sliceTopYPx,
        sliceBottomRightXPx,
        sliceBottomYPx,
        sliceBottomLeftXPx,
        sliceBottomYPx,
      );
  }
}
