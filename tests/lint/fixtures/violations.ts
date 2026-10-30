import Phaser from 'phaser';
import { filterChangedRegions } from '../../../src/changedRegions.js';
import { isShallowEqual } from '../../../src/shallowEqual.js';

export const comparisons = [filterChangedRegions, isShallowEqual];

interface Look {
  readonly kind: string;
  readonly count: number;
}

export function readPreviousField(previous: Look | null, next: Look): number {
  if (previous === null) {
    return next.count;
  }
  return previous.count;
}

export function keepPreviousLook(next: Look): Look {
  const previousLook = next;
  const kept = previousLook;
  return kept;
}

export class CountBadge {
  count = 0;
  shownKind: string | null = null;

  constructor(
    readonly text: Phaser.GameObjects.Text,
    private shownCount: number,
  ) {}

  render(look: Look): number {
    return look.count + this.shownCount;
  }
}

export class FieldScene extends Phaser.Scene {
  shownCount = 0;

  override update(): void {
    this.shownCount = 1;
    this.shownCount += 1;
  }
}

interface RowView {
  label: string;
}

export function writeRowLabel(row: RowView, items: number[]): void {
  row.label = 'label';
  items.length = 0;
}

export function countClicks(button: Phaser.GameObjects.Text): void {
  let clicks = 0;
  button.on(Phaser.Input.Events.POINTER_UP, () => {
    clicks += 1;
    button.setData('clicks', clicks);
  });
}

interface Strip {
  readonly points: number[];
}

export function writeStripPoints(strip: Strip): void {
  strip.points[0] = 0;
  const { points } = strip;
  points[1] = 0;
}

import * as shallow from '../../../src/shallowEqual.js';

export const namespaceComparison = shallow.isShallowEqual;

export class LaterScene extends Phaser.Scene {
  shownCount = 0;
  onTap = (): void => {
    this.shownCount = 1;
  };
}
