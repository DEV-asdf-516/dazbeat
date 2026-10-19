/** 대기를 시작한 키의 반복 입력이 지정되지 않게 한다. */
export function readKeyCapture(event: Pick<KeyboardEvent, 'code' | 'repeat'>): string | null {
  return event.repeat ? null : event.code;
}
