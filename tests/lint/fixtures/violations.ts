import type Phaser from 'phaser';
import { filterChangedRegions } from '../../../src/changedRegions.js';
import { isShallowEqual } from '../../../src/shallowEqual.js';
import * as shallow from '../../../src/shallowEqual.js';
import type { ScreenState } from './state/screenState.js';

export const comparisons = [filterChangedRegions, isShallowEqual];

export const namespaceComparison = shallow.isShallowEqual;

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
