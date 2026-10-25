import { clamp } from '../../range.js';
import type { Button } from './Button.js';
import { requireDefined } from '../../invariant.js';

export class MenuFocus<T> {
  private index: number;

  constructor(
    private readonly entries: readonly { item: T; button: Button }[],
    private readonly onFocusChange: () => void,
    focusedItem?: T,
  ) {
    this.index = Math.max(
      entries.findIndex(({ item }) => item === focusedItem),
      0,
    );
    this.render();
  }

  move(delta: 1 | -1): void {
    const next = clamp(this.index + delta, 0, this.entries.length - 1);
    if (next === this.index) {
      return;
    }
    this.index = next;
    this.render();
    this.onFocusChange();
  }

  getFocused(): T {
    return requireDefined(this.entries[this.index], 'Invalid menu index', this.index).item;
  }

  private render(): void {
    this.entries.forEach(({ button }, index) => button.setFocused(index === this.index));
  }
}
