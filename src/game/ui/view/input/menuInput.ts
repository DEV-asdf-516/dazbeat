import type Phaser from 'phaser';

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
