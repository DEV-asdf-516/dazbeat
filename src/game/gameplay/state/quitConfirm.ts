import type { GameplayCommand } from './gameplayCommand.js';

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
