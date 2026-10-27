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
