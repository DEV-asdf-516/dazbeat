import type Phaser from 'phaser';
import { filterChangedRegions } from '../../../src/changedRegions.js';
import { isShallowEqual as isSame } from '../../../src/shallowEqual.js';
import * as shallow from '../../../src/shallowEqual.js';
import type { ScreenState } from './state/screenState.js';

export function compareStates(previous: ScreenState | null, next: ScreenState): readonly unknown[] {
  return [
    filterChangedRegions({ count: [(state: ScreenState) => state.count] }, previous, next),
    isSame(next, next),
    shallow.isShallowEqual(next, next),
  ];
}

export function writeState(state: ScreenState): void {
  state.count = 1;
  state.count += 1;
  state.count++;
  state.focus.index = 2;
  state.rows[0] = 3;
  const { focus } = state;
  focus.index = 4;
}

export class CountBadge {
  shown: ScreenState | null = null;

  constructor(
    readonly text: Phaser.GameObjects.Text,
    private last: ScreenState,
  ) {}

  render(): number {
    return this.last.count;
  }
}
