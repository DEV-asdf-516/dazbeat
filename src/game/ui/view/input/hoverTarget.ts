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

export interface PressActions {
  readonly onActivate: () => void;
  readonly canPress?: () => boolean;
  readonly onPressChange?: () => void;
}

export interface PointerPress {
  isPressed(): boolean;
  cancel(): void;
}

export function bindPress(
  target: Phaser.GameObjects.GameObject,
  actions: PressActions,
): PointerPress {
  let isPressed = false;
  target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
    if (actions.canPress !== undefined && !actions.canPress()) {
      return;
    }
    isPressed = true;
    actions.onPressChange?.();
  });
  target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
    if (!isPressed) {
      return;
    }
    isPressed = false;
    actions.onPressChange?.();
  });
  target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
    if (!isPressed) {
      return;
    }
    isPressed = false;
    actions.onPressChange?.();
    actions.onActivate();
  });
  return {
    isPressed: () => isPressed,
    cancel: () => {
      isPressed = false;
    },
  };
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
