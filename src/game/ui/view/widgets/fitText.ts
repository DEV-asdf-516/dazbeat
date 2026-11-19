import Phaser from 'phaser';

// 후보마다 굽지 않도록 Phaser updateText 와 같은 계산으로 폭을 재서 결과를 정한 뒤 한 번만 굽는다.
export function setFittedText(
  text: Phaser.GameObjects.Text,
  value: string,
  maxWidthPx: number,
): Phaser.GameObjects.Text {
  const measureWidthPx = (candidate: string): number =>
    Phaser.GameObjects.GetTextSize(text, text.getTextMetrics(), text.getWrappedText(candidate))
      .width +
    (text.padding.left ?? 0) +
    (text.padding.right ?? 0);
  const chars = Array.from(value);
  let fitted = value;
  while (measureWidthPx(fitted) > maxWidthPx && chars.length > 0) {
    chars.pop();
    fitted = `${chars.join('')}…`;
  }
  return text.setText(fitted);
}
