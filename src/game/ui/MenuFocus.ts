import { clamp } from '../../range.js';
import type { Button } from './Button.js';
import { requireDefined } from '../../invariant.js';

export class MenuFocus<T> {
  private index: number;

  constructor(
    private readonly entries: readonly { item: T; button: Button }[],
    focusedItem?: T,
  ) {
    this.index = Math.max(
      entries.findIndex(({ item }) => item === focusedItem),
      0,
    );
    this.render();
  }

  move(delta: 1 | -1): void {
    this.index = clamp(this.index + delta, 0, this.entries.length - 1);
    this.render();
  }

  getFocused(): T {
    return requireDefined(this.entries[this.index], 'Invalid menu index', this.index).item;
  }

  private render(): void {
    this.entries.forEach(({ button }, index) => button.setFocused(index === this.index));
  }
}
