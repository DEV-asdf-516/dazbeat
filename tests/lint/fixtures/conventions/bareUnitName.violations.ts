export function cropJacket(width: number, height: number): { x: number; size: number } {
  const size = Math.min(width, height);
  return {
    x: (width - size) / 2,
    size,
  };
}

const STAR_OFFSETS_Y = [-4, 0, 6];

export function getReach(scale: number): number {
  return Math.max(...STAR_OFFSETS_Y.map((offset) => Math.abs(offset))) * scale;
}

export interface Fade {
  readonly duration: number;
}

export function wait(time: number): number {
  return time;
}
