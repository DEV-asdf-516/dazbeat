import { isShallowEqual } from '../../../src/shallowEqual.js';

export const comparison = isShallowEqual;

interface Look {
  readonly count: number;
}

export function readPreviousField(previous: Look | null, next: Look): number {
  return previous === null ? next.count : previous.count;
}

export class CountBadge {
  count = 0;
}

interface RowView {
  label: string;
}

export function writeRowLabel(row: RowView): void {
  row.label = 'label';
}

export function countCalls(): () => number {
  let calls = 0;
  return () => {
    calls += 1;
    return calls;
  };
}
