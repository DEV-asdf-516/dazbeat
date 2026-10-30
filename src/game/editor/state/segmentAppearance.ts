export type SegmentAppearance = 'selected' | 'hovered' | 'idle';

// 고른 값은 hover 보다 먼저 본다.
export function getSegmentAppearance<T>(
  value: T,
  selected: T,
  hovered: T | null,
): SegmentAppearance {
  if (value === selected) {
    return 'selected';
  }
  return value === hovered ? 'hovered' : 'idle';
}
