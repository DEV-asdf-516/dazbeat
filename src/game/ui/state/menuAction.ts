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
