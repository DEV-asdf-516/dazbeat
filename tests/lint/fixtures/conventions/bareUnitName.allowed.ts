export interface Fade {
  readonly durationMs: number;
  readonly offsetPx: number;
  readonly sizeBytes: number;
  readonly songTimeMs: number;
}

export const tween = {
  duration: 200,
  offset: 4,
};

export type AddColorStop = (offset: number, color: string) => void;

export function getLengthSec({ duration }: HTMLMediaElement): number {
  return duration;
}

export function getByteLength({ size }: Blob): number {
  return size;
}

export function wait(timeoutMs: number): number {
  return timeoutMs;
}

export function addStops(
  gradient: CanvasGradient,
  stops: readonly (readonly [offset: number, color: string])[],
): void {
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
}
