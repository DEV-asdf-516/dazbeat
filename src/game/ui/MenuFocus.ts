import { cycleItem } from '../../range.js';
import type { Button } from './Button.js';
import { requireDefined } from '../../invariant.js';

export class MenuFocus<T> {
  private focused: T;

  constructor(
    private readonly entries: readonly { item: T; button: Button }[],
    private readonly onFocusChange: (item: T) => void,
    focused: T,
  ) {
    this.focused = requireDefined(
      entries.find(({ item }) => item === focused),
      'Focused menu item is not in the entries',
    ).item;
    this.render();
  }

  move(delta: 1 | -1): void {
    const next = cycleItem(
      this.entries.map(({ item }) => item),
      this.focused,
      delta,
    );
    if (next === this.focused) {
      return;
    }
    this.focused = next;
    this.render();
    this.onFocusChange(next);
  }

  getFocused(): T {
    return this.focused;
  }

  private render(): void {
    this.entries.forEach(({ item, button }) => button.setFocused(item === this.focused));
  }
}
