import type Phaser from 'phaser';

export function setFittedText(
  text: Phaser.GameObjects.Text,
  value: string,
  maxWidthPx: number,
): Phaser.GameObjects.Text {
  text.setText(value);
  const chars = Array.from(value);
  while (text.width > maxWidthPx && chars.length > 0) {
    chars.pop();
    text.setText(`${chars.join('')}…`);
  }
  return text;
}
