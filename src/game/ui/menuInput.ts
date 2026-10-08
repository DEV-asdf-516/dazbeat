import type Phaser from 'phaser';

export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back';

export function toMenuAction(code: string): MenuAction | null {
  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      return 'up';
    case 'ArrowDown':
    case 'KeyS':
      return 'down';
    case 'ArrowLeft':
    case 'KeyA':
      return 'left';
    case 'ArrowRight':
    case 'KeyD':
      return 'right';
    case 'Enter':
      return 'confirm';
    case 'Escape':
      return 'back';
    default:
      return null;
  }
}

/** 키를 누르고 있을 때의 반복 입력은 이동만 받는다. 확정·뒤로는 처음 누른 입력만 쓴다. */
export function readMenuAction(event: Pick<KeyboardEvent, 'code' | 'repeat'>): MenuAction | null {
  const action = toMenuAction(event.code);
  if (event.repeat && (action === 'confirm' || action === 'back')) {
    return null;
  }
  return action;
}

/** 키 대기 중에는 처음 누른 키만 지정한다. 대기를 시작한 키의 반복 입력이 지정되지 않게 한다. */
export function readKeyCapture(event: Pick<KeyboardEvent, 'code' | 'repeat'>): string | null {
  return event.repeat ? null : event.code;
}

/** Phaser 가 같은 KeyboardEvent 객체를 다시 dispatch 해도 handler 는 한 번만 부른다. */
export function handleEachEventOnce<E extends object>(
  handler: (event: E) => void,
): (event: E) => void {
  const handled = new WeakSet<E>();
  return (event) => {
    if (handled.has(event)) {
      return;
    }
    handled.add(event);
    handler(event);
  };
}

export function requireKeyboard(scene: Phaser.Scene): Phaser.Input.Keyboard.KeyboardPlugin {
  const keyboard = scene.input.keyboard;
  if (keyboard === null) {
    throw new Error('Keyboard input is not available');
  }
  return keyboard;
}
