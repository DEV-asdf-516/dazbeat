import Phaser from 'phaser';
import { HOVER_CURSOR } from './cursor.js';

export function bindHoverTarget(
  target: Phaser.GameObjects.GameObject,
  actions: {
    readonly onOver: () => void;
    readonly onOut: () => void;
    readonly onActivate: () => void;
  },
): void {
  target.setInteractive({ cursor: HOVER_CURSOR });
  target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, actions.onActivate);
  target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, actions.onOver);
  target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, actions.onOut);
}

export interface PointerActions {
  readonly over: () => void;
  readonly out: () => void;
  readonly down: () => void;
  readonly up: () => void;
}

export interface ButtonPointer<B> {
  readonly pointerOver: (button: B) => void;
  readonly pointerOut: (button: B) => void;
  readonly pointerDown: (button: B) => void;
  readonly pointerUp: (button: B) => void;
}

export function pointButton<B>(pointer: ButtonPointer<B>, button: B): PointerActions {
  return {
    over: () => pointer.pointerOver(button),
    out: () => pointer.pointerOut(button),
    down: () => pointer.pointerDown(button),
    up: () => pointer.pointerUp(button),
  };
}

export function bindPointer(target: Phaser.GameObjects.GameObject, actions: PointerActions): void {
  target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, actions.over);
  target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, actions.out);
  target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, actions.down);
  target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, actions.up);
}

export function setContainerHitArea(
  container: Phaser.GameObjects.Container,
  hitArea: Phaser.Geom.Rectangle,
  widthPx: number,
  heightPx: number,
): void {
  // Phaser 는 Container 의 hit 좌표에 displayOrigin(크기의 절반)을 더하므로 그만큼 옮긴다.
  hitArea.setTo(widthPx / 2, heightPx / 2, widthPx, heightPx);
  if (container.input !== null) {
    return;
  }
  container.setInteractive({
    hitArea,
    hitAreaCallback: (area: Phaser.Geom.Rectangle, x: number, y: number) =>
      Phaser.Geom.Rectangle.Contains(area, x, y),
    cursor: HOVER_CURSOR,
  });
}
