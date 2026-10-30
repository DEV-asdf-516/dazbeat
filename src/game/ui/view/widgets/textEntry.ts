import type Phaser from 'phaser';
import { COLORS, setTextColor } from '../theme.js';

export function renderTextEntry(label: Phaser.GameObjects.Text, isHovered: boolean): void {
  setTextColor(label, isHovered ? COLORS.textPrimary : COLORS.textSecondary);
}
