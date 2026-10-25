import Phaser from 'phaser';
import { COLORS, setTextColor } from './theme.js';

export function bindTextEntry(
  entry: Phaser.GameObjects.GameObject,
  label: Phaser.GameObjects.Text,
  onActivate: () => void,
): void {
  let isPressed = false;
  entry.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
    setTextColor(label, COLORS.textPrimary);
  });
  entry.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
    isPressed = false;
    setTextColor(label, COLORS.textSecondary);
  });
  entry.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
    isPressed = true;
  });
  entry.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
    if (!isPressed) {
      return;
    }
    isPressed = false;
    onActivate();
  });
}
