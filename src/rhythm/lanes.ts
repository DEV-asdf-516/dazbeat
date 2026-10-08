import type { Lane } from './types.js';

export const LANES: readonly Lane[] = [0, 1, 2, 3];

export function mapLanes<T>(create: (lane: Lane) => T): Record<Lane, T> {
  return { 0: create(0), 1: create(1), 2: create(2), 3: create(3) };
}
