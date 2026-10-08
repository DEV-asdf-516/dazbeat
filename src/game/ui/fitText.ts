import type Phaser from 'phaser';

/** 표시 폭을 넘는 문구는 끝을 줄여 … 를 붙인다. 표시 문자열만 바꾸며 원래 값은 그대로다. */
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
