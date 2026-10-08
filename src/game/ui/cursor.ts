// CSS `cursor` 값 그대로다. DOM(#game)과 Phaser interactive 객체가 함께 쓰므로 경로·hotspot 은 여기에만 둔다.
// 다섯 상태 모두 화살표 끝이 같은 자리(6, 2)에 있어 상태가 바뀌어도 가리키는 점이 움직이지 않는다.
export const DEFAULT_CURSOR = "url('/assets/ui/cursor/cursor-default.png') 6 2, default";
export const HOVER_CURSOR = "url('/assets/ui/cursor/cursor-hover.png') 6 2, pointer";
export const PRESSED_CURSOR = "url('/assets/ui/cursor/cursor-pressed.png') 6 2, pointer";
export const DRAG_CURSOR = "url('/assets/ui/cursor/cursor-drag.png') 6 2, ew-resize";
export const DISABLED_CURSOR = "url('/assets/ui/cursor/cursor-disabled.png') 6 2, not-allowed";

/** 커서 그림에서 화살표 꼬리 끝이 hotspot(화살표 끝)에서 떨어진 거리. 성운 잔상이 여기서 풀려 나온다. */
export const CURSOR_TAIL_OFFSET_PX = { xPx: 14, yPx: 21 } as const;
