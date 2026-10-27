import type Phaser from 'phaser';

export type MenuAction =
  'up' | 'down' | 'left' | 'right' | 'previousTab' | 'nextTab' | 'confirm' | 'back';

export function readMenuAction(event: Pick<KeyboardEvent, 'code' | 'repeat'>): MenuAction | null {
  switch (event.code) {
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
    case 'KeyQ':
      return 'previousTab';
    case 'KeyE':
      return 'nextTab';
    case 'Enter':
      return event.repeat ? null : 'confirm';
    case 'Escape':
      return event.repeat ? null : 'back';
    default:
      return null;
  }
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
