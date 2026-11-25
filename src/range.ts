import { requireDefined } from './invariant.js';

export type ListDirection = 'previous' | 'next';

export const DIRECTION_STEPS: Readonly<Record<ListDirection, 1 | -1>> = {
  previous: -1,
  next: 1,
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getFraction(value: number, from: number, to: number): number {
  return (value - from) / (to - from);
}

export function getProgress(value: number, from: number, to: number): number {
  return clamp(getFraction(value, from, to), 0, 1);
}

export function getDistance(a: number, b: number): number {
  return Math.abs(a - b);
}

export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

export function cycleItem<T>(items: readonly T[], current: T, direction: ListDirection): T {
  return cycleItemBy(items, current, DIRECTION_STEPS[direction]);
}

export function cycleItemBy<T>(items: readonly T[], current: T, steps: number): T {
  const count = items.length;
  return requireDefined(
    items[(((indexOfItem(items, current) + steps) % count) + count) % count],
    'Cannot cycle an empty list',
  );
}

export function stepItem<T>(items: readonly T[], current: T, direction: ListDirection): T {
  return requireDefined(
    items[clamp(indexOfItem(items, current) + DIRECTION_STEPS[direction], 0, items.length - 1)],
    'Cannot step an empty list',
  );
}

function indexOfItem<T>(items: readonly T[], item: T): number {
  const index = items.indexOf(item);
  if (index === -1) {
    throw new Error(`Item is not in the list: ${String(item)}`);
  }
  return index;
}
