export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 끝을 넘으면 반대쪽 끝으로 이어진다. */
export function cycleItem<T>(items: readonly T[], current: T, delta: number): T {
  const count = items.length;
  const item = items[(((indexOfItem(items, current) + delta) % count) + count) % count];
  if (item === undefined) {
    throw new Error('Cannot cycle an empty list');
  }
  return item;
}

/** 끝을 넘으면 끝 항목에 머문다. */
export function stepItem<T>(items: readonly T[], current: T, delta: number): T {
  const item = items[clamp(indexOfItem(items, current) + delta, 0, items.length - 1)];
  if (item === undefined) {
    throw new Error('Cannot step an empty list');
  }
  return item;
}

function indexOfItem<T>(items: readonly T[], item: T): number {
  const index = items.indexOf(item);
  if (index === -1) {
    throw new Error(`Item is not in the list: ${String(item)}`);
  }
  return index;
}
