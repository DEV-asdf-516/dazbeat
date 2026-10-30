// 다섯 상태 모두 화살표 끝이 같은 자리(6, 2)에 있어 상태가 바뀌어도 가리키는 점이 움직이지 않는다.
export const DEFAULT_CURSOR = "url('/assets/ui/cursor/cursor-default.png') 6 2, default";
export const HOVER_CURSOR = "url('/assets/ui/cursor/cursor-hover.png') 6 2, pointer";
export const PRESSED_CURSOR = "url('/assets/ui/cursor/cursor-pressed.png') 6 2, pointer";
export const DRAG_CURSOR = "url('/assets/ui/cursor/cursor-drag.png') 6 2, ew-resize";
export const DISABLED_CURSOR = "url('/assets/ui/cursor/cursor-disabled.png') 6 2, not-allowed";

export const CURSOR_TAIL_OFFSET_PX = {
  xPx: 14,
  yPx: 21,
} as const;
