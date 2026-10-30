import Phaser from 'phaser';
import { bindPress } from './hoverTarget.js';
import { COLORS, setTextColor } from './theme.js';

export function bindTextEntry(
  entry: Phaser.GameObjects.GameObject,
  label: Phaser.GameObjects.Text,
  onActivate: () => void,
): void {
  entry.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
    setTextColor(label, COLORS.textPrimary);
  });
  entry.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
    setTextColor(label, COLORS.textSecondary);
  });
  bindPress(entry, { onActivate });
}
