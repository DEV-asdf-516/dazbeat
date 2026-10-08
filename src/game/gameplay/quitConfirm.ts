import type { GameplayCommand } from './gameplayInput.js';

/**
 * 플레이 중 나가기 확인창이 할 일.
 * - pass: 확인창이 닫혀 있어 키를 평소대로 처리한다.
 * - ignore: 확인창이 열려 있는 동안 레인·다른 명령은 막는다.
 */
export type QuitConfirmAction = 'open' | 'quit' | 'cancel' | 'ignore' | 'pass';

export function getQuitConfirmAction(
  isOpen: boolean,
  command: GameplayCommand | null,
): QuitConfirmAction {
  if (!isOpen) {
    return command === 'back' ? 'open' : 'pass';
  }
  switch (command) {
    case 'confirm':
      return 'quit';
    case 'back':
      return 'cancel';
    default:
      return 'ignore';
  }
}
