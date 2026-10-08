import Phaser from 'phaser';
import { HOVER_CURSOR } from './cursor.js';

/** 여러 대상 중 포인터가 올라가 있는 하나를 기억한다. 호버가 바뀐 대상만 `onChange`로 알린다. */
export class PointerHover<T> {
  private hovered: T | null = null;

  constructor(private readonly onChange: (item: T) => void) {}

  bind(target: Phaser.GameObjects.GameObject, item: T, onDown: () => void): void {
    target.setInteractive({ cursor: HOVER_CURSOR });
    target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onDown);
    target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      const previous = this.hovered;
      this.hovered = item;
      if (previous !== null && previous !== item) {
        this.onChange(previous);
      }
      this.onChange(item);
    });
    target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      if (this.hovered === item) {
        this.hovered = null;
        this.onChange(item);
      }
    });
  }

  isHovered(item: T): boolean {
    return this.hovered === item;
  }

  /** 비활성화된 대상은 POINTER_OUT 을 받지 못하므로 직접 해제한다. */
  release(item: T): void {
    if (this.hovered === item) {
      this.hovered = null;
    }
  }

  reset(): void {
    this.hovered = null;
  }
}
