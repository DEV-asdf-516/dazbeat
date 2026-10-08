import { HOVER_CURSOR, PRESSED_CURSOR } from './cursor.js';

/** 브라우저가 `style.cursor` 를 정규화해 돌려주므로(따옴표 등) 비교할 값도 같은 꼴로 만든다. */
function normalizeCursor(value: string): string {
  const probe = document.createElement('div');
  probe.style.cursor = value;
  return probe.style.cursor;
}

/**
 * HOVER 커서가 떠 있는 대상 위에서 누르는 동안만 PRESSED 커서를 보인다.
 * HOVER 를 쓰는 위젯이 많으므로 위젯마다 붙이지 않고 캔버스 한 곳에서 바꾼다.
 * 누른 채 대상 밖으로 나가면 Phaser 가 커서를 기본값으로 되돌리므로 따로 처리하지 않는다.
 */
export function bindPressedCursor(canvas: HTMLCanvasElement): void {
  const hover = normalizeCursor(HOVER_CURSOR);
  const pressed = normalizeCursor(PRESSED_CURSOR);
  canvas.addEventListener('pointerdown', () => {
    if (canvas.style.cursor === hover) {
      canvas.style.cursor = pressed;
    }
  });
  // 캔버스 밖에서 떼도 돌아오도록 window 에서 받는다.
  window.addEventListener('pointerup', () => {
    if (canvas.style.cursor === pressed) {
      canvas.style.cursor = hover;
    }
  });
}
