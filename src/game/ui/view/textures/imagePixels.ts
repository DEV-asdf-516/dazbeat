// ImageData.data 는 픽셀마다 R, G, B, A 바이트를 이어 붙인 평평한 배열이다.
export const PIXEL_CHANNEL = {
  red: 0,
  green: 1,
  blue: 2,
  alpha: 3,
} as const;
export const PIXEL_BYTES = 4;

export function getPixelIndex(xPx: number, yPx: number, widthPx: number): number {
  return (yPx * widthPx + xPx) * PIXEL_BYTES;
}
