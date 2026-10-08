import { clamp } from '../range.js';
import type { Button } from './Button.js';

/** 세로·가로로 늘어선 버튼 중 키보드 포커스를 가진 하나를 관리한다. */
export class MenuFocus<T> {
  private index: number;

  /** focusedItem 이 entries 에 있으면 그 항목에서, 아니면 첫 항목에서 시작한다. */
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
    const entry = this.entries[this.index];
    if (entry === undefined) {
      throw new Error(`Invalid menu index: ${this.index}`);
    }
    return entry.item;
  }

  private render(): void {
    this.entries.forEach(({ button }, index) => button.setFocused(index === this.index));
  }
}
