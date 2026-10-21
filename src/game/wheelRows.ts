// 이보다 오래 멈추면 쌓인 이동량을 버려, 휠을 살짝 건드린 양이 나중 입력과 합쳐져 넘어가지 않게 한다.
const GESTURE_GAP_MS = 150;
// 굴리기 시작할 때는 한 줄의 이 비율만 움직여도 넘어가 반응을 빠르게 하고, 그보다 작은 떨림은 무시한다.
const START_ROW_RATIO = 0.25;

export interface WheelGesture {
  readonly direction: number;
  readonly remainderPx: number;
  readonly lastAtMs: number;
}

export const IDLE_WHEEL: WheelGesture = {
  direction: 0,
  remainderPx: 0,
  lastAtMs: Number.NEGATIVE_INFINITY,
};

/** 트랙패드는 작은 이동량을 연달아 보내므로 이벤트 수가 아니라 쌓인 이동량으로 줄을 넘기고, 한 줄에 못 미치면 넘기지 않는다. */
export function readWheelRows(
  gesture: WheelGesture,
  deltaYPx: number,
  atMs: number,
  rowPx: number,
): { gesture: WheelGesture; rows: number } {
  if (deltaYPx === 0) {
    return {
      gesture,
      rows: 0,
    };
  }
  const direction = Math.sign(deltaYPx);
  const isNewGesture = direction !== gesture.direction || atMs - gesture.lastAtMs > GESTURE_GAP_MS;
  const carriedPx = isNewGesture ? rowPx * (1 - START_ROW_RATIO) : gesture.remainderPx;
  const accumulatedPx = carriedPx + Math.abs(deltaYPx);
  const rows = Math.floor(accumulatedPx / rowPx);
  return {
    gesture: {
      direction,
      remainderPx: Math.max(0, accumulatedPx - rows * rowPx),
      lastAtMs: atMs,
    },
    rows: rows === 0 ? 0 : rows * direction,
  };
}
